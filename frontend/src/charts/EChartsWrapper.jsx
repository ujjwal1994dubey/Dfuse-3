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
  useResizeHandler = true
}) => {
  const chartRef = useRef(null);
  const initCallbackFired = useRef(false);
  const zrenderListenersAttached = useRef(false);
  
  // Use ECharts option directly
  const echartsOption = useMemo(() => {
    // Expect layout to be a complete ECharts option (has series)
    if (!layout || typeof layout !== 'object' || !layout.series) {
      console.warn('EChartsWrapper: Invalid ECharts option provided');
      return null;
    }
    
    console.log('📊 EChartsWrapper: Using ECharts option', {
      hasSeries: !!layout.series,
      seriesLength: layout.series?.length,
      seriesType: layout.series?.[0]?.type
    });
    
    // Apply data sampling for performance (only if many data points)
    return sampleEChartsData(layout, 1000);
  }, [layout]);
  
  // Handle ZRender event isolation to prevent canvas interference
  useEffect(() => {
    if (chartRef.current && echartsOption && !zrenderListenersAttached.current) {
      try {
        const echartInstance = chartRef.current.getEchartsInstance();
        const zr = echartInstance.getZr();
        
        // Stop mousewheel events from bubbling to TLDraw canvas
        zr.on('mousewheel', (e) => {
          if (e.event) {
            e.event.stopPropagation();
          }
        });
        
        // Stop click events from bubbling to TLDraw canvas
        zr.on('click', (e) => {
          if (e.event) {
            e.event.stopPropagation();
          }
        });
        
        // Stop mousemove events from bubbling to TLDraw canvas
        zr.on('mousemove', (e) => {
          if (e.event) {
            e.event.stopPropagation();
          }
        });
        
        zrenderListenersAttached.current = true;
        console.log('📊 EChartsWrapper: ZRender event isolation attached');
      } catch (error) {
        console.error('EChartsWrapper: Error attaching ZRender listeners:', error);
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
  
  return (
    <ReactECharts
      ref={chartRef}
      option={echartsOption}
      style={{
        width: '100%',
        height: '100%',
        ...style
      }}
      opts={{
        renderer: 'canvas', // Use canvas for better performance
        locale: 'EN'
      }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
});

EChartsWrapper.displayName = 'EChartsWrapper';

export default EChartsWrapper;
