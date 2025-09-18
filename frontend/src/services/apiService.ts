import axios, { AxiosInstance } from 'axios';
import { authService } from './authService';

// API service for communicating with backend services
class ApiService {
  private evidenceApi: AxiosInstance;
  private aiApi: AxiosInstance;

  constructor() {
    // Evidence Service API
    this.evidenceApi = axios.create({
      baseURL: process.env.REACT_APP_EVIDENCE_SERVICE_URL || 'http://localhost:3001/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // AI Analysis Service API
    this.aiApi = axios.create({
      baseURL: process.env.REACT_APP_AI_SERVICE_URL || 'http://localhost:8001',
      timeout: 300000, // 5 minutes for AI analysis
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Add auth token to requests
    this.evidenceApi.interceptors.request.use(
      (config) => {
        const token = authService.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Handle auth errors with refresh
    this.evidenceApi.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original: any = error.config || {};
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          const newToken = await authService.refreshToken();
          if (newToken) {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return this.evidenceApi(original);
          }
        }
        return Promise.reject(error);
      }
    );

    // Add auth token to AI requests as well
    this.aiApi.interceptors.request.use(
      (config) => {
        const token = authService.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.aiApi.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original: any = error.config || {};
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          const newToken = await authService.refreshToken();
          if (newToken) {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return this.aiApi(original);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Evidence Service API methods
  async getEvidenceList(params?: any): Promise<any> {
    const response = await this.evidenceApi.get('/evidence', { params });
    return response.data;
  }

  async getEvidence(id: string): Promise<any> {
    const response = await this.evidenceApi.get(`/evidence/${id}`);
    return response.data;
  }

  async uploadEvidence(formData: FormData): Promise<any> {
    const response = await this.evidenceApi.post('/evidence/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async updateEvidenceStatus(id: string, status: string): Promise<any> {
    const response = await this.evidenceApi.put(`/evidence/${id}/status`, { status });
    return response.data;
  }

  async submitForAIAnalysis(id: string, analysisType: string): Promise<any> {
    const response = await this.evidenceApi.post(`/evidence/${id}/ai-analysis`, { analysisType });
    return response.data;
  }

  async getAIAnalysisResults(id: string): Promise<any> {
    const response = await this.evidenceApi.get(`/evidence/${id}/ai-analysis/results`);
    return response.data;
  }

  async getAIAnalysisStatus(id: string): Promise<any> {
    const response = await this.evidenceApi.get(`/evidence/${id}/ai-analysis/status`);
    return response.data;
  }

  async getSupportedAIAnalysisTypes(): Promise<any> {
    const response = await this.evidenceApi.get('/evidence/ai-analysis/types');
    return response.data;
  }

  async getAIServiceHealth(): Promise<any> {
    const response = await this.evidenceApi.get('/evidence/ai-analysis/health');
    // Unwrap API envelope { success, data }
    return response.data?.data ?? response.data;
  }

  // AI Analysis Service API methods (direct)
  async getAIHealth(): Promise<any> {
    const response = await this.aiApi.get('/health');
    return response.data;
  }

  async getAIAnalysisTypes(): Promise<any> {
    const response = await this.aiApi.get('/api/v1/types');
    return response.data;
  }

  // Submit analysis directly to AI (expects FormData with file, evidence_id, analysis_type, ...)
  async submitAIAnalysis(formData: FormData): Promise<any> {
    const response = await this.aiApi.post('/api/v1/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getAIAnalysisResult(analysisId: string): Promise<any> {
    const response = await this.aiApi.get(`/api/v1/results/${analysisId}`);
    return response.data;
  }

  async getAIAnalysisStatusDirect(analysisId: string): Promise<any> {
    const response = await this.aiApi.get(`/api/v1/status/${analysisId}`);
    return response.data;
  }
}

export const apiService = new ApiService();

