import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const SessionTrackingContext = createContext(null);

export const useSessionTracking = () => {
  const context = useContext(SessionTrackingContext);
  if (!context) {
    throw new Error('useSessionTracking must be used within SessionTrackingProvider');
  }
  return context;
};

export const SessionTrackingProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [sessionId, setSessionId] = useState(null);
  const [metrics, setMetrics] = useState({
    charts_created_manually: 0,
    charts_created_using_ai: 0,
    tables_created: 0,
    ai_insights_generated: 0,
    charts_merged: 0,
    ai_feature_used: 0,
    total_tokens: 0,
    canvas_objects: 0,
  });
  
  const saveIntervalRef = useRef(null);
  const sessionStartedRef = useRef(false);
  
  // Use refs to always have access to latest values in callbacks
  const metricsRef = useRef(metrics);
  const sessionIdRef = useRef(sessionId);
  
  // Keep refs in sync with state
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);
  
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Start a new session when user logs in
  useEffect(() => {
    if (isAuthenticated && user?.loginId && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      startSession();
    }
    
    // Cleanup on unmount
    return () => {
      if (sessionId) {
        endSession();
      }
    };
  }, [isAuthenticated, user?.loginId]);

  // Auto-save metrics every 15 seconds (uses refs to get latest values)
  useEffect(() => {
    if (sessionId) {
      saveIntervalRef.current = setInterval(() => {
        // Use refs to get latest values
        if (sessionIdRef.current) {
          const currentMetrics = metricsRef.current;
          console.log('📊 Auto-saving session metrics:', currentMetrics);
          
          fetch(`${API}/session/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionIdRef.current,
              ...currentMetrics,
            }),
          }).catch(err => console.warn('⚠️ Failed to auto-save metrics:', err));
        }
      }, 15000); // Save every 15 seconds
    }
    
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [sessionId]);

  // Save on page unload (uses refs to get latest values)
  useEffect(() => {
    const handleUnload = () => {
      // Use refs to get latest values
      if (sessionIdRef.current) {
        const data = JSON.stringify({
          session_id: sessionIdRef.current,
          ...metricsRef.current,
          is_active: false,
          session_end: new Date().toISOString()
        });
        navigator.sendBeacon(`${API}/session/update`, data);
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const startSession = async () => {
    if (!user?.loginId) {
      console.warn('⚠️ No loginId available for session tracking');
      return;
    }
    
    try {
      const response = await fetch(`${API}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: user.loginId,
        }),
      });
      const result = await response.json();
      if (result.success && result.session_id) {
        setSessionId(result.session_id);
        console.log('📊 Session started:', result.session_id);
      }
    } catch (error) {
      console.warn('⚠️ Failed to start session tracking:', error);
    }
  };

  const endSession = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    
    try {
      const finalMetrics = metricsRef.current;
      console.log('📊 Ending session with final metrics:', finalMetrics);
      
      await fetch(`${API}/session/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          ...finalMetrics,
        }),
      });
      console.log('📊 Session ended:', currentSessionId);
      setSessionId(null);
      sessionStartedRef.current = false;
      setMetrics({
        charts_created_manually: 0,
        charts_created_using_ai: 0,
        tables_created: 0,
        ai_insights_generated: 0,
        charts_merged: 0,
        ai_feature_used: 0,
        total_tokens: 0,
        canvas_objects: 0,
      });
    } catch (error) {
      console.warn('⚠️ Failed to end session:', error);
    }
  };

  // Manual save function (uses refs for latest values)
  const saveMetrics = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    
    try {
      const currentMetrics = metricsRef.current;
      console.log('📊 Saving session metrics:', currentMetrics);
      
      await fetch(`${API}/session/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          ...currentMetrics,
        }),
      });
    } catch (error) {
      console.warn('⚠️ Failed to save session metrics:', error);
    }
  };

  // Tracking functions - these update local state immediately
  const trackChartCreatedManually = useCallback(() => {
    console.log('📈 Tracking: Chart created manually');
    setMetrics(prev => {
      const newMetrics = { ...prev, charts_created_manually: prev.charts_created_manually + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackChartCreatedByAI = useCallback(() => {
    console.log('📈 Tracking: Chart created using AI');
    setMetrics(prev => {
      const newMetrics = { ...prev, charts_created_using_ai: prev.charts_created_using_ai + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackTableCreated = useCallback(() => {
    console.log('📈 Tracking: Table created');
    setMetrics(prev => {
      const newMetrics = { ...prev, tables_created: prev.tables_created + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackAIInsight = useCallback(() => {
    console.log('📈 Tracking: AI insight generated');
    setMetrics(prev => {
      const newMetrics = { ...prev, ai_insights_generated: prev.ai_insights_generated + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackChartsMerged = useCallback(() => {
    console.log('📈 Tracking: Charts merged');
    setMetrics(prev => {
      const newMetrics = { ...prev, charts_merged: prev.charts_merged + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackAIUsed = useCallback(() => {
    console.log('📈 Tracking: AI feature used');
    setMetrics(prev => {
      const newMetrics = { ...prev, ai_feature_used: prev.ai_feature_used + 1 };
      console.log('📈 Updated metrics:', newMetrics);
      return newMetrics;
    });
  }, []);

  const trackTokens = useCallback((tokens) => {
    if (tokens && tokens > 0) {
      console.log('📈 Tracking: Tokens used:', tokens);
      setMetrics(prev => {
        const newMetrics = { ...prev, total_tokens: prev.total_tokens + tokens };
        console.log('📈 Updated metrics:', newMetrics);
        return newMetrics;
      });
    }
  }, []);

  const trackCanvasObjects = useCallback((count) => {
    console.log('📈 Tracking: Canvas objects count:', count);
    setMetrics(prev => {
      const newMetrics = { ...prev, canvas_objects: count };
      return newMetrics;
    });
  }, []);

  const value = {
    sessionId,
    metrics,
    trackChartCreatedManually,
    trackChartCreatedByAI,
    trackTableCreated,
    trackAIInsight,
    trackChartsMerged,
    trackAIUsed,
    trackTokens,
    trackCanvasObjects,
    saveMetrics,  // Manual save trigger
    endSession,
  };

  return (
    <SessionTrackingContext.Provider value={value}>
      {children}
    </SessionTrackingContext.Provider>
  );
};

export default SessionTrackingContext;

