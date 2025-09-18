import { Schema, model, Document } from 'mongoose';

export enum CaseStatus {
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  CLOSED = 'CLOSED'
}

export interface ICase extends Document {
  caseId: string;
  title: string;
  description?: string;
  status: CaseStatus;
  leadInvestigator: { userId: string; name?: string; organization?: string };
  participants: Array<{ userId: string; role: 'investigator' | 'validator' | 'admin' | 'observer'; name?: string; organization?: string }>;
  evidence: Array<{ evidenceId: string; addedAt: Date; addedBy: string }>;
  chainOfCustody: Array<any>; // aggregated or case-level events (future)
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const CaseSchema = new Schema<ICase>({
  caseId: { type: String, required: [true, 'caseId is required'], unique: true, trim: true },
  title: { type: String, required: [true, 'title is required'], index: true, trim: true, minlength: [1, 'title cannot be empty'] },
  description: { type: String, trim: true, maxlength: [1000, 'description too long'] },
  status: { type: String, enum: Object.values(CaseStatus), default: CaseStatus.OPEN, index: true },
  leadInvestigator: {
    userId: { type: String, required: [true, 'leadInvestigator.userId is required'], trim: true },
    name: { type: String, trim: true },
    organization: { type: String, trim: true }
  },
  participants: [{
    userId: { type: String, trim: true },
    role: { type: String, enum: ['investigator','validator','admin','observer'], default: 'investigator' },
    name: { type: String, trim: true },
    organization: { type: String, trim: true }
  }],
  evidence: [{
    evidenceId: { type: String, index: true, trim: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String, trim: true }
  }],
  chainOfCustody: [{ type: Schema.Types.Mixed }],
  tags: [{ type: String, trim: true }]
}, { timestamps: true, strict: true });

// Use separate indexes to avoid "Field 'tags' of text index contains an array" errors
// 1) Text index for title and description
CaseSchema.index({ title: 'text', description: 'text' });
// 2) Regular index for tags array
CaseSchema.index({ tags: 1 });

export const CaseModel = model<ICase>('Case', CaseSchema);
export default CaseModel;

