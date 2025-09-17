import { Request, Response, NextFunction } from 'express';
import { Evidence, EvidenceStatus } from '../models/Evidence.model.js';
import { CaseModel } from '../models/Case.model.js';
import { Logger } from '../utils/Logger.js';

type ActivityType = 'upload' | 'analysis' | 'verification' | 'case';

interface ActivityItem {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  user: string;
}

export class ActivityController {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public getRecent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 50);

      // Evidence uploads
      const uploads = await Evidence.find({}, {
        'metadata.filename': 1,
        'submitter.name': 1,
        createdAt: 1,
        evidenceId: 1,
      })
        .sort({ createdAt: -1 })
        .limit(limit);

      const uploadActivities: ActivityItem[] = uploads.map((e) => ({
        id: `upload:${e.evidenceId}`,
        type: 'upload',
        description: `New evidence uploaded: ${e.metadata?.filename}`,
        timestamp: (e.createdAt as Date).toISOString(),
        user: e.submitter?.name || 'Unknown',
      }));

      // AI analysis completed (where aiAnalysis.timestamp exists)
      const analyses = await Evidence.find({ 'aiAnalysis.timestamp': { $exists: true } }, {
        'aiAnalysis.timestamp': 1,
        evidenceId: 1,
      })
        .sort({ 'aiAnalysis.timestamp': -1 })
        .limit(limit);

      const analysisActivities: ActivityItem[] = analyses.map((e) => ({
        id: `analysis:${e.evidenceId}`,
        type: 'analysis',
        description: `AI analysis completed for evidence #${e.evidenceId}`,
        timestamp: (e.aiAnalysis?.timestamp as Date).toISOString(),
        user: 'System',
      }));

      // Verification (status VERIFIED or blockchainData present)
      const verifications = await Evidence.find({
        $or: [
          { status: EvidenceStatus.VERIFIED },
          { 'blockchainData.timestamp': { $exists: true } },
        ],
      }, {
        updatedAt: 1,
        'blockchainData.timestamp': 1,
        evidenceId: 1,
        'submitter.name': 1,
      })
        .sort({ updatedAt: -1 })
        .limit(limit);

      const verificationActivities: ActivityItem[] = verifications.map((e) => ({
        id: `verification:${e.evidenceId}`,
        type: 'verification',
        description: `Evidence #${e.evidenceId} verified`,
        timestamp: (e.blockchainData?.timestamp || e.updatedAt as Date).toISOString(),
        user: e.submitter?.name || 'System',
      }));

      // Case creations
      const cases = await CaseModel.find({}, {
        title: 1,
        createdAt: 1,
        'createdBy.name': 1,
        caseId: 1,
      })
        .sort({ createdAt: -1 })
        .limit(limit);

      const caseActivities: ActivityItem[] = cases.map((c) => ({
        id: `case:${c.caseId}`,
        type: 'case',
        description: `New case created: ${c.title}`,
        timestamp: (c.createdAt as Date).toISOString(),
        user: (c as any).createdBy?.name || 'Unknown',
      }));

      const all: ActivityItem[] = [
        ...uploadActivities,
        ...analysisActivities,
        ...verificationActivities,
        ...caseActivities,
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      res.status(200).json({ success: true, data: all });
    } catch (error) {
      this.logger.error('Failed to load recent activities', error);
      next(error);
    }
  };
}


