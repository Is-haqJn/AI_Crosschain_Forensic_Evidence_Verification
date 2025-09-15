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
  caseId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, index: true },
  description: { type: String },
  status: { type: String, enum: Object.values(CaseStatus), default: CaseStatus.OPEN, index: true },
  leadInvestigator: {
    userId: { type: String, required: true },
    name: String,
    organization: String
  },
  participants: [{
    userId: String,
    role: { type: String, enum: ['investigator','validator','admin','observer'], default: 'investigator' },
    name: String,
    organization: String
  }],
  evidence: [{
    evidenceId: { type: String, index: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: String
  }],
  chainOfCustody: [{ type: Schema.Types.Mixed }],
  tags: [String]
}, { timestamps: true });

CaseSchema.index({ title: 'text', description: 'text', tags: 1 });

export const CaseModel = model<ICase>('Case', CaseSchema);
export default CaseModel;

