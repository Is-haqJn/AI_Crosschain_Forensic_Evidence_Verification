import axios, { AxiosResponse } from 'axios';
import { ApiResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_EVIDENCE_SERVICE_URL || 'http://localhost:3001/api/v1';

class CaseService {
  private api = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } });

  constructor() {
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers = config.headers || {};
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async createCase(payload: { title: string; description?: string; tags?: string[] }): Promise<ApiResponse<any>> {
    const res: AxiosResponse<ApiResponse<any>> = await this.api.post('/cases', payload);
    return res.data;
  }

  async listCases(params?: any): Promise<ApiResponse<any>> {
    const res: AxiosResponse<ApiResponse<any>> = await this.api.get('/cases', { params });
    return res.data;
  }

  async getCase(caseId: string): Promise<ApiResponse<any>> {
    const res: AxiosResponse<ApiResponse<any>> = await this.api.get(`/cases/${caseId}`);
    return res.data;
  }

  async addEvidence(caseId: string, evidenceId: string): Promise<ApiResponse<any>> {
    const res: AxiosResponse<ApiResponse<any>> = await this.api.post(`/cases/${caseId}/evidence`, { evidenceId });
    return res.data;
  }
}

export const caseService = new CaseService();
