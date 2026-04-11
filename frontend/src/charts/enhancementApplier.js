/**
 * Enhancement Applier
 * Universal enhancement logic that can be applied to any chart type
 */

import { createSliderDataZoom, createEmphasisConfig } from './visualEnhancements';

/**
 * Apply Universal Enhancements
 * Adds common enhancements to any chart option
 * 
 * @param {Object} option - Base eCharts option
 * @param {string} chartType - Type of chart (bar, line, pie, etc.)
 * @param {Object} statistics - Statistical metadata from backend
 * @param {Array} data - Chart data array
 * @param {Object} payload - Chart payload with dimensions and measures
 * @returns {Object} Enhanced chart option
 */
/**
 * Compute a simple OLS linear trend using least-squares (no dependencies).
 * Returns { slope, intercept } or null when insufficient data.
 */
function computeLinearTrend(values) {
  const n = values.length;
  if (n < 4) return null;
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * values[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function applyUniversalEnhancements(option, chartType, statistics, data, payload) {
  if (!option) return option;
  
  const enhanced = { ...option };
  
  // 1. Apply slider zoom for large datasets
  if (data && data.length > 20 && ['bar', 'line', 'multi_series_bar', 'grouped_bar'].includes(chartType)) {
    const sliderZoom = createSliderDataZoom(data.length);
    if (sliderZoom) {
      // Merge with existing dataZoom if present
      if (enhanced.dataZoom) {
        // Keep inside zoom, add slider zoom
        const hasSlider = enhanced.dataZoom.some(dz => dz.type === 'slider');
        if (!hasSlider) {
          enhanced.dataZoom = [...enhanced.dataZoom, sliderZoom[1]]; // Add slider (second item)
        }
      } else {
        enhanced.dataZoom = sliderZoom;
      }
      
      // Adjust grid bottom to accommodate slider
      if (enhanced.grid) {
        enhanced.grid = {
          ...enhanced.grid,
          bottom: Math.max(parseInt(enhanced.grid.bottom) || 80, 100) + 'px'
        };
      }
    }
  }
  
  // 2. Apply emphasis effects to series
  if (enhanced.series && Array.isArray(enhanced.series)) {
    enhanced.series = enhanced.series.map(series => ({
      ...series,
      emphasis: series.emphasis || createEmphasisConfig()
    }));
  }
  
  // 3. Apply animation settings
  enhanced.animation = true;
  enhanced.animationDuration = 1000;
  enhanced.animationEasing = 'cubicOut';
  
  // 4. Apply staggered animation for multi-series
  if (enhanced.series && enhanced.series.length > 1) {
    enhanced.series = enhanced.series.map((series, idx) => ({
      ...series,
      animationDelay: idx * 100
    }));
  }
  
  // 5. Apply responsive grid settings
  if (enhanced.grid) {
    enhanced.grid = enhanceGrid(enhanced.grid, chartType, data);
  }
  
  // 6. Enhance tooltip
  if (enhanced.tooltip) {
    enhanced.tooltip = enhanceTooltip(enhanced.tooltip, chartType);
  }
  
  // 7. Apply progressive rendering for large datasets
  if (data && data.length > 3000) {
    enhanced.progressive = 1000;
    enhanced.progressiveThreshold = 3000;
  }

  // 8. Inject linear trend line for line charts with sufficient data points
  if (
    chartType === 'line' &&
    data && data.length >= 5 &&
    enhanced.series && Array.isArray(enhanced.series)
  ) {
    const measureKey = payload?.measures?.[0];
    if (measureKey) {
      const values = data
        .map(r => (r[measureKey] !== undefined && r[measureKey] !== null ? Number(r[measureKey]) : NaN))
        .filter(v => !isNaN(v));

      const trend = computeLinearTrend(values);
      if (trend) {
        const trendValues = values.map((_, i) => parseFloat((trend.slope * i + trend.intercept).toFixed(4)));
        // Only add the trend line if it isn't already present
        const hasTrend = enhanced.series.some(s => s.name === 'Trend');
        if (!hasTrend) {
          enhanced.series = [
            ...enhanced.series,
            {
              name: 'Trend',
              type: 'line',
              data: trendValues,
              smooth: false,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: '#F97316', width: 1.5, opacity: 0.7 },
              itemStyle: { color: '#F97316' },
              tooltip: { valueFormatter: (v) => `${v.toFixed(2)} (trend)` }
            }
          ];
          // Ensure legend shows the Trend series
          if (enhanced.legend) {
            if (enhanced.legend.data && Array.isArray(enhanced.legend.data)) {
              enhanced.legend = { ...enhanced.legend, data: [...enhanced.legend.data, 'Trend'] };
            }
          }
        }
      }
    }
  }
  
  return enhanced;
}

/**
 * Enhance Grid Configuration
 * Adjusts grid spacing based on chart type and data
 */
function enhanceGrid(grid, chartType, data) {
  const enhanced = { ...grid };
  
  // Ensure containLabel is set for proper spacing
  if (enhanced.containLabel === undefined) {
    enhanced.containLabel = false;
  }
  
  // Adjust for different chart types
  switch (chartType) {
    case 'bar':
    case 'grouped_bar':
    case 'multi_series_bar':
      // More bottom space for rotated labels
      if (!enhanced.bottom || parseInt(enhanced.bottom) < 80) {
        enhanced.bottom = '80px';
      }
      break;
      
    case 'pie':
      // Pie charts need less grid control
      return grid;
      
    case 'scatter':
    case 'bubble':
      // More space on right for visual map
      if (!enhanced.right || parseInt(enhanced.right) < 120) {
        enhanced.right = '120px';
      }
      break;
      
    case 'dual_axis':
      // More space on both sides for dual axes
      if (!enhanced.left || parseInt(enhanced.left) < 90) {
        enhanced.left = '90px';
      }
      if (!enhanced.right || parseInt(enhanced.right) < 90) {
        enhanced.right = '90px';
      }
      break;
  }
  
  return enhanced;
}

/**
 * Enhance Tooltip Configuration
 * Adds common tooltip improvements
 */
function enhanceTooltip(tooltip, chartType) {
  const enhanced = { ...tooltip };
  
  // Set trigger based on chart type
  if (!enhanced.trigger) {
    enhanced.trigger = ['pie', 'scatter', 'bubble'].includes(chartType) ? 'item' : 'axis';
  }
  
  // Add background and border styling if not present
  if (!enhanced.backgroundColor) {
    enhanced.backgroundColor = 'rgba(255, 255, 255, 0.95)';
  }
  
  if (!enhanced.borderColor) {
    enhanced.borderColor = '#E5E7EB';
  }
  
  if (!enhanced.borderWidth) {
    enhanced.borderWidth = 1;
  }
  
  if (!enhanced.textStyle) {
    enhanced.textStyle = {
      color: '#374151',
      fontSize: 13
    };
  }
  
  // Add axis pointer for axis-triggered tooltips
  if (enhanced.trigger === 'axis' && !enhanced.axisPointer) {
    enhanced.axisPointer = {
      type: chartType === 'line' ? 'cross' : 'shadow',
      label: {
        backgroundColor: '#6a7985'
      }
    };
  }
  
  return enhanced;
}

/**
 * Add Slider Data Zoom Helper
 * Merges slider zoom with existing zoom configuration
 */
function addSliderZoom(existingDataZoom) {
  const sliderConfig = {
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
  };
  
  if (!existingDataZoom) {
    return [sliderConfig];
  }
  
  if (Array.isArray(existingDataZoom)) {
    // Check if slider already exists
    const hasSlider = existingDataZoom.some(dz => dz.type === 'slider');
    if (hasSlider) {
      return existingDataZoom;
    }
    return [...existingDataZoom, sliderConfig];
  }
  
  return [existingDataZoom, sliderConfig];
}

/**
 * Calculate Optimal Animation Delay
 * Stagger animations based on series count
 */
export function calculateAnimationDelay(seriesIndex, totalSeries) {
  if (totalSeries <= 1) return 0;
  
  const baseDelay = 100;
  const maxDelay = 500;
  
  return Math.min(seriesIndex * baseDelay, maxDelay);
}

/**
 * Apply Color Scheme
 * Applies consistent color scheme to series
 */
export function applyColorScheme(series, colorScheme = 'categorical') {
  const colorSchemes = {
    categorical: ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF'],
    quantitative: ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
    comparative: ['#2563EB', '#F97316'],
    sequential: ['#EFF6FF', '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1e40af', '#1e3a8a']
  };
  
  const colors = colorSchemes[colorScheme] || colorSchemes.categorical;
  
  if (!Array.isArray(series)) {
    return series;
  }
  
  return series.map((s, idx) => ({
    ...s,
    itemStyle: {
      ...s.itemStyle,
      color: s.itemStyle?.color || colors[idx % colors.length]
    }
  }));
}

/**
 * Enhance Legend
 * Improves legend appearance and behavior
 */
export function enhanceLegend(legend, seriesCount) {
  if (!legend) return legend;
  
  const enhanced = { ...legend };
  
  // Use scroll for many series
  if (seriesCount > 10 && !enhanced.type) {
    enhanced.type = 'scroll';
  }
  
  // Add styling if not present
  if (!enhanced.textStyle) {
    enhanced.textStyle = {
      fontSize: 11,
      color: '#6B7280'
    };
  }
  
  // Add selector for interactive filtering
  if (seriesCount > 2 && !enhanced.selector) {
    enhanced.selector = [
      {
        type: 'all',
        title: 'All'
      },
      {
        type: 'inverse',
        title: 'Inverse'
      }
    ];
  }
  
  return enhanced;
}
