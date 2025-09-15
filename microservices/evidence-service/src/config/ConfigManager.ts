import dotenv from 'dotenv';
import crypto from 'crypto';
import { IConfig } from '../interfaces/IConfig';

/**
 * Singleton Configuration Manager
 * Manages all environment variables and configuration settings
 * Ensures no hardcoded sensitive values
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: IConfig;

  private constructor() {
    console.log('🔧 Loading environment configuration...');
    dotenv.config();
    console.log('📋 Loading application configuration...');
    this.config = this.loadConfiguration();
    console.log('✅ Validating configuration...');
    this.validateConfiguration();
    console.log('✅ Configuration manager initialized');
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfiguration(): IConfig {
    return {
      app: {
        port: parseInt(process.env.PORT || '3001'),
        nodeEnv: process.env.NODE_ENV || 'development',
        serviceName: 'evidence-service',
        version: process.env.SERVICE_VERSION || '1.0.0'
      },
      database: {
        postgres: {
          url: process.env.DATABASE_URL || '',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'forensic_db',
          username: process.env.DB_USER || 'forensic_user',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20')
        },
        mongodb: {
          uri: process.env.MONGODB_URI || '',
          database: process.env.MONGO_DB_NAME || 'evidence_db',
          options: {
            maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10'),
            serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT || '5000'),
            socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT || '45000'),
            family: 4 // Use IPv4, skip trying IPv6
          }
        },
        redis: {
          url: process.env.REDIS_URL || '',
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || '',
          ttl: parseInt(process.env.REDIS_TTL || '3600')
        }
      },
      messageQueue: {
        rabbitmq: {
          url: process.env.RABBITMQ_URL || '',
          exchanges: {
            evidence: 'evidence.exchange',
            notification: 'notification.exchange',
            blockchain: 'blockchain.exchange'
          },
          queues: {
            evidenceProcessing: 'evidence.processing',
            aiAnalysis: 'ai.analysis',
            blockchainSync: 'blockchain.sync'
          }
        }
      },
      storage: {
        ipfs: {
          // Helia runs locally, no need for host/port
          // These are kept for backward compatibility and external gateway access
          host: process.env.IPFS_HOST || 'localhost',
          port: parseInt(process.env.IPFS_PORT || '5001'),
          protocol: process.env.IPFS_PROTOCOL || 'http',
          timeout: parseInt(process.env.IPFS_TIMEOUT || '30000'),
          // Helia-specific configuration
          helia: {
            enabled: process.env.IPFS_HELIA_ENABLED !== 'false',
            gateway: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/',
            pinning: process.env.IPFS_PINNING_ENABLED === 'true'
          }
        },
        local: {
          uploadPath: process.env.UPLOAD_PATH || './uploads',
          tempPath: process.env.TEMP_PATH || './temp'
        }
      },
      blockchain: {
        networks: {
          sepolia: {
            rpcUrl: process.env.SEPOLIA_RPC_URL || '',
            chainId: 11155111,
            contractAddress: process.env.CONTRACT_ADDRESS_SEPOLIA || '',
            bridgeAddress: process.env.BRIDGE_ADDRESS_SEPOLIA || ''
          },
          amoy: {
            rpcUrl: process.env.AMOY_RPC_URL || '',
            chainId: 80002,
            contractAddress: process.env.CONTRACT_ADDRESS_AMOY || '',
            bridgeAddress: process.env.BRIDGE_ADDRESS_AMOY || ''
          }
        },
        wallet: {
          privateKey: process.env.WALLET_PRIVATE_KEY || '',
          mnemonic: process.env.WALLET_MNEMONIC || ''
        },
        gasConfig: {
          maxGasPrice: process.env.MAX_GAS_PRICE || '100',
          gasLimit: process.env.GAS_LIMIT || '3000000'
        }
      },
      security: {
        jwt: {
          secret: process.env.JWT_SECRET || this.generateSecureSecret(),
          expiresIn: process.env.JWT_EXPIRES_IN || '1h',
          refreshSecret: process.env.JWT_REFRESH_SECRET || this.generateSecureSecret(),
          refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          secretKey: process.env.ENCRYPTION_KEY || '',
          saltRounds: parseInt(process.env.SALT_ROUNDS || '10')
        },
        custody: {
          signingSecret: process.env.COC_SIGNING_SECRET || this.generateSecureSecret(),
          hashAlgorithm: process.env.COC_HASH_ALGO || 'sha256'
        },
        cors: {
          origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        },
        rateLimit: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100')
        }
      },
      fileUpload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
        allowedMimeTypes: process.env.ALLOWED_MIME_TYPES?.split(',') || [
          'image/jpeg',
          'image/png',
          'image/gif',
          'video/mp4',
          'video/avi',
          'application/pdf',
          'audio/mpeg',
          'audio/wav'
        ],
        chunkSize: parseInt(process.env.CHUNK_SIZE || '1048576') // 1MB chunks
      },
      monitoring: {
        prometheus: {
          enabled: process.env.PROMETHEUS_ENABLED === 'true',
          port: parseInt(process.env.PROMETHEUS_PORT || '9090')
        },
        logging: {
          level: process.env.LOG_LEVEL || 'info',
          format: process.env.LOG_FORMAT || 'json',
          directory: process.env.LOG_DIRECTORY || './logs'
        }
      },
      features: {
        aiAnalysis: process.env.AI_ANALYSIS_ENABLED !== 'false',
        crossChainBridge: process.env.CROSS_CHAIN_ENABLED !== 'false',
        ipfsBackup: process.env.IPFS_BACKUP_ENABLED !== 'false',
        emailNotifications: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true'
      }
    };
  }

  private generateSecureSecret(): string {
    // This is only used if JWT_SECRET is not provided in environment
    // In production, always use environment variables
    return crypto.randomBytes(64).toString('hex');
  }

  private validateConfiguration(): void {
    const requiredEnvVars = [
      'DATABASE_URL',
      'MONGODB_URI',
      'REDIS_URL',
      'RABBITMQ_URL',
      'IPFS_HOST',
      'SEPOLIA_RPC_URL',
      'AMOY_RPC_URL'
    ];

    const missingVars = requiredEnvVars.filter(
      varName => !process.env[varName]
    );

    if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`
      );
    }

    if (missingVars.length > 0) {
      console.warn(
        `Warning: Missing environment variables: ${missingVars.join(', ')}`
      );
    }
  }

  public getConfig(): IConfig {
    return this.config;
  }

  public get<T>(path: string): T {
    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      value = value[key];
      if (value === undefined) {
        throw new Error(`Configuration key not found: ${path}`);
      }
    }

    return value as T;
  }

  public isProduction(): boolean {
    return this.config.app.nodeEnv === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.app.nodeEnv === 'development';
  }

  public isTest(): boolean {
    return this.config.app.nodeEnv === 'test';
  }
}

export default ConfigManager.getInstance();
