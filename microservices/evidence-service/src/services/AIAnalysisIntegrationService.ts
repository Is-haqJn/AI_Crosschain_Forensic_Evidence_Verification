import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';
import jwt from 'jsonwebtoken';
import { Logger } from '../utils/Logger.js';
import { AppError } from '../middleware/ErrorHandler.js';

/**
 * AI Analysis Integration Service
 * Handles communication with the AI Analysis Service
 * Implements intelligent retry, caching, and fallback mechanisms
 */
export class AIAnalysisIntegrationService {
  private static instance: AIAnalysisIntegrationService;
  private httpClient: AxiosInstance;
  private logger: Logger;
  private analysisCache: Map<string, any>;
  private pendingAnalyses: Map<string, Promise<any>>;

  private constructor() {
    this.logger = Logger.getInstance();
    this.analysisCache = new Map();
    this.pendingAnalyses = new Map();

    // Initialize HTTP client with intelligent configuration
    this.httpClient = axios.create({
      baseURL: process.env.AI_SERVICE_URL || 'http://ai-analysis-service:8001',
      timeout: 300000, // 5 minutes
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Evidence-Service/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  public static getInstance(): AIAnalysisIntegrationService {
    if (!AIAnalysisIntegrationService.instance) {
      AIAnalysisIntegrationService.instance = new AIAnalysisIntegrationService();
    }
    return AIAnalysisIntegrationService.instance;
  }

  /**
   * Setup HTTP interceptors for intelligent error handling and retry
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug('AI Service request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        this.logger.error('AI Service request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor with intelligent retry
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug('AI Service response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      async (error) => {
        const config = error.config;
        
        // Retry logic for specific error types
        if (this.shouldRetry(error) && !config._retryCount) {
          config._retryCount = 0;
        }

        if (config._retryCount < 3) {
          config._retryCount++;
          const delay = this.calculateRetryDelay(config._retryCount);
          
          this.logger.warn(`AI Service retry ${config._retryCount}/3`, {
            url: config.url,
            delay: delay
          });

          await this.sleep(delay);
          return this.httpClient(config);
        }

        this.logger.error('AI Service request failed after retries', {
          url: config.url,
          status: error.response?.status,
          message: error.message
        });

        return Promise.reject(error);
      }
    );
  }

  /**
   * Determine if a request should be retried
   */
  private shouldRetry(error: any): boolean {
    if (!error.response) {
      // Network error - always retry
      return true;
    }

    const status = error.response.status;
    // Retry on server errors and rate limiting
    return status >= 500 || status === 429;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = 1000;
    return Math.min(baseDelay * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  

  /**
   * Submit evidence for AI analysis with intelligent queuing
   */
  public async submitForAnalysis(
    evidenceId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    analysisType: string,
    priority: number = 5,
    metadata?: any
  ): Promise<{ analysisId: string; status: string; estimatedCompletion?: string }> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(evidenceId, analysisType);
      const cachedResult = this.analysisCache.get(cacheKey);
      if (cachedResult && this.isCacheValid(cachedResult)) {
        this.logger.info('Using cached analysis result', { evidenceId, analysisType });
        return cachedResult;
      }

      // Check if analysis is already pending
      if (this.pendingAnalyses.has(cacheKey)) {
        this.logger.info('Analysis already pending', { evidenceId, analysisType });
        return await this.pendingAnalyses.get(cacheKey);
      }

      // Create analysis promise
      const analysisPromise = this.performAnalysis(
        evidenceId,
        fileBuffer,
        fileName,
        mimeType,
        analysisType,
        priority,
        metadata
      );

      // Store pending analysis
      this.pendingAnalyses.set(cacheKey, analysisPromise);

      try {
        const result = await analysisPromise;
        
        // Cache successful result
        this.analysisCache.set(cacheKey, {
          ...result,
          cachedAt: Date.now()
        });

        return result;
      } finally {
        // Remove from pending
        this.pendingAnalyses.delete(cacheKey);
      }

    } catch (error) {
      this.logger.error('Failed to submit for AI analysis', {
        evidenceId,
        analysisType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('AI analysis submission failed', 500);
    }
  }

  /**
   * Perform the actual analysis
   */
  private async performAnalysis(
    evidenceId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    analysisType: string,
    priority: number,
    metadata?: any
  ): Promise<{ analysisId: string; status: string; estimatedCompletion?: string }> {
    // Create FormData for file upload
    const formData = new FormData();
    
    formData.append('evidence_id', evidenceId);
    formData.append('analysis_type', analysisType);
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: mimeType
    });
    formData.append('priority', priority.toString());
    
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    // Submit to AI service
    const response: AxiosResponse = await this.httpClient.post('/api/v1/submit', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${this.generateServiceToken()}`
      }
    });

    return {
      analysisId: response.data.analysis_id,
      status: response.data.status,
      estimatedCompletion: response.data.estimated_completion
    };
  }

  /**
   * Get analysis status with intelligent polling
   */
  public async getAnalysisStatus(analysisId: string): Promise<any> {
    try {
      const response: AxiosResponse = await this.httpClient.get(
        `/api/v1/status/${analysisId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.generateServiceToken()}`
          }
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get analysis status', {
        analysisId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Failed to get analysis status', 500);
    }
  }

  /**
   * Get analysis results with intelligent caching
   */
  public async getAnalysisResults(analysisId: string): Promise<any> {
    try {
      // Check cache first
      const cachedResult = this.analysisCache.get(analysisId);
      if (cachedResult && this.isCacheValid(cachedResult)) {
        this.logger.info('Using cached analysis results', { analysisId });
        return cachedResult.results;
      }

      const response: AxiosResponse = await this.httpClient.get(
        `/api/v1/results/${analysisId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.generateServiceToken()}`
          }
        }
      );

      // Cache results
      this.analysisCache.set(analysisId, {
        results: response.data,
        cachedAt: Date.now()
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get analysis results', {
        analysisId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Failed to get analysis results', 500);
    }
  }

  /**
   * Submit batch analysis for multiple evidence items
   */
  public async submitBatchAnalysis(
    evidenceItems: Array<{
      evidenceId: string;
      fileBuffer: Buffer;
      fileName: string;
      mimeType: string;
      analysisType: string;
      priority?: number;
      metadata?: any;
    }>
  ): Promise<Array<{ analysisId: string; status: string; evidenceId: string }>> {
    try {
      const batchData = evidenceItems.map(item => ({
        evidence_id: item.evidenceId,
        analysis_type: item.analysisType,
        priority: item.priority || 5,
        metadata: item.metadata
      }));

      const response: AxiosResponse = await this.httpClient.post(
        '/api/v1/batch',
        batchData,
        {
          headers: {
            'Authorization': `Bearer ${this.generateServiceToken()}`
          }
        }
      );

      return response.data.map((result: any, index: number) => ({
        analysisId: result.analysis_id,
        status: result.status,
        evidenceId: evidenceItems[index].evidenceId
      }));
    } catch (error) {
      this.logger.error('Failed to submit batch analysis', {
        itemCount: evidenceItems.length,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Batch analysis submission failed', 500);
    }
  }

  /**
   * Cancel analysis
   */
  public async cancelAnalysis(analysisId: string): Promise<boolean> {
    try {
      await this.httpClient.delete(
        `/api/v1/cancel/${analysisId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.generateServiceToken()}`
          }
        }
      );

      // Remove from cache
      this.analysisCache.delete(analysisId);

      this.logger.info('Analysis cancelled', { analysisId });
      return true;
    } catch (error) {
      this.logger.error('Failed to cancel analysis', {
        analysisId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get supported analysis types
   */
  public async getSupportedAnalysisTypes(): Promise<any> {
    try {
      const response: AxiosResponse = await this.httpClient.get('/api/v1/types');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get supported analysis types', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Failed to get supported analysis types', 500);
    }
  }

  /**
   * Get queue status
   */
  public async getQueueStatus(): Promise<any> {
    try {
      const response: AxiosResponse = await this.httpClient.get(
        '/api/v1/queue/status',
        {
          headers: {
            'Authorization': `Bearer ${this.generateServiceToken()}`
          }
        }
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get queue status', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError('Failed to get queue status', 500);
    }
  }

  /**
   * Health check for AI service
   */
  public async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const response: AxiosResponse = await this.httpClient.get('/health');
      return {
        healthy: response.status === 200,
        details: response.data
      };
    } catch (error) {
      this.logger.error('AI service health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Generate cache key for analysis
   */
  private generateCacheKey(evidenceId: string, analysisType: string): string {
    return `${evidenceId}:${analysisType}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(cachedEntry: any): boolean {
    const cacheTTL = 3600000; // 1 hour
    return Date.now() - cachedEntry.cachedAt < cacheTTL;
  }

  /**
   * Generate service-to-service authentication token
   */
  private generateServiceToken(): string {
    // Generate a short-lived JWT for service-to-service auth
    // Uses the same JWT secret configured for the evidence service so the AI service can verify it
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Fallback to a clearly invalid token to surface configuration issues early
      return 'invalid-service-token';
    }

    const payload = {
      // AI service expects a userId claim; use a service identity
      userId: 'evidence-service',
      sub: 'evidence-service',
      role: 'service',
      organization: 'forensic-evidence-system'
    } as any;

    return jwt.sign(payload, secret, {
      expiresIn: '5m',
      issuer: 'evidence-service',
      audience: 'ai-analysis-service'
    });
  }

  /**
   * Clear analysis cache
   */
  public clearCache(): void {
    this.analysisCache.clear();
    this.logger.info('Analysis cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; pendingAnalyses: number } {
    return {
      size: this.analysisCache.size,
      pendingAnalyses: this.pendingAnalyses.size
    };
  }
}

export default AIAnalysisIntegrationService;

