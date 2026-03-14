import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';

// Backend API endpoint
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Custom TLDraw Shape for Query Card
 * Allows users to ask AI questions about charts using natural language on the canvas
 * 
 * Features:
 * - Input field for question
 * - Contextual examples based on chart type
 * - Loading state during AI query
 * - Error handling
 * - Creates yellow sticky note with result
 * - Auto-deletes after successful query
 */
export class QueryCardShape extends BaseBoxShapeUtil {
  static type = 'query-card';
  
  static props = {
    w: T.number,
    h: T.number,
    chartId: T.string,            // Chart being queried
    chartTitle: T.string,          // Chart title
    dimensions: T.arrayOf(T.string), // Chart dimensions
    measures: T.arrayOf(T.string),   // Chart measures
    chartType: T.string,           // Chart type for contextual examples
    examples: T.arrayOf(T.string), // Contextual question examples
    query: T.string,               // User's question
    isLoading: T.boolean,          // Query in progress
    error: T.string,               // Error message if failed
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
      chartType: '',
      examples: [],
      query: '',
      isLoading: false,
      error: '',
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
    
    const QueryCardContent = () => {
      const [localQuery, setLocalQuery] = useState(shape.props.query || '');
      const [isLoading, setIsLoading] = useState(shape.props.isLoading || false);
      const inputRef = useRef(null);
      
      const {
        w,
        h,
        chartId,
        chartTitle,
        examples,
        error,
        apiKey,
        model
      } = shape.props;
      
      // Focus input on mount
      useEffect(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, []);
      
      const handleQuery = useCallback(async () => {
        if (!localQuery.trim() || isLoading) return;

        const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
        const currentModel = model || localStorage.getItem('gemini_model') || 'gemini-2.5-flash';

        if (!currentApiKey) {
          editor.updateShape({
            id: shape.id,
            type: 'query-card',
            props: { ...shape.props, error: 'API key required', isLoading: false },
          });
          return;
        }

        editor.updateShape({
          id: shape.id,
          type: 'query-card',
          props: { ...shape.props, isLoading: true, error: '' },
        });

        setIsLoading(true);

        try {
          console.log('🔍 Sending AI query:', localQuery);
          
          const response = await fetch(`${API}/ai-explore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chart_id: chartId,
              user_query: localQuery,
              api_key: currentApiKey,
              model: currentModel,
            }),
          });

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.answer || 'Query failed');
          }

          console.log('✅ AI query successful');

          // Dispatch custom event for App.jsx to handle sticky note creation
          window.dispatchEvent(new CustomEvent('query-complete', {
            detail: { result, cardId: shape.id, chartId }
          }));

          // Card will be deleted by the event handler after sticky note is created

        } catch (err) {
          console.error('❌ Query error:', err);
          editor.updateShape({
            id: shape.id,
            type: 'query-card',
            props: { ...shape.props, error: err.message, isLoading: false },
          });
          setIsLoading(false);
        }
      }, [localQuery, isLoading, chartId, apiKey, model, editor, shape]);

      const handleCancel = useCallback(() => {
        editor.deleteShape(shape.id);
      }, [editor, shape.id]);

      const handleExampleClick = useCallback((example) => {
        setLocalQuery(example);
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, []);

      // Keyboard shortcuts
      const handleKeyDown = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          handleQuery();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      }, [handleQuery, handleCancel]);

      return (
        <HTMLContainer
          id={shape.id}
          style={{
            width: w,
            height: h,
            pointerEvents: 'all',
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
              <span style={{ fontSize: '20px' }}>💬</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                AI Chart Query
              </h3>
            </div>

            {/* Input Field */}
            <textarea
              ref={inputRef}
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Ask a question about this chart..."
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
            {examples.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>
                  Examples:
                </p>
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

            {/* Error */}
            {error && (
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                {error}
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuery();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isLoading || !localQuery.trim()}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: isLoading || !localQuery.trim() ? '#d1d5db' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: isLoading || !localQuery.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  pointerEvents: 'all'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && localQuery.trim()) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && localQuery.trim()) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                {isLoading ? 'Asking...' : 'Ask'}
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
          </div>
        </HTMLContainer>
      );
    };
    
    return <QueryCardContent />;
  }

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }

  canEdit() {
    return false;
  }

  canResize() {
    return true;
  }

  canRotate() {
    return false;
  }

  onResize(shape, info) {
    return {
      props: {
        ...shape.props,
        w: Math.max(info.initialBounds.width * info.scaleX, 250),
        h: Math.max(info.initialBounds.height * info.scaleY, 200)
      }
    };
  }
}

