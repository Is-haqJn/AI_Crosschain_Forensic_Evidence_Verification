"""
Pydantic schemas for AI analysis service
Defines request/response models and data structures
"""

from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, validator


class AnalysisType(str, Enum):
    """Supported analysis types"""
    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"
    AUDIO = "audio"


class AnalysisStatusEnum(str, Enum):
    """Analysis status states"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Priority(int, Enum):
    """Analysis priority levels"""
    LOW = 1
    NORMAL = 3
    HIGH = 5
    URGENT = 8
    CRITICAL = 10


class AnalysisRequest(BaseModel):
    """Analysis request model"""
    analysis_id: str = Field(..., description="Unique analysis identifier")
    evidence_id: str = Field(..., description="Evidence identifier")
    analysis_type: AnalysisType = Field(..., description="Type of analysis to perform")
    file_name: str = Field(..., description="Original file name")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    priority: Priority = Field(Priority.NORMAL, description="Analysis priority")
    metadata: Optional[str] = Field(None, description="Additional metadata as JSON string")
    user_id: str = Field(..., description="User who requested the analysis")
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True


class AnalysisResponse(BaseModel):
    """Analysis submission response"""
    analysis_id: str
    evidence_id: str
    status: AnalysisStatusEnum = AnalysisStatusEnum.PENDING
    message: str = "Analysis submitted successfully"
    estimated_completion: Optional[datetime] = None
    priority: Priority
    
    class Config:
        use_enum_values = True


class AnalysisStatus(BaseModel):
    """Analysis status model"""
    analysis_id: str
    evidence_id: str
    status: AnalysisStatusEnum
    progress: int = Field(0, ge=0, le=100, description="Progress percentage")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    error_message: Optional[str] = None
    processing_node: Optional[str] = None
    
    class Config:
        use_enum_values = True


# Base result class
class BaseAnalysisResult(BaseModel):
    """Base analysis result model"""
    analysis_id: str
    evidence_id: str
    analysis_type: AnalysisType
    confidence_score: float = Field(ge=0.0, le=1.0)
    processing_time: float = Field(description="Processing time in seconds")
    model_version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        use_enum_values = True


# Image Analysis Results
class ImageManipulationResult(BaseModel):
    """Image manipulation detection result"""
    is_manipulated: bool
    manipulation_type: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    affected_regions: List[Dict[str, Any]] = Field(default_factory=list)


class ImageSimilarityResult(BaseModel):
    """Image similarity analysis result"""
    similar_images: List[Dict[str, Any]] = Field(default_factory=list)
    similarity_score: float = Field(ge=0.0, le=1.0)
    hash_matches: List[str] = Field(default_factory=list)


class ImageExifData(BaseModel):
    """EXIF metadata analysis"""
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    date_taken: Optional[datetime] = None
    gps_coordinates: Optional[Dict[str, float]] = None
    software_used: Optional[str] = None
    is_modified: bool = False
    metadata_analysis: Dict[str, Any] = Field(default_factory=dict)


class ImageAnalysisResult(BaseAnalysisResult):
    """Complete image analysis result"""
    analysis_type: AnalysisType = AnalysisType.IMAGE
    manipulation_detection: ImageManipulationResult
    similarity_analysis: ImageSimilarityResult
    exif_analysis: ImageExifData
    detected_objects: List[Dict[str, Any]] = Field(default_factory=list)
    detected_faces: List[Dict[str, Any]] = Field(default_factory=list)
    image_quality_score: float = Field(ge=0.0, le=1.0)
    technical_metadata: Dict[str, Any] = Field(default_factory=dict)


# Video Analysis Results
class DeepfakeDetectionResult(BaseModel):
    """Deepfake detection result"""
    is_deepfake: bool
    confidence: float = Field(ge=0.0, le=1.0)
    detection_method: str
    frame_analysis: List[Dict[str, Any]] = Field(default_factory=list)
    temporal_inconsistencies: List[Dict[str, Any]] = Field(default_factory=list)


class VideoTechnicalAnalysis(BaseModel):
    """Video technical analysis"""
    duration: float
    frame_rate: float
    resolution: str
    codec: str
    bitrate: int
    audio_channels: int
    is_edited: bool
    edit_points: List[float] = Field(default_factory=list)


class VideoAnalysisResult(BaseAnalysisResult):
    """Complete video analysis result"""
    analysis_type: AnalysisType = AnalysisType.VIDEO
    deepfake_detection: DeepfakeDetectionResult
    technical_analysis: VideoTechnicalAnalysis
    frame_samples: List[Dict[str, Any]] = Field(default_factory=list)
    motion_analysis: Dict[str, Any] = Field(default_factory=dict)
    face_tracking: List[Dict[str, Any]] = Field(default_factory=list)
    audio_analysis: Dict[str, Any] = Field(default_factory=dict)


# Document Analysis Results
class DocumentAuthenticityResult(BaseModel):
    """Document authenticity analysis"""
    is_authentic: bool
    confidence: float = Field(ge=0.0, le=1.0)
    forgery_indicators: List[str] = Field(default_factory=list)
    digital_signatures: List[Dict[str, Any]] = Field(default_factory=list)
    creation_software: Optional[str] = None


class DocumentContentAnalysis(BaseModel):
    """Document content analysis"""
    text_content: str
    language: str
    word_count: int
    character_count: int
    readability_score: float
    sensitive_information: List[str] = Field(default_factory=list)
    classification: str


class DocumentAnalysisResult(BaseAnalysisResult):
    """Complete document analysis result"""
    analysis_type: AnalysisType = AnalysisType.DOCUMENT
    authenticity_analysis: DocumentAuthenticityResult
    content_analysis: DocumentContentAnalysis
    metadata_analysis: Dict[str, Any] = Field(default_factory=dict)
    structure_analysis: Dict[str, Any] = Field(default_factory=dict)
    plagiarism_check: Dict[str, Any] = Field(default_factory=dict)


# Audio Analysis Results
class VoiceIdentificationResult(BaseModel):
    """Voice identification result"""
    speaker_id: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    voice_characteristics: Dict[str, Any] = Field(default_factory=dict)
    comparison_results: List[Dict[str, Any]] = Field(default_factory=list)


class AudioAuthenticityResult(BaseModel):
    """Audio authenticity analysis"""
    is_authentic: bool
    confidence: float = Field(ge=0.0, le=1.0)
    tampering_indicators: List[str] = Field(default_factory=list)
    splicing_detection: List[Dict[str, Any]] = Field(default_factory=list)


class AudioAnalysisResult(BaseAnalysisResult):
    """Complete audio analysis result"""
    analysis_type: AnalysisType = AnalysisType.AUDIO
    voice_identification: VoiceIdentificationResult
    authenticity_analysis: AudioAuthenticityResult
    technical_analysis: Dict[str, Any] = Field(default_factory=dict)
    transcription: Optional[str] = None
    noise_analysis: Dict[str, Any] = Field(default_factory=dict)
    spectrum_analysis: Dict[str, Any] = Field(default_factory=dict)


# Union type for all analysis results
AnalysisResult = Union[
    ImageAnalysisResult,
    VideoAnalysisResult,
    DocumentAnalysisResult,
    AudioAnalysisResult
]


class BatchAnalysisRequest(BaseModel):
    """Batch analysis request"""
    analyses: List[AnalysisRequest]
    batch_id: str = Field(..., description="Unique batch identifier")
    priority: Priority = Field(Priority.NORMAL)
    
    @validator('analyses')
    def validate_analyses_not_empty(cls, v):
        if not v:
            raise ValueError('Analyses list cannot be empty')
        if len(v) > 100:  # Reasonable batch size limit
            raise ValueError('Batch size cannot exceed 100 analyses')
        return v


class BatchAnalysisResponse(BaseModel):
    """Batch analysis response"""
    batch_id: str
    total_analyses: int
    submitted_analyses: int
    failed_submissions: List[Dict[str, str]] = Field(default_factory=list)
    estimated_completion: Optional[datetime] = None


class QueueStatus(BaseModel):
    """Analysis queue status"""
    total_pending: int
    total_processing: int
    total_completed: int
    total_failed: int
    average_wait_time: float
    average_processing_time: float
    queue_by_type: Dict[str, int] = Field(default_factory=dict)
    queue_by_priority: Dict[str, int] = Field(default_factory=dict)
    active_workers: int
    system_load: float


class AnalysisHistory(BaseModel):
    """Analysis history entry"""
    analysis_id: str
    evidence_id: str
    analysis_type: AnalysisType
    status: AnalysisStatusEnum
    submitted_at: datetime
    completed_at: Optional[datetime] = None
    processing_time: Optional[float] = None
    user_id: str
    priority: Priority
    
    class Config:
        use_enum_values = True


class AnalysisStatistics(BaseModel):
    """Analysis statistics"""
    total_analyses: int
    analyses_by_type: Dict[str, int]
    analyses_by_status: Dict[str, int]
    average_processing_times: Dict[str, float]
    success_rate: float
    most_common_errors: List[Dict[str, Any]]
    performance_trends: Dict[str, Any] = Field(default_factory=dict)