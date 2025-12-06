import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext';
import { SessionTrackingProvider } from './contexts/SessionTrackingContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <SessionTrackingProvider>
          <App />
        </SessionTrackingProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
