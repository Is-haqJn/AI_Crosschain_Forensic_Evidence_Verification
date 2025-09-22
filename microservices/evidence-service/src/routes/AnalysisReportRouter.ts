import express from 'express';
import { AnalysisReportController } from '../controllers/AnalysisReportController.js';
import { AuthMiddleware } from '../middleware/AuthMiddleware.js';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware.js';

/**
 * Analysis Report Router
 * Handles routes for analysis report operations
 */
export class AnalysisReportRouter {
  private router: express.Router;
  private analysisReportController: AnalysisReportController;
  private authMiddleware: AuthMiddleware;
  private validationMiddleware: ValidationMiddleware;

  constructor() {
    this.router = express.Router();
    this.analysisReportController = new AnalysisReportController();
    this.authMiddleware = new AuthMiddleware();
    this.validationMiddleware = new ValidationMiddleware();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    /**
     * @swagger
     * /api/v1/reports/evidence/{id}:
     *   get:
     *     summary: Get analysis report by evidence ID
     *     description: Retrieves a detailed analysis report for the specified evidence
     *     tags: [Reports]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Evidence ID
     *     responses:
     *       200:
     *         description: Analysis report retrieved successfully
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     *       404:
     *         description: Report not found
     */
    this.router.get(
      '/evidence/:id',
      this.authMiddleware.authenticate,
      this.analysisReportController.getReportByEvidenceId.bind(this.analysisReportController)
    );

    /**
     * @swagger
     * /api/v1/reports/analysis/{id}:
     *   get:
     *     summary: Get analysis report by analysis ID
     *     description: Retrieves a detailed analysis report for the specified analysis
     *     tags: [Reports]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Analysis ID
     *     responses:
     *       200:
     *         description: Analysis report retrieved successfully
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     *       404:
     *         description: Report not found
     */
    this.router.get(
      '/analysis/:id',
      this.authMiddleware.authenticate,
      this.analysisReportController.getReportByAnalysisId.bind(this.analysisReportController)
    );

    /**
     * @swagger
     * /api/v1/reports:
     *   post:
     *     summary: Create or update analysis report
     *     description: Creates or updates an analysis report for the specified evidence and analysis
     *     tags: [Reports]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - evidenceId
     *               - analysisId
     *             properties:
     *               evidenceId:
     *                 type: string
     *                 description: Evidence ID
     *               analysisId:
     *                 type: string
     *                 description: Analysis ID
     *     responses:
     *       200:
     *         description: Analysis report created or updated successfully
     *       400:
     *         description: Invalid request
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    this.router.post(
      '/',
      this.authMiddleware.authenticate,
      this.validationMiddleware.validateCreateReport,
      this.analysisReportController.createOrUpdateReport.bind(this.analysisReportController)
    );
  }

  public getRouter(): express.Router {
    return this.router;
  }
}

export { AnalysisReportRouter };