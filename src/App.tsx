import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { WorkspaceRoute } from './components/WorkspaceRoute';
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
import { WorkspaceSelector } from './pages/WorkspaceSelector';
import { SalesWorkspacePage } from './pages/SalesWorkspacePage';
import { authenticatedLandingPath, workspaceRoutePaths } from './lib/appRoutes';
import type { WorkspaceArea } from './lib/workspaceRoutes';

function GuardedWorkspacePage({
  area,
  children,
}: {
  area: WorkspaceArea;
  children: ReactNode;
}) {
  return (
    <ProtectedRoute>
      <WorkspaceRoute area={area}>
        <Layout area={area}>{children}</Layout>
      </WorkspaceRoute>
    </ProtectedRoute>
  );
}

function SelectorRedirect() {
  return <Navigate to={authenticatedLandingPath()} replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/ms-auth-callback" element={<MsAuthCallback />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path={workspaceRoutePaths.selector}
          element={<ProtectedRoute><WorkspaceSelector /></ProtectedRoute>}
        />

        <Route path={workspaceRoutePaths.legacyHome} element={<GuardedWorkspacePage area="legacy"><Dashboard /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacyCompany} element={<GuardedWorkspacePage area="legacy"><CompanyDetail /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacyTemplates} element={<GuardedWorkspacePage area="legacy"><Templates /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacyTrash} element={<GuardedWorkspacePage area="legacy"><Trash /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacySettings} element={<GuardedWorkspacePage area="legacy"><Settings /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacyUploads} element={<GuardedWorkspacePage area="legacy"><UploadedFiles /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.legacyUploadDetail} element={<GuardedWorkspacePage area="legacy"><UploadedFileDetail /></GuardedWorkspacePage>} />

        <Route path={workspaceRoutePaths.salesHome} element={<GuardedWorkspacePage area="sales"><SalesWorkspacePage /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.salesModule} element={<GuardedWorkspacePage area="sales"><SalesWorkspacePage /></GuardedWorkspacePage>} />
        <Route path={workspaceRoutePaths.salesRecord} element={<GuardedWorkspacePage area="sales"><SalesWorkspacePage /></GuardedWorkspacePage>} />

        <Route path="/" element={<SelectorRedirect />} />
        <Route path="/company/:id" element={<SelectorRedirect />} />
        <Route path="/templates" element={<SelectorRedirect />} />
        <Route path="/trash" element={<SelectorRedirect />} />
        <Route path="/settings" element={<SelectorRedirect />} />
        <Route path="/uploaded-files" element={<SelectorRedirect />} />
        <Route path="/uploaded-files/:id" element={<SelectorRedirect />} />
        <Route path="*" element={<SelectorRedirect />} />
      </Routes>
      <Analytics />
    </>
  );
}
