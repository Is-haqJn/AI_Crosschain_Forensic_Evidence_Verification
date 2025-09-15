import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { evidenceService } from '../services/evidenceService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Evidence } from '../types';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

export const EvidenceList: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery(
    ['evidence', { page: 1, limit: 10 }],
    () => evidenceService.getEvidenceList(1, 10),
    {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 60_000,
    }
  );

  const submitMutation = useMutation(
    ({ id, network }: { id: string; network: string }) => evidenceService.submitToBlockchain(id, network),
    {
      onSuccess: () => {
        toast.success('Submitted to blockchain');
        queryClient.invalidateQueries('evidence');
      },
      onError: (err: any) => {
        toast.error(err.message || 'Blockchain submission failed');
      },
    }
  );

  const verifyMutation = useMutation(
    ({ id, network }: { id: string; network: string }) => evidenceService.verifyOnBlockchain(id, network),
    {
      onSuccess: (res) => {
        const v = res.data;
        toast.info(v?.verified ? 'Evidence verified on-chain' : 'Evidence not found on-chain');
      },
      onError: (err: any) => {
        toast.error(err.message || 'Verification failed');
      },
    }
  );

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
              const filename = (e as any).metadata?.filename || (e as any).metadata?.originalName || '';
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
                    {onChain ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">On-chain</span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Off-chain</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-right space-x-2">
                    <button
                      disabled={onChain || submitMutation.isLoading}
                      onClick={() => submitMutation.mutate({ id: e.evidenceId, network: 'sepolia' })}
                      className={`px-3 py-1 rounded-md text-white ${onChain ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                      Submit
                    </button>
                    <button
                      disabled={verifyMutation.isLoading}
                      onClick={() => verifyMutation.mutate({ id: e.evidenceId, network: 'sepolia' })}
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
