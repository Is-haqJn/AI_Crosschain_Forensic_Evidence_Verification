"""
AI Model Manager
Centralized model loading and management for all analysis types
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, Any, Optional, Union
import torch
import tensorflow as tf
from loguru import logger

from ..config import get_settings

settings = get_settings()


class ModelManager:
    """Centralized AI model manager for all analysis types"""
    
    def __init__(self):
        self.models: Dict[str, Any] = {}
        self.model_cache: Dict[str, Any] = {}
        self.model_path = Path(settings.MODEL_PATH)
        self.cache_size = settings.MODEL_CACHE_SIZE
        
    async def get_model(self, model_name: str) -> Optional[Any]:
        """
        Get a loaded model by name
        
        Args:
            model_name: Name of the model to retrieve
            
        Returns:
            Loaded model or None if not available
        """
        try:
            # Check cache first
            if model_name in self.model_cache:
                logger.debug(f"Model {model_name} found in cache")
                return self.model_cache[model_name]
            
            # Load model if not in cache
            model = await self._load_model(model_name)
            if model:
                # Add to cache
                await self._add_to_cache(model_name, model)
                logger.info(f"Model {model_name} loaded successfully")
            
            return model
            
        except Exception as e:
            logger.error(f"Failed to get model {model_name}: {e}")
            return None
    
    async def _load_model(self, model_name: str) -> Optional[Any]:
        """Load a specific model"""
        try:
            if model_name == "image_manipulation_detector":
                return await self._load_image_manipulation_model()
            elif model_name == "video_deepfake_detector":
                return await self._load_video_deepfake_model()
            elif model_name == "document_authenticity_verifier":
                return await self._load_document_authenticity_model()
            elif model_name == "audio_voice_identifier":
                return await self._load_audio_voice_model()
            elif model_name == "object_detector":
                return await self._load_object_detection_model()
            elif model_name == "face_detector":
                return await self._load_face_detection_model()
            else:
                logger.warning(f"Unknown model: {model_name}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            return None
    
    async def _load_image_manipulation_model(self) -> Optional[Any]:
        """Load image manipulation detection model"""
        try:
            # For now, return a placeholder model
            # In production, this would load a trained ResNet50 or similar model
            model_path = self.model_path / "image_manipulation" / "model.pth"
            
            if not model_path.exists():
                logger.warning("Image manipulation model not found, using fallback")
                return self._create_fallback_image_model()
            
            # Load PyTorch model
            model = torch.load(model_path, map_location='cpu')
            model.eval()
            return model
            
        except Exception as e:
            logger.error(f"Failed to load image manipulation model: {e}")
            return self._create_fallback_image_model()
    
    async def _load_video_deepfake_model(self) -> Optional[Any]:
        """Load video deepfake detection model"""
        try:
            # For now, return a placeholder model
            # In production, this would load a trained EfficientNet or similar model
            model_path = self.model_path / "video_deepfake" / "model.pth"
            
            if not model_path.exists():
                logger.warning("Video deepfake model not found, using fallback")
                return self._create_fallback_video_model()
            
            # Load PyTorch model
            model = torch.load(model_path, map_location='cpu')
            model.eval()
            return model
            
        except Exception as e:
            logger.error(f"Failed to load video deepfake model: {e}")
            return self._create_fallback_video_model()
    
    async def _load_document_authenticity_model(self) -> Optional[Any]:
        """Load document authenticity verification model"""
        try:
            # For now, return a placeholder model
            # In production, this would load a trained BERT or similar model
            model_path = self.model_path / "document_authenticity" / "model.h5"
            
            if not model_path.exists():
                logger.warning("Document authenticity model not found, using fallback")
                return self._create_fallback_document_model()
            
            # Load TensorFlow model
            model = tf.keras.models.load_model(model_path)
            return model
            
        except Exception as e:
            logger.error(f"Failed to load document authenticity model: {e}")
            return self._create_fallback_document_model()
    
    async def _load_audio_voice_model(self) -> Optional[Any]:
        """Load audio voice identification model"""
        try:
            # For now, return a placeholder model
            # In production, this would load a trained Wav2Vec2 or similar model
            model_path = self.model_path / "audio_voice" / "model.pth"
            
            if not model_path.exists():
                logger.warning("Audio voice model not found, using fallback")
                return self._create_fallback_audio_model()
            
            # Load PyTorch model
            model = torch.load(model_path, map_location='cpu')
            model.eval()
            return model
            
        except Exception as e:
            logger.error(f"Failed to load audio voice model: {e}")
            return self._create_fallback_audio_model()
    
    async def _load_object_detection_model(self) -> Optional[Any]:
        """Load object detection model (YOLO)"""
        try:
            # For now, return a placeholder
            # In production, this would load YOLOv8 or similar
            return self._create_fallback_object_model()
            
        except Exception as e:
            logger.error(f"Failed to load object detection model: {e}")
            return self._create_fallback_object_model()
    
    async def _load_face_detection_model(self) -> Optional[Any]:
        """Load face detection model"""
        try:
            # For now, return a placeholder
            # In production, this would load MTCNN or similar
            return self._create_fallback_face_model()
            
        except Exception as e:
            logger.error(f"Failed to load face detection model: {e}")
            return self._create_fallback_face_model()
    
    def _create_fallback_image_model(self) -> Dict[str, Any]:
        """Create fallback image manipulation detection model"""
        return {
            "type": "fallback_image_manipulation",
            "version": "1.0.0",
            "capabilities": ["edge_analysis", "noise_detection"],
            "confidence_threshold": 0.7
        }
    
    def _create_fallback_video_model(self) -> Dict[str, Any]:
        """Create fallback video deepfake detection model"""
        return {
            "type": "fallback_video_deepfake",
            "version": "1.0.0",
            "capabilities": ["frame_consistency", "temporal_analysis"],
            "confidence_threshold": 0.75
        }
    
    def _create_fallback_document_model(self) -> Dict[str, Any]:
        """Create fallback document authenticity model"""
        return {
            "type": "fallback_document_authenticity",
            "version": "1.0.0",
            "capabilities": ["metadata_analysis", "structure_analysis"],
            "confidence_threshold": 0.8
        }
    
    def _create_fallback_audio_model(self) -> Dict[str, Any]:
        """Create fallback audio voice identification model"""
        return {
            "type": "fallback_audio_voice",
            "version": "1.0.0",
            "capabilities": ["spectral_analysis", "voice_characteristics"],
            "confidence_threshold": 0.7
        }
    
    def _create_fallback_object_model(self) -> Dict[str, Any]:
        """Create fallback object detection model"""
        return {
            "type": "fallback_object_detection",
            "version": "1.0.0",
            "capabilities": ["basic_detection"],
            "confidence_threshold": 0.5
        }
    
    def _create_fallback_face_model(self) -> Dict[str, Any]:
        """Create fallback face detection model"""
        return {
            "type": "fallback_face_detection",
            "version": "1.0.0",
            "capabilities": ["basic_face_detection"],
            "confidence_threshold": 0.6
        }
    
    async def _add_to_cache(self, model_name: str, model: Any):
        """Add model to cache with LRU eviction"""
        try:
            # If cache is full, remove oldest entry
            if len(self.model_cache) >= self.cache_size:
                # Remove first (oldest) entry
                oldest_key = next(iter(self.model_cache))
                del self.model_cache[oldest_key]
                logger.debug(f"Evicted model {oldest_key} from cache")
            
            # Add new model to cache
            self.model_cache[model_name] = model
            logger.debug(f"Added model {model_name} to cache")
            
        except Exception as e:
            logger.error(f"Failed to add model {model_name} to cache: {e}")
    
    async def preload_models(self, model_names: list = None):
        """Preload commonly used models"""
        try:
            if model_names is None:
                model_names = [
                    "image_manipulation_detector",
                    "video_deepfake_detector",
                    "document_authenticity_verifier",
                    "audio_voice_identifier"
                ]
            
            logger.info("Preloading AI models...")
            
            # Load models in parallel
            tasks = [self.get_model(name) for name in model_names]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            loaded_count = sum(1 for result in results if result is not None and not isinstance(result, Exception))
            logger.info(f"Preloaded {loaded_count}/{len(model_names)} models")
            
        except Exception as e:
            logger.error(f"Failed to preload models: {e}")
    
    async def get_model_info(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get information about a model"""
        try:
            model = await self.get_model(model_name)
            if model:
                if isinstance(model, dict):
                    return model
                else:
                    return {
                        "type": type(model).__name__,
                        "version": "1.0.0",
                        "loaded": True
                    }
            return None
            
        except Exception as e:
            logger.error(f"Failed to get model info for {model_name}: {e}")
            return None
    
    async def clear_cache(self):
        """Clear model cache"""
        try:
            self.model_cache.clear()
            logger.info("Model cache cleared")
            
        except Exception as e:
            logger.error(f"Failed to clear model cache: {e}")


# Global model manager instance
_model_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """Get global model manager instance"""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager


async def initialize_models():
    """Initialize and preload models"""
    try:
        manager = get_model_manager()
        await manager.preload_models()
        logger.info("AI models initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")


# Export the model manager
__all__ = ["ModelManager", "get_model_manager", "initialize_models"]