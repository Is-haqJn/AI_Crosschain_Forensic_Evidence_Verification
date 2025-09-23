"""
Configuration settings for AI Analysis Service
Uses Pydantic for validation and environment variable loading
"""

import os
from typing import List, Optional
from functools import lru_cache

from pydantic_settings import BaseSettings
from pydantic import validator
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Service Info
    SERVICE_NAME: str = "ai-analysis-service"
    VERSION: str = "1.0.0"
    
    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = False
    WORKERS: int = 4
    
    # Environment
    ENVIRONMENT: str = "development"
    
    # Database Configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    # Prefer dedicated AI Mongo if provided
    MONGODB_URI: str = os.getenv("MONGODB_URI_AI", os.getenv("MONGODB_URI", ""))
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    DB_POOL_TIMEOUT: int = 30
    
    # Redis Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    REDIS_TTL: int = 3600
    REDIS_MAX_CONNECTIONS: int = 50
    
    # RabbitMQ Configuration
    RABBITMQ_URL: str = os.getenv("RABBITMQ_URL", "")
    QUEUE_EVIDENCE_ANALYSIS: str = "ai.analysis"
    QUEUE_RESULTS: str = "ai.results"
    EXCHANGE_NAME: str = "evidence.exchange"

    # Evidence Service Callback URL (inside Docker network)
    EVIDENCE_SERVICE_URL: str = os.getenv("EVIDENCE_SERVICE_URL", "http://evidence-service:3001")
    
    # IPFS Configuration
    IPFS_HOST: str = os.getenv("IPFS_HOST", "localhost")
    IPFS_PORT: int = int(os.getenv("IPFS_PORT", "5001"))
    IPFS_TIMEOUT: int = 30
    
    # Security Configuration
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60
    
    # CORS Configuration  
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    ALLOWED_HOSTS: str = "*"
    
    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    LOG_TO_FILE: bool = True
    ACCESS_LOG: bool = True
    
    # Model Configuration
    MODEL_PATH: str = os.getenv("MODEL_PATH", "/app/models")
    MODEL_CACHE_SIZE: int = 5
    
    # Analysis Features
    ENABLE_IMAGE_ANALYSIS: bool = True
    ENABLE_VIDEO_ANALYSIS: bool = True
    ENABLE_DOCUMENT_ANALYSIS: bool = True
    ENABLE_AUDIO_ANALYSIS: bool = True
    
    # Image Analysis Settings
    IMAGE_MAX_SIZE: int = 50 * 1024 * 1024  # 50MB
    IMAGE_ALLOWED_FORMATS: List[str] = ["jpg", "jpeg", "png", "gif", "bmp", "tiff"]
    IMAGE_ANALYSIS_TIMEOUT: int = 60
    IMAGE_ENABLE_OBJECT_DETECTION: bool = False
    IMAGE_ENABLE_OCR: bool = True
    OCR_PREPROCESS_ENABLE: bool = False
    OCR_PREPROCESS_METHOD: str = "adaptive"  # adaptive|otsu|none
    OCR_LANGUAGE: str = os.getenv("OCR_LANGUAGE", "eng")
    
    # Video Analysis Settings
    VIDEO_MAX_SIZE: int = 500 * 1024 * 1024  # 500MB
    VIDEO_ALLOWED_FORMATS: List[str] = ["mp4", "avi", "mov", "wmv", "flv", "mkv"]
    VIDEO_ANALYSIS_TIMEOUT: int = 300
    VIDEO_FRAME_SAMPLE_RATE: int = 30  # Sample every 30th frame
    
    # Document Analysis Settings
    DOCUMENT_MAX_SIZE: int = 100 * 1024 * 1024  # 100MB
    DOCUMENT_ALLOWED_FORMATS: List[str] = ["pdf", "doc", "docx", "txt", "rtf"]
    DOCUMENT_ANALYSIS_TIMEOUT: int = 120
    
    # Audio Analysis Settings
    AUDIO_MAX_SIZE: int = 100 * 1024 * 1024  # 100MB
    AUDIO_ALLOWED_FORMATS: List[str] = ["mp3", "wav", "m4a", "flac", "ogg"]
    AUDIO_ANALYSIS_TIMEOUT: int = 120
    AUDIO_SAMPLE_RATE: int = 16000
    
    # ML Model Configurations
    # Image Forensics Model
    IMAGE_MODEL_NAME: str = "resnet50"
    IMAGE_MODEL_WEIGHTS: str = "imagenet"
    IMAGE_CONFIDENCE_THRESHOLD: float = 0.7
    
    # Video Deepfake Detection
    VIDEO_MODEL_NAME: str = "efficientnet"
    VIDEO_CONFIDENCE_THRESHOLD: float = 0.75
    
    # Document Verification
    DOCUMENT_MODEL_NAME: str = "bert-base"
    DOCUMENT_CONFIDENCE_THRESHOLD: float = 0.8
    
    # Audio Analysis
    AUDIO_MODEL_NAME: str = "wav2vec2"
    AUDIO_CONFIDENCE_THRESHOLD: float = 0.7
    
    # Processing Configuration
    MAX_CONCURRENT_ANALYSES: int = 10
    ANALYSIS_QUEUE_SIZE: int = 100
    BATCH_SIZE: int = 32
    
    # Monitoring
    ENABLE_METRICS: bool = True
    ENABLE_DOCS: bool = True
    METRICS_PORT: int = 9091
    
    # File Storage
    TEMP_STORAGE_PATH: str = "/tmp/ai-analysis"
    MAX_TEMP_FILE_AGE: int = 3600  # 1 hour
    
    @validator("ENVIRONMENT")
    def validate_environment(cls, v):
        """Validate environment value"""
        allowed = ["development", "staging", "production", "test"]
        if v not in allowed:
            raise ValueError(f"Environment must be one of {allowed}")
        return v
    
    @validator("LOG_LEVEL")
    def validate_log_level(cls, v):
        """Validate log level"""
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in allowed:
            raise ValueError(f"Log level must be one of {allowed}")
        return v.upper()
    
    def get_cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        if isinstance(self.CORS_ORIGINS, str):
            if self.CORS_ORIGINS.strip():
                return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
            else:
                return ["*"]
        return ["*"]
    
    def get_allowed_hosts(self) -> List[str]:
        """Parse allowed hosts"""
        if isinstance(self.ALLOWED_HOSTS, str):
            if self.ALLOWED_HOSTS.strip() == "*":
                return ["*"]
            return [host.strip() for host in self.ALLOWED_HOSTS.split(",")]
        return ["*"]
    
    class Config:
        """Pydantic configuration"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields instead of raising errors


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance
    Uses LRU cache to ensure settings are only loaded once
    """
    return Settings()


# Export settings instance
settings = get_settings()
