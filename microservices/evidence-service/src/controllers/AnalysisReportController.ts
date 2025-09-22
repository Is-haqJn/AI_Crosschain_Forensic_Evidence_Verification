import { Response, NextFunction } from 'express';
import { AnalysisReportService } from '../services/AnalysisReportService.js';
import { AuthRequest } from '../middleware/AuthMiddleware.js';
import { AppError } from '../middleware/ErrorHandler.js';

/**
 * Analysis Report Controller
 * Handles HTTP requests for analysis report operations
 */
export class AnalysisReportController {
  private analysisReportService: AnalysisReportService;

  constructor() {
    this.analysisReportService = new AnalysisReportService();
  }

  /**
   * Get analysis report by evidence ID
   */
  public async getReportByEvidenceId(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const report = await this.analysisReportService.getReportByEvidenceId(id, req.user.id);

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get analysis report by analysis ID
   */
  public async getReportByAnalysisId(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      const report = await this.analysisReportService.getReportByAnalysisId(id, req.user.id);

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create or update analysis report
   */
  public async createOrUpdateReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { evidenceId, analysisId } = req.body;

      if (!req.user) {
        throw new AppError('User not authenticated', 401);
      }

      if (!evidenceId || !analysisId) {
        throw new AppError('Evidence ID and Analysis ID are required', 400);
      }

      const report = await this.analysisReportService.createOrUpdateReport(
        evidenceId,
        analysisId,
        req.user.id
      );

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
}

