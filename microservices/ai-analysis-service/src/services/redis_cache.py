"""
Redis Cache Service
Handles Redis operations for caching and session management
"""

import json
import asyncio
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import redis.asyncio as redis
from loguru import logger

from ..config import get_settings

settings = get_settings()


class RedisCacheService:
    """Redis cache service for managing cached data and sessions"""
    
    def __init__(self):
        self.redis_client = None
        self._connected = False
        self._initializing = False

    @property
    def is_ready(self) -> bool:
        """Check if Redis is ready, initializing if necessary"""
        if not self._connected and not self._initializing:
            try:
                self._initialize_sync()
            except Exception as e:
                logger.warning(f"Auto-initialization failed: {e}")
        return self._connected

    def _initialize_sync(self):
        """Initialize Redis synchronously"""
        if self._initializing:
            return

        self._initializing = True
        try:
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Running in an async context, schedule initialization
                    loop.create_task(self._auto_initialize())
                else:
                    # Not in async context, initialize synchronously
                    loop.run_until_complete(self._auto_initialize())
            except RuntimeError:
                # No event loop, create one for initialization
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._auto_initialize())
        finally:
            self._initializing = False

    async def _auto_initialize(self):
        """Auto-initialize the service"""
        if self._initializing:
            return

        self._initializing = True
        try:
            await self.initialize()
        finally:
            self._initializing = False

    async def initialize(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                decode_responses=True
            )
            
            # Test connection
            await self.redis_client.ping()
            self._connected = True
            logger.info("Redis connection established")
            
        except Exception as e:
            logger.error(f"Failed to initialize Redis: {e}")
            raise
    
    async def close(self):
        """Close Redis connection"""
        try:
            if self.redis_client:
                await self.redis_client.close()
            self._connected = False
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key-value pair with optional TTL"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            # Serialize value if it's not a string
            if not isinstance(value, str):
                value = json.dumps(value, default=str)
            
            # Use default TTL if not specified
            if ttl is None:
                ttl = settings.REDIS_TTL
            
            await self.redis_client.setex(key, ttl, value)
            return True
            
        except Exception as e:
            logger.error(f"Error setting Redis key {key}: {e}")
            return False
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value by key"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            value = await self.redis_client.get(key)
            if value is None:
                return None
            
            # Try to deserialize JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
                
        except Exception as e:
            logger.error(f"Error getting Redis key {key}: {e}")
            return None
    
    async def delete(self, key: str) -> bool:
        """Delete a key"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            result = await self.redis_client.delete(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"Error deleting Redis key {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if a key exists"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            result = await self.redis_client.exists(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"Error checking Redis key {key}: {e}")
            return False
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration for a key"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            result = await self.redis_client.expire(key, ttl)
            return result
            
        except Exception as e:
            logger.error(f"Error setting expiration for Redis key {key}: {e}")
            return False
    
    async def ttl(self, key: str) -> int:
        """Get TTL for a key"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            return await self.redis_client.ttl(key)
            
        except Exception as e:
            logger.error(f"Error getting TTL for Redis key {key}: {e}")
            return -1
    
    # Analysis-specific methods
    
    async def cache_analysis_status(self, analysis_id: str, status: str, 
                                  metadata: Optional[Dict] = None) -> bool:
        """Cache analysis status"""
        try:
            key = f"analysis:status:{analysis_id}"
            data = {
                'status': status,
                'timestamp': datetime.utcnow().isoformat(),
                'metadata': metadata or {}
            }
            return await self.set(key, data, ttl=3600)  # 1 hour TTL
            
        except Exception as e:
            logger.error(f"Error caching analysis status: {e}")
            return False
    
    async def get_analysis_status(self, analysis_id: str) -> Optional[Dict]:
        """Get cached analysis status"""
        try:
            key = f"analysis:status:{analysis_id}"
            return await self.get(key)
        except Exception as e:
            logger.error(f"Error getting analysis status: {e}")
            return None
    
    async def cache_analysis_result(self, analysis_id: str, result: Dict[str, Any]) -> bool:
        """Cache analysis result"""
        try:
            key = f"analysis:result:{analysis_id}"
            return await self.set(key, result, ttl=7200)  # 2 hours TTL
        except Exception as e:
            logger.error(f"Error caching analysis result: {e}")
            return False
    
    async def get_analysis_result(self, analysis_id: str) -> Optional[Dict]:
        """Get cached analysis result"""
        try:
            key = f"analysis:result:{analysis_id}"
            return await self.get(key)
        except Exception as e:
            logger.error(f"Error getting analysis result: {e}")
            return None
    
    async def cache_model_prediction(self, model_name: str, input_hash: str, 
                                   prediction: Any) -> bool:
        """Cache model prediction"""
        try:
            key = f"model:prediction:{model_name}:{input_hash}"
            return await self.set(key, prediction, ttl=1800)  # 30 minutes TTL
        except Exception as e:
            logger.error(f"Error caching model prediction: {e}")
            return False
    
    async def get_model_prediction(self, model_name: str, input_hash: str) -> Optional[Any]:
        """Get cached model prediction"""
        try:
            key = f"model:prediction:{model_name}:{input_hash}"
            return await self.get(key)
        except Exception as e:
            logger.error(f"Error getting model prediction: {e}")
            return None
    
    async def cache_file_metadata(self, file_hash: str, metadata: Dict[str, Any]) -> bool:
        """Cache file metadata"""
        try:
            key = f"file:metadata:{file_hash}"
            return await self.set(key, metadata, ttl=86400)  # 24 hours TTL
        except Exception as e:
            logger.error(f"Error caching file metadata: {e}")
            return False
    
    async def get_file_metadata(self, file_hash: str) -> Optional[Dict]:
        """Get cached file metadata"""
        try:
            key = f"file:metadata:{file_hash}"
            return await self.get(key)
        except Exception as e:
            logger.error(f"Error getting file metadata: {e}")
            return None
    
    # Queue management methods
    
    async def add_to_queue(self, queue_name: str, item: Any, priority: int = 0) -> bool:
        """Add item to priority queue"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            # Use sorted set for priority queue
            score = priority * 1000000 + int(datetime.utcnow().timestamp())
            item_data = json.dumps(item, default=str)
            
            await self.redis_client.zadd(queue_name, {item_data: score})
            return True
            
        except Exception as e:
            logger.error(f"Error adding to queue {queue_name}: {e}")
            return False
    
    async def get_from_queue(self, queue_name: str, timeout: int = 0) -> Optional[Any]:
        """Get item from priority queue"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            # Get highest priority item
            result = await self.redis_client.zpopmax(queue_name, count=1)
            if not result:
                return None
            
            item_data = result[0][0]
            return json.loads(item_data)
            
        except Exception as e:
            logger.error(f"Error getting from queue {queue_name}: {e}")
            return None
    
    async def get_queue_size(self, queue_name: str) -> int:
        """Get queue size"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            return await self.redis_client.zcard(queue_name)
            
        except Exception as e:
            logger.error(f"Error getting queue size {queue_name}: {e}")
            return 0
    
    # Session management methods
    
    async def create_session(self, session_id: str, user_data: Dict[str, Any]) -> bool:
        """Create user session"""
        try:
            key = f"session:{session_id}"
            data = {
                'user_data': user_data,
                'created_at': datetime.utcnow().isoformat(),
                'last_activity': datetime.utcnow().isoformat()
            }
            return await self.set(key, data, ttl=3600)  # 1 hour TTL
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return False
    
    async def get_session(self, session_id: str) -> Optional[Dict]:
        """Get user session"""
        try:
            key = f"session:{session_id}"
            return await self.get(key)
        except Exception as e:
            logger.error(f"Error getting session: {e}")
            return None
    
    async def update_session_activity(self, session_id: str) -> bool:
        """Update session last activity"""
        try:
            key = f"session:{session_id}"
            session_data = await self.get(key)
            if session_data:
                session_data['last_activity'] = datetime.utcnow().isoformat()
                return await self.set(key, session_data, ttl=3600)
            return False
            
        except Exception as e:
            logger.error(f"Error updating session activity: {e}")
            return False
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete user session"""
        try:
            key = f"session:{session_id}"
            return await self.delete(key)
        except Exception as e:
            logger.error(f"Error deleting session: {e}")
            return False
    
    # Statistics and monitoring
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            info = await self.redis_client.info()
            return {
                'connected_clients': info.get('connected_clients', 0),
                'used_memory': info.get('used_memory_human', '0B'),
                'total_commands_processed': info.get('total_commands_processed', 0),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {}
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions"""
        try:
            if not self._connected:
                raise RuntimeError("Redis not initialized")
            
            # Get all session keys
            session_keys = await self.redis_client.keys("session:*")
            expired_count = 0
            
            for key in session_keys:
                ttl = await self.ttl(key)
                if ttl == -1:  # No expiration set
                    await self.delete(key)
                    expired_count += 1
                elif ttl == -2:  # Key doesn't exist
                    expired_count += 1
            
            logger.info(f"Cleaned up {expired_count} expired sessions")
            return expired_count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired sessions: {e}")
            return 0


# Global Redis cache service instance
redis_cache = RedisCacheService()