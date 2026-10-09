import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { HubspotImportProvider, HubspotImportToast } from './hooks/useHubspotImport';
import { WorkspaceProvider } from './hooks/useWorkspaces';
import './styles/index.css';
import { initializeTheme } from './lib/theme';

initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const router = createBrowserRouter([{
  path: '*',
  element: (
    <AuthProvider>
      <WorkspaceProvider>
        <HubspotImportProvider>
          <App />
          <HubspotImportToast />
        </HubspotImportProvider>
      </WorkspaceProvider>
    </AuthProvider>
  ),
}]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
