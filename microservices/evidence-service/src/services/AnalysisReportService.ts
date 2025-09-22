import { Logger } from '../utils/Logger.js';
import { AppError } from '../middleware/ErrorHandler.js';
import { AnalysisReport, IAnalysisReport } from '../models/AnalysisReport.model.js';
import { Evidence } from '../models/Evidence.model.js';
import { AIAnalysisIntegrationService } from './AIAnalysisIntegrationService.js';

/**
 * Analysis Report Service
 * Handles rich analysis report creation, retrieval and mapping
 */
export class AnalysisReportService {
  private logger: Logger;
  private aiAnalysisService: AIAnalysisIntegrationService;

  constructor() {
    this.logger = Logger.getInstance();
    this.aiAnalysisService = AIAnalysisIntegrationService.getInstance();
  }

  /**
   * Create or update analysis report from AI analysis results
   */
  public async createOrUpdateReport(
    evidenceId: string,
    analysisId: string,
    userId: string
  ): Promise<IAnalysisReport> {
    try {
      // Check if evidence exists and user has access
      const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'WRITE')) {
        throw new AppError('Access denied', 403);
      }

      // Check if analysis exists
      if (!evidence.aiAnalysis || !evidence.aiAnalysis.analysisId) {
        throw new AppError('No AI analysis found for this evidence', 404);
      }

      // Get analysis results from AI service
      const aiResults = await this.aiAnalysisService.getAnalysisResults(analysisId);
      if (!aiResults) {
        throw new AppError('Analysis results not found', 404);
      }

      // Determine report type based on evidence type
      const reportType = this.mapEvidenceTypeToReportType(evidence.type);

      // Check if report already exists
      let report = await AnalysisReport.findOne({ analysisId });

      // Map AI results to structured report format
      const mappedReport = this.mapAIResultsToReport(aiResults, reportType, evidenceId, analysisId, userId);

      if (report) {
        // Update existing report
        Object.assign(report, mappedReport);
      } else {
        // Create new report
        report = new AnalysisReport(mappedReport);
      }

      // Save report
      await report.save();

      this.logger.info('Analysis report created/updated', {
        evidenceId,
        analysisId,
        reportId: report.reportId
      });

      return report;
    } catch (error) {
      this.logger.error('Failed to create/update analysis report', {
        evidenceId,
        analysisId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get analysis report by evidence ID
   */
  public async getReportByEvidenceId(evidenceId: string, userId: string): Promise<IAnalysisReport> {
    try {
      // Check if evidence exists and user has access
      const evidence = await Evidence.findOne({ evidenceId, isDeleted: false });
      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }

      if (!evidence.hasAccess(userId, 'READ')) {
        throw new AppError('Access denied', 403);
      }

      // Check if analysis exists
      if (!evidence.aiAnalysis || !evidence.aiAnalysis.analysisId) {
        throw new AppError('No AI analysis found for this evidence', 404);
      }

      const analysisId = evidence.aiAnalysis.analysisId;

      // Try to find existing report
      let report = await AnalysisReport.findOne({ evidenceId });

      if (!report) {
        // Report doesn't exist yet, create it
        report = await this.createOrUpdateReport(evidenceId, analysisId, userId);
      }

      return report;
    } catch (error) {
      this.logger.error('Failed to get analysis report', {
        evidenceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get analysis report by analysis ID
   */
  public async getReportByAnalysisId(analysisId: string, userId: string): Promise<IAnalysisReport> {
    try {
      // Try to find existing report
      let report = await AnalysisReport.findOne({ analysisId });

      if (!report) {
        // Find evidence by analysis ID
        const evidence = await Evidence.findOne({ 'aiAnalysis.analysisId': analysisId, isDeleted: false });
        if (!evidence) {
          throw new AppError('Evidence with this analysis ID not found', 404);
        }

        if (!evidence.hasAccess(userId, 'READ')) {
          throw new AppError('Access denied', 403);
        }

        // Create report
        report = await this.createOrUpdateReport(evidence.evidenceId, analysisId, userId);
      } else {
        // Check if user has access to the evidence
        const evidence = await Evidence.findOne({ evidenceId: report.evidenceId, isDeleted: false });
        if (!evidence || !evidence.hasAccess(userId, 'READ')) {
          throw new AppError('Access denied', 403);
        }
      }

      return report;
    } catch (error) {
      this.logger.error('Failed to get analysis report by analysis ID', {
        analysisId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Map evidence type to report type
   */
  private mapEvidenceTypeToReportType(evidenceType: string): string {
    const typeMap: { [key: string]: string } = {
      'IMAGE': 'image',
      'VIDEO': 'video',
      'DOCUMENT': 'document',
      'AUDIO': 'audio'
    };

    return typeMap[evidenceType] || 'image';
  }

  /**
   * Map AI analysis results to structured report format
   */
  private mapAIResultsToReport(
    aiResults: any,
    reportType: string,
    evidenceId: string,
    analysisId: string,
    userId: string
  ): Partial<IAnalysisReport> {
    // Extract common fields
    const report: Partial<IAnalysisReport> = {
      reportId: undefined, // Will be generated by the model
      evidenceId,
      analysisId,
      createdBy: userId,
      reportType,
      summary: {
        confidence: this.extractConfidence(aiResults),
        anomaliesDetected: this.extractAnomaliesDetected(aiResults),
        processingTime: this.extractProcessingTime(aiResults),
        modelVersion: this.extractModelVersion(aiResults)
      },
      findings: this.extractFindings(aiResults),
      metadata: this.extractMetadata(aiResults),
      content: this.extractContent(aiResults),
      modality: {},
      rawResults: aiResults
    };

    // Add modality-specific fields
    switch (reportType) {
      case 'image':
        report.modality = {
          image: this.extractImageModality(aiResults)
        };
        break;
      case 'video':
        report.modality = {
          video: this.extractVideoModality(aiResults)
        };
        break;
      case 'document':
        report.modality = {
          document: this.extractDocumentModality(aiResults)
        };
        break;
      case 'audio':
        report.modality = {
          audio: this.extractAudioModality(aiResults)
        };
        break;
    }

    return report;
  }

  /**
   * Extract confidence score from AI results
   */
  private extractConfidence(results: any): number {
    return Number(results?.confidence_score ?? results?.confidence ?? results?.metrics?.confidence ?? 0);
  }

  /**
   * Extract anomalies detected flag from AI results
   */
  private extractAnomaliesDetected(results: any): boolean {
    return Boolean(
      (results?.anomaliesDetected ?? results?.anomalies ?? results?.manipulation_detection?.is_manipulated) === true
    );
  }

  /**
   * Extract processing time from AI results
   */
  private extractProcessingTime(results: any): number {
    return Number(results?.processing_time ?? results?.processingTime ?? 0);
  }

  /**
   * Extract model version from AI results
   */
  private extractModelVersion(results: any): string {
    return String(results?.model_version ?? results?.modelVersion ?? '1.0.0');
  }

  /**
   * Extract findings from AI results
   */
  private extractFindings(results: any): Array<{
    type: string;
    severity: string;
    description: string;
    confidence: number;
    location?: any;
  }> {
    const findings = [];

    // Try to extract from anomalies array
    if (Array.isArray(results?.anomalies)) {
      findings.push(
        ...results.anomalies.map((anomaly: any) => ({
          type: anomaly.type || 'Anomaly',
          severity: anomaly.severity || 'medium',
          description: anomaly.description || 'Unknown anomaly',
          confidence: Number(anomaly.confidence || 0.5),
          location: anomaly.location
        }))
      );
    }

    // Try to extract from manipulation detection
    if (results?.manipulation?.isManipulated) {
      findings.push({
        type: 'Manipulation',
        severity: 'high',
        description: 'Image manipulation detected',
        confidence: Number(results.manipulation.confidence || 0.5),
        location: null
      });
    }

    // Try to extract from authenticity issues
    if (Array.isArray(results?.authenticity?.issues)) {
      findings.push(
        ...results.authenticity.issues.map((issue: string) => ({
          type: 'Authenticity',
          severity: 'medium',
          description: issue,
          confidence: Number(results.authenticity.confidence || 0.5)
        }))
      );
    }

    return findings;
  }

  /**
   * Extract metadata from AI results
   */
  private extractMetadata(results: any): {
    extracted: Record<string, any>;
    inconsistencies: string[];
    missing: string[];
  } {
    return {
      extracted: results?.metadata?.extracted || {},
      inconsistencies: Array.isArray(results?.metadata?.inconsistencies)
        ? results.metadata.inconsistencies
        : [],
      missing: Array.isArray(results?.metadata?.missing) ? results.metadata.missing : []
    };
  }

  /**
   * Extract content from AI results
   */
  private extractContent(results: any): {
    text?: string;
    objects?: any[];
    faces?: any[];
    audio?: any;
  } {
    return {
      text: results?.content?.text || '',
      objects: Array.isArray(results?.content?.objects) ? results.content.objects : [],
      faces: Array.isArray(results?.content?.faces) ? results.content.faces : [],
      audio: results?.content?.audio || null
    };
  }

  /**
   * Extract image modality specific fields
   */
  private extractImageModality(results: any): any {
    return {
      ela: {
        score: Number(results?.ela_score || results?.manipulation?.confidence || 0),
        regions: Array.isArray(results?.manipulation?.regions) ? results.manipulation.regions : []
      },
      quality: {
        score: Number(results?.quality_score || 0),
        compression: results?.metadata?.extracted?.compression || 'unknown',
        noise: results?.noise_level || 'low',
        artifacts: Array.isArray(results?.artifacts) ? results.artifacts : []
      },
      dimensions: {
        width: Number(results?.metadata?.extracted?.width || 0),
        height: Number(results?.metadata?.extracted?.height || 0),
        aspectRatio: Number(results?.metadata?.extracted?.width || 0) / Number(results?.metadata?.extracted?.height || 1)
      }
    };
  }

  /**
   * Extract video modality specific fields
   */
  private extractVideoModality(results: any): any {
    return {
      deepfake: {
        detected: Boolean(results?.deepfake_detection?.is_deepfake || false),
        confidence: Number(results?.deepfake_detection?.confidence || 0),
        techniques: Array.isArray(results?.deepfake_detection?.techniques)
          ? results.deepfake_detection.techniques
          : [],
        affectedFrames: Array.isArray(results?.deepfake_detection?.affected_frames)
          ? results.deepfake_detection.affected_frames
          : []
      },
      motion: {
        consistent: Boolean(results?.motion_analysis?.consistent || true),
        anomalies: Array.isArray(results?.motion_analysis?.anomalies)
          ? results.motion_analysis.anomalies
          : []
      },
      technical: {
        duration: Number(results?.technical_analysis?.duration || 0),
        fps: Number(results?.technical_analysis?.fps || 0),
        codec: results?.technical_analysis?.codec || 'unknown',
        bitrate: Number(results?.technical_analysis?.bitrate || 0),
        resolution: results?.technical_analysis?.resolution || 'unknown'
      }
    };
  }

  /**
   * Extract document modality specific fields
   */
  private extractDocumentModality(results: any): any {
    return {
      structure: {
        pageCount: Number(results?.structure_analysis?.page_count || 0),
        sectionCount: Number(results?.structure_analysis?.section_count || 0),
        tableCount: Number(results?.structure_analysis?.table_count || 0),
        imageCount: Number(results?.structure_analysis?.image_count || 0)
      },
      plagiarism: {
        detected: Boolean(results?.plagiarism_check?.plagiarism_detected || false),
        similarityScore: Number(results?.plagiarism_check?.similarity_score || 0),
        matchedSources: Array.isArray(results?.plagiarism_check?.matched_sources)
          ? results.plagiarism_check.matched_sources
          : [],
        segments: Array.isArray(results?.plagiarism_check?.plagiarized_segments)
          ? results.plagiarism_check.plagiarized_segments
          : []
      },
      authenticity: {
        signatures: Array.isArray(results?.authenticity_analysis?.signatures)
          ? results.authenticity_analysis.signatures
          : [],
        creationSoftware: results?.authenticity_analysis?.creation_software || 'unknown',
        modificationHistory: Array.isArray(results?.authenticity_analysis?.modification_history)
          ? results.authenticity_analysis.modification_history
          : []
      }
    };
  }

  /**
   * Extract audio modality specific fields
   */
  private extractAudioModality(results: any): any {
    return {
      voice: {
        speakerCount: Number(results?.voice_identification?.speaker_count || 1),
        speakers: Array.isArray(results?.voice_identification?.speakers)
          ? results.voice_identification.speakers
          : []
      },
      spectrum: {
        frequencyRanges: results?.spectrum_analysis?.frequency_ranges || {},
        anomalies: Array.isArray(results?.spectrum_analysis?.anomalies)
          ? results.spectrum_analysis.anomalies
          : []
      },
      noise: {
        level: Number(results?.noise_analysis?.noise_level || 0),
        types: Array.isArray(results?.noise_analysis?.noise_types)
          ? results.noise_analysis.noise_types
          : [],
        signalToNoiseRatio: Number(results?.noise_analysis?.signal_to_noise_ratio || 0)
      },
      technical: {
        duration: Number(results?.technical_analysis?.duration || 0),
        sampleRate: Number(results?.technical_analysis?.sample_rate || 0),
        channels: Number(results?.technical_analysis?.channels || 0),
        format: results?.technical_analysis?.format || 'unknown',
        bitDepth: Number(results?.technical_analysis?.bit_depth || 0),
        codec: results?.technical_analysis?.codec || 'unknown',
        bitrate: Number(results?.technical_analysis?.bitrate || 0),
        quality: results?.technical_analysis?.quality || 'unknown'
      }
    };
  }
}

export default AnalysisReportService;
