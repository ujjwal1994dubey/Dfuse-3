/**
 * Label Helper
 * Smart label positioning and formatting utilities
 */

import { formatNumber } from './visualEnhancements';

/**
 * Create Smart Labels Configuration
 * Shows labels only for significant values to reduce clutter
 * 
 * @param {Array} data - Chart data array
 * @param {string} measure - Measure key
 * @param {number} threshold - Percentile threshold (0-1)
 * @returns {Object} Label configuration
 */
export function createSmartLabels(data, measure, threshold = 0.8) {
  if (!data || data.length === 0) {
    return { show: false };
  }
  
  // Extract values
  const values = data.map(d => {
    if (typeof d === 'number') return d;
    if (d && typeof d[measure] === 'number') return d[measure];
    return 0;
  }).filter(v => v !== null && v !== undefined);
  
  if (values.length === 0) {
    return { show: false };
  }
  
  // Calculate threshold value (e.g., top 20% if threshold = 0.8)
  const sortedValues = [...values].sort((a, b) => b - a);
  const thresholdIndex = Math.floor(values.length * (1 - threshold));
  const thresholdValue = sortedValues[Math.max(0, thresholdIndex)];
  
  return {
    show: true,
    position: 'top',
    formatter: (params) => {
      const value = params.value;
      
      // Show label only if value exceeds threshold
      if (value < thresholdValue) return '';
      
      // Format the number
      return formatNumber(value);
    },
    fontSize: 11,
    color: '#374151',
    fontWeight: 500,
    offset: [0, -5]
  };
}

/**
 * Create Inside Labels for Bars
 * Places labels inside bars for better space utilization
 * 
 * @param {Array} data - Chart data array
 * @param {string} measure - Measure key
 * @returns {Object} Label configuration
 */
export function createInsideLabels(data, measure) {
  return {
    show: true,
    position: 'inside',
    formatter: (params) => {
      const value = params.value;
      if (!value || value === 0) return '';
      return formatNumber(value);
    },
    fontSize: 11,
    color: '#ffffff',
    fontWeight: 600
  };
}

/**
 * Create Percentage Labels for Pie Charts
 * Shows both name and percentage
 * 
 * @param {boolean} showValue - Whether to show value alongside percentage
 * @returns {Object} Label configuration
 */
export function createPieLabels(showValue = false) {
  return {
    show: true,
    formatter: (params) => {
      const name = params.name;
      const percent = params.percent;
      const value = params.value;
      
      if (showValue) {
        return `{b}\n{d}%\n${formatNumber(value)}`;
      }
      return `{b}\n{d}%`;
    },
    fontSize: 11,
    color: '#374151',
    overflow: 'truncate',
    width: 80
  };
}

/**
 * Create Line Chart Point Labels
 * Shows labels on specific points (min, max, last)
 * 
 * @param {Object} statistics - Statistical metadata
 * @param {string} measure - Measure key
 * @returns {Object} Label configuration
 */
export function createLinePointLabels(statistics, measure) {
  return {
    show: false, // Only show on emphasis
    formatter: (params) => {
      return formatNumber(params.value);
    },
    fontSize: 11,
    color: '#374151',
    fontWeight: 500
  };
}

/**
 * Determine if labels should be shown
 * Based on data size and chart type
 * 
 * @param {number} dataLength - Number of data points
 * @param {string} chartType - Type of chart
 * @returns {boolean} Whether to show labels
 */
export function shouldShowLabels(dataLength, chartType) {
  // Show labels for small datasets
  if (dataLength <= 10) return true;
  
  // Show labels for specific chart types regardless of size
  if (['pie', 'gauge', 'funnel'].includes(chartType)) return true;
  
  // Don't show labels for large datasets
  if (dataLength > 50) return false;
  
  // Medium datasets: show smart labels
  return true;
}

/**
 * Calculate optimal label rotation
 * Based on number of categories and label length
 * 
 * @param {Array} categories - Category labels
 * @returns {number} Rotation angle in degrees
 */
export function calculateLabelRotation(categories) {
  if (!categories || categories.length === 0) return 0;
  
  const avgLength = categories.reduce((sum, cat) => sum + String(cat).length, 0) / categories.length;
  const categoryCount = categories.length;
  
  // No rotation for few categories
  if (categoryCount <= 5) return 0;
  
  // Small rotation for short labels
  if (avgLength < 10 && categoryCount <= 15) return 30;
  
  // Standard rotation for most cases
  if (categoryCount <= 30) return 45;
  
  // Vertical for many categories
  return 90;
}

/**
 * Create Rich Label Configuration
 * Combines smart showing, formatting, and positioning
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Label configuration
 */
export function createRichLabel(options = {}) {
  const {
    data = [],
    measure = null,
    chartType = 'bar',
    threshold = 0.8,
    position = 'top',
    color = '#374151',
    fontSize = 11,
    showAlways = false
  } = options;
  
  if (!showAlways && !shouldShowLabels(data.length, chartType)) {
    return { show: false };
  }
  
  return {
    show: true,
    position: position,
    formatter: (params) => {
      const value = params.value;
      
      if (!showAlways && measure) {
        // Apply smart threshold
        const values = data.map(d => d[measure] || 0);
        const sortedValues = [...values].sort((a, b) => b - a);
        const thresholdIndex = Math.floor(values.length * (1 - threshold));
        const thresholdValue = sortedValues[Math.max(0, thresholdIndex)];
        
        if (value < thresholdValue) return '';
      }
      
      return formatNumber(value);
    },
    fontSize: fontSize,
    color: color,
    fontWeight: 500
  };
}
