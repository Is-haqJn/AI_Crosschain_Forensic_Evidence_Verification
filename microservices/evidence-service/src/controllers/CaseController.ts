import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware.js';
import { CaseService } from '../services/CaseService.js';
import { AppError } from '../middleware/ErrorHandler.js';
import { Logger } from '../utils/Logger.js';

export class CaseController {
  private caseService: CaseService;
  private logger: Logger;

  constructor() {
    this.caseService = new CaseService();
    this.logger = Logger.getInstance();
  }

  public async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('User not authenticated', 401);
      const { title, description, tags } = req.body || {};
      this.logger.info('Create case request', { title, description, tags, userId: req.user.id });
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new AppError('Title is required', 400);
      }
      const c = await this.caseService.createCase({
        title,
        description,
        tags,
        lead: { userId: req.user.id, name: req.user.email, organization: req.user.organization }
      });
      res.status(201).json({ success: true, data: c });
    } catch (error) {
      // Surface mongoose validation details if present
      const anyErr: any = error as any;
      this.logger.warn('Create case validation error', {
        name: anyErr?.name,
        message: anyErr?.message,
        keys: anyErr?.errors ? Object.keys(anyErr.errors) : null,
        errors: anyErr?.errors || null
      });
      if (anyErr && anyErr.name === 'ValidationError' && anyErr.errors) {
        const details = Object.keys(anyErr.errors).map((k) => anyErr.errors[k]?.message).filter(Boolean).join('; ');
        const appErr = new AppError(details || 'Validation error', 400);
        (appErr as any).errors = anyErr.errors; // attach field-level details so handler can format
        return next(appErr);
      }
      next(error);
    }
  }

  public async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('User not authenticated', 401);
      const filters = { status: req.query.status as string, search: req.query.search as string, tag: req.query.tag as string };
      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
        sortBy: (req.query.sortBy as string) || 'createdAt',
        sortOrder: (req.query.sortOrder as any) || 'desc'
      };
      const result = await this.caseService.listCases(filters, pagination);
      res.status(200).json({ success: true, data: result.cases, pagination: { page: pagination.page, limit: pagination.limit, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) } });
    } catch (error) {
      next(error);
    }
  }

  public async get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('User not authenticated', 401);
      const { id } = req.params;
      const c = await this.caseService.getCase(id);
      if (!c) throw new AppError('Case not found', 404);
      res.status(200).json({ success: true, data: c });
    } catch (error) {
      next(error);
    }
  }

  public async addEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('User not authenticated', 401);
      const { id } = req.params;
      const { evidenceId } = req.body;
      const c = await this.caseService.addEvidence(id, evidenceId, req.user.id);
      res.status(200).json({ success: true, data: c });
    } catch (error) {
      next(error);
    }
  }
}

export default CaseController;
