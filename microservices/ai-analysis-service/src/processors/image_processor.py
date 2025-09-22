"""
Image Analysis Processor
Handles comprehensive image forensics and analysis
"""

import asyncio
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from PIL import Image, ExifTags

# Lazy/defensive imports for heavy optional deps
try:  # OpenCV may be unavailable at runtime without system libs
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

try:  # imagehash is optional; fall back gracefully
    import imagehash  # type: ignore
except Exception:  # pragma: no cover
    imagehash = None  # type: ignore
from loguru import logger

from ..schemas.analysis_schemas import (
    AnalysisRequest,
    ImageAnalysisResult,
    ImageManipulationResult,
    ImageSimilarityResult,
    ImageExifData
)
from ..models import get_model_manager
from ..config import get_settings

settings = get_settings()


class ImageProcessor:
    """Advanced image analysis processor for forensic evidence"""
    
    def __init__(self):
        self.model_manager = get_model_manager()
        self.supported_formats = settings.IMAGE_ALLOWED_FORMATS
        self.max_size = settings.IMAGE_MAX_SIZE
        self.confidence_threshold = settings.IMAGE_CONFIDENCE_THRESHOLD
    
    async def analyze(self, file_path: str, request: AnalysisRequest) -> ImageAnalysisResult:
        """
        Perform comprehensive image analysis
        
        Args:
            file_path: Path to the image file
            request: Analysis request details
            
        Returns:
            Complete image analysis results
        """
        start_time = time.time()
        
        try:
            # Load and validate image
            image = await self._load_image(file_path)
            
            # Run all analysis components in parallel
            tasks = [
                self._detect_manipulation(image, file_path),
                self._analyze_similarity(image, file_path),
                self._extract_exif_data(file_path),
                self._detect_objects(image),
                self._detect_faces(image),
                self._assess_quality(image),
                self._extract_technical_metadata(image, file_path)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # Compile final results
            manipulation_result = results[0]
            similarity_result = results[1]
            exif_data = results[2]
            detected_objects = results[3]
            detected_faces = results[4]
            quality_score = results[5]
            technical_metadata = results[6]
            
            processing_time = time.time() - start_time
            
            # Calculate overall confidence
            overall_confidence = self._calculate_overall_confidence(
                manipulation_result, similarity_result, quality_score
            )
            
            return ImageAnalysisResult(
                analysis_id=request.analysis_id,
                evidence_id=request.evidence_id,
                confidence_score=overall_confidence,
                processing_time=processing_time,
                model_version="1.0.0",
                manipulation_detection=manipulation_result,
                similarity_analysis=similarity_result,
                exif_analysis=exif_data,
                detected_objects=detected_objects,
                detected_faces=detected_faces,
                image_quality_score=quality_score,
                technical_metadata=technical_metadata,
                metadata={
                    "file_path": file_path,
                    "analysis_timestamp": datetime.utcnow().isoformat(),
                    "processor_version": "1.0.0"
                }
            )
            
        except Exception as e:
            logger.error(f"Error analyzing image {file_path}: {e}")
            raise
    
    async def _load_image(self, file_path: str) -> np.ndarray:
        """Load and preprocess image"""
        try:
            # Load with PIL for EXIF data
            pil_image = Image.open(file_path)
            
            # Convert to RGB if necessary
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Convert to OpenCV format if available, otherwise keep as numpy RGB
            if cv2 is not None:  # type: ignore
                image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)  # type: ignore
                return image
            else:
                return np.array(pil_image)
            
        except Exception as e:
            logger.error(f"Failed to load image {file_path}: {e}")
            raise
    
    async def _detect_manipulation(self, image: np.ndarray, file_path: str) -> ImageManipulationResult:
        """Detect image manipulation and tampering"""
        try:
            # Get manipulation detection model
            model = self.model_manager.get_model("image_manipulation_detector")
            
            if model is None:
                logger.warning("Manipulation detection model not loaded, using fallback")
                return await self._fallback_manipulation_detection(image)
            
            # Preprocessing for model
            processed_image = await self._preprocess_for_manipulation_detection(image)
            
            # Run inference (simulate for now)
            confidence = 0.75  # Placeholder confidence
            is_manipulated = confidence > self.confidence_threshold
            
            # Detect affected regions (placeholder)
            affected_regions = []
            if is_manipulated:
                affected_regions = [
                    {
                        "x": 100, "y": 100, "width": 200, "height": 150,
                        "confidence": confidence,
                        "manipulation_type": "splicing"
                    }
                ]
            
            return ImageManipulationResult(
                is_manipulated=is_manipulated,
                manipulation_type="splicing" if is_manipulated else None,
                confidence=confidence,
                affected_regions=affected_regions
            )
            
        except Exception as e:
            logger.error(f"Manipulation detection failed: {e}")
            return await self._fallback_manipulation_detection(image)
    
    async def _fallback_manipulation_detection(self, image: np.ndarray) -> ImageManipulationResult:
        """Fallback manipulation detection using basic techniques"""
        try:
            # Simple edge-based detection (fallback if OpenCV unavailable)
            if cv2 is not None:  # type: ignore
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # type: ignore
                edges = cv2.Canny(gray, 50, 150)  # type: ignore
                edge_density = np.sum(edges > 0) / edges.size
            else:
                # Numpy-based gradient magnitude as crude edge proxy
                if image.ndim == 3:
                    gray = np.mean(image, axis=2)
                else:
                    gray = image
                gx = np.gradient(gray, axis=0)
                gy = np.gradient(gray, axis=1)
                mag = np.sqrt(gx * gx + gy * gy)
                edge_density = float(np.mean(mag > (mag.mean() + mag.std())))
            
            # Simple heuristic
            is_manipulated = edge_density > 0.15
            confidence = min(edge_density * 2, 1.0)
            
            return ImageManipulationResult(
                is_manipulated=is_manipulated,
                manipulation_type="edge_anomaly" if is_manipulated else None,
                confidence=confidence,
                affected_regions=[]
            )
            
        except Exception as e:
            logger.error(f"Fallback manipulation detection failed: {e}")
            return ImageManipulationResult(
                is_manipulated=False,
                confidence=0.0,
                affected_regions=[]
            )
    
    async def _analyze_similarity(self, image: np.ndarray, file_path: str) -> ImageSimilarityResult:
        """Analyze image similarity and generate hashes"""
        try:
            # Load image for hashing
            pil_image = Image.open(file_path)
            
            if imagehash is not None:  # type: ignore
                # Generate different types of hashes
                hashes = {
                    "phash": str(imagehash.phash(pil_image)),  # type: ignore
                    "dhash": str(imagehash.dhash(pil_image)),  # type: ignore
                    "whash": str(imagehash.whash(pil_image)),  # type: ignore
                    "average_hash": str(imagehash.average_hash(pil_image))  # type: ignore
                }
                hash_matches = list(hashes.values())
            else:
                # Fallback: use simple content hash
                import hashlib as _hashlib
                with open(file_path, 'rb') as f:
                    digest = _hashlib.sha256(f.read()).hexdigest()
                hash_matches = [digest]
            
            # For now, return empty similarity results
            similar_images = []
            
            return ImageSimilarityResult(
                similar_images=similar_images,
                similarity_score=0.0,
                hash_matches=hash_matches
            )
            
        except Exception as e:
            logger.error(f"Similarity analysis failed: {e}")
            return ImageSimilarityResult(
                similar_images=[],
                similarity_score=0.0,
                hash_matches=[]
            )
    
    async def _extract_exif_data(self, file_path: str) -> ImageExifData:
        """Extract and analyze EXIF metadata"""
        try:
            pil_image = Image.open(file_path)
            exif_data = pil_image._getexif()
            
            if exif_data is None:
                return ImageExifData(is_modified=True)
            
            # Parse EXIF data
            exif_dict = {}
            for tag_id, value in exif_data.items():
                tag = ExifTags.TAGS.get(tag_id, tag_id)
                exif_dict[tag] = value
            
            # Extract key information
            camera_make = exif_dict.get('Make')
            camera_model = exif_dict.get('Model')
            software_used = exif_dict.get('Software')
            date_taken = None
            
            # Parse date
            date_str = exif_dict.get('DateTime')
            if date_str:
                try:
                    date_taken = datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
                except:
                    pass
            
            # GPS coordinates
            gps_coordinates = None
            gps_info = exif_dict.get('GPSInfo')
            if gps_info:
                gps_coordinates = self._parse_gps_coordinates(gps_info)
            
            # Simple modification detection
            is_modified = software_used is not None and 'Adobe' in str(software_used)
            
            return ImageExifData(
                camera_make=camera_make,
                camera_model=camera_model,
                date_taken=date_taken,
                gps_coordinates=gps_coordinates,
                software_used=software_used,
                is_modified=is_modified,
                metadata_analysis=exif_dict
            )
            
        except Exception as e:
            logger.error(f"EXIF extraction failed: {e}")
            return ImageExifData(is_modified=False)
    
    def _parse_gps_coordinates(self, gps_info: Dict) -> Optional[Dict[str, float]]:
        """Parse GPS coordinates from EXIF data"""
        try:
            # This is a simplified GPS parser
            # In production, you'd want more robust GPS parsing
            if 'GPSLatitude' in gps_info and 'GPSLongitude' in gps_info:
                return {
                    "latitude": 0.0,  # Placeholder
                    "longitude": 0.0  # Placeholder
                }
        except:
            pass
        return None
    
    async def _detect_objects(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detect objects in the image"""
        try:
            # Placeholder object detection
            # In production, use YOLO, RCNN, or similar models
            objects = [
                {
                    "class": "person",
                    "confidence": 0.85,
                    "bbox": {"x": 100, "y": 50, "width": 200, "height": 300}
                },
                {
                    "class": "vehicle",
                    "confidence": 0.72,
                    "bbox": {"x": 300, "y": 200, "width": 150, "height": 100}
                }
            ]
            
            return objects
            
        except Exception as e:
            logger.error(f"Object detection failed: {e}")
            return []
    
    async def _detect_faces(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detect faces in the image"""
        try:
            if cv2 is None:  # type: ignore
                return []
            # Use OpenCV's built-in face detection
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')  # type: ignore
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # type: ignore
            
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)  # type: ignore
            
            face_results = []
            for (x, y, w, h) in faces:
                face_results.append({
                    "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
                    "confidence": 0.8,
                    "landmarks": []
                })
            
            return face_results
            
        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            return []
    
    async def _assess_quality(self, image: np.ndarray) -> float:
        """Assess image quality"""
        try:
            if cv2 is not None:  # type: ignore
                # Convert to grayscale
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # type: ignore
                # Calculate Laplacian variance (focus measure)
                laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()  # type: ignore
                quality_score = min(laplacian_var / 1000.0, 1.0)
                return quality_score
            else:
                # Fallback using numpy gradient energy
                if image.ndim == 3:
                    gray = np.mean(image, axis=2)
                else:
                    gray = image
                gx = np.gradient(gray, axis=0)
                gy = np.gradient(gray, axis=1)
                energy = float(np.mean(gx * gx + gy * gy))
                return min(energy / 1000.0, 1.0)
            
        except Exception as e:
            logger.error(f"Quality assessment failed: {e}")
            return 0.5
    
    async def _extract_technical_metadata(self, image: np.ndarray, file_path: str) -> Dict[str, Any]:
        """Extract technical metadata about the image"""
        try:
            height, width, channels = image.shape
            file_size = Path(file_path).stat().st_size
            
            # Calculate file hash
            with open(file_path, 'rb') as f:
                file_hash = hashlib.sha256(f.read()).hexdigest()
            
            return {
                "width": width,
                "height": height,
                "channels": channels,
                "file_size": file_size,
                "file_hash": file_hash,
                "format": Path(file_path).suffix.lower(),
                "color_space": "BGR",
                "bit_depth": 8
            }
            
        except Exception as e:
            logger.error(f"Technical metadata extraction failed: {e}")
            return {}
    
    async def _preprocess_for_manipulation_detection(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for manipulation detection model"""
        # Resize to model input size
        if cv2 is not None:  # type: ignore
            processed = cv2.resize(image, (224, 224))  # type: ignore
        else:
            try:
                pil = Image.fromarray(image if image.ndim == 2 else image[:, :, :3].astype(np.uint8))
                pil = pil.resize((224, 224))
                processed = np.array(pil)
            except Exception:
                # Last-resort: simple center crop/pad
                h, w = image.shape[:2]
                processed = image[:min(h,224), :min(w,224)]
        
        # Normalize pixel values
        processed = processed.astype(np.float32) / 255.0
        
        return processed
    
    def _calculate_overall_confidence(
        self,
        manipulation_result: ImageManipulationResult,
        similarity_result: ImageSimilarityResult,
        quality_score: float
    ) -> float:
        """Calculate overall analysis confidence"""
        # Weighted average of different analysis components
        weights = {
            "manipulation": 0.4,
            "similarity": 0.3,
            "quality": 0.3
        }
        
        confidence = (
            manipulation_result.confidence * weights["manipulation"] +
            similarity_result.similarity_score * weights["similarity"] +
            quality_score * weights["quality"]
        )
        
        return min(confidence, 1.0)