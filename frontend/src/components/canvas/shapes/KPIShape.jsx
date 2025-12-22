import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';

// Backend API endpoint
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Custom TLDraw Shape for KPI Cards
 * Allows users to calculate KPIs using natural language and display them prominently
 * 
 * Two modes:
 * - Create Mode: Input field for natural language query
 * - View Mode: Display calculated KPI value with title
 */
export class KPIShape extends BaseBoxShapeUtil {
  static type = 'kpi';
  
  static props = {
    w: T.number,
    h: T.number,
    query: T.string,           // user's natural language query
    title: T.string,           // display title
    value: T.any,              // raw calculated value
    formattedValue: T.string,  // formatted for display
    explanation: T.string,     // AI explanation
    isEditing: T.boolean,      // create vs view mode
    isLoading: T.boolean,      // calculation in progress
    datasetId: T.string,       // required for API call
    error: T.string,           // error message if calculation failed
    apiKey: T.string,          // Gemini API key
    model: T.string,           // Gemini model
    isNewlyCreated: T.boolean  // Highlight animation
  };

  getDefaultProps() {
    return {
      w: 320,
      h: 160,
      query: '',
      title: 'Calculate KPI',
      value: null,
      formattedValue: '',
      explanation: '',
      isEditing: true,
      isLoading: false,
      datasetId: '',
      error: '',
      apiKey: '',
      model: 'gemini-2.5-flash',
      isNewlyCreated: false
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
    
    // Create a functional component to use hooks
    const KPIShapeContent = () => {
      const [localQuery, setLocalQuery] = useState(shape.props.query || '');
      const [isLoading, setIsLoading] = useState(shape.props.isLoading || false);
      const inputRef = useRef(null);
      
      const {
        w,
        h,
        title,
        formattedValue,
        explanation,
        isEditing,
        datasetId,
        error,
        apiKey,
        model,
        isNewlyCreated
      } = shape.props;
      
      // Add animation class if newly created
      const highlightClass = isNewlyCreated ? 'shape-highlight-new' : '';

      // Sync localQuery with shape props when entering edit mode
      useEffect(() => {
        if (isEditing) {
          setLocalQuery(shape.props.query || '');
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }
      }, [isEditing, shape.props.query]);

      // Handle KPI calculation
      const handleCalculate = useCallback(async () => {
        if (!localQuery.trim() || !datasetId) return;
        
        // Get API key from localStorage if not in props
        const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
        const currentModel = model || localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
        
        if (!currentApiKey) {
          editor.updateShape({
            id: shape.id,
            type: 'kpi',
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
          type: 'kpi',
          props: {
            ...shape.props,
            isLoading: true,
            error: ''
          }
        });
        
        try {
          const response = await fetch(`${API}/ai-calculate-metric`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_query: localQuery,
              dataset_id: datasetId,
              api_key: currentApiKey,
              model: currentModel
            })
          });
          
          const result = await response.json();
          
          if (result.success) {
            // Generate a nice title from the query
            const kpiTitle = generateTitle(localQuery, result.explanation);
            
            editor.updateShape({
              id: shape.id,
              type: 'kpi',
              props: {
                ...shape.props,
                query: localQuery,
                title: kpiTitle,
                value: result.value,
                formattedValue: result.formatted_value || formatValue(result.value),
                explanation: result.explanation || '',
                isEditing: false,
                isLoading: false,
                error: ''
              }
            });
          } else {
            editor.updateShape({
              id: shape.id,
              type: 'kpi',
              props: {
                ...shape.props,
                query: localQuery,
                error: result.error || 'Calculation failed. Please try again.',
                isLoading: false
              }
            });
          }
        } catch (err) {
          console.error('KPI calculation failed:', err);
          editor.updateShape({
            id: shape.id,
            type: 'kpi',
            props: {
              ...shape.props,
              query: localQuery,
              error: 'Failed to calculate KPI. Please check your connection.',
              isLoading: false
            }
          });
        } finally {
          setIsLoading(false);
        }
      }, [localQuery, datasetId, apiKey, model, editor, shape.id, shape.props]);

      // Handle edit button click
      const handleEdit = useCallback(() => {
        editor.updateShape({
          id: shape.id,
          type: 'kpi',
          props: {
            ...shape.props,
            isEditing: true
          }
        });
      }, [editor, shape.id, shape.props]);

      // Handle key press (Enter to submit)
      const handleKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleCalculate();
        }
      }, [handleCalculate]);

      // Render Create Mode (Input)
      if (isEditing) {
        return (
          <HTMLContainer
            id={`kpi-container-${shape.id}`}
            style={{
              width: w,
              height: h,
              pointerEvents: 'all'
            }}
          >
            <div
              className={highlightClass}
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                backgroundColor: '#fafafa'
              }}>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  margin: 0
                }}>
                  Calculate KPI
                </h3>
              </div>
              
              {/* Input Area */}
              <div style={{
                flex: 1,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '8px 12px',
                  transition: 'all 0.2s ease'
                }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={localQuery}
                    onChange={(e) => setLocalQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder="Describe your KPI for AI to calculate"
                    disabled={isLoading}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      fontSize: '13px',
                      color: '#1f2937',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCalculate();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled={isLoading || !localQuery.trim()}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: 'none',
                      backgroundColor: isLoading || !localQuery.trim() ? '#d1d5db' : '#111827',
                      color: 'white',
                      cursor: isLoading || !localQuery.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                  >
                    {isLoading ? (
                      <div style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid transparent',
                        borderTopColor: 'white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5" />
                        <polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                  </button>
                </div>
                
                {/* Error message */}
                {error && (
                  <div style={{
                    fontSize: '11px',
                    color: '#dc2626',
                    padding: '6px 10px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px'
                  }}>
                    {error}
                  </div>
                )}
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
      }

      // Render View Mode (Display KPI)
      return (
        <HTMLContainer
          id={`kpi-container-${shape.id}`}
          style={{
            width: w,
            height: h,
            pointerEvents: 'all'
          }}
        >
          <div
            className={highlightClass}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Header with title and edit button */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#fafafa',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1
              }}>
                {title}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#6b7280',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6';
                  e.target.style.color = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#6b7280';
                }}
              >
                Edit
              </button>
            </div>
            
            {/* KPI Value */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              minHeight: 0,
              overflow: 'hidden'
            }}>
              <div style={{
                fontSize: Math.min(w / 6, 48),
                fontWeight: '700',
                color: '#111827',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.02em',
                textAlign: 'center',
                lineHeight: 1.2
              }}>
                {formattedValue || '—'}
              </div>
              
              {/* Explanation - wraps based on card size */}
              {explanation && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#9ca3af',
                  textAlign: 'center',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word'
                }}>
                  {explanation}
                </div>
              )}
            </div>
          </div>
        </HTMLContainer>
      );
    };
    
    return <KPIShapeContent />;
  }

  indicator(shape) {
    return null;
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
        w: Math.max(info.initialBounds.width * info.scaleX, 200),
        h: Math.max(info.initialBounds.height * info.scaleY, 120)
      }
    };
  }
}

/**
 * Generate a nice title from the query
 */
function generateTitle(query, explanation) {
  // Try to create a concise title from the query
  if (!query) return 'KPI';
  
  // Capitalize first letter and clean up
  let title = query.trim();
  
  // If it's a question, try to extract the key part
  if (title.toLowerCase().startsWith('what is')) {
    title = title.substring(8).trim();
  } else if (title.toLowerCase().startsWith('calculate')) {
    title = title.substring(9).trim();
  } else if (title.toLowerCase().startsWith('show me')) {
    title = title.substring(7).trim();
  } else if (title.toLowerCase().startsWith('get')) {
    title = title.substring(3).trim();
  }
  
  // Remove 'the' at the start
  if (title.toLowerCase().startsWith('the ')) {
    title = title.substring(4);
  }
  
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  
  // Truncate if too long
  if (title.length > 40) {
    title = title.substring(0, 37) + '...';
  }
  
  return title;
}

/**
 * Format a numeric value for display
 */
function formatValue(value) {
  if (value === null || value === undefined) return '—';
  
  if (typeof value === 'number') {
    // Check if it's a percentage (between 0 and 1 with decimals)
    if (value > 0 && value < 1 && !Number.isInteger(value)) {
      return `${(value * 100).toFixed(1)}%`;
    }
    
    // Large numbers with commas
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { 
        maximumFractionDigits: 2 
      });
    }
    
    // Small decimals
    if (!Number.isInteger(value)) {
      return value.toFixed(2);
    }
    
    return value.toLocaleString('en-US');
  }
  
  return String(value);
}

