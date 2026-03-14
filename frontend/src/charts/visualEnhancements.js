/**
 * Visual Enhancements Configuration
 * Centralized configuration for eCharts visual enhancements
 * including mark lines, tooltips, visual maps, and other statistical annotations
 */

/**
 * Mark Line Configuration
 * Defines styles for average, min, and max reference lines
 */
export const MARK_LINE_CONFIG = {
  average: {
    type: 'average',
    label: { 
      formatter: 'Avg: {c}', 
      position: 'insideEndTop',
      fontSize: 11,
      color: '#6366f1',
      fontWeight: 500
    },
    lineStyle: { 
      type: 'dashed', 
      color: '#6366f1', 
      width: 2,
      opacity: 0.8
    }
  },
  max: {
    type: 'max',
    label: { 
      formatter: 'Max: {c}', 
      position: 'insideEndTop',
      fontSize: 11,
      color: '#22c55e',
      fontWeight: 500
    },
    lineStyle: { 
      type: 'solid', 
      color: '#22c55e', 
      width: 1.5,
      opacity: 0.8
    }
  },
  min: {
    type: 'min',
    label: { 
      formatter: 'Min: {c}', 
      position: 'insideEndBottom',
      fontSize: 11,
      color: '#ef4444',
      fontWeight: 500
    },
    lineStyle: { 
      type: 'solid', 
      color: '#ef4444', 
      width: 1.5,
      opacity: 0.8
    }
  }
};

/**
 * Create Rich Tooltip Formatter
 * Generates HTML tooltip with statistics, percentages, and comparisons
 * 
 * @param {string} chartType - Type of chart (bar, line, pie, etc.)
 * @param {Object} statistics - Statistical metadata from backend
 * @param {Object} payload - Chart payload with dimensions and measures
 * @returns {Function} Tooltip formatter function
 */
export function createRichTooltip(chartType, statistics, payload) {
  return (params) => {
    // Handle array of params (multi-series) or single param
    const paramsArray = Array.isArray(params) ? params : [params];
    const firstParam = paramsArray[0];
    
    // Extract category name (works for both bar and line charts)
    const categoryName = firstParam.name || firstParam.axisValue || '';
    
    // Build tooltip HTML
    let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 200px;">`;
    
    // Category header
    if (categoryName) {
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827;">
        ${categoryName}
      </div>`;
    }
    
    // Display each series value
    paramsArray.forEach((param, idx) => {
      const value = param.value;
      const seriesName = param.seriesName || payload.measures?.[0] || 'Value';
      const measureKey = param.seriesName || payload.measures?.[0];
      
      // Calculate percentage of total if statistics available
      let percentageStr = '';
      let vsAvgStr = '';
      
      if (statistics && measureKey && statistics[measureKey]) {
        const stats = statistics[measureKey];
        
        // Percentage of total
        if (stats.sum && stats.sum > 0) {
          const percentage = ((value / stats.sum) * 100).toFixed(1);
          percentageStr = `<div style="display: flex; justify-content: space-between; margin: 4px 0;">
            <span style="color: #6b7280; font-size: 12px;">% of Total:</span>
            <span style="font-weight: 500; font-size: 12px;">${percentage}%</span>
          </div>`;
        }
        
        // Comparison to average
        if (stats.mean !== undefined) {
          const vsAvg = ((value - stats.mean) / stats.mean * 100).toFixed(1);
          const trend = value >= stats.mean ? '↑' : '↓';
          const color = value >= stats.mean ? '#22c55e' : '#ef4444';
          
          vsAvgStr = `<div style="display: flex; justify-content: space-between; margin: 4px 0;">
            <span style="color: #6b7280; font-size: 12px;">vs Average:</span>
            <span style="color: ${color}; font-weight: 500; font-size: 12px;">
              ${trend} ${Math.abs(vsAvg)}%
            </span>
          </div>`;
        }
      }
      
      // Series marker and value
      tooltip += `<div style="margin: 8px 0; padding-top: ${idx > 0 ? '8px' : '0'}; border-top: ${idx > 0 ? '1px solid #e5e7eb' : 'none'};">
        <div style="display: flex; justify-content: space-between; margin: 4px 0;">
          <span style="color: #374151;">
            ${param.marker} ${seriesName}:
          </span>
          <span style="font-weight: 600; margin-left: 20px; color: #111827;">
            ${typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        </div>
        ${percentageStr}
        ${vsAvgStr}
      </div>`;
    });
    
    tooltip += `</div>`;
    return tooltip;
  };
}

/**
 * Create Value-Based Visual Map
 * Generates visual map configuration for color scaling by value
 * 
 * @param {Object} statistics - Statistical metadata for the measure
 * @param {string} measure - Measure name
 * @param {boolean} show - Whether to show the visual map component
 * @returns {Object} Visual map configuration
 */
export function createValueBasedVisualMap(statistics, measure, show = false) {
  if (!statistics || !statistics[measure]) {
    return null;
  }
  
  const stats = statistics[measure];
  
  return {
    show: show,
    min: stats.min,
    max: stats.max,
    dimension: 0,
    orient: 'vertical',
    right: 10,
    top: 'center',
    text: ['High', 'Low'],
    calculable: true,
    inRange: {
      color: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1']
    },
    textStyle: {
      color: '#4B5563',
      fontSize: 11
    }
  };
}

/**
 * Create Mark Area Configuration for Quartile Ranges
 * Generates shaded regions for Q1-Q3 range
 * 
 * @param {Object} statistics - Statistical metadata
 * @param {string} measure - Measure name
 * @returns {Array} Mark area data configuration
 */
export function createQuartileMarkArea(statistics, measure) {
  if (!statistics || !statistics[measure]) {
    return null;
  }
  
  const stats = statistics[measure];
  
  return {
    silent: true,
    data: [
      [
        {
          name: 'Q1-Q3 Range',
          yAxis: stats.q25,
          itemStyle: {
            color: 'rgba(99, 102, 241, 0.1)',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1,
            borderType: 'dashed'
          }
        },
        {
          yAxis: stats.q75
        }
      ]
    ],
    label: {
      show: true,
      position: 'insideTop',
      formatter: 'IQR',
      fontSize: 10,
      color: '#6366f1'
    }
  };
}

/**
 * Format Number for Display
 * Formats large numbers with K/M/B suffixes
 * 
 * @param {number} value - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined) return '';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000000) {
    return (value / 1000000000).toFixed(decimals) + 'B';
  } else if (absValue >= 1000000) {
    return (value / 1000000).toFixed(decimals) + 'M';
  } else if (absValue >= 1000) {
    return (value / 1000).toFixed(decimals) + 'K';
  }
  
  return value.toLocaleString();
}

/**
 * Create Slider Data Zoom Configuration
 * Generates slider zoom for large datasets
 * 
 * @param {number} dataLength - Number of data points
 * @param {number} threshold - Minimum data points to show slider
 * @returns {Array|null} Data zoom configuration array
 */
export function createSliderDataZoom(dataLength, threshold = 20) {
  if (dataLength <= threshold) {
    return null;
  }
  
  return [
    {
      type: 'inside',
      xAxisIndex: 0,
      start: 0,
      end: 100,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: false
    },
    {
      type: 'slider',
      show: true,
      xAxisIndex: 0,
      start: 0,
      end: 100,
      height: 30,
      bottom: 10,
      handleIcon: 'rect',
      handleSize: '110%',
      handleStyle: { 
        color: '#2563EB',
        borderColor: '#1e40af',
        borderWidth: 1
      },
      textStyle: { 
        color: '#4B5563', 
        fontSize: 11 
      },
      borderColor: '#E5E7EB',
      backgroundColor: '#F9FAFB',
      fillerColor: 'rgba(37, 99, 235, 0.1)',
      dataBackground: {
        lineStyle: { 
          color: '#2563EB', 
          width: 1, 
          opacity: 0.5 
        },
        areaStyle: { 
          color: '#2563EB', 
          opacity: 0.2 
        }
      }
    }
  ];
}

/**
 * Create Emphasis Configuration
 * Generates emphasis effects for interactive highlighting
 * 
 * @returns {Object} Emphasis configuration
 */
export function createEmphasisConfig() {
  return {
    focus: 'series',
    blurScope: 'coordinateSystem',
    itemStyle: {
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      borderWidth: 2,
      borderColor: '#fff'
    },
    label: {
      show: true,
      fontSize: 13,
      fontWeight: 'bold',
      color: '#111827'
    }
  };
}
