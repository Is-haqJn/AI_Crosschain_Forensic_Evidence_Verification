"""
Error Handler Middleware
Provides comprehensive error handling and logging
"""

import traceback
from typing import Callable
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from loguru import logger
import time


class ErrorHandlerMiddleware:
    """Middleware for handling errors and exceptions"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        request = Request(scope, receive)
        start_time = time.time()
        
        try:
            # Process the request
            await self.app(scope, receive, send)
            
        except HTTPException as e:
            # Handle FastAPI HTTP exceptions
            await self._handle_http_exception(e, request, start_time)
            
        except RequestValidationError as e:
            # Handle request validation errors
            await self._handle_validation_error(e, request, start_time)
            
        except StarletteHTTPException as e:
            # Handle Starlette HTTP exceptions
            await self._handle_starlette_http_exception(e, request, start_time)
            
        except Exception as e:
            # Handle unexpected errors
            await self._handle_unexpected_error(e, request, start_time)
    
    async def _handle_http_exception(self, exc: HTTPException, request: Request, start_time: float):
        """Handle FastAPI HTTP exceptions"""
        processing_time = time.time() - start_time
        
        error_response = {
            "error": {
                "type": "HTTPException",
                "status_code": exc.status_code,
                "detail": exc.detail,
                "timestamp": time.time(),
                "path": str(request.url),
                "method": request.method,
                "processing_time": processing_time
            }
        }
        
        logger.warning(
            f"HTTP Exception: {exc.status_code} - {exc.detail} - "
            f"Path: {request.url} - Method: {request.method} - "
            f"Processing time: {processing_time:.3f}s"
        )
        
        response = JSONResponse(
            status_code=exc.status_code,
            content=error_response
        )
        
        await response(scope=request.scope, receive=request.receive, send=request.send)
    
    async def _handle_validation_error(self, exc: RequestValidationError, request: Request, start_time: float):
        """Handle request validation errors"""
        processing_time = time.time() - start_time
        
        error_response = {
            "error": {
                "type": "ValidationError",
                "status_code": 422,
                "detail": "Request validation failed",
                "errors": exc.errors(),
                "timestamp": time.time(),
                "path": str(request.url),
                "method": request.method,
                "processing_time": processing_time
            }
        }
        
        logger.warning(
            f"Validation Error: {exc.errors()} - "
            f"Path: {request.url} - Method: {request.method} - "
            f"Processing time: {processing_time:.3f}s"
        )
        
        response = JSONResponse(
            status_code=422,
            content=error_response
        )
        
        await response(scope=request.scope, receive=request.receive, send=request.send)
    
    async def _handle_starlette_http_exception(self, exc: StarletteHTTPException, request: Request, start_time: float):
        """Handle Starlette HTTP exceptions"""
        processing_time = time.time() - start_time
        
        error_response = {
            "error": {
                "type": "StarletteHTTPException",
                "status_code": exc.status_code,
                "detail": exc.detail,
                "timestamp": time.time(),
                "path": str(request.url),
                "method": request.method,
                "processing_time": processing_time
            }
        }
        
        logger.warning(
            f"Starlette HTTP Exception: {exc.status_code} - {exc.detail} - "
            f"Path: {request.url} - Method: {request.method} - "
            f"Processing time: {processing_time:.3f}s"
        )
        
        response = JSONResponse(
            status_code=exc.status_code,
            content=error_response
        )
        
        await response(scope=request.scope, receive=request.receive, send=request.send)
    
    async def _handle_unexpected_error(self, exc: Exception, request: Request, start_time: float):
        """Handle unexpected errors"""
        processing_time = time.time() - start_time
        
        # Log the full traceback
        logger.error(
            f"Unexpected Error: {str(exc)} - "
            f"Path: {request.url} - Method: {request.method} - "
            f"Processing time: {processing_time:.3f}s - "
            f"Traceback: {traceback.format_exc()}"
        )
        
        error_response = {
            "error": {
                "type": "InternalServerError",
                "status_code": 500,
                "detail": "An unexpected error occurred",
                "timestamp": time.time(),
                "path": str(request.url),
                "method": request.method,
                "processing_time": processing_time,
                "request_id": getattr(request.state, "request_id", None)
            }
        }
        
        response = JSONResponse(
            status_code=500,
            content=error_response
        )
        
        await response(scope=request.scope, receive=request.receive, send=request.send)