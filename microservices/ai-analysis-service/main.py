"""
AI Analysis Service
Main application entry point
"""

import os
import sys
from pathlib import Path
from typing import Optional
from datetime import datetime

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from prometheus_client import make_asgi_app

# Add src to path
sys.path.append(str(Path(__file__).parent))

from src.config import Settings, get_settings
from src.api.analysis_router import analysis_router
from src.api.health_router import health_router
from src.services.database import db_service
from src.services.message_queue import message_queue
from src.services.redis_cache import redis_cache
from src.middleware.error_handler import ErrorHandlerMiddleware
from src.middleware.request_logger import RequestLoggerMiddleware
from src.models import get_model_manager


class AIAnalysisApplication:
    """Main application class"""
    
    def __init__(self):
        self.app: Optional[FastAPI] = None
        self.settings: Settings = get_settings()
        self.model_manager = get_model_manager()
        
    def create_app(self) -> FastAPI:
        """Create and configure FastAPI application"""
        
        # Initialize FastAPI
        self.app = FastAPI(
            title="AI Analysis Service",
            description="Forensic Evidence AI Analysis Microservice",
            version="1.0.0",
            docs_url="/api/docs" if self.settings.ENABLE_DOCS else None,
            redoc_url="/api/redoc" if self.settings.ENABLE_DOCS else None,
        )
        
        # Configure logging
        self._configure_logging()
        
        # Add middleware
        self._add_middleware()
        
        # Add routes
        self._add_routes()
        
        # Add event handlers
        self._add_event_handlers()
        
        # Add Prometheus metrics endpoint
        if self.settings.ENABLE_METRICS:
            metrics_app = make_asgi_app()
            self.app.mount("/metrics", metrics_app)
        
        return self.app
    
    def _configure_logging(self):
        """Configure logging with Loguru"""
        logger.remove()
        
        # Console logging
        logger.add(
            sys.stdout,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} - {message}",
            level=self.settings.LOG_LEVEL,
            colorize=True,
        )
        
        # File logging
        if self.settings.LOG_TO_FILE:
            logger.add(
                f"logs/{self.settings.SERVICE_NAME}.log",
                rotation="500 MB",
                retention="10 days",
                format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} - {message}",
                level=self.settings.LOG_LEVEL,
            )
    
    def _add_middleware(self):
        """Add middleware to the application"""
        
        # CORS middleware
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=self.settings.get_cors_origins(),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # Trusted host middleware
        self.app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=self.settings.get_allowed_hosts(),
        )
        
        # Custom middleware
        self.app.add_middleware(ErrorHandlerMiddleware)
        self.app.add_middleware(RequestLoggerMiddleware)
    
    def _add_routes(self):
        """Add API routes"""
        
        # Simple health check endpoint (no dependencies)
        @self.app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "service": self.settings.SERVICE_NAME,
                "version": "1.0.0",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Liveness endpoint at root path for Kubernetes compatibility
        @self.app.get("/health/live")
        async def liveness_check_root():
            return {
                "alive": True,
                "service": self.settings.SERVICE_NAME,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Detailed health check with dependencies
        @self.app.get("/health/detailed")
        async def detailed_health_check():
            try:
                return {
                    "status": "healthy",
                    "service": self.settings.SERVICE_NAME,
                    "version": "1.0.0",
                    "timestamp": datetime.utcnow().isoformat(),
                    "dependencies": {
                        "database": "standalone",
                        "redis": "standalone", 
                        "message_queue": "standalone"
                    }
                }
            except Exception as e:
                logger.error(f"Detailed health check failed: {e}")
                return {
                    "status": "unhealthy",
                    "service": self.settings.SERVICE_NAME,
                    "version": "1.0.0",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }
        
        # Ready check endpoint
        @self.app.get("/ready")
        async def ready_check():
            # Check if all services are ready
            ready = True
            details = {}
            
            try:
                # Check database
                details["database"] = db_service._connected
                ready = ready and details["database"]
            except:
                details["database"] = False
                ready = False
            
            try:
                # Check Redis
                details["redis"] = redis_cache._connected
                ready = ready and details["redis"]
            except:
                details["redis"] = False
                ready = False
            
            try:
                # Check message queue
                details["message_queue"] = message_queue._connected
                ready = ready and details["message_queue"]
            except:
                details["message_queue"] = False
                ready = False
            
            return {
                "ready": ready,
                "services": details
            }
        
        # Include API routers (primary mounts)
        self.app.include_router(health_router, prefix="/api/v1")
        self.app.include_router(analysis_router, prefix="/api/v1")
        
        # Backward/forward compatible alias under /api/v1/analysis/*
        # This ensures both /api/v1/submit and /api/v1/analysis/submit work
        self.app.include_router(analysis_router, prefix="/api/v1/analysis")
    
    def _add_event_handlers(self):
        """Add startup and shutdown event handlers"""
        
        @self.app.on_event("startup")
        async def startup_event():
            logger.info(f"Starting {self.settings.SERVICE_NAME}...")

            try:
                # Force initialization of services
                db_service.is_ready
                redis_cache.is_ready
                # Initialize message queue proactively for readiness
                try:
                    await message_queue.initialize()
                except Exception as mq_err:
                    logger.warning(f"Message queue initialization failed: {mq_err}")

                # Load ML models
                await self._load_ml_models()

                logger.info(f"{self.settings.SERVICE_NAME} started successfully")
            except Exception as e:
                logger.error(f"Failed to start {self.settings.SERVICE_NAME}: {e}")
                raise
        
        @self.app.on_event("shutdown")
        async def shutdown_event():
            logger.info(f"Shutting down {self.settings.SERVICE_NAME}...")
            
            try:
                # Close connections
                await db_service.close()
                try:
                    await message_queue.close()
                except Exception as mq_close_err:
                    logger.warning(f"Message queue close failed: {mq_close_err}")
                await redis_cache.close()
                
                logger.info(f"{self.settings.SERVICE_NAME} shut down successfully")
            except Exception as e:
                logger.error(f"Error during shutdown: {e}")
    
    async def _initialize_services(self):
        """Initialize all services"""
        logger.info("Initializing services...")
        
        try:
            # Initialize database service
            await db_service.initialize()
            logger.info("Database service initialized")
            
            # Initialize Redis cache
            await redis_cache.initialize()
            logger.info("Redis cache initialized")
            
            # Initialize message queue
            await message_queue.initialize()
            logger.info("Message queue initialized")
            
        except Exception as e:
            logger.warning(f"Some services failed to initialize: {e}")
            logger.info("Continuing with available services...")
    
    async def _load_ml_models(self):
        """Load machine learning models"""
        logger.info("Loading ML models...")

        try:
            # Initialize model manager
            await self.model_manager.initialize_models()
            logger.info("AI models initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to initialize AI models: {e}")
            logger.info("Models will be loaded on-demand during analysis")

    async def _ensure_services_connected(self):
        """Ensure all services are connected, reinitializing if needed"""
        logger.info("Ensuring services are connected...")

        try:
            # Check if services are already connected
            if db_service._connected and redis_cache._connected:
                logger.info("Services already connected")
                return

            # Reinitialize services if not connected
            logger.info("Reinitializing services...")
            await db_service.initialize()
            await redis_cache.initialize()
            await message_queue.initialize()
            logger.info("Services reinitialized successfully")

        except Exception as e:
            logger.error(f"Failed to ensure services connected: {e}")
            # Don't raise - allow service to continue with limited functionality


def create_application() -> FastAPI:
    """Factory function to create the application"""
    app_instance = AIAnalysisApplication()
    return app_instance.create_app()


# Create app instance
app = create_application()


if __name__ == "__main__":
    # Run with uvicorn for development
    settings = get_settings()
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,  # Disable reloader to avoid multiprocessing issues
        log_level=settings.LOG_LEVEL.lower(),
        access_log=settings.ACCESS_LOG,
    )
