import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * Sample data for performance optimization
 * Reduces data points if dataset is too large
 */
function sampleEChartsData(option, maxPoints = 1000) {
  if (!option || !option.series) return option;
  
  const sampledSeries = option.series.map(series => {
    if (!series.data || !Array.isArray(series.data) || series.data.length <= maxPoints) {
      return series;
    }
    
    const step = Math.ceil(series.data.length / maxPoints);
    const sampledData = [];
    for (let i = 0; i < series.data.length; i += step) {
      sampledData.push(series.data[i]);
    }
    
    return {
      ...series,
      data: sampledData
    };
  });
  
  return {
    ...option,
    series: sampledSeries
  };
}

/**
 * ECharts Wrapper Component
 * Renders charts using ECharts format
 * 
 * @param {Array} data - Series data array (for compatibility, use layout.series instead)
 * @param {Object} layout - ECharts option object with series, xAxis, yAxis, etc.
 * @param {Object} config - Chart configuration options
 * @param {Object} style - CSS styles
 * @param {Function} onInitialized - Callback after chart init
 * @param {Function} onUpdate - Callback after chart update
 * @param {boolean} useResizeHandler - Enable resize observer (default: true)
 */
const EChartsWrapper = React.memo(({ 
  data, 
  layout, 
  config = {}, 
  style = {},
  onInitialized,
  onUpdate,
  useResizeHandler = true,
  onChartClick
}) => {
  const chartRef = useRef(null);
  const initCallbackFired = useRef(false);
  const wheelListenerAttached = useRef(false);
  
  // Add refs to track chart update state (for click debouncing)
  const isUpdatingRef = useRef(false);
  const updateTimeoutRef = useRef(null);
  
  // Use ECharts option directly
  const echartsOption = useMemo(() => {
    // Expect layout to be a complete ECharts option (has series)
    if (!layout || typeof layout !== 'object' || !layout.series) {
      console.warn('EChartsWrapper: Invalid ECharts option provided');
      return null;
    }
    
    // Apply data sampling for performance (only if many data points)
    return sampleEChartsData(layout, 1000);
  }, [layout]);
  
  // Watch for option changes and debounce clicks during updates
  useEffect(() => {
    // Mark as updating when option changes
    isUpdatingRef.current = true;
    
    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Allow clicks again after 150ms (after chart finishes rendering)
    updateTimeoutRef.current = setTimeout(() => {
      isUpdatingRef.current = false;
    }, 150);
    
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [echartsOption]);
  
  // Isolate mousewheel events to prevent TLDraw canvas zoom when scrolling charts
  useEffect(() => {
    if (chartRef.current && echartsOption && !wheelListenerAttached.current) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        if (!echartInstance) return;
        
        const zr = echartInstance.getZr();
        if (!zr) return;
        
        // Stop mousewheel from bubbling to TLDraw (keep this for pan/zoom isolation)
        zr.on('mousewheel', (e) => {
          if (e.event) {
            e.event.stopPropagation();
          }
        });
        
        wheelListenerAttached.current = true;
      } catch (error) {
        console.error('❌ Error attaching mousewheel listener:', error);
      }
    }
  }, [echartsOption]);
  
  // Handle initialization callback
  useEffect(() => {
    if (onInitialized && chartRef.current && echartsOption && !initCallbackFired.current) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        // Pass null as first arg to match Plotly API (figure, graphDiv)
        onInitialized(null, echartInstance);
        initCallbackFired.current = true;
      } catch (error) {
        console.error('EChartsWrapper: Error in onInitialized callback:', error);
      }
    }
  }, [onInitialized, echartsOption]);
  
  // Handle update callback
  useEffect(() => {
    if (onUpdate && chartRef.current && echartsOption) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        // Pass null as first arg to match Plotly API (figure, graphDiv)
        onUpdate(null, echartInstance);
      } catch (error) {
        console.error('EChartsWrapper: Error in onUpdate callback:', error);
      }
    }
  }, [echartsOption, onUpdate]);
  
  // Attach both ECharts and ZRender click event listeners
  useEffect(() => {
    if (chartRef.current && echartsOption) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        if (!echartInstance) return;
        
        // ECharts native click handler
        const handleEChartsClick = (params) => {
          console.log('🎯 ECharts CLICK:', params);
          if (onChartClick && params.componentType === 'series') {
            onChartClick(params);
          }
        };
        
        echartInstance.on('click', handleEChartsClick);
        console.log('✅ ECharts click listener attached');
        
        // ZRender click listener
        const zr = echartInstance.getZr();
        if (zr) {
          const handleZRenderClick = (e) => {
            console.log('🖱️ ZRender CLICK', e);
          };
          
          zr.on('click', handleZRenderClick);
          console.log('✅ ZRender click listener attached');
          
          // Cleanup
          return () => {
            echartInstance.off('click', handleEChartsClick);
            zr.off('click', handleZRenderClick);
            console.log('🧹 Click listeners removed');
          };
        }
        
        // Cleanup (if ZRender not available)
        return () => {
          echartInstance.off('click', handleEChartsClick);
        };
      } catch (error) {
        console.error('❌ Error attaching click listener:', error);
      }
    }
  }, [echartsOption, onChartClick]);
  
  if (!echartsOption) {
    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: '14px'
      }}>
        Loading chart...
      </div>
    );
  }
  
  // Manual click handler to bypass TLDraw blocking
  const handleWrapperClick = (e) => {
    // Ignore clicks while chart is updating
    if (isUpdatingRef.current) {
      console.log('⏳ Chart is updating, ignoring click');
      return;
    }
    
    // Stop propagation to TLDraw
    e.stopPropagation();
    e.preventDefault();
    
    if (chartRef.current) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        const zr = echartInstance.getZr();
        
        // Get the canvas element
        const canvas = zr.painter.getViewportRoot();
        if (!canvas) return;
        
        // Calculate coordinates
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Get current option
        const currentOption = echartInstance.getOption();
        const chartType = currentOption.series?.[0]?.type;
        
        try {
          let clickedElement = null;
          const displayList = zr.storage.getDisplayList();
          
          // Find elements at click point
          for (let i = displayList.length - 1; i >= 0; i--) {
            const el = displayList[i];
            
            if (el.contain && el.contain(x, y)) {
              // Try multiple ways to get dataIndex
              let dataIndex = el.dataIndex;
              let seriesIndex = el.seriesIndex || 0;
              
              // Check parent if this element doesn't have dataIndex
              if (dataIndex === undefined && el.parent) {
                dataIndex = el.parent.dataIndex;
                seriesIndex = el.parent.seriesIndex || 0;
              }
              
              // If we found a dataIndex, extract the data
              if (dataIndex !== undefined && dataIndex !== null) {
                const series = currentOption.series[seriesIndex];
                
                if (chartType === 'pie') {
                  const dataItem = series.data[dataIndex];
                  clickedElement = {
                    componentType: 'series',
                    seriesIndex: seriesIndex,
                    dataIndex: dataIndex,
                    seriesName: series.name,
                    name: dataItem.name,
                    value: dataItem.value,
                    data: dataItem
                  };
                } else {
                  // Bar/line charts
                  const allCategories = currentOption.xAxis?.[0]?.data || [];
                  const categoryName = allCategories[dataIndex];
                  const value = series?.data?.[dataIndex];
                  
                  if (categoryName && value !== undefined) {
                    clickedElement = {
                      componentType: 'series',
                      seriesIndex: seriesIndex,
                      dataIndex: dataIndex,
                      seriesName: series.name,
                      name: categoryName,
                      value: value,
                      data: value
                    };
                  }
                }
                
                console.log('✨ Manual click detected element:', clickedElement);
                break;
              }
            }
          }
          
          // Call callback if we found a clicked element
          if (clickedElement && onChartClick) {
            onChartClick(clickedElement);
          }
          
        } catch (error) {
          console.error('❌ Error in click detection:', error);
        }
      } catch (error) {
        console.error('❌ Error processing click:', error);
      }
    }
  };
  
  return (
    <div
      onClick={handleWrapperClick}
      onPointerDown={(e) => {
        e.stopPropagation(); // Prevent TLDraw from starting drag
      }}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: 'pointer',
        pointerEvents: 'auto' // Critical: Allow this div to receive clicks
      }}
    >
      <ReactECharts
        ref={chartRef}
        option={echartsOption}
        style={{
          width: '100%',
          height: '100%',
          ...style,
          pointerEvents: 'auto'
        }}
        opts={{
          renderer: 'canvas',
          locale: 'EN'
        }}
        notMerge={true}
        lazyUpdate={false}
      />
    </div>
  );
});

EChartsWrapper.displayName = 'EChartsWrapper';

export default EChartsWrapper;
