import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './ErrorHandler.js';

/**
 * Validation Middleware
 * Handles request validation using Joi
 */
export class ValidationMiddleware {
  /**
   * Validate evidence upload
   */
  public validateEvidenceUpload(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      description: Joi.string().max(1000).optional(),
      type: Joi.string().valid('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER').required(),
      location: Joi.string().optional(),
      deviceInfo: Joi.string().optional(),
      tags: Joi.string().optional(),
      caseId: Joi.string().uuid().optional().allow(''),
      caseNumber: Joi.string().optional().allow('')
    }).unknown(true);

    const { error } = schema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate evidence ID
   */
  public validateEvidenceId(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const { error } = schema.validate(req.params);
    if (error) {
      throw new AppError('Invalid evidence ID', 400);
    }

    next();
  }

  /**
   * Validate query parameters
   */
  public validateQueryParams(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      type: Joi.string().valid('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER').optional(),
      status: Joi.string().valid('UPLOADED', 'PROCESSING', 'ANALYZED', 'VERIFIED', 'REJECTED', 'ARCHIVED').optional(),
      search: Joi.string().max(100).optional(),
      caseId: Joi.string().uuid().optional(),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().optional(),
      tags: Joi.string().max(100).optional()
    });

    const { error } = schema.validate(req.query);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate evidence update
   */
  public validateEvidenceUpdate(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      description: Joi.string().max(1000).optional(),
      tags: Joi.alternatives().try(
        Joi.array().items(Joi.string().max(50)),
        Joi.string().max(500)
      ).optional(),
      type: Joi.string().valid('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER').optional(),
      metadata: Joi.object().optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate evidence status update
   */
  public validateEvidenceStatus(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      status: Joi.string().valid('UPLOADED', 'PROCESSING', 'ANALYZED', 'VERIFIED', 'REJECTED', 'ARCHIVED').required(),
      notes: Joi.string().max(1000).optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate case creation
   */
  public validateCaseCreate(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      title: Joi.string().min(1).max(200).required(),
      description: Joi.string().max(2000).optional(),
      caseNumber: Joi.string().max(100).optional(),
      status: Joi.string().valid('OPEN', 'CLOSED', 'ARCHIVED', 'PENDING').optional(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
      tags: Joi.alternatives().try(
        Joi.array().items(Joi.string().max(50)),
        Joi.string().max(500)
      ).optional(),
      assignedTo: Joi.array().items(Joi.string().uuid()).optional(),
      location: Joi.string().max(200).optional(),
      incidentDate: Joi.date().iso().optional()
    });

    const { error } = schema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate case ID
   */
  public validateCaseId(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const { error } = schema.validate(req.params);
    if (error) {
      throw new AppError('Invalid case ID', 400);
    }

    next();
  }

  /**
   * Validate case update
   */
  public validateCaseUpdate(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      title: Joi.string().min(1).max(200).optional(),
      description: Joi.string().max(2000).optional(),
      caseNumber: Joi.string().max(100).optional(),
      status: Joi.string().valid('OPEN', 'CLOSED', 'ARCHIVED', 'PENDING').optional(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
      tags: Joi.alternatives().try(
        Joi.array().items(Joi.string().max(50)),
        Joi.string().max(500)
      ).optional(),
      assignedTo: Joi.array().items(Joi.string().uuid()).optional(),
      location: Joi.string().max(200).optional(),
      incidentDate: Joi.date().iso().optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid case ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate chain of custody transfer
   */
  public validateCustodyTransfer(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      newHandler: Joi.string().required(),
      notes: Joi.string().max(1000).required(),
      signature: Joi.string().optional(),
      location: Joi.object({
        name: Joi.string().optional(),
        address: Joi.string().optional(),
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional(),
      }).optional(),
      purpose: Joi.string().max(500).optional(),
      method: Joi.string().max(200).optional(),
      packaging: Joi.object({
        sealId: Joi.string().optional(),
        condition: Joi.string().optional(),
        tamperEvident: Joi.boolean().optional(),
      }).optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate AI analysis request
   */
  public validateAIAnalysisRequest(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      analysisType: Joi.string().valid('image', 'video', 'document', 'audio').required(),
      priority: Joi.number().integer().min(1).max(10).optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate analysis results
   */
  public validateAnalysis(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      analysisResults: Joi.object({
        confidence: Joi.number().min(0).max(100).required(),
        anomaliesDetected: Joi.boolean().required(),
        findings: Joi.array().items(Joi.object()).required(),
        metadata: Joi.object({
          analysisId: Joi.string().required(),
          evidenceId: Joi.string().required(),
          analysisType: Joi.string().optional(),
          completedAt: Joi.date().iso().required()
        }).required()
      }).required()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate blockchain submission
   */
  public validateBlockchainSubmission(req: Request, _res: Response, next: NextFunction): void {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required()
    });

    const bodySchema = Joi.object({
      network: Joi.string().optional()
    });

    const { error: paramsError } = paramsSchema.validate(req.params);
    if (paramsError) {
      throw new AppError('Invalid evidence ID', 400);
    }

    const { error: bodyError } = bodySchema.validate(req.body);
    if (bodyError) {
      throw new AppError(bodyError.details[0].message, 400);
    }

    next();
  }

  /**
   * Validate create/update report request
   */
  public validateCreateReport(req: Request, _res: Response, next: NextFunction): void {
    const schema = Joi.object({
      evidenceId: Joi.string().uuid().required(),
      analysisId: Joi.string().required()
    });

    const { error } = schema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    next();
  }
}