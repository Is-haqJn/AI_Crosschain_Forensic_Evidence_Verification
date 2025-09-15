import { Schema, model, Document } from 'mongoose';

/**
 * Evidence Type Enum
 */
export enum EvidenceType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
  OTHER = 'OTHER'
}

/**
 * Evidence Status Enum
 */
export enum EvidenceStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED'
}

/**
 * Evidence Interface
 */
export interface IEvidence extends Document {
  evidenceId: string;
  ipfsHash: string;
  dataHash: string;
  metadata: {
    filename: string;
    filesize: number;
    mimetype: string;
    uploadDate: Date;
    description?: string;
    location?: {
      latitude?: number;
      longitude?: number;
      address?: string;
    };
    deviceInfo?: {
      make?: string;
      model?: string;
      serialNumber?: string;
    };
  };
  type: EvidenceType;
  status: EvidenceStatus;
  submitter: {
    userId: string;
    name: string;
    organization: string;
    role: string;
  };
  chainOfCustody: Array<{
    eventId: string;
    eventType: 'COLLECTION' | 'TRANSFER' | 'ANALYSIS' | 'STORAGE' | 'RELEASE' | 'BLOCKCHAIN_SUBMISSION' | 'OTHER';
    handler?: string; // deprecated (backward compat)
    from?: { userId?: string; name?: string; organization?: string };
    to?: { userId?: string; name?: string; organization?: string };
    timestamp: Date;
    location?: { name?: string; address?: string; latitude?: number; longitude?: number };
    purpose?: string;
    method?: string;
    packaging?: { sealId?: string; condition?: string; tamperEvident?: boolean };
    integrity: { dataHash: string; previousEventHash?: string; eventHash: string; algorithm: string; signature: string };
    action: string; // deprecated (backward compat)
    notes?: string;
    signature?: string; // deprecated (backward compat)
  }>;
  aiAnalysis?: {
    analysisId: string;
    timestamp: Date;
    results: any;
    confidence: number;
    anomaliesDetected: boolean;
    ipfsHash?: string;
  };
  blockchainData?: {
    transactionHash: string;
    blockNumber: number;
    chainId: number;
    contractAddress: string;
    timestamp: Date;
    network: string;
  };
  crossChainData?: {
    bridged: boolean;
    targetChain?: number;
    bridgeTransactionHash?: string;
    bridgeTimestamp?: Date;
  };
  tags: string[];
  accessControl: Array<{
    userId: string;
    permission: 'READ' | 'WRITE' | 'DELETE' | 'ADMIN';
    grantedBy: string;
    grantedAt: Date;
  }>;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  hasAccess(userId: string, permission: string): boolean;
  addCustodyEntry(entry: any): Promise<this>;
}

/**
 * Evidence Schema
 */
const EvidenceSchema = new Schema<IEvidence>({
  evidenceId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  ipfsHash: { 
    type: String, 
    required: true, 
    index: true 
  },
  dataHash: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  metadata: {
    filename: { 
      type: String, 
      required: true 
    },
    filesize: { 
      type: Number, 
      required: true 
    },
    mimetype: { 
      type: String, 
      required: true 
    },
    uploadDate: { 
      type: Date, 
      default: Date.now 
    },
    description: String,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    deviceInfo: {
      make: String,
      model: String,
      serialNumber: String
    }
  },
  type: {
    type: String,
    enum: Object.values(EvidenceType),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(EvidenceStatus),
    default: EvidenceStatus.UPLOADED
  },
  submitter: {
    userId: { 
      type: String, 
      required: true 
    },
    name: { 
      type: String, 
      required: true 
    },
    organization: { 
      type: String, 
      required: true 
    },
    role: { 
      type: String, 
      required: true 
    }
  },
  chainOfCustody: [{
    eventId: { type: String, index: true },
    eventType: { 
      type: String, 
      enum: ['COLLECTION','TRANSFER','ANALYSIS','STORAGE','RELEASE','BLOCKCHAIN_SUBMISSION','OTHER'],
      default: 'OTHER'
    },
    handler: String,
    from: {
      userId: String,
      name: String,
      organization: String
    },
    to: {
      userId: String,
      name: String,
      organization: String
    },
    timestamp: { type: Date, index: true },
    location: {
      name: String,
      address: String,
      latitude: Number,
      longitude: Number
    },
    purpose: String,
    method: String,
    packaging: {
      sealId: String,
      condition: String,
      tamperEvident: Boolean
    },
    integrity: {
      dataHash: String,
      previousEventHash: String,
      eventHash: { type: String, index: true },
      algorithm: { type: String, default: 'sha256' },
      signature: String
    },
    action: String,
    notes: String,
    signature: String
  }],
  aiAnalysis: {
    analysisId: String,
    timestamp: Date,
    results: Schema.Types.Mixed,
    confidence: Number,
    anomaliesDetected: Boolean,
    ipfsHash: String
  },
  blockchainData: {
    transactionHash: String,
    blockNumber: Number,
    chainId: Number,
    contractAddress: String,
    timestamp: Date,
    network: String
  },
  crossChainData: {
    bridged: { 
      type: Boolean, 
      default: false 
    },
    targetChain: Number,
    bridgeTransactionHash: String,
    bridgeTimestamp: Date
  },
  tags: [String],
  accessControl: [{
    userId: String,
    permission: {
      type: String,
      enum: ['READ', 'WRITE', 'DELETE', 'ADMIN']
    },
    grantedBy: String,
    grantedAt: Date
  }],
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  deletedAt: Date,
  deletedBy: String
}, {
  timestamps: true
});

// Indexes for performance
EvidenceSchema.index({ 'submitter.userId': 1, createdAt: -1 });
EvidenceSchema.index({ status: 1, type: 1 });
EvidenceSchema.index({ tags: 1 });
EvidenceSchema.index({ 'blockchainData.chainId': 1, 'blockchainData.transactionHash': 1 });
EvidenceSchema.index({ isDeleted: 1 });
EvidenceSchema.index({ createdAt: -1 });
EvidenceSchema.index({ 'chainOfCustody.eventHash': 1 });

// Virtual for age
EvidenceSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

// Method to check access
EvidenceSchema.methods.hasAccess = function(userId: string, permission: string): boolean {
  return this.accessControl.some((access: any) => 
    access.userId === userId && 
    (access.permission === 'ADMIN' || access.permission === permission)
  );
};

// Method to add to chain of custody
EvidenceSchema.methods.addCustodyEntry = function(entry: any) {
  this.chainOfCustody.push({
    ...entry,
    timestamp: new Date()
  });
  return this.save();
};

// Static method to find non-deleted evidence
EvidenceSchema.statics.findActive = function(filter = {}) {
  return this.find({ ...filter, isDeleted: false });
};

/**
 * Evidence Model
 */
export const Evidence = model<IEvidence>('Evidence', EvidenceSchema);

export default Evidence;
