import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';
import { InteractiveTable } from './InteractiveTable';

/**
 * Custom TLDraw Shape for Data Tables
 * Displays tabular data with headers and rows using an interactive table component
 */
export class TableShape extends BaseBoxShapeUtil {
  static type = 'table';
  
  static props = {
    w: T.number,
    h: T.number,
    title: T.string,
    headers: T.any,
    rows: T.any,
    totalRows: T.number,
    isNewlyCreated: T.boolean
  };

  getDefaultProps() {
    return {
      w: 300,
      h: 400,
      title: '',
      headers: [],
      rows: [],
      totalRows: 0,
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

  component(shape) {
    const { w, h, title, headers, rows, totalRows, isNewlyCreated } = shape.props;
    
    // Add animation class if newly created
    const highlightClass = isNewlyCreated ? 'shape-highlight-new' : '';

    return (
      <HTMLContainer
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
          {/* Table Header - Allows TLDraw selection and dragging */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            flexShrink: 0,
            cursor: 'move'
          }}>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1f2937',
              margin: 0
            }}>
              {title || 'Data Table'}
            </h3>
            {totalRows > 0 && (
              <p style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: '4px 0 0 0'
              }}>
                {totalRows} total rows
              </p>
            )}
          </div>

          {/* Interactive Table Content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <InteractiveTable 
              headers={headers || []}
              rows={rows || []}
              totalRows={totalRows || 0}
              width={w}
              height={h - 80} // Account for header space (12px padding top + 12px bottom + ~56px content)
            />
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }

  canEdit() {
    return false; // Tables are read-only
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
        w: Math.max(info.initialBounds.width * info.scaleX, 400),
        h: Math.max(info.initialBounds.height * info.scaleY, 200)
      }
    };
  }
}
