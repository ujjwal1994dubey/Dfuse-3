import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T } from '@tldraw/tldraw';
import EChartsWrapper from '../../../charts/EChartsWrapper';
import { useGlobalFilter } from '../../../contexts/GlobalFilterContext';

/**
 * Custom TLDraw Shape for Charts
 * Wraps ECharts within TLDraw's shape system
 */
export class ChartShape extends BaseBoxShapeUtil {
  static type = 'chart';
  
  static props = {
    w: T.number,
    h: T.number,
    // Chart data (ECharts format) - using T.any for complex objects
    chartData: T.any,
    chartLayout: T.any,
    chartType: T.string,
    title: T.string,
    // Original data for actions
    dimensions: T.any,
    measures: T.any,
    table: T.any,
    agg: T.string,
    datasetId: T.string,
    // UI state
    selected: T.boolean,
    // AI-related
    aiInsights: T.any,
    aiQuery: T.string
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

  canBind() {
    return false;
  }

  isAspectRatioLocked() {
    return false;
  }

  component(shape) {
    // Create a functional component to use hooks
    const ChartShapeContent = () => {
      const { globalFilter, setGlobalFilter } = useGlobalFilter();
      
      // Handle chart element clicks for filtering
      const handleChartClick = (params) => {
        console.log('📊 Chart element clicked:', params);
        
        // Only process series clicks (bars, points, slices)
        if (params.componentType !== 'series') {
          console.log('⚠️ Not a series element, ignoring click');
          return;
        }
        
        // Extract dimension and value
        const dimensions = shape.props.dimensions;
        if (!dimensions || dimensions.length === 0) {
          console.warn('❌ No dimensions available for filtering');
          return;
        }
        
        // Use the primary dimension (x-axis for most charts)
        const dimension = dimensions[0];
        const value = params.name; // Category name from xAxis
        
        if (!value) {
          console.warn('❌ No value found for clicked element');
          return;
        }
        
        console.log('🎯 Applying global filter:', { dimension, value, chartId: shape.id });
        
        // Apply global filter (will update all charts with matching dimension)
        setGlobalFilter(dimension, value, shape.id);
      };
      
      const {
        w,
        h,
        chartData,
        chartLayout,
        title,
        filters
      } = shape.props;

      // Check if this chart is filtered
      const isFiltered = filters && Object.keys(filters).length > 0;
      const isSourceChart = globalFilter.sourceChartId === shape.id;
      
      return (
        <HTMLContainer
          id={`chart-container-${shape.id}`}
          style={{
            width: w,
            height: h,
            overflow: 'hidden',
            pointerEvents: 'all'  // Enable pointer events for legend interactions and tooltips
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'white',
              border: isFiltered 
                ? '3px solid #10B981' 
                : '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Chart Header - title + filter badge */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: isFiltered ? '#ecfdf5' : '#fafafa',
              flexShrink: 0,
              cursor: 'move'
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
              
              {/* Filter Badge - Shows multiple values if applicable */}
              {isFiltered && globalFilter.activeDimension && globalFilter.activeValues?.length > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: '#059669',
                  backgroundColor: '#d1fae5',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: '500',
                  marginLeft: '8px',
                  whiteSpace: 'nowrap',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {isSourceChart ? '🎯 ' : ''}
                  {globalFilter.activeDimension}: {
                    globalFilter.activeValues.length === 1 
                      ? globalFilter.activeValues[0]
                      : `${globalFilter.activeValues.length} values`
                  }
                </div>
              )}
            </div>

            {/* Chart Content */}
            <div 
              style={{
                flex: 1,
                padding: '16px',
                overflow: 'hidden',
                minHeight: 0,
                position: 'relative'
              }}
            >
              {chartData && chartLayout ? (
                <EChartsWrapper
                  data={chartData}
                  layout={chartLayout}
                  onChartClick={handleChartClick}
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
    };
    
    return <ChartShapeContent />;
  }

  indicator(shape) {
    // No indicator needed - selection is handled via checkbox and custom styling
    return null;
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
