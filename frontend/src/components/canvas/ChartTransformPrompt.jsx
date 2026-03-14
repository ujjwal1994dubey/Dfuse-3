import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Loader2, Wand2 } from 'lucide-react';

// Backend API endpoint
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * ChartTransformPrompt Component
 * 
 * Floating prompt UI for chart transformations using natural language.
 * Similar to KPI card prompt but focused on chart data transformations.
 * 
 * Features:
 * - Natural language input for transformations
 * - Loading state during API call
 * - Error handling
 * - Close on Escape or outside click
 * 
 * @param {string} chartId - ID of the chart to transform
 * @param {Object} chartData - Chart table, dimensions, measures, sortOrder
 * @param {string} datasetId - Dataset ID for transformation
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Gemini model name
 * @param {Function} onClose - Callback when prompt is closed
 * @param {Function} onTransformComplete - Callback when transformation succeeds
 */
const ChartTransformPrompt = ({
  chartId,
  chartData,
  datasetId,
  apiKey,
  model = 'gemini-2.5-flash',
  onClose,
  onTransformComplete
}) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  /**
   * Handle transformation submission
   */
  const handleTransform = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please describe a transformation');
      return;
    }

    if (!apiKey) {
      setError('API key is required. Please configure it in Settings.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('🔄 Requesting chart transformation:', {
        chartId,
        prompt,
        datasetId
      });

      const response = await fetch(`${API}/chart-transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: chartId,
          user_prompt: prompt,
          api_key: apiKey,
          model: model
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Transformation failed');
      }

      const result = await response.json();
      console.log('✅ Transformation successful:', result);

      // Pass result to parent component
      if (onTransformComplete) {
        onTransformComplete(result);
      }

      // Close prompt
      onClose();
    } catch (err) {
      console.error('❌ Transformation error:', err);
      setError(err.message || 'Transformation failed');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, apiKey, model, chartId, datasetId, onClose, onTransformComplete]);

  /**
   * Handle Enter key to submit
   */
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleTransform();
    }
  }, [handleTransform, isLoading]);

  /**
   * Example transformations for quick selection
   */
  const exampleTransformations = [
    'Keep only top 10 rows',
    'Convert to percentage of total',
    'Filter where value > 1000',
    'Sort by value descending'
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
    >
      <div
        ref={containerRef}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wand2 size={20} style={{ color: '#6366f1' }} />
            <h3 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              Transform Chart
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isLoading ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} style={{ color: '#6b7280' }} />
          </button>
        </div>

        {/* Chart Context Info */}
        <div style={{
          padding: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#6b7280'
        }}>
          <div><strong>Chart:</strong> {chartData?.title || 'Untitled'}</div>
          <div><strong>Dimensions:</strong> {chartData?.dimensions?.join(', ') || 'None'}</div>
          <div><strong>Measures:</strong> {chartData?.measures?.join(', ') || 'None'}</div>
        </div>

        {/* Input Area */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Describe transformation
          </label>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., filter where revenue > 100000, show only top 5, convert to percentage..."
            disabled={isLoading}
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              resize: 'vertical',
              outline: 'none',
              backgroundColor: isLoading ? '#f9fafb' : 'white'
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
          />
        </div>

        {/* Example Prompts */}
        <div>
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            marginBottom: '8px'
          }}>
            Examples:
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px'
          }}>
            {exampleTransformations.map((example, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(example)}
                disabled={isLoading}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: '#4b5563',
                  opacity: isLoading ? 0.5 : 1
                }}
                onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
          paddingTop: '8px'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: '#374151',
              opacity: isLoading ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            Cancel
          </button>
          <button
            onClick={handleTransform}
            disabled={isLoading || !prompt.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isLoading || !prompt.trim() ? '#9ca3af' : '#6366f1',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => !isLoading && prompt.trim() && (e.currentTarget.style.backgroundColor = '#4f46e5')}
            onMouseLeave={(e) => !isLoading && prompt.trim() && (e.currentTarget.style.backgroundColor = '#6366f1')}
          >
            {isLoading && <Loader2 size={16} className="loading-spin" />}
            {isLoading ? 'Transforming...' : 'Transform'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChartTransformPrompt;

