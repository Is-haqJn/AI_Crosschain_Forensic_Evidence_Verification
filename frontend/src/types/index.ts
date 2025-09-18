// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization: string;
  createdAt: string;
  lastLogin?: string;
}

export enum UserRole {
  INVESTIGATOR = 'investigator',
  VALIDATOR = 'validator',
  ADMIN = 'admin'
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// Evidence Types
export interface Evidence {
  evidenceId: string;
  ipfsHash: string;
  dataHash: string;
  metadata: EvidenceMetadata;
  type: EvidenceType;
  status: EvidenceStatus;
  submitter: SubmitterInfo;
  chainOfCustody: CustodyEntry[];
  aiAnalysis?: AIAnalysisResult;
  blockchainData?: BlockchainData;
  crossChainData?: CrossChainData;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceMetadata {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  description?: string;
  tags?: string[];
  caseNumber?: string;
  location?: string;
  timestamp?: string;
  deviceInfo?: DeviceInfo;
}

export interface DeviceInfo {
  make?: string;
  model?: string;
  os?: string;
  software?: string;
  gps?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

export enum EvidenceType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
  OTHER = 'OTHER'
}

export enum EvidenceStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED'
}

export interface SubmitterInfo {
  userId: string;
  name: string;
  organization: string;
  role: UserRole;
  contactInfo?: {
    email: string;
    phone?: string;
  };
}

export interface CustodyEntry {
  action: string;
  timestamp: string;
  userId: string;
  userName: string;
  organization: string;
  details?: string;
  location?: string;
  signature?: string;
}

// AI Analysis Types
export interface AIAnalysisResult {
  analysisId: string;
  evidenceId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  results: AnalysisResults;
  confidence: number;
  anomaliesDetected: boolean;
  timestamp: string;
  processingTime: number;
  modelVersion: string;
}

export enum AnalysisType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio'
}

export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface AnalysisResults {
  manipulation?: ManipulationResult;
  authenticity?: AuthenticityResult;
  metadata?: MetadataResult;
  content?: ContentResult;
  anomalies?: AnomalyResult[];
}

export interface ManipulationResult {
  isManipulated: boolean;
  confidence: number;
  techniques: string[];
  regions?: Region[];
}

export interface AuthenticityResult {
  isAuthentic: boolean;
  confidence: number;
  verificationMethods: string[];
  issues?: string[];
}

export interface MetadataResult {
  extracted: Record<string, any>;
  inconsistencies: string[];
  missing: string[];
}

export interface ContentResult {
  text?: string;
  objects?: ObjectDetection[];
  faces?: FaceDetection[];
  audio?: AudioAnalysis;
}

export interface AnomalyResult {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  location?: Region;
  confidence: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectDetection {
  label: string;
  confidence: number;
  region: Region;
}

export interface FaceDetection {
  region: Region;
  confidence: number;
  landmarks?: Point[];
}

export interface Point {
  x: number;
  y: number;
}

export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
  quality: string;
}

// Blockchain Types
export interface BlockchainData {
  transactionHash: string;
  blockNumber: number;
  gasUsed: number | string;
  timestamp: string;
  network: string;
  contractAddress: string;
}

export interface CrossChainData {
  bridged: boolean;
  targetChain?: number;
  bridgeTransactionHash?: string;
  bridgeTimestamp?: string;
}


// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Types
export interface LoginForm {
  email: string;
  password: string;
}

export interface EvidenceUploadForm {
  file: File;
  type: EvidenceType;
  description?: string;
  tags?: string[];
  caseNumber?: string;
  location?: string;
}

export interface AnalysisRequestForm {
  evidenceId: string;
  analysisType: AnalysisType;
  priority: number;
  metadata?: Record<string, any>;
}

// UI State Types
export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  details?: any;
}

// File Upload Types
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Dashboard Types
export interface DashboardStats {
  totalEvidence: number;
  pendingAnalysis: number;
  completedAnalysis: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'upload' | 'analysis' | 'verification';
  description: string;
  timestamp: string;
  user: string;
  evidenceId?: string;
}

// Settings Types
export interface UserSettings {
  notifications: NotificationSettings;
  preferences: UserPreferences;
  security: SecuritySettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  analysisComplete: boolean;
  verificationRequired: boolean;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  dateFormat: string;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginNotifications: boolean;
}
