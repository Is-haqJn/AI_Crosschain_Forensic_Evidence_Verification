import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * Custom Error Class
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */
export class ErrorHandler {
  private logger: Logger;
  private config: ConfigManager;

  constructor() {
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
  }

  /**
   * Main error handling middleware
   */
  public handle(
    error: Error | AppError,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void {
    const appError = this.normalizeError(error);
    
    // Log error
    this.logError(appError, req);

    // Send error response
    this.sendErrorResponse(appError, res);
  }

  /**
   * Normalize error to AppError
   */
  private normalizeError(error: Error | AppError): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // Handle specific error types
    const anyErr: any = error as any;
    if (anyErr && (anyErr.code === 'INSUFFICIENT_FUNDS' || (typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('insufficient funds')))) {
      return new AppError('Blockchain wallet has insufficient funds on the selected network. Please fund the configured account with test ETH and try again.', 402);
    }
    if (error.name === 'ValidationError') {
      // Preserve detailed validation message from source (e.g., Mongoose)
      const mongooseDetails = anyErr?.errors ? Object.keys(anyErr.errors).map((k) => anyErr.errors[k]?.message).filter(Boolean) : [];
      const joiDetails: any[] = Array.isArray(anyErr?.details) ? anyErr.details : [];
      const appErr = new AppError(
        (mongooseDetails.length ? mongooseDetails.join('; ') : '') || anyErr?.message || 'Validation error',
        400
      );
      if (anyErr?.errors && typeof anyErr.errors === 'object') {
        (appErr as any).errors = anyErr.errors; // Mongoose field-level details
      }
      if (joiDetails.length) {
        (appErr as any).details = joiDetails; // Joi details array
      }
      return appErr;
    }

    if (error.name === 'CastError') {
      return new AppError('Invalid data format', 400);
    }

    if (error.name === 'MongoError' && (error as any).code === 11000) {
      return new AppError('Duplicate key error', 409);
    }

    if (error.name === 'JsonWebTokenError') {
      return new AppError('Invalid token', 401);
    }

    if (error.name === 'TokenExpiredError') {
      return new AppError('Token expired', 401);
    }

    // Handle multer errors
    if (error.name === 'MulterError') {
      const multerError = error as any;
      switch (multerError.code) {
        case 'LIMIT_FILE_SIZE':
          return new AppError(`File too large. Maximum size allowed is ${this.formatFileSize(this.getMaxFileSize())}`, 400);
        case 'LIMIT_FILE_COUNT':
          return new AppError('Too many files uploaded', 400);
        case 'LIMIT_UNEXPECTED_FILE':
          return new AppError('Unexpected file field', 400);
        case 'LIMIT_PART_COUNT':
          return new AppError('Too many parts in multipart request', 400);
        case 'LIMIT_FIELD_KEY':
          return new AppError('Field name too long', 400);
        case 'LIMIT_FIELD_VALUE':
          return new AppError('Field value too long', 400);
        case 'LIMIT_FIELD_COUNT':
          return new AppError('Too many fields', 400);
        default:
          return new AppError(`File upload error: ${multerError.message}`, 400);
      }
    }

    // Default to internal server error
    return new AppError(
      error.message || 'Internal server error',
      500,
      false
    );
  }

  /**
   * Log error details
   */
  private logError(error: AppError, req: Request): void {
    const errorLog = {
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (error.statusCode >= 500) {
      this.logger.error('Server error', errorLog);
    } else if (error.statusCode >= 400) {
      this.logger.warn('Client error', errorLog);
    }
  }

  /**
   * Get maximum file size from configuration
   */
  private getMaxFileSize(): number {
    const fileUploadConfig = this.config.get<any>('fileUpload');
    return fileUploadConfig?.maxFileSize || 104857600; // Default 100MB
  }

  /**
   * Format file size in human readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Send error response to client
   */
  private sendErrorResponse(error: AppError, res: Response): void {
    const isDevelopment = this.config.isDevelopment();
    
    const response: any = {
      error: {
        message: error.message,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString()
      }
    };

    // Attach validation details if available
    const anyErr: any = error as any;
    if (anyErr?.errors && typeof anyErr.errors === 'object') {
      response.error.details = Object.keys(anyErr.errors).map((k) => ({ field: k, message: anyErr.errors[k]?.message }));
    }
    if (Array.isArray(anyErr?.details)) {
      const mapped = anyErr.details.map((d: any) => ({ field: Array.isArray(d?.path) ? d.path.join('.') : d?.path, message: d?.message }));
      response.error.details = Array.isArray(response.error.details) ? [...response.error.details, ...mapped] : mapped;
    }

    // Include stack trace in development
    if (isDevelopment && error.stack) {
      response.error.stack = error.stack;
    }

    res.status(error.statusCode).json(response);
  }

  /**
   * Handle 404 errors
   */
  public notFound(req: Request, res: Response): void {
    res.status(404).json({
      error: {
        message: `Route ${req.path} not found`,
        statusCode: 404,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle async errors
   */
  public asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

export default ErrorHandler;
