import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';

/**
 * Custom TLDraw Shape for Text Boxes
 * Used for annotations and notes
 */
export class TextBoxShape extends BaseBoxShapeUtil {
  static type = 'textbox';
  
  static props = {
    w: T.number,
    h: T.number,
    text: T.string,
    fontSize: T.number,
    isAIInsights: T.boolean,
    chartTitle: T.string
  };

  getDefaultProps() {
    return {
      w: 200,
      h: 100,
      text: '',
      fontSize: 14,
      isAIInsights: false,
      chartTitle: ''
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
    const { w, h, text, fontSize, isAIInsights, chartTitle } = shape.props;

    // Render AI Insights with header
    if (isAIInsights) {
      const headerHeight = 40;
      const contentHeight = h - headerHeight;
      
      // Determine the title to display
      const displayTitle = chartTitle ? `${chartTitle} Insights` : 'AI Insights';
      
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
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header - Draggable */}
            <div style={{
              height: `${headerHeight}px`,
              padding: '12px 16px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'move',
              flexShrink: 0
            }}>
              {/* Sparkle Icon */}
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#d97706" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M12 3l1.545 5.345L19 9.89l-5.455 1.545L12 17l-1.545-5.345L5 10.11l5.455-1.545L12 3z"/>
                <path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5L5 3zM19 17l.5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5L19 17z"/>
              </svg>
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#92400e',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {displayTitle}
              </h3>
            </div>
            
            {/* Content Area - Editable */}
            <div style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#fef3c7',
              overflow: 'hidden',
              minHeight: 0
            }}>
              <textarea
                value={text}
                onChange={(e) => {
                  e.stopPropagation();
                  this.editor.updateShape({
                    ...shape,
                    props: {
                      ...shape.props,
                      text: e.target.value
                    }
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: 'transparent',
                  resize: 'none',
                  outline: 'none',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#78350f',
                  lineHeight: '1.5'
                }}
                placeholder="AI-generated insights will appear here..."
              />
            </div>
          </div>
        </HTMLContainer>
      );
    }

    // Render regular textbox (existing behavior)
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
          padding: '12px',
          backgroundColor: '#fef3c7',
          border: '2px solid #fbbf24',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <textarea
            value={text}
            onChange={(e) => {
              e.stopPropagation();
              this.editor.updateShape({
                ...shape,
                props: {
                  ...shape.props,
                  text: e.target.value
                }
              });
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              resize: 'none',
              outline: 'none',
              fontSize: `${fontSize}px`,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: '#78350f',
              lineHeight: '1.5'
            }}
            placeholder="Type your note here..."
          />
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
        w: Math.max(info.initialBounds.width * info.scaleX, 100),
        h: Math.max(info.initialBounds.height * info.scaleY, 60)
      }
    };
  }
}
