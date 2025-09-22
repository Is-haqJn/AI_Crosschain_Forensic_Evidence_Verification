"""
File Handler Utility
Handles file validation, temporary storage, and cleanup
"""

import os
import shutil
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import aiofiles
from loguru import logger

from ..config import get_settings

settings = get_settings()


class FileHandler:
    """Utility class for file handling operations"""
    
    def __init__(self):
        self.temp_dir = Path(settings.TEMP_STORAGE_PATH)
        self.max_file_age = settings.MAX_TEMP_FILE_AGE
        self._ensure_temp_dir()
    
    def _ensure_temp_dir(self):
        """Ensure temporary directory exists"""
        try:
            self.temp_dir.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Temporary directory ensured: {self.temp_dir}")
        except Exception as e:
            logger.error(f"Failed to create temp directory: {e}")
            raise
    
    async def validate_file(self, file, analysis_type: str) -> bool:
        """
        Validate uploaded file for analysis
        
        Args:
            file: Uploaded file object
            analysis_type: Type of analysis to perform
            
        Returns:
            True if file is valid, False otherwise
        """
        try:
            # Check file size
            if not await self._validate_file_size(file, analysis_type):
                return False
            
            # Check file format
            if not await self._validate_file_format(file, analysis_type):
                return False
            
            # Check file content
            if not await self._validate_file_content(file, analysis_type):
                return False
            
            logger.debug(f"File validation passed for {file.filename}")
            return True
            
        except Exception as e:
            logger.error(f"File validation failed: {e}")
            return False
    
    async def _validate_file_size(self, file, analysis_type: str) -> bool:
        """Validate file size based on analysis type"""
        try:
            # Get file size limits
            size_limits = {
                "image": settings.IMAGE_MAX_SIZE,
                "video": settings.VIDEO_MAX_SIZE,
                "document": settings.DOCUMENT_MAX_SIZE,
                "audio": settings.AUDIO_MAX_SIZE
            }
            
            max_size = size_limits.get(analysis_type, 50 * 1024 * 1024)  # Default 50MB
            
            # Check if file size is available
            if hasattr(file, 'size') and file.size:
                if file.size > max_size:
                    logger.warning(f"File {file.filename} exceeds size limit: {file.size} > {max_size}")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"File size validation failed: {e}")
            return False
    
    async def _validate_file_format(self, file, analysis_type: str) -> bool:
        """Validate file format based on analysis type"""
        try:
            # Get allowed formats
            allowed_formats = {
                "image": settings.IMAGE_ALLOWED_FORMATS,
                "video": settings.VIDEO_ALLOWED_FORMATS,
                "document": settings.DOCUMENT_ALLOWED_FORMATS,
                "audio": settings.AUDIO_ALLOWED_FORMATS
            }
            
            allowed = allowed_formats.get(analysis_type, [])
            if not allowed:
                logger.warning(f"No allowed formats defined for {analysis_type}")
                return False
            
            # Get file extension
            if not file.filename:
                logger.warning("File has no filename")
                return False
            
            file_ext = Path(file.filename).suffix.lower().lstrip('.')
            if file_ext not in allowed:
                logger.warning(f"File format {file_ext} not allowed for {analysis_type}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"File format validation failed: {e}")
            return False
    
    async def _validate_file_content(self, file, analysis_type: str) -> bool:
        """Validate file content using MIME type detection"""
        try:
            # Read first few bytes to detect MIME type
            content = await file.read(1024)
            await file.seek(0)  # Reset file pointer
            
            # Detect MIME type from filename
            mime_type, _ = mimetypes.guess_type(file.filename or "")
            
            # Get file extension as fallback
            file_ext = None
            if file.filename:
                file_ext = Path(file.filename).suffix.lower().lstrip('.')
            
            # Expected MIME types for each analysis type
            expected_mimes = {
                "image": ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/tiff"],
                "video": ["video/mp4", "video/avi", "video/quicktime", "video/x-msvideo"],
                "document": [
                    "application/pdf", 
                    "application/msword", 
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
                    "text/plain",
                    "text/html"
                ],
                "audio": ["audio/mpeg", "audio/wav", "audio/mp4", "audio/flac"]
            }
            
            # Expected file extensions as fallback
            expected_extensions = {
                "image": ["jpg", "jpeg", "png", "gif", "bmp", "tiff"],
                "video": ["mp4", "avi", "mov", "wmv", "flv", "mkv"],
                "document": ["pdf", "doc", "docx", "txt", "rtf", "xlsx", "pptx"],
                "audio": ["mp3", "wav", "m4a", "flac", "ogg"]
            }
            
            expected_mime_types = expected_mimes.get(analysis_type, [])
            expected_ext_list = expected_extensions.get(analysis_type, [])
            
            # If MIME type is None or not detected, use file extension validation
            if mime_type is None:
                if file_ext and file_ext in expected_ext_list:
                    logger.info(f"MIME type not detected, but file extension '{file_ext}' is valid for {analysis_type}")
                    return True
                else:
                    logger.warning(f"MIME type None and file extension '{file_ext}' not valid for {analysis_type}")
                    return False
            
            # If MIME type is detected, validate it
            if expected_mime_types and mime_type not in expected_mime_types:
                # Check if file extension is valid as fallback
                if file_ext and file_ext in expected_ext_list:
                    logger.info(f"MIME type {mime_type} not expected but file extension '{file_ext}' is valid for {analysis_type}")
                    return True
                else:
                    logger.warning(f"MIME type {mime_type} not expected for {analysis_type}")
                    return False
            
            logger.debug(f"File content validation passed: MIME type {mime_type}, extension {file_ext}")
            return True
            
        except Exception as e:
            logger.error(f"File content validation failed: {e}")
            return False
    
    async def save_temp_file(self, file, analysis_id: str) -> str:
        """
        Save uploaded file to temporary storage
        
        Args:
            file: Uploaded file object
            analysis_id: Unique analysis identifier
            
        Returns:
            Path to saved temporary file
        """
        try:
            # Create unique filename
            file_ext = Path(file.filename).suffix if file.filename else ".tmp"
            temp_filename = f"{analysis_id}{file_ext}"
            temp_path = self.temp_dir / temp_filename
            
            # Save file
            async with aiofiles.open(temp_path, 'wb') as temp_file:
                content = await file.read()
                await temp_file.write(content)
            
            logger.info(f"File saved to temporary storage: {temp_path}")
            return str(temp_path)
            
        except Exception as e:
            logger.error(f"Failed to save temporary file: {e}")
            raise
    
    async def cleanup_temp_file(self, file_path: str):
        """
        Clean up temporary file
        
        Args:
            file_path: Path to temporary file
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Temporary file cleaned up: {file_path}")
            
        except Exception as e:
            logger.error(f"Failed to cleanup temporary file {file_path}: {e}")
    
    async def cleanup_old_files(self):
        """Clean up old temporary files"""
        try:
            current_time = datetime.utcnow()
            cleaned_count = 0
            
            for file_path in self.temp_dir.iterdir():
                if file_path.is_file():
                    # Check file age
                    file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                    age_seconds = (current_time - file_time).total_seconds()
                    
                    if age_seconds > self.max_file_age:
                        file_path.unlink()
                        cleaned_count += 1
                        logger.debug(f"Cleaned up old file: {file_path}")
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old temporary files")
            
        except Exception as e:
            logger.error(f"Failed to cleanup old files: {e}")
    
    async def get_file_hash(self, file_path: str) -> str:
        """
        Calculate SHA-256 hash of file
        
        Args:
            file_path: Path to file
            
        Returns:
            SHA-256 hash of file
        """
        try:
            hash_sha256 = hashlib.sha256()
            
            async with aiofiles.open(file_path, 'rb') as f:
                while chunk := await f.read(8192):
                    hash_sha256.update(chunk)
            
            return hash_sha256.hexdigest()
            
        except Exception as e:
            logger.error(f"Failed to calculate file hash: {e}")
            raise
    
    async def get_file_info(self, file_path: str) -> Dict[str, Any]:
        """
        Get comprehensive file information
        
        Args:
            file_path: Path to file
            
        Returns:
            Dictionary with file information
        """
        try:
            path = Path(file_path)
            stat = path.stat()
            
            # Calculate file hash
            file_hash = await self.get_file_hash(file_path)
            
            # Detect MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            
            return {
                "filename": path.name,
                "file_path": str(path),
                "file_size": stat.st_size,
                "file_hash": file_hash,
                "mime_type": mime_type,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "extension": path.suffix.lower(),
                "is_file": path.is_file(),
                "is_readable": os.access(file_path, os.R_OK)
            }
            
        except Exception as e:
            logger.error(f"Failed to get file info: {e}")
            return {}
    
    async def validate_file_integrity(self, file_path: str, expected_hash: str = None) -> bool:
        """
        Validate file integrity using hash comparison
        
        Args:
            file_path: Path to file
            expected_hash: Expected hash value (optional)
            
        Returns:
            True if file integrity is valid
        """
        try:
            if not os.path.exists(file_path):
                return False
            
            # Calculate current hash
            current_hash = await self.get_file_hash(file_path)
            
            # Compare with expected hash if provided
            if expected_hash:
                return current_hash == expected_hash
            
            # If no expected hash, just check if file is readable
            return os.access(file_path, os.R_OK)
            
        except Exception as e:
            logger.error(f"File integrity validation failed: {e}")
            return False
    
    async def create_analysis_directory(self, analysis_id: str) -> str:
        """
        Create directory for analysis artifacts
        
        Args:
            analysis_id: Unique analysis identifier
            
        Returns:
            Path to created directory
        """
        try:
            analysis_dir = self.temp_dir / f"analysis_{analysis_id}"
            analysis_dir.mkdir(parents=True, exist_ok=True)
            
            logger.debug(f"Created analysis directory: {analysis_dir}")
            return str(analysis_dir)
            
        except Exception as e:
            logger.error(f"Failed to create analysis directory: {e}")
            raise
    
    async def cleanup_analysis_directory(self, analysis_id: str):
        """
        Clean up analysis directory and all its contents
        
        Args:
            analysis_id: Unique analysis identifier
        """
        try:
            analysis_dir = self.temp_dir / f"analysis_{analysis_id}"
            
            if analysis_dir.exists():
                shutil.rmtree(analysis_dir)
                logger.debug(f"Cleaned up analysis directory: {analysis_dir}")
            
        except Exception as e:
            logger.error(f"Failed to cleanup analysis directory: {e}")
    
    def get_temp_directory_size(self) -> int:
        """Get total size of temporary directory in bytes"""
        try:
            total_size = 0
            for file_path in self.temp_dir.rglob('*'):
                if file_path.is_file():
                    total_size += file_path.stat().st_size
            return total_size
            
        except Exception as e:
            logger.error(f"Failed to get temp directory size: {e}")
            return 0
    
    async def get_temp_directory_info(self) -> Dict[str, Any]:
        """Get information about temporary directory"""
        try:
            file_count = 0
            total_size = 0
            oldest_file = None
            newest_file = None
            
            for file_path in self.temp_dir.rglob('*'):
                if file_path.is_file():
                    file_count += 1
                    file_size = file_path.stat().st_size
                    total_size += file_size
                    
                    file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                    
                    if oldest_file is None or file_time < oldest_file:
                        oldest_file = file_time
                    
                    if newest_file is None or file_time > newest_file:
                        newest_file = file_time
            
            return {
                "directory_path": str(self.temp_dir),
                "file_count": file_count,
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "oldest_file": oldest_file.isoformat() if oldest_file else None,
                "newest_file": newest_file.isoformat() if newest_file else None,
                "max_file_age_seconds": self.max_file_age
            }
            
        except Exception as e:
            logger.error(f"Failed to get temp directory info: {e}")
            return {}


# Global file handler instance
_file_handler: Optional[FileHandler] = None


def get_file_handler() -> FileHandler:
    """Get global file handler instance"""
    global _file_handler
    if _file_handler is None:
        _file_handler = FileHandler()
    return _file_handler


# Export the file handler
__all__ = ["FileHandler", "get_file_handler"]