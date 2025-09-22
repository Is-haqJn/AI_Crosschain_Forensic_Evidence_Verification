import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  Image, 
  Video, 
  Music, 
  File,
  X,
  AlertCircle,
  Cloud
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { EvidenceType } from '../types';
import { evidenceService } from '../services/evidenceService';
import { caseService } from '../services/caseService';
import { toast } from 'react-toastify';

interface UploadForm {
  type: EvidenceType;
  description: string;
  caseNumber: string;
  caseId?: string;
  tags: string;
}

export const EvidenceUpload: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [cases, setCases] = useState<Array<{ caseId: string; title: string }>>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<UploadForm>();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadedFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  useEffect(() => {
    // Load recent cases for selection
    (async () => {
      try {
        const res: any = await caseService.listCases({ page: 1, limit: 50 });
        const items = Array.isArray(res?.data) ? res.data : [];
        setCases(items.map((c: any) => ({ caseId: c.caseId, title: c.title })));
      } catch (e) {
        // Non-fatal if cases cannot be loaded
      }
    })();
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'],
      'video/*': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'],
      'audio/*': ['.mp3', '.wav', '.m4a', '.flac', '.ogg'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    multiple: true
  });

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (file.type.startsWith('video/')) return <Video className="h-8 w-8 text-purple-500" />;
    if (file.type.startsWith('audio/')) return <Music className="h-8 w-8 text-green-500" />;
    if (file.type === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const onSubmit = async (data: UploadForm) => {
    if (uploadedFiles.length === 0) return;

    setIsUploading(true);
    try {
      // Upload sequentially to respect backend single-file endpoint
      for (const file of uploadedFiles) {
        const formData = new FormData();
        formData.append('evidence', file);
        formData.append('type', data.type);
        if (data.description) formData.append('description', data.description);
        if (data.tags) formData.append('tags', data.tags);
        if (data.caseId) formData.append('caseId', data.caseId);
        const ev = await evidenceService.uploadEvidence(formData, (p) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: p.percentage }));
        });

        toast.success(`${file.name} uploaded successfully`);

        // Optimistically update common caches and trigger refetches where needed
        try {
          // Evidence list pages
          queryClient.invalidateQueries({ queryKey: ['evidence'] });
          queryClient.setQueryData(['evidence', { page: 1, limit: 10 }], (old: any) => {
            if (!old) return old;
            const current = Array.isArray(old?.data) ? old.data : [];
            return { ...old, data: [ev, ...current].slice(0, 10) };
          });

          // Dashboard evidence snapshot
          queryClient.invalidateQueries({ queryKey: ['evidence-list'] });
          queryClient.setQueryData(['evidence-list'], (old: any) => {
            if (!old) return old;
            const current = Array.isArray(old?.data) ? old.data : [];
            return { ...old, data: [ev, ...current].slice(0, 10) };
          });

          // Recent activity feed
          queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          
          // Analysis results list (if auto-analysis is enabled)
          queryClient.invalidateQueries({ queryKey: ['analysis-evidence'] });
        } catch (_) {
          // non-fatal cache update failure
        }
      }

      // Reset after all uploads finish
      setUploadedFiles([]);
      setUploadProgress({});
      reset();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Upload Evidence</h1>
          <p className="text-sm text-gray-500">Securely upload files for analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Area */}
        <div className="card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700 flex items-center"><Cloud className="h-4 w-4 mr-2 text-blue-600" />File Upload</h3></div>
          <div className="card-body">
            <div
              {...getRootProps()}
              className={`
                relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
                ${isDragActive ? 'drag-active' : ''}
                ${isDragReject ? 'drag-reject' : ''}
                ${!isDragActive && !isDragReject ? 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50' : ''}
              `}
            >
              <input {...getInputProps()} />
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse files
                  </p>
                </div>
                <div className="text-xs text-gray-400">
                  Supports: Images, Videos, Audio, Documents (Max 100MB each)
                </div>
              </div>
            </div>

            {/* File List */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Selected Files</h4>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {uploadProgress[file.name] && (
                        <div className="w-16">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${uploadProgress[file.name]}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700 flex items-center"><FileText className="h-4 w-4 mr-2 text-emerald-600" />Evidence Details</h3></div>
          <div className="card-body">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Evidence Type
                </label>
                <select
                  {...register('type', { required: 'Please select evidence type' })}
                  className="input"
                >
                  <option value="">Select evidence type</option>
                  <option value={EvidenceType.IMAGE}>Image</option>
                  <option value={EvidenceType.VIDEO}>Video</option>
                  <option value={EvidenceType.AUDIO}>Audio</option>
                  <option value={EvidenceType.DOCUMENT}>Document</option>
                  <option value={EvidenceType.OTHER}>Other</option>
                </select>
                {errors.type && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {errors.type.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="input resize-none"
                  placeholder="Describe the evidence..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Case Number
                </label>
                <input
                  {...register('caseNumber')}
                  type="text"
                  className="input"
                  placeholder="Enter case number (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Link to Case
                </label>
                <select
                  {...register('caseId')}
                  className="input"
                >
                  <option value="">Do not link</option>
                  {cases.map((c) => (
                    <option key={c.caseId} value={c.caseId}>{c.title} — {c.caseId}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Optional: link this evidence to an existing case.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tags
                </label>
                <input
                  {...register('tags')}
                  type="text"
                  className="input"
                  placeholder="Enter tags separated by commas"
                />
              </div>

              <button
                type="submit"
                disabled={uploadedFiles.length === 0 || isUploading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Evidence
                  </div>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
