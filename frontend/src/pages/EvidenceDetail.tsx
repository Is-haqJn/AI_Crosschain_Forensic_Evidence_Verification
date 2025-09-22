import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evidenceService } from '../services/evidenceService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { toast } from 'react-toastify';

export const EvidenceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evidence', id],
    queryFn: () => evidenceService.getEvidence(id!),
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 60_000,
  });

  const submitMutation = useMutation({
    mutationFn: (vars: { network: string }) => evidenceService.submitToBlockchain(id!, vars.network),
    onSuccess: () => {
      toast.success('Submitted to blockchain');
      queryClient.invalidateQueries({ queryKey: ['evidence', id] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Submission failed');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (vars: { network: string }) => evidenceService.verifyOnBlockchain(id!, vars.network),
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

  if (isError || !data) {
    return <div className="p-6 text-red-600">{(error as any)?.message || 'Not found'}</div>;
  }

  const e = data as any;
  const onChain = Boolean(e.blockchainData?.transactionHash);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Evidence Details</h1>
        <p className="mt-1 text-sm text-gray-500">View detailed information about evidence</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
          <div className="space-y-2">
            <div className="text-sm text-gray-500">ID</div>
            <div className="font-mono text-gray-900">{e.evidenceId}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Type</div>
              <div className="text-gray-900">{e.type}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <div className="text-gray-900">{e.status}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Filename</div>
              <div className="text-gray-900">{e.metadata?.filename || e.metadata?.originalName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Created</div>
              <div className="text-gray-900">{new Date(e.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Blockchain</div>
              <div className="text-gray-900">{onChain ? 'On-chain' : 'Off-chain'}</div>
            </div>
            <div className="space-x-2">
              <button
                disabled={onChain || submitMutation.isPending}
                onClick={() => submitMutation.mutate({ network: process.env.REACT_APP_SUBMIT_NETWORK || 'sepolia' })}
                className={`px-3 py-1 rounded-md text-white ${onChain ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                Submit
              </button>
              <button
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate({ network: process.env.REACT_APP_VERIFY_NETWORK || 'amoy' })}
                className="px-3 py-1 rounded-md text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
              >
                Verify
              </button>
            </div>
          </div>
          {onChain && (
            <div className="text-sm text-gray-700 break-all">
              <div>Tx: {e.blockchainData.transactionHash}</div>
              <div>Block: {e.blockchainData.blockNumber}</div>
              <div>Network: {e.blockchainData.network}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
