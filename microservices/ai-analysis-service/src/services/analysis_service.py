"""
Core Analysis Service
Manages analysis requests, status tracking, and result handling
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from uuid import uuid4
import json
import httpx
from loguru import logger

from ..schemas.analysis_schemas import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
    AnalysisStatusEnum,
    QueueStatus,
    Priority
)
from ..services.database import db_service
from ..services.redis_cache import redis_cache
from ..services.message_queue import message_queue
import jwt
from ..config import get_settings

settings = get_settings()


class AnalysisService:
    """Core service for managing AI analysis operations"""
    
    def __init__(self):
        self.active_analyses: Dict[str, Dict[str, Any]] = {}
        self.queue_metrics = {
            "total_submitted": 0,
            "total_completed": 0,
            "total_failed": 0
        }
        self.db_manager = db_service
        self.redis_cache = redis_cache
        self.mq_manager = message_queue

    def _to_jsonable(self, data: Any) -> Any:
        """Convert pydantic/enum/datetime-rich structures into JSON-serializable ones (deep)."""
        # Primitives
        if data is None or isinstance(data, (str, int, float, bool)):
            return data
        # Datetime
        try:
            from datetime import datetime as _dt
            if isinstance(data, _dt):
                return data.isoformat()
        except Exception:
            pass
        # Enum
        try:
            from enum import Enum as _Enum
            if isinstance(data, _Enum):  # type: ignore[arg-type]
                return data.value  # type: ignore[attr-defined]
        except Exception:
            pass
        # Pydantic v2
        try:
            if hasattr(data, "model_dump") and callable(getattr(data, "model_dump")):
                return self._to_jsonable(getattr(data, "model_dump")(mode="python"))  # type: ignore[misc]
        except Exception:
            pass
        # Pydantic v1
        try:
            if hasattr(data, "dict") and callable(getattr(data, "dict")):
                return self._to_jsonable(getattr(data, "dict")())  # type: ignore[misc]
        except Exception:
            pass
        # Mapping
        if isinstance(data, dict):
            return {str(k): self._to_jsonable(v) for k, v in data.items()}
        # Iterable
        try:
            if isinstance(data, (list, tuple, set)):
                return [self._to_jsonable(v) for v in list(data)]
        except Exception:
            pass
        # Fallback best-effort
        try:
            return json.loads(json.dumps(data, default=lambda o: getattr(o, "isoformat", lambda: str(o))()))
        except Exception:
            return str(data)

    def _serialize_analysis_result(self, result: Any) -> Dict[str, Any]:
        """Deep-serialize analysis results into plain JSON-compatible dicts."""
        try:
            jsonable = self._to_jsonable(result)
            # Ensure dict at top level
            if isinstance(jsonable, dict):
                return jsonable
            return {"result": jsonable, "timestamp": datetime.utcnow().isoformat()}
        except Exception as e:
            logger.warning(f"Failed to serialize analysis result: {e}")
            return {
                "analysis_id": getattr(result, "analysis_id", "unknown"),
                "evidence_id": getattr(result, "evidence_id", "unknown"),
                "analysis_type": getattr(result, "analysis_type", "unknown"),
                "confidence_score": getattr(result, "confidence_score", 0.0),
                "processing_time": getattr(result, "processing_time", 0.0),
                "error": "Serialization failed",
                "timestamp": datetime.utcnow().isoformat()
            }

    def _db_ready(self) -> bool:
        return getattr(self.db_manager, "is_ready", False)

    def _cache_ready(self) -> bool:
        return getattr(self.redis_cache, "is_ready", False)

    def _mq_ready(self) -> bool:
        return getattr(self.mq_manager, "_connected", False)

    
    async def submit_analysis(self, request: AnalysisRequest, file_path: str) -> AnalysisResponse:
        """
        Submit a new analysis request
        
        Args:
            request: Analysis request details
            file_path: Path to the file to analyze
            
        Returns:
            Analysis response with status
        """
        try:
            # Store analysis request in database
            await self._store_analysis_request(request)
            
            # Cache initial status (include evidence id for recovery)
            await self._cache_analysis_status(
                request.analysis_id,
                "pending",
                0,
                evidence_id=request.evidence_id,
                estimated_completion=None
            )
            
            # Add to active analyses
            self.active_analyses[request.analysis_id] = {
                "request": request,
                "file_path": file_path,
                "status": "pending",
                "progress": 0,
                "submitted_at": datetime.utcnow()
            }
            
            # Send to message queue for processing
            await self._queue_analysis_request(request, file_path)
            
            # Update metrics
            self.queue_metrics["total_submitted"] += 1
            
            # Calculate estimated completion time
            estimated_completion = await self._estimate_completion_time(request)
            
            logger.info(f"Analysis submitted: {request.analysis_id}")
            
            return AnalysisResponse(
                analysis_id=request.analysis_id,
                evidence_id=request.evidence_id,
                status=AnalysisStatusEnum.PENDING,
                message="Analysis submitted successfully",
                estimated_completion=estimated_completion,
                priority=request.priority
            )
            
        except Exception as e:
            logger.error(f"Failed to submit analysis {request.analysis_id}: {e}")
            raise
    
    async def get_analysis_status(self, analysis_id: str) -> Optional[AnalysisStatus]:
        """
        Get current status of an analysis
        
        Args:
            analysis_id: Unique analysis identifier
            
        Returns:
            Current analysis status or None if not found
        """
        try:
            # Try cache first
            cached_status = await self._get_cached_status(analysis_id)
            if cached_status:
                return cached_status
            
            # Fall back to database
            if self._db_ready():
                return await self._get_status_from_db(analysis_id)
            
            # Check active analyses
            if analysis_id in self.active_analyses:
                analysis = self.active_analyses[analysis_id]
                return AnalysisStatus(
                    analysis_id=analysis_id,
                    evidence_id=analysis["request"].evidence_id,
                    status=AnalysisStatusEnum(analysis["status"]),
                    progress=analysis["progress"],
                    started_at=analysis.get("started_at"),
                    completed_at=analysis.get("completed_at"),
                    error_message=analysis.get("error_message")
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get status for analysis {analysis_id}: {e}")
            return None
    
    async def get_analysis_results(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """
        Get complete analysis results
        
        Args:
            analysis_id: Unique analysis identifier
            
        Returns:
            Analysis results or None if not found/completed
        """
        try:
            # Check if analysis is completed
            status = await self.get_analysis_status(analysis_id)
            if not status or status.status != AnalysisStatusEnum.COMPLETED:
                return None
            
            # Try cache first
            if self._cache_ready():
                cached_results = await self.redis_cache.get(f"results:{analysis_id}")
                if cached_results:
                    try:
                        # If redis returned a dict (already decoded), return it
                        if isinstance(cached_results, (dict, list)):
                            return cached_results  # type: ignore[return-value]
                        # If it is a JSON string, parse it
                        if isinstance(cached_results, str):
                            return json.loads(cached_results)
                        # As a last resort, stringify → parse
                        return json.loads(str(cached_results))
                    except Exception:
                        # If parsing fails, return as-is if it's a dict-like
                        return cached_results  # type: ignore[return-value]
            
            # Fall back to database
            if self._db_ready():
                return await self._get_results_from_db(analysis_id)
            
            # Fallback to in-memory active analyses
            try:
                if analysis_id in self.active_analyses:
                    r = self.active_analyses[analysis_id].get("results")
                    if r is not None:
                        return r
            except Exception:
                pass
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get results for analysis {analysis_id}: {e}")
            return None
    
    async def get_evidence_analyses(self, evidence_id: str, skip: int = 0, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get all analyses for a specific evidence item
        
        Args:
            evidence_id: Evidence identifier
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            List of analyses for the evidence
        """
        try:
            if self._db_ready():
                return await self._get_evidence_analyses_from_db(evidence_id, skip, limit)
            
            # Fallback to in-memory search
            analyses = []
            for analysis_id, analysis_data in self.active_analyses.items():
                if analysis_data["request"].evidence_id == evidence_id:
                    analyses.append({
                        "analysis_id": analysis_id,
                        "analysis_type": analysis_data["request"].analysis_type,
                        "status": analysis_data["status"],
                        "submitted_at": analysis_data["submitted_at"].isoformat(),
                        "priority": analysis_data["request"].priority
                    })
            
            return analyses[skip:skip + limit]
            
        except Exception as e:
            logger.error(f"Failed to get analyses for evidence {evidence_id}: {e}")
            return []
    
    async def update_analysis_status(
        self,
        analysis_id: str,
        status: str,
        progress: int = None,
        error_message: str = None,
        results: Dict[str, Any] = None
    ):
        """
        Update analysis status and progress
        
        Args:
            analysis_id: Unique analysis identifier
            status: New status
            progress: Progress percentage (0-100)
            error_message: Error message if failed
            results: Analysis results if completed
        """
        try:
            # Update active analyses
            if analysis_id in self.active_analyses:
                analysis = self.active_analyses[analysis_id]
                analysis["status"] = status
                
                if progress is not None:
                    analysis["progress"] = progress
                
                if error_message:
                    analysis["error_message"] = error_message
                
                if status == "processing" and "started_at" not in analysis:
                    analysis["started_at"] = datetime.utcnow()
                
                if status in ["completed", "failed"]:
                    analysis["completed_at"] = datetime.utcnow()
                    
                    # Update metrics
                    if status == "completed":
                        self.queue_metrics["total_completed"] += 1
                    else:
                        self.queue_metrics["total_failed"] += 1
            
            # Store results first if completed (gracefully handle if not connected) so that
            # result endpoint won't 404 briefly after status flips to completed.
            if results and status == "completed":
                try:
                    await self._store_analysis_results(analysis_id, results)
                except Exception as e:
                    logger.debug(f"Result storage not available: {e}")
                # Also keep in-memory copy as a fallback for immediate reads
                try:
                    if analysis_id in self.active_analyses:
                        self.active_analyses[analysis_id]["results"] = self._serialize_analysis_result(results)
                except Exception as e:
                    logger.warning(f"Failed to store results in memory: {e}")

            # Update database (gracefully handle if not connected)
            try:
                if self._db_ready():
                    await self._update_status_in_db(analysis_id, status, progress, error_message)
            except Exception as e:
                logger.debug(f"Database not available for status update: {e}")
            
            # Update cache (gracefully handle if not connected) AFTER storing results for completed status
            try:
                evidence_id_cached: Optional[str] = None
                if analysis_id in self.active_analyses:
                    evidence_id_cached = self.active_analyses[analysis_id]["request"].evidence_id
                await self._cache_analysis_status(
                    analysis_id,
                    status,
                    progress or 0,
                    evidence_id=evidence_id_cached,
                    estimated_completion=None
                )
            except Exception as e:
                logger.debug(f"Cache not available for status update: {e}")

            logger.info(f"Analysis {analysis_id} status updated: {status}")
            
        except Exception as e:
            logger.error(f"Failed to update status for analysis {analysis_id}: {e}")
    
    async def cancel_analysis(self, analysis_id: str) -> bool:
        """
        Cancel a pending or running analysis
        
        Args:
            analysis_id: Unique analysis identifier
            
        Returns:
            True if cancelled successfully, False otherwise
        """
        try:
            # Check if analysis exists and can be cancelled
            if analysis_id not in self.active_analyses:
                return False
            
            analysis = self.active_analyses[analysis_id]
            current_status = analysis["status"]
            
            if current_status in ["completed", "failed", "cancelled"]:
                return False
            
            # Update status to cancelled
            await self.update_analysis_status(analysis_id, "cancelled")
            
            # Remove from active analyses
            del self.active_analyses[analysis_id]
            
            logger.info(f"Analysis cancelled: {analysis_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cancel analysis {analysis_id}: {e}")
            return False
    
    async def get_queue_status(self) -> QueueStatus:
        """Get current queue status and metrics"""
        try:
            # Count analyses by status
            status_counts = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
            type_counts = {"image": 0, "video": 0, "document": 0, "audio": 0}
            priority_counts = {str(p.value): 0 for p in Priority}
            
            processing_times = []
            
            for analysis_data in self.active_analyses.values():
                status = analysis_data["status"]
                analysis_type = analysis_data["request"].analysis_type
                priority = str(analysis_data["request"].priority)
                
                if status in status_counts:
                    status_counts[status] += 1
                
                if analysis_type in type_counts:
                    type_counts[analysis_type] += 1
                
                if priority in priority_counts:
                    priority_counts[priority] += 1
                
                # Calculate processing time for completed analyses
                if status == "completed" and "started_at" in analysis_data and "completed_at" in analysis_data:
                    processing_time = (analysis_data["completed_at"] - analysis_data["started_at"]).total_seconds()
                    processing_times.append(processing_time)
            
            avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0.0
            avg_wait_time = 30.0  # Placeholder
            
            return QueueStatus(
                total_pending=status_counts["pending"],
                total_processing=status_counts["processing"],
                total_completed=status_counts["completed"],
                total_failed=status_counts["failed"],
                average_wait_time=avg_wait_time,
                average_processing_time=avg_processing_time,
                queue_by_type=type_counts,
                queue_by_priority=priority_counts,
                active_workers=1,  # Placeholder
                system_load=0.5   # Placeholder
            )
            
        except Exception as e:
            logger.error(f"Failed to get queue status: {e}")
            return QueueStatus(
                total_pending=0, total_processing=0, total_completed=0, total_failed=0,
                average_wait_time=0.0, average_processing_time=0.0,
                queue_by_type={}, queue_by_priority={},
                active_workers=0, system_load=0.0
            )
    
    async def send_results_to_evidence_service(self, analysis_id: str, evidence_id: str, results: Dict[str, Any]):
        """
        Send analysis results back to the evidence service

        Args:
            analysis_id: Analysis identifier
            evidence_id: Evidence identifier
            results: Analysis results
        """
        try:
            # Serialize results first
            serialized_results = self._serialize_analysis_result(results)
            # Ensure presence of normalized fields for UI: confidence (0..100), processingTime ms
            try:
                if isinstance(serialized_results, dict):
                    raw_conf = serialized_results.get("confidence_score")
                    if isinstance(raw_conf, (int, float)):
                        serialized_results["confidence_percent"] = int(100 * raw_conf) if raw_conf <= 1.0 else int(raw_conf)
                    # Normalize processing time: if seconds (<100) convert to ms
                    raw_pt = serialized_results.get("processing_time")
                    if isinstance(raw_pt, (int, float)):
                        serialized_results["processing_time_ms"] = int(raw_pt * 1000) if 0 < raw_pt < 100 else int(raw_pt)
            except Exception:
                pass

            # Send via message queue if available
            if self._mq_ready():
                await self._send_results_via_mq(analysis_id, evidence_id, serialized_results)

            # Also send via HTTP API as backup
            await self._send_results_via_http(analysis_id, evidence_id, serialized_results)

            logger.info(f"Results sent to evidence service: {analysis_id}")

        except Exception as e:
            logger.error(f"Failed to send results for analysis {analysis_id}: {e}")
    
    # Private helper methods
    
    async def _store_analysis_request(self, request: AnalysisRequest):
        """Store analysis request in database"""
        if self._db_ready():
            try:
                # Prefer Mongo for request log (schemaless)
                collection = await self.db_manager.get_mongodb_collection('analysis_requests')
                await collection.insert_one({
                    "analysis_id": request.analysis_id,
                    "evidence_id": request.evidence_id,
                    "analysis_type": request.analysis_type,
                    "file_name": request.file_name,
                    "file_size": request.file_size,
                    "priority": int(request.priority),
                    "metadata": request.metadata,
                    "user_id": request.user_id,
                    "submitted_at": request.submitted_at,
                    "status": "pending"
                })
            except Exception as e:
                logger.debug(f"Failed to store analysis request: {e}")
    
    async def _cache_analysis_status(
        self,
        analysis_id: str,
        status: str,
        progress: int,
        *,
        evidence_id: Optional[str] = None,
        estimated_completion: Optional[datetime] = None
    ):
        """Cache analysis status in Redis with extra metadata for recovery."""
        if self._cache_ready():
            status_data: Dict[str, Any] = {
                "status": status,
                "progress": progress,
                "updated_at": datetime.utcnow().isoformat()
            }
            if evidence_id is not None:
                status_data["evidence_id"] = evidence_id
            if estimated_completion is not None:
                status_data["estimated_completion"] = estimated_completion.isoformat()
            await self.redis_cache.set(
                f"status:{analysis_id}",
                status_data,
                ttl=3600  # 1 hour
            )
    
    async def _get_cached_status(self, analysis_id: str) -> Optional[AnalysisStatus]:
        """Get cached analysis status and construct a response."""
        if self._cache_ready():
            cached = await self.redis_cache.get(f"status:{analysis_id}")
            if cached:
                try:
                    data: Dict[str, Any] = cached if isinstance(cached, dict) else json.loads(str(cached))
                    status_str: str = data.get("status", "pending")
                    progress_val: int = int(data.get("progress", 0) or 0)
                    evidence_id_val: Optional[str] = data.get("evidence_id")
                    if not evidence_id_val and analysis_id in self.active_analyses:
                        evidence_id_val = self.active_analyses[analysis_id]["request"].evidence_id
                    if not evidence_id_val:
                        evidence_id_val = ""
                    est_val = data.get("estimated_completion")
                    est_dt: Optional[datetime] = None
                    if isinstance(est_val, str):
                        try:
                            est_dt = datetime.fromisoformat(est_val)
                        except Exception:
                            est_dt = None
                    return AnalysisStatus(
                        analysis_id=analysis_id,
                        evidence_id=evidence_id_val,
                        status=AnalysisStatusEnum(status_str),
                        progress=progress_val,
                        estimated_completion=est_dt
                    )
                except Exception as e:
                    logger.debug(f"Failed to parse cached status for {analysis_id}: {e}")
        return None
    
    async def _queue_analysis_request(self, request: AnalysisRequest, file_path: str):
        """Queue analysis request for processing"""
        if self._mq_ready():
            message = {
                "analysis_id": request.analysis_id,
                "evidence_id": request.evidence_id,
                "analysis_type": request.analysis_type,
                "file_path": file_path,
                "priority": request.priority,
                "submitted_at": request.submitted_at.isoformat()
            }
            await self.mq_manager.publish_message(
                settings.QUEUE_EVIDENCE_ANALYSIS,
                json.dumps(message)
            )
    
    async def _estimate_completion_time(self, request: AnalysisRequest) -> datetime:
        """Estimate completion time based on queue and analysis type"""
        # Simple estimation based on analysis type
        base_times = {
            "image": 60,    # 1 minute
            "video": 300,   # 5 minutes
            "document": 120, # 2 minutes
            "audio": 180    # 3 minutes
        }
        
        base_time = base_times.get(request.analysis_type, 120)
        
        # Adjust for priority (higher priority = faster processing)
        priority_multiplier = {
            Priority.LOW: 2.0,
            Priority.NORMAL: 1.0,
            Priority.HIGH: 0.7,
            Priority.URGENT: 0.5,
            Priority.CRITICAL: 0.3
        }
        
        estimated_seconds = base_time * priority_multiplier.get(request.priority, 1.0)
        return datetime.utcnow() + timedelta(seconds=estimated_seconds)
    
    async def _store_analysis_results(self, analysis_id: str, results: Dict[str, Any]):
        """Store analysis results"""
        try:
            # Serialize results first
            serialized_results = self._serialize_analysis_result(results)

            # Cache results
            if self._cache_ready():
                await self.redis_cache.set(
                    f"results:{analysis_id}",
                    json.dumps(serialized_results),
                    ttl=86400  # 24 hours
                )

            logger.info(f"Results stored for analysis {analysis_id}")
        except Exception as e:
            logger.error(f"Failed to store results for analysis {analysis_id}: {e}")
        
        # Store in database
        if self._db_ready():
            try:
                # Detailed results in MongoDB
                await self.db_manager.store_detailed_results(analysis_id, serialized_results)
            except Exception as e:
                logger.debug(f"Failed to persist results to DB: {e}")
    
    async def _send_results_via_mq(self, analysis_id: str, evidence_id: str, results: Dict[str, Any]):
        """Send results via message queue"""
        if self._mq_ready():
            message = {
                "analysis_id": analysis_id,
                "evidence_id": evidence_id,
                "results": results,
                "completed_at": datetime.utcnow().isoformat()
            }
            await self.mq_manager.publish_message(
                settings.QUEUE_RESULTS,
                json.dumps(message, default=lambda o: getattr(o, "isoformat", lambda: str(o))())
            )
    
    async def _send_results_via_http(self, analysis_id: str, evidence_id: str, results: Dict[str, Any]):
        """Send results via HTTP API to evidence service"""
        try:
            # Generate short-lived service token so evidence-service accepts callback
            payload = {
                "id": "ai-analysis-service",
                "userId": "ai-analysis-service",
                "email": "ai@forensic-system.local",
                "role": "service",
                "organization": "forensic-evidence-system"
            }
            token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

            # Build evidence-service compliant payload
            try:
                evidence_payload = self._build_evidence_analysis_payload(analysis_id, evidence_id, results)
            except Exception as e:
                # Fallback to a minimal, valid shape
                logger.warning(f"Failed to build evidence payload, using fallback: {e}")
                evidence_payload = {
                    "analysisResults": {
                        "confidence": 0,
                        "anomaliesDetected": False,
                        "findings": [],
                        "metadata": {
                            "analysisId": analysis_id,
                            "evidenceId": evidence_id,
                            "error": "payload_build_failed"
                        }
                    }
                }
            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(
                        f"{settings.EVIDENCE_SERVICE_URL}/api/v1/evidence/{evidence_id}/analysis",
                        json=evidence_payload,
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json"
                        },
                        timeout=30.0
                    )
                    response.raise_for_status()
                except httpx.HTTPStatusError as http_err:
                    # Log response body for diagnostics, but do not crash the pipeline
                    logger.error(
                        f"Evidence-service callback failed: status={http_err.response.status_code} body={http_err.response.text}"
                    )
                except Exception as e:
                    logger.error(f"Evidence-service callback error: {e}")
                
        except Exception as e:
            logger.error(f"Failed to send results via HTTP: {e}")

    def _build_evidence_analysis_payload(self, analysis_id: str, evidence_id: str, results: Dict[str, Any]) -> Dict[str, Any]:
        """Map internal analysis results to evidence-service schema.

        evidence-service expects:
          {
            "analysisResults": {
               "confidence": 0..100,
               "anomaliesDetected": bool,
               "findings": [ ... ],
               "metadata": { ... }
            }
          }
        """
        result_obj: Dict[str, Any] = results if isinstance(results, dict) else self._serialize_analysis_result(results)

        # Confidence normalisation (0..1 -> 0..100)
        raw_conf = result_obj.get("confidence_score")
        if isinstance(raw_conf, (int, float)):
            if raw_conf <= 1.0:
                confidence = int(max(0, min(100, round(raw_conf * 100))))
            else:
                confidence = int(max(0, min(100, round(raw_conf))))
        else:
            confidence = 0

        # Detect anomalies across types
        anomalies = False

        # Image
        img = result_obj.get("manipulation_detection") or {}
        anomalies = anomalies or bool(img.get("is_manipulated", False))

        # Video
        vid = result_obj.get("deepfake_detection") or {}
        anomalies = anomalies or bool(vid.get("is_deepfake", False))

        # Document
        doc = result_obj.get("authenticity_analysis") or {}
        if isinstance(doc, dict) and "is_authentic" in doc:
            anomalies = anomalies or (not bool(doc.get("is_authentic", True)))

        # Audio
        aud = result_obj.get("authenticity_analysis") or {}
        if isinstance(aud, dict) and "is_authentic" in aud:
            anomalies = anomalies or (not bool(aud.get("is_authentic", True)))

        findings: List[Dict[str, Any]] = []
        if img:
            mt = img.get("manipulation_type")
            if mt:
                findings.append({"type": "image_manipulation", "manipulationType": mt, "confidence": img.get("confidence")})
        if vid:
            if vid.get("is_deepfake"):
                findings.append({"type": "video_deepfake", "confidence": vid.get("confidence")})
        if isinstance(doc, dict) and "is_authentic" in doc:
            if not doc.get("is_authentic", True):
                findings.append({"type": "document_forgery", "confidence": doc.get("confidence")})
        if isinstance(aud, dict) and "is_authentic" in aud:
            if not aud.get("is_authentic", True):
                findings.append({"type": "audio_tampering", "confidence": aud.get("confidence")})

        # Determine analysis type if available
        analysis_type = None
        try:
            if analysis_id in self.active_analyses:
                analysis_type = getattr(self.active_analyses[analysis_id]["request"], "analysis_type", None)
        except Exception:
            analysis_type = None

        meta: Dict[str, Any] = {
            "analysisId": analysis_id,
            "evidenceId": evidence_id,
            "completedAt": datetime.utcnow().isoformat(),
        }
        if analysis_type:
            meta["analysisType"] = analysis_type

        return {
            "analysisResults": {
                "confidence": confidence,
                "anomaliesDetected": anomalies,
                "findings": findings,
                "metadata": meta
            }
        }
    
    async def _get_status_from_db(self, analysis_id: str) -> Optional[AnalysisStatus]:
        """Get status from database"""
        try:
            collection = await self.db_manager.get_mongodb_collection('analysis_requests')
            doc = await collection.find_one({"analysis_id": analysis_id})
            if not doc:
                return None
            status_str = doc.get("status", "pending")
            progress_val = int(doc.get("progress", 0) or 0)
            est = doc.get("estimated_completion")
            est_dt = None
            try:
                if isinstance(est, str):
                    est_dt = datetime.fromisoformat(est)
            except Exception:
                est_dt = None
            return AnalysisStatus(
                analysis_id=analysis_id,
                evidence_id=doc.get("evidence_id", ""),
                status=AnalysisStatusEnum(status_str),
                progress=progress_val,
                estimated_completion=est_dt
            )
        except Exception as e:
            logger.debug(f"DB status lookup failed: {e}")
            return None
    
    async def _get_results_from_db(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Get results from database"""
        try:
            result = await self.db_manager.get_detailed_results(analysis_id)
            if result and isinstance(result, dict):
                # Mongo returns _id; strip for API cleanliness
                result.pop("_id", None)
                return result.get("results") or result
        except Exception as e:
            logger.debug(f"DB results lookup failed: {e}")
        return None
    
    async def _get_evidence_analyses_from_db(self, evidence_id: str, skip: int, limit: int) -> List[Dict[str, Any]]:
        """Get evidence analyses from database"""
        try:
            collection = await self.db_manager.get_mongodb_collection('analysis_requests')
            cursor = collection.find({"evidence_id": evidence_id}).skip(int(skip)).limit(int(limit))
            results: List[Dict[str, Any]] = []
            async for doc in cursor:
                results.append({
                    "analysis_id": doc.get("analysis_id"),
                    "analysis_type": doc.get("analysis_type"),
                    "status": doc.get("status", "pending"),
                    "submitted_at": (doc.get("submitted_at") or datetime.utcnow()).isoformat(),
                    "priority": int(doc.get("priority", 3))
                })
            return results
        except Exception as e:
            logger.debug(f"DB evidence analyses query failed: {e}")
            return []
    
    async def _update_status_in_db(self, analysis_id: str, status: str, progress: int, error_message: str):
        """Update status in database"""
        try:
            collection = await self.db_manager.get_mongodb_collection('analysis_requests')
            update_doc: Dict[str, Any] = {
                "status": status,
                "updated_at": datetime.utcnow()
            }
            if progress is not None:
                update_doc["progress"] = int(progress)
            if error_message:
                update_doc["error_message"] = error_message
            await collection.update_one({"analysis_id": analysis_id}, {"$set": update_doc}, upsert=True)
        except Exception as e:
            logger.debug(f"DB status update failed: {e}")