import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import { router } from './router';
import { AuthProvider } from './contexts/AuthContext';
import { SessionTrackingProvider } from './contexts/SessionTrackingContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { DatasetProvider } from './contexts/DatasetContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <SessionTrackingProvider>
          <ConfigProvider>
            <DatasetProvider>
              <RouterProvider router={router} />
            </DatasetProvider>
          </ConfigProvider>
        </SessionTrackingProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
