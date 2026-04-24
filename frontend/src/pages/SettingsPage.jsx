import React, { useState } from 'react';
import { Eye, EyeOff, Check, Edit, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useConfig } from '../contexts/ConfigContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui';

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function SettingsPage() {
  const {
    apiKey,
    selectedModel,
    setSelectedModel,
    configStatus,
    configMessage,
    showApiKey,
    setShowApiKey,
    isConfigLocked,
    tokenUsage,
    callLog,
    clearUsage,
    handleTestConfiguration,
    handleEditConfiguration,
    handleApiKeyChange,
  } = useConfig();

  const [showCallLog, setShowCallLog] = useState(false);

  const hasUsage = tokenUsage.apiCalls > 0;
  const cachedCostSaved = ((tokenUsage.cachedTokens || 0) / 1000) * 0.00075;

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-8">
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Settings</h1>
        <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>
          Configure your AI model and API credentials
        </p>
      </div>

      <div
        className="rounded-xl p-6 space-y-6"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
            LLM Configuration
          </h2>

          {/* API Key */}
          <div className="mb-5">
            <label
              className="block font-medium mb-2"
              style={{ fontSize: '13px', color: '#374151' }}
            >
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder="Enter your Gemini API key"
                value={apiKey}
                onChange={handleApiKeyChange}
                disabled={isConfigLocked}
                className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none transition-colors ${
                  isConfigLocked ? 'opacity-60 bg-gray-50' : 'bg-white'
                }`}
                style={{ borderColor: '#E5E7EB', color: '#111827' }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Get your free API key from{' '}
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Model Selection */}
          <div className="mb-5">
            <label
              className="block font-medium mb-2"
              style={{ fontSize: '13px', color: '#374151' }}
            >
              Model Selection
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isConfigLocked}>
              <SelectTrigger className={`w-full ${isConfigLocked ? 'opacity-60' : ''}`}>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start" sideOffset={5}>
                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                <SelectItem value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite — 500 RPD ✦</SelectItem>
                <SelectItem value="gemma-4-31b-it">Gemma 4 31B — 1,500 RPD ✦</SelectItem>
                <SelectItem value="gemma-4-26b-a4b-it">Gemma 4 26B — 1,500 RPD ✦</SelectItem>
                <SelectItem value="gemma-3-27b-it">Gemma 3 27B — 14,400 RPD ✦</SelectItem>
                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Test / Edit Button */}
          <button
            onClick={isConfigLocked ? handleEditConfiguration : handleTestConfiguration}
            disabled={configStatus === 'testing'}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            style={{
              backgroundColor: isConfigLocked ? '#F3F4F6' : '#2563EB',
              color: isConfigLocked ? '#374151' : '#FFFFFF',
              border: isConfigLocked ? '1px solid #E5E7EB' : 'none',
              opacity: configStatus === 'testing' ? 0.7 : 1,
              cursor: configStatus === 'testing' ? 'not-allowed' : 'pointer',
            }}
          >
            {configStatus === 'testing' ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Testing...
              </>
            ) : isConfigLocked ? (
              <>
                <Edit size={16} />
                Edit Configuration
              </>
            ) : (
              <>
                <Check size={16} />
                Test Configuration
              </>
            )}
          </button>

          {/* Status Message */}
          {configMessage && (
            <div
              className="mt-4 p-4 rounded-lg text-sm border"
              style={{
                backgroundColor:
                  configStatus === 'success'
                    ? '#F0FDF4'
                    : configStatus === 'error'
                    ? '#FEF2F2'
                    : '#EFF6FF',
                color:
                  configStatus === 'success'
                    ? '#16A34A'
                    : configStatus === 'error'
                    ? '#DC2626'
                    : '#2563EB',
                borderColor:
                  configStatus === 'success'
                    ? '#86EFAC'
                    : configStatus === 'error'
                    ? '#FECACA'
                    : '#BFDBFE',
              }}
            >
              {configMessage}
            </div>
          )}
        </div>

        {/* API Usage Dashboard */}
        {hasUsage && (
          <div className="pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                API Usage (This Session)
              </h3>
              <button
                onClick={clearUsage}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="Clear session stats"
              >
                <Trash2 size={12} />
                Clear
              </button>
            </div>

            {/* API Call Count — prominent */}
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 mb-3"
              style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1D4ED8' }}>
                API Calls
              </span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1D4ED8' }}>
                {tokenUsage.apiCalls.toLocaleString()}
              </span>
            </div>

            {/* Token breakdown */}
            <div className="space-y-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>Input Tokens</span>
                <span>{tokenUsage.inputTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Output Tokens</span>
                <span>{tokenUsage.outputTokens.toLocaleString()}</span>
              </div>

              {/* Cached tokens — only show if any */}
              {tokenUsage.cachedTokens > 0 && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    Cached Tokens
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: '#F0FDF4', color: '#16A34A', fontSize: '10px' }}
                    >
                      saved ${cachedCostSaved.toFixed(4)}
                    </span>
                  </span>
                  <span style={{ color: '#16A34A' }}>{tokenUsage.cachedTokens.toLocaleString()}</span>
                </div>
              )}

              {/* Thinking tokens — only show if any */}
              {tokenUsage.thoughtsTokens > 0 && (
                <div className="flex justify-between">
                  <span>Thinking Tokens</span>
                  <span style={{ color: '#7C3AED' }}>{tokenUsage.thoughtsTokens.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between font-medium text-gray-700 pt-2 border-t border-gray-100">
                <span>Total Tokens</span>
                <span>{tokenUsage.totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-green-600">
                <span>Est. Cost</span>
                <span>${tokenUsage.estimatedCost.toFixed(4)}</span>
              </div>
            </div>

            {/* Call Log toggle */}
            {callLog.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowCallLog(v => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCallLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showCallLog ? 'Hide' : 'Show'} call log ({callLog.length})
                </button>

                {showCallLog && (
                  <div
                    className="mt-2 rounded-lg overflow-hidden"
                    style={{ border: '1px solid #E5E7EB' }}
                  >
                    {callLog.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                        style={{
                          backgroundColor: i % 2 === 0 ? '#FAFAFA' : '#FFFFFF',
                          borderBottom: i < callLog.length - 1 ? '1px solid #F3F4F6' : 'none',
                        }}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                          <span className="font-medium text-gray-700 truncate">{entry.operation}</span>
                          <span className="text-gray-400">
                            {(entry.inputTokens + entry.outputTokens).toLocaleString()} tokens
                            {entry.cachedTokens > 0 && (
                              <span style={{ color: '#16A34A' }}> · {entry.cachedTokens.toLocaleString()} cached</span>
                            )}
                            {entry.thoughtsTokens > 0 && (
                              <span style={{ color: '#7C3AED' }}> · {entry.thoughtsTokens.toLocaleString()} thinking</span>
                            )}
                          </span>
                        </div>
                        <span className="text-gray-400 flex-shrink-0">{formatRelativeTime(entry.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
