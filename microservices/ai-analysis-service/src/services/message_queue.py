"""
Message Queue Service
Handles RabbitMQ operations for asynchronous processing
"""

import json
import asyncio
from typing import Any, Optional, Dict, Callable, List
from datetime import datetime
import aio_pika
from aio_pika import Message, DeliveryMode, ExchangeType
from aio_pika.abc import AbstractIncomingMessage
from loguru import logger

from ..config import get_settings

settings = get_settings()


class MessageQueueService:
    """Message queue service for managing RabbitMQ operations"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.exchanges = {}
        self.queues = {}
        self.consumers = {}
        self._connected = False
    
    async def initialize(self):
        """Initialize RabbitMQ connection"""
        try:
            # Create connection
            self.connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
            self.channel = await self.connection.channel()
            
            # Set QoS for fair message distribution
            await self.channel.set_qos(prefetch_count=1)
            
            # Declare exchanges
            await self._declare_exchanges()
            
            # Declare queues
            await self._declare_queues()
            
            self._connected = True
            logger.info("RabbitMQ connection established")
            
        except Exception as e:
            logger.error(f"Failed to initialize RabbitMQ: {e}")
            raise
    
    async def _declare_exchanges(self):
        """Declare required exchanges"""
        try:
            # Analysis exchange for analysis tasks
            self.exchanges['analysis'] = await self.channel.declare_exchange(
                'analysis.exchange',
                ExchangeType.DIRECT,
                durable=True
            )
            
            # Results exchange for analysis results
            self.exchanges['results'] = await self.channel.declare_exchange(
                'results.exchange',
                ExchangeType.DIRECT,
                durable=True
            )
            
            # Dead letter exchange for failed messages
            self.exchanges['dlx'] = await self.channel.declare_exchange(
                'dlx.exchange',
                ExchangeType.DIRECT,
                durable=True
            )
            
            logger.info("Exchanges declared successfully")
            
        except Exception as e:
            logger.error(f"Error declaring exchanges: {e}")
            raise
    
    async def _declare_queues(self):
        """Declare required queues"""
        try:
            # Analysis queues
            self.queues['image_analysis'] = await self.channel.declare_queue(
                'image.analysis.queue',
                durable=True,
                arguments={
                    'x-dead-letter-exchange': 'dlx.exchange',
                    'x-dead-letter-routing-key': 'image.analysis.failed'
                }
            )
            
            self.queues['video_analysis'] = await self.channel.declare_queue(
                'video.analysis.queue',
                durable=True,
                arguments={
                    'x-dead-letter-exchange': 'dlx.exchange',
                    'x-dead-letter-routing-key': 'video.analysis.failed'
                }
            )
            
            self.queues['document_analysis'] = await self.channel.declare_queue(
                'document.analysis.queue',
                durable=True,
                arguments={
                    'x-dead-letter-exchange': 'dlx.exchange',
                    'x-dead-letter-routing-key': 'document.analysis.failed'
                }
            )
            
            self.queues['audio_analysis'] = await self.channel.declare_queue(
                'audio.analysis.queue',
                durable=True,
                arguments={
                    'x-dead-letter-exchange': 'dlx.exchange',
                    'x-dead-letter-routing-key': 'audio.analysis.failed'
                }
            )
            
            # Results queue
            self.queues['results'] = await self.channel.declare_queue(
                'analysis.results.queue',
                durable=True
            )
            
            # Dead letter queues
            self.queues['dlq'] = await self.channel.declare_queue(
                'dead.letter.queue',
                durable=True
            )
            
            # Bind queues to exchanges
            await self._bind_queues()
            
            logger.info("Queues declared successfully")
            
        except Exception as e:
            logger.error(f"Error declaring queues: {e}")
            raise
    
    async def _bind_queues(self):
        """Bind queues to exchanges"""
        try:
            # Bind analysis queues
            await self.queues['image_analysis'].bind(
                self.exchanges['analysis'],
                routing_key='image.analysis'
            )
            
            await self.queues['video_analysis'].bind(
                self.exchanges['analysis'],
                routing_key='video.analysis'
            )
            
            await self.queues['document_analysis'].bind(
                self.exchanges['analysis'],
                routing_key='document.analysis'
            )
            
            await self.queues['audio_analysis'].bind(
                self.exchanges['analysis'],
                routing_key='audio.analysis'
            )
            
            # Bind results queue
            await self.queues['results'].bind(
                self.exchanges['results'],
                routing_key='analysis.results'
            )
            
            # Bind dead letter queue
            await self.queues['dlq'].bind(
                self.exchanges['dlx'],
                routing_key='*'
            )
            
            logger.info("Queues bound to exchanges successfully")
            
        except Exception as e:
            logger.error(f"Error binding queues: {e}")
            raise
    
    async def close(self):
        """Close RabbitMQ connection"""
        try:
            if self.connection and not self.connection.is_closed:
                await self.connection.close()
            self._connected = False
            logger.info("RabbitMQ connection closed")
        except Exception as e:
            logger.error(f"Error closing RabbitMQ connection: {e}")
    
    # Message publishing methods
    
    async def publish_analysis_task(self, analysis_type: str, task_data: Dict[str, Any], 
                                  priority: int = 0) -> bool:
        """Publish analysis task to queue"""
        try:
            if not self._connected:
                raise RuntimeError("RabbitMQ not initialized")
            
            # Prepare message
            message_data = {
                'task_id': task_data.get('analysis_id'),
                'analysis_type': analysis_type,
                'data': task_data,
                'priority': priority,
                'timestamp': datetime.utcnow().isoformat(),
                'retry_count': 0
            }
            
            message = Message(
                json.dumps(message_data).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                priority=priority,
                headers={
                    'task_type': analysis_type,
                    'timestamp': datetime.utcnow().isoformat()
                }
            )
            
            # Publish to analysis exchange
            routing_key = f"{analysis_type}.analysis"
            await self.exchanges['analysis'].publish(
                message,
                routing_key=routing_key
            )
            
            logger.info(f"Published {analysis_type} analysis task: {task_data.get('analysis_id')}")
            return True
            
        except Exception as e:
            logger.error(f"Error publishing analysis task: {e}")
            return False
    
    async def publish_analysis_result(self, result_data: Dict[str, Any]) -> bool:
        """Publish analysis result"""
        try:
            if not self._connected:
                raise RuntimeError("RabbitMQ not initialized")
            
            message = Message(
                json.dumps(result_data).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                headers={
                    'result_type': 'analysis_result',
                    'timestamp': datetime.utcnow().isoformat()
                }
            )
            
            await self.exchanges['results'].publish(
                message,
                routing_key='analysis.results'
            )
            
            logger.info(f"Published analysis result: {result_data.get('analysis_id')}")
            return True
            
        except Exception as e:
            logger.error(f"Error publishing analysis result: {e}")
            return False
    
    # Message consuming methods
    
    async def start_consumer(self, queue_name: str, callback: Callable, 
                           auto_ack: bool = False) -> bool:
        """Start consuming messages from a queue"""
        try:
            if not self._connected:
                raise RuntimeError("RabbitMQ not initialized")
            
            if queue_name not in self.queues:
                raise ValueError(f"Queue {queue_name} not found")
            
            queue = self.queues[queue_name]
            
            # Start consuming
            consumer_tag = await queue.consume(
                callback,
                no_ack=auto_ack
            )
            
            self.consumers[queue_name] = consumer_tag
            logger.info(f"Started consumer for queue: {queue_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error starting consumer for {queue_name}: {e}")
            return False
    
    async def stop_consumer(self, queue_name: str) -> bool:
        """Stop consuming messages from a queue"""
        try:
            if queue_name in self.consumers:
                await self.channel.basic_cancel(self.consumers[queue_name])
                del self.consumers[queue_name]
                logger.info(f"Stopped consumer for queue: {queue_name}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Error stopping consumer for {queue_name}: {e}")
            return False
    
    async def ack_message(self, message: AbstractIncomingMessage) -> bool:
        """Acknowledge a message"""
        try:
            message.ack()
            return True
        except Exception as e:
            logger.error(f"Error acknowledging message: {e}")
            return False
    
    async def nack_message(self, message: AbstractIncomingMessage, 
                         requeue: bool = False) -> bool:
        """Negative acknowledge a message"""
        try:
            message.nack(requeue=requeue)
            return True
        except Exception as e:
            logger.error(f"Error negative acknowledging message: {e}")
            return False
    
    # Queue management methods
    
    async def get_queue_info(self, queue_name: str) -> Optional[Dict[str, Any]]:
        """Get queue information"""
        try:
            if queue_name not in self.queues:
                return None
            
            queue = self.queues[queue_name]
            return {
                'name': queue.name,
                'message_count': queue.declaration_result.message_count,
                'consumer_count': queue.declaration_result.consumer_count,
                'durable': queue.durable
            }
            
        except Exception as e:
            logger.error(f"Error getting queue info for {queue_name}: {e}")
            return None
    
    async def purge_queue(self, queue_name: str) -> bool:
        """Purge all messages from a queue"""
        try:
            if queue_name not in self.queues:
                return False
            
            queue = self.queues[queue_name]
            await queue.purge()
            logger.info(f"Purged queue: {queue_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error purging queue {queue_name}: {e}")
            return False
    
    async def get_all_queue_info(self) -> Dict[str, Dict[str, Any]]:
        """Get information for all queues"""
        try:
            queue_info = {}
            for queue_name in self.queues:
                info = await self.get_queue_info(queue_name)
                if info:
                    queue_info[queue_name] = info
            return queue_info
            
        except Exception as e:
            logger.error(f"Error getting all queue info: {e}")
            return {}
    
    # Utility methods
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform health check"""
        try:
            if not self._connected or self.connection.is_closed:
                return {
                    'status': 'unhealthy',
                    'message': 'Connection not established or closed'
                }
            
            # Test by declaring a temporary queue
            temp_queue = await self.channel.declare_queue('', exclusive=True, auto_delete=True)
            await temp_queue.delete()
            
            return {
                'status': 'healthy',
                'message': 'Connection is working',
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                'status': 'unhealthy',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }
    
    async def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        try:
            if not self._connected:
                return {'status': 'disconnected'}
            
            return {
                'status': 'connected',
                'url': settings.REDIS_URL,
                'exchanges': list(self.exchanges.keys()),
                'queues': list(self.queues.keys()),
                'consumers': list(self.consumers.keys()),
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting connection info: {e}")
            return {'status': 'error', 'message': str(e)}


# Global message queue service instance
message_queue = MessageQueueService()