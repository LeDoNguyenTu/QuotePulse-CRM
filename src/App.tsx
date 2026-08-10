import { Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { CompanyDetail } from './pages/CompanyDetail';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { Trash } from './pages/Trash';
import { MsAuthCallback } from './pages/MsAuthCallback';
import { AuthCallback } from './pages/AuthCallback';
import { UploadedFiles } from './pages/UploadedFiles';
import { UploadedFileDetail } from './pages/UploadedFileDetail';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/ms-auth-callback" element={<MsAuthCallback />} />
        {/* Landing page for Supabase auth emails (signup confirmation, etc). */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/company/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <CompanyDetail />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <Layout>
                <Templates />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trash"
          element={
            <ProtectedRoute>
              <Layout>
                <Trash />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/uploaded-files" element={<ProtectedRoute><Layout><UploadedFiles /></Layout></ProtectedRoute>} />
        <Route path="/uploaded-files/:id" element={<ProtectedRoute><Layout><UploadedFileDetail /></Layout></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
    </>
  );
}
