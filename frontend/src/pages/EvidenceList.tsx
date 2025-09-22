import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evidenceService } from '../services/evidenceService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Evidence } from '../types';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

const NETWORK_LABELS: Record<string, string> = {
  sepolia: 'Sepolia',
  amoy: 'Polygon Amoy',
};

const CHAIN_LABELS: Record<number, string> = {
  11155111: 'Sepolia',
  80002: 'Polygon Amoy',
};

const formatNetworkName = (network?: string) => {
  if (!network) return '';
  return NETWORK_LABELS[network] || network.charAt(0).toUpperCase() + network.slice(1);
};

const formatChainName = (chainId?: number) => {
  if (typeof chainId !== 'number') return '';
  return CHAIN_LABELS[chainId] || `Chain ${chainId}`;
};

const shortHash = (hash?: string) => {
  if (!hash) return '';
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

export const EvidenceList: React.FC = () => {
  const queryClient = useQueryClient();

  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evidence', { page: 1, limit: 10 }],
    queryFn: () => evidenceService.getEvidenceList(1, 10),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 60_000,
  });

  const submitMutation = useMutation({
    mutationFn: ({ id, network }: { id: string; network: string }) => evidenceService.submitToBlockchain(id, network),
    onMutate: (variables: { id: string; network: string }) => {
      setSubmittingId(variables.id);
    },
    onSuccess: (res: any) => {
      const payload = res.data;
      if (payload) {
        const submittedNetwork = formatNetworkName(payload.network) || 'Network';
        toast.success(`Submitted on ${submittedNetwork}${payload.transactionHash ? ` (${shortHash(payload.transactionHash)})` : ''}`);
        if (payload.bridge) {
          const bridgedNetwork = formatNetworkName(payload.bridge.targetNetwork) || 'Target';
          toast.success(`Bridged to ${bridgedNetwork}${payload.bridge.transactionHash ? ` (${shortHash(payload.bridge.transactionHash)})` : ''}`);
        }
      } else {
        toast.success('Submitted to blockchain');
      }
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Blockchain submission failed');
    },
    onSettled: () => {
      setSubmittingId(null);
    }
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, network }: { id: string; network: string }) => evidenceService.verifyOnBlockchain(id, network),
    onSuccess: (res: any) => {
      const v = res.data;
      toast.info(v?.verified ? 'Evidence verified on-chain' : 'Evidence not found on-chain');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Verification failed');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-red-600">
        {(error as any)?.message || 'Failed to load evidence.'}
      </div>
    );
  }

  const items: Evidence[] = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Evidence</h1>
          <p className="text-sm text-gray-500">Browse and manage evidence items</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-medium text-gray-700">All Evidence</h3></div>
        <div className="card-body">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blockchain</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((e) => {
              const onChain = Boolean((e as any).blockchainData?.transactionHash);
              const isBridged = Boolean((e as any).crossChainData?.bridged);
              const sourceNetwork = (e as any).blockchainData?.network || '';
              const targetChainId = (e as any).crossChainData?.targetChain;
              const filename = (e as any).metadata?.filename || (e as any).metadata?.originalName || '';
              const submitDisabled = onChain || submitMutation.isPending;
              const isSubmitting = submitMutation.isPending && submittingId === e.evidenceId;
              return (
                <tr key={e.evidenceId}>
                  <td className="px-6 py-4 text-sm text-blue-600">
                    <Link to={`/evidence/${e.evidenceId}`} className="hover:underline">
                      {e.evidenceId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{e.type}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      {e.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{filename}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-col gap-1">
                      {onChain ? (
                        <>
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Submitted on {formatNetworkName(sourceNetwork) || 'Network'}
                          </span>
                          {isBridged && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              Bridged to {formatChainName(targetChainId) || 'Target'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">{isSubmitting ? 'Submitting...' : 'Off-chain'}</span>
                      )}
                    </div>

                  </td>
                  <td className="px-6 py-4 text-sm text-right space-x-2">
                    <button
                      disabled={submitDisabled}
                      onClick={() => submitMutation.mutate({ id: e.evidenceId, network: (process.env.REACT_APP_SUBMIT_NETWORK || 'sepolia') })}
                      className={`px-3 py-1 rounded-md text-white ${submitDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Submitting...</span>
                        </span>
                      ) : 'Submit'}
                    </button>
                    <button
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate({ id: e.evidenceId, network: (process.env.REACT_APP_VERIFY_NETWORK || 'amoy') })}
                      className="px-3 py-1 rounded-md text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                    >
                      Verify
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    </div>
  );
};


