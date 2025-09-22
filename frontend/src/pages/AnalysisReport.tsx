import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { evidenceService } from '../services/evidenceService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AnalysisType, EvidenceType } from '../types';

export const AnalysisReport: React.FC = () => {
  const { evidenceId } = useParams<{ evidenceId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('summary');

  // Fetch evidence details
  const { 
    data: evidence, 
    isLoading: evidenceLoading, 
    error: evidenceError 
  } = useQuery({
    queryKey: ['evidence', evidenceId],
    queryFn: () => evidenceId ? evidenceService.getEvidence(evidenceId) : Promise.reject('No evidence ID provided'),
    enabled: !!evidenceId,
    retry: 1,
  });

  // Fetch analysis results
  const { 
    data: analysisResults, 
    isLoading: analysisLoading, 
    error: analysisError 
  } = useQuery({
    queryKey: ['analysis-results', evidenceId, evidence?.aiAnalysis?.analysisId],
    // Normalize backend response: accept either wrapped {results, confidence,...}
    // or raw results object and map into a consistent UI shape
    queryFn: async () => {
      if (!evidenceId) throw new Error('No evidence ID provided');
      const raw: any = await evidenceService.getAIAnalysisResults(evidenceId);
      const source: any = (raw && typeof raw === 'object' && 'results' in raw) ? (raw as any).results : raw;

      const pickNumber = (v: any): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const confRaw = source?.confidence_percent ?? source?.confidence_score ?? source?.confidence ?? source?.metrics?.confidence ?? 0;
      const confNum = pickNumber(confRaw);
      const confidence = confNum <= 1 ? Math.round(confNum * 10000) / 100 : Math.round(confNum * 100) / 100;

      const anomaliesDetected = Boolean(
        source?.anomaliesDetected === true || source?.anomalies === true || source?.manipulation?.isManipulated === true || source?.manipulation_detection?.is_manipulated === true
      );

      // Normalize processing time to milliseconds for UI display (UI divides by 1000)
      const rawProc = pickNumber(source?.processing_time_ms ?? source?.processing_time ?? source?.processingTime ?? 0);
      // If value looks like seconds (< 100), convert to ms; otherwise assume already ms
      const processingTime = rawProc > 0 && rawProc < 100 ? Math.round(rawProc * 1000) : rawProc;
      const modelVersion = String(source?.model_version ?? source?.modelVersion ?? '');

      // Map core image fields into UI-friendly structure when available
      const mapImageFields = (r: any) => {
        const tech = r?.technical_metadata || {};
        const md = r?.manipulation_detection || {};
        const exif = r?.exif_analysis || {};
        const content = r?.content || {};
        return {
          manipulation: {
            isManipulated: Boolean(md?.is_manipulated ?? md?.isManipulated ?? false),
            confidence: pickNumber(md?.confidence ?? 0),
            techniques: md?.techniques || (md?.manipulation_type ? [String(md.manipulation_type)] : []),
          },
          metadata: {
            extracted: {
              width: tech?.width,
              height: tech?.height,
              channels: tech?.channels,
              format: tech?.format,
              colorSpace: tech?.color_space,
              fileSize: tech?.file_size,
              bitDepth: tech?.bit_depth,
              fileHash: tech?.file_hash,
              text: tech?.extracted_text,
            },
            inconsistencies: exif?.is_modified ? ['EXIF indicates modified software'] : [],
          },
          content: {
            objects: Array.isArray(r?.detected_objects)
              ? r.detected_objects.map((o: any) => ({ label: o.class || o.label || 'object', confidence: pickNumber(o.confidence) }))
              : (content.objects || []),
            faces: Array.isArray(r?.detected_faces)
              ? r.detected_faces.map((f: any) => ({ confidence: pickNumber(f.confidence || 0) }))
              : (content.faces || []),
          },
          anomalies: Array.isArray(md?.affected_regions) && md.affected_regions.length > 0 ? [
            { type: 'potential_manipulation_regions', description: 'High-ELA regions detected', severity: 'medium', confidence: pickNumber(md?.confidence ?? 0) },
          ] : [],
          authenticity: {
            isAuthentic: !(Boolean(md?.is_manipulated)),
            confidence: Math.max(0, Math.min(1, 1 - pickNumber(md?.confidence ?? 0))),
            issues: [],
            verificationMethods: [] as string[],
          }
        };
      };

      const normalizedResults = (() => {
        const t = getAnalysisType(evidence?.type || EvidenceType.IMAGE);
        if (t === AnalysisType.IMAGE) return mapImageFields(source);
        return source;
      })();

      return {
        analysisId: evidence?.aiAnalysis?.analysisId || '',
        evidenceId: evidenceId,
        type: getAnalysisType(evidence?.type || EvidenceType.IMAGE),
        status: 'completed',
        results: normalizedResults,
        confidence,
        anomaliesDetected,
        processingTime,
        modelVersion,
      } as any;
    },
    enabled: !!evidenceId && !!evidence?.aiAnalysis?.analysisId,
    retry: 1,
  });

  const isLoading = evidenceLoading || analysisLoading;
  const error = evidenceError || analysisError;
  
  // Map evidence type to analysis type
  const getAnalysisType = (type: string): AnalysisType => {
    const typeMap: Record<string, AnalysisType> = {
      [EvidenceType.IMAGE]: AnalysisType.IMAGE,
      [EvidenceType.VIDEO]: AnalysisType.VIDEO,
      [EvidenceType.DOCUMENT]: AnalysisType.DOCUMENT,
      [EvidenceType.AUDIO]: AnalysisType.AUDIO,
      [EvidenceType.OTHER]: AnalysisType.IMAGE,
    };
    return typeMap[type] || AnalysisType.IMAGE;
  };

  const renderVideoAnalysis = () => {
    if (!analysisResults?.results) return <p>No video analysis data available</p>;
    
    const { manipulation, authenticity, metadata, content, anomalies } = analysisResults.results;
    
    return (
      <div className="space-y-6">
        {/* Video Authenticity Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Video Authenticity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Manipulation Detection</p>
              <div className="mt-2 flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  manipulation?.isManipulated ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {manipulation?.isManipulated ? 'Manipulated' : 'No Manipulation Detected'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {manipulation?.confidence ? `${Math.round(manipulation.confidence * 100) / 100}% confidence` : ''}
                </span>
              </div>
              {manipulation?.techniques && manipulation.techniques.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Detected Techniques:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {manipulation.techniques.map((technique: string, idx: number) => (
                      <li key={idx}>{technique}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Overall Assessment</p>
              <div className="mt-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  authenticity?.isAuthentic ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {authenticity?.isAuthentic ? 'Authentic' : 'Suspicious'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {authenticity?.confidence ? `${Math.round(authenticity.confidence * 100) / 100}% confidence` : ''}
                </span>
              </div>
              {authenticity?.issues && authenticity.issues.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Issues:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {authenticity.issues.map((issue: string, idx: number) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Video Technical Details */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Technical Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Video Metadata</p>
              {metadata?.extracted && (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-200">
                      {Object.entries(metadata.extracted).map(([key, value]) => (
                        <tr key={key}>
                          <td className="py-1 pr-2 font-medium text-gray-500">{key}</td>
                          <td className="py-1 text-gray-900">{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Content Analysis</p>
              {content?.objects && content.objects.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Detected Objects:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {content.objects.map((obj: { label: string; confidence: number }, idx: number) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {obj.label} ({Math.round(obj.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {content?.faces && content.faces.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Faces Detected: {content.faces.length}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Anomalies Section */}
        {anomalies && anomalies.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detected Anomalies</h3>
            <div className="space-y-4">
              {anomalies.map((anomaly: any, idx: number) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{anomaly.type}</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{anomaly.description}</p>
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          anomaly.severity === 'high' ? 'bg-red-100 text-red-800' :
                          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)} Severity
                        </span>
                        <span className="ml-2 text-xs text-red-500">
                          {anomaly.confidence ? `${Math.round(anomaly.confidence * 100)}% confidence` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderImageAnalysis = () => {
    if (!analysisResults?.results) return <p>No image analysis data available</p>;
    
    const { manipulation, authenticity, metadata, content, anomalies } = analysisResults.results;
    
    return (
      <div className="space-y-6">
        {/* Image Authenticity Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Image Authenticity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Manipulation Detection</p>
              <div className="mt-2 flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  manipulation?.isManipulated ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {manipulation?.isManipulated ? 'Manipulated' : 'No Manipulation Detected'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {manipulation?.confidence ? `${Math.round(manipulation.confidence * 100) / 100}% confidence` : ''}
                </span>
              </div>
              {manipulation?.techniques && manipulation.techniques.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Detected Techniques:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {manipulation.techniques.map((technique: string, idx: number) => (
                      <li key={idx}>{technique}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Error Level Analysis (ELA)</p>
              <div className="mt-2">
                <p className="text-sm text-gray-700">
                  ELA highlights areas that have been digitally modified by showing differences in compression quality.
                  {manipulation?.confidence && (
                    <span className="block mt-1 text-xs text-gray-500">
                      ELA Score: {(manipulation.confidence * 100).toFixed(1)}%
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Image Metadata Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Image Metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">EXIF Data</p>
              {metadata?.extracted && Object.keys(metadata.extracted).length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-200">
                      {Object.entries(metadata.extracted).map(([key, value]) => (
                        <tr key={key}>
                          <td className="py-1 pr-2 font-medium text-gray-500">{key}</td>
                          <td className="py-1 text-gray-900">{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No EXIF data available</p>
              )}
              
              {metadata?.inconsistencies && metadata.inconsistencies.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">Metadata Inconsistencies:</p>
                  <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                    {metadata.inconsistencies.map((issue: string, idx: number) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Image Quality Assessment</p>
              <div className="mt-2">
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Compression Level:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metadata?.extracted?.quality || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Dimensions:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metadata?.extracted?.width && metadata?.extracted?.height ? 
                        `${metadata.extracted.width} × ${metadata.extracted.height}` : 
                        'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Color Space:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metadata?.extracted?.colorSpace || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Format:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metadata?.extracted?.format || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Content Analysis Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Content Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Detected Objects</p>
              {content?.objects && content.objects.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {content.objects.map((obj: { label: string; confidence: number }, idx: number) => (
                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {obj.label} ({Math.round(obj.confidence * 100)}%)
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No objects detected</p>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Face Detection</p>
              {content?.faces && content.faces.length > 0 ? (
                <div className="mt-2">
                  <p className="text-sm text-gray-700">
                    {content.faces.length} {content.faces.length === 1 ? 'face' : 'faces'} detected in the image.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {content.faces.map((face: { confidence: number }, idx: number) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        Face {idx+1} ({Math.round(face.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No faces detected</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Anomalies Section */}
        {anomalies && anomalies.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detected Anomalies</h3>
            <div className="space-y-4">
              {anomalies.map((anomaly: any, idx: number) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{anomaly.type}</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{anomaly.description}</p>
                      </div>
                      {anomaly.location && (
                        <div className="mt-1 text-xs text-red-600">
                          Region: x={anomaly.location.x}, y={anomaly.location.y}, 
                          width={anomaly.location.width}, height={anomaly.location.height}
                        </div>
                      )}
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          anomaly.severity === 'high' ? 'bg-red-100 text-red-800' :
                          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)} Severity
                        </span>
                        <span className="ml-2 text-xs text-red-500">
                          {anomaly.confidence ? `${Math.round(anomaly.confidence * 100)}% confidence` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDocumentAnalysis = () => {
    if (!analysisResults?.results) return <p>No document analysis data available</p>;
    
    const { authenticity, metadata, content, anomalies } = analysisResults.results;
    // Document-specific fields from the API
    const structureAnalysis = (analysisResults.results as any)?.structure_analysis;
    const plagiarismCheck = (analysisResults.results as any)?.plagiarism_check;
    
    return (
      <div className="space-y-6">
        {/* Document Authenticity Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Authenticity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Authenticity Assessment</p>
              <div className="mt-2 flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  authenticity?.isAuthentic ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {authenticity?.isAuthentic ? 'Authentic' : 'Suspicious'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {authenticity?.confidence ? `${Math.round(authenticity.confidence * 100) / 100}% confidence` : ''}
                </span>
              </div>
              {authenticity?.issues && authenticity.issues.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Issues:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {authenticity.issues.map((issue: string, idx: number) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Digital Signatures</p>
              {authenticity?.verificationMethods && authenticity.verificationMethods.length > 0 ? (
                <div className="mt-2">
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {authenticity.verificationMethods.map((method: string, idx: number) => (
                      <li key={idx}>{method}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No digital signatures detected</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Document Content Analysis */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Content</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Content Summary</p>
              {content?.text ? (
                <div className="mt-2">
                  <p className="text-sm text-gray-700 line-clamp-4">{content.text.substring(0, 200)}...</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {content.text.split(' ').length} words, {content.text.length} characters
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No text content extracted</p>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Document Structure</p>
              {structureAnalysis ? (
                <div className="mt-2">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Pages:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {structureAnalysis.page_count || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Sections:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {structureAnalysis.section_count || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Tables:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {structureAnalysis.table_count || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Images:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {structureAnalysis.image_count || 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No structure information available</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Plagiarism Check */}
        {plagiarismCheck && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Plagiarism Analysis</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  plagiarismCheck.plagiarism_detected ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {plagiarismCheck.plagiarism_detected ? 'Plagiarism Detected' : 'No Plagiarism Detected'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {plagiarismCheck.similarity_score ? `${Math.round(plagiarismCheck.similarity_score * 100) / 100}% similarity` : ''}
                </span>
              </div>
              
              {plagiarismCheck.matched_sources && plagiarismCheck.matched_sources.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">Matched Sources:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {plagiarismCheck.matched_sources.map((source: string, idx: number) => (
                      <li key={idx}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {plagiarismCheck.plagiarized_segments && plagiarismCheck.plagiarized_segments.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">Plagiarized Segments:</p>
                  <div className="mt-2 space-y-2">
                    {plagiarismCheck.plagiarized_segments.map((segment: string, idx: number) => (
                      <div key={idx} className="bg-red-50 p-2 rounded text-sm text-red-800 border border-red-200">
                        "{segment}"
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Document Metadata */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Metadata</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium text-gray-500">File Information</p>
            {metadata?.extracted && Object.keys(metadata.extracted).length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(metadata.extracted).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-1 pr-2 font-medium text-gray-500">{key}</td>
                        <td className="py-1 text-gray-900">{String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No metadata available</p>
            )}
            
            {metadata?.inconsistencies && metadata.inconsistencies.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500">Metadata Inconsistencies:</p>
                <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                  {metadata.inconsistencies.map((issue: string, idx: number) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        
        {/* Anomalies Section */}
        {anomalies && anomalies.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detected Anomalies</h3>
            <div className="space-y-4">
              {anomalies.map((anomaly: any, idx: number) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{anomaly.type}</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{anomaly.description}</p>
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          anomaly.severity === 'high' ? 'bg-red-100 text-red-800' :
                          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)} Severity
                        </span>
                        <span className="ml-2 text-xs text-red-500">
                          {anomaly.confidence ? `${Math.round(anomaly.confidence * 100)}% confidence` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAudioAnalysis = () => {
    if (!analysisResults?.results) return <p>No audio analysis data available</p>;
    
    const { authenticity, metadata, content, anomalies } = analysisResults.results;
    // Audio-specific fields from the API
    const voiceIdentification = (analysisResults.results as any)?.voice_identification;
    const technicalAnalysis = (analysisResults.results as any)?.technical_analysis;
    const spectrumAnalysis = (analysisResults.results as any)?.spectrum_analysis;
    const noiseAnalysis = (analysisResults.results as any)?.noise_analysis;
    
    return (
      <div className="space-y-6">
        {/* Audio Authenticity Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Audio Authenticity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Manipulation Detection</p>
              <div className="mt-2 flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  authenticity?.isAuthentic ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {authenticity?.isAuthentic ? 'Authentic' : 'Manipulated'}
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  {authenticity?.confidence ? `${Math.round(authenticity.confidence * 100) / 100}% confidence` : ''}
                </span>
              </div>
              {authenticity?.issues && authenticity.issues.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500">Issues:</p>
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {authenticity.issues.map((issue: string, idx: number) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Verification Methods</p>
              {authenticity?.verificationMethods && authenticity.verificationMethods.length > 0 ? (
                <div className="mt-2">
                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                    {authenticity.verificationMethods.map((method: string, idx: number) => (
                      <li key={idx}>{method}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No verification methods available</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Voice Identification Section */}
        {voiceIdentification && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Voice Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="text-sm font-medium text-gray-500">Speaker Identification</p>
                <div className="mt-2">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-900">
                      {voiceIdentification.speaker_count === 1 ? 'Single Speaker' : 
                       `${voiceIdentification.speaker_count || 'Multiple'} Speakers`}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {voiceIdentification.confidence ? `${Math.round(voiceIdentification.confidence * 100)}% confidence` : ''}
                    </span>
                  </div>
                  
                  {voiceIdentification.speakers && voiceIdentification.speakers.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500">Detected Speakers:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {voiceIdentification.speakers.map((speaker: any, idx: number) => (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {speaker.id || `Speaker ${idx+1}`} 
                            {speaker.confidence && ` (${Math.round(speaker.confidence * 100)}%)`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="text-sm font-medium text-gray-500">Voice Characteristics</p>
                {voiceIdentification.voice_characteristics ? (
                  <div className="mt-2 flex flex-col space-y-2">
                    {Object.entries(voiceIdentification.voice_characteristics).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                        <span className="text-sm font-medium text-gray-900">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">No voice characteristics available</p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Audio Technical Properties */}
        {technicalAnalysis && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Technical Properties</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500">Duration</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.duration ? `${technicalAnalysis.duration.toFixed(2)}s` : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Sample Rate</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.sample_rate ? `${technicalAnalysis.sample_rate} Hz` : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Channels</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.channels || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Format</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.format || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Bit Depth</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.bit_depth ? `${technicalAnalysis.bit_depth}-bit` : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Codec</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.codec || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Bitrate</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.bitrate ? `${Math.round(technicalAnalysis.bitrate / 1000)} kbps` : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Quality</p>
                  <p className="text-sm font-medium text-gray-900">
                    {technicalAnalysis.quality || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Spectrum Analysis */}
        {spectrumAnalysis && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Spectrum Analysis</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm font-medium text-gray-500">Frequency Characteristics</p>
              {spectrumAnalysis.frequency_ranges && Object.keys(spectrumAnalysis.frequency_ranges).length > 0 ? (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(spectrumAnalysis.frequency_ranges).map(([range, value]) => (
                      <div key={range} className="flex flex-col">
                        <span className="text-xs text-gray-500">{range}:</span>
                        <div className="h-4 bg-gray-200 rounded overflow-hidden">
                          <div 
                            className="h-full bg-blue-600" 
                            style={{ width: `${Math.min(100, Math.max(0, (value as number) * 100))}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No spectrum data available</p>
              )}
              
              {spectrumAnalysis.anomalies && spectrumAnalysis.anomalies.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">Spectrum Anomalies:</p>
                  <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                    {spectrumAnalysis.anomalies.map((anomaly: string, idx: number) => (
                      <li key={idx}>{anomaly}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Noise Analysis */}
        {noiseAnalysis && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Noise Analysis</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Background Noise</p>
                  <div className="mt-2 flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      (noiseAnalysis.noise_level || 0) > 0.5 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {(noiseAnalysis.noise_level || 0) > 0.5 ? 'High' : 'Low'}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">
                      {noiseAnalysis.noise_level !== undefined ? `${Math.round(noiseAnalysis.noise_level * 100)}% level` : ''}
                    </span>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-500">Noise Types</p>
                  {noiseAnalysis.noise_types && noiseAnalysis.noise_types.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {noiseAnalysis.noise_types.map((type: string, idx: number) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {type}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">No specific noise types identified</p>
                  )}
                </div>
              </div>
              
              {noiseAnalysis.signal_to_noise_ratio !== undefined && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">Signal-to-Noise Ratio (SNR):</p>
                  <p className="text-sm font-medium text-gray-900">
                    {noiseAnalysis.signal_to_noise_ratio.toFixed(2)} dB
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Transcription Section */}
        {content?.text && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Transcription</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm italic text-gray-700">"{content.text}"</p>
            </div>
          </div>
        )}
        
        {/* Anomalies Section */}
        {anomalies && anomalies.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detected Anomalies</h3>
            <div className="space-y-4">
              {anomalies.map((anomaly: any, idx: number) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{anomaly.type}</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{anomaly.description}</p>
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          anomaly.severity === 'high' ? 'bg-red-100 text-red-800' :
                          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)} Severity
                        </span>
                        <span className="ml-2 text-xs text-red-500">
                          {anomaly.confidence ? `${Math.round(anomaly.confidence * 100)}% confidence` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContentBasedOnType = () => {
    if (!evidence || !evidence.type) return null;
    
    const analysisType = getAnalysisType(evidence.type);
    
    switch (analysisType) {
      case AnalysisType.VIDEO:
        return renderVideoAnalysis();
      case AnalysisType.IMAGE:
        return renderImageAnalysis();
      case AnalysisType.DOCUMENT:
        return renderDocumentAnalysis();
      case AnalysisType.AUDIO:
        return renderAudioAnalysis();
      default:
        return <p>No specific analysis view available for this type</p>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mt-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading analysis report</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{(error as Error).message || 'An unknown error occurred'}</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                onClick={() => navigate('/analysis')}
              >
                Return to Analysis List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!evidence || !analysisResults) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">No analysis data available</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>Could not find analysis results for this evidence.</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                onClick={() => navigate('/analysis')}
              >
                Return to Analysis List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analysis Report</h1>
          <p className="mt-1 text-sm text-gray-500">
            {evidence.metadata.filename} • {evidence.type} • 
            Analysis ID: <span className="font-mono">{analysisResults.analysisId}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="btn"
            onClick={() => {
              // Export JSON
              const dataStr = JSON.stringify(analysisResults, null, 2);
              const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
              
              const exportFileDefaultName = `analysis-${analysisResults.analysisId}.json`;
              
              const linkElement = document.createElement('a');
              linkElement.setAttribute('href', dataUri);
              linkElement.setAttribute('download', exportFileDefaultName);
              linkElement.click();
            }}
          >
            Export JSON
          </button>
          <button
            className="btn"
            onClick={() => navigate('/analysis')}
          >
            Back to Analysis List
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/evidence/${evidenceId}`)}
          >
            View Evidence Details
          </button>
        </div>
      </div>

      {/* Analysis Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Analysis Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium text-gray-500">Confidence Score</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analysisResults.confidence}%</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium text-gray-500">Anomalies Detected</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {analysisResults.anomaliesDetected ? 'Yes' : 'No'}
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium text-gray-500">Processing Time</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {analysisResults.processingTime ? `${(analysisResults.processingTime / 1000).toFixed(2)}s` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            className={`${
              activeTab === 'summary'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('summary')}
          >
            Analysis Details
          </button>
          <button
            className={`${
              activeTab === 'json'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('json')}
          >
            Raw JSON
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="py-4">
        {activeTab === 'summary' ? (
          renderContentBasedOnType()
        ) : (
          <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
            <pre className="text-xs">{JSON.stringify(analysisResults, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
