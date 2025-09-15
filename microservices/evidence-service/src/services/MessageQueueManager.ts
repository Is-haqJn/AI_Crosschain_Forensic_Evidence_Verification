import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';

/**
 * Message Queue Manager
 * Singleton class for RabbitMQ connection and message handling
 * Implements publisher-subscriber pattern
 */
export class MessageQueueManager {
  private static instance: MessageQueueManager;
  private config: ConfigManager;
  private logger: Logger;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected: boolean = false;
  private isReconnecting: boolean = false;

  private constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
  }

  public static getInstance(): MessageQueueManager {
    if (!MessageQueueManager.instance) {
      MessageQueueManager.instance = new MessageQueueManager();
    }
    return MessageQueueManager.instance;
  }

  /**
   * Connect to RabbitMQ with retry logic
   */
  public async connect(retries: number = 5): Promise<void> {
    const rabbitmqConfig = this.config.get<any>('messageQueue.rabbitmq');

    for (let i = 0; i < retries; i++) {
      try {
        this.connection = await amqp.connect(rabbitmqConfig.url, {
          heartbeat: 60, // 60 seconds heartbeat
          connection_timeout: 60000, // 60 seconds connection timeout
        }) as any;
        this.channel = await (this.connection as any).createChannel();

        // Set up error handlers
        (this.connection as any).on('error', (error: any) => {
          this.logger.error('RabbitMQ connection error', error);
          this.isConnected = false;
          this.handleReconnection();
        });

        (this.connection as any).on('close', () => {
          this.logger.warn('RabbitMQ connection closed');
          this.isConnected = false;
          this.handleReconnection();
        });

        (this.connection as any).on('blocked', (reason: any) => {
          this.logger.warn('RabbitMQ connection blocked:', reason);
        });

        (this.connection as any).on('unblocked', () => {
          this.logger.info('RabbitMQ connection unblocked');
        });

        // Initialize exchanges and queues
        await this.initializeExchangesAndQueues();

        this.isConnected = true;
        this.logger.info('RabbitMQ connected successfully');
        return;
      } catch (error) {
        this.logger.warn(`RabbitMQ connection attempt ${i + 1} failed`, error);
        if (i === retries - 1) {
          throw new Error(`Failed to connect to RabbitMQ after ${retries} attempts`);
        }
        await this.delay(5000 * (i + 1));
      }
    }
  }

  /**
   * Initialize exchanges and queues
   */
  private async initializeExchangesAndQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const config = this.config.get<any>('messageQueue.rabbitmq');

    // Create exchanges
    for (const [_key, exchange] of Object.entries(config.exchanges)) {
      await this.channel.assertExchange(exchange as string, 'topic', {
        durable: true
      });
      this.logger.debug(`Exchange created: ${exchange}`);
    }

    // Create queues
    for (const [_key, queue] of Object.entries(config.queues)) {
      await this.channel.assertQueue(queue as string, {
        durable: true,
        arguments: {
          'x-message-ttl': 3600000, // 1 hour TTL
          'x-max-length': 10000 // Max 10000 messages
        }
      });
      this.logger.debug(`Queue created: ${queue}`);
    }

    // Bind queues to exchanges
    await this.setupBindings();
  }

  /**
   * Setup queue bindings
   */
  private async setupBindings(): Promise<void> {
    if (!this.channel) return;

    const config = this.config.get<any>('messageQueue.rabbitmq');

    // Evidence processing bindings
    await this.channel.bindQueue(
      config.queues.evidenceProcessing,
      config.exchanges.evidence,
      'evidence.#'
    );

    // AI analysis bindings
    await this.channel.bindQueue(
      config.queues.aiAnalysis,
      config.exchanges.evidence,
      'ai.#'
    );

    // Blockchain sync bindings
    await this.channel.bindQueue(
      config.queues.blockchainSync,
      config.exchanges.blockchain,
      'blockchain.#'
    );
  }

  /**
   * Publish message to exchange
   */
  public async publish(
    exchange: string,
    routingKey: string,
    message: any,
    options?: any
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      const publishOptions = {
        persistent: true,
        timestamp: Date.now(),
        ...options
      };

      this.channel.publish(
        exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );

      this.logger.debug(`Message published to ${exchange}/${routingKey}`, {
        messageId: options?.messageId
      });
    } catch (error) {
      this.logger.error('Failed to publish message', error);
      throw error;
    }
  }

  /**
   * Subscribe to queue
   */
  public async subscribe(
    queue: string,
    handler: (message: any) => Promise<void>,
    options?: any
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    try {
      await this.channel.consume(
        queue,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const content = JSON.parse(msg.content.toString());
            
            this.logger.debug(`Message received from ${queue}`, {
              messageId: msg.properties.messageId
            });

            await handler(content);

            // Acknowledge message
            this.channel!.ack(msg);
          } catch (error) {
            this.logger.error('Error processing message', error);
            
            // Reject and requeue message
            this.channel!.nack(msg, false, true);
          }
        },
        {
          noAck: false,
          ...options
        }
      );

      this.logger.info(`Subscribed to queue: ${queue}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to queue ${queue}`, error);
      throw error;
    }
  }

  /**
   * Create RPC client
   */
  public async rpcCall(
    queue: string,
    message: any,
    timeout: number = 30000
  ): Promise<any> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const correlationId = this.generateUuid();
    const replyQueue = await this.channel.assertQueue('', { exclusive: true });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('RPC call timeout'));
      }, timeout);

      this.channel!.consume(
        replyQueue.queue,
        (msg) => {
          if (msg && msg.properties.correlationId === correlationId) {
            clearTimeout(timer);
            const response = JSON.parse(msg.content.toString());
            resolve(response);
          }
        },
        { noAck: true }
      );

      this.channel!.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        {
          correlationId,
          replyTo: replyQueue.queue
        }
      );
    });
  }

  /**
   * Disconnect from RabbitMQ
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await (this.connection as any).close();
      }
      this.isConnected = false;
      this.logger.info('RabbitMQ disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Generate UUID
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private async handleReconnection(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries && !this.isConnected) {
      try {
        const delay = Math.min(Math.pow(2, retries) * 1000, 30000); // Max 30 seconds
        await this.delay(delay);
        
        this.logger.info(`Attempting RabbitMQ reconnection (attempt ${retries + 1}/${maxRetries})...`);
        await this.connect(1);
        
        this.logger.info('RabbitMQ auto-reconnection successful');
        this.isReconnecting = false;
        return;
      } catch (error) {
        retries++;
        this.logger.warn(`RabbitMQ reconnection attempt ${retries} failed:`, error);
        
        if (retries >= maxRetries) {
          this.logger.error('RabbitMQ auto-reconnection failed after maximum attempts');
          this.isReconnecting = false;
          break;
        }
      }
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MessageQueueManager.getInstance();
