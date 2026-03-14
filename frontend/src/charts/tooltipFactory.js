/**
 * Tooltip Factory
 * Rich tooltip generators for all chart types
 * Provides contextual information including percentages, trends, comparisons, and rankings
 */

import { formatNumber } from './visualEnhancements';

/**
 * Create Bar Chart Tooltip
 * Displays value, percentage of total, and comparison to average
 */
export function createBarChartTooltip(statistics, measures, data, fullLabels) {
  return {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params) => {
      const paramsArray = Array.isArray(params) ? params : [params];
      const firstParam = paramsArray[0];
      const dataIndex = firstParam.dataIndex;
      const categoryName = fullLabels ? fullLabels[dataIndex] : firstParam.name;
      const value = firstParam.value;
      const measureKey = measures[0];
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 220px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${categoryName}
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">Value:</span>
        <span style="font-weight: 600; margin-left: 20px; color: #111827; font-size: 15px;">
          ${typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>`;
      
      if (statistics && measureKey && statistics[measureKey]) {
        const stats = statistics[measureKey];
        
        if (stats.sum && stats.sum > 0) {
          const percentage = ((value / stats.sum) * 100).toFixed(1);
          tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
            <span style="color: #6b7280;">% of Total:</span>
            <span style="font-weight: 500; color: #374151;">${percentage}%</span>
          </div>`;
        }
        
        if (stats.mean !== undefined && stats.mean !== 0) {
          const vsAvg = ((value - stats.mean) / stats.mean * 100).toFixed(1);
          const trend = value >= stats.mean ? '↑' : '↓';
          const color = value >= stats.mean ? '#22c55e' : '#ef4444';
          
          tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
            <span style="color: #6b7280;">vs Average:</span>
            <span style="color: ${color}; font-weight: 500;">
              ${trend} ${Math.abs(vsAvg)}%
            </span>
          </div>`;
        }
        
        tooltip += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
          Range: ${formatNumber(stats.min)} - ${formatNumber(stats.max)}
        </div>`;
      }
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}

/**
 * Create Line Chart Tooltip
 * Multi-series support with trend indicators
 */
export function createLineChartTooltip(statistics, measures, data, fullLabels) {
  return {
    trigger: 'axis',
    formatter: (params) => {
      const paramsArray = Array.isArray(params) ? params : [params];
      const firstParam = paramsArray[0];
      const dataIndex = firstParam.dataIndex;
      const categoryName = fullLabels ? fullLabels[dataIndex] : (firstParam.axisValue || firstParam.name);
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 220px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${categoryName}
      </div>`;
      
      paramsArray.forEach((param, idx) => {
        const value = param.value;
        const seriesName = param.seriesName || measures[idx] || 'Value';
        const measureKey = param.seriesName || measures[idx];
        
        tooltip += `<div style="margin: 8px 0; ${idx > 0 ? 'padding-top: 8px; border-top: 1px solid #f3f4f6;' : ''}">`;
        
        tooltip += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: #374151;">
            ${param.marker} ${seriesName}:
          </span>
          <span style="font-weight: 600; margin-left: 16px; color: #111827;">
            ${typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        </div>`;
        
        if (statistics && measureKey && statistics[measureKey]) {
          const stats = statistics[measureKey];
          
          if (stats.mean !== undefined) {
            const vsAvg = ((value - stats.mean) / stats.mean * 100).toFixed(0);
            const trend = value >= stats.mean ? '↑' : '↓';
            const color = value >= stats.mean ? '#22c55e' : '#ef4444';
            
            tooltip += `<div style="font-size: 11px; color: ${color}; margin-left: 20px;">
              ${trend} ${Math.abs(vsAvg)}% vs avg (${formatNumber(stats.mean)})
            </div>`;
          }
        }
        
        tooltip += `</div>`;
      });
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}

/**
 * Create Pie Chart Tooltip
 * Shows percentage, cumulative percentage, and context
 */
export function createPieChartTooltip(statistics, measure, data) {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  const sortedData = [...data].sort((a, b) => (b.value || 0) - (a.value || 0));
  
  return {
    trigger: 'item',
    formatter: (params) => {
      const value = params.value;
      const name = params.data.fullName || params.name;
      const percentage = ((value / total) * 100).toFixed(1);
      
      let cumulative = 0;
      for (const item of sortedData) {
        cumulative += (item.value || 0);
        if (item.name === params.data.name || item.fullName === name) break;
      }
      const cumulativePercentage = ((cumulative / total) * 100).toFixed(1);
      
      const rank = sortedData.findIndex(item => 
        item.name === params.data.name || item.fullName === name
      ) + 1;
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 220px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${name}
        <span style="font-size: 11px; color: #6b7280; font-weight: 400; margin-left: 6px;">(#${rank})</span>
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">Value:</span>
        <span style="font-weight: 600; color: #111827; font-size: 15px;">
          ${value.toLocaleString()}
        </span>
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">Percentage:</span>
        <span style="font-weight: 600; color: #2563eb;">
          ${percentage}%
        </span>
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">Cumulative:</span>
        <span style="font-weight: 500; color: #6366f1;">
          ${cumulativePercentage}%
        </span>
      </div>`;
      
      if (statistics && measure && statistics[measure]) {
        const stats = statistics[measure];
        tooltip += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
          Avg: ${formatNumber(stats.mean)} | Total: ${formatNumber(stats.sum)}
        </div>`;
      }
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}

/**
 * Create Scatter Plot Tooltip
 * Shows both X and Y values with quadrant information
 */
export function createScatterTooltip(statistics, xKey, yKey) {
  return {
    trigger: 'item',
    formatter: (params) => {
      const xValue = params.value[0];
      const yValue = params.value[1];
      const name = params.data.name || params.name;
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 220px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${name}
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">${xKey}:</span>
        <span style="font-weight: 600; color: #111827;">
          ${typeof xValue === 'number' ? xValue.toLocaleString() : xValue}
        </span>
      </div>`;
      
      tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span style="color: #6b7280;">${yKey}:</span>
        <span style="font-weight: 600; color: #111827;">
          ${typeof yValue === 'number' ? yValue.toLocaleString() : yValue}
        </span>
      </div>`;
      
      if (statistics && statistics[xKey] && statistics[yKey]) {
        const xMean = statistics[xKey].mean;
        const yMean = statistics[yKey].mean;
        
        let quadrant = '';
        if (xValue >= xMean && yValue >= yMean) {
          quadrant = 'High X, High Y';
        } else if (xValue < xMean && yValue >= yMean) {
          quadrant = 'Low X, High Y';
        } else if (xValue < xMean && yValue < yMean) {
          quadrant = 'Low X, Low Y';
        } else {
          quadrant = 'High X, Low Y';
        }
        
        tooltip += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Quadrant:</div>
          <div style="font-size: 12px; color: #6366f1; font-weight: 500;">${quadrant}</div>
        </div>`;
      }
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}

/**
 * Create Multi-Series Bar Chart Tooltip
 * Compares multiple measures side by side
 */
export function createMultiSeriesBarTooltip(statistics, measures, data, fullLabels) {
  return {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params) => {
      const paramsArray = Array.isArray(params) ? params : [params];
      const firstParam = paramsArray[0];
      const dataIndex = firstParam.dataIndex;
      const categoryName = fullLabels ? fullLabels[dataIndex] : firstParam.name;
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 240px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${categoryName}
      </div>`;
      
      const totalValue = paramsArray.reduce((sum, param) => sum + (param.value || 0), 0);
      
      paramsArray.forEach((param, idx) => {
        const value = param.value;
        const seriesName = param.seriesName || measures[idx] || 'Value';
        const measureKey = param.seriesName || measures[idx];
        const percentOfCategory = ((value / totalValue) * 100).toFixed(1);
        
        tooltip += `<div style="margin: 8px 0; ${idx > 0 ? 'padding-top: 8px; border-top: 1px solid #f3f4f6;' : ''}">`;
        
        tooltip += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="color: #374151;">
            ${param.marker} ${seriesName}:
          </span>
          <span style="font-weight: 600; margin-left: 16px; color: #111827;">
            ${value.toLocaleString()}
          </span>
        </div>`;
        
        tooltip += `<div style="display: flex; justify-content: space-between; font-size: 11px; margin-left: 20px;">
          <span style="color: #9ca3af;">% of total:</span>
          <span style="color: #6b7280;">${percentOfCategory}%</span>
        </div>`;
        
        if (statistics && measureKey && statistics[measureKey]) {
          const stats = statistics[measureKey];
          if (stats.mean !== undefined && stats.mean !== 0) {
            const vsAvg = ((value - stats.mean) / stats.mean * 100).toFixed(0);
            const trend = value >= stats.mean ? '↑' : '↓';
            const color = value >= stats.mean ? '#22c55e' : '#ef4444';
            
            tooltip += `<div style="font-size: 11px; color: ${color}; margin-left: 20px;">
              ${trend} ${Math.abs(vsAvg)}% vs avg
            </div>`;
          }
        }
        
        tooltip += `</div>`;
      });
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}

/**
 * Create Grouped Bar Tooltip
 * Similar to multi-series but with different context
 */
export function createGroupedBarTooltip(statistics, measures, categories, fullLabels) {
  return {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params) => {
      const paramsArray = Array.isArray(params) ? params : [params];
      const firstParam = paramsArray[0];
      const categoryIndex = firstParam.dataIndex;
      const categoryName = fullLabels ? fullLabels[categoryIndex] : categories[categoryIndex];
      
      let tooltip = `<div style="padding: 12px; font-family: system-ui; min-width: 220px;">`;
      
      tooltip += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">
        ${categoryName}
      </div>`;
      
      paramsArray.forEach((param, idx) => {
        const value = param.value;
        const seriesName = param.seriesName || measures[idx] || 'Value';
        
        tooltip += `<div style="display: flex; justify-content: space-between; margin: 6px 0;">
          <span style="color: #374151;">
            ${param.marker} ${seriesName}:
          </span>
          <span style="font-weight: 600; margin-left: 16px; color: #111827;">
            ${value.toLocaleString()}
          </span>
        </div>`;
      });
      
      tooltip += `</div>`;
      return tooltip;
    }
  };
}
