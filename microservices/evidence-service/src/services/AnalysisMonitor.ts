import { Evidence, EvidenceStatus } from '../models/Evidence.model.js';
import { Logger } from '../utils/Logger.js';
import { AIAnalysisIntegrationService } from './AIAnalysisIntegrationService.js';
import { IPFSManager } from './IPFSManager.js';

/**
 * AnalysisMonitor
 * Background poller that checks pending AI analyses and persists
 * confidence/anomalies to the Evidence record once available.
 */
export class AnalysisMonitor {
  private static instance: AnalysisMonitor;
  private readonly logger: Logger;
  private readonly aiService: AIAnalysisIntegrationService;
  private readonly ipfs: IPFSManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private resubmitTracker: Map<string, { attempts: number; last: number }> = new Map();

  private constructor() {
    this.logger = Logger.getInstance();
    this.aiService = AIAnalysisIntegrationService.getInstance();
    this.ipfs = IPFSManager.getInstance();
  }

  public static getInstance(): AnalysisMonitor {
    if (!AnalysisMonitor.instance) {
      AnalysisMonitor.instance = new AnalysisMonitor();
    }
    return AnalysisMonitor.instance;
  }

  public start(): void {
    const enabled = (process.env.AI_ANALYSIS_POLL_ENABLED || 'false') !== 'false';
    if (!enabled) {
      this.logger.info('AI Analysis monitor disabled via env');
      return;
    }

    const intervalMs = parseInt(process.env.AI_ANALYSIS_POLL_INTERVAL_MS || '30000', 10);
    if (this.timer) clearInterval(this.timer as any);
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    // Kick off immediately
    void this.tick();
    this.logger.info(`AI Analysis monitor started (interval=${intervalMs}ms)`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const maxBatch = parseInt(process.env.AI_ANALYSIS_MAX_BATCH || '10', 10);
      // Candidates: have analysisId, not yet have results OR marked PROCESSING
      const candidates = await Evidence.find({
        isDeleted: false,
        'aiAnalysis.analysisId': { $exists: true, $ne: null },
        $or: [
          { status: EvidenceStatus.PROCESSING },
          { 'aiAnalysis.results': { $exists: false } },
          { 'aiAnalysis.results': null }
        ]
      }).sort({ updatedAt: -1 }).limit(maxBatch);

      if (candidates.length === 0) return;

      for (const ev of candidates) {
        const analysisId = (ev as any).aiAnalysis?.analysisId as string | undefined;
        if (!analysisId) continue;
        try {
          const status = await this.aiService.getAnalysisStatus(analysisId);
          const done = this.isComplete(status);
          if (!done) continue;

          const results = await this.aiService.getAnalysisResults(analysisId);
          const confidence = this.extractConfidence(results);
          const anomalies = this.extractAnomalies(results);

          (ev as any).aiAnalysis = {
            ...(ev as any).aiAnalysis,
            results,
            confidence,
            anomaliesDetected: anomalies,
            timestamp: new Date()
          };
          (ev as any).status = EvidenceStatus.ANALYZED;
          await ev.save();

          this.logger.info('AI analysis persisted from monitor', {
            evidenceId: (ev as any).evidenceId,
            analysisId,
            confidence,
            anomaliesDetected: anomalies
          });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          const statusCode = (err && typeof err === 'object' && 'statusCode' in err) ? (err as any).statusCode : undefined;
          // If AI service no longer recognizes the analysis, attempt a transparent re-submit
          if (statusCode === 404 || /analysis not found/i.test(message)) {
            this.logger.warn('Analysis missing on AI service, re-submitting', {
              evidenceId: (ev as any).evidenceId,
              analysisId
            });
            try {
              const can = this.canResubmit((ev as any).evidenceId);
              if (!can) {
                this.logger.warn('Resubmit skipped due to cooldown/attempt limit', {
                  evidenceId: (ev as any).evidenceId
                });
              } else {
                await this.resubmitAnalysis(ev as any);
                this.recordResubmit((ev as any).evidenceId);
              }
              continue;
            } catch (reErr) {
              this.logger.warn('Re-submission failed in monitor', {
                evidenceId: (ev as any).evidenceId,
                error: reErr instanceof Error ? reErr.message : String(reErr)
              });
            }
          } else {
            this.logger.warn('Analysis monitor iteration failed for evidence', {
              evidenceId: (ev as any).evidenceId,
              error: message
            });
          }
        }
      }
    } catch (e) {
      this.logger.warn('Analysis monitor tick failed', e);
    } finally {
      this.running = false;
    }
  }

  private isComplete(status: any): boolean {
    const s = (status?.status || status?.state || status?.result || '').toString().toLowerCase();
    const flags = [s];
    if (Array.isArray(status?.flags)) flags.push(...status.flags.map((x: any) => String(x).toLowerCase()));
    const truthy = Boolean(status?.ready || status?.completed || status?.done);
    const keywords = ['done', 'complete', 'completed', 'finished', 'success', 'succeeded'];
    return truthy || keywords.some(k => flags.some(f => f.includes(k) || f === k));
  }

  private extractConfidence(results: any): number {
    const cands = [results?.confidence, results?.metrics?.confidence, results?.score, results?.probability];
    const n = cands.find((v) => typeof v === 'number');
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    const s = [results?.confidence, results?.metrics?.confidence].find((v) => typeof v === 'string');
    if (typeof s === 'string') {
      const m = s.match(/\d+(?:\.\d+)?/);
      if (m) return Number(m[0]);
    }
    return 0;
  }

  private extractAnomalies(results: any): boolean {
    if (typeof results?.anomaliesDetected === 'boolean') return results.anomaliesDetected;
    if (Array.isArray(results?.anomalies)) return results.anomalies.length > 0;
    if (Array.isArray(results?.flags)) return results.flags.some((f: any) => String(f).toLowerCase().includes('anomaly'));
    return false;
  }

  private determineType(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/bmp': 'image', 'image/tiff': 'image',
      'video/mp4': 'video', 'video/avi': 'video', 'video/mov': 'video', 'video/wmv': 'video', 'video/flv': 'video', 'video/mkv': 'video',
      'application/pdf': 'document', 'application/msword': 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document', 'text/plain': 'document', 'application/rtf': 'document',
      'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/mp4': 'audio', 'audio/flac': 'audio', 'audio/ogg': 'audio'
    };
    return map[mime] || 'document';
  }

  private async resubmitAnalysis(ev: any): Promise<void> {
    // Clear client-side cache to force new analysis ID
    try {
      this.aiService.clearCache();
    } catch (_) {}

    const mime = ev?.metadata?.mimetype as string | undefined;
    const fileName = ev?.metadata?.filename as string | undefined;
    const analysisType = this.determineType(mime || 'application/octet-stream');
    let fileBuffer: Buffer | undefined;
    try {
      if (ev?.ipfsHash) {
        fileBuffer = await this.ipfs.downloadFile(ev.ipfsHash);
      }
    } catch (e) {
      // fallback below
    }
    if (!fileBuffer && ev?.fileContent) {
      fileBuffer = Buffer.from(ev.fileContent);
    }
    if (!fileBuffer) throw new Error('No file available for re-submission');

    const result = await this.aiService.submitForAnalysis(
      ev.evidenceId,
      fileBuffer,
      fileName || 'evidence.bin',
      mime || 'application/octet-stream',
      analysisType,
      5,
      {
        evidenceId: ev.evidenceId,
        ipfsHash: ev.ipfsHash,
        submitter: ev.submitter,
        description: ev?.metadata?.description,
        requestedBy: 'system-monitor'
      }
    );

    ev.aiAnalysis = {
      ...(ev.aiAnalysis || {}),
      analysisId: result.analysisId,
      results: null,
      confidence: 0,
      anomaliesDetected: false,
      timestamp: new Date()
    };
    ev.status = EvidenceStatus.PROCESSING;
    await ev.save();

    this.logger.info('Re-submitted AI analysis from monitor', {
      evidenceId: ev.evidenceId,
      analysisId: result.analysisId
    });
  }

  private canResubmit(evidenceId: string): boolean {
    const cooldown = parseInt(process.env.AI_ANALYSIS_RESUBMIT_COOLDOWN_MS || '120000', 10);
    const maxAttempts = parseInt(process.env.AI_ANALYSIS_RESUBMIT_MAX_ATTEMPTS || '2', 10);
    const rec = this.resubmitTracker.get(evidenceId);
    if (!rec) return true;
    const now = Date.now();
    if (rec.attempts >= maxAttempts) return false;
    return now - rec.last >= cooldown;
  }

  private recordResubmit(evidenceId: string): void {
    const rec = this.resubmitTracker.get(evidenceId) || { attempts: 0, last: 0 };
    rec.attempts += 1;
    rec.last = Date.now();
    this.resubmitTracker.set(evidenceId, rec);
  }
}

export default AnalysisMonitor;


