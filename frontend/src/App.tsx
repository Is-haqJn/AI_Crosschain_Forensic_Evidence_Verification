import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { EvidenceUpload } from './pages/EvidenceUpload';
import { EvidenceList } from './pages/EvidenceList';
import { EvidenceDetail } from './pages/EvidenceDetail';
import { CasesList } from './pages/CasesList';
import { CaseDetail } from './pages/CaseDetail';
import { AnalysisResults } from './pages/AnalysisResults';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { NotFound } from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="upload" element={<EvidenceUpload />} />
            <Route path="evidence" element={<EvidenceList />} />
            <Route path="evidence/:id" element={<EvidenceDetail />} />
            <Route path="cases" element={<CasesList />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="analysis" element={<AnalysisResults />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admin/users" element={<Users />} />
          </Route>
          
          {/* 404 route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
