import React from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import AppShell from './AppShell';
import CanvasesPage from './pages/CanvasesPage';
import DataLibraryPage from './pages/DataLibraryPage';
import SchemaPage from './pages/SchemaPage';
import SettingsPage from './pages/SettingsPage';
import LearnDfusePage from './pages/LearnDfusePage';
import CanvasPage from './pages/CanvasPage';
import SchemaVisualizationPage from './pages/SchemaVisualizationPage';

function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/canvases" replace /> },
      {
        element: <AppShell />,
        children: [
          { path: '/canvases', element: <CanvasesPage /> },
          { path: '/library', element: <DataLibraryPage /> },
          { path: '/library/schemas/new', element: <SchemaPage /> },
          { path: '/library/schemas/:schemaId', element: <SchemaVisualizationPage /> },
          { path: '/learn', element: <LearnDfusePage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '/canvas/:id', element: <CanvasPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
