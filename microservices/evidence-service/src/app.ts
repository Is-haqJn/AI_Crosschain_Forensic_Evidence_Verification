import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { ConfigManager } from './config/ConfigManager.js';
import { DatabaseManager } from './services/DatabaseManager.js';
import { MessageQueueManager } from './services/MessageQueueManager.js';
import { IPFSManager } from './services/IPFSManager.js';
import { Logger } from './utils/Logger.js';
import { ErrorHandler } from './middleware/ErrorHandler.js';
import cookieParser from 'cookie-parser';
import { EvidenceRouter } from './routes/EvidenceRouter.js';
import { AuthRouter } from './routes/AuthRouter.js';
import { HealthRouter } from './routes/HealthRouter.js';
import { CaseRouter } from './routes/CaseRouter.js';
import { ActivityRouter } from './routes/ActivityRouter.js';

/**
 * Main Application Class
 * Implements Singleton pattern for the main application
 * Manages all services and middleware initialization
 */
export class ForensicEvidenceApp {
  private static instance: ForensicEvidenceApp;
  private app: Application;
  private config: ConfigManager;
  private logger: Logger;
  private databaseManager: DatabaseManager;
  private messageQueueManager: MessageQueueManager;
  private ipfsManager: IPFSManager;
  private server: any;
  private isShuttingDown: boolean = false;

  private constructor() {
    console.log('🏗️ Initializing Express app...');
    this.app = express();
    console.log('📝 Getting ConfigManager instance...');
    this.config = ConfigManager.getInstance();
    console.log('📋 Getting Logger instance...');
    this.logger = Logger.getInstance();
    console.log('🗄️ Getting DatabaseManager instance...');
    this.databaseManager = DatabaseManager.getInstance();
    console.log('📨 Getting MessageQueueManager instance...');
    this.messageQueueManager = MessageQueueManager.getInstance();
    console.log('🌐 Getting IPFSManager instance...');
    this.ipfsManager = IPFSManager.getInstance();
    console.log('✅ App constructor completed');
  }

  public static getInstance(): ForensicEvidenceApp {
    if (!ForensicEvidenceApp.instance) {
      ForensicEvidenceApp.instance = new ForensicEvidenceApp();
    }
    return ForensicEvidenceApp.instance;
  }

  /**
   * Initialize all middleware
   */
  private async initializeMiddleware(): Promise<void> {
    try {
      // Security middleware
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      }));

      // CORS configuration
      const corsOptions = this.config.get<any>('security.cors');
      this.app.use(cors(corsOptions));

      // Compression
      this.app.use(compression());

      // Rate limiting
      const rateLimitConfig = this.config.get<any>('security.rateLimit');
      const limiter = rateLimit({
        windowMs: rateLimitConfig.windowMs,
        max: rateLimitConfig.maxRequests,
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      });
      this.app.use('/api', limiter);

      // Body parsing
      this.app.use(express.json({ limit: '50mb' }));
      this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
      this.app.use(cookieParser());

      // Request logging
      this.app.use((req: Request, _res: Response, next: NextFunction) => {
        this.logger.info(`${req.method} ${req.path}`, {
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
        next();
      });

      this.logger.info('Middleware initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize middleware', error);
      throw error;
    }
  }

  /**
   * Initialize all routes
   */
  private initializeRoutes(): void {
    try {
      // Simple test route first
      this.app.get('/test', (_req, res) => {
        console.log('Test endpoint called');
        res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
      });

      // Health check routes
      const healthRouter = new HealthRouter();
      this.app.use('/health', healthRouter.getRouter());

      // API routes
      const authRouter = new AuthRouter();
      this.app.use('/api/v1/auth', authRouter.getRouter());
      const evidenceRouter = new EvidenceRouter();
      this.app.use('/api/v1/evidence', evidenceRouter.getRouter());
      const caseRouter = new CaseRouter();
      this.app.use('/api/v1/cases', caseRouter.getRouter());
      const activityRouter = new ActivityRouter();
      this.app.use('/api/v1/activity', activityRouter.getRouter());

      // 404 handler
      this.app.use((req: Request, res: Response) => {
        res.status(404).json({
          error: 'Not Found',
          message: `Route ${req.path} not found`,
          timestamp: new Date().toISOString()
        });
      });

      this.logger.info('Routes initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize routes', error);
      throw error;
    }
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    const errorHandler = new ErrorHandler();
    this.app.use(errorHandler.handle.bind(errorHandler));
  }

  /**
   * Connect to all external services
   * Made resilient - service will start even if some external services are unavailable
   */
  private async connectServices(): Promise<void> {
    const connectionPromises = [
      this.connectWithFallback('Database', () => this.databaseManager.connect()),
      this.connectWithFallback('Message Queue', () => this.messageQueueManager.connect()),
      this.connectWithFallback('IPFS', () => this.ipfsManager.connect())
    ];

    // Wait for all connection attempts, but don't fail if some services are unavailable
    const results = await Promise.allSettled(connectionPromises);
    
    let connectedServices = 0;
    results.forEach((result, index) => {
      const serviceName = ['Database', 'Message Queue', 'IPFS'][index];
      if (result.status === 'fulfilled') {
        this.logger.info(`✅ ${serviceName} connected`);
        connectedServices++;
      } else {
        this.logger.warn(`⚠️ ${serviceName} connection failed: ${result.reason}`);
      }
    });

    this.logger.info(`Service startup: ${connectedServices}/3 external services connected`);
    
    // Service can start with minimal functionality even if some services are down
    if (connectedServices === 0) {
      this.logger.warn('⚠️ Starting in degraded mode - no external services available');
    }
  }

  /**
   * Helper method to connect to services with fallback
   */
  private async connectWithFallback(serviceName: string, connectFn: () => Promise<void>): Promise<void> {
    try {
      await connectFn();
    } catch (error) {
      this.logger.warn(`${serviceName} connection failed, service will start in degraded mode`, error);
      throw error; // Re-throw for Promise.allSettled to catch
    }
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    try {
      this.logger.info('🔄 Starting Evidence Service...');

      // Initialize middleware
      this.logger.info('🔧 Initializing middleware...');
      await this.initializeMiddleware();

      // Initialize routes
      this.logger.info('🛣️ Initializing routes...');
      this.initializeRoutes();

      // Initialize error handling
      this.logger.info('🛡️ Initializing error handling...');
      this.initializeErrorHandling();

      // Start server first, then connect to external services
      const port = this.config.get<number>('app.port');
      this.logger.info(`🚀 Starting server on port ${port}...`);
      this.server = this.app.listen(port, () => {
        this.logger.info(`✅ Evidence Service running on port ${port}`);
        this.logger.info(`📊 Environment: ${this.config.get<string>('app.nodeEnv')}`);
        this.logger.info(`📦 Version: ${this.config.get<string>('app.version')}`);
      });

      // Connect to external services in background
      this.logger.info('🔗 Connecting to external services...');
      setImmediate(async () => {
        await this.connectServices();
      });

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start application', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        this.logger.info(`Shutdown already in progress (signal: ${signal}) - ignoring duplicate signal`);
        return;
      }
      this.isShuttingDown = true;
      this.logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP server closed');
        });
      }

      try {
        // Disconnect from services
        await this.databaseManager.disconnect();
        await this.messageQueueManager.disconnect();
        await this.ipfsManager.disconnect();

        this.logger.info('All connections closed successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Stop the application
   */
  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
    await this.databaseManager.disconnect();
    await this.messageQueueManager.disconnect();
    await this.ipfsManager.disconnect();
  }

  /**
   * Get Express app instance (for testing)
   */
  public getApp(): Application {
    return this.app;
  }
}

// Export singleton instance
export default ForensicEvidenceApp.getInstance();
