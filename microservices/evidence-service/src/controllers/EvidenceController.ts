import { Response, NextFunction } from 'express';
import { EvidenceService } from '../services/EvidenceService.js';
import { CrossChainService } from '../services/CrossChainService.js';
import { Logger } from '../utils/Logger.js';
import { AuthRequest } from '../middleware/AuthMiddleware.js';
import { AppError } from '../middleware/ErrorHandler.js';

/**
 * Evidence Controller
 * Handles HTTP requests for evidence operations
 */
export class EvidenceController {
  private evidenceService: EvidenceService;
  private blockchainService: CrossChainService;
  private logger: Logger;

  constructor() {
    this.evidenceService = new EvidenceService();
    this.blockchainService = new CrossChainService();
    this.logger = Logger.getInstance();
  }

  /**
   * Update evidence (metadata/tags/type)
   */
  public async updateEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const updates = {
        description: req.body.description,
        tags: Array.isArray(req.body.tags) ? req.body.tags : (typeof req.body.tags === 'string' ? req.body.tags.split(',') : undefined),
        type: req.body.type,
        metadata: req.body.metadata
      };

      const evidence = await this.evidenceService.updateEvidence(
        id,
        req.user.id,
        updates
      );

      res.status(200).json({ success: true, data: evidence });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload evidence
   */
  public async uploadEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const evidenceData = {
        file: req.file,
        description: req.body.description,
        location: req.body.location ? JSON.parse(req.body.location) : undefined,
        deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : undefined,
        type: req.body.type,
        tags: req.body.tags ? req.body.tags.split(',') : [],
        caseId: typeof req.body.caseId === 'string' && req.body.caseId.trim() !== '' ? req.body.caseId.trim() : undefined,
        caseNumber: typeof req.body.caseNumber === 'string' && req.body.caseNumber.trim() !== '' ? req.body.caseNumber.trim() : undefined,
        submitter: {
          userId: req.user.id,
          name: req.user.email,
          organization: req.user.organization,
          role: req.user.role
        }
      };

      const evidence = await this.evidenceService.createEvidence(evidenceData);

      this.logger.info('Evidence uploaded successfully', {
        evidenceId: evidence.evidenceId,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Evidence uploaded successfully',
        data: evidence
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get evidence by ID
   */
  public async getEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const evidence = await this.evidenceService.getEvidenceById(id, req.user.id);

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      res.status(200).json({
        success: true,
        data: evidence
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all evidence
   */
  public async getAllEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const filters = {
        status: req.query.status as string,
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
        sortBy: req.query.sortBy as string || 'createdAt',
        sortOrder: req.query.sortOrder as string || 'desc'
      };

      const result = await this.evidenceService.getAllEvidence(
        req.user.id,
        filters,
        pagination
      );

      res.status(200).json({
        success: true,
        data: result.evidence,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / pagination.limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update evidence status
   */
  public async updateEvidenceStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const evidence = await this.evidenceService.updateEvidenceStatus(
        id,
        status,
        req.user.id,
        notes
      );

      this.logger.info('Evidence status updated', {
        evidenceId: id,
        newStatus: status,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Evidence status updated successfully',
        data: evidence
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add AI analysis
   */
  public async addAIAnalysis(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { analysisResults } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const evidence = await this.evidenceService.addAIAnalysis(
        id,
        analysisResults,
        req.user.id
      );

      this.logger.info('AI analysis added', {
        evidenceId: id,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'AI analysis added successfully',
        data: evidence
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transfer custody
   */
  public async transferCustody(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { newHandler, notes, signature } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const evidence = await this.evidenceService.transferCustody(
        id,
        req.user.id,
        newHandler,
        notes,
        signature
      );

      this.logger.info('Custody transferred', {
        evidenceId: id,
        from: req.user.id,
        to: newHandler
      });

      res.status(200).json({
        success: true,
        message: 'Custody transferred successfully',
        data: evidence
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chain of custody
   */
  public async getChainOfCustody(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const chainOfCustody = await this.evidenceService.getChainOfCustody(
        id,
        req.user.id
      );

      res.status(200).json({
        success: true,
        data: chainOfCustody
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify chain of custody integrity
   */
  public async verifyChainOfCustody(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }
      const result = await this.evidenceService.verifyChainOfCustody(id, req.user.id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get cross-chain bridge health
   */
  public async getCrossChainHealth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('User not authenticated', 401);
      const health = await this.blockchainService.health();
      res.status(200).json({ success: true, data: health });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Submit to blockchain
   */
  public async submitToBlockchain(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { network } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const result = await this.blockchainService.submitEvidence(
        id,
        (network as string) || 'sepolia',
        req.user.id
      );

      this.logger.info('Evidence submitted to blockchain', {
        evidenceId: id,
        network,
        transactionHash: result.transactionHash,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Evidence submitted to blockchain successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify on blockchain
   */
  public async verifyOnBlockchain(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { network } = req.query;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const result = await this.blockchainService.verifyEvidence(
        id,
        (network as string) || 'amoy'
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download evidence file
   */
  public async downloadEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!req.user) throw new AppError('User not authenticated', 401);

      const file = await this.evidenceService.downloadEvidence(id, req.user.id);

      res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename || 'evidence'}"`);
      res.status(200).send(file.buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get evidence metadata
   */
  public async getEvidenceMetadata(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!req.user) throw new AppError('User not authenticated', 401);

      const metadata = await this.evidenceService.getEvidenceMetadata(id, req.user.id);
      res.status(200).json({ success: true, data: metadata });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Submit evidence for AI analysis
   */
  public async submitForAIAnalysis(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { analysisType, priority } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      // Fire-and-forget to avoid long client waits. We'll persist analysis once created.
      setImmediate(async () => {
        try {
          const result = await this.evidenceService.submitForAIAnalysis(
            id,
            analysisType,
            priority || 5,
            req.user!.id
          );
          this.logger.info('Evidence submitted for AI analysis (bg)', {
            evidenceId: id,
            analysisType,
            priority,
            userId: req.user!.id,
            analysisId: result?.analysisId
          });
        } catch (err) {
          this.logger.error('Background AI analysis submission failed', err);
        }
      });

      res.status(202).json({ success: true, message: 'Analysis started' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get AI analysis results
   */
  public async getAIAnalysisResults(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const results = await this.evidenceService.getAIAnalysisResults(id, req.user.id);

      res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get AI analysis status
   */
  public async getAIAnalysisStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const status = await this.evidenceService.getAIAnalysisStatus(id, req.user.id);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get supported AI analysis types
   */
  public async getSupportedAIAnalysisTypes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const types = await this.evidenceService.getSupportedAIAnalysisTypes();

      res.status(200).json({
        success: true,
        data: types
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get AI service health
   */
  public async getAIServiceHealth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const health = await this.evidenceService.getAIServiceHealth();

      res.status(200).json({
        success: true,
        data: health
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete evidence (soft delete)
   */
  public async deleteEvidence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      await this.evidenceService.deleteEvidence(id, req.user.id);

      this.logger.info('Evidence deleted', {
        evidenceId: id,
        userId: req.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Evidence deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default EvidenceController;

