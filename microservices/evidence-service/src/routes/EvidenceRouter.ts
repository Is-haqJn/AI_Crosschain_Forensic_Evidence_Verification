import { Router } from 'express';
import { EvidenceController } from '../controllers/EvidenceController.js';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware.js';
import { AuthMiddleware } from '../middleware/AuthMiddleware.js';
import { FileUploadMiddleware } from '../middleware/FileUploadMiddleware.js';
import { ErrorHandler } from '../middleware/ErrorHandler.js';

/**
 * Evidence Router
 * Handles all evidence-related routes
 */
export class EvidenceRouter {
  private router: Router;
  private evidenceController: EvidenceController;
  private validationMiddleware: ValidationMiddleware;
  private authMiddleware: AuthMiddleware;
  private fileUploadMiddleware: FileUploadMiddleware;
  private errorHandler: ErrorHandler;

  constructor() {
    this.router = Router();
    this.evidenceController = new EvidenceController();
    this.validationMiddleware = new ValidationMiddleware();
    this.authMiddleware = new AuthMiddleware();
    this.fileUploadMiddleware = new FileUploadMiddleware();
    this.errorHandler = new ErrorHandler();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Upload evidence
    this.router.post(
      '/upload',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['investigator', 'admin']),
      this.fileUploadMiddleware.single('evidence'),
      this.validationMiddleware.validateEvidenceUpload,
      this.errorHandler.asyncHandler(this.evidenceController.uploadEvidence.bind(this.evidenceController))
    );

    // Get evidence by ID
    this.router.get(
      '/:id',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.getEvidence.bind(this.evidenceController))
    );

    // Get all evidence
    this.router.get(
      '/',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateQueryParams,
      this.errorHandler.asyncHandler(this.evidenceController.getAllEvidence.bind(this.evidenceController))
    );

    // Update evidence (metadata/tags/type)
    this.router.put(
      '/:id',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceUpdate,
      this.errorHandler.asyncHandler(this.evidenceController.updateEvidence.bind(this.evidenceController))
    );

    // Update evidence status
    this.router.put(
      '/:id/status',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['validator', 'admin']),
      this.validationMiddleware.validateEvidenceStatus,
      this.errorHandler.asyncHandler(this.evidenceController.updateEvidenceStatus.bind(this.evidenceController))
    );

    // Add AI analysis
    this.router.post(
      '/:id/analysis',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['validator', 'admin', 'service']),
      this.validationMiddleware.validateAnalysis,
      this.errorHandler.asyncHandler(this.evidenceController.addAIAnalysis.bind(this.evidenceController))
    );

    // Submit evidence for AI analysis
    this.router.post(
      '/:id/ai-analysis',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['investigator', 'validator', 'admin']),
      this.validationMiddleware.validateAIAnalysisRequest,
      this.errorHandler.asyncHandler(this.evidenceController.submitForAIAnalysis.bind(this.evidenceController))
    );

    // Get AI analysis results
    this.router.get(
      '/:id/ai-analysis/results',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.getAIAnalysisResults.bind(this.evidenceController))
    );

    // Get AI analysis status
    this.router.get(
      '/:id/ai-analysis/status',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.getAIAnalysisStatus.bind(this.evidenceController))
    );

    // Get supported AI analysis types
    this.router.get(
      '/ai-analysis/types',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.errorHandler.asyncHandler(this.evidenceController.getSupportedAIAnalysisTypes.bind(this.evidenceController))
    );

    // Get AI service health (no auth needed)
    this.router.get(
      '/ai-analysis/health',
      this.errorHandler.asyncHandler(this.evidenceController.getAIServiceHealth.bind(this.evidenceController))
    );

    // Transfer custody
    this.router.post(
      '/:id/custody',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateCustodyTransfer,
      this.errorHandler.asyncHandler(this.evidenceController.transferCustody.bind(this.evidenceController))
    );

    // Get chain of custody
    this.router.get(
      '/:id/custody',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.getChainOfCustody.bind(this.evidenceController))
    );

    // Verify chain of custody
    this.router.get(
      '/:id/custody/verify',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.verifyChainOfCustody.bind(this.evidenceController))
    );

    // Cross-chain bridge health
    this.router.get(
      '/crosschain/health',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.errorHandler.asyncHandler(this.evidenceController.getCrossChainHealth.bind(this.evidenceController))
    );

    // Submit to blockchain
    this.router.post(
      '/:id/blockchain',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['investigator', 'admin']),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.submitToBlockchain.bind(this.evidenceController))
    );

    // Verify on blockchain
    this.router.get(
      '/:id/verify',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.verifyOnBlockchain.bind(this.evidenceController))
    );

    // Download evidence file
    this.router.get(
      '/:id/download',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.downloadEvidence.bind(this.evidenceController))
    );

    // Get evidence metadata
    this.router.get(
      '/:id/metadata',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.getEvidenceMetadata.bind(this.evidenceController))
    );

    // Delete evidence (soft delete)
    this.router.delete(
      '/:id',
      this.authMiddleware.authenticate.bind(this.authMiddleware),
      this.authMiddleware.authorize(['admin']),
      this.validationMiddleware.validateEvidenceId,
      this.errorHandler.asyncHandler(this.evidenceController.deleteEvidence.bind(this.evidenceController))
    );
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default EvidenceRouter;
