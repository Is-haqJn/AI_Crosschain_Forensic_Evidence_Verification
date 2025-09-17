import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';
import { User } from '../models/User.model.js';

/**
 * Extended Request interface with user property
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organization: string;
  };
}

/**
 * Authentication Middleware
 * Handles JWT validation and authorization
 */
export class AuthMiddleware {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
  }

  /**
   * Authenticate JWT token
   */
  public async authenticate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = this.extractToken(req);

      if (!token) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'No token provided'
        });
        return;
      }

      const jwtConfig = this.config.get<any>('security.jwt');
      const decoded = jwt.verify(token, jwtConfig.secret) as any;

      // Derive missing claims if possible (fallback for older tokens)
      let userId: string | undefined = typeof decoded.id === 'string' && decoded.id.trim() !== '' ? decoded.id : undefined;
      let email: string | undefined = typeof decoded.email === 'string' && decoded.email.trim() !== '' ? decoded.email : undefined;
      let roleClaim: string | undefined = typeof decoded.role === 'string' && decoded.role.trim() !== '' ? decoded.role : undefined;
      let organization: string | undefined = typeof decoded.organization === 'string' ? decoded.organization : undefined;

      // Primary fallback by email if id missing
      if (!userId && email) {
        try {
          const user = await User.findOne({ email });
          if (user) {
            userId = user.userId;
            organization = organization && organization.trim() !== '' ? organization : user.organization;
            roleClaim = roleClaim || user.role;
          }
        } catch (e) {
          this.logger.warn('User lookup failed during auth fallback', e);
        }
      }

      // Secondary enrichment: if org/role still missing, try lookup by id
      if ((!organization || organization.trim() === '') || !roleClaim) {
        try {
          const key = userId ? { userId } : (email ? { email } : null);
          if (key) {
            const user = await User.findOne(key as any);
            if (user) {
              if (!organization || organization.trim() === '') organization = user.organization;
              if (!roleClaim) roleClaim = user.role;
              if (!email) email = user.email;
              if (!userId) userId = user.userId;
            }
          }
        } catch (e) {
          this.logger.warn('User enrichment failed during auth fallback', e);
        }
      }

      if (!userId || !email || !roleClaim) {
        this.logger.warn('Invalid token claims after fallback', { hasEmail: !!email, hasId: !!userId, hasRole: !!roleClaim });
        res.status(401).json({
          error: 'Invalid token',
          message: 'Missing required token claims'
        });
        return;
      }

      // Normalize role (map SUPER_ADMIN -> admin; allow ADMIN in any case)
      const roleUpper = (roleClaim || '').toUpperCase();
      const normalizedRole = roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN' ? 'admin' : roleClaim;

      // Attach user to request
      req.user = {
        id: userId,
        email,
        role: normalizedRole,
        organization: (organization && organization.trim() !== '') ? organization : 'Unknown'
      };

      this.logger.debug('User authenticated', { userId: decoded.id });
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Token expired',
          message: 'Please login again'
        });
      } else if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          error: 'Invalid token',
          message: 'Authentication failed'
        });
      } else {
        this.logger.error('Authentication error', error);
        res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error'
        });
      }
    }
  }

  /**
   * Authorize based on roles
   */
  public authorize(allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      if (!allowedRoles.includes(req.user.role)) {
        this.logger.warn('Authorization failed', {
          userId: req.user.id,
          role: req.user.role,
          requiredRoles: allowedRoles
        });

        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
        return;
      }

      next();
    };
  }

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    // Check cookies
    if ((req as any).cookies) {
      const cookies = (req as any).cookies as Record<string, string>;
      if (cookies['access_token']) return cookies['access_token'];
      if (cookies['token']) return cookies['token'];
    }

    return null;
  }

  /**
   * Generate JWT token
   */
  public generateToken(payload: any): string {
    const jwtConfig = this.config.get<any>('security.jwt');
    return jwt.sign(payload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });
  }

  /**
   * Generate refresh token
   */
  public generateRefreshToken(payload: any): string {
    const jwtConfig = this.config.get<any>('security.jwt');
    return jwt.sign(payload, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshExpiresIn
    });
  }

  /**
   * Verify refresh token
   */
  public verifyRefreshToken(token: string): any {
    const jwtConfig = this.config.get<any>('security.jwt');
    return jwt.verify(token, jwtConfig.refreshSecret);
  }
}

export default AuthMiddleware;
