import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { caseService } from '../services/caseService';
// import { evidenceService } from '../services/evidenceService';
import { toast } from 'react-toastify';

export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [evidenceId, setEvidenceId] = useState('');

  const { data, isLoading, isError } = useQuery(['case', id], () => caseService.getCase(id!), { enabled: Boolean(id), refetchOnWindowFocus: false });

  const addEvidenceMutation = useMutation(
    (vars: { evidenceId: string }) => caseService.addEvidence(id!, vars.evidenceId),
    {
      onSuccess: () => {
        toast.success('Evidence linked');
        queryClient.invalidateQueries(['case', id]);
        setEvidenceId('');
      },
      onError: (e: any) => {
        toast.error(e.message || 'Failed');
      }
    }
  );

  if (isLoading) return <div className="p-6">Loading case...</div>;
  if (isError || !data?.data) return <div className="p-6 text-red-600">Case not found</div>;

  const c = data.data as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{c.title}</h1>
          <p className="text-sm text-gray-500">Status: {c.status}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Evidence</h3></div>
          <div className="card-body">
          <h3 className="text-lg font-semibold mb-4">Evidence</h3>
          <ul className="divide-y divide-gray-200">
            {(c.evidence || []).map((e: any) => (
              <li key={e.evidenceId} className="py-3 flex items-center justify-between">
                <span className="font-mono text-sm">{e.evidenceId}</span>
                <button className="text-indigo-600 hover:underline" onClick={() => window.open(`/evidence/${e.evidenceId}`, '_self')}>Open</button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex space-x-2">
            <input value={evidenceId} onChange={e => setEvidenceId(e.target.value)} placeholder="Evidence ID" className="flex-1 border rounded px-3 py-2" />
            <button disabled={!evidenceId || addEvidenceMutation.isLoading} onClick={() => addEvidenceMutation.mutate({ evidenceId })} className="px-3 py-2 rounded bg-indigo-600 text-white">Add</button>
          </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Details</h3></div>
          <div className="card-body">
          <h3 className="text-lg font-semibold mb-4">Actions</h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p>Lead: {c.leadInvestigator?.name || c.leadInvestigator?.userId}</p>
            <p>Participants: {c.participants?.length || 0}</p>
            <p>Tags: {(c.tags || []).join(', ')}</p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
