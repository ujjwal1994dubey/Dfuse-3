import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../contexts/AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const LoginPage = () => {
  const { login } = useAuth();

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      // Decode the JWT token to get user info
      const decoded = jwtDecode(credentialResponse.credential);
      
      const userData = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        token: credentialResponse.credential,
      };
      
      // Record login to backend for tracking (don't block login if this fails)
      try {
        const response = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: userData.id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
          }),
        });
        const result = await response.json();
        if (result.success && result.login_id) {
          // Include login_id for session tracking
          userData.loginId = result.login_id;
          console.log('📊 Login tracked successfully, ID:', result.login_id);
        }
      } catch (trackingError) {
        console.warn('⚠️ Failed to record login to backend:', trackingError);
        // Don't block login if tracking fails
      }
      
      login(userData);
      console.log('✅ Login successful:', userData.email);
    } catch (error) {
      console.error('Failed to decode token:', error);
    }
  };

  const handleGoogleError = () => {
    console.error('❌ Google Sign-In failed');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="bg-white rounded-[32px] p-10 shadow-sm border border-[#E5E7EB] max-w-md w-full mx-4">
        {/* Logo/Brand */}
        <div className="text-center mb-6">
          <img 
            src="/logo.svg" 
            alt="Dfuse Logo" 
            className="w-16 h-16 mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold text-[#111827] mb-2">
            Welcome to Dfuse
          </h1>
          <p className="text-[#6B7280] text-sm">
            Start your data analysis and visualization journey on infinite canvas and AI
          </p>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5E7EB]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 text-[#9CA3AF] bg-white">
              Continue With
            </span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            theme="outline"
            size="large"
            shape="pill"
            text="signin_with"
            logo_alignment="left"
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

