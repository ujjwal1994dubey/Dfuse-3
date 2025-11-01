import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d } from '@tldraw/tldraw';

/**
 * Custom TLDraw Shape for Data Tables
 * Displays tabular data with headers and rows
 */
export class TableShape extends BaseBoxShapeUtil {
  static type = 'table';
  
  static props = {
    w: { type: 'number', default: 600 },
    h: { type: 'number', default: 400 },
    title: { type: 'string', default: '' },
    headers: { type: 'json', default: [] },
    rows: { type: 'json', default: [] },
    totalRows: { type: 'number', default: 0 }
  };

  getDefaultProps() {
    return {
      w: 600,
      h: 400,
      title: '',
      headers: [],
      rows: [],
      totalRows: 0
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
    const { w, h, title, headers, rows, totalRows } = shape.props;

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
          {/* Table Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            flexShrink: 0
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
                Showing {rows.length} of {totalRows} rows
              </p>
            )}
          </div>

          {/* Table Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            fontSize: '13px'
          }}>
            {headers.length > 0 ? (
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{
                    backgroundColor: '#f9fafb',
                    position: 'sticky',
                    top: 0
                  }}>
                    {headers.map((header, i) => (
                      <th key={i} style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        borderBottom: '2px solid #e5e7eb',
                        fontWeight: '600',
                        color: '#374151',
                        whiteSpace: 'nowrap'
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} style={{
                      backgroundColor: rowIndex % 2 === 0 ? 'white' : '#f9fafb'
                    }}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #e5e7eb',
                          color: '#1f2937'
                        }}>
                          {cell !== null && cell !== undefined ? String(cell) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                No data available
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
