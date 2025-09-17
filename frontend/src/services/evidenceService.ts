import axios, { AxiosResponse } from 'axios';
import { 
  Evidence, 
  AIAnalysisResult,
  PaginatedResponse,
  ApiResponse,
  UploadProgress
} from '../types';

const API_BASE_URL = process.env.REACT_APP_EVIDENCE_SERVICE_URL || 'http://localhost:3001/api/v1';
const SUBMIT_NETWORK_DEFAULT = process.env.REACT_APP_SUBMIT_NETWORK || 'sepolia';
const VERIFY_NETWORK_DEFAULT = process.env.REACT_APP_VERIFY_NETWORK || 'amoy';

class EvidenceService {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Add request interceptor to include auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  async uploadEvidence(
    formData: FormData, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Evidence> {
    try {
      const response: AxiosResponse<ApiResponse<Evidence>> = 
        await this.api.post('/evidence/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const progress: UploadProgress = {
                loaded: progressEvent.loaded,
                total: progressEvent.total,
                percentage: Math.round((progressEvent.loaded * 100) / progressEvent.total)
              };
              onProgress(progress);
            }
          },
        });
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Upload failed');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Upload failed');
    }
  }

  async getEvidence(evidenceId: string): Promise<Evidence> {
    try {
      const response: AxiosResponse<ApiResponse<Evidence>> = 
        await this.api.get(`/evidence/${evidenceId}`);
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch evidence');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch evidence');
    }
  }

  async getEvidenceList(
    page: number = 1, 
    limit: number = 10, 
    filters?: {
      type?: string;
      status?: string;
      search?: string;
    }
  ): Promise<PaginatedResponse<Evidence>> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.search && { search: filters.search }),
      });

      const response: AxiosResponse<PaginatedResponse<Evidence>> = 
        await this.api.get(`/evidence?${params}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch evidence list');
      }

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch evidence list');
    }
  }

  async updateEvidence(evidenceId: string, updates: Partial<Evidence>): Promise<Evidence> {
    try {
      const response: AxiosResponse<ApiResponse<Evidence>> = 
        await this.api.put(`/evidence/${evidenceId}`, updates);
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to update evidence');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update evidence');
    }
  }

  async deleteEvidence(evidenceId: string): Promise<void> {
    try {
      const response: AxiosResponse<ApiResponse> = 
        await this.api.delete(`/evidence/${evidenceId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete evidence');
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete evidence');
    }
  }

  async submitForAIAnalysis(evidenceId: string, analysisType: string): Promise<AIAnalysisResult> {
    try {
      const response: AxiosResponse<ApiResponse<AIAnalysisResult>> = 
        await this.api.post(`/evidence/${evidenceId}/ai-analysis`, {
          analysisType
        });
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to submit for AI analysis');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to submit for AI analysis');
    }
  }

  async getAIAnalysisResults(evidenceId: string): Promise<AIAnalysisResult> {
    try {
      const response: AxiosResponse<ApiResponse<AIAnalysisResult>> = 
        await this.api.get(`/evidence/${evidenceId}/ai-analysis/results`);
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch AI analysis results');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch AI analysis results');
    }
  }

  async getAIAnalysisStatus(evidenceId: string): Promise<{ status: string; progress?: number }> {
    try {
      const response: AxiosResponse<ApiResponse<{ status: string; progress?: number }>> = 
        await this.api.get(`/evidence/${evidenceId}/ai-analysis/status`);
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch AI analysis status');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch AI analysis status');
    }
  }

  async getSupportedAIAnalysisTypes(): Promise<Record<string, any>> {
    try {
      const response: AxiosResponse<ApiResponse<Record<string, any>>> = 
        await this.api.get('/evidence/ai-analysis/types');
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch supported analysis types');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch supported analysis types');
    }
  }

  async getAIServiceHealth(): Promise<{ status: string; version?: string }> {
    try {
      const response: AxiosResponse<ApiResponse<{ status: string; version?: string }>> = 
        await this.api.get('/evidence/ai-analysis/health');
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch AI service health');
      }

      // Backend returns { healthy:boolean, details:{ status?: string } }
      const details: any = response.data.data as any;
      const status = typeof details.status === 'string'
        ? details.status
        : (details.healthy ? 'healthy' : 'unavailable');
      return { status, version: details?.details?.version } as any;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch AI service health');
    }
  }

  async getCrossChainHealth(): Promise<{ networks: Record<string, { connected: boolean; contractLoaded: boolean; chainId?: number }> }> {
    const response: AxiosResponse<ApiResponse<{ networks: Record<string, { connected: boolean; contractLoaded: boolean; chainId?: number }> }>> =
      await this.api.get('/evidence/crosschain/health');
    if (!response.data.success || !response.data.data) throw new Error(response.data.message || 'Failed to fetch cross-chain health');
    return response.data.data;
  }

  async submitToBlockchain(evidenceId: string, network: string = SUBMIT_NETWORK_DEFAULT): Promise<ApiResponse<{ transactionHash: string; blockNumber: number; gasUsed: string }>> {
    try {
      const response: AxiosResponse<ApiResponse<{ transactionHash: string; blockNumber: number; gasUsed: string }>> =
        await this.api.post(`/evidence/${evidenceId}/blockchain`, { network });

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to submit to blockchain');
      }

      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error?.message || error?.response?.data?.message || error?.message;
      if (status === 402 && msg && msg.toLowerCase().includes('insufficient')) {
        throw new Error('Wallet needs test ETH on selected network. Please fund and retry.');
      }
      throw new Error(msg || 'Failed to submit to blockchain');
    }
  }

  async verifyOnBlockchain(evidenceId: string, network: string = VERIFY_NETWORK_DEFAULT): Promise<ApiResponse<{ verified: boolean; onChain: boolean; blockchainData?: any }>> {
    try {
      const response: AxiosResponse<ApiResponse<{ verified: boolean; onChain: boolean; blockchainData?: any }>> =
        await this.api.get(`/evidence/${evidenceId}/verify`, { params: { network } });

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to verify on blockchain');
      }

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to verify on blockchain');
    }
  }

  async downloadEvidence(evidenceId: string): Promise<Blob> {
    try {
      const response = await this.api.get(`/evidence/${evidenceId}/download`, {
        responseType: 'blob'
      });
      
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to download evidence');
    }
  }

  async getEvidenceMetadata(evidenceId: string): Promise<any> {
    try {
      const response: AxiosResponse<ApiResponse<any>> = 
        await this.api.get(`/evidence/${evidenceId}/metadata`);
      
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message || 'Failed to fetch evidence metadata');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch evidence metadata');
    }
  }

  async getRecentActivity(limit: number = 10): Promise<Array<{ id: string; type: string; description: string; timestamp: string; user: string }>> {
    try {
      const response: AxiosResponse<ApiResponse<Array<{ id: string; type: string; description: string; timestamp: string; user: string }>>> =
        await this.api.get(`/activity`, { params: { limit } });

      if (!response.data.success || !Array.isArray(response.data.data)) {
        throw new Error(response.data.message || 'Failed to fetch recent activity');
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch recent activity');
    }
  }
}

export const evidenceService = new EvidenceService();
