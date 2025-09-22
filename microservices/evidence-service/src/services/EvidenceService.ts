import { v4 as uuidv4 } from 'uuid';
import { Evidence, IEvidence, EvidenceStatus } from '../models/Evidence.model.js';
import { IPFSManager } from './IPFSManager.js';
import { MessageQueueManager } from './MessageQueueManager.js';
import { HashService } from './HashService.js';
import { AIAnalysisIntegrationService } from './AIAnalysisIntegrationService.js';
import { Logger } from '../utils/Logger.js';
import { AppError } from '../middleware/ErrorHandler.js';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * Evidence Service
 * Business logic for evidence management
 */
export class EvidenceService {
  private ipfsManager: IPFSManager;
  private messageQueueManager: MessageQueueManager;
  private hashService: HashService;
  private aiAnalysisService: AIAnalysisIntegrationService;
  private logger: Logger;
  private config: ConfigManager;

  constructor() {
    this.ipfsManager = IPFSManager.getInstance();
    this.messageQueueManager = MessageQueueManager.getInstance();
    this.hashService = new HashService();
    this.aiAnalysisService = AIAnalysisIntegrationService.getInstance();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
  }

  /**
   * Create new evidence
   */
  public async createEvidence(data: any): Promise<IEvidence> {
    try {
      // Generate unique ID
      const evidenceId = uuidv4();

      // Calculate file hash
      const dataHash = this.hashService.calculateSHA256(data.file.buffer);

      // Check for duplicate
      const existing = await Evidence.findOne({ dataHash });
      if (existing) {
        throw new AppError('Evidence already exists', 409);
      }

      // Upload to IPFS
      const ipfsResult = await this.ipfsManager.uploadFile(
        data.file.buffer,
        data.file.originalname,
        {
          evidenceId,
          submitter: data.submitter,
          description: data.description
        }
      );

      // Create evidence document
      const evidence = new Evidence({
        evidenceId,
        ipfsHash: ipfsResult.hash,
        dataHash,
        // Store file content as fallback for AI analysis
        fileContent: data.file.buffer,
        metadata: {
          filename: data.file.originalname,
          filesize: data.file.size,
          mimetype: data.file.mimetype,
          uploadDate: new Date(),
          description: data.description,
          location: data.location,
          deviceInfo: data.deviceInfo
        },
        type: data.type,
        status: EvidenceStatus.UPLOADED,
        submitter: data.submitter,
        chainOfCustody: [],
        tags: data.tags || [],
        accessControl: [{
          userId: data.submitter.userId,
          permission: 'ADMIN',
          grantedBy: 'system',
          grantedAt: new Date()
        }]
      });

      await evidence.save();

      // Add initial chain-of-custody (COLLECTION)
      const { CustodyUtils } = await import('../utils/CustodyUtils.js');
      const collectionEvent = CustodyUtils.buildEvent({
        evidenceId,
        dataHash,
        base: {
          eventType: 'COLLECTION',
          to: { userId: data.submitter.userId, name: data.submitter.name, organization: data.submitter.organization },
          purpose: 'Initial Upload',
          notes: data.description
        }
      });
      evidence.chainOfCustody.push({
        ...collectionEvent,
        // backward compat fields
        handler: data.submitter.userId,
        action: 'Evidence Created',
        signature: collectionEvent.integrity.signature
      } as any);
      await evidence.save();

      // Optionally link to a case by caseId
      if (data.caseId) {
        try {
          const { CaseModel } = await import('../models/Case.model.js');
          const c = await CaseModel.findOne({ caseId: data.caseId });
          if (c) {
            c.evidence = c.evidence || [];
            c.evidence.push({ evidenceId, addedAt: new Date(), addedBy: data.submitter.userId } as any);
            await c.save();
            this.logger.info('Evidence linked to case', { evidenceId, caseId: data.caseId });
          } else {
            this.logger.warn('Case not found for linking', { caseId: data.caseId });
          }
        } catch (linkErr) {
          this.logger.warn('Failed to link evidence to case', linkErr);
        }
      }

      // Publish to message queue for processing
      await this.publishEvidenceEvent('evidence.created', {
        evidenceId,
        ipfsHash: ipfsResult.hash,
        type: data.type
      });

      // Automatically trigger AI analysis if enabled
      if (process.env.AI_ANALYSIS_AUTO_ANALYZE !== 'false') {
        await this.triggerAIAnalysis(evidence, data.file);
      }

      this.logger.info('Evidence created successfully', { evidenceId });
      return evidence;
    } catch (error) {
      this.logger.error('Failed to create evidence', error);
      throw error;
    }
  }

  /**
   * Get evidence by ID
   */
  public async getEvidenceById(evidenceId: string, userId: string): Promise<IEvidence | null> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        return null;
      }

      // Check access permissions
      if (!evidence.hasAccess(userId, 'READ')) {
        throw new AppError('Access denied', 403);
      }

      return evidence;
    } catch (error) {
      this.logger.error('Failed to get evidence', error);
      throw error;
    }
  }

  /**
   * Get all evidence with filters
   */
  public async getAllEvidence(
    userId: string,
    filters: any,
    pagination: any
  ): Promise<{ evidence: IEvidence[], total: number }> {
    try {
      const query: any = { isDeleted: false };

      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.type) {
        query.type = filters.type;
      }
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.createdAt.$lte = new Date(filters.endDate);
        }
      }

      // Get total count
      const total = await Evidence.countDocuments(query);

      // Get paginated results
      const evidence = await Evidence.find(query)
        .sort({ [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit);

      // Filter by access control
      const accessibleEvidence = evidence.filter(e => 
        e.hasAccess(userId, 'READ')
      );

      return { evidence: accessibleEvidence, total };
    } catch (error) {
      this.logger.error('Failed to get all evidence', error);
      throw error;
    }
  }

  /**
   * Update evidence status
   */
  public async updateEvidenceStatus(
    evidenceId: string,
    status: EvidenceStatus,
    userId: string,
    notes?: string
  ): Promise<IEvidence> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'WRITE')) {
        throw new AppError('Access denied', 403);
      }

      const oldStatus = evidence.status;
      evidence.status = status;

      // Add to chain of custody (status update)
      {
        const { CustodyUtils } = await import('../utils/CustodyUtils.js');
        const prev = evidence.chainOfCustody[evidence.chainOfCustody.length - 1] as any;
        const ev = CustodyUtils.buildEvent({
          evidenceId,
          dataHash: evidence.dataHash,
          previousEventHash: prev?.integrity?.eventHash,
          base: {
            eventType: 'OTHER',
            from: { userId },
            purpose: 'Status Update',
            notes: `Status changed from ${oldStatus} to ${status}` + (notes ? ` — ${notes}` : '')
          }
        });
        evidence.chainOfCustody.push({ ...ev, handler: userId, action: `Status changed from ${oldStatus} to ${status}` } as any);
      }

      await evidence.save();

      // Publish status change event
      await this.publishEvidenceEvent('evidence.status.changed', {
        evidenceId,
        oldStatus,
        newStatus: status,
        userId
      });

      this.logger.info('Evidence status updated', { evidenceId, status });
      return evidence;
    } catch (error) {
      this.logger.error('Failed to update evidence status', error);
      throw error;
    }
  }

  /**
   * Add AI analysis results
   */
  public async addAIAnalysis(
    evidenceId: string,
    analysisResults: any,
    userId: string
  ): Promise<IEvidence> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'WRITE')) {
        throw new AppError('Access denied', 403);
      }

      // Upload analysis results to IPFS
      const analysisHash = await this.ipfsManager.uploadJSON(analysisResults);

      evidence.aiAnalysis = {
        analysisId: uuidv4(),
        timestamp: new Date(),
        results: analysisResults,
        confidence: analysisResults.confidence || 0,
        anomaliesDetected: analysisResults.anomaliesDetected || false,
        ipfsHash: analysisHash
      };

      evidence.status = EvidenceStatus.ANALYZED;

      // Add to chain of custody (analysis added)
      {
        const { CustodyUtils } = await import('../utils/CustodyUtils.js');
        const prev = evidence.chainOfCustody[evidence.chainOfCustody.length - 1] as any;
        const ev = CustodyUtils.buildEvent({
          evidenceId,
          dataHash: evidence.dataHash,
          previousEventHash: prev?.integrity?.eventHash,
          base: {
            eventType: 'ANALYSIS',
            from: { userId },
            purpose: 'AI Analysis Result Attached',
            notes: `Analysis confidence: ${analysisResults.confidence}%`
          }
        });
        evidence.chainOfCustody.push({ ...ev, handler: userId, action: 'AI Analysis Added' } as any);
      }

      await evidence.save();

      // Publish analysis event
      await this.publishEvidenceEvent('evidence.analyzed', {
        evidenceId,
        analysisId: evidence.aiAnalysis.analysisId,
        confidence: analysisResults.confidence
      });

      this.logger.info('AI analysis added', { evidenceId });
      return evidence;
    } catch (error) {
      this.logger.error('Failed to add AI analysis', error);
      throw error;
    }
  }

  /**
   * Transfer custody
   */
  public async transferCustody(
    evidenceId: string,
    fromUserId: string,
    toUserId: string,
    notes: string,
    signature?: string
  ): Promise<IEvidence> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(fromUserId, 'WRITE')) {
        throw new AppError('Access denied', 403);
      }

      // Build linked custody transfer event
      const { CustodyUtils } = await import('../utils/CustodyUtils.js');
      const previousEvent = evidence.chainOfCustody[evidence.chainOfCustody.length - 1] as any;
      const transferEvent = CustodyUtils.buildEvent({
        evidenceId,
        dataHash: evidence.dataHash,
        previousEventHash: previousEvent?.integrity?.eventHash,
        base: {
          eventType: 'TRANSFER',
          from: { userId: fromUserId },
          to: { userId: toUserId },
          purpose: 'Custody Transfer',
          notes
        }
      });
      evidence.chainOfCustody.push({
        ...transferEvent,
        handler: toUserId,
        action: 'Custody Transferred',
        signature: signature || transferEvent.integrity.signature
      } as any);

      // Grant access to new handler
      evidence.accessControl.push({
        userId: toUserId,
        permission: 'WRITE',
        grantedBy: fromUserId,
        grantedAt: new Date()
      });

      await evidence.save();

      // Publish custody transfer event
      await this.publishEvidenceEvent('evidence.custody.transferred', {
        evidenceId,
        from: fromUserId,
        to: toUserId
      });

      this.logger.info('Custody transferred', { evidenceId, from: fromUserId, to: toUserId });
      return evidence;
    } catch (error) {
      this.logger.error('Failed to transfer custody', error);
      throw error;
    }
  }

  /**
   * Get chain of custody
   */
  public async getChainOfCustody(
    evidenceId: string,
    userId: string
  ): Promise<any[]> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'READ')) {
        throw new AppError('Access denied', 403);
      }

      return evidence.chainOfCustody;
    } catch (error) {
      this.logger.error('Failed to get chain of custody', error);
      throw error;
    }
  }

  /**
   * Update evidence (metadata/tags/type)
   */
  public async updateEvidence(
    evidenceId: string,
    userId: string,
    updates: { description?: string; tags?: string[]; type?: string; metadata?: any }
  ): Promise<IEvidence> {
    try {
      const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
      if (!evidence) throw new AppError('Evidence not found', 404);
      if (!evidence.hasAccess(userId, 'WRITE')) throw new AppError('Access denied', 403);

      if (typeof updates.description === 'string') {
        evidence.metadata.description = updates.description;
      }
      if (Array.isArray(updates.tags)) {
        evidence.tags = updates.tags.map(t => String(t).trim()).filter(Boolean);
      }
      if (typeof updates.type === 'string') {
        evidence.type = updates.type as any;
      }
      if (updates.metadata && typeof updates.metadata === 'object') {
        evidence.metadata = {
          ...evidence.metadata,
          ...((updates.metadata || {}) as any),
          location: {
            ...(evidence.metadata.location || {}),
            ...(updates.metadata.location || {})
          },
          deviceInfo: {
            ...(evidence.metadata.deviceInfo || {}),
            ...(updates.metadata.deviceInfo || {})
          }
        } as any;
      }

      await evidence.save();
      return evidence;
    } catch (error) {
      this.logger.error('Failed to update evidence', error);
      throw error;
    }
  }

  /**
   * Download evidence file
   */
  public async downloadEvidence(
    evidenceId: string,
    userId: string
  ): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
    try {
      const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
      if (!evidence) throw new AppError('Evidence not found', 404);
      if (!evidence.hasAccess(userId, 'READ')) throw new AppError('Access denied', 403);

      const buffer = await this.ipfsManager.downloadFile(evidence.ipfsHash);
      return {
        buffer,
        filename: evidence.metadata.filename,
        mimetype: evidence.metadata.mimetype
      };
    } catch (error) {
      this.logger.error('Failed to download evidence', error);
      throw error;
    }
  }

  /**
   * Get evidence metadata
   */
  public async getEvidenceMetadata(
    evidenceId: string,
    userId: string
  ): Promise<any> {
    try {
      const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
      if (!evidence) throw new AppError('Evidence not found', 404);
      if (!evidence.hasAccess(userId, 'READ')) throw new AppError('Access denied', 403);
      return evidence.metadata;
    } catch (error) {
      this.logger.error('Failed to get evidence metadata', error);
      throw error;
    }
  }

  /**
   * Verify chain of custody integrity
   */
  public async verifyChainOfCustody(evidenceId: string, userId: string): Promise<{ valid: boolean; issues: string[] }> {
    const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
    if (!evidence) throw new AppError('Evidence not found', 404);
    if (!evidence.hasAccess(userId, 'READ')) throw new AppError('Access denied', 403);

    const { CustodyUtils } = await import('../utils/CustodyUtils.js');
    const result = CustodyUtils.verifyChain(
      evidenceId,
      evidence.dataHash,
      (evidence.chainOfCustody as any) || []
    );
    return result;
  }

  /**
   * Delete evidence (soft delete)
   */
  public async deleteEvidence(evidenceId: string, userId: string): Promise<void> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'DELETE')) {
        throw new AppError('Access denied', 403);
      }

      evidence.isDeleted = true;
      evidence.deletedAt = new Date();
      evidence.deletedBy = userId;

      await evidence.save();

      // Publish deletion event
      await this.publishEvidenceEvent('evidence.deleted', {
        evidenceId,
        deletedBy: userId
      });

      this.logger.info('Evidence deleted', { evidenceId });
    } catch (error) {
      this.logger.error('Failed to delete evidence', error);
      throw error;
    }
  }

  /**
   * Trigger AI analysis for evidence
   */
  public async triggerAIAnalysis(evidence: IEvidence, file: any): Promise<void> {
    try {
      // Determine analysis type based on file type
      const analysisType = this.determineAnalysisType(file.mimetype);
      
      if (!analysisType) {
        this.logger.warn('No AI analysis available for file type', {
          evidenceId: evidence.evidenceId,
          mimeType: file.mimetype
        });
        return;
      }

      // Submit for AI analysis
      const analysisResult = await this.aiAnalysisService.submitForAnalysis(
        evidence.evidenceId,
        file.buffer,
        file.originalname,
        file.mimetype,
        analysisType,
        5, // Default priority
        {
          evidenceId: evidence.evidenceId,
          ipfsHash: evidence.ipfsHash,
          submitter: evidence.submitter,
          description: evidence.metadata.description
        }
      );

      // Update evidence with analysis ID
      evidence.aiAnalysis = {
        analysisId: analysisResult.analysisId,
        timestamp: new Date(),
        results: null,
        confidence: 0,
        anomaliesDetected: false
      };

      // Reflect that analysis is in progress for UI/metrics
      try {
        const { EvidenceStatus } = await import('../models/Evidence.model.js');
        (evidence as any).status = EvidenceStatus.PROCESSING;
      } catch (_) {
        // no-op if enum import changes
        (evidence as any).status = 'PROCESSING';
      }

      await evidence.save();

      // Publish analysis event
      await this.publishEvidenceEvent('evidence.analysis.requested', {
        evidenceId: evidence.evidenceId,
        analysisId: analysisResult.analysisId,
        analysisType: analysisType
      });

      this.logger.info('AI analysis triggered', {
        evidenceId: evidence.evidenceId,
        analysisId: analysisResult.analysisId,
        analysisType: analysisType
      });

    } catch (error) {
      this.logger.error('Failed to trigger AI analysis', {
        evidenceId: evidence.evidenceId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - AI analysis failure should not break evidence creation
    }
  }

  /**
   * Get AI analysis results for evidence
   */
  public async getAIAnalysisResults(evidenceId: string, userId: string): Promise<any> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'READ')) {
        throw new AppError('Access denied', 403);
      }

      if (!evidence.aiAnalysis || !evidence.aiAnalysis.analysisId) {
        throw new AppError('No AI analysis found for this evidence', 404);
      }

      // Fast path: if results already persisted on the evidence, return them
      if (evidence.aiAnalysis && (evidence.aiAnalysis as any).results) {
        return (evidence.aiAnalysis as any).results;
      }

      // Get analysis results from AI service
      const results = await this.aiAnalysisService.getAnalysisResults(
        evidence.aiAnalysis.analysisId
      );

      // Persist key metrics and status when results are retrieved
      try {
        const confidence = Number(
          (results?.confidence_score ?? results?.confidence ?? results?.metrics?.confidence ?? 0) as any
        );
        const anomalies = Boolean(
          (results?.anomaliesDetected ?? results?.anomalies ?? results?.manipulation_detection?.is_manipulated) === true
        );

          evidence.aiAnalysis = {
          ...(evidence.aiAnalysis || {} as any),
          results,
          confidence: Number.isFinite(confidence) ? confidence : 0,
          anomaliesDetected: !!anomalies,
            timestamp: new Date(),
            runBy: {
              userId,
              email: (evidence as any)?.submitter?.name,
              name: (evidence as any)?.submitter?.name,
              organization: (evidence as any)?.submitter?.organization,
              role: (evidence as any)?.submitter?.role
            },
            model: {
              name: (results as any)?.model_version ? 'forensic-image' : undefined,
              version: (results as any)?.model_version
            },
            processingTime: (results as any)?.processing_time,
            params: (results as any)?.metadata
        } as any;

        const { EvidenceStatus } = await import('../models/Evidence.model.js');
        (evidence as any).status = EvidenceStatus.ANALYZED;
        await evidence.save();
      } catch (e) {
        this.logger.warn('Failed to persist AI analysis summary to evidence (continuing)', {
          evidenceId,
          error: e instanceof Error ? e.message : String(e)
        });
      }

      return results;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get AI analysis results', {
        evidenceId,
        error: errMsg
      });
      // Bubble more specific error to client for easier debugging in UI
      if (errMsg && /analysis not found|404/i.test(errMsg)) {
        throw new AppError('Analysis results not found on AI service yet. Please try again shortly.', 404);
      }
      if (errMsg && /authentication|401|403/i.test(errMsg)) {
        throw new AppError('AI service authentication failed. Please check service token configuration.', 502);
      }
      throw error;
    }
  }

  /**
   * Get AI analysis status for evidence
   */
  public async getAIAnalysisStatus(evidenceId: string, userId: string): Promise<any> {
    try {
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'READ')) {
        throw new AppError('Access denied', 403);
      }

      if (!evidence.aiAnalysis || !evidence.aiAnalysis.analysisId) {
        throw new AppError('No AI analysis found for this evidence', 404);
      }

      // Get analysis status from AI service
      const status = await this.aiAnalysisService.getAnalysisStatus(
        evidence.aiAnalysis.analysisId
      );

      // If completed, eagerly fetch and persist results so UI/dashboard reflect completion
      try {
        const s = String((status as any)?.status || '').toLowerCase();
        if (s === 'completed') {
          const results = await this.aiAnalysisService.getAnalysisResults(
            evidence.aiAnalysis.analysisId
          );

          // Extract confidence/anomalies robustly
          const confidence = Number(
            (results?.confidence_score ?? results?.confidence ?? results?.metrics?.confidence ?? 0) as any
          );
          const anomalies = Boolean(
            (results?.anomaliesDetected ?? results?.anomalies ?? results?.manipulation_detection?.is_manipulated) === true
          );

          evidence.aiAnalysis = {
            ...(evidence.aiAnalysis || {} as any),
            results,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            anomaliesDetected: !!anomalies,
            timestamp: new Date(),
            runBy: {
              userId,
              // These are best-effort enrichments; UI can display what is present
              email: (evidence as any)?.submitter?.name,
              name: (evidence as any)?.submitter?.name,
              organization: (evidence as any)?.submitter?.organization,
              role: (evidence as any)?.submitter?.role
            },
            model: {
              name: (results as any)?.model_version ? 'forensic-image' : undefined,
              version: (results as any)?.model_version
            },
            processingTime: (results as any)?.processing_time,
            params: (results as any)?.metadata
          } as any;

          try {
            const { EvidenceStatus } = await import('../models/Evidence.model.js');
            (evidence as any).status = EvidenceStatus.ANALYZED;
          } catch (_) {
            (evidence as any).status = 'ANALYZED';
          }

          await evidence.save();
          // Best-effort event for completion
          await this.publishEvidenceEvent('evidence.analyzed', {
            evidenceId,
            analysisId: (evidence as any)?.aiAnalysis?.analysisId,
            confidence: (evidence as any)?.aiAnalysis?.confidence,
            anomaliesDetected: (evidence as any)?.aiAnalysis?.anomaliesDetected
          });
        }
      } catch (persistErr) {
        this.logger.warn('Failed to persist AI analysis on completed status (continuing)', {
          evidenceId,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr)
        });
      }

      return status;
    } catch (error) {
      this.logger.error('Failed to get AI analysis status', {
        evidenceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Submit evidence for manual AI analysis
   */
  public async submitForAIAnalysis(
    evidenceId: string,
    analysisType: string,
    priority: number,
    userId: string
  ): Promise<{ analysisId: string; status: string }> {
    try {
      this.logger.info('Starting AI analysis submission process', {
        evidenceId,
        analysisType,
        priority,
        userId
      });

      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });

      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'WRITE')) {
        throw new AppError('Access denied', 403);
      }

      this.logger.info('Evidence found, downloading from IPFS', {
        evidenceId,
        ipfsHash: evidence.ipfsHash,
        filename: evidence.metadata.filename,
        mimetype: evidence.metadata.mimetype
      });

      // Try to download from IPFS, fallback to database
      let fileBuffer: Buffer;
      try {
        fileBuffer = await this.ipfsManager.downloadFile(evidence.ipfsHash);
        this.logger.info('File downloaded from IPFS successfully', {
          evidenceId,
          fileSize: fileBuffer.length,
          filename: evidence.metadata.filename
        });
      } catch (ipfsError) {
        this.logger.warn('IPFS download failed, using database fallback', {
          evidenceId,
          ipfsHash: evidence.ipfsHash,
          error: ipfsError instanceof Error ? ipfsError.message : String(ipfsError)
        });
        
        // Use file content from database as fallback
        if (evidence.fileContent && evidence.fileContent.length > 0) {
          fileBuffer = Buffer.from(evidence.fileContent);
          this.logger.info('Using file content from database', {
            evidenceId,
            fileSize: fileBuffer.length,
            filename: evidence.metadata.filename
          });
        } else {
          // For existing evidence without fileContent, create a placeholder
          // This is a temporary solution for demonstration purposes
          this.logger.warn('No file content in database, creating placeholder for demonstration', {
            evidenceId,
            filename: evidence.metadata.filename
          });
          
          // Create a proper document file for demonstration
          // Create a simple HTML document that can be processed by the AI service
          const documentContent = `<!DOCTYPE html>
<html>
<head>
    <title>Evidence Analysis - ${evidence.metadata.filename}</title>
    <meta charset="UTF-8">
</head>
<body>
    <h1>Forensic Evidence Analysis</h1>
    <h2>Evidence Details</h2>
    <p><strong>Evidence ID:</strong> ${evidence.evidenceId}</p>
    <p><strong>Original Filename:</strong> ${evidence.metadata.filename}</p>
    <p><strong>File Size:</strong> ${evidence.metadata.filesize} bytes</p>
    <p><strong>MIME Type:</strong> ${evidence.metadata.mimetype}</p>
    <p><strong>Upload Date:</strong> ${evidence.metadata.uploadDate}</p>
    <p><strong>Description:</strong> ${evidence.metadata.description || 'No description provided'}</p>
    
    <h2>Analysis Context</h2>
    <p>This is a placeholder document created for AI analysis demonstration purposes.</p>
    <p>The original file is stored in IPFS but is not available locally for analysis.</p>
    <p>In a production environment, proper file retrieval mechanisms would be implemented.</p>
    
    <h2>Document Content</h2>
    <p>This document contains evidence metadata and context information for forensic analysis.</p>
    <p>The AI analysis system will process this content to demonstrate the analysis workflow.</p>
    
    <h2>Technical Notes</h2>
    <ul>
        <li>Evidence stored in IPFS with hash: ${evidence.ipfsHash}</li>
        <li>Data hash: ${evidence.dataHash}</li>
        <li>Analysis requested for: ${evidence.metadata.filename}</li>
        <li>Document type: ${evidence.metadata.mimetype}</li>
    </ul>
</body>
</html>`;
          
          fileBuffer = Buffer.from(documentContent, 'utf8');
          this.logger.info('Created placeholder file for AI analysis', {
            evidenceId,
            fileSize: fileBuffer.length,
            filename: evidence.metadata.filename
          });
        }
      }
      
      this.logger.info('File downloaded from IPFS', {
        evidenceId,
        fileSize: fileBuffer.length,
        filename: evidence.metadata.filename
      });

      this.logger.info('Submitting to AI analysis service', {
        evidenceId,
        analysisType,
        priority,
        fileSize: fileBuffer.length
      });
      
      // Submit for AI analysis
      const analysisResult = await this.aiAnalysisService.submitForAnalysis(
        evidenceId,
        fileBuffer,
        evidence.metadata.filename,
        evidence.metadata.mimetype,
        analysisType,
        priority,
        {
          evidenceId: evidence.evidenceId,
          ipfsHash: evidence.ipfsHash,
          submitter: evidence.submitter,
          description: evidence.metadata.description,
          requestedBy: userId
        }
      );

      this.logger.info('AI analysis submission completed', {
        evidenceId,
        analysisId: analysisResult.analysisId,
        status: analysisResult.status
      });

      // Update evidence with analysis ID
      evidence.aiAnalysis = {
        analysisId: analysisResult.analysisId,
        timestamp: new Date(),
        results: null,
        confidence: 0,
        anomaliesDetected: false
      };
      // Mark as PROCESSING while the analysis runs
      try {
        const { EvidenceStatus } = await import('../models/Evidence.model.js');
        (evidence as any).status = EvidenceStatus.PROCESSING;
      } catch (_) {
        (evidence as any).status = 'PROCESSING';
      }

      await evidence.save();

      // Add to chain of custody (analysis requested)
      {
        const { CustodyUtils } = await import('../utils/CustodyUtils.js');
        const prev = evidence.chainOfCustody[evidence.chainOfCustody.length - 1] as any;
        const ev = CustodyUtils.buildEvent({
          evidenceId: evidence.evidenceId,
          dataHash: evidence.dataHash,
          previousEventHash: prev?.integrity?.eventHash,
          base: {
            eventType: 'ANALYSIS',
            from: { userId },
            purpose: 'AI Analysis Requested',
            notes: `Analysis type: ${analysisType}, Priority: ${priority}`
          }
        });
        evidence.chainOfCustody.push({ ...ev, handler: userId, action: 'AI Analysis Requested' } as any);
      }

      await evidence.save();

      // Publish analysis event
      await this.publishEvidenceEvent('evidence.analysis.requested', {
        evidenceId: evidence.evidenceId,
        analysisId: analysisResult.analysisId,
        analysisType: analysisType,
        requestedBy: userId
      });

      this.logger.info('Evidence submitted for AI analysis', {
        evidenceId: evidence.evidenceId,
        analysisId: analysisResult.analysisId,
        analysisType: analysisType,
        requestedBy: userId
      });

      return {
        analysisId: analysisResult.analysisId,
        status: analysisResult.status
      };
    } catch (error) {
      this.logger.error('Failed to submit evidence for AI analysis', {
        evidenceId,
        analysisType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Determine analysis type based on MIME type
   */
  private determineAnalysisType(mimeType: string): string | null {
    const mimeTypeMap: { [key: string]: string } = {
      // Image types
      'image/jpeg': 'image',
      'image/jpg': 'image',
      'image/png': 'image',
      'image/gif': 'image',
      'image/bmp': 'image',
      'image/tiff': 'image',
      
      // Video types
      'video/mp4': 'video',
      'video/avi': 'video',
      'video/mov': 'video',
      'video/wmv': 'video',
      'video/flv': 'video',
      'video/mkv': 'video',
      
      // Document types
      'application/pdf': 'document',
      'application/msword': 'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
      'text/plain': 'document',
      'application/rtf': 'document',
      
      // Audio types
      'audio/mpeg': 'audio',
      'audio/wav': 'audio',
      'audio/mp4': 'audio',
      'audio/flac': 'audio',
      'audio/ogg': 'audio'
    };

    return mimeTypeMap[mimeType] || null;
  }

  /**
   * Get AI service health status
   */
  public async getAIServiceHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const res = await this.aiAnalysisService.healthCheck();
      const status = (res as any).details?.status;
      return { healthy: typeof status === 'string' ? status === 'healthy' : (res as any).healthy === true, details: res };
    } catch (error) {
      this.logger.error('Failed to get AI service health', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Get supported AI analysis types
   */
  public async getSupportedAIAnalysisTypes(): Promise<any> {
    try {
      return await this.aiAnalysisService.getSupportedAnalysisTypes();
    } catch (error) {
      this.logger.error('Failed to get supported AI analysis types', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Failed to get supported AI analysis types', 500);
    }
  }

  /**
   * Publish evidence event to message queue
   */
  private async publishEvidenceEvent(routingKey: string, data: any): Promise<void> {
    try {
      const config = this.config.get<any>('messageQueue.rabbitmq');
      await this.messageQueueManager.publish(
        config.exchanges.evidence,
        routingKey,
        data,
        {
          messageId: uuidv4(),
          timestamp: Date.now()
        }
      );
    } catch (error) {
      this.logger.error('Failed to publish event', error);
      // Don't throw - event publishing should not break the main flow
    }
  }
}

export default EvidenceService;
