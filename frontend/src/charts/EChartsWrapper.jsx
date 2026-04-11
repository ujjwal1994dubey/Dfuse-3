import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * Sample data for performance optimization
 * Reduces data points if dataset is too large.
 *
 * IMPORTANT: series.data and xAxis.data MUST be sampled using the exact same
 * indices, otherwise ECharts will map bar/line values to the wrong category
 * labels (e.g. player A's bar gets player B's value).
 * Tooltip formatter closures also capture fullLabels arrays at creation time,
 * so they rely on the same indexing. For this reason the threshold is set very
 * high (50 000) so that typical datasets are never sampled — ECharts handles
 * thousands of points natively via progressive rendering.
 */
function sampleEChartsData(option, maxPoints = 50000) {
  if (!option || !option.series) return option;

  const firstSeries = option.series[0];
  if (
    !firstSeries?.data ||
    !Array.isArray(firstSeries.data) ||
    firstSeries.data.length <= maxPoints
  ) {
    return option;
  }

  const step = Math.ceil(firstSeries.data.length / maxPoints);

  // Build the sampled index list once and reuse for EVERY series AND xAxis.
  const sampledIndices = [];
  for (let i = 0; i < firstSeries.data.length; i += step) {
    sampledIndices.push(i);
  }

  // Sample ALL series with the same indices so values stay aligned.
  const sampledSeries = option.series.map(series => ({
    ...series,
    data: !Array.isArray(series.data)
      ? series.data
      : sampledIndices.map(i => series.data[i] ?? null)
  }));

  // Sample xAxis.data with the exact same indices (critical for alignment).
  let sampledXAxis = option.xAxis;
  if (option.xAxis) {
    const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
    const fixed = axes.map(ax =>
      ax.type === 'category' && Array.isArray(ax.data)
        ? { ...ax, data: sampledIndices.map(i => ax.data[i]) }
        : ax
    );
    sampledXAxis = Array.isArray(option.xAxis) ? fixed : fixed[0];
  }

  return { ...option, series: sampledSeries, xAxis: sampledXAxis };
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
    
    // Apply data sampling for extreme datasets only (threshold kept very high
    // so typical charts are never sampled — see sampleEChartsData comment).
    return sampleEChartsData(layout);
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
        // Do NOT stop propagation here — tldraw needs to receive this event
        // so its hit-testing can select annotations that overlap this chart.
        // Accidental shape dragging is prevented because dragging requires
        // the user to actually move the pointer, not just press and release.
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
