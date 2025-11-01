import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d } from '@tldraw/tldraw';

/**
 * Custom TLDraw Shape for Text Boxes
 * Used for annotations and notes
 */
export class TextBoxShape extends BaseBoxShapeUtil {
  static type = 'textbox';
  
  static props = {
    w: { type: 'number', default: 200 },
    h: { type: 'number', default: 100 },
    text: { type: 'string', default: '' },
    fontSize: { type: 'number', default: 14 }
  };

  getDefaultProps() {
    return {
      w: 200,
      h: 100,
      text: '',
      fontSize: 14
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
    const { w, h, text, fontSize } = shape.props;

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
