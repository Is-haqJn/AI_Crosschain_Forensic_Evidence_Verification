import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { caseService } from '../services/caseService';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { MoreHorizontal, Archive, Lock, Eye } from 'lucide-react';

export const CasesList: React.FC = () => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cases', { page: 1, limit: 10 }],
    queryFn: () => caseService.listCases({ page: 1, limit: 10 }),
    refetchOnWindowFocus: false
  });

  const createMutation = useMutation({
    mutationFn: () => caseService.createCase({ title: title.trim(), description: (description || '').trim() }),
    onSuccess: () => {
      toast.success('Case created');
      setTitle('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
    },
    onError: (e: any) => {
      const err = e?.response?.data?.error;
      const details = Array.isArray(err?.details)
        ? err.details.map((d: any) => (typeof d === 'string' ? d : d?.message)).filter(Boolean).join('; ')
        : '';
      const msg = (details || err?.message || e?.message || 'Failed to create case').toString();
      toast.error(msg);
    }
  });

  const closeCaseMutation = useMutation({
    mutationFn: (caseId: string) => caseService.closeCase(caseId),
    onSuccess: () => {
      toast.success('Case closed');
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases-dashboard'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Failed to close case');
    }
  });

  const archiveCaseMutation = useMutation({
    mutationFn: (caseId: string) => caseService.archiveCase(caseId),
    onSuccess: () => {
      toast.success('Case archived');
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases-dashboard'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Failed to archive case');
    }
  });

  if (isLoading) return <div className="p-6">Loading cases...</div>;
  const items = (data?.data || []) as any[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-sm text-gray-500">Investigations and their linked evidence</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Cases</h3></div>
        <div className="card-body">
          {isError && (
            <div className="mb-4 text-sm text-red-600">Failed to load cases. Ensure database is running.</div>
          )}
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Case</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((c: any) => (
              <tr key={c.caseId}>
                <td className="px-6 py-4">
                  <div>
                    <Link to={`/cases/${c.caseId}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {c.title}
                    </Link>
                    {c.description && (
                      <p className="text-xs text-gray-500 mt-1">{c.description}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    c.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    c.status === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                    c.status === 'ARCHIVED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {c.status || 'ACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{c.evidence?.length || 0}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Unknown'}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-2">
                    <Link 
                      to={`/cases/${c.caseId}`} 
                      className="text-indigo-600 hover:text-indigo-900 flex items-center"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Link>
                    {c.status !== 'CLOSED' && c.status !== 'ARCHIVED' && (
                      <>
                        <button
                          onClick={() => closeCaseMutation.mutate(c.caseId)}
                          disabled={closeCaseMutation.isPending}
                          className="text-orange-600 hover:text-orange-900 flex items-center disabled:opacity-50"
                        >
                          <Lock className="h-4 w-4 mr-1" />
                          Close
                        </button>
                        <button
                          onClick={() => archiveCaseMutation.mutate(c.caseId)}
                          disabled={archiveCaseMutation.isPending}
                          className="text-gray-600 hover:text-gray-900 flex items-center disabled:opacity-50"
                        >
                          <Archive className="h-4 w-4 mr-1" />
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Create Case</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
              <input className="input" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
              <button className="btn-primary" disabled={!title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
