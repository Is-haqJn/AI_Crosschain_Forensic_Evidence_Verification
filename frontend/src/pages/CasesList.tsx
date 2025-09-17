import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { caseService } from '../services/caseService';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

export const CasesList: React.FC = () => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { data, isLoading, isError } = useQuery(['cases', { page: 1, limit: 10 }], () => caseService.listCases({ page: 1, limit: 10 }), { refetchOnWindowFocus: false });

  const createMutation = useMutation(() => caseService.createCase({ title: title.trim(), description: (description || '').trim() }), {
    onSuccess: () => {
      toast.success('Case created');
      setTitle('');
      setDescription('');
      queryClient.invalidateQueries('cases');
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
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((c: any) => (
              <tr key={c.caseId}>
                <td className="px-6 py-4 text-sm text-blue-600"><Link to={`/cases/${c.caseId}`} className="hover:underline">{c.title}</Link></td>
                <td className="px-6 py-4 text-sm">{c.status}</td>
                <td className="px-6 py-4 text-sm">{c.evidence?.length || 0}</td>
                <td className="px-6 py-4 text-sm text-right"><Link to={`/cases/${c.caseId}`} className="text-indigo-600 hover:underline">Open</Link></td>
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
              <button className="btn-primary" disabled={!title.trim() || createMutation.isLoading} onClick={() => createMutation.mutate()}>Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
