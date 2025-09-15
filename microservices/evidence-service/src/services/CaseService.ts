import { v4 as uuidv4 } from 'uuid';
import { CaseModel, ICase, CaseStatus } from '../models/Case.model.js';
import { Evidence } from '../models/Evidence.model.js';
import { AppError } from '../middleware/ErrorHandler.js';
import { Logger } from '../utils/Logger.js';

export class CaseService {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  async createCase(data: {
    title: string;
    description?: string;
    tags?: string[];
    lead: { userId: string; name?: string; organization?: string };
  }): Promise<ICase> {
    const caseId = uuidv4();
    const c = new CaseModel({
      caseId,
      title: data.title,
      description: data.description,
      status: CaseStatus.OPEN,
      leadInvestigator: data.lead,
      participants: [{ userId: data.lead.userId, role: 'investigator', name: data.lead.name, organization: data.lead.organization }],
      tags: data.tags || []
    });
    await c.save();
    this.logger.info('Case created', { caseId });
    return c;
  }

  async listCases(filters: any, pagination: { page: number; limit: number; sortBy?: string; sortOrder?: 'asc'|'desc' }): Promise<{ cases: ICase[]; total: number }> {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.search) query.$text = { $search: filters.search };
    if (filters.tag) query.tags = filters.tag;

    const total = await CaseModel.countDocuments(query);
    const cases = await CaseModel.find(query)
      .sort({ [pagination.sortBy || 'createdAt']: (pagination.sortOrder || 'desc') === 'asc' ? 1 : -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit);
    return { cases, total };
  }

  async getCase(caseId: string): Promise<ICase | null> {
    return CaseModel.findOne({ caseId });
  }

  async addEvidence(caseId: string, evidenceId: string, userId: string): Promise<ICase> {
    const c = await CaseModel.findOne({ caseId });
    if (!c) throw new AppError('Case not found', 404);
    const ev = await Evidence.findOne({ evidenceId, isDeleted: false });
    if (!ev) throw new AppError('Evidence not found', 404);
    // avoid duplicates
    if (c.evidence.find(e => e.evidenceId === evidenceId)) return c;
    c.evidence.push({ evidenceId, addedAt: new Date(), addedBy: userId });
    await c.save();
    return c;
  }

  async updateStatus(caseId: string, status: CaseStatus): Promise<ICase> {
    const c = await CaseModel.findOne({ caseId });
    if (!c) throw new AppError('Case not found', 404);
    c.status = status;
    await c.save();
    return c;
  }
}

export default CaseService;

