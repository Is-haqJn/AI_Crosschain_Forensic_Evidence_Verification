import winston, { Logger as WinstonLogger, format } from 'winston';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * Logger Class
 * Singleton pattern for centralized logging
 * Supports multiple transports and log levels
 */
export class Logger {
  private static instance: Logger;
  private logger: WinstonLogger;
  private config: ConfigManager;

  private constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = this.createLogger();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogger(): WinstonLogger {
    const logConfig = this.config.get<any>('monitoring.logging');
    const logDir = logConfig.directory || './logs';

    // Create log directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Custom format for logs
    const customFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
      format.json()
    );

    // Console format for development
    const consoleFormat = format.combine(
      format.colorize(),
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.printf(({ timestamp, level, message, metadata }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (metadata && Object.keys(metadata).length > 0) {
          log += ` ${JSON.stringify(metadata)}`;
        }
        return log;
      })
    );

    // Create transports
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.isDevelopment() || this.config.isTest()) {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: logConfig.level || 'debug'
        })
      );
    }

    // File transports
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: customFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: customFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );

    // Create logger instance
    return winston.createLogger({
      level: logConfig.level || 'info',
      format: customFormat,
      transports,
      exitOnError: false
    });
  }

  /**
   * Log methods
   */
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  public verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }

  /**
   * Log HTTP requests
   */
  public logRequest(req: any, res: any, responseTime: number): void {
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 400) {
      this.error('HTTP Request Error', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  /**
   * Log database queries
   */
  public logQuery(query: string, duration: number, error?: any): void {
    const logData = {
      query: query.substring(0, 200), // Truncate long queries
      duration: `${duration}ms`,
      error: error?.message
    };

    if (error) {
      this.error('Database Query Error', logData);
    } else if (duration > 1000) {
      this.warn('Slow Database Query', logData);
    } else {
      this.debug('Database Query', logData);
    }
  }

  /**
   * Log blockchain transactions
   */
  public logTransaction(txHash: string, status: string, gasUsed?: string): void {
    const logData = {
      transactionHash: txHash,
      status,
      gasUsed
    };

    if (status === 'failed') {
      this.error('Blockchain Transaction Failed', logData);
    } else {
      this.info('Blockchain Transaction', logData);
    }
  }

  /**
   * Create child logger with context
   */
  public child(metadata: any): WinstonLogger {
    return this.logger.child(metadata);
  }

  /**
   * Stream for Morgan HTTP logger
   */
  public get stream() {
    return {
      write: (message: string) => {
        this.info(message.trim());
      }
    };
  }
}

export default Logger.getInstance();
