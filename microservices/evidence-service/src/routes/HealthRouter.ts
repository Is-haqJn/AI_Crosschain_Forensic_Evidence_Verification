import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../services/DatabaseManager.js';
import { MessageQueueManager } from '../services/MessageQueueManager.js';
import { IPFSManager } from '../services/IPFSManager.js';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * Health Check Router
 * Provides health and readiness endpoints
 */
export class HealthRouter {
  private router: Router;
  private databaseManager: DatabaseManager;
  private messageQueueManager: MessageQueueManager;
  private ipfsManager: IPFSManager;
  private config: ConfigManager;

  constructor() {
    this.router = Router();
    this.databaseManager = DatabaseManager.getInstance();
    this.messageQueueManager = MessageQueueManager.getInstance();
    this.ipfsManager = IPFSManager.getInstance();
    this.config = ConfigManager.getInstance();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Basic health check
    this.router.get('/', this.healthCheck.bind(this));

    // Detailed health check
    this.router.get('/detailed', this.detailedHealthCheck.bind(this));

    // Readiness check
    this.router.get('/ready', this.readinessCheck.bind(this));

    // Liveness check
    this.router.get('/live', this.livenessCheck.bind(this));
  }

  /**
   * Basic health check
   */
  private async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      console.log('Health check endpoint called');
      res.status(200).json({
        status: 'healthy',
        service: 'evidence-service',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Detailed health check with all dependencies
   */
  private async detailedHealthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const dbHealth = await this.databaseManager.healthCheck();
      const mqHealth = this.messageQueueManager.getConnectionStatus();
      const ipfsHealth = this.ipfsManager.getConnectionStatus();

      const overallHealth = 
        dbHealth.postgres && 
        dbHealth.mongodb && 
        dbHealth.redis && 
        mqHealth && 
        ipfsHealth;

      res.status(overallHealth ? 200 : 503).json({
        status: overallHealth ? 'healthy' : 'unhealthy',
        service: 'evidence-service',
        version: this.config.get<string>('app.version'),
        environment: this.config.get<string>('app.nodeEnv'),
        timestamp: new Date().toISOString(),
        dependencies: {
          databases: {
            postgres: dbHealth.postgres ? 'connected' : 'disconnected',
            mongodb: dbHealth.mongodb ? 'connected' : 'disconnected',
            redis: dbHealth.redis ? 'connected' : 'disconnected'
          },
          messageQueue: mqHealth ? 'connected' : 'disconnected',
          ipfs: ipfsHealth ? 'connected' : 'disconnected'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        service: 'evidence-service',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Readiness check - is the service ready to accept traffic?
   */
  private async readinessCheck(_req: Request, res: Response): Promise<void> {
    try {
      const dbHealth = await this.databaseManager.healthCheck();
      const isReady = 
        dbHealth.postgres && 
        dbHealth.mongodb && 
        dbHealth.redis;

      if (isReady) {
        res.status(200).json({
          ready: true,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          ready: false,
          reason: 'Dependencies not ready',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      res.status(503).json({
        ready: false,
        reason: 'Readiness check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Liveness check - is the service alive?
   */
  private livenessCheck(_req: Request, res: Response): void {
    res.status(200).json({
      alive: true,
      timestamp: new Date().toISOString()
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default HealthRouter;
