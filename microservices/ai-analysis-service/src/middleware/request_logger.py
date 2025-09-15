"""
Request Logger Middleware
Provides comprehensive request logging and monitoring
"""

import time
import uuid
from typing import Callable
from fastapi import Request, Response
from loguru import logger
import json


class RequestLoggerMiddleware:
    """Middleware for logging requests and responses"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        request = Request(scope, receive)
        
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Log request start
        start_time = time.time()
        await self._log_request_start(request, request_id)
        
        # Process the request
        response_sent = False
        
        async def send_wrapper(message):
            nonlocal response_sent
            if not response_sent:
                response_sent = True
                processing_time = time.time() - start_time
                await self._log_request_end(request, request_id, processing_time, message)
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            processing_time = time.time() - start_time
            await self._log_request_error(request, request_id, processing_time, e)
            raise
    
    async def _log_request_start(self, request: Request, request_id: str):
        """Log request start"""
        try:
            # Get client IP
            client_ip = request.client.host if request.client else "unknown"
            
            # Get user agent
            user_agent = request.headers.get("user-agent", "unknown")
            
            # Get content type
            content_type = request.headers.get("content-type", "unknown")
            
            # Get content length
            content_length = request.headers.get("content-length", "0")
            
            # Log request details
            logger.info(
                f"Request Start - ID: {request_id} - "
                f"Method: {request.method} - "
                f"Path: {request.url.path} - "
                f"Client IP: {client_ip} - "
                f"User Agent: {user_agent[:100]} - "
                f"Content Type: {content_type} - "
                f"Content Length: {content_length}"
            )
            
            # Log query parameters if present
            if request.query_params:
                logger.debug(
                    f"Request Query Params - ID: {request_id} - "
                    f"Params: {dict(request.query_params)}"
                )
            
            # Log headers (excluding sensitive ones)
            sensitive_headers = {"authorization", "cookie", "x-api-key"}
            headers = {
                k: v for k, v in request.headers.items()
                if k.lower() not in sensitive_headers
            }
            
            if headers:
                logger.debug(
                    f"Request Headers - ID: {request_id} - "
                    f"Headers: {headers}"
                )
                
        except Exception as e:
            logger.error(f"Error logging request start: {e}")
    
    async def _log_request_end(self, request: Request, request_id: str, processing_time: float, message: dict):
        """Log request completion"""
        try:
            # Extract response information
            status_code = message.get("status", 500)
            response_type = message.get("type", "http.response.body")
            
            # Log request completion
            logger.info(
                f"Request Complete - ID: {request_id} - "
                f"Method: {request.method} - "
                f"Path: {request.url.path} - "
                f"Status: {status_code} - "
                f"Processing Time: {processing_time:.3f}s"
            )
            
            # Log slow requests
            if processing_time > 5.0:
                logger.warning(
                    f"Slow Request - ID: {request_id} - "
                    f"Processing Time: {processing_time:.3f}s - "
                    f"Path: {request.url.path}"
                )
            
            # Log error responses
            if status_code >= 400:
                logger.warning(
                    f"Error Response - ID: {request_id} - "
                    f"Status: {status_code} - "
                    f"Path: {request.url.path} - "
                    f"Processing Time: {processing_time:.3f}s"
                )
                
        except Exception as e:
            logger.error(f"Error logging request end: {e}")
    
    async def _log_request_error(self, request: Request, request_id: str, processing_time: float, error: Exception):
        """Log request errors"""
        try:
            logger.error(
                f"Request Error - ID: {request_id} - "
                f"Method: {request.method} - "
                f"Path: {request.url.path} - "
                f"Error: {str(error)} - "
                f"Processing Time: {processing_time:.3f}s"
            )
            
        except Exception as e:
            logger.error(f"Error logging request error: {e}")