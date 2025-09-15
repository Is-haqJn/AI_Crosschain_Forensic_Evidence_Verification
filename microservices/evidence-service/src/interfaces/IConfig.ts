/**
 * Configuration Interface Definitions
 * Defines the structure of all configuration objects
 */

export interface IAppConfig {
  port: number;
  nodeEnv: string;
  serviceName: string;
  version: string;
}

export interface IDatabaseConfig {
  postgres: IPostgresConfig;
  mongodb: IMongoDBConfig;
  redis: IRedisConfig;
}

export interface IPostgresConfig {
  url: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

export interface IMongoDBConfig {
  uri: string;
  database: string;
  options: {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
    family?: number;
  };
}

export interface IRedisConfig {
  url: string;
  host: string;
  port: number;
  password: string;
  ttl: number;
}

export interface IMessageQueueConfig {
  rabbitmq: IRabbitMQConfig;
}

export interface IRabbitMQConfig {
  url: string;
  exchanges: {
    evidence: string;
    notification: string;
    blockchain: string;
  };
  queues: {
    evidenceProcessing: string;
    aiAnalysis: string;
    blockchainSync: string;
  };
}

export interface IStorageConfig {
  ipfs: IIPFSConfig;
  local: ILocalStorageConfig;
}

export interface IIPFSConfig {
  host: string;
  port: number;
  protocol: string;
  timeout: number;
  helia: {
    enabled: boolean;
    gateway: string;
    pinning: boolean;
  };
}

export interface ILocalStorageConfig {
  uploadPath: string;
  tempPath: string;
}

export interface IBlockchainConfig {
  networks: {
    sepolia: INetworkConfig;
    amoy: INetworkConfig;
  };
  wallet: IWalletConfig;
  gasConfig: IGasConfig;
}

export interface INetworkConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  bridgeAddress: string;
}

export interface IWalletConfig {
  privateKey: string;
  mnemonic: string;
}

export interface IGasConfig {
  maxGasPrice: string;
  gasLimit: string;
}

export interface ISecurityConfig {
  jwt: IJWTConfig;
  encryption: IEncryptionConfig;
  custody: ICustodyConfig;
  cors: ICORSConfig;
  rateLimit: IRateLimitConfig;
}

export interface IJWTConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface IEncryptionConfig {
  algorithm: string;
  secretKey: string;
  saltRounds: number;
}

export interface ICustodyConfig {
  signingSecret: string;
  hashAlgorithm: string;
}

export interface ICORSConfig {
  origin: string[];
  credentials: boolean;
  methods: string[];
}

export interface IRateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface IFileUploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  chunkSize: number;
}

export interface IMonitoringConfig {
  prometheus: {
    enabled: boolean;
    port: number;
  };
  logging: {
    level: string;
    format: string;
    directory: string;
  };
}

export interface IFeaturesConfig {
  aiAnalysis: boolean;
  crossChainBridge: boolean;
  ipfsBackup: boolean;
  emailNotifications: boolean;
}

export interface IConfig {
  app: IAppConfig;
  database: IDatabaseConfig;
  messageQueue: IMessageQueueConfig;
  storage: IStorageConfig;
  blockchain: IBlockchainConfig;
  security: ISecurityConfig;
  fileUpload: IFileUploadConfig;
  monitoring: IMonitoringConfig;
  features: IFeaturesConfig;
}
