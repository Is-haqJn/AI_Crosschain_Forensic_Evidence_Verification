import React from 'react';
import { useQuery } from 'react-query';
import { 
  Shield, 
  Upload, 
  FileText, 
  BarChart3, 
  Clock,
  CheckCircle,
  Activity
} from 'lucide-react';
import { evidenceService } from '../services/evidenceService';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { SkeletonText } from '../components/Skeleton';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
// import { apiService } from '../services/apiService';
import { evidenceService as evSvc } from '../services/evidenceService';

// type removed (not used)

const StatCard: React.FC<{ title: string; value: number; icon: React.ComponentType<{ className?: string }>; }> = ({ title, value, icon: Icon }) => (
  <div className="card hover:shadow-md transition-shadow">
    <div className="card-body">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{value.toLocaleString()}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-700" />
        </div>
      </div>
    </div>
  </div>
);

const ActivityItem: React.FC<{
  activity: {
    id: string;
    type: string;
    description: string;
    timestamp: string;
    user: string;
  };
}> = ({ activity }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'upload':
        return <Upload className="h-4 w-4 text-primary-500" />;
      case 'analysis':
        return <BarChart3 className="h-4 w-4 text-warning-500" />;
      case 'verification':
        return <CheckCircle className="h-4 w-4 text-success-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0">
        {getActivityIcon(activity.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{activity.description}</p>
        <p className="text-xs text-gray-500">
          {activity.user} • {formatTimeAgo(activity.timestamp)}
        </p>
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: evidenceList, isLoading: evidenceLoading } = useQuery(
    'evidence-list',
    () => evidenceService.getEvidenceList(1, 10),
    {
      // Reduce UI churn: limit background polling and disable focus refetch
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      enabled: !!token,
    }
  );

  const { data: aiHealth, isLoading: healthLoading } = useQuery(
    'ai-health',
    () => apiService.getAIHealth(),
    {
      refetchInterval: 120000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    }
  );

  const { data: crosschain } = useQuery(
    'crosschain-health',
    () => evSvc.getCrossChainHealth(),
    {
      refetchInterval: 180000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      enabled: !!token,
    }
  );

  const isInitialLoading = evidenceLoading && healthLoading;

  const evidence = evidenceList?.data || [];
  const totalEvidence = evidenceList?.pagination?.total || 0;
  const pendingAnalysis = evidence.filter(e => e.status === 'PROCESSING').length;
  const completedAnalysis = evidence.filter(e => e.status === 'ANALYZED').length;

  const { data: recentActivity = [], isLoading: activityLoading } = useQuery(
    ['recent-activity'],
    () => evSvc.getRecentActivity(10),
    {
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      enabled: !!token,
    }
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Overview at a glance</p>
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-medium text-gray-700 flex items-center"><Activity className="h-4 w-4 mr-2 text-gray-600" />System Status</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3 p-4 rounded-lg border bg-blue-50 border-blue-200">
              <span className={clsx('inline-block h-2.5 w-2.5 rounded-full', aiHealth?.status === 'healthy' ? 'bg-emerald-500' : 'bg-gray-300')} />
              <div>
                <p className="text-sm text-blue-800">AI Analysis Service</p>
                <p className="text-xs text-blue-700">{aiHealth?.status ?? 'unknown'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-white rounded-lg border">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="text-sm text-gray-700">Evidence Service</p>
                <p className="text-xs text-gray-500">online</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 rounded-lg border bg-indigo-50 border-indigo-200">
              <span className={clsx('inline-block h-2.5 w-2.5 rounded-full', crosschain && Object.values(crosschain.networks).some(n => n.connected) ? 'bg-emerald-500' : 'bg-gray-300')} />
              <div>
                <p className="text-sm text-indigo-800">Cross-Chain Bridge</p>
                <p className="text-xs text-indigo-700">{crosschain ? Object.entries(crosschain.networks).map(([n, s]) => `${n}:${s.connected ? 'up' : 'down'}`).join(' · ') : 'checking...'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-white rounded-lg border">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="text-sm text-gray-700">Database</p>
                <p className="text-xs text-gray-500">connected</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Evidence"
          value={totalEvidence}
          icon={Shield}
        />
        <StatCard
          title="Pending Analysis"
          value={pendingAnalysis}
          icon={Clock}
        />
        <StatCard
          title="Completed Analysis"
          value={completedAnalysis}
          icon={CheckCircle}
        />
        <StatCard
          title="Active Cases"
          value={Math.floor(totalEvidence / 3)}
          icon={FileText}
        />
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-medium text-gray-700">Recent Activity</h3>
        </div>
        <div className="card-body">
          {isInitialLoading || activityLoading ? (
            <SkeletonText lines={5} />
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <Upload className="h-6 w-6 text-gray-700" />
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Upload Evidence</h3>
                <p className="text-xs text-gray-500">Add new evidence to the system</p>
              </div>
            </div>
            <div className="mt-4">
              <button className="btn-outline w-full" onClick={() => navigate('/upload')}>
                Upload Now
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <BarChart3 className="h-6 w-6 text-gray-700" />
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">View Analysis</h3>
                <p className="text-xs text-gray-500">Check AI analysis results</p>
              </div>
            </div>
            <div className="mt-4">
              <button className="btn-outline w-full" onClick={() => navigate('/analysis')}>
                View Results
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <FileText className="h-6 w-6 text-gray-700" />
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">Evidence List</h3>
                <p className="text-xs text-gray-500">Browse all evidence items</p>
              </div>
            </div>
            <div className="mt-4">
              <button className="btn-outline w-full" onClick={() => navigate('/evidence')}>
                Browse Evidence
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


