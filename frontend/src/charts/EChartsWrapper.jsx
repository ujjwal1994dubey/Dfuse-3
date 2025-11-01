import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { convertPlotlyToECharts, sampleEChartsData } from './chartHelpers';

/**
 * ECharts Wrapper Component
 * Drop-in replacement for Plotly Plot component
 * Accepts Plotly figure format and converts to ECharts
 * 
 * Props match Plotly's API for easy migration:
 * @param {Array} data - Plotly data array (will be converted)
 * @param {Object} layout - Plotly layout object (will be converted)
 * @param {Object} config - Chart configuration options (Plotly format, mostly ignored)
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
  
  // Convert Plotly figure to ECharts option OR use native ECharts option
  const echartsOption = useMemo(() => {
    // Check if layout is already a complete ECharts option (has series)
    if (layout && typeof layout === 'object' && layout.series) {
      console.log('📊 EChartsWrapper: Using native ECharts option directly', {
        hasSeries: !!layout.series,
        seriesLength: layout.series?.length,
        seriesType: layout.series?.[0]?.type
      });
      // Apply data sampling for performance (only if many data points)
      return sampleEChartsData(layout, 1000);
    }
    
    // Otherwise, assume Plotly format and convert
    if (!data || data.length === 0) {
      console.warn('EChartsWrapper: No data provided');
      return null;
    }

    const plotlyFigure = { data, layout: layout || {} };
    
    try {
      console.log('🔄 EChartsWrapper: Converting Plotly to ECharts');
      let option = convertPlotlyToECharts(plotlyFigure);
      
      if (!option) {
        console.error('EChartsWrapper: Conversion returned null');
        return null;
      }
      
      // Apply data sampling for performance (only if many data points)
      option = sampleEChartsData(option, 1000);
      
      return option;
    } catch (error) {
      console.error('EChartsWrapper: Error converting chart:', error);
      return null;
    }
  }, [data, layout]);
  
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
