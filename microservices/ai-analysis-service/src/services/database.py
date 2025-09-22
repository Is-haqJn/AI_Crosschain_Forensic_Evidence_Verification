"""
Database Service
Handles PostgreSQL and MongoDB connections and operations
"""

import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import asyncpg
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from loguru import logger

from ..config import get_settings

settings = get_settings()


class DatabaseService:
    """Database service for managing PostgreSQL and MongoDB connections"""
    
    def __init__(self):
        self.postgres_engine = None
        self.postgres_session = None
        self.mongodb_client = None
        self.mongodb_db = None
        self._connected = False
        self._initializing = False

    @property
    def is_ready(self) -> bool:
        """Check if database is ready, initializing if necessary"""
        if not self._connected and not self._initializing:
            try:
                self._initialize_sync()
            except Exception as e:
                logger.warning(f"Auto-initialization failed: {e}")
        return self._connected

    def _initialize_sync(self):
        """Initialize database synchronously"""
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
        """Initialize database connections"""
        try:
            postgres_success = False
            mongodb_success = False
            
            # Try to initialize PostgreSQL
            try:
                await self._initialize_postgres()
                postgres_success = True
            except Exception as e:
                logger.warning(f"PostgreSQL initialization failed: {e}")
            
            # Try to initialize MongoDB
            try:
                await self._initialize_mongodb()
                mongodb_success = True
            except Exception as e:
                logger.warning(f"MongoDB initialization failed: {e}")
            
            # Set connected if at least one database is available
            self._connected = postgres_success or mongodb_success
            
            if self._connected:
                logger.info(f"Database connections initialized (PostgreSQL: {postgres_success}, MongoDB: {mongodb_success})")
            else:
                logger.warning("No database connections available - operating in standalone mode")
                
        except Exception as e:
            logger.error(f"Critical error during database initialization: {e}")
            # Don't raise the exception - allow service to continue without databases
            self._connected = False
    
    async def _initialize_postgres(self):
        """Initialize PostgreSQL connection"""
        try:
            # Check if DATABASE_URL is configured
            if not settings.DATABASE_URL or settings.DATABASE_URL == "":
                logger.warning("DATABASE_URL not configured, skipping PostgreSQL initialization")
                return
            
            # Create async engine
            self.postgres_engine = create_async_engine(
                settings.DATABASE_URL,
                pool_size=settings.DB_POOL_SIZE,
                max_overflow=settings.DB_MAX_OVERFLOW,
                pool_timeout=settings.DB_POOL_TIMEOUT,
                echo=settings.DEBUG
            )
            
            # Create session factory
            self.postgres_session = sessionmaker(
                self.postgres_engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            
            # Test connection
            async with self.postgres_engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            
            logger.info("PostgreSQL connection established")
            
        except Exception as e:
            logger.error(f"Failed to initialize PostgreSQL: {e}")
            raise
    
    async def _initialize_mongodb(self):
        """Initialize MongoDB connection"""
        try:
            # Check if MONGODB_URI is configured
            if not settings.MONGODB_URI or settings.MONGODB_URI == "":
                logger.warning("MONGODB_URI not configured, skipping MongoDB initialization")
                return
            
            self.mongodb_client = AsyncIOMotorClient(settings.MONGODB_URI)
            self.mongodb_db = self.mongodb_client.get_default_database()
            
            # Test connection
            await self.mongodb_client.admin.command('ping')
            
            logger.info("MongoDB connection established")
            
        except Exception as e:
            logger.error(f"Failed to initialize MongoDB: {e}")
            raise
    
    async def close(self):
        """Close database connections"""
        try:
            if self.postgres_engine:
                await self.postgres_engine.dispose()
            
            if self.mongodb_client:
                self.mongodb_client.close()
            
            self._connected = False
            logger.info("Database connections closed")
            
        except Exception as e:
            logger.error(f"Error closing database connections: {e}")
    
    async def get_postgres_session(self) -> AsyncSession:
        """Get PostgreSQL session"""
        if not self._connected:
            raise RuntimeError("Database not initialized")
        return self.postgres_session()
    
    async def get_mongodb_collection(self, collection_name: str):
        """Get MongoDB collection"""
        if not self._connected:
            raise RuntimeError("Database not initialized")
        return self.mongodb_db[collection_name]
    
    # PostgreSQL Operations
    
    async def execute_query(self, query: str, params: Optional[Dict] = None) -> List[Dict]:
        """Execute a PostgreSQL query"""
        try:
            async with self.get_postgres_session() as session:
                result = await session.execute(query, params or {})
                return [dict(row) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error executing PostgreSQL query: {e}")
            raise
    
    async def insert_analysis_result(self, analysis_data: Dict[str, Any]) -> str:
        """Insert analysis result into PostgreSQL"""
        try:
            query = """
                INSERT INTO analysis_results (
                    analysis_id, evidence_id, analysis_type, status,
                    confidence_score, processing_time, model_version,
                    created_at, updated_at
                ) VALUES (
                    :analysis_id, :evidence_id, :analysis_type, :status,
                    :confidence_score, :processing_time, :model_version,
                    :created_at, :updated_at
                ) RETURNING id
            """
            
            params = {
                'analysis_id': analysis_data['analysis_id'],
                'evidence_id': analysis_data['evidence_id'],
                'analysis_type': analysis_data['analysis_type'],
                'status': analysis_data['status'],
                'confidence_score': analysis_data['confidence_score'],
                'processing_time': analysis_data['processing_time'],
                'model_version': analysis_data.get('model_version', '1.0.0'),
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            async with self.get_postgres_session() as session:
                result = await session.execute(query, params)
                await session.commit()
                return result.fetchone()[0]
                
        except Exception as e:
            logger.error(f"Error inserting analysis result: {e}")
            raise
    
    async def update_analysis_status(self, analysis_id: str, status: str, 
                                   confidence_score: Optional[float] = None) -> bool:
        """Update analysis status"""
        try:
            query = """
                UPDATE analysis_results 
                SET status = :status, updated_at = :updated_at
            """
            params = {
                'analysis_id': analysis_id,
                'status': status,
                'updated_at': datetime.utcnow()
            }
            
            if confidence_score is not None:
                query += ", confidence_score = :confidence_score"
                params['confidence_score'] = confidence_score
            
            query += " WHERE analysis_id = :analysis_id"
            
            async with self.get_postgres_session() as session:
                result = await session.execute(query, params)
                await session.commit()
                return result.rowcount > 0
                
        except Exception as e:
            logger.error(f"Error updating analysis status: {e}")
            raise
    
    async def get_analysis_result(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Get analysis result by ID"""
        try:
            query = """
                SELECT * FROM analysis_results 
                WHERE analysis_id = :analysis_id
            """
            
            results = await self.execute_query(query, {'analysis_id': analysis_id})
            return results[0] if results else None
            
        except Exception as e:
            logger.error(f"Error getting analysis result: {e}")
            raise
    
    # MongoDB Operations
    
    async def store_detailed_results(self, analysis_id: str, results: Dict[str, Any]) -> bool:
        """Store detailed analysis results in MongoDB"""
        try:
            collection = await self.get_mongodb_collection('analysis_details')
            
            document = {
                'analysis_id': analysis_id,
                'results': results,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            await collection.insert_one(document)
            return True
            
        except Exception as e:
            logger.error(f"Error storing detailed results: {e}")
            raise
    
    async def get_detailed_results(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed analysis results from MongoDB"""
        try:
            collection = await self.get_mongodb_collection('analysis_details')
            result = await collection.find_one({'analysis_id': analysis_id})
            return result
            
        except Exception as e:
            logger.error(f"Error getting detailed results: {e}")
            raise
    
    async def store_model_metadata(self, model_name: str, metadata: Dict[str, Any]) -> bool:
        """Store model metadata in MongoDB"""
        try:
            collection = await self.get_mongodb_collection('model_metadata')
            
            document = {
                'model_name': model_name,
                'metadata': metadata,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            await collection.replace_one(
                {'model_name': model_name},
                document,
                upsert=True
            )
            return True
            
        except Exception as e:
            logger.error(f"Error storing model metadata: {e}")
            raise
    
    async def get_model_metadata(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get model metadata from MongoDB"""
        try:
            collection = await self.get_mongodb_collection('model_metadata')
            result = await collection.find_one({'model_name': model_name})
            return result
            
        except Exception as e:
            logger.error(f"Error getting model metadata: {e}")
            raise
    
    async def cleanup_old_results(self, days_old: int = 30) -> int:
        """Clean up old analysis results"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            # Clean PostgreSQL
            query = "DELETE FROM analysis_results WHERE created_at < :cutoff_date"
            async with self.get_postgres_session() as session:
                result = await session.execute(query, {'cutoff_date': cutoff_date})
                await session.commit()
                postgres_deleted = result.rowcount
            
            # Clean MongoDB
            collection = await self.get_mongodb_collection('analysis_details')
            mongo_result = await collection.delete_many({'created_at': {'$lt': cutoff_date}})
            mongo_deleted = mongo_result.deleted_count
            
            total_deleted = postgres_deleted + mongo_deleted
            logger.info(f"Cleaned up {total_deleted} old analysis results")
            return total_deleted
            
        except Exception as e:
            logger.error(f"Error cleaning up old results: {e}")
            raise
    
    async def get_analysis_statistics(self) -> Dict[str, Any]:
        """Get analysis statistics"""
        try:
            # PostgreSQL stats
            query = """
                SELECT 
                    COUNT(*) as total_analyses,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_analyses,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_analyses,
                    AVG(processing_time) as avg_processing_time,
                    AVG(confidence_score) as avg_confidence_score
                FROM analysis_results
            """
            
            stats = await self.execute_query(query)
            postgres_stats = stats[0] if stats else {}
            
            # MongoDB stats
            collection = await self.get_mongodb_collection('analysis_details')
            mongo_count = await collection.count_documents({})
            
            return {
                'postgres_stats': postgres_stats,
                'mongo_documents': mongo_count,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting analysis statistics: {e}")
            raise


# Global database service instance
db_service = DatabaseService()