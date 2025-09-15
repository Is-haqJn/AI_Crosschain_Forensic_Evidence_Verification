"""
API package initialization
"""

from .analysis_router import analysis_router
from .health_router import health_router

from fastapi import APIRouter

# Create main API router
api_router = APIRouter()

# Include sub-routers
api_router.include_router(
    analysis_router,
    prefix="/analysis",
    tags=["analysis"]
)

api_router.include_router(
    health_router,
    prefix="/health",
    tags=["health"]
)

__all__ = ["api_router"]