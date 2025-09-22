"""
Analysis API Router
Handles all AI analysis requests for forensic evidence
"""

import asyncio
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from loguru import logger

from ..schemas.analysis_schemas import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
    ImageAnalysisResult,
    VideoAnalysisResult,
    DocumentAnalysisResult,
    AudioAnalysisResult
)
from ..services.analysis_service import AnalysisService
from ..processors.image_processor import ImageProcessor
from ..processors.video_processor import VideoProcessor
from ..processors.document_processor import DocumentProcessor
from ..processors.audio_processor import AudioProcessor
from ..utils.auth import verify_token
from ..utils.file_handler import FileHandler

analysis_router = APIRouter()

# Global analysis service instance
analysis_service = AnalysisService()


@analysis_router.post("/submit", response_model=AnalysisResponse)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    evidence_id: str = Form(...),
    analysis_type: str = Form(...),
    file: UploadFile = File(...),
    priority: int = Form(default=1),
    metadata: Optional[str] = Form(default=None),
    user_token: str = Depends(verify_token)
):
    """
    Submit evidence for AI analysis
    
    Args:
        evidence_id: Unique identifier for the evidence
        analysis_type: Type of analysis (image, video, document, audio)
        file: Evidence file to analyze
        priority: Analysis priority (1-10, higher = more urgent)
        metadata: Additional metadata in JSON format
        user_token: JWT authentication token
    
    Returns:
        AnalysisResponse with analysis ID and status
    """
    try:
        # Generate unique analysis ID
        analysis_id = str(uuid4())
        
        # Validate analysis type
        valid_types = ["image", "video", "document", "audio"]
        if analysis_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid analysis type. Must be one of: {valid_types}"
            )
        
        # Validate file type based on analysis type
        file_handler = FileHandler()
        if not await file_handler.validate_file(file, analysis_type):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file format for {analysis_type} analysis"
            )
        
        # Create analysis request
        analysis_request = AnalysisRequest(
            analysis_id=analysis_id,
            evidence_id=evidence_id,
            analysis_type=analysis_type,
            file_name=file.filename,
            file_size=file.size,
            priority=priority,
            metadata=metadata,
            user_id=user_token.get("userId"),
            submitted_at=datetime.utcnow()
        )
        
        # Save file temporarily
        file_path = await file_handler.save_temp_file(file, analysis_id)
        
        # Submit to analysis service
        analysis_response = await analysis_service.submit_analysis(
            analysis_request, file_path
        )
        
        # Start background analysis
        background_tasks.add_task(
            process_analysis_async,
            analysis_id,
            analysis_type,
            file_path,
            analysis_request
        )
        
        logger.info(f"Analysis submitted: {analysis_id} for evidence: {evidence_id}")
        
        return analysis_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.get("/status/{analysis_id}", response_model=AnalysisStatus)
async def get_analysis_status(
    analysis_id: str,
    user_token: str = Depends(verify_token)
):
    """
    Get status of a specific analysis
    
    Args:
        analysis_id: Unique analysis identifier
        user_token: JWT authentication token
        
    Returns:
        AnalysisStatus with current progress and results
    """
    try:
        status = await analysis_service.get_analysis_status(analysis_id)
        
        if not status:
            raise HTTPException(
                status_code=404,
                detail="Analysis not found"
            )
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analysis status: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.get("/results/{analysis_id}")
async def get_analysis_results(
    analysis_id: str,
    user_token: str = Depends(verify_token)
):
    """
    Get complete analysis results
    
    Args:
        analysis_id: Unique analysis identifier
        user_token: JWT authentication token
        
    Returns:
        Complete analysis results based on analysis type
    """
    try:
        results = await analysis_service.get_analysis_results(analysis_id)
        
        if not results:
            raise HTTPException(
                status_code=404,
                detail="Analysis results not found"
            )
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analysis results: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.get("/evidence/{evidence_id}/analyses")
async def get_evidence_analyses(
    evidence_id: str,
    skip: int = 0,
    limit: int = 10,
    user_token: str = Depends(verify_token)
):
    """
    Get all analyses for a specific evidence item
    
    Args:
        evidence_id: Evidence identifier
        skip: Number of records to skip
        limit: Maximum number of records to return
        user_token: JWT authentication token
        
    Returns:
        List of analyses for the evidence
    """
    try:
        analyses = await analysis_service.get_evidence_analyses(
            evidence_id, skip, limit
        )
        
        return {
            "evidence_id": evidence_id,
            "analyses": analyses,
            "total": len(analyses),
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error getting evidence analyses: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.post("/batch", response_model=List[AnalysisResponse])
async def submit_batch_analysis(
    background_tasks: BackgroundTasks,
    analyses: List[Dict[str, Any]],
    user_token: str = Depends(verify_token)
):
    """
    Submit multiple evidence items for batch analysis
    
    Args:
        analyses: List of analysis requests
        user_token: JWT authentication token
        
    Returns:
        List of AnalysisResponse objects
    """
    try:
        responses = []
        
        for analysis_data in analyses:
            # Generate unique analysis ID
            analysis_id = str(uuid4())
            
            # Create analysis request
            analysis_request = AnalysisRequest(
                analysis_id=analysis_id,
                evidence_id=analysis_data.get("evidence_id"),
                analysis_type=analysis_data.get("analysis_type"),
                file_name=analysis_data.get("file_name"),
                priority=analysis_data.get("priority", 1),
                metadata=analysis_data.get("metadata"),
                user_id=user_token.get("userId"),
                submitted_at=datetime.utcnow()
            )
            
            # Submit to analysis service
            response = await analysis_service.submit_analysis(
                analysis_request, analysis_data.get("file_path")
            )
            
            responses.append(response)
            
            # Start background analysis
            background_tasks.add_task(
                process_analysis_async,
                analysis_id,
                analysis_data.get("analysis_type"),
                analysis_data.get("file_path"),
                analysis_request
            )
        
        logger.info(f"Batch analysis submitted: {len(analyses)} items")
        
        return responses
        
    except Exception as e:
        logger.error(f"Error submitting batch analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.delete("/cancel/{analysis_id}")
async def cancel_analysis(
    analysis_id: str,
    user_token: str = Depends(verify_token)
):
    """
    Cancel a pending or running analysis
    
    Args:
        analysis_id: Unique analysis identifier
        user_token: JWT authentication token
        
    Returns:
        Cancellation confirmation
    """
    try:
        success = await analysis_service.cancel_analysis(analysis_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Analysis not found or cannot be cancelled"
            )
        
        logger.info(f"Analysis cancelled: {analysis_id}")
        
        return {"message": "Analysis cancelled successfully", "analysis_id": analysis_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.get("/queue/status")
async def get_queue_status(user_token: str = Depends(verify_token)):
    """
    Get current analysis queue status
    
    Args:
        user_token: JWT authentication token
        
    Returns:
        Queue statistics and status
    """
    try:
        queue_status = await analysis_service.get_queue_status()
        return queue_status
        
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@analysis_router.get("/types")
async def get_supported_analysis_types():
    """
    Get list of supported analysis types and their capabilities
    
    Returns:
        Dictionary of supported analysis types and their features
    """
    return {
        "image": {
            "description": "Image forensics and manipulation detection",
            "supported_formats": ["jpg", "jpeg", "png", "gif", "bmp", "tiff"],
            "features": [
                "Manipulation detection",
                "EXIF analysis",
                "Similarity matching",
                "Object detection",
                "Face detection",
                "Hash analysis"
            ]
        },
        "video": {
            "description": "Video analysis and deepfake detection",
            "supported_formats": ["mp4", "avi", "mov", "wmv", "flv", "mkv"],
            "features": [
                "Deepfake detection",
                "Frame analysis",
                "Motion detection",
                "Face tracking",
                "Audio extraction",
                "Metadata analysis"
            ]
        },
        "document": {
            "description": "Document authenticity and content analysis",
            "supported_formats": ["pdf", "doc", "docx", "txt", "rtf"],
            "features": [
                "Text extraction",
                "Authenticity verification",
                "Metadata analysis",
                "Language detection",
                "Content classification",
                "Plagiarism detection"
            ]
        },
        "audio": {
            "description": "Audio forensics and voice analysis",
            "supported_formats": ["mp3", "wav", "m4a", "flac", "ogg"],
            "features": [
                "Voice identification",
                "Audio enhancement",
                "Noise reduction",
                "Spectrum analysis",
                "Speaker verification",
                "Authenticity check"
            ]
        }
    }


async def process_analysis_async(
    analysis_id: str,
    analysis_type: str,
    file_path: str,
    analysis_request: AnalysisRequest
):
    """
    Background task to process analysis
    
    Args:
        analysis_id: Unique analysis identifier
        analysis_type: Type of analysis to perform
        file_path: Path to the file to analyze
        analysis_request: Original analysis request
    """
    try:
        # Update status to processing
        await analysis_service.update_analysis_status(
            analysis_id, "processing", progress=10
        )
        
        # Select appropriate processor
        processor = None
        if analysis_type == "image":
            processor = ImageProcessor()
        elif analysis_type == "video":
            processor = VideoProcessor()
        elif analysis_type == "document":
            processor = DocumentProcessor()
        elif analysis_type == "audio":
            processor = AudioProcessor()
        
        if not processor:
            raise ValueError(f"No processor available for type: {analysis_type}")
        
        # Process the file
        results = await processor.analyze(file_path, analysis_request)
        
        # Update status to completed
        await analysis_service.update_analysis_status(
            analysis_id, "completed", progress=100, results=results
        )
        
        # Send results to evidence service
        await analysis_service.send_results_to_evidence_service(
            analysis_id, analysis_request.evidence_id, analysis_service._serialize_analysis_result(results)
        )
        
        logger.info(f"Analysis completed: {analysis_id}")
        
    except Exception as e:
        logger.error(f"Error processing analysis {analysis_id}: {e}")
        
        # Update status to failed
        await analysis_service.update_analysis_status(
            analysis_id, "failed", error_message=str(e)
        )
    
    finally:
        # Clean up temporary file
        file_handler = FileHandler()
        await file_handler.cleanup_temp_file(file_path)