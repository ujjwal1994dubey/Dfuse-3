import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T, useValue } from '@tldraw/tldraw';

// Backend API endpoint
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Custom TLDraw Shape for Transform Card
 * Allows users to transform charts using natural language on the canvas
 * 
 * Features:
 * - Input field for transformation prompt
 * - Contextual examples based on chart type
 * - Loading state during transformation
 * - Error handling
 * - Auto-deletes after successful transformation
 */
export class TransformCardShape extends BaseBoxShapeUtil {
  static type = 'transform-card';
  
  static props = {
    w: T.number,
    h: T.number,
    chartId: T.string,            // Parent chart ID
    chartTitle: T.string,          // Parent chart title
    dimensions: T.arrayOf(T.string), // Parent chart dimensions
    measures: T.arrayOf(T.string),   // Parent chart measures
    isDerived: T.boolean,          // Is parent a derived chart
    chartType: T.string,           // Parent chart type for contextual examples
    examples: T.arrayOf(T.string), // Contextual examples
    prompt: T.string,              // User's transformation prompt
    isLoading: T.boolean,          // Transformation in progress
    error: T.string,               // Error message if failed
    datasetId: T.string,           // Dataset ID for API call
    apiKey: T.string,              // Gemini API key
    model: T.string                // Gemini model
  };

  getDefaultProps() {
    return {
      w: 350,
      h: 340,
      chartId: '',
      chartTitle: '',
      dimensions: [],
      measures: [],
      isDerived: false,
      chartType: '',
      examples: [],
      prompt: '',
      isLoading: false,
      error: '',
      datasetId: '',
      apiKey: '',
      model: 'gemini-2.5-flash'
    };
  }

  getGeometry(shape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true
    });
  }

  canBind() {
    return false;
  }

  isAspectRatioLocked() {
    return false;
  }

  component(shape) {
    const editor = this.editor;
    
    const TransformCardContent = () => {
      const [localPrompt, setLocalPrompt] = useState(shape.props.prompt || '');
      const [isLoading, setIsLoading] = useState(shape.props.isLoading || false);
      const inputRef = useRef(null);
      
      const {
        w,
        h,
        chartId,
        chartTitle,
        dimensions,
        measures,
        isDerived,
        examples,
        error,
        datasetId,
        apiKey,
        model
      } = shape.props;

      // Transparent to pointer events when a drawing/annotation tool is active
      const isDrawingTool = useValue('isDrawingTool', () => {
        const toolId = editor.getCurrentTool().id;
        return toolId !== 'select' && toolId !== 'zoom';
      }, [editor]);
      
      // Focus input on mount
      useEffect(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, []);

      // Handle transformation
      const handleTransform = useCallback(async () => {
        if (!localPrompt.trim() || !chartId) return;
        
        // Get API key from localStorage if not in props
        const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
        const currentModel = model || localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
        
        if (!currentApiKey) {
          editor.updateShape({
            id: shape.id,
            type: 'transform-card',
            props: {
              ...shape.props,
              error: 'Please configure your Gemini API key in Settings first.',
              isLoading: false
            }
          });
          return;
        }
        
        setIsLoading(true);
        editor.updateShape({
          id: shape.id,
          type: 'transform-card',
          props: {
            ...shape.props,
            isLoading: true,
            error: '',
            prompt: localPrompt
          }
        });
        
        try {
          const response = await fetch(`${API}/chart-transform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chart_id: chartId,
              user_prompt: localPrompt,
              api_key: currentApiKey,
              model: currentModel
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
          }
          
          const result = await response.json();
          
          // Trigger custom event for App.jsx to handle chart creation
          const event = new CustomEvent('transform-complete', {
            detail: {
              result,
              cardId: shape.id
            }
          });
          window.dispatchEvent(event);
          
          // Delete this card after a brief success message
          setTimeout(() => {
            try {
              editor.deleteShape(shape.id);
            } catch (e) {
              console.log('Card already deleted');
            }
          }, 500);
          
        } catch (error) {
          console.error('Transformation failed:', error);
          setIsLoading(false);
          editor.updateShape({
            id: shape.id,
            type: 'transform-card',
            props: {
              ...shape.props,
              error: error.message || 'Transformation failed',
              isLoading: false
            }
          });
        }
      }, [localPrompt, chartId, datasetId, apiKey, model, editor, shape.id, shape.props]);

      // Handle Cancel
      const handleCancel = useCallback(() => {
        editor.deleteShape(shape.id);
      }, [editor, shape.id]);

      // Handle Enter key
      const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleTransform();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      }, [handleTransform, handleCancel]);

      // Handle example click
      const handleExampleClick = useCallback((example) => {
        setLocalPrompt(example);
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, []);

      return (
        <HTMLContainer
          id={shape.id}
          style={{
            width: w,
            height: h,
            pointerEvents: isDrawingTool ? 'none' : 'all',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'white',
              border: '2px solid #3b82f6',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              overflow: 'auto',
              pointerEvents: 'all'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🪄</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                Transform Chart Data
              </h3>
            </div>

            {/* Input Field */}
            <textarea
              ref={inputRef}
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Describe transformation (e.g., keep top 10, filter where value > 1000...)"
              disabled={isLoading}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                backgroundColor: isLoading ? '#f9fafb' : 'white',
                pointerEvents: 'all'
              }}
            />

            {/* Examples */}
            {examples.length > 0 && !isLoading && !error && (
              <div style={{ fontSize: '12px' }}>
                <div style={{ fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                  Examples:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {examples.map((example, idx) => (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExampleClick(example);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#4b5563',
                        transition: 'background-color 0.2s',
                        fontSize: '11px',
                        pointerEvents: 'all'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#e5e7eb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }}
                    >
                      • {example}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div style={{
                padding: '10px',
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '12px'
              }}>
                {error}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div style={{
                padding: '10px',
                backgroundColor: '#dbeafe',
                border: '1px solid #93c5fd',
                borderRadius: '6px',
                color: '#1e40af',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid #3b82f6',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}></div>
                Transforming chart...
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTransform();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isLoading || !localPrompt.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: isLoading || !localPrompt.trim() ? '#d1d5db' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: isLoading || !localPrompt.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  pointerEvents: 'all'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && localPrompt.trim()) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && localPrompt.trim()) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                {isLoading ? 'Transforming...' : 'Transform'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isLoading}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  pointerEvents: 'all'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Cancel
              </button>
            </div>

            {/* Hint */}
            <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
              Press Cmd/Ctrl+Enter to transform
            </div>
          </div>

          {/* CSS for spinner animation */}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </HTMLContainer>
      );
    };

    return <TransformCardContent />;
  }

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

