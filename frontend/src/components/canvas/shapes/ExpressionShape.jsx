import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';

/**
 * Custom TLDraw Shape for Mathematical Expressions
 * Calculator and expression evaluator
 */
export class ExpressionShape extends BaseBoxShapeUtil {
  static type = 'expression';
  
  static props = {
    w: T.number,
    h: T.number,
    expression: T.string,
    result: T.string,
    error: T.string
  };

  getDefaultProps() {
    return {
      w: 400,
      h: 200,
      expression: '',
      result: '',
      error: ''
    };
  }

  getGeometry(shape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true
    });
  }

  component(shape) {
    const { w, h, expression, result, error } = shape.props;

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          pointerEvents: 'all'
        }}
      >
        <div style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Expression Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0
          }}>
            <span style={{
              fontSize: '18px'
            }}>🧮</span>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1f2937',
              margin: 0
            }}>
              Expression Calculator
            </h3>
          </div>

          {/* Expression Input */}
          <div style={{
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div>
              <label style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#6b7280',
                display: 'block',
                marginBottom: '6px'
              }}>
                Expression:
              </label>
              <input
                type="text"
                value={expression}
                onChange={(e) => {
                  e.stopPropagation();
                  this.editor.updateShape({
                    ...shape,
                    props: {
                      ...shape.props,
                      expression: e.target.value
                    }
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="e.g., 2 + 2 * 3"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
            </div>

            {/* Result Display */}
            {result && !error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: '6px'
              }}>
                <div style={{
                  fontSize: '12px',
                  color: '#065f46',
                  marginBottom: '4px',
                  fontWeight: '500'
                }}>
                  Result:
                </div>
                <div style={{
                  fontSize: '18px',
                  fontFamily: 'monospace',
                  color: '#047857',
                  fontWeight: '600'
                }}>
                  {result}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '6px'
              }}>
                <div style={{
                  fontSize: '12px',
                  color: '#991b1b',
                  marginBottom: '4px',
                  fontWeight: '500'
                }}>
                  Error:
                </div>
                <div style={{
                  fontSize: '13px',
                  color: '#dc2626'
                }}>
                  {error}
                </div>
              </div>
            )}

            {/* Instructions */}
            {!result && !error && (
              <div style={{
                fontSize: '12px',
                color: '#9ca3af',
                fontStyle: 'italic'
              }}>
                Enter a mathematical expression above
              </div>
            )}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }

  canEdit() {
    return true;
  }

  canResize() {
    return true;
  }

  isAspectRatioLocked() {
    return false;
  }

  canRotate() {
    return false;
  }

  onResize(shape, info) {
    return {
      props: {
        ...shape.props,
        w: Math.max(info.initialBounds.width * info.scaleX, 300),
        h: Math.max(info.initialBounds.height * info.scaleY, 150)
      }
    };
  }
}
