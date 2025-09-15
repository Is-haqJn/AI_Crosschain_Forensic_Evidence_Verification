import { Pool } from 'pg';
import mongoose, { Connection } from 'mongoose';
import Redis from 'ioredis';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';

/**
 * Database Manager
 * Singleton class that manages all database connections
 * Implements connection pooling and retry logic
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private config: ConfigManager;
  private logger: Logger;
  private postgresPool: Pool | null = null;
  private mongoConnection: Connection | null = null;
  private redisClient: Redis | null = null;
  private isConnected: boolean = false;

  private constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Connect to all databases
   */
  public async connect(): Promise<void> {
    try {
      await Promise.all([
        this.connectPostgres(),
        this.connectMongoDB(),
        this.connectRedis()
      ]);
      this.isConnected = true;
      this.logger.info('All database connections established');
    } catch (error) {
      this.logger.error('Failed to connect to databases', error);
      throw error;
    }
  }

  /**
   * Connect to PostgreSQL with retry logic
   */
  private async connectPostgres(retries: number = 5): Promise<void> {
    const postgresConfig = this.config.get<any>('database.postgres');
    
    for (let i = 0; i < retries; i++) {
      try {
        this.postgresPool = new Pool({
          connectionString: postgresConfig.url,
          max: postgresConfig.maxConnections,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
          ssl: postgresConfig.ssl ? { rejectUnauthorized: false } : false
        });

        // Test connection
        const client = await this.postgresPool.connect();
        await client.query('SELECT NOW()');
        client.release();

        this.logger.info('PostgreSQL connected successfully');
        return;
      } catch (error) {
        this.logger.warn(`PostgreSQL connection attempt ${i + 1} failed`, error);
        if (i === retries - 1) {
          throw new Error(`Failed to connect to PostgreSQL after ${retries} attempts`);
        }
        await this.delay(5000 * (i + 1)); // Exponential backoff
      }
    }
  }

  /**
   * Connect to MongoDB with retry logic
   */
  private async connectMongoDB(retries: number = 5): Promise<void> {
    const mongoConfig = this.config.get<any>('database.mongodb');
    
    for (let i = 0; i < retries; i++) {
      try {
        await mongoose.connect(mongoConfig.uri, {
          ...mongoConfig.options,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          heartbeatFrequencyMS: 10000,
          bufferCommands: false,
        });

        this.mongoConnection = mongoose.connection;
        
        this.mongoConnection.on('error', (error) => {
          this.logger.error('MongoDB connection error', error);
        });

        this.mongoConnection.on('disconnected', () => {
          this.logger.warn('MongoDB disconnected - attempting reconnection...');
          this.reconnectMongoDB();
        });

        this.mongoConnection.on('reconnected', () => {
          this.logger.info('MongoDB reconnected successfully');
        });

        this.mongoConnection.on('reconnectFailed', () => {
          this.logger.error('MongoDB reconnection failed');
        });

        this.logger.info('MongoDB connected successfully');
        return;
      } catch (error) {
        this.logger.warn(`MongoDB connection attempt ${i + 1} failed`, error);
        if (i === retries - 1) {
          throw new Error(`Failed to connect to MongoDB after ${retries} attempts`);
        }
        await this.delay(5000 * (i + 1));
      }
    }
  }

  /**
   * Connect to Redis with retry logic
   */
  private async connectRedis(retries: number = 5): Promise<void> {
    const redisConfig = this.config.get<any>('database.redis');
    
    for (let i = 0; i < retries; i++) {
      try {
        // Use Redis URL if available, otherwise fall back to host/port
        const redisUrl = redisConfig.url;
        if (redisUrl) {
          this.redisClient = new Redis(redisUrl, {
            retryStrategy: (times: number) => {
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false
          });
        } else {
          this.redisClient = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            retryStrategy: (times: number) => {
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false
          });
        }

        await new Promise<void>((resolve, reject) => {
          this.redisClient!.on('ready', () => {
            this.logger.info('Redis connected successfully');
            resolve();
          });

          this.redisClient!.on('error', (error) => {
            this.logger.error('Redis connection error', error);
            reject(error);
          });
        });

        return;
      } catch (error) {
        this.logger.warn(`Redis connection attempt ${i + 1} failed`, error);
        if (i === retries - 1) {
          throw new Error(`Failed to connect to Redis after ${retries} attempts`);
        }
        await this.delay(5000 * (i + 1));
      }
    }
  }

  /**
   * Disconnect from all databases
   */
  public async disconnect(): Promise<void> {
    try {
      const disconnectPromises: Promise<any>[] = [];

      if (this.postgresPool) {
        const pool = this.postgresPool;
        this.postgresPool = null;
        disconnectPromises.push(pool.end().catch((err) => {
          // Avoid throwing if already ended
          if (err && /end on pool more than once/i.test(String(err))) {
            this.logger.warn('PostgreSQL pool already ended; ignoring duplicate end');
            return;
          }
          throw err;
        }));
      }

      if (this.mongoConnection) {
        this.mongoConnection = null;
        disconnectPromises.push(mongoose.disconnect().catch((err) => {
          this.logger.warn('MongoDB disconnect warning', err);
        }));
      }

      if (this.redisClient) {
        const client = this.redisClient;
        this.redisClient = null;
        disconnectPromises.push(client.quit().catch((err: any) => {
          this.logger.warn('Redis quit warning', err);
        }));
      }

      await Promise.all(disconnectPromises);
      this.isConnected = false;
      this.logger.info('All database connections closed');
    } catch (error) {
      this.logger.error('Error disconnecting from databases', error);
      throw error;
    }
  }

  /**
   * Get PostgreSQL pool
   */
  public getPostgresPool(): Pool {
    if (!this.postgresPool) {
      throw new Error('PostgreSQL not connected');
    }
    return this.postgresPool;
  }

  /**
   * Get MongoDB connection
   */
  public getMongoConnection(): Connection {
    if (!this.mongoConnection) {
      throw new Error('MongoDB not connected');
    }
    return this.mongoConnection;
  }

  /**
   * Get Redis client
   */
  public getRedisClient(): Redis {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return this.redisClient;
  }

  /**
   * Check if all databases are connected
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Health check for all databases
   */
  public async healthCheck(): Promise<{
    postgres: boolean;
    mongodb: boolean;
    redis: boolean;
  }> {
    const health = {
      postgres: false,
      mongodb: false,
      redis: false
    };

    try {
      // Check PostgreSQL
      if (this.postgresPool) {
        const client = await this.postgresPool.connect();
        await client.query('SELECT 1');
        client.release();
        health.postgres = true;
      }
    } catch (error) {
      this.logger.error('PostgreSQL health check failed', error);
    }

    try {
      // Check MongoDB
      if (this.mongoConnection && this.mongoConnection.readyState === 1) {
        health.mongodb = true;
      }
    } catch (error) {
      this.logger.error('MongoDB health check failed', error);
    }

    try {
      // Check Redis
      if (this.redisClient) {
        await this.redisClient.ping();
        health.redis = true;
      }
    } catch (error) {
      this.logger.error('Redis health check failed', error);
    }

    return health;
  }

  /**
   * Auto-reconnect MongoDB with exponential backoff
   */
  private async reconnectMongoDB(): Promise<void> {
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries) {
      try {
        const delay = Math.min(Math.pow(2, retries) * 1000, 30000); // Max 30 seconds
        await this.delay(delay);
        
        this.logger.info(`Attempting MongoDB reconnection (attempt ${retries + 1}/${maxRetries})...`);
        await this.connectMongoDB(1);
        
        this.logger.info('MongoDB auto-reconnection successful');
        return;
      } catch (error) {
        retries++;
        this.logger.warn(`MongoDB reconnection attempt ${retries} failed:`, error);
        
        if (retries >= maxRetries) {
          this.logger.error('MongoDB auto-reconnection failed after maximum attempts');
          break;
        }
      }
    }
  }

  /**
   * Utility function for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DatabaseManager.getInstance();
