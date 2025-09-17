import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { caseService } from '../services/caseService';
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
  const participants = Array.isArray(c.participants) ? c.participants : [];
  const evidenceItems = Array.isArray(c.evidence) ? c.evidence : [];
  const tags = Array.isArray(c.tags) ? c.tags : [];
  const createdAt = c.createdAt ? new Date(c.createdAt) : null;
  const updatedAt = c.updatedAt ? new Date(c.updatedAt) : null;

  const statusBadge = (() => {
    const base = 'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ';
    switch (c.status) {
      case 'OPEN':
        return base + 'bg-green-100 text-green-800 ring-1 ring-green-200';
      case 'IN_REVIEW':
        return base + 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
      case 'CLOSED':
        return base + 'bg-gray-200 text-gray-800 ring-1 ring-gray-300';
      default:
        return base + 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
    }
  })();

  const formatDateTime = (d?: Date | string) => {
    if (!d) return '-';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{c.title}</h1>
            <span className={statusBadge}>{c.status}</span>
          </div>
          <div className="text-xs text-gray-500">
            <span className="font-mono">#{c.caseId}</span>
            {createdAt && <span className="ml-2">Created: {formatDateTime(createdAt)}</span>}
            {updatedAt && <span className="ml-2">Updated: {formatDateTime(updatedAt)}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="card">
            <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Overview</h3></div>
            <div className="card-body space-y-4">
              {c.description && (
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{c.description}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Lead Investigator</div>
                  <div className="text-gray-900">{c.leadInvestigator?.name || c.leadInvestigator?.userId}</div>
                  {c.leadInvestigator?.organization && (
                    <div className="text-gray-500">{c.leadInvestigator.organization}</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Participants</div>
                  <div className="text-gray-900">{participants.length}</div>
                </div>
                <div>
                  <div className="text-gray-500">Evidence Items</div>
                  <div className="text-gray-900">{evidenceItems.length}</div>
                </div>
              </div>
              {!!tags.length && (
                <div>
                  <div className="text-gray-500 text-sm mb-1">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t: string) => (
                      <span key={t} className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Evidence</h3></div>
            <div className="card-body">
              <ul className="divide-y divide-gray-200">
                {evidenceItems.length === 0 && (
                  <li className="py-3 text-sm text-gray-500">No evidence linked yet.</li>
                )}
                {evidenceItems.map((e: any) => (
                  <li key={e.evidenceId} className="py-3 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="font-mono text-sm text-blue-700">{e.evidenceId}</div>
                      <div className="text-xs text-gray-500">Added {formatDateTime(e.addedAt)}{e.addedBy ? ` by ${e.addedBy}` : ''}</div>
                    </div>
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
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Participants</h3></div>
            <div className="card-body">
              <ul className="divide-y divide-gray-200">
                {participants.length === 0 && (
                  <li className="py-3 text-sm text-gray-500">No participants yet.</li>
                )}
                {participants.map((p: any, idx: number) => (
                  <li key={(p.userId || '') + idx} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
                        {(p.name || p.userId || '?').toString().charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm text-gray-900">{p.name || p.userId}</div>
                        <div className="text-xs text-gray-500">{p.organization || '-'}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 ring-1 ring-slate-200">{p.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
