"""
Health Check API Router
Provides health and readiness endpoints for the AI Analysis Service
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Dict, Any
import asyncio
import psutil
import time

from ..services.database import db_service
from ..services.message_queue import message_queue
from ..services.redis_cache import redis_cache
from ..config import get_settings

health_router = APIRouter()
settings = get_settings()

# Use imported service instances directly


@health_router.get("/")
async def basic_health():
    """
    Basic health check endpoint
    Returns simple status for load balancers
    """
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.utcnow().isoformat()
    }


@health_router.get("/detailed")
async def detailed_health():
    """
    Detailed health check with dependency status
    Returns comprehensive health information
    """
    health_data = {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.ENVIRONMENT,
        "uptime": get_uptime(),
        "system": get_system_metrics(),
        "dependencies": await get_dependency_status(),
        "features": get_feature_status()
    }
    
    # Determine overall health based on dependencies
    dependency_statuses = health_data["dependencies"]
    if not all(status.get("healthy", False) for status in dependency_statuses.values()):
        health_data["status"] = "unhealthy"
    
    return health_data


@health_router.get("/ready")
async def readiness_check():
    """
    Readiness check for Kubernetes
    Returns ready status based on service dependencies
    """
    dependencies = await get_dependency_status()
    
    ready = all(status.get("healthy", False) for status in dependencies.values())
    
    return {
        "ready": ready,
        "service": settings.SERVICE_NAME,
        "timestamp": datetime.utcnow().isoformat(),
        "dependencies": dependencies
    }


@health_router.get("/live")
async def liveness_check():
    """
    Liveness check for Kubernetes
    Returns alive status of the service
    """
    return {
        "alive": True,
        "service": settings.SERVICE_NAME,
        "timestamp": datetime.utcnow().isoformat()
    }


@health_router.get("/metrics")
async def service_metrics():
    """
    Service-specific metrics for monitoring
    """
    try:
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "service": settings.SERVICE_NAME,
            "system": get_system_metrics(),
            "analysis": await get_analysis_metrics(),
            "queue": await get_queue_metrics(),
            "performance": await get_performance_metrics()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving metrics: {str(e)}")


def get_uptime() -> float:
    """Get service uptime in seconds"""
    # This is a simplified uptime calculation
    # In a real deployment, you'd track the actual start time
    return time.time() % 86400  # Seconds since midnight (placeholder)


def get_system_metrics() -> Dict[str, Any]:
    """Get current system resource metrics"""
    try:
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=1)
        disk = psutil.disk_usage('/')
        
        return {
            "cpu": {
                "usage_percent": cpu_percent,
                "count": psutil.cpu_count()
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "used": memory.used,
                "percent": memory.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": (disk.used / disk.total) * 100
            },
            "load_average": list(psutil.getloadavg()) if hasattr(psutil, 'getloadavg') else []
        }
    except Exception as e:
        return {"error": f"Failed to get system metrics: {str(e)}"}


async def get_dependency_status() -> Dict[str, Dict[str, Any]]:
    """Check status of all service dependencies"""
    dependencies = {}
    
    # For testing, return mock status
    dependencies["database"] = {
        "healthy": False, 
        "type": "PostgreSQL",
        "status": "Standalone mode - not connected",
        "last_check": datetime.utcnow().isoformat()
    }
    
    dependencies["message_queue"] = {
        "healthy": False,
        "type": "RabbitMQ", 
        "status": "Standalone mode - not connected",
        "last_check": datetime.utcnow().isoformat()
    }
    
    dependencies["redis"] = {
        "healthy": False,
        "type": "Redis",
        "status": "Standalone mode - not connected", 
        "last_check": datetime.utcnow().isoformat()
    }
    
    return dependencies


def get_feature_status() -> Dict[str, bool]:
    """Get status of enabled AI analysis features"""
    return {
        "image_analysis": settings.ENABLE_IMAGE_ANALYSIS,
        "video_analysis": settings.ENABLE_VIDEO_ANALYSIS,
        "document_analysis": settings.ENABLE_DOCUMENT_ANALYSIS,
        "audio_analysis": settings.ENABLE_AUDIO_ANALYSIS,
        "metrics": settings.ENABLE_METRICS,
        "documentation": settings.ENABLE_DOCS
    }


async def get_analysis_metrics() -> Dict[str, Any]:
    """Get analysis-specific metrics"""
    # This would typically query the database for actual metrics
    # For now, return placeholder data
    return {
        "total_analyses": 0,
        "completed_analyses": 0,
        "failed_analyses": 0,
        "pending_analyses": 0,
        "processing_analyses": 0,
        "average_processing_time": 0.0,
        "analysis_types": {
            "image": 0,
            "video": 0,
            "document": 0,
            "audio": 0
        }
    }


async def get_queue_metrics() -> Dict[str, Any]:
    """Get message queue metrics"""
    if not message_queue._connected:
        return {"error": "Message queue not initialized"}
    
    try:
        # This would get actual queue metrics from RabbitMQ
        return {
            "pending_messages": 0,
            "processing_messages": 0,
            "failed_messages": 0,
            "total_processed": 0,
            "queue_size": 0
        }
    except Exception as e:
        return {"error": f"Failed to get queue metrics: {str(e)}"}


async def get_performance_metrics() -> Dict[str, Any]:
    """Get performance-related metrics"""
    return {
        "model_load_time": 0.0,
        "average_analysis_time": {
            "image": 0.0,
            "video": 0.0,
            "document": 0.0,
            "audio": 0.0
        },
        "throughput": {
            "analyses_per_minute": 0.0,
            "analyses_per_hour": 0.0
        },
        "error_rate": 0.0,
        "cache_hit_rate": 0.0
    }