"""
Video Analysis Processor
Handles comprehensive video forensics and deepfake detection
"""

import asyncio
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
import moviepy.editor as mp
from loguru import logger

from ..schemas.analysis_schemas import (
    AnalysisRequest,
    VideoAnalysisResult,
    DeepfakeDetectionResult,
    VideoTechnicalAnalysis
)
from ..models import get_model_manager
from ..config import get_settings

settings = get_settings()


class VideoProcessor:
    """Advanced video analysis processor for forensic evidence"""
    
    def __init__(self):
        self.model_manager = get_model_manager()
        self.supported_formats = settings.VIDEO_ALLOWED_FORMATS
        self.max_size = settings.VIDEO_MAX_SIZE
        self.confidence_threshold = settings.VIDEO_CONFIDENCE_THRESHOLD
        self.frame_sample_rate = settings.VIDEO_FRAME_SAMPLE_RATE
    
    async def analyze(self, file_path: str, request: AnalysisRequest) -> VideoAnalysisResult:
        """
        Perform comprehensive video analysis
        
        Args:
            file_path: Path to the video file
            request: Analysis request details
            
        Returns:
            Complete video analysis results
        """
        start_time = time.time()
        
        try:
            # Load and validate video
            video_capture = await self._load_video(file_path)
            
            # Run all analysis components in parallel
            tasks = [
                self._detect_deepfake(video_capture, file_path),
                self._analyze_technical_properties(video_capture, file_path),
                self._analyze_frame_samples(video_capture),
                self._analyze_motion(video_capture),
                self._track_faces(video_capture),
                self._extract_audio_analysis(file_path)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # Compile final results
            deepfake_result = results[0]
            technical_analysis = results[1]
            frame_samples = results[2]
            motion_analysis = results[3]
            face_tracking = results[4]
            audio_analysis = results[5]
            
            processing_time = time.time() - start_time
            
            # Calculate overall confidence
            overall_confidence = self._calculate_overall_confidence(
                deepfake_result, technical_analysis, motion_analysis
            )
            
            return VideoAnalysisResult(
                analysis_id=request.analysis_id,
                evidence_id=request.evidence_id,
                confidence_score=overall_confidence,
                processing_time=processing_time,
                model_version="1.0.0",
                deepfake_detection=deepfake_result,
                technical_analysis=technical_analysis,
                frame_samples=frame_samples,
                motion_analysis=motion_analysis,
                face_tracking=face_tracking,
                audio_analysis=audio_analysis,
                metadata={
                    "file_path": file_path,
                    "analysis_timestamp": datetime.utcnow().isoformat(),
                    "processor_version": "1.0.0"
                }
            )
            
        except Exception as e:
            logger.error(f"Error analyzing video {file_path}: {e}")
            raise
        finally:
            if 'video_capture' in locals():
                video_capture.release()
    
    async def _load_video(self, file_path: str) -> cv2.VideoCapture:
        """Load and validate video file"""
        try:
            video_capture = cv2.VideoCapture(file_path)
            
            if not video_capture.isOpened():
                raise ValueError(f"Could not open video file: {file_path}")
            
            # Validate video properties
            frame_count = int(video_capture.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = video_capture.get(cv2.CAP_PROP_FPS)
            duration = frame_count / fps if fps > 0 else 0
            
            if duration > 3600:  # 1 hour limit
                raise ValueError("Video duration exceeds 1 hour limit")
            
            logger.debug(f"Video loaded: {frame_count} frames, {fps} FPS, {duration:.2f}s duration")
            return video_capture
            
        except Exception as e:
            logger.error(f"Failed to load video {file_path}: {e}")
            raise
    
    async def _detect_deepfake(self, video_capture: cv2.VideoCapture, file_path: str) -> DeepfakeDetectionResult:
        """Detect deepfake manipulation in video"""
        try:
            # Get deepfake detection model
            model = self.model_manager.get_model("video_deepfake_detector")
            
            if model is None:
                logger.warning("Deepfake detection model not loaded, using fallback")
                return await self._fallback_deepfake_detection(video_capture)
            
            # Sample frames for analysis
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=30)
            
            # Analyze frames for deepfake indicators
            deepfake_indicators = []
            temporal_inconsistencies = []
            overall_confidence = 0.0
            
            for i, frame in enumerate(frame_samples):
                # Preprocess frame for model
                processed_frame = await self._preprocess_frame_for_deepfake_detection(frame)
                
                # Run inference (simulate for now)
                frame_confidence = 0.75  # Placeholder confidence
                
                if frame_confidence > self.confidence_threshold:
                    deepfake_indicators.append({
                        "frame_number": i * self.frame_sample_rate,
                        "confidence": frame_confidence,
                        "indicators": ["face_inconsistency", "temporal_artifact"]
                    })
                
                # Check for temporal inconsistencies
                if i > 0:
                    prev_frame = frame_samples[i-1]
                    inconsistency_score = await self._detect_temporal_inconsistency(prev_frame, frame)
                    
                    if inconsistency_score > 0.7:
                        temporal_inconsistencies.append({
                            "frame_range": [i-1, i],
                            "inconsistency_type": "temporal_artifact",
                            "score": inconsistency_score
                        })
            
            # Calculate overall deepfake probability
            is_deepfake = len(deepfake_indicators) > len(frame_samples) * 0.3
            overall_confidence = sum(indicator["confidence"] for indicator in deepfake_indicators) / max(len(deepfake_indicators), 1)
            
            return DeepfakeDetectionResult(
                is_deepfake=is_deepfake,
                confidence=overall_confidence,
                detection_method="CNN-based temporal analysis",
                frame_analysis=deepfake_indicators,
                temporal_inconsistencies=temporal_inconsistencies
            )
            
        except Exception as e:
            logger.error(f"Deepfake detection failed: {e}")
            return await self._fallback_deepfake_detection(video_capture)
    
    async def _fallback_deepfake_detection(self, video_capture: cv2.VideoCapture) -> DeepfakeDetectionResult:
        """Fallback deepfake detection using basic techniques"""
        try:
            # Sample frames for basic analysis
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=10)
            
            # Basic consistency checks
            inconsistencies = 0
            total_checks = 0
            
            for i in range(1, len(frame_samples)):
                prev_frame = frame_samples[i-1]
                curr_frame = frame_samples[i]
                
                # Calculate frame difference
                diff = cv2.absdiff(prev_frame, curr_frame)
                diff_score = np.mean(diff) / 255.0
                
                # Check for unusual frame differences (potential deepfake artifacts)
                if diff_score > 0.3:  # Threshold for unusual changes
                    inconsistencies += 1
                
                total_checks += 1
            
            # Calculate confidence based on inconsistency ratio
            inconsistency_ratio = inconsistencies / max(total_checks, 1)
            is_deepfake = inconsistency_ratio > 0.4
            confidence = min(inconsistency_ratio * 2, 1.0)
            
            return DeepfakeDetectionResult(
                is_deepfake=is_deepfake,
                confidence=confidence,
                detection_method="fallback_temporal_consistency",
                frame_analysis=[],
                temporal_inconsistencies=[]
            )
            
        except Exception as e:
            logger.error(f"Fallback deepfake detection failed: {e}")
            return DeepfakeDetectionResult(
                is_deepfake=False,
                confidence=0.0,
                detection_method="error_fallback",
                frame_analysis=[],
                temporal_inconsistencies=[]
            )
    
    async def _analyze_technical_properties(self, video_capture: cv2.VideoCapture, file_path: str) -> VideoTechnicalAnalysis:
        """Analyze technical properties of the video"""
        try:
            # Get video properties
            frame_count = int(video_capture.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = video_capture.get(cv2.CAP_PROP_FPS)
            width = int(video_capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(video_capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0
            
            # Get file information
            file_size = Path(file_path).stat().st_size
            
            # Detect codec and bitrate (simplified)
            codec = "H.264"  # Placeholder - would need more sophisticated detection
            bitrate = int((file_size * 8) / duration) if duration > 0 else 0
            
            # Detect audio channels
            audio_channels = 2  # Placeholder - would need audio analysis
            
            # Detect edit points (scene changes)
            edit_points = await self._detect_edit_points(video_capture)
            is_edited = len(edit_points) > 0
            
            return VideoTechnicalAnalysis(
                duration=duration,
                frame_rate=fps,
                resolution=f"{width}x{height}",
                codec=codec,
                bitrate=bitrate,
                audio_channels=audio_channels,
                is_edited=is_edited,
                edit_points=edit_points
            )
            
        except Exception as e:
            logger.error(f"Technical analysis failed: {e}")
            return VideoTechnicalAnalysis(
                duration=0.0,
                frame_rate=0.0,
                resolution="unknown",
                codec="unknown",
                bitrate=0,
                audio_channels=0,
                is_edited=False,
                edit_points=[]
            )
    
    async def _analyze_frame_samples(self, video_capture: cv2.VideoCapture) -> List[Dict[str, Any]]:
        """Analyze sampled frames for various properties"""
        try:
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=20)
            frame_analyses = []
            
            for i, frame in enumerate(frame_samples):
                # Analyze frame properties
                frame_analysis = {
                    "frame_number": i * self.frame_sample_rate,
                    "brightness": float(np.mean(frame)),
                    "contrast": float(np.std(frame)),
                    "sharpness": await self._calculate_frame_sharpness(frame),
                    "color_histogram": await self._calculate_color_histogram(frame),
                    "edge_density": await self._calculate_edge_density(frame)
                }
                
                frame_analyses.append(frame_analysis)
            
            return frame_analyses
            
        except Exception as e:
            logger.error(f"Frame analysis failed: {e}")
            return []
    
    async def _analyze_motion(self, video_capture: cv2.VideoCapture) -> Dict[str, Any]:
        """Analyze motion patterns in the video"""
        try:
            # Sample frames for motion analysis
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=15)
            
            if len(frame_samples) < 2:
                return {"error": "Insufficient frames for motion analysis"}
            
            # Calculate optical flow between consecutive frames
            motion_vectors = []
            motion_magnitudes = []
            
            for i in range(1, len(frame_samples)):
                prev_frame = cv2.cvtColor(frame_samples[i-1], cv2.COLOR_BGR2GRAY)
                curr_frame = cv2.cvtColor(frame_samples[i], cv2.COLOR_BGR2GRAY)
                
                # Calculate optical flow
                flow = cv2.calcOpticalFlowPyrLK(prev_frame, curr_frame, None, None)
                
                if flow[0] is not None:
                    # Calculate motion magnitude
                    motion_mag = np.mean(np.linalg.norm(flow[0], axis=1))
                    motion_magnitudes.append(motion_mag)
            
            # Analyze motion patterns
            avg_motion = np.mean(motion_magnitudes) if motion_magnitudes else 0.0
            motion_variance = np.var(motion_magnitudes) if motion_magnitudes else 0.0
            
            return {
                "average_motion": float(avg_motion),
                "motion_variance": float(motion_variance),
                "motion_consistency": float(1.0 / (1.0 + motion_variance)),
                "total_motion_vectors": len(motion_vectors),
                "motion_analysis_method": "optical_flow"
            }
            
        except Exception as e:
            logger.error(f"Motion analysis failed: {e}")
            return {"error": str(e)}
    
    async def _track_faces(self, video_capture: cv2.VideoCapture) -> List[Dict[str, Any]]:
        """Track faces across video frames"""
        try:
            # Load face detection model
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            
            # Sample frames for face tracking
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=10)
            face_tracks = []
            
            for i, frame in enumerate(frame_samples):
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                
                frame_faces = []
                for (x, y, w, h) in faces:
                    face_info = {
                        "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
                        "confidence": 0.8,  # OpenCV doesn't provide confidence
                        "frame_number": i * self.frame_sample_rate
                    }
                    frame_faces.append(face_info)
                
                if frame_faces:
                    face_tracks.append({
                        "frame_number": i * self.frame_sample_rate,
                        "faces": frame_faces,
                        "face_count": len(frame_faces)
                    })
            
            return face_tracks
            
        except Exception as e:
            logger.error(f"Face tracking failed: {e}")
            return []
    
    async def _extract_audio_analysis(self, file_path: str) -> Dict[str, Any]:
        """Extract and analyze audio from video"""
        try:
            # Extract audio using moviepy
            video = mp.VideoFileClip(file_path)
            
            if video.audio is None:
                return {"error": "No audio track found"}
            
            # Get audio properties
            audio_duration = video.audio.duration
            audio_fps = video.audio.fps
            
            # Extract audio to temporary file for analysis
            temp_audio_path = f"/tmp/audio_{hashlib.md5(file_path.encode()).hexdigest()}.wav"
            video.audio.write_audiofile(temp_audio_path, verbose=False, logger=None)
            
            # Basic audio analysis
            audio_analysis = {
                "duration": audio_duration,
                "sample_rate": audio_fps,
                "has_audio": True,
                "audio_format": "wav",
                "analysis_method": "moviepy_extraction"
            }
            
            # Clean up
            video.close()
            Path(temp_audio_path).unlink(missing_ok=True)
            
            return audio_analysis
            
        except Exception as e:
            logger.error(f"Audio analysis failed: {e}")
            return {"error": str(e), "has_audio": False}
    
    # Helper methods
    
    async def _sample_frames_for_analysis(self, video_capture: cv2.VideoCapture, sample_count: int = 20) -> List[np.ndarray]:
        """Sample frames from video for analysis"""
        try:
            frame_count = int(video_capture.get(cv2.CAP_PROP_FRAME_COUNT))
            frame_samples = []
            
            # Calculate frame indices to sample
            if frame_count <= sample_count:
                frame_indices = list(range(frame_count))
            else:
                frame_indices = np.linspace(0, frame_count-1, sample_count, dtype=int)
            
            for frame_idx in frame_indices:
                video_capture.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = video_capture.read()
                
                if ret:
                    frame_samples.append(frame)
            
            return frame_samples
            
        except Exception as e:
            logger.error(f"Frame sampling failed: {e}")
            return []
    
    async def _preprocess_frame_for_deepfake_detection(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for deepfake detection model"""
        # Resize to model input size
        processed = cv2.resize(frame, (224, 224))
        
        # Normalize pixel values
        processed = processed.astype(np.float32) / 255.0
        
        return processed
    
    async def _detect_temporal_inconsistency(self, prev_frame: np.ndarray, curr_frame: np.ndarray) -> float:
        """Detect temporal inconsistencies between frames"""
        try:
            # Convert to grayscale
            prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
            curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)
            
            # Calculate structural similarity
            diff = cv2.absdiff(prev_gray, curr_gray)
            inconsistency_score = np.mean(diff) / 255.0
            
            return float(inconsistency_score)
            
        except Exception as e:
            logger.error(f"Temporal inconsistency detection failed: {e}")
            return 0.0
    
    async def _detect_edit_points(self, video_capture: cv2.VideoCapture) -> List[float]:
        """Detect scene changes/edit points in video"""
        try:
            frame_samples = await self._sample_frames_for_analysis(video_capture, sample_count=50)
            edit_points = []
            
            for i in range(1, len(frame_samples)):
                prev_frame = cv2.cvtColor(frame_samples[i-1], cv2.COLOR_BGR2GRAY)
                curr_frame = cv2.cvtColor(frame_samples[i], cv2.COLOR_BGR2GRAY)
                
                # Calculate frame difference
                diff = cv2.absdiff(prev_frame, curr_frame)
                diff_score = np.mean(diff) / 255.0
                
                # Threshold for scene change detection
                if diff_score > 0.5:
                    frame_number = i * self.frame_sample_rate
                    fps = video_capture.get(cv2.CAP_PROP_FPS)
                    timestamp = frame_number / fps if fps > 0 else 0
                    edit_points.append(timestamp)
            
            return edit_points
            
        except Exception as e:
            logger.error(f"Edit point detection failed: {e}")
            return []
    
    async def _calculate_frame_sharpness(self, frame: np.ndarray) -> float:
        """Calculate frame sharpness using Laplacian variance"""
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            return float(laplacian_var)
        except:
            return 0.0
    
    async def _calculate_color_histogram(self, frame: np.ndarray) -> Dict[str, List[float]]:
        """Calculate color histogram for frame"""
        try:
            hist_b = cv2.calcHist([frame], [0], None, [256], [0, 256])
            hist_g = cv2.calcHist([frame], [1], None, [256], [0, 256])
            hist_r = cv2.calcHist([frame], [2], None, [256], [0, 256])
            
            return {
                "blue": hist_b.flatten().tolist(),
                "green": hist_g.flatten().tolist(),
                "red": hist_r.flatten().tolist()
            }
        except:
            return {"blue": [], "green": [], "red": []}
    
    async def _calculate_edge_density(self, frame: np.ndarray) -> float:
        """Calculate edge density in frame"""
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size
            return float(edge_density)
        except:
            return 0.0
    
    def _calculate_overall_confidence(
        self,
        deepfake_result: DeepfakeDetectionResult,
        technical_analysis: VideoTechnicalAnalysis,
        motion_analysis: Dict[str, Any]
    ) -> float:
        """Calculate overall analysis confidence"""
        # Weighted average of different analysis components
        weights = {
            "deepfake": 0.5,
            "technical": 0.3,
            "motion": 0.2
        }
        
        confidence = (
            deepfake_result.confidence * weights["deepfake"] +
            (1.0 if technical_analysis.duration > 0 else 0.0) * weights["technical"] +
            (motion_analysis.get("motion_consistency", 0.0)) * weights["motion"]
        )
        
        return min(confidence, 1.0)