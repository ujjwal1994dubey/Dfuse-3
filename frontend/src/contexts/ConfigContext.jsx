import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ConfigContext = createContext(null);

const CALL_LOG_MAX = 20;

export function ConfigProvider({ children }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('gemini_model') || 'gemini-2.5-flash');
  const [configStatus, setConfigStatus] = useState('idle');
  const [configMessage, setConfigMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConfigLocked, setIsConfigLocked] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    apiCalls: 0,
    cachedTokens: 0,
    thoughtsTokens: 0,
  });
  const [callLog, setCallLog] = useState([]);

  useEffect(() => {
    const storedApiKey = localStorage.getItem('gemini_api_key');
    if (storedApiKey && storedApiKey.trim()) {
      setIsConfigLocked(true);
      setConfigStatus('success');
      setConfigMessage('Configuration loaded from previous session.');
    }
  }, []);

  const updateTokenUsage = useCallback((newUsage) => {
    if (!newUsage) return;
    const inputCostPer1K = 0.00075;
    const outputCostPer1K = 0.003;
    const inputCost = ((newUsage.inputTokens || 0) / 1000) * inputCostPer1K;
    const outputCost = ((newUsage.outputTokens || 0) / 1000) * outputCostPer1K;
    const totalNewTokens = (newUsage.inputTokens || 0) + (newUsage.outputTokens || 0);
    setTokenUsage(prev => ({
      inputTokens: prev.inputTokens + (newUsage.inputTokens || 0),
      outputTokens: prev.outputTokens + (newUsage.outputTokens || 0),
      totalTokens: prev.totalTokens + totalNewTokens,
      estimatedCost: prev.estimatedCost + inputCost + outputCost,
      apiCalls: prev.apiCalls + (newUsage.apiCalls || 1),
      cachedTokens: prev.cachedTokens + (newUsage.cachedTokens || 0),
      thoughtsTokens: prev.thoughtsTokens + (newUsage.thoughtsTokens || 0),
    }));
    setCallLog(prev => {
      const entry = {
        operation: newUsage.operation || 'API Call',
        inputTokens: newUsage.inputTokens || 0,
        outputTokens: newUsage.outputTokens || 0,
        cachedTokens: newUsage.cachedTokens || 0,
        thoughtsTokens: newUsage.thoughtsTokens || 0,
        timestamp: Date.now(),
      };
      const updated = [entry, ...prev];
      return updated.slice(0, CALL_LOG_MAX);
    });
  }, []);

  const clearUsage = useCallback(() => {
    setTokenUsage({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      apiCalls: 0,
      cachedTokens: 0,
      thoughtsTokens: 0,
    });
    setCallLog([]);
  }, []);

  const handleTestConfiguration = useCallback(async () => {
    if (!apiKey.trim()) {
      setConfigStatus('error');
      setConfigMessage('Please enter an API key');
      return;
    }
    setConfigStatus('testing');
    setConfigMessage('Testing configuration...');
    try {
      const response = await fetch(`${API}/test-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, model: selectedModel }),
      });
      const result = await response.json();
      if (result.success) {
        setConfigStatus('success');
        setConfigMessage('Configuration successful! LLM is ready to use.');
        localStorage.setItem('gemini_api_key', apiKey);
        localStorage.setItem('gemini_model', selectedModel);
        setIsConfigLocked(true);
        if (result.token_usage) updateTokenUsage(result.token_usage);
      } else {
        setConfigStatus('error');
        setConfigMessage(`❌ ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setConfigStatus('error');
      setConfigMessage(`❌ ${error.message}`);
    }
  }, [apiKey, selectedModel, updateTokenUsage]);

  const handleEditConfiguration = useCallback(() => {
    setIsConfigLocked(false);
    setConfigStatus('idle');
    setConfigMessage('');
  }, []);

  const handleApiKeyChange = useCallback((e) => {
    setApiKey(e.target.value);
  }, []);

  return (
    <ConfigContext.Provider value={{
      apiKey,
      setApiKey,
      selectedModel,
      setSelectedModel,
      configStatus,
      configMessage,
      showApiKey,
      setShowApiKey,
      isConfigLocked,
      tokenUsage,
      updateTokenUsage,
      callLog,
      clearUsage,
      handleTestConfiguration,
      handleEditConfiguration,
      handleApiKeyChange,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within a ConfigProvider');
  return ctx;
}
