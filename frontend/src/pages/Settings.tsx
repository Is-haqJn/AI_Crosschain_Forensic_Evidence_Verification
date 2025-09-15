import React, { useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { User } from '../types';
import { toast } from 'react-toastify';

export const Settings: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const u = authService.getCurrentUser();
    setUser(u);
  }, []);

  const refreshProfile = async () => {
    try {
      setLoading(true);
      const token = authService.getToken();
      if (!token) throw new Error('Not authenticated');
      const u = await authService.verifyToken(token);
      setUser(u);
      toast.success('Profile refreshed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to refresh profile');
    } finally {
      setLoading(false);
    }
  };

  const doLogout = async () => {
    await authService.logout();
    setUser(null);
    toast.info('Logged out');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account and system preferences
        </p>
      </div>
      
      <div className="card">
        <div className="card-body space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Account</h3>
            {user ? (
              <div className="mt-2 text-sm text-gray-700">
                <div><span className="text-gray-500">Name:</span> {user.name}</div>
                <div><span className="text-gray-500">Email:</span> {user.email}</div>
                <div><span className="text-gray-500">Role:</span> {user.role}</div>
                <div><span className="text-gray-500">Organization:</span> {user.organization}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">Not authenticated</div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={refreshProfile}
              disabled={loading}
              className="btn-outline"
            >
              Refresh Profile
            </button>
            <button
              onClick={doLogout}
              className="px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
