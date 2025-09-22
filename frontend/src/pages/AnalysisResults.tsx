import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { evidenceService } from '../services/evidenceService';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { AIAnalysisResult, Evidence, EvidenceStatus, EvidenceType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { toast } from 'react-toastify';

export const AnalysisResults: React.FC = () => {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'' | keyof typeof EvidenceStatus>('');
  const [typeFilter, setTypeFilter] = useState<'' | keyof typeof EvidenceType>('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['analysis-evidence', page, limit, statusFilter, typeFilter, search],
    queryFn: () => evidenceService.getEvidenceList(page, limit, {
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      search: search || undefined,
    }),
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
    enabled: !!token,
    retry: (failureCount: number, error: any) => {
      const status = (error as any)?.response?.status;
      if (status === 401 || status === 403) {
        return false;
      }
      return failureCount < 2;
    }
  });

  const items: Evidence[] = useMemo(() => {
    const list: Evidence[] = (data?.data as unknown as Evidence[]) || [];
    return list; // show all evidence rows
  }, [data]);

  // Row-level AI status polling state
  const [pollingMap, setPollingMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [aiRowStatus, setAiRowStatus] = useState<Record<string, { label: string; progress?: number }>>({});
  const pollersRef = useRef<Record<string, number>>({});
  const pollStateRef = useRef<Record<string, { phase: 'awaitId' | 'status'; attempt: number; delayMs: number; analysisId?: string }>>({});

  const setStatus = (id: string, label: string, progress?: number) => {
    setAiRowStatus((prev) => ({ ...prev, [id]: { label, progress } }));
  };

  const stopPolling = (id: string) => {
    const timerId = pollersRef.current[id];
    if (timerId) {
      clearTimeout(timerId);
      delete pollersRef.current[id];
    }
    delete pollStateRef.current[id];
    setPollingMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const startPolling = (id: string) => {
    if (pollersRef.current[id]) return; // already polling
    setPollingMap((prev) => ({ ...prev, [id]: true }));
    setStatus(id, 'Queued...');
    pollStateRef.current[id] = { phase: 'awaitId', attempt: 0, delayMs: 8000 };

    const poll = async () => {
      try {
        const state = pollStateRef.current[id];
        if (!state) return;

        if (state.phase === 'awaitId') {
          // Check for analysisId infrequently (starts at 8s with backoff)
          const ev = await evidenceService.getEvidence(id);
          const analysisId: string | undefined = (ev as any)?.aiAnalysis?.analysisId;
          if (!analysisId) {
            setStatus(id, 'Queued...');
          } else {
            // Switch to status phase with faster cadence
            state.phase = 'status';
            state.analysisId = analysisId;
            state.attempt = 0;
            state.delayMs = 3000;
          }
        }

        if (state.phase === 'status' && state.analysisId) {
          // Query via evidence-service (handles S2S auth to AI service)
          const statusRes = await evidenceService.getAIAnalysisStatus(id);
          const s: string = (statusRes as any)?.status || '';
          const progress: number | undefined = (statusRes as any)?.progress;
          const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Processing';
          setStatus(id, label, typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : undefined);

          if (['completed', 'failed', 'error'].includes(String(s).toLowerCase())) {
            stopPolling(id);
            queryClient.invalidateQueries({ queryKey: ['analysis-evidence'] });
            queryClient.invalidateQueries({ queryKey: ['evidence', id] });
            // Also refresh dashboard snapshots and activity feed
            queryClient.invalidateQueries({ queryKey: ['evidence-list'] });
            queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
            if (String(s).toLowerCase() === 'completed') {
              toast.success('Analysis completed');
            }
            return;
          }
        }

        // schedule next with backoff (cap at 20s)
        const nextDelay = Math.min(state.delayMs * 1.5, 20000);
        state.delayMs = nextDelay;
        state.attempt += 1;

        // Max attempts safety (about ~10 minutes in worst case)
        if (state.attempt > 60) {
          stopPolling(id);
          toast.info('Stopped polling after waiting for a long time. You can check status manually.');
          return;
        }
      } catch (err: any) {
        const retryAfter = parseInt(err?.response?.headers?.['retry-after'] || err?.response?.data?.retry_after, 10);
        const state = pollStateRef.current[id];
        if (state) {
          // Back off aggressively on 429 or network errors
          state.delayMs = Math.max(state.delayMs * 2, (retryAfter || 15) * 1000);
          state.attempt += 1;
        }
        setStatus(id, 'Rate limited, backing off...');
      }
      // Schedule next tick
      const st = pollStateRef.current[id];
      if (!st) return;
      pollersRef.current[id] = window.setTimeout(poll, st.delayMs) as unknown as number;
    };

    // Kick off first tick after initial delay (to avoid hammering API immediately)
    const initial = pollStateRef.current[id];
    pollersRef.current[id] = window.setTimeout(poll, initial?.delayMs || 8000) as unknown as number;
  };

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollersRef.current).forEach((t) => clearTimeout(t));
      pollersRef.current = {};
      pollStateRef.current = {};
    };
  }, []);

  const statusMutation = useMutation({
    mutationFn: async (evidenceId: string) => evidenceService.getAIAnalysisStatus(evidenceId),
    onSuccess: (_res: any, evidenceId: string) => {
      toast.info('Status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['evidence', evidenceId] });
      queryClient.invalidateQueries({ queryKey: ['analysis-evidence'] });
    },
    onError: (err: any) => { 
      console.error('Status fetch error:', err);
      
      let errorMessage = 'Failed to fetch status';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      if (err.response?.status) {
        errorMessage = `${errorMessage} (Status: ${err.response.status})`;
      }
      
      toast.error(errorMessage);
    }
  });

  const handleAnalyze = async (evidenceId: string, analysisType: string) => {
    try {
      setLoadingMap(prev => ({ ...prev, [evidenceId]: true }));
      await evidenceService.submitForAIAnalysis(evidenceId, analysisType);
      toast.success('Analysis started successfully');
      queryClient.invalidateQueries({ queryKey: ['evidence', evidenceId] });
      queryClient.invalidateQueries({ queryKey: ['analysis-evidence'] });
      startPolling(evidenceId);
    } catch (err: any) {
      console.error('Analysis submission error:', err);
      
      // Extract detailed error information
      let errorMessage = 'Failed to start analysis';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Add status code info if available
      if (err.response?.status) {
        errorMessage = `${errorMessage} (Status: ${err.response.status})`;
      }
      
      toast.error(errorMessage, { 
        autoClose: 6000,  // Show longer for error messages
      });
    } finally {
      setLoadingMap(prev => ({ ...prev, [evidenceId]: false }));
    }
  };

  const viewMutation = useMutation({
    mutationFn: async (evidenceId: string) => evidenceService.getAIAnalysisResults(evidenceId),
    onError: (err: any) => { toast.error(err.message || 'Failed to fetch results'); }
  });

  const handleView = async (evidenceId: string) => {
    const res = await viewMutation.mutateAsync(evidenceId);
    const r: Partial<AIAnalysisResult> | undefined = (res as any);
    if (!r) return;
    const conf = Math.round((r.confidence || 0) * 100) / 100;
    toast.success(`Analysis ${r.analysisId || ''} • Confidence: ${conf}% • Anomalies: ${r.anomaliesDetected ? 'Yes' : 'No'}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analysis Results</h1>
          <p className="mt-1 text-sm text-gray-500">View AI analysis results and reports</p>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or filename"
            className="input"
          />
          <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as '' | keyof typeof EvidenceType)}>
            <option value="">All Types</option>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
            <option value="DOCUMENT">Document</option>
            <option value="AUDIO">Audio</option>
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | keyof typeof EvidenceStatus)}>
            <option value="">All Status</option>
            <option value="PROCESSING">Processing</option>
            <option value="ANALYZED">Analyzed</option>
          </select>
          <button className="btn" onClick={() => refetch()} disabled={isFetching}>Refresh</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>
      ) : isError ? (
        <div className="p-6 text-red-600">{(error as any)?.message || 'Failed to load analysis list.'}</div>
      ) : (
        <div className="card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Recent Analyses</h3></div>
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Anomalies</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((e) => {
                    const ai: any = (e as any).aiAnalysis || {};
                    const conf = ai.confidence ?? 0;
                    const anomalies = ai.anomaliesDetected === true;
                    const filename = (e as any).metadata?.filename || (e as any).metadata?.originalName || '';
                    const typeMap: Record<string, string> = { IMAGE: 'image', VIDEO: 'video', DOCUMENT: 'document', AUDIO: 'audio', OTHER: 'image' };
                    const analysisType = typeMap[(e.type as any) || 'IMAGE'] || 'image';
                    return (
                      <tr key={e.evidenceId}>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex flex-col">
                            <Link to={`/evidence/${e.evidenceId}`} className="text-blue-600 hover:underline font-mono">{e.evidenceId}</Link>
                            <div className="text-gray-500">{filename}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{e.type}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${e.status === EvidenceStatus.ANALYZED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{conf}%</td>
                        <td className="px-6 py-4 text-sm">
                          {anomalies ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Yes</span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">No</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-right space-x-2">
                          {pollingMap[e.evidenceId] ? (
                            <div className="inline-flex items-center space-x-2 text-indigo-700">
                              <LoadingSpinner size="sm" />
                              <span className="text-sm">
                                {aiRowStatus[e.evidenceId]?.label || 'Analyzing...'}
                                {typeof aiRowStatus[e.evidenceId]?.progress === 'number' ? ` ${aiRowStatus[e.evidenceId]?.progress}%` : ''}
                              </span>
                            </div>
                          ) : !ai.analysisId ? (
                            <button
                              className={`px-3 py-1 rounded-md text-white transition-colors ${
                                loadingMap[e.evidenceId] 
                                  ? 'bg-gray-400 cursor-not-allowed' 
                                  : 'bg-indigo-600 hover:bg-indigo-700'
                              }`}
                              onClick={() => handleAnalyze(e.evidenceId, analysisType)}
                              disabled={loadingMap[e.evidenceId]}
                            >
                              {loadingMap[e.evidenceId] ? (
                                <span className="inline-flex items-center space-x-1">
                                  <LoadingSpinner size="sm" />
                                  <span>Starting...</span>
                                </span>
                              ) : (
                                'Analyze'
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center space-x-2">
                              {aiRowStatus[e.evidenceId]?.label && (
                                <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                  {aiRowStatus[e.evidenceId]?.label}
                                  {typeof aiRowStatus[e.evidenceId]?.progress === 'number' ? ` ${aiRowStatus[e.evidenceId]?.progress}%` : ''}
                                </span>
                              )}
                              <button
                                className={`px-3 py-1 rounded-md border transition-colors ${
                                  statusMutation.isPending 
                                    ? 'border-gray-300 text-gray-400 cursor-not-allowed' 
                                    : 'text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                                }`}
                                onClick={() => statusMutation.mutate(e.evidenceId)}
                                disabled={statusMutation.isPending}
                              >
                                {statusMutation.isPending ? (
                                  <span className="inline-flex items-center space-x-1">
                                    <LoadingSpinner size="sm" />
                                    <span>Checking...</span>
                                  </span>
                                ) : (
                                  'Check Status'
                                )}
                              </button>
                              <button
                                className={`px-3 py-1 rounded-md border transition-colors ${
                                  loadingMap[e.evidenceId]
                                    ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                                    : 'text-orange-700 border-orange-200 hover:bg-orange-50'
                                }`}
                                onClick={() => handleAnalyze(e.evidenceId, analysisType)}
                                disabled={loadingMap[e.evidenceId]}
                                title="Resubmit analysis"
                              >
                                {loadingMap[e.evidenceId] ? (
                                  <span className="inline-flex items-center space-x-1">
                                    <LoadingSpinner size="sm" />
                                    <span>Resubmitting...</span>
                                  </span>
                                ) : (
                                  'Resubmit'
                                )}
                              </button>
                              <button
                                className="px-3 py-1 rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                                onClick={() => handleView(e.evidenceId)}
                                disabled={viewMutation.isPending}
                              >
                                View Report
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">{data?.pagination?.total || 0} total</div>
              <div className="space-x-2">
                <button className="btn" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <button className="btn" disabled={!!data && page >= (data.pagination?.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

