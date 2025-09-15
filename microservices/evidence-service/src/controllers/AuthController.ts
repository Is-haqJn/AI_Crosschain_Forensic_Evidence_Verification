import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';
import { AppError } from '../middleware/ErrorHandler.js';
import { User } from '../models/User.model.js';

export class AuthController {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
  }

  public async register(req: Request, res: Response): Promise<void> {
    const { email, password, name, organization, role } = req.body || {};
    if (!email || !password || !name || !organization) throw new AppError('Missing required fields', 400);
    this.logger.info('Auth register attempt', { email, ip: req.ip });

    const existing = await User.findOne({ email });
    if (existing) throw new AppError('Email already registered', 409);

    // Restrict registration after first user exists: require admin token
    const total = await User.estimatedDocumentCount();
    if (total > 0) {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('No admin token');
        const token = authHeader.substring(7);
        const jwtCfg = this.config.get<any>('security.jwt');
        const decoded: any = jwt.verify(token, jwtCfg.secret);
        if (!decoded?.role || decoded.role !== 'admin') throw new Error('Not admin');
      } catch {
        throw new AppError('Admin authorization required to register new users', 403);
      }
    }

    const passwordHash = await bcrypt.hash(password, this.config.get<number>('security.encryption.saltRounds'));
    const user = await User.create({
      userId: uuidv4(),
      email,
      name,
      organization,
      role: role || 'investigator',
      passwordHash
    });

    this.logger.info('Auth register success', { email, id: user.userId });
    res.status(201).json({ success: true, data: { id: user.userId, email: user.email } });
  }

  public async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body || {};
    if (!email || !password) throw new AppError('Email and password are required', 400);
    this.logger.info('Auth login attempt', { email, ip: req.ip });

    const user = await User.findOne({ email });
    if (!user) throw new AppError('Invalid credentials', 401);

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);

    const tokens = this.issueTokens(user.userId, user.email, user.role, user.organization, user.tokenVersion);

    // Optional: set HttpOnly cookies (access + refresh)
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken, this.config.isProduction());

    this.logger.info('Auth login success', { email, id: user.userId });
    res.status(200).json({
      success: true,
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization,
          createdAt: user.createdAt,
          lastLogin: new Date().toISOString()
        }
      }
    });
  }

  public async refresh(req: Request, res: Response): Promise<void> {
    const refresh = (req.body?.refreshToken as string) || (req.cookies?.refresh_token as string);
    if (!refresh) throw new AppError('Missing refresh token', 401);
    const jwtCfg = this.config.get<any>('security.jwt');

    let payload: any;
    try {
      payload = jwt.verify(refresh, jwtCfg.refreshSecret);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await User.findOne({ userId: payload.id });
    if (!user) throw new AppError('User not found', 404);
    if (payload.tokenVersion !== user.tokenVersion) throw new AppError('Token revoked', 401);

    const tokens = this.issueTokens(user.userId, user.email, user.role, user.organization, user.tokenVersion);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken, this.config.isProduction());

    this.logger.info('Auth refresh success', { id: user.userId });
    res.status(200).json({ success: true, data: { token: tokens.accessToken, refreshToken: tokens.refreshToken } });
  }

  public async logout(req: Request, res: Response): Promise<void> {
    // For simplicity, bump tokenVersion to revoke existing refresh tokens
    const auth = (req as any).user;
    if (auth?.id) {
      await User.updateOne({ userId: auth.id }, { $inc: { tokenVersion: 1 } });
    }
    this.logger.info('Auth logout', { id: (req as any).user?.id });
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.status(200).json({ success: true, message: 'Logged out' });
  }

  public async me(req: Request, res: Response): Promise<void> {
    const auth = (req as any).user;
    if (!auth) throw new AppError('Unauthorized', 401);
    const user = await User.findOne({ userId: auth.id });
    if (!user) throw new AppError('User not found', 404);
    this.logger.debug('Auth me', { id: auth.id });
    res.status(200).json({ success: true, data: {
      id: user.userId, email: user.email, name: user.name, role: user.role, organization: user.organization,
      createdAt: user.createdAt
    } });
  }

  private issueTokens(id: string, email: string, role: string, organization: string, tokenVersion: number) {
    const jwtCfg = this.config.get<any>('security.jwt');
    const accessToken = jwt.sign({ id, email, role, organization }, jwtCfg.secret, {
      expiresIn: jwtCfg.expiresIn,
      issuer: 'evidence-service',
      audience: 'frontend'
    });
    const refreshToken = jwt.sign({ id, tokenVersion }, jwtCfg.refreshSecret, {
      expiresIn: jwtCfg.refreshExpiresIn,
      issuer: 'evidence-service',
      audience: 'frontend'
    });
    return { accessToken, refreshToken };
  }

  private setAuthCookies(res: Response, access: string, refresh: string, prod: boolean) {
    const common = { httpOnly: true, sameSite: 'lax' as const, secure: prod };
    // Access cookie is optional; frontend currently reads token from response. Keeping this improves SSR and tooling.
    res.cookie('access_token', access, { ...common });
    res.cookie('refresh_token', refresh, { ...common, path: '/api/v1/auth/refresh' });
  }

  public async listUsers(_req: Request, res: Response): Promise<void> {
    const users = await User.find({}, { _id: 0, userId: 1, email: 1, name: 1, organization: 1, role: 1, createdAt: 1, updatedAt: 1 }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: users });
  }
}

export default AuthController;
