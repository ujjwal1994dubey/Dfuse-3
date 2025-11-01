import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d } from '@tldraw/tldraw';
import EChartsWrapper from '../../../charts/EChartsWrapper';

/**
 * Custom TLDraw Shape for Charts
 * Wraps ECharts within TLDraw's shape system
 */
export class ChartShape extends BaseBoxShapeUtil {
  static type = 'chart';
  
  static props = {
    w: { type: 'number', default: 800 },
    h: { type: 'number', default: 400 },
    // Chart data (ECharts format)
    chartData: { type: 'json', default: null },
    chartLayout: { type: 'json', default: null },
    chartType: { type: 'string', default: 'bar' },
    title: { type: 'string', default: '' },
    // Original data for actions
    dimensions: { type: 'json', default: [] },
    measures: { type: 'json', default: [] },
    table: { type: 'json', default: [] },
    agg: { type: 'string', default: 'sum' },
    datasetId: { type: 'string', default: '' },
    // UI state
    selected: { type: 'boolean', default: false },
    // AI-related
    aiInsights: { type: 'json', default: null },
    aiQuery: { type: 'string', default: '' }
  };

  getDefaultProps() {
    return {
      w: 800,
      h: 400,
      chartData: null,
      chartLayout: null,
      chartType: 'bar',
      title: '',
      dimensions: [],
      measures: [],
      table: [],
      agg: 'sum',
      datasetId: '',
      selected: false,
      aiInsights: null,
      aiQuery: ''
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
    const {
      w,
      h,
      chartData,
      chartLayout,
      title,
      selected
    } = shape.props;

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          pointerEvents: 'all',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'white',
            border: selected ? '3px solid #3b82f6' : '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Chart Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#fafafa',
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
              {title || 'Untitled Chart'}
            </h3>
            
            {/* Selection checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                this.editor.updateShape({
                  ...shape,
                  props: {
                    ...shape.props,
                    selected: e.target.checked
                  }
                });
              }}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                marginLeft: '12px',
                accentColor: '#3b82f6'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Chart Content */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflow: 'hidden',
            minHeight: 0
          }}>
            {chartData && chartLayout ? (
              <EChartsWrapper
                data={chartData}
                layout={chartLayout}
                style={{
                  width: '100%',
                  height: '100%'
                }}
              />
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                No chart data available
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

  // Allow text editing on double-click (for title)
  canEdit() {
    return false; // We handle editing through the Chart Actions panel
  }

  // Enable resizing
  canResize() {
    return true;
  }

  // Keep aspect ratio optional
  isAspectRatioLocked() {
    return false;
  }

  // Allow rotation
  canRotate() {
    return false; // Charts shouldn't rotate
  }

  // Update size when resized
  onResize(shape, info) {
    return {
      props: {
        ...shape.props,
        w: Math.max(info.initialBounds.width * info.scaleX, 300),
        h: Math.max(info.initialBounds.height * info.scaleY, 200)
      }
    };
  }
}
