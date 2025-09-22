import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

type UserRow = {
  userId: string;
  email: string;
  name: string;
  organization: string;
  role: string;
  createdAt: string;
};

export const Users: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ email: '', password: '', name: '', organization: '', role: 'investigator' });

  const baseURL = process.env.REACT_APP_EVIDENCE_SERVICE_URL || 'http://localhost:3001/api/v1';

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${baseURL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setUsers(res.data?.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchUsers(); 
  }, [token]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.post(`${baseURL}/auth/register`, form, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      toast.success('User created');
      setForm({ email: '', password: '', name: '', organization: '', role: 'investigator' });
      await fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">Create and manage users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Users</h3></div>
          <div className="card-body">
            {loading ? (
              <div className="text-gray-500">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-4 py-2"/>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(u => (
                      <tr key={u.userId}>
                        <td className="px-4 py-2 text-sm text-gray-900">{u.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{u.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{u.organization}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">{u.role}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="text-sm font-medium text-gray-700">Create User</h3></div>
          <div className="card-body">
            <form className="space-y-4" onSubmit={onCreate}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Organization</label>
                <input className="input" value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="investigator">investigator</option>
                  <option value="validator">validator</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                <input type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">Create</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

