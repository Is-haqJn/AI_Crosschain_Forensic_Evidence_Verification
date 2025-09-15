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

      // Get analysis results from AI service
      const results = await this.aiAnalysisService.getAnalysisResults(
        evidence.aiAnalysis.analysisId
      );

      return results;
    } catch (error) {
      this.logger.error('Failed to get AI analysis results', {
        evidenceId,
        error: error instanceof Error ? error.message : String(error)
      });
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

      // Download file from IPFS
      const fileBuffer = await this.ipfsManager.downloadFile(evidence.ipfsHash);
      
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

      // Update evidence with analysis ID
      evidence.aiAnalysis = {
        analysisId: analysisResult.analysisId,
        timestamp: new Date(),
        results: null,
        confidence: 0,
        anomaliesDetected: false
      };

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
