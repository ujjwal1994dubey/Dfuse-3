import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, ReactFlowProvider, useStore, useReactFlow } from 'react-flow-renderer';
import Plot from 'react-plotly.js';
import EChartsWrapper from './charts/EChartsWrapper';
import CanvasAdapter from './components/canvas/CanvasAdapter';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Button, Badge, Card, CardHeader, CardContent, FileUpload, RadioGroup, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui';
import { MoveUpRight, Type, SquareSigma, Merge, X, ChartColumn, Funnel, SquaresExclude, Menu, BarChart, Table, Send, File, Sparkles, PieChart, Circle, TrendingUp, BarChart2, Settings, Check, Eye, EyeOff, Edit, GitBranch, AlignStartVertical, MenuIcon, Upload, Calculator, ArrowRight, Download, Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, BookOpen, ArrowRightToLine, CirclePlus, StickyNote } from 'lucide-react';
import { marked } from 'marked';
import './tiptap-styles.css';
import { ECHARTS_TYPES, getEChartsSupportedTypes, getEChartsDefaultType } from './charts/echartsRegistry';

// Backend API endpoint URL
//const API = 'http://localhost:8000';
// Replace line 13 with:
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// MIGRATION: Feature flags for testing ECharts vs Plotly and TLDraw vs React Flow
const USE_ECHARTS = process.env.REACT_APP_USE_ECHARTS === 'true';
const USE_TLDRAW = process.env.REACT_APP_USE_TLDRAW === 'true';

// Log configuration on app start
console.log('🎨 Canvas Configuration:', {
  chartLibrary: USE_ECHARTS ? 'ECharts' : 'Plotly',
  canvasLibrary: USE_TLDRAW ? 'TLDraw' : 'React Flow'
});

/**
 * Chart Figure Cache - Performance Optimization
 * Cache computed Plotly figures to prevent unnecessary re-computation
 */
const chartFigureCache = new Map();
const CACHE_MAX_SIZE = 100; // Prevent memory leaks

function getCachedFigure(cacheKey, computeFn) {
  if (chartFigureCache.has(cacheKey)) {
    return chartFigureCache.get(cacheKey);
  }
  
  const figure = computeFn();
  
  // Simple LRU eviction if cache gets too large
  if (chartFigureCache.size >= CACHE_MAX_SIZE) {
    const firstKey = chartFigureCache.keys().next().value;
    chartFigureCache.delete(firstKey);
  }
  
  chartFigureCache.set(cacheKey, figure);
  return figure;
}

function clearChartCache() {
  chartFigureCache.clear();
}

/**
 * Debounce utility for performance optimization
 * Prevents excessive function calls during rapid user interactions
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle utility for performance optimization
 * Limits function execution rate during continuous events like resize/drag
 */
function throttle(func, wait) {
  let timeout;
  let lastRan;
  return function executedFunction(...args) {
    const context = this;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if ((Date.now() - lastRan) >= wait) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, wait - (Date.now() - lastRan));
    }
  };
}

/**
 * Text Truncation Utility for Chart Labels
 * Truncates long text strings with ellipses to prevent overflow in charts
 * @param {string|number} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation (default: 20)
 * @returns {string} Truncated text with ellipses if needed
 */
function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

/**
 * Data Type Mapping Utility
 * Converts Python data types to human-readable labels for UI display
 * @param {string} dtype - The Python data type string (e.g., 'int64', 'object')
 * @returns {string} Human-readable data type label
 */
function getReadableDataType(dtype) {
  const typeMap = {
    // Text/String types
    'object': 'dimension',
    'string': 'text',
    'category': 'category',
    
    // Integer types
    'int64': 'integer',
    'int32': 'integer',
    'int': 'integer',
    
    // Float/Decimal types
    'float64': 'decimal',
    'float32': 'decimal',
    'float': 'decimal',
    
    // Boolean
    'bool': 'boolean',
    
    // Date/Time
    'datetime64': 'date',
    'timedelta': 'duration'
  };
  
  // Check for datetime variants (e.g., datetime64[ns])
  if (dtype.startsWith('datetime')) return 'date';
  if (dtype.startsWith('timedelta')) return 'duration';
  
  return typeMap[dtype] || dtype;
}

/**
 * Data Sampling Utility for Performance Optimization
 * Samples large datasets to improve rendering performance with Plotly
 * @param {Array} data - Array of Plotly trace objects
 * @param {number} maxPoints - Maximum number of points to render per trace
 * @returns {Array} Sampled data with original length stored
 */
function sampleData(data, maxPoints = 1000) {
  if (!Array.isArray(data) || data.length === 0) return data;
  
  return data.map(trace => {
    if (!trace.x || !Array.isArray(trace.x) || trace.x.length <= maxPoints) {
      return trace; // No sampling needed
    }
    
    // Sample evenly across the dataset
    const step = Math.ceil(trace.x.length / maxPoints);
    const sampledX = [];
    const sampledY = [];
    const sampledText = trace.text ? [] : undefined;
    const sampledMarker = trace.marker ? { ...trace.marker } : undefined;
    
    for (let i = 0; i < trace.x.length; i += step) {
      sampledX.push(trace.x[i]);
      if (trace.y) sampledY.push(trace.y[i]);
      if (trace.text) sampledText.push(trace.text[i]);
    }
    
    return {
      ...trace,
      x: sampledX,
      y: sampledY,
      text: sampledText,
      marker: sampledMarker,
      _fullDataLength: trace.x.length, // Store original length for reference
      _sampled: true
    };
  });
}

/**
 * Viewport Visibility Utilities - Performance Optimization
 * Calculate if nodes are visible within current viewport to optimize rendering
 */
function isNodeVisible(node, viewport, buffer = 200) {
  const { x: viewX, y: viewY, zoom } = viewport;
  const viewWidth = window.innerWidth / zoom;
  const viewHeight = window.innerHeight / zoom;
  
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const nodeWidth = node.data.width || 300;
  const nodeHeight = node.data.height || 200;
  
  // Calculate viewport bounds with buffer
  const viewLeft = -viewX / zoom - buffer;
  const viewTop = -viewY / zoom - buffer;
  const viewRight = viewLeft + viewWidth + buffer * 2;
  const viewBottom = viewTop + viewHeight + buffer * 2;
  
  // Check if node intersects with viewport
  return !(
    nodeX + nodeWidth < viewLeft ||
    nodeX > viewRight ||
    nodeY + nodeHeight < viewTop ||
    nodeY > viewBottom
  );
}

/**
 * Default Chart Colors
 * Simple, clean color scheme for consistent chart styling
 */
const DEFAULT_COLORS = {
  categorical: ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF'],
  quantitative: ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
  comparative: ['#2563EB', '#F97316'],
  sequential: [
    [0, '#EFF6FF'], [0.2, '#DBEAFE'], [0.4, '#93C5FD'], 
    [0.6, '#60A5FA'], [0.8, '#3B82F6'], [1, '#2563EB']
  ]
};

/**
 * Default Layout Configuration
 */
const DEFAULT_LAYOUT = {
  paper_bgcolor: 'white',
  plot_bgcolor: 'white',
  gridcolor: '#E5E7EB',
  zerolinecolor: '#D1D5DB',
  font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#4B5563' },
  margin: { l: 80, r: 30, t: 40, b: 80 }
};

/**
 * Chart Types Registry
 * Defines all supported chart types and their capabilities including:
 * - Chart type metadata (id, label, icon)
 * - Compatibility rules based on dimensions and measures
 * - Figure generation logic for each chart type
 * 
 * Supported types: Bar, Pie, Scatter, Line, Multi-Bar, Histogram
 */
const CHART_TYPES = {
  BAR: {
    id: 'bar',
    label: 'Bar Chart',
    icon: BarChart,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createFigure: (data, payload) => {
      const xKey = payload.dimensions[0];
      const yKey = payload.measures[0];
      const xValues = data.map(r => r[xKey]);
      return {
        data: [{
          type: 'bar',
          x: xValues.map(v => truncateText(v)),
          y: data.map(r => r[yKey] || 0),
          text: xValues.map(v => String(v)), // Full text for hover
          textposition: 'none', // Don't show text on bars, only in hover
          hovertemplate: '%{text}<br>%{y}<extra></extra>',
          marker: { color: DEFAULT_COLORS.categorical[0] }
        }],
        layout: {
          ...DEFAULT_LAYOUT,
          xaxis: {
            title: { text: xKey, font: { size: 12, color: '#4B5563' } },
            tickangle: -45,
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          yaxis: {
            title: { text: yKey || 'Value', font: { size: 12, color: '#4B5563' } },
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          showlegend: false,
          legend: undefined
        }
      };
    }
  },
  PIE: {
    id: 'pie',
    label: 'Pie Chart',
    icon: PieChart,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createFigure: (data, payload) => {
      const labelKey = payload.dimensions[0];
      const valueKey = payload.measures[0];
      const labels = data.map(r => r[labelKey]);
      return {
        data: [{
          type: 'pie',
          labels: labels.map(l => truncateText(l)),
          values: data.map(r => r[valueKey] || 0),
          text: labels.map(l => String(l)), // Full text for hover
          hovertemplate: '%{text}<br>%{value}<extra></extra>',
          hole: 0.3,
          marker: {
            colors: DEFAULT_COLORS.categorical.slice(0, data.length)
          }
        }],
        layout: {
          ...DEFAULT_LAYOUT,
          showlegend: true,
          legend: { 
            bgcolor: 'rgba(255,255,255,0.9)',
            bordercolor: '#E5E7EB',
            borderwidth: 1,
            font: { size: 11, color: '#6B7280' },
            orientation: 'v', 
            x: 1.05, 
            y: 0.5 
          }
        }
      };
    }
  },
  SCATTER: {
    id: 'scatter',
    label: 'Scatter Plot',
    icon: Circle,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createFigure: (data, payload) => {
      const labelKey = payload.dimensions[0];
      const xKey = payload.measures[0];
      const yKey = payload.measures[1];
      const labels = data.map(r => r[labelKey]);
      return {
        data: [{
          type: 'scatter',
          mode: 'markers',
          x: data.map(r => r[xKey] || 0),
          y: data.map(r => r[yKey] || 0),
          text: labels.map(l => String(l)), // Full text for hover
          marker: { 
            size: 10, 
            color: DEFAULT_COLORS.quantitative[0],
            opacity: 0.7,
            line: { color: 'white', width: 1 }
          },
          hovertemplate: '<b>%{text}</b><br>' +
                         `${xKey}: %{x}<br>` +
                         `${yKey}: %{y}<br>` +
                         '<extra></extra>'
        }],
        layout: {
          ...DEFAULT_LAYOUT,
          xaxis: {
            title: { text: xKey, font: { size: 12, color: '#4B5563' } },
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          yaxis: {
            title: { text: yKey, font: { size: 12, color: '#4B5563' } },
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          }
        }
      };
    }
  },
  // 3-Variable Chart Types (2 Measures + 1 Dimension)
  GROUPED_BAR: {
    id: 'grouped_bar',
    label: 'Grouped Bar',
    icon: BarChart,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createFigure: (data, payload) => {
      const xKey = payload.dimensions[0];
      const measureKeys = payload.measures;
      const xValues = [...new Set(data.map(r => r[xKey]))];
      
      return {
        data: measureKeys.map((measure, i) => ({
          type: 'bar',
          name: truncateText(measure), // Truncate long legend labels
          x: xValues.map(v => truncateText(v)), // Truncate x-axis labels
          y: xValues.map(v => (data.find(r => r[xKey] === v)?.[measure]) ?? 0),
          text: xValues.map(v => String(v)), // Full text for hover
          textposition: 'none', // Don't show text on bars, only in hover
          hovertemplate: '%{text}<br>%{y}<extra></extra>',
          marker: { color: DEFAULT_COLORS.comparative[i % DEFAULT_COLORS.comparative.length] }
        })),
        layout: {
          ...DEFAULT_LAYOUT,
          barmode: 'group',
          xaxis: {
            title: { text: xKey, font: { size: 12, color: '#4B5563' } },
            tickangle: -45,
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          yaxis: {
            title: { text: 'Value', font: { size: 12, color: '#4B5563' } },
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          margin: { ...DEFAULT_LAYOUT.margin, b: 140 }, // Keep bottom margin for legend
          showlegend: measureKeys.length > 1,
          legend: measureKeys.length > 1 ? {
            bgcolor: 'rgba(255,255,255,0.9)',
            bordercolor: '#E5E7EB',
            borderwidth: 1,
            font: { size: 11, color: '#6B7280' },
            orientation: 'h',
            x: 0.5,
            xanchor: 'center',
            y: -0.3,
            yanchor: 'top'
          } : undefined
        }
      };
    }
  },
  DUAL_AXIS: {
    id: 'dual_axis',
    label: 'Dual Axis',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createFigure: (data, payload) => {
      const xKey = payload.dimensions[0];
      const [m1, m2] = payload.measures;
      const xValues = [...new Set(data.map(r => r[xKey]))];
      const m1Values = xValues.map(v => (data.find(r => r[xKey] === v)?.[m1]) ?? 0);
      const m2Values = xValues.map(v => (data.find(r => r[xKey] === v)?.[m2]) ?? 0);
      
      return {
        data: [
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: m1,
            x: xValues.map(v => truncateText(v)),
            y: m1Values,
            text: xValues.map(v => String(v)), // Full text for hover
            hovertemplate: '%{text}<br>%{y}<extra></extra>',
            yaxis: 'y',
            line: { color: '#3182ce', width: 3 },
            marker: { color: '#3182ce', size: 8 }
          },
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: m2,
            x: xValues.map(v => truncateText(v)),
            y: m2Values,
            text: xValues.map(v => String(v)), // Full text for hover
            hovertemplate: '%{text}<br>%{y}<extra></extra>',
            yaxis: 'y2',
            line: { color: '#38a169', width: 3 },
            marker: { color: '#38a169', size: 8 }
          }
        ],
        layout: {
          xaxis: {
            title: { text: xKey, font: { size: 14, color: '#4a5568' } },
            tickangle: -45
          },
          yaxis: {
            title: { text: m1, font: { size: 14, color: '#3182ce' } },
            side: 'left'
          },
          yaxis2: {
            title: { text: m2, font: { size: 14, color: '#38a169' } },
            side: 'right',
            overlaying: 'y'
          },
          margin: { t: 20, b: 80, l: 80, r: 80 },
          plot_bgcolor: 'white',
          paper_bgcolor: 'white',
          showlegend: true,
          legend: {
            orientation: 'h',
            x: 0.5,
            xanchor: 'center',
            y: -0.15,
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E8F0',
            borderwidth: 1
          }
        }
      };
    }
  },
  // 3-Variable Chart Types (2 Dimensions + 1 Measure) - HEATMAP REMOVED
  STACKED_BAR: {
    id: 'stacked_bar',
    label: 'Stacked Bar',
    icon: BarChart2,
    isSupported: (dims, measures) => dims === 2 && measures === 1,
    createFigure: (data, payload) => {
      const [dim1, dim2] = payload.dimensions;
      const measure = payload.measures[0];
      
      // Safety check for empty data
      if (!data || data.length === 0) {
        console.warn('STACKED_BAR: No data provided');
        return { 
          data: [], 
          layout: sanitizeLayout({
            xaxis: { title: { text: dim1 } },
            yaxis: { title: { text: measure } },
            showlegend: false,
            legend: undefined
          }) 
        };
      }
      
      // Simple row-based data handling only
      const groups = {};
      data.forEach(row => {
        const dim1Value = row[dim1];    // First dimension value
        const dim2Value = row[dim2];    // Second dimension value
        const value = row[measure] || 0; // Measure value
        
        if (dim1Value && dim2Value) { // Ensure valid values
          if (!groups[dim2Value]) groups[dim2Value] = {};
          groups[dim2Value][dim1Value] = value;
        }
      });
      
      const uniqueDim2Values = [...new Set(data.map(r => r[dim2]))];
      const uniqueDim1Values = [...new Set(data.map(r => r[dim1]))];
      
      const chartData = uniqueDim2Values.map((dim2Value, i) => ({
        type: 'bar',
        name: truncateText(dim2Value), // Truncate long legend labels
        x: uniqueDim1Values.map(dim1Val => truncateText(dim1Val)), // Truncate x-axis labels
        y: uniqueDim1Values.map(dim1Val => groups[dim2Value]?.[dim1Val] || 0),
        customdata: uniqueDim1Values.map(dim1Val => [String(dim1Val), String(dim2Value)]), // Store both dimension values
        textposition: 'none', // Don't show text on bars, only in hover
        hovertemplate: `<b>${dim1}: %{customdata[0]}</b><br>${dim2}: %{customdata[1]}<br>${measure}: %{y}<extra></extra>`,
        marker: { color: ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#dd6b20', '#38b2ac', '#ed64a6'][i % 8] }
      }));
      
      // Safety check for empty chart data
      if (chartData.length === 0) {
        console.warn('STACKED_BAR: No chart data generated');
        return { 
          data: [{ type: 'bar', x: [], y: [] }], 
          layout: sanitizeLayout({ 
            title: { text: 'No data available' },
            xaxis: { title: { text: dim1 } },
            yaxis: { title: { text: measure } },
            showlegend: false,
            legend: undefined
          })
        };
      }
      
      return {
        data: chartData,
        layout: sanitizeLayout({
          barmode: 'stack',
          xaxis: {
            title: { text: dim1, font: { size: 14, color: '#4a5568' } },
            tickangle: -45
          },
          yaxis: {
            title: { text: measure, font: { size: 14, color: '#4a5568' } }
          },
          margin: { t: 20, b: 140, l: 80, r: 30 }, // Keep normal right margin
          plot_bgcolor: 'white',
          paper_bgcolor: 'white',
          showlegend: chartData.length > 1,
          legend: chartData.length > 1 ? {
            orientation: 'h',
            x: 0.5,
            xanchor: 'center',
            y: -0.3, // Moved further down to avoid overlap
            yanchor: 'top',
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E8F0',
            borderwidth: 1,
            font: { size: 11 },
            tracegroupgap: 5, // Add gap between legend groups
            itemsizing: 'constant',
            itemwidth: 30,
            // Add responsive behavior for many legend items
            ...(chartData.length > 10 ? {
              orientation: 'v', // Switch to vertical for many items
              x: 1.05, // Closer to chart to avoid excessive gap
              xanchor: 'left',
              y: 0.5,
              yanchor: 'middle',
              itemwidth: 30, // Reduced item width
              font: { size: 10 }, // Smaller font
              borderwidth: 0, // Remove border to save space
              tracegroupgap: 2 // Reduced gap between items
            } : {})
          } : undefined
        })
      };
    }
  },
  BUBBLE: {
    id: 'bubble',
    label: 'Bubble Chart',
    icon: Circle,
    isSupported: (dims, measures) => dims === 2 && measures === 1,
    createFigure: (data, payload) => {
      const [dim1, dim2] = payload.dimensions;
      const measure = payload.measures[0];
      
      // Simple row-based data handling only
      const validData = data.filter(r => r[measure] && r[measure] > 0);
      const maxValue = Math.max(...validData.map(r => r[measure]));
      
      return {
        data: [{
          type: 'scatter',
          mode: 'markers',
          x: validData.map(r => truncateText(r[dim2])), // Truncate x-axis labels
          y: validData.map(r => truncateText(r[dim1])), // Truncate y-axis labels
          text: validData.map(r => `${dim1}: ${r[dim1]}<br>${dim2}: ${r[dim2]}<br>${measure}: ${r[measure]}`),
          marker: {
            size: validData.map(r => Math.max(8, Math.sqrt(r[measure] / maxValue * 2000) + 5)),
            color: validData.map(r => r[measure]),
            colorscale: DEFAULT_COLORS.sequential,
            colorbar: { 
              title: { 
                text: measure, 
                side: 'right',
                font: { color: '#4B5563' }
              },
              thickness: 15,
              tickfont: { color: '#4B5563' }
            },
            opacity: 0.8,
            line: { 
              color: 'white', 
              width: 2 
            }
          },
          hovertemplate: '%{text}<extra></extra>'
        }],
        layout: {
          ...DEFAULT_LAYOUT,
          xaxis: {
            title: { text: dim2, font: { size: 12, color: '#4B5563' } },
            type: 'category',
            tickangle: -45,
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          yaxis: {
            title: { text: dim1, font: { size: 12, color: '#4B5563' } },
            type: 'category',
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          margin: { ...DEFAULT_LAYOUT.margin, l: 100, r: 120 },
          showlegend: false,
          legend: undefined
        }
      };
    }
  },
  LINE: {
    id: 'line',
    label: 'Line Chart',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createFigure: (data, payload) => {
      const xKey = payload.dimensions[0];
      const yKey = payload.measures[0];
      const lineColor = DEFAULT_COLORS.quantitative[0];
      const xValues = data.map(r => r[xKey]);
      return {
        data: [{
          type: 'scatter',
          mode: 'lines+markers',
          x: xValues.map(v => truncateText(v)),
          y: data.map(r => r[yKey] || 0),
          text: xValues.map(v => String(v)), // Full text for hover
          hovertemplate: '%{text}<br>%{y}<extra></extra>',
          line: { color: lineColor, width: 3 },
          marker: { color: lineColor, size: 6 }
        }],
        layout: {
          ...DEFAULT_LAYOUT,
          xaxis: {
            title: { text: xKey, font: { size: 12, color: '#4B5563' } },
            tickangle: -45,
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          yaxis: {
            title: { text: yKey || 'Value', font: { size: 12, color: '#4B5563' } },
            gridcolor: DEFAULT_LAYOUT.gridcolor,
            zerolinecolor: DEFAULT_LAYOUT.zerolinecolor
          },
          showlegend: false,
          legend: undefined
        }
      };
    }
  }
};

// Helper function to get supported chart types for given dimensions and measures
const getSupportedChartTypes = (dims, measures) => {
  return Object.values(CHART_TYPES).filter(chartType => 
    chartType.isSupported(dims, measures)
  );
};

// Helper function to get default chart type for dimensions and measures
const getDefaultChartType = (dims, measures) => {
  const supported = getSupportedChartTypes(dims, measures);
  return supported.length > 0 ? supported[0] : CHART_TYPES.BAR;
};

// Helper function to truncate long legend labels
const truncateLabel = (label, maxLength = 12) => {
  if (!label || typeof label !== 'string') return label;
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 3) + '...';
};

// Universal layout sanitizer to ensure all layouts have proper legend configuration and modebar spacing
const sanitizeLayout = (layout) => {
  // Safety check for null/undefined layout
  if (!layout || typeof layout !== 'object') {
    return {
      ...DEFAULT_LAYOUT,
      title: { text: 'Chart' },
      showlegend: false,
      legend: {
        bgcolor: 'rgba(255,255,255,0.9)',
        bordercolor: '#E5E7EB',
        borderwidth: 1,
        font: { size: 11, color: '#6B7280' }
      }
    };
  }
  
  const currentMargin = layout.margin || {};
  return {
    ...DEFAULT_LAYOUT,
    ...layout,
    // Ensure legend is always properly defined - NEVER undefined to prevent scroll errors
    showlegend: layout.showlegend !== undefined ? layout.showlegend : false,
    legend: {
      bgcolor: 'rgba(255,255,255,0.9)',
      bordercolor: '#E5E7EB',
      borderwidth: 1,
      font: { size: 11, color: '#6B7280' },
      ...(layout.legend || {})
    },
    // Apply default axis styling if not explicitly set
    xaxis: {
      gridcolor: DEFAULT_LAYOUT.gridcolor,
      zerolinecolor: DEFAULT_LAYOUT.zerolinecolor,
      ...layout.xaxis
    },
    yaxis: {
      gridcolor: DEFAULT_LAYOUT.gridcolor,
      zerolinecolor: DEFAULT_LAYOUT.zerolinecolor,
      ...layout.yaxis
    },
    // Ensure sufficient top margin for modebar (minimum 50px)
    // Preserve existing margins (especially bottom and right margins for legends)
    margin: {
      t: Math.max(currentMargin.t || DEFAULT_LAYOUT.margin.t || 40, 50),
      b: Math.max(currentMargin.b || DEFAULT_LAYOUT.margin.b || 80, currentMargin.b), 
      l: currentMargin.l || DEFAULT_LAYOUT.margin.l || 80, 
      r: Math.max(currentMargin.r || DEFAULT_LAYOUT.margin.r || 30, currentMargin.r), 
      ...currentMargin
    }
  };
};

// For now, let's use a simple approach without custom extensions
// We'll implement autocomplete manually using a simple input approach

/**
 * ArrowNode Component
 * Renders a visual arrow/connector node on the canvas with customizable text label.
 * Used to show relationships or flows between different elements.
 * 
 * @param {Object} data - Contains label text and styling information
 */
const ArrowNode = React.memo(function ArrowNode({ data }) {
  const { id, start, end } = data;

  // Compute local coordinates inside a bbox anchored at (minX, minY)
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const sx = start.x - minX;
  const sy = start.y - minY;
  const ex = end.x - minX;
  const ey = end.y - minY;
  const width = Math.max(sx, ex) + 20;
  const height = Math.max(sy, ey) + 20;

  return (
    <svg width={width} height={height} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <marker id={`arrow-head-${id}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
          <path d="M0,0 L12,6 L0,12 Z" fill="#2563eb" />
        </marker>
      </defs>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#2563eb" strokeWidth="3" markerEnd={`url(#arrow-head-${id})`} />
    </svg>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for ArrowNode performance optimization
  return (
    prevProps.data.id === nextProps.data.id &&
    JSON.stringify(prevProps.data.start) === JSON.stringify(nextProps.data.start) &&
    JSON.stringify(prevProps.data.end) === JSON.stringify(nextProps.data.end)
  );
});

/**
 * TableNode Component
 * Displays tabular data in a compact, scrollable table format on the canvas.
 * Shows column headers and data rows with zebra striping for readability.
 * 
 * @param {Object} data - Contains table data, column names, and title
 */
const TableNode = React.memo(function TableNode({ data }) {
  const { title, headers, rows, totalRows } = data;
  
  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-gray-800">{title}</div>
          <Badge variant="secondary">
            {totalRows} rows
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="border rounded-lg" style={{ height: '384px', overflowY: 'scroll' }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {headers?.map((header, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, i) => (
                <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-25'} hover:bg-blue-50`}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 border-b text-gray-600">
                      {typeof cell === 'number' ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {(!rows || rows.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for TableNode performance optimization
  return (
    prevProps.data.title === nextProps.data.title &&
    JSON.stringify(prevProps.data.headers) === JSON.stringify(nextProps.data.headers) &&
    JSON.stringify(prevProps.data.rows) === JSON.stringify(nextProps.data.rows) &&
    prevProps.data.totalRows === nextProps.data.totalRows
  );
});

/**
 * TextBoxNode Component
 * A rich text editor node using Tiptap that allows users to create and edit
 * formatted notes directly on the canvas. Supports bold, italic, lists, and headings.
 * 
 * @param {Object} data - Contains initial HTML content for the textbox
 * @param {string} id - Unique identifier for this text node
 * @param {boolean} selected - Whether this node is currently selected
 */
const TextBoxNode = React.memo(function TextBoxNode({ data, id, selected }) {
  const [isEditing, setIsEditing] = useState(data.isNew || false);
  const [text, setText] = useState(data.text || '');
  const [tempText, setTempText] = useState(text);
  const [textHeight, setTextHeight] = useState(220); // Dynamic height
  const textareaRef = useRef(null);
  const displayRef = useRef(null);
  
  const handleClick = (e) => {
    e.stopPropagation();
    if (!isEditing) {
      // Single click selects the node
      data.onSelect?.(id);
    }
  };
  
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (!isEditing) {
    setIsEditing(true);
    setTempText(text);
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setText(tempText);
      setIsEditing(false);
      // Update node data
      data.onTextChange?.(id, tempText);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setTempText(text);
    }
  };
  
  const handleBlur = () => {
    setText(tempText);
    setIsEditing(false);
    data.onTextChange?.(id, tempText);
  };
  
  // Auto-resize function to adjust height based on content
  const autoResize = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = Math.max(textarea.scrollHeight, 180); // Min 180px
      const newHeight = Math.max(scrollHeight + 40, 220); // Add padding, min 220px
      setTextHeight(newHeight);
      textarea.style.height = `${scrollHeight}px`;
    }
  }, []);
  
  // Auto-focus and show cursor when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end of text
      textareaRef.current.setSelectionRange(tempText.length, tempText.length);
      // Auto-resize on edit start
      autoResize();
    }
  }, [isEditing, autoResize, tempText.length]);
  
  // Calculate height for display text
  useEffect(() => {
    if (!isEditing && displayRef.current && text) {
      const displayHeight = Math.max(displayRef.current.scrollHeight + 40, 220);
      setTextHeight(displayHeight);
    } else if (!text) {
      setTextHeight(220); // Reset to default when empty
    }
  }, [text, isEditing]);
  
  // Dynamic border style based on selection state
  const borderStyle = selected ? 'border-yellow-500' : 'border-yellow-300';
  const shadowStyle = selected ? 'shadow-xl' : 'shadow-lg hover:shadow-xl';
  
  return (
    <div 
      className={`bg-yellow-100 border-2 ${borderStyle} rounded-xl p-4 w-[220px] cursor-pointer ${shadowStyle} transition-all duration-200 relative`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ height: `${textHeight}px`, minHeight: '220px' }}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={tempText}
          onChange={(e) => {
            setTempText(e.target.value);
            // Auto-resize on every change
            setTimeout(autoResize, 0);
          }}
          onKeyDown={handleKeyPress}
          onBlur={handleBlur}
          className="w-full bg-transparent border-none outline-none resize-none font-medium text-gray-800 placeholder-gray-400 leading-relaxed"
          placeholder="Double click to write anything..."
          style={{ 
            height: `${textHeight - 40}px`,
            minHeight: '180px',
            caretColor: '#374151' // Ensure cursor is visible
          }}
        />
      ) : (
        <div 
          ref={displayRef}
          className="w-full overflow-hidden"
          style={{ minHeight: `${textHeight - 40}px` }}
        >
          {text ? (
            <div className="whitespace-pre-wrap font-medium text-gray-800 leading-relaxed">
          {text}
        </div>
          ) : (
            <div className="text-gray-400 font-medium italic leading-relaxed">
              Double click to write anything...
        </div>
      )}
        </div>
      )}
      
      {/* Subtle sticky note corner fold effect */}
      <div className="absolute top-0 right-0 w-8 h-8 bg-yellow-200 opacity-50 rounded-tr-xl"></div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for TextBoxNode performance optimization
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data.text === nextProps.data.text &&
    prevProps.data.isNew === nextProps.data.isNew
  );
});

/**
 * ExpressionNode Component
 * Interactive calculator node that evaluates mathematical expressions in real-time.
 * Supports basic arithmetic, math functions (sin, cos, sqrt, etc.), and variables.
 * Connects to backend AI for complex expression parsing and evaluation.
 * 
 * @param {Object} data - Contains expression and result state
 * @param {string} id - Unique identifier for this expression node
 * @param {string} apiKey - Gemini API key for AI-powered expression evaluation
 * @param {string} selectedModel - Gemini model to use
 * @param {Function} setShowSettings - Opens settings panel if API key is missing
 * @param {Function} updateTokenUsage - Updates token usage metrics
 */
const ExpressionNode = function ExpressionNode({ data, id, apiKey, selectedModel, setShowSettings, updateTokenUsage }) {
  const [expression, setExpression] = useState(data.expression || '');
  const [result, setResult] = useState(data.result || null);
  const [isEditing, setIsEditing] = useState(data.isNew || false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(data.filters || {});
  const [availableMeasures, setAvailableMeasures] = useState([]);
  const [availableDimensions, setAvailableDimensions] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionType, setSuggestionType] = useState(''); // 'measures' or 'aggregations'
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 });
  // const [currentQuery, setCurrentQuery] = useState(''); // Removed unused variable
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const editorContainerRef = useRef(null);
  const editorRef = useRef(null);
  
  // AI Metric Calculation state
  const [aiMode, setAiMode] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  
  // Menu dropdown state
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  
  // Available aggregation methods
  const aggregationMethods = useMemo(() => [
    { name: 'SUM', description: 'Sum of all values' },
    { name: 'AVG', description: 'Average of all values' },
    { name: 'MIN', description: 'Minimum value' },
    { name: 'MAX', description: 'Maximum value' },
    { name: 'COUNT', description: 'Count of records' },
    { name: 'COUNT_DISTINCT', description: 'Count of unique values' },
    { name: 'MEDIAN', description: 'Median value' },
    { name: 'STDDEV', description: 'Standard deviation' }
  ], []);
  
  // Autocomplete helper functions
  const getCursorPosition = useCallback((editor) => {
    if (!editor || !editor.view || !editorContainerRef.current) return null;
    
    try {
      const { state } = editor;
      const { selection } = state;
      const { from } = selection;
      
      // Get the DOM position of the cursor
      const coords = editor.view.coordsAtPos(from);
      const containerRect = editorContainerRef.current.getBoundingClientRect();
      
      // Position dropdown below the cursor, accounting for container padding
      return {
        top: coords.top - containerRect.top + 25, // 25px below cursor
        left: coords.left - containerRect.left
      };
    } catch (error) {
      console.warn('Could not get cursor position:', error);
      // Fallback position if cursor position can't be determined
      return {
        top: 60, // Below the editor area
        left: 20
      };
    }
  }, []);
  
  const checkForAutocompleteTriggers = useCallback((editor) => {
    if (!editor || !editor.view || !isEditing) return;
    
    const { state } = editor;
    const { selection } = state;
    const { from } = selection;
    
    // Get text before cursor (last 50 characters to handle long measure names)
    const textBefore = state.doc.textBetween(Math.max(0, from - 50), from);
    
    // Check for @ trigger (measures)
    const atMatch = textBefore.match(/@([a-zA-Z0-9_]*)$/);

    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      const filteredMeasures = availableMeasures.filter(measure => 
        measure.toLowerCase().includes(query)
      ).map(measure => ({ name: measure, type: 'measure' }));
      
      const position = getCursorPosition(editor);
      if (position) {
        setSuggestions(filteredMeasures);
        setSuggestionType('measures');
        setSuggestionPosition(position);
        // setCurrentQuery(query); // Not needed for functionality
        setSelectedSuggestionIndex(0);
        setShowSuggestions(true);
      }
      return;
    }
    
    // Check for . trigger (aggregations)
    const dotMatch = textBefore.match(/@[a-zA-Z0-9_]+\.([a-zA-Z]*)$/);

    if (dotMatch) {
      const query = dotMatch[1].toLowerCase();
      const filteredAggregations = aggregationMethods.filter(agg => 
        agg.name.toLowerCase().includes(query)
      ).map(agg => ({ name: agg.name, description: agg.description, type: 'aggregation' }));
      
      const position = getCursorPosition(editor);
      if (position) {
        setSuggestions(filteredAggregations);
        setSuggestionType('aggregations');
        setSuggestionPosition(position);
        // setCurrentQuery(query); // Not needed for functionality
        setSelectedSuggestionIndex(0);
        setShowSuggestions(true);
      }
      return;
    }
    
    // Hide suggestions if no triggers
    setShowSuggestions(false);
  }, [availableMeasures, aggregationMethods, getCursorPosition, isEditing]);
  
  const insertSuggestion = useCallback((suggestion) => {
    if (!editorRef.current || !editorRef.current.view || !editorRef.current.commands) return;
    

    try {
      const { state } = editorRef.current;
      const { selection } = state;
      const { from } = selection;
      
      // Get text before cursor to find what to replace
      const textBefore = state.doc.textBetween(Math.max(0, from - 50), from);
      
      let replaceFrom = from;
      let replaceText = suggestion.name;
      
      if (suggestionType === 'measures') {
        // Replace @query with @MeasureName
        const atMatch = textBefore.match(/@([a-zA-Z0-9_]*)$/);
        if (atMatch) {
          replaceFrom = from - atMatch[0].length;
          replaceText = `@${suggestion.name}`;
        } else {
          // Fallback: just replace the @ character if no query found
          const simpleAtMatch = textBefore.match(/@$/);
          if (simpleAtMatch) {
            replaceFrom = from - 1;
            replaceText = `@${suggestion.name}`;
          }
        }
      } else if (suggestionType === 'aggregations') {
        // Replace .query with .AGGREGATION
        const dotMatch = textBefore.match(/\.([a-zA-Z]*)$/);
        if (dotMatch) {
          replaceFrom = from - dotMatch[0].length;
          replaceText = `.${suggestion.name}`;
        } else {
          // Fallback: just replace the . character if no query found
          const simpleDotMatch = textBefore.match(/\.$/);
          if (simpleDotMatch) {
            replaceFrom = from - 1;
            replaceText = `.${suggestion.name}`;
          }
        }
      }
      
      // Replace the text
      editorRef.current.commands.deleteRange({ from: replaceFrom, to: from });
      editorRef.current.commands.insertContent(replaceText);
      
      // Hide suggestions
      setShowSuggestions(false);
    } catch (error) {
      console.warn('Could not insert suggestion:', error);
    }
  }, [suggestionType]);
  
  const handleKeyDown = useCallback((event) => {
    if (!showSuggestions || suggestions.length === 0) return;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();

        if (suggestions[selectedSuggestionIndex]) {
          insertSuggestion(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setShowSuggestions(false);
        break;
      default:
        // No action needed for other keys
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, insertSuggestion]);

  // Add keyboard event listener for autocomplete
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (isEditing && showSuggestions) {
        handleKeyDown(event);
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isEditing, showSuggestions, handleKeyDown]);

  // Hide suggestions when not editing
  useEffect(() => {
    if (!isEditing) {
      setShowSuggestions(false);
    }
  }, [isEditing]);
  
  // Handle expression change from TipTap editor
  const handleExpressionChange = useCallback((newExpression) => {
    setExpression(newExpression);
    if (data.onExpressionChange) {
      data.onExpressionChange(newExpression);
    }
  }, [data]);

  // Simple TipTap editor without custom extensions
  const editor = useEditor({
    extensions: [StarterKit],
    content: expression ? `<p>${expression}</p>` : '<p></p>',
    editable: isEditing,
    onUpdate: ({ editor }) => {
      const content = editor.getText();
      handleExpressionChange(content);
      
      // Check for autocomplete triggers when editing
      if (isEditing) {
        checkForAutocompleteTriggers(editor);
      }
    },
    onCreate: ({ editor }) => {
      // TipTap editor created
      editorRef.current = editor;
      // Ensure editor is properly initialized
      if (isEditing) {
        setTimeout(() => {
          if (editor && editor.view && editor.commands && !editor.isDestroyed) {
            try {
              editor.setEditable(true);
              editor.commands.focus();
            } catch (error) {
              console.warn('Could not focus editor on create:', error);
            }
          }
        }, 100);
      }
    },
    onFocus: () => {
      // TipTap editor focused
    },
  }, [isEditing, checkForAutocompleteTriggers]);

  // Update editor content when expression changes externally
  useEffect(() => {
    if (editor && editor.view && editor.commands && !editor.isDestroyed) {
      try {
        const currentText = editor.getText();
        if (expression !== currentText) {
          editor.commands.setContent(expression ? `<p>${expression}</p>` : '<p></p>');
        }
      } catch (error) {
        console.warn('Could not update editor content:', error);
      }
    }
  }, [editor, expression]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current && !editorRef.current.isDestroyed) {
        try {
          editorRef.current.destroy();
        } catch (error) {
          console.warn('Could not destroy editor:', error);
        }
      }
    };
  }, []);

  // Fetch available measures and dimensions
  useEffect(() => {
    if (data.datasetId) {
      // Fetching measures for dataset
      fetch(`${API}/dataset/${data.datasetId}/measures`)
        .then(res => res.json())
        .then(data => {
          // Received measures data
          const measures = [...new Set(data.measures || [])];
          const dimensions = [...new Set(data.dimensions || [])];
          
          // Unique measures and dimensions
          
          setAvailableMeasures(measures);
          setAvailableDimensions(dimensions);
        })
        .catch(err => console.error('Failed to fetch measures:', err));
    }
  }, [data.datasetId]);

  // Validate expression on change
  useEffect(() => {
    if (expression && data.datasetId) {
      fetch(`${API}/expression/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: data.datasetId,
          expression: expression
        })
      })
      .then(res => res.json())
      .then(validation => {
        setValidationErrors(validation.errors || []);
      })
      .catch(err => console.error('Validation failed:', err));
    }
  }, [expression, data.datasetId]);

  // Evaluate expression
  const evaluateExpression = useCallback(async () => {
    if (!expression || !data.datasetId) return;
    
    try {
      const response = await fetch(`${API}/expression/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: data.datasetId,
          expression: expression,
          filters: filters
        })
      });
      
      if (response.ok) {
        const evalResult = await response.json();
        setResult(evalResult.result);
        data.onExpressionChange?.(id, expression, evalResult.result, filters);
      } else {
        const error = await response.json();
        console.error('Evaluation failed:', error.detail);
        setResult(null);
      }
    } catch (err) {
      console.error('Failed to evaluate expression:', err);
      setResult(null);
    }
  }, [expression, data.datasetId, filters, id, data.onExpressionChange]);

  // Auto-evaluate when expression or filters change
  useEffect(() => {
    if (!isEditing) {
      evaluateExpression();
    }
  }, [expression, filters, isEditing, evaluateExpression]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    setShowSuggestions(false); // Hide autocomplete when saving
    if (editor && editor.view && !editor.isDestroyed) {
      try {
        editor.setEditable(false);
      } catch (error) {
        console.warn('Could not set editor editable state:', error);
      }
    }
  }, [editor]);

  const handleCancel = useCallback(() => {
    setExpression(data.expression || '');
    setIsEditing(false);
    setShowSuggestions(false); // Hide autocomplete when canceling
    if (editor && editor.view && editor.commands && !editor.isDestroyed) {
      try {
        editor.setEditable(false);
        editor.commands.setContent(`<p>${data.expression || ''}</p>`);
      } catch (error) {
        console.warn('Could not cancel editor changes:', error);
      }
    }
  }, [data.expression, editor]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // Use a longer delay to ensure the editor is fully ready
    setTimeout(() => {
      if (editor && editor.view && editor.commands && !editor.isDestroyed) {
        try {
          editor.setEditable(true);
          editor.commands.focus();
          // Force cursor to end of content
          editor.commands.setTextSelection(editor.state.doc.content.size);
        } catch (error) {
          console.warn('Could not focus editor:', error);
        }
      }
    }, 150);
  }, [editor]);

  const toggleFilter = (dimension, value) => {
    setFilters(prev => {
      const current = prev[dimension] || [];
      const updated = current.includes(value) 
        ? current.filter(v => v !== value)
        : [...current, value];
      
      return updated.length > 0 
        ? { ...prev, [dimension]: updated }
        : { ...prev, [dimension]: undefined };
    });
  };

  // AI Metric Calculation Handler
  const handleAIMetricCalculation = useCallback(async () => {
    if (!aiQuery.trim() || !data.datasetId) return;
    
    // Check if API key is configured
    const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
    const currentModel = selectedModel || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    
    if (!currentApiKey.trim()) {
      setAiResult({
        success: false,
        error: '⚠️ Please configure your Gemini API key in Settings first.'
      });
      setShowSettings(true);
      return;
    }
    
    setAiLoading(true);
    try {
      // Calculating AI metric
      
      if (!data.datasetId) {
        throw new Error('No dataset ID available. Please ensure you have uploaded data first.');
      }
      
      const response = await fetch(`${API}/ai-calculate-metric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: aiQuery,
          dataset_id: data.datasetId,
          api_key: currentApiKey,
          model: currentModel
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // AI metric calculated
        
        // Track token usage
        if (result.token_usage) {
          updateTokenUsage(result.token_usage);
        }
        
        // Python code generated by AI and executed
        
        setAiResult(result);
        setResult(result.value);
        
        // If AI suggests a traditional expression, update the expression field
        if (result.traditional_syntax) {
          setExpression(result.traditional_syntax);
        }
        
        // Show success message
        // AI calculation completed
      } else {
        // AI metric calculation failed
        setAiResult(result);
      }
    } catch (error) {
      console.error('Failed to calculate AI metric:', error);
      setAiResult({
        success: false,
        error: `Network error occurred while calculating metric. ${error.message.includes('401') || error.message.includes('403') ? 'Please check your API key in Settings.' : ''}`
      });
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery, data.datasetId, apiKey, selectedModel, updateTokenUsage]);
  
  // Handle AI mode toggle
  const handleAIModeToggle = useCallback(() => {
    setAiMode(!aiMode);
    setAiQuery('');
    setAiResult(null);
    if (!aiMode) {
      // When switching to AI mode, clear any autocomplete
      setShowSuggestions(false);
    }
  }, [aiMode]);

  // Click outside handler to close dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdownMenu && editorContainerRef.current && !editorContainerRef.current.contains(event.target)) {
        setShowDropdownMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdownMenu]);

  return (
    <Card className="min-w-[400px]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-800">Expression</span>
          <div className="flex items-center space-x-3">
            <Button
              onClick={handleAIModeToggle}
              variant={aiMode ? "default" : "ghost"}
              size="icon"
              title={aiMode ? "Switch to Manual Expression" : "Switch to AI Assistant"}
              className={`transition-all duration-200 ${aiMode ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
            >
              <Sparkles size={16} />
            </Button>
            <div className="relative">
            <Button
              onClick={() => setShowDropdownMenu(!showDropdownMenu)}
              variant="ghost"
              size="icon"
              title="Options"
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200"
            >
              <Menu size={16} />
            </Button>
            
            {/* Custom Dropdown Menu */}
            {showDropdownMenu && (
              <div 
                className="absolute right-0 top-8 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                style={{ zIndex: 9999 }}
              >
                <button
                  onClick={() => {
                    isEditing ? handleSave() : handleEdit();
                    setShowDropdownMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center"
                >
                  <Type className="mr-2 h-4 w-4" />
                  {isEditing ? "Save Expression" : "Edit Expression"}
                </button>
                <button
                  onClick={() => {
                    setShowFilters(!showFilters);
                    setShowDropdownMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center"
                >
                  <Funnel className="mr-2 h-4 w-4" />
                  {showFilters ? "Hide Filters" : "Show Filters"}
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
        
        {/* Calculated Metric Pill - Now below the Expression label with 2x font size */}
        {result !== null && (
          <div className="mt-3">
            <Badge 
              variant="outline" 
              className="font-bold px-4 py-2 text-xl"
              style={{ fontSize: '1.5rem' }}
            >
              {typeof result === 'number' ? result.toLocaleString() : result}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="relative" ref={editorContainerRef}>
        <div className="space-y-3">
          {aiMode ? (
            /* AI Natural Language Input */
            <div className="w-full max-w-md">
              <div className="border rounded-lg overflow-hidden bg-blue-50 border-blue-200">
                <div className="p-3" style={{ minHeight: '48px' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium text-blue-800">AI Calculator</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g., 'Calculate total revenue' or 'Profit margin'"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !aiLoading) {
                        handleAIMetricCalculation();
                      }
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={aiLoading}
                  />
                  {aiResult && (
                    <div className="mt-2 text-sm font-medium">
                      {aiResult.success ? (
                        <span className="text-green-700">✅ {aiResult.formatted_value}</span>
                      ) : (
                        <span className="text-red-700">❌ Error</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Calculate button - positioned below AI input, aligned right */}
              <div className="flex justify-end space-x-2 mt-2">
                <Button
                  onClick={handleAIMetricCalculation}
                  disabled={aiLoading || !aiQuery.trim()}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {aiLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Send size={14} className="mr-1" />
                      Calculate
                    </>
                  )}
                </Button>
              </div>
              
              {aiResult && aiResult.success && aiResult.traditional_syntax && (
                <div className="text-xs text-blue-700 bg-blue-100 p-2 rounded mt-2">
                  <strong>Equivalent expression:</strong> {aiResult.traditional_syntax}
                </div>
              )}
            </div>
          ) : (
            /* Traditional Expression Input */
            <div className="w-full max-w-md">
              <div className={`border rounded-lg overflow-hidden ${isEditing ? 'bg-white border-blue-300' : 'bg-gray-50'}`}>
                <div className="p-3 relative" style={{ minHeight: '48px' }}>
                  {editor ? (
                    <div 
                      className={`w-full ${isEditing ? 'cursor-text' : 'pointer-events-none cursor-default'}`}
                      onClick={() => {
                        if (isEditing && editor) {
                          editor.commands.focus();
                        }
                      }}
                    >
                      <EditorContent 
                        editor={editor}
                        className="prose prose-sm max-w-none focus:outline-none w-full"
                        style={{ 
                          minHeight: '24px', 
                          maxHeight: '24px', 
                          lineHeight: '24px',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-gray-400 italic font-mono text-sm leading-6">
                      {expression || 'Click Edit to create an expression...'}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Save/Cancel buttons - positioned below expression input */}
              {isEditing && (
                <div className="flex justify-end space-x-2 mt-2">
                  <Button
                    onClick={handleCancel}
                    variant="secondary"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    size="sm"
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        
        {/* Autocomplete Suggestions Dropdown - Positioned outside editor */}
        {showSuggestions && suggestions.length > 0 && (
          <div 
            className="absolute bg-white border border-gray-300 rounded-lg shadow-xl max-h-80 overflow-y-auto"
            style={{
              top: suggestionPosition.top,
              left: suggestionPosition.left,
              minWidth: '250px',
              maxWidth: '350px',
              zIndex: 9999,
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-2 font-medium">
                {suggestionType === 'measures' ? 'Available Measures' : 'Aggregation Methods'}
              </div>
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.name}
                  className={`px-3 py-2 cursor-pointer rounded-md text-sm transition-colors ${
                    index === selectedSuggestionIndex
                      ? 'bg-blue-100 text-blue-800'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => insertSuggestion(suggestion)}
                >
                  <div className="font-medium">{suggestion.name}</div>
                  {suggestion.description && (
                    <div className="text-xs text-gray-500 mt-1">
                      {suggestion.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 px-3 py-2 bg-gray-50 text-xs text-gray-500">
              ↑↓ Navigate • Enter/Tab Select • Esc Cancel
            </div>
          </div>
        )}
        
        {validationErrors.length > 0 && (
          <div className="text-red-600 text-sm">
            {validationErrors.map((error, i) => (
              <div key={i}>• {error}</div>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2 px-3">
          {aiMode ? (
            <span>Describe what you want to calculate in natural language</span>
          ) : (
            <span>Use @MeasureName.Aggregation syntax (e.g., @Revenue.Sum, @Cost.Avg)</span>
          )}
        </div>
        </div>
      </CardContent>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-t border-gray-200 p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Filters</div>
          <div className="space-y-3">
            {availableDimensions.map(dimension => (
              <FilterDimension
                key={dimension}
                dimension={dimension}
                datasetId={data.datasetId}
                selectedValues={filters[dimension] || []}
                onToggle={(value) => toggleFilter(dimension, value)}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

/**
 * FilterDimension Component
 * Collapsible filter panel for a specific dimension/column in the dataset.
 * Shows all unique values with checkboxes for multi-select filtering.
 * 
 * @param {string} dimension - Name of the dimension to filter
 * @param {string} datasetId - ID of the current dataset
 * @param {Array} selectedValues - Currently selected filter values
 * @param {Function} onToggle - Callback when filter values are toggled
 */
function FilterDimension({ dimension, datasetId, selectedValues, onToggle }) {
  const [values, setValues] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API}/dimension_counts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataset_id: datasetId,
        dimension: dimension
      })
    })
    .then(res => res.json())
    .then(data => {
      setValues(data.labels || []);
    })
    .catch(err => console.error('Failed to fetch dimension values:', err));
  }, [datasetId, dimension]);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-700">{dimension}</span>
        <div className="flex items-center space-x-2">
          {selectedValues.length > 0 && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
              {selectedValues.length}
            </span>
          )}
          <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200 p-3 max-h-48 overflow-y-auto">
          <div className="space-y-2">
            {values.map(value => (
              <label key={value} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(value)}
                  onChange={() => onToggle(value)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{value}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * DataTable Component
 * Generic table component that renders any array of objects as a data table.
 * Used to display raw data, query results, or aggregated data.
 * 
 * @param {Array} data - Array of objects to display as table rows
 */
function DataTable({ data }) {
  if (!data || data.type !== 'table') return null;
  
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            {data.columns.map((col, idx) => (
              <th key={idx} className="border border-gray-300 px-2 py-1 text-left font-medium text-gray-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-gray-50">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="border border-gray-300 px-2 py-1">
                  {cellIdx === row.length - 1 && !isNaN(cell) ? 
                    parseFloat(cell).toLocaleString() : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.title && (
        <p className="text-xs text-gray-500 mt-1 text-center">{data.title}</p>
      )}
    </div>
  );
}

/**
 * ChartTypeSelector Component
 * Dropdown menu that shows available chart type conversions based on current
 * chart's dimensions and measures. Only displays compatible chart types.
 * 
 * @param {Array} dimensions - Current chart's dimension columns
 * @param {Array} measures - Current chart's measure columns
 * @param {string} currentType - Currently selected chart type ID
 * @param {Function} onTypeChange - Callback when chart type is changed
 */
function ChartTypeSelector({ dimensions = [], measures = [], currentType, onTypeChange }) {
  const dims = dimensions.length;
  const meas = measures.length;
  
  const supportedTypes = getSupportedChartTypes(dims, meas);
  
  // Don't show selector if only one chart type is supported
  if (supportedTypes.length <= 1) return null;
  
  return (
    <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
      {supportedTypes.map(type => {
        const IconComponent = type.icon;
        const isActive = currentType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={(e) => {
              e.stopPropagation();
              onTypeChange(type.id);
            }}
            className={`p-1.5 rounded transition-all duration-150 ${
              isActive 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'text-gray-600 hover:bg-white hover:text-gray-800'
            }`}
            title={type.label}
          >
            <IconComponent size={14} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * ChartNode Component
 * The main visualization node that renders Plotly charts on the canvas.
 * Supports multiple chart types, aggregation changes, AI exploration,
 * table view, filtering, and report generation. This is the most complex
 * component handling all chart interactions.
 * 
 * Features:
 * - Chart type switching (bar, pie, scatter, line, etc.)
 * - Aggregation method changes (sum, avg, min, max, count)
 * - AI-powered chart exploration with natural language queries
 * - Chart insight generation with sticky notes
 * - Add to report functionality with LLM-enhanced summaries
 * - Data table view with filtering capabilities
 * - Dimension filtering with multi-select
 * 
 * @param {Object} data - Chart configuration including figure, title, dimensions, measures
 * @param {string} id - Unique identifier for this chart node
 * @param {boolean} selected - Whether this node is currently selected
 * @param {Function} onSelect - Callback when chart is selected
 * @param {string} apiKey - Gemini API key for AI features
 * @param {string} selectedModel - Gemini model to use
 * @param {Function} setShowSettings - Opens settings panel if API key is missing
 * @param {Function} updateTokenUsage - Updates token usage metrics
 * @param {Function} onAddToReport - Callback to add chart to report document
 */
const ChartNode = React.memo(function ChartNode({ data, id, selected, apiKey, selectedModel, setShowSettings, updateTokenUsage, onAddToReport, setReportPanelOpen, onResizeStart, onResizeEnd }) {
  const { title, figure, isFused, strategy, stats, agg, dimensions = [], measures = [], onAggChange, onShowTable, table = [], chartType: externalChartType } = data;
  const [aiLoading, setAiLoading] = useState(false);
  const [insightSticky, setInsightSticky] = useState(null);
  
  // Auto-display preloaded insights for AI-generated charts
  React.useEffect(() => {
    if (data.preloadedInsights && !insightSticky) {
      console.log(`🎯 Auto-displaying preloaded insights for chart ${id}`);
      setInsightSticky(data.preloadedInsights);
    }
  }, [data.preloadedInsights, id]);
  
  // Resize functionality state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [chartDimensions, setChartDimensions] = useState(() => {
    // Initial dimensions based on chart type
    const isDualAxis = strategy === 'same-dimension-different-measures' && title?.includes('(Dual Scale)');
    const isHeatmap = strategy === 'same-dimension-different-dimensions-heatmap';
    const isMultiVariable = dimensions.length >= 1 && measures.length >= 1;
    const isThreeVariable = (dimensions.length >= 2 && measures.length >= 1) || (dimensions.length >= 1 && measures.length >= 2);
    const isFusedWithLegend = isFused && (
      (strategy === 'same-dimension-different-measures') || 
      (strategy === 'same-measure-different-dimensions-stacked')
    );
    
    const hasVerticalLegend = isFused && (
      (strategy === 'same-dimension-different-measures' && measures.length > 8) ||
      (strategy === 'same-measure-different-dimensions-stacked' && dimensions.length > 10)
    );
    
    const width = (isDualAxis || isHeatmap) ? 1000 : 
      isMultiVariable ? (hasVerticalLegend ? 1000 : 760) : 380;
    const height = (isDualAxis || isHeatmap || isThreeVariable) ? (isFusedWithLegend ? 500 : 400) : 300;
    
    return { width, height };
  });
  
  // Throttled dimension setter for performance during resize
  const throttledSetDimensions = useMemo(
    () => throttle((newDims) => {
      setChartDimensions(newDims);
    }, 16), // ~60fps max
    []
  );
  
  // Use ref to prevent state reset during React Flow re-renders
  const plotlyRef = useRef(null);
  const chartContainerRef = useRef(null);
  const plotlyDivRef = useRef(null);
  
  // Chart type switching state
  const defaultChartType = getDefaultChartType(dimensions.length, measures.length);
  const [chartType, setChartType] = useState(externalChartType || defaultChartType.id);
  const [currentFigure, setCurrentFigure] = useState(figure);
  // Only mark as user-changed if there's an explicit external chart type
  const [hasUserChangedType, setHasUserChangedType] = useState(!!externalChartType);
  
  // Sync chart type when changed externally (from Chart Actions panel)
  useEffect(() => {
    if (externalChartType && externalChartType !== chartType) {
      console.log(`Chart ${id}: Syncing external chart type change to ${externalChartType}`);
      setChartType(externalChartType);
      setHasUserChangedType(true);
    }
  }, [externalChartType, chartType, id]);
  
  // Sync currentFigure with figure prop changes, but preserve user's chart type choice
  useEffect(() => {
    if (figure) {
      if (!hasUserChangedType) {
        // No manual chart type change, just use the new figure
        setCurrentFigure(figure);
      } else {
        // User has selected a specific chart type, regenerate that type with new data
        const chartTypeConfig = CHART_TYPES[chartType.toUpperCase()];
        
        // Check if we have data (either array format or heatmap format)
        const hasData = (Array.isArray(table) && table.length > 0) || 
                       (table && typeof table === 'object' && table.x && table.y && table.z);
                       
        if (chartTypeConfig && hasData) {
          const payload = {
            table: table,
            dimensions: dimensions,
            measures: measures,
            strategy: strategy ? { type: strategy } : undefined
          };
          const newFigure = chartTypeConfig.createFigure(Array.isArray(table) ? table : [], payload);
          setCurrentFigure(newFigure);
        } else {
          // Fallback to the provided figure if chart type regeneration fails
          setCurrentFigure(figure);
        }
      }
    }
  }, [figure, chartType, hasUserChangedType, table, dimensions, measures, strategy]);

  // Consolidated cleanup effect - single cleanup on unmount for performance
  useEffect(() => {
    return () => {
      // Single cleanup on unmount using ref for targeted cleanup
      if (plotlyDivRef.current) {
        try {
          const div = plotlyDivRef.current;
          div._hoverlayer = null;
          div._fullLayout = null;
          div._fullData = null;
          div._context = null;
        } catch (e) {
          // Silent fail
        }
      }
      // Cleanup throttled function
      if (throttledSetDimensions.cancel) {
        throttledSetDimensions.cancel();
      }
    };
  }, [throttledSetDimensions]);

  // Resize functionality
  const handleResizeStart = useCallback((handle, e) => {
    // Resize started
    e.preventDefault();
    e.stopPropagation();
    // Safe stopImmediatePropagation - check if method exists
    if (e.stopImmediatePropagation) {
      e.stopImmediatePropagation();
    } else if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
      e.nativeEvent.stopImmediatePropagation();
    }
    
    setIsResizing(true);
    setResizeHandle(handle);
    
    // Disable node dragging by updating the node's draggable property
    if (onResizeStart) {
      // Disabling node dragging
      onResizeStart(id, false);
    }
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = chartDimensions.width;
    const startHeight = chartDimensions.height;
    
    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      // Mouse move tracking
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      
      // Calculate new dimensions based on resize handle
      switch (handle) {
        case 'se': // Southeast corner
          newWidth = startWidth + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'sw': // Southwest corner
          newWidth = startWidth - deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'ne': // Northeast corner
          newWidth = startWidth + deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'nw': // Northwest corner
          newWidth = startWidth - deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'n': // North edge
          newHeight = startHeight - deltaY;
          break;
        case 's': // South edge
          newHeight = startHeight + deltaY;
          break;
        case 'e': // East edge
          newWidth = startWidth + deltaX;
          break;
        case 'w': // West edge
          newWidth = startWidth - deltaX;
          break;
      }
      
      // Apply constraints
      const minWidth = 300;
      const minHeight = 200;
      const maxWidth = 1400;
      const maxHeight = 800;
      
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      
      throttledSetDimensions({ width: newWidth, height: newHeight });
    };
    
    const handleMouseUp = (upEvent) => {
      // Resize ended
      upEvent?.preventDefault();
      upEvent?.stopPropagation();
      
      setIsResizing(false);
      setResizeHandle(null);
      
      // Re-enable node dragging
      if (onResizeEnd) {
        // Re-enabling node dragging
        onResizeEnd(id, true);
      }
      
      // Remove both pointer and mouse event listeners
      document.removeEventListener('pointermove', handleMouseMove, true);
      document.removeEventListener('pointerup', handleMouseUp, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
    
    // Use both pointer and mouse events for maximum compatibility
    document.addEventListener('pointermove', handleMouseMove, true);
    document.addEventListener('pointerup', handleMouseUp, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
  }, [chartDimensions, onResizeStart, onResizeEnd, id, throttledSetDimensions]);

  // Prevent drag when resizing
  useEffect(() => {
    if (isResizing && chartContainerRef.current) {
      // Disable React Flow interactions during resize
      chartContainerRef.current.style.pointerEvents = 'none';
      chartContainerRef.current.setAttribute('data-nopan', 'true');
      document.body.style.userSelect = 'none';
    } else if (chartContainerRef.current) {
      chartContainerRef.current.style.pointerEvents = 'auto';
      chartContainerRef.current.removeAttribute('data-nopan');
      document.body.style.userSelect = '';
    }
    
    return () => {
      // Cleanup on unmount
      document.body.style.userSelect = '';
    };
  }, [isResizing]);
  
  // Chart selection is now handled by the checkbox in the header
  // No need for click-based selection handlers
  
  // Handle chart type changes
  const handleChartTypeChange = useCallback((newChartType) => {
    setChartType(newChartType);
    setHasUserChangedType(true); // Mark that user has manually changed chart type
    
    try {
      // Regenerate figure with new chart type using the chart registry
      const chartTypeConfig = CHART_TYPES[newChartType.toUpperCase()];
      
      // Check if we have data (either array format or heatmap format)
      const hasData = (Array.isArray(table) && table.length > 0) || 
                     (table && typeof table === 'object' && table.x && table.y && table.z);
      
      if (chartTypeConfig && hasData) {
        const payload = {
          table: table,
          dimensions: dimensions,
          measures: measures,
          strategy: strategy ? { type: strategy } : undefined
        };
        
        const newFigure = chartTypeConfig.createFigure(Array.isArray(table) ? table : [], payload);
        
        // Defensively sanitize the new figure before setting
        if (newFigure && newFigure.layout) {
          newFigure.layout = sanitizeLayout(newFigure.layout);
        }
        
        setCurrentFigure(newFigure);
      } else {
        console.warn('Chart type switching failed:', {
          chartType: newChartType,
          hasChartTypeConfig: !!chartTypeConfig,
        tableLength: Array.isArray(table) ? table.length : 0,
        hasHeatmapData: table?.x && table?.y && table?.z,
        dimensions,
        measures
      });
    }
    } catch (error) {
      console.error('Error changing chart type:', error);
      // Fallback: try to keep the current figure stable
      if (currentFigure && currentFigure.layout) {
        const sanitizedFigure = {
          ...currentFigure,
          layout: sanitizeLayout(currentFigure.layout)
        };
        setCurrentFigure(sanitizedFigure);
      }
    }
  }, [table, dimensions, measures, strategy]);
  
  const handleGenerateInsights = async () => {
    if (aiLoading) return;
    
    // Check if API key is configured
    const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
    const currentModel = selectedModel || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    
    if (!currentApiKey.trim()) {
      alert('⚠️ Please configure your Gemini API key in Settings first.');
      setShowSettings(true);
      return;
    }
    
    setAiLoading(true);
    try {
      // Extract user_goal from chart data for context-aware insights
      const userGoal = data.user_goal;
      
      const response = await fetch(`${API}/chart-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          api_key: currentApiKey,
          model: currentModel,
          user_context: userGoal || null  // Pass user's original goal if available
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      const result = await response.json();
      
      // Track token usage
      if (result.token_usage) {
        updateTokenUsage(result.token_usage);
      }
      
      // Show sticky note with insights (supporting both new and legacy formats)
      setInsightSticky({
        contextInsights: result.context_insights || '',
        genericInsights: result.generic_insights || '',
        hasContext: result.has_context || false,
        insight: result.insight,  // Legacy support
        statistics: result.statistics
      });
      
    } catch (error) {
      console.error('Generate insights failed:', error);
      alert(`Failed to generate insights: ${error.message}. ${error.message.includes('401') || error.message.includes('403') ? 'Please check your API key in Settings.' : ''}`);
    } finally {
      setAiLoading(false);
    }
  };
  
  // Calculate plot height (subtract header and padding from total height)
  const plotHeight = Math.max(chartDimensions.height - 80, 200);
  
  // Memoize layout to prevent unnecessary Plotly rerenders
  const memoizedLayout = useMemo(() => 
    sanitizeLayout({
      ...currentFigure.layout,
      width: chartDimensions.width - 40, // Account for padding
      height: plotHeight
    }), 
    [currentFigure.layout, chartDimensions.width, chartDimensions.height, plotHeight]
  );
  
  // Memoize data with sampling to prevent re-processing on non-data changes
  const memoizedData = useMemo(() => 
    sampleData(currentFigure.data || [], 1000),
    [currentFigure.data]
  );
  
  // Determine if chart should use static rendering when not visible
  const isChartVisible = useMemo(() => {
    return selected || !document.hidden;
  }, [selected]);
  
  // Memoize Plotly initialization callback
  const handlePlotlyInit = useCallback((figure, graphDiv) => {
    try {
      if (graphDiv && graphDiv._hoverlayer) {
        graphDiv._hoverlayer.style.pointerEvents = 'auto';
      }
      if (graphDiv && !graphDiv.layout) {
        graphDiv.layout = sanitizeLayout(currentFigure.layout || {});
      }
    } catch (e) {
      console.debug('Plotly init warning:', e);
    }
  }, [currentFigure.layout]);
  
  // Memoize Plotly update callback
  const handlePlotlyUpdate = useCallback((figure, graphDiv) => {
    try {
      if (graphDiv && figure && figure.layout) {
        graphDiv.layout = sanitizeLayout(figure.layout);
      }
    } catch (e) {
      console.debug('Plotly update warning:', e);
    }
  }, []);
  
  const canChangeAgg = Array.isArray(dimensions) && dimensions.length >= 1 && Array.isArray(measures) && measures.length >= 1 && (agg || 'sum') !== 'count' && !isFused;
  
  return (
    <div 
      ref={chartContainerRef}
      className={`bg-white rounded-2xl shadow p-3 border-2 transition-all relative ${
        selected 
          ? 'border-blue-500 bg-blue-50 shadow-lg' 
          : 'border-transparent hover:border-gray-300'
      } ${isFused ? 'ring-2 ring-green-200' : ''} ${isResizing ? 'select-none' : ''}`}
      style={{ 
        width: `${chartDimensions.width}px`, 
        height: `${chartDimensions.height}px`,
        pointerEvents: 'auto'
      }}
      data-nopan={isResizing ? 'true' : undefined}
      draggable={false}
    >
      {/* Clean Header with Title, Selection Checkbox, and Insights Button */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          {/* Show badge when data is sampled */}
          {memoizedData && memoizedData[0]?._sampled && memoizedData[0]?._fullDataLength && (
            <Badge variant="secondary" className="text-xs mt-1">
              Showing {memoizedData[0].x.length} of {memoizedData[0]._fullDataLength} points
            </Badge>
          )}
        </div>
        
        {/* AI Insights Button */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleGenerateInsights();
          }}
          variant="ghost"
          size="icon"
          disabled={aiLoading || insightSticky !== null}
          title={insightSticky !== null ? "Insights already shown" : "Generate chart insights"}
          className={`transition-all duration-200 ${
            insightSticky !== null 
              ? "text-gray-400 cursor-not-allowed opacity-50" 
              : "text-gray-600 hover:bg-gray-100 hover:text-blue-600"
          }`}
          style={{ zIndex: 1000, position: 'relative' }}
        >
          {aiLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
          ) : (
            <Sparkles size={16} />
          )}
        </Button>
      </div>
      
      {/* Chart Plot - Now with more space! */}
      <div 
        className="chart-plot-container"
      >
      {currentFigure && currentFigure.data && currentFigure.layout ? (
        <div 
          className="plotly-container" 
          style={{ pointerEvents: 'auto', minHeight: `${plotHeight}px` }}
          data-chart-id={id}
        >
          {USE_ECHARTS ? (
            <EChartsWrapper
              data={memoizedData} 
              layout={memoizedLayout} 
              style={{ width: '100%', height: `${plotHeight}px` }}
              onInitialized={handlePlotlyInit}
              onUpdate={handlePlotlyUpdate}
              config={{
                displayModeBar: false,
                displaylogo: false,
                staticPlot: !isChartVisible,
                responsive: true,
                doubleClick: 'reset+autosize',
                showTips: true,
                showLink: false
              }}
              useResizeHandler={false}
            />
          ) : (
            <Plot 
              ref={plotlyDivRef}
              key={`${id}-${chartType}`}
              data={memoizedData} 
              layout={memoizedLayout} 
              style={{ width: '100%', height: `${plotHeight}px` }} 
              useResizeHandler={false}
              onError={(err) => {
                console.warn('Plotly error:', err);
              }}
              onInitialized={handlePlotlyInit}
              onUpdate={handlePlotlyUpdate}
              config={{
                displayModeBar: false, // Hide Plotly modebar - actions moved to Chart Actions panel
                displaylogo: false,
                staticPlot: !isChartVisible, // Static rendering when not visible
                responsive: true,
                doubleClick: 'reset+autosize',
                showTips: true,
                showLink: false
              }}
            />
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500">Loading chart...</div>
      )}
      </div>
      
      {/* Resize Handles - Only show when chart is selected */}
      {selected && (
        <>
          {/* Bottom-right (SE) Corner Handle only */}
          <div
            className="absolute w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-se-resize hover:bg-blue-600 transition-colors resize-handle"
            onPointerDown={(e) => {
              // SE resize handle onPointerDown
              e.preventDefault();
              e.stopPropagation();
              // Safe stopImmediatePropagation - check if method exists
              if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
              } else if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
              handleResizeStart('se', e);
            }}
            onMouseDown={(e) => {
              // SE resize handle onMouseDown
              e.preventDefault();
              e.stopPropagation();
              // Safe stopImmediatePropagation - check if method exists
              if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
              } else if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
              handleResizeStart('se', e);
            }}
            onClick={(e) => { 
              // SE resize handle onClick
              e.preventDefault(); 
              e.stopPropagation(); 
            }}
            data-nopan="true"
            data-noselect="true"
            data-nodrag="true"
            draggable="false"
            style={{ 
              zIndex: 99999, 
              pointerEvents: 'all',
              bottom: '-8px',
              right: '-8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              position: 'absolute',
              touchAction: 'none'
            }}
          />

          {/* Resize Status Display */}
          {isResizing && (
            <div className="absolute -top-8 left-0 bg-blue-600 text-white px-2 py-1 rounded text-xs font-mono"
                 style={{ zIndex: 1002 }}>
              {chartDimensions.width}x{chartDimensions.height}
            </div>
          )}
        </>
      )}

      {/* Insight Sticky Note */}
      {insightSticky && (
        <div className="absolute top-0 right-0 transform translate-x-full ml-4 z-50">
          <InsightStickyNote
            contextInsights={insightSticky.contextInsights}
            genericInsights={insightSticky.genericInsights}
            hasContext={insightSticky.hasContext}
            insight={insightSticky.insight}
            onClose={() => setInsightSticky(null)}
          />
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Return true if props are equal (skip re-render)
  // Return false if props changed (re-render)
  
  // Always re-render if selected state changes
  if (prevProps.selected !== nextProps.selected) return false;
  
  // Always re-render if data reference changes
  if (prevProps.data !== nextProps.data) return false;
  
  // Always re-render if id changes
  if (prevProps.id !== nextProps.id) return false;
  
  // Skip re-render if stable props haven't changed
  if (prevProps.apiKey === nextProps.apiKey &&
      prevProps.selectedModel === nextProps.selectedModel &&
      prevProps.onSelect === nextProps.onSelect &&
      prevProps.onAddToReport === nextProps.onAddToReport &&
      prevProps.setReportPanelOpen === nextProps.setReportPanelOpen &&
      prevProps.onResizeStart === nextProps.onResizeStart &&
      prevProps.onResizeEnd === nextProps.onResizeEnd) {
    return true; // Props are equal, skip re-render
  }
  
  return false; // Props changed, re-render
});

/**
 * RichTextEditor Component
 * Simple Tiptap-based rich text editor with toolbar for formatting.
 * Used in report panel for text editing.
 * 
 * Features:
 * - Toolbar with formatting buttons
 * - Formatting: Bold, Italic, Underline, Heading 1, Heading 2
 * - Stores content as HTML for semantic structure
 * - Controlled component with onChange callback
 * 
 * @param {string} content - Initial HTML content
 * @param {Function} onChange - Callback with updated HTML on content change
 * @param {boolean} showToolbar - Whether to show the formatting toolbar
 * @param {string} className - Additional CSS classes
 */
function RichTextEditor({ content, onChange, showToolbar = true, className = '' }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline
    ],
    content: content || '<p>Start typing...</p>',
    editable: true,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    }
  });

  // Update editor when content prop changes externally
  useEffect(() => {
    if (editor && content && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`rich-text-editor-container ${className}`}>
      {showToolbar && (
        <div className="editor-toolbar">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
            title="Underline"
          >
            <UnderlineIcon size={16} />
          </button>
          <div className="toolbar-separator" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
            title="Heading 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
            title="Heading 2"
          >
            <Heading2 size={16} />
          </button>
        </div>
      )}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

/**
 * InsightStickyNote Component
 * A draggable sticky note that displays AI-generated chart insights.
 * Shows context-aware insights if user query exists, otherwise shows generic insights.
 * 
 * @param {string} contextInsights - Context-aware insights (when user query exists)
 * @param {string} genericInsights - Generic insights (when no user query)
 * @param {boolean} hasContext - Whether context-aware insights are available
 * @param {string} insight - Legacy: full insight text for backward compatibility
 * @param {Function} onClose - Callback when sticky note is closed (optional)
 */
function InsightStickyNote({ 
  contextInsights,
  genericInsights,
  hasContext,
  insight, // For backward compatibility
  onClose
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - currentPosition.x,
      y: e.clientY - currentPosition.y
    });
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setCurrentPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, currentPosition]);

  // Determine what to display: context-aware if available, otherwise generic
  const displayInsight = hasContext 
    ? (contextInsights || genericInsights || insight)
    : (genericInsights || insight);

  return (
    <div 
      className="relative bg-yellow-100 border-2 border-yellow-300 rounded-lg shadow-lg p-3 cursor-move"
      style={{
        width: 300,
        minWidth: 250,
        height: 'auto'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center mb-2">
        <Sparkles className="w-4 h-4 mr-2 text-yellow-800" />
        <h4 className="font-semibold text-yellow-800 text-sm">Chart Insights</h4>
      </div>
      
      {/* Content - Single insight display */}
      <div className="text-xs text-yellow-900 whitespace-pre-wrap leading-relaxed">
        {displayInsight}
      </div>
    </div>
  );
}

/* === DESIGN SYSTEM COMPONENTS === */

/**
 * Standardized Button Component
 * Base button component following the design system with consistent variants and states
 * 
 * @param {string} variant - Button style variant: 'primary', 'secondary', 'ghost', 'icon'
 * @param {string} size - Button size: 'sm', 'md', 'lg'
 * @param {boolean} active - Whether button is in active/selected state
 * @param {boolean} disabled - Whether button is disabled
 * @param {ReactNode} children - Button content
 * @param {Function} onClick - Click handler
 * @param {string} className - Additional CSS classes
 * @param {object} props - Additional props passed to button element
 */
function DesignButton({ 
  variant = 'secondary', 
  size = 'md', 
  active = false, 
  disabled = false, 
  children, 
  onClick, 
  className = '',
  ...props 
}) {
  const baseClasses = 'btn-base';
  const sizeClasses = {
    sm: 'btn-sm',
    md: 'btn-md', 
    lg: 'btn-lg'
  };
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    icon: 'btn-icon',
    accent: 'btn-accent'
  };
  
  const classes = [
    baseClasses,
    sizeClasses[size],
    variantClasses[variant],
    active ? 'btn-toggle active' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Icon Button with Badge
 * Specialized icon button with optional badge support for notifications
 * 
 * @param {ReactComponent} icon - Icon component to render
 * @param {string|number} badge - Badge content (numbers, text)
 * @param {boolean} active - Whether button is active
 * @param {boolean} disabled - Whether button is disabled
 * @param {Function} onClick - Click handler
 * @param {string} label - Tooltip/accessibility label
 * @param {string} size - Button size: 'sm', 'md', 'lg'
 */
function IconButton({ 
  icon: Icon, 
  badge, 
  active = false, 
  disabled = false, 
  onClick, 
  label, 
  size = 'md',
  className = ''
}) {
  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24
  };

  return (
    <DesignButton
      variant="icon"
      size={size}
      active={active}
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={`relative ${className}`}
    >
      <Icon size={iconSizes[size]} />
      {badge && badge > 0 && (
        <span className="badge">
          {badge}
        </span>
      )}
    </DesignButton>
  );
}

/**
 * Panel Component Base
 * Standardized panel architecture with size variants and animations
 * 
 * @param {boolean} isOpen - Whether panel is visible
 * @param {string} size - Panel size: 'sm', 'md', 'lg'
 * @param {string} position - Panel position: 'left', 'right'
 * @param {ReactNode} children - Panel content
 * @param {string} className - Additional CSS classes
 */
function Panel({ 
  isOpen = false, 
  size = 'md', 
  position = 'left', 
  children, 
  className = '' 
}) {
  const sizeClasses = {
    sm: 'panel-sm',
    md: 'panel-md', 
    lg: 'panel-lg'
  };
  
  const positionClasses = {
    left: isOpen ? 'panel-slide-enter-active' : 'panel-slide-exit-active',
    right: isOpen ? 'translate-x-0' : 'translate-x-full'
  };

  const classes = [
    'panel-base',
    sizeClasses[size],
    'flex flex-col overflow-hidden transition-all duration-300',
    isOpen ? 'opacity-100' : 'opacity-0 w-0',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {children}
    </div>
  );
}

/**
 * Modal Overlay Component
 * Standardized modal with backdrop and focus management
 * 
 * @param {boolean} isOpen - Whether modal is visible
 * @param {Function} onClose - Close callback
 * @param {ReactNode} children - Modal content
 * @param {string} size - Modal size: 'sm', 'md', 'lg'
 */
function Modal({ isOpen = false, onClose, children, size = 'md' }) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg', 
    lg: 'max-w-2xl'
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className={`bg-white rounded-lg shadow-lg p-6 m-4 ${sizeClasses[size]} mx-auto mt-20`}
        onClick={(e) => e.stopPropagation()}
        style={{ zIndex: 1050 }}
      >
        {children}
      </div>
    </div>
  );
}

/* === END DESIGN SYSTEM COMPONENTS === */

/**
 * UnifiedSidebar Component
 * Left-side vertical toolbar that provides access to all main tools and actions.
 * Includes panel toggles (upload, variables), tool selectors (select, arrow, text, expression),
 * and action buttons (merge, arrange), plus app controls at bottom (settings, instructions, report).
 * 
 * @param {boolean} uploadPanelOpen - Whether upload panel is currently open
 * @param {Function} setUploadPanelOpen - Toggle upload panel visibility
 * @param {boolean} variablesPanelOpen - Whether variables panel is currently open
 * @param {Function} setVariablesPanelOpen - Toggle variables panel visibility
 * @param {string} activeTool - Currently active tool ID
 * @param {Function} onToolChange - Callback when tool selection changes
 * @param {Function} onMergeCharts - Callback to merge selected charts
 * @param {Function} onAutoLayout - Callback to auto-arrange nodes
 * @param {number} selectedChartsCount - Number of currently selected charts
 * @param {boolean} canMerge - Whether merge action is enabled (requires exactly 2 charts)
 * @param {Object} selectedChartForActions - Currently selected chart object for actions (or null)
 * @param {boolean} showLearningModal - Whether learning modal is open
 * @param {Function} setShowLearningModal - Toggle learning modal
 * @param {boolean} showSettings - Whether settings panel is open
 * @param {Function} setShowSettings - Toggle settings panel
 * @param {boolean} reportPanelOpen - Whether report panel is open
 * @param {Function} setReportPanelOpen - Toggle report panel
 */
function UnifiedSidebar({
  // Toggle states
  uploadPanelOpen,
  setUploadPanelOpen,
  variablesPanelOpen,
  setVariablesPanelOpen,
  chartActionsPanelOpen,
  setChartActionsPanelOpen,
  mergePanelOpen,
  setMergePanelOpen,
  activeTool,
  onToolChange,
  // Action handlers
  onMergeCharts,
  onAutoLayout,
  selectedChartsCount,
  canMerge,
  selectedChartForActions,
  // App control states
  showLearningModal,
  setShowLearningModal,
  showSettings,
  setShowSettings,
  reportPanelOpen,
  setReportPanelOpen
}) {
  const toggleButtons = [
    { 
      id: 'upload', 
      icon: Upload, 
      label: 'Upload Data', 
      onClick: () => {
        setUploadPanelOpen(!uploadPanelOpen);
        if (!uploadPanelOpen) {
          setVariablesPanelOpen(false);
          setChartActionsPanelOpen(false);
          setMergePanelOpen(false);
        }
      }, 
      active: uploadPanelOpen 
    },
    { 
      id: 'variables', 
      icon: CirclePlus, 
      label: 'Variables', 
      onClick: () => {
        setVariablesPanelOpen(!variablesPanelOpen);
        if (!variablesPanelOpen) {
          setUploadPanelOpen(false);
          setChartActionsPanelOpen(false);
          setMergePanelOpen(false);
        }
      }, 
      active: variablesPanelOpen 
    },
    { 
      id: 'chartActions', 
      icon: ChartColumn, 
      label: 'Chart Actions', 
      onClick: () => {
        setChartActionsPanelOpen(!chartActionsPanelOpen);
        if (!chartActionsPanelOpen) {
          setUploadPanelOpen(false);
          setVariablesPanelOpen(false);
          setMergePanelOpen(false);
        }
      }, 
      // Only show as active when panel is actually open
      active: chartActionsPanelOpen,
      // Add a subtle badge to indicate a chart is selected and ready
      badge: selectedChartForActions && !chartActionsPanelOpen ? '1' : null
    },
    { 
      id: 'merge', 
      icon: Merge, 
      label: 'Merge Charts', 
      onClick: () => {
        // Always toggle the panel (no disabled state)
        if (!mergePanelOpen) {
          setMergePanelOpen(true);
        } else {
          setMergePanelOpen(false);
        }
        // Close other panels
        setUploadPanelOpen(false);
        setVariablesPanelOpen(false);
        setChartActionsPanelOpen(false);
      }, 
      active: mergePanelOpen
      // No disabled state - always accessible
    },
  ];
  
  const toolButtons = [
    { id: 'arrow', icon: ArrowRight, label: 'Arrow Tool' },
    { id: 'textbox', icon: StickyNote, label: 'Text Tool' },
    { id: 'expression', icon: Calculator, label: 'Expression Tool' },
  ];
  
  const actionButtons = [
    { 
      id: 'arrange', 
      icon: AlignStartVertical, 
      label: 'Auto Arrange', 
      onClick: onAutoLayout 
    },
  ];
  
  // App control buttons at bottom
  const appControlButtons = [
    {
      id: 'instructions',
      icon: BookOpen,
      label: 'User Instructions',
      active: showLearningModal,
      onClick: () => {
        if (showLearningModal) {
          localStorage.setItem('dfuse_instructions_seen', 'true');
          setShowLearningModal(false);
        } else {
          setShowLearningModal(true);
        }
      }
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'AI Settings',
      active: showSettings,
      onClick: () => setShowSettings(!showSettings)
    },
    {
      id: 'report',
      icon: File,
      label: reportPanelOpen ? 'Hide Report' : 'Show Report',
      active: reportPanelOpen,
      onClick: () => setReportPanelOpen(!reportPanelOpen)
    }
  ];
  
  return (
    <div 
      className="flex flex-col items-center py-6 gap-3"
      style={{ 
        width: 'var(--size-sidebar)', 
        backgroundColor: 'var(--color-surface-elevated)',
        borderRight: '1px solid var(--color-border)',
        height: '100vh'
      }}
    >
      {/* Logo */}
      <div className="mb-4">
        <SquaresExclude size={32} className="text-primary" />
      </div>
      
      {/* Toggle Buttons */}
      <div className="flex flex-col gap-2">
        {toggleButtons.map(btn => (
          <IconButton
            key={btn.id}
            icon={btn.icon}
            active={btn.active}
            disabled={btn.disabled}
            onClick={btn.onClick}
            label={btn.label}
            size="md"
          />
        ))}
      </div>
      
      {/* Separator */}
      <div 
        className="my-2"
        style={{
          width: '32px',
          height: '1px',
          backgroundColor: 'var(--color-border)'
        }}
      />
      
      {/* Tool Buttons */}
      <div className="flex flex-col gap-2">
        {toolButtons.map(btn => (
          <IconButton
            key={btn.id}
            icon={btn.icon}
            active={activeTool === btn.id}
            onClick={() => {
              if (activeTool === btn.id) {
                onToolChange('select');
              } else {
                onToolChange(btn.id);
              }
            }}
            label={btn.label}
            size="md"
          />
        ))}
      </div>
      
      {/* Separator */}
      <div 
        className="my-2"
        style={{
          width: '32px',
          height: '1px',
          backgroundColor: 'var(--color-border)'
        }}
      />
      
      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {actionButtons.map(btn => (
          <IconButton
            key={btn.id}
            icon={btn.icon}
            disabled={btn.disabled}
            active={btn.active}
            onClick={btn.onClick}
            label={btn.label}
            badge={btn.badge}
            size="md"
          />
        ))}
      </div>
      
      {/* Spacer to push bottom buttons down */}
      <div style={{ flexGrow: 1 }} />
      
      {/* Separator */}
      <div 
        className="my-2"
        style={{
          width: '32px',
          height: '1px',
          backgroundColor: 'var(--color-border)'
        }}
      />
      
      {/* App Control Buttons at Bottom */}
      <div className="flex flex-col gap-2">
        {appControlButtons.map(btn => (
          <IconButton
            key={btn.id}
            icon={btn.icon}
            active={btn.active}
            onClick={btn.onClick}
            label={btn.label}
            size="md"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * SlidingPanel Component
 * Enhanced collapsible side panel using the design system.
 * Features smooth animations, size variants, and consistent styling.
 * 
 * @param {boolean} isOpen - Whether panel is currently visible
 * @param {string} title - Header title text
 * @param {ReactNode} children - Content to display inside panel
 * @param {Function} onClose - Callback when panel is closed
 * @param {string} size - Panel size variant: 'sm', 'md', 'lg'
 */
function SlidingPanel({ isOpen, title, children, onClose, size = 'md' }) {
  return (
    <Panel isOpen={isOpen} size={size} position="left" className="border-r">
      {isOpen && (
        <>
          {/* Panel Header */}
          <div 
            className="flex items-center justify-between p-4"
            style={{ 
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)'
            }}
          >
            <h2 
              className="font-semibold"
              style={{ 
                fontSize: 'var(--font-size-lg)',
                color: 'var(--color-text)'
              }}
            >
              {title}
            </h2>
            <IconButton
              icon={X}
              onClick={onClose}
              size="sm"
              label="Close Panel"
            />
          </div>
          
          {/* Panel Content */}
          <div 
            className="flex-1 overflow-y-auto"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            {children}
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * ChartActionsPanel Component
 * Side panel for managing chart-specific actions and AI exploration
 * Consolidates chart type selection, aggregation, data table toggle, report addition, and AI queries
 * 
 * @param {boolean} isOpen - Whether panel is currently visible
 * @param {Object} selectedChart - Currently selected chart node
 * @param {Function} onClose - Callback when panel is closed
 * @param {string} apiKey - Gemini API key
 * @param {string} selectedModel - Selected AI model
 * @param {Function} setShowSettings - Function to open settings panel
 * @param {Function} updateTokenUsage - Function to track token usage
 * @param {Function} onChartTypeChange - Callback to change chart type
 * @param {Function} onAggChange - Callback to change aggregation
 * @param {Function} onShowTable - Callback to show data table
 * @param {Function} onAddToReport - Callback to add chart to report
 */
function ChartActionsPanel({ 
  isOpen,
  selectedChart, 
  onClose,
  apiKey,
  selectedModel,
  setShowSettings,
  updateTokenUsage,
  onChartTypeChange,
  onAggChange,
  onShowTable,
  onAddToReport
}) {
  // AI state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  
  // Local state for buttons
  const [showTableClicked, setShowTableClicked] = useState(false);
  const [addingToReport, setAddingToReport] = useState(false);
  
  // Update local state when selected chart changes
  useEffect(() => {
    if (selectedChart) {
      // Reset AI results and button states when chart changes
      setAiResult(null);
      setShowTableClicked(false);
      setAddingToReport(false);
    }
  }, [selectedChart?.id]);
  
  const handleAIExplore = async () => {
    if (!aiQuery.trim() || aiLoading || !selectedChart) return;
    
    if (!apiKey?.trim()) {
      setAiResult({
        success: false,
        answer: '⚠️ Please configure your Gemini API key in Settings first.'
      });
      setShowSettings(true);
      return;
    }
    
    setAiLoading(true);
    
    try {
      const response = await fetch(`${API}/ai-explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: selectedChart.id,
          user_query: aiQuery.trim(),
          api_key: apiKey,
          model: selectedModel
        })
      });
      
      if (!response.ok) throw new Error(await response.text());
      
      const result = await response.json();
      
      if (result.token_usage) {
        updateTokenUsage(result.token_usage);
      }
      
      setAiResult(result);
    } catch (error) {
      console.error('AI exploration failed:', error);
      setAiResult({
        success: false,
        answer: `AI exploration failed: ${error.message}`
      });
    } finally {
      setAiLoading(false);
    }
  };
  
  // Get chart type info
  const dims = selectedChart?.data?.dimensions?.filter(d => d !== 'count').length || 0;
  const meas = selectedChart?.data?.measures?.length || 0;
  // When using TLDraw, we must use ECharts registry because charts render with EChartsWrapper
  const shouldUseECharts = USE_ECHARTS || USE_TLDRAW;
  const supportedTypes = selectedChart 
    ? (shouldUseECharts ? getEChartsSupportedTypes(dims, meas) : getSupportedChartTypes(dims, meas))
    : [];
  const currentType = selectedChart?.data?.chartType || 'bar';
  const currentAgg = selectedChart?.data?.agg || 'sum';
  
  // Determine if aggregation can be changed
  const canChangeAgg = selectedChart && meas > 0 && dims > 0;
  
  return (
    <SlidingPanel 
      isOpen={isOpen} 
      title="Chart Actions"
      onClose={onClose}
      size="md"
    >
      <div className="py-6 px-4 space-y-6">
        {/* Empty State */}
        {!selectedChart && (
          <div className="text-center py-12">
            <ChartColumn size={48} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Select a chart to access actions
            </p>
          </div>
        )}
        
        {/* Chart Actions - Only show when chart is selected */}
        {selectedChart && (
          <>
            {/* Chart Type Section */}
            <div>
              <label 
                className="block text-sm font-medium mb-3"
                style={{ color: 'var(--color-text)' }}
              >
                Change Chart Type
              </label>
              <div className="grid grid-cols-4 gap-2">
                {supportedTypes.map(type => {
                  const IconComponent = type.icon;
                  const isActive = currentType === type.id;
                  
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        console.log('🖱️ Chart type button clicked:', { 
                          chartId: selectedChart.id, 
                          newType: type.id,
                          currentType: selectedChart?.data?.chartType,
                          hasCallback: !!onChartTypeChange
                        });
                        onChartTypeChange(selectedChart.id, type.id);
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                        isActive 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                      title={type.label}
                    >
                      <IconComponent size={20} className={isActive ? 'text-blue-600' : 'text-gray-600'} />
                      <span className={`text-xs mt-1 ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
                        {type.label.replace(' Chart', '').replace(' Plot', '')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Aggregation Section */}
            {canChangeAgg && (
              <div>
                <label 
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--color-text)' }}
                >
                  Change Data Aggregation
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'sum', label: 'Sum' },
                    { value: 'avg', label: 'Average' },
                    { value: 'min', label: 'Minimum' },
                    { value: 'max', label: 'Maximum' }
                  ].map(agg => (
                    <label
                      key={agg.value}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="aggregation"
                        value={agg.value}
                        checked={currentAgg === agg.value}
                        onChange={(e) => onAggChange(selectedChart.id, e.target.value)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {agg.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            {/* Divider */}
            <div 
              className="my-4"
              style={{
                height: '1px',
                backgroundColor: 'var(--color-border)'
              }}
            />
            
            {/* Chart Options Checkboxes */}
            <div className="space-y-3">
              {/* Show Data Table Button */}
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  Data Table
                </span>
                <Button
                  onClick={() => {
                    setShowTableClicked(true);
                    onShowTable(selectedChart.id);
                  }}
                  disabled={showTableClicked}
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                >
                  {showTableClicked ? 'Shown' : 'Show'}
                </Button>
              </div>
              
              {/* Add To Report Button */}
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  Add Insights To Report
                </span>
                <Button
                  onClick={async () => {
                    if (addingToReport) return;
                    setAddingToReport(true);
                    
                    try {
                      // Capture chart as image using canvas API
                      const chartNode = document.querySelector(`[data-id="${selectedChart.id}"]`);
                      const plotlyPlot = chartNode?.querySelector('.js-plotly-plot');
                      const svgElement = plotlyPlot?.querySelector('.main-svg');
                      
                      if (!svgElement) {
                        alert('Chart not found. Please try again.');
                        setAddingToReport(false);
                        return;
                      }
                      
                          // Get SVG dimensions
                          const bbox = svgElement.getBoundingClientRect();
                          const width = bbox.width || 800;
                          const height = bbox.height || 600;
                          
                          // Create canvas
                          const canvas = document.createElement('canvas');
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext('2d');
                          
                          // Convert SVG to image
                          const svgData = new XMLSerializer().serializeToString(svgElement);
                          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                          const url = URL.createObjectURL(svgBlob);
                          
                          const img = new Image();
                          img.onload = async () => {
                        try {
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                            URL.revokeObjectURL(url);
                            
                            // Convert canvas to data URL
                            const imageData = canvas.toDataURL('image/png');
                            
                            // Fetch and add report section if API key is configured
                            if (apiKey?.trim()) {
                              try {
                                const currentApiKey = apiKey;
                                const currentModel = selectedModel || 'gemini-2.0-flash';
                                
                                // Call backend to generate report section (intelligently combines insights)
                              // Pass AI explore results if available for comprehensive report content
                                const response = await fetch(`${API}/generate-report-section`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    chart_id: selectedChart.id,
                                    api_key: currentApiKey,
                                    model: currentModel,
                                  ai_explore_result: aiResult?.answer || null // Pass AI query answer if exists
                                  })
                                });
                                
                                if (response.ok) {
                                  const result = await response.json();
                                  
                                  // Track token usage
                                  if (result.token_usage) {
                                    updateTokenUsage(result.token_usage);
                                  }
                                  
                                  // Create image and text items
                                  const imageItem = {
                                    id: `image-${selectedChart.id}-${Date.now()}`,
                                    type: 'image',
                                    imageUrl: imageData
                                  };
                                  
                                  const textItem = {
                                    id: `text-${selectedChart.id}-${Date.now()}`,
                                    type: 'text',
                                    content: result.report_section || ''
                                  };
                                  
                                  // Add both items to report
                                  onAddToReport([imageItem, textItem]);
                                } else {
                                  // If report section generation fails, just add the image
                                  onAddToReport({
                                    id: `chart-${selectedChart.id}-${Date.now()}`,
                                    type: 'image',
                                    imageUrl: imageData
                                  });
                                }
                              } catch (error) {
                                console.error('Failed to fetch report section:', error);
                                // Fallback: just add chart image if report section generation fails
                                onAddToReport({
                                  id: `chart-${selectedChart.id}-${Date.now()}`,
                                  type: 'image',
                                  imageUrl: imageData
                                });
                              }
                            } else {
                              // No API key - just add chart image
                              onAddToReport({
                                id: `chart-${selectedChart.id}-${Date.now()}`,
                                type: 'image',
                                imageUrl: imageData
                              });
                            }
                            
                          // Re-enable button after successful add
                          setAddingToReport(false);
                        } catch (error) {
                          console.error('Failed to process chart image:', error);
                          setAddingToReport(false);
                          alert('Failed to add chart to report. Please try again.');
                        }
                          };
                          
                          img.onerror = () => {
                            URL.revokeObjectURL(url);
                        setAddingToReport(false);
                            alert('Failed to capture chart. Please try again.');
                          };
                          
                          img.src = url;
                        } catch (error) {
                          console.error('Failed to capture chart:', error);
                      setAddingToReport(false);
                          alert('Failed to add chart to report. Please try again.');
                    }
                  }}
                  disabled={addingToReport}
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                >
                  {addingToReport ? 'Adding...' : 'Add'}
                </Button>
              </div>
            </div>
            
            {/* Divider */}
            <div 
              className="my-4"
              style={{
                height: '1px',
                backgroundColor: 'var(--color-border)'
              }}
            />
            
            {/* AI Query Section */}
            <div className="space-y-4">
              <div>
                <label 
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--color-text)' }}
                >
                  Ask AI Query
                </label>
                <textarea
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleAIExplore();
                    }
                  }}
                  placeholder="Ask AI to calculate new metric, filter data, or answer a question"
                  className="h-40 px-4 py-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    width: '286px'
                  }}
                  disabled={aiLoading}
                />
              </div>
              
              <DesignButton
                variant="accent"
                size="lg"
                onClick={handleAIExplore}
                disabled={!aiQuery.trim() || aiLoading}
                style={{
                  width: '286px',
                  height: '40px',
                  padding: '0 16px'
                }}
              >
                {aiLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                    <span style={{ fontSize: '14px' }}>Processing...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span style={{ fontSize: '14px' }}>Send Query</span>
                    <ArrowRightToLine size={18} />
                  </div>
                )}
              </DesignButton>
              
              {/* Results */}
              {aiResult && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    Results
                  </h3>
                  
                  <div 
                    className={`p-4 rounded-lg text-sm ${
                      aiResult.success 
                        ? 'bg-teal-50 border border-teal-200' 
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <p style={{ color: aiResult.success ? '#0f766e' : '#991b1b', whiteSpace: 'pre-wrap' }}>
                      {aiResult.answer}
                    </p>
                  </div>
                  
                  {/* View Python Code Toggle Button */}
                  {aiResult.success && aiResult.code_steps && aiResult.code_steps.length > 0 && (
                    <details className="mt-3">
                      <summary 
                        className="cursor-pointer text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-2 list-none"
                        style={{ listStyle: 'none' }}
                      >
                        <span className="select-none">▶</span>
                        <span>View Python Code</span>
                      </summary>
                      <div className="mt-2 p-3 bg-gray-900 rounded text-xs space-y-3">
                        {aiResult.code_steps.map((code, idx) => (
                          <div key={idx}>
                            {aiResult.code_steps.length > 1 && (
                              <div className="text-gray-400 mb-1">Step {idx + 1}:</div>
                            )}
                            <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                              <code>{code}</code>
                            </pre>
                          </div>
                        ))}
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          💡 This code shows how the analysis was performed using your actual dataset
                        </div>
                      </div>
                    </details>
                  )}
                  
                  {/* Fallback for legacy analysis details format */}
                  {aiResult.success && aiResult.answer?.includes('--- AI Analysis Details ---') && !(aiResult.code_steps && aiResult.code_steps.length > 0) && (
                    <details className="mt-3">
                      <summary 
                        className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-800 flex items-center gap-2 list-none"
                        style={{ listStyle: 'none' }}
                      >
                        <span className="select-none">▶</span>
                        <span>🔍 Show Analysis Details</span>
                        <span className="text-xs">(reasoning & code)</span>
                      </summary>
                      <div className="mt-2 p-3 bg-gray-50 rounded text-xs space-y-2">
                        <div className="whitespace-pre-wrap font-mono text-gray-700">
                          {aiResult.answer.split('--- AI Analysis Details ---')[1]}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SlidingPanel>
  );
}

/**
 * ReportSection Component
 * Individual report section displaying a chart image and its AI-generated insights.
 * Supports inline editing of content (markdown format) and section removal.
 * 
 * Features:
 * - Displays chart image
 * - Shows markdown-formatted insights
 * - Click-to-edit with textarea
 * - Save/Cancel edit actions
 * - Remove section button
 * - Hidden action buttons in print mode
 * 
 * @param {Object} section - Section data containing chartImage, content, id, chartTitle
 * @param {Function} onRemove - Callback to remove this section from report
 * @param {Function} onUpdate - Callback to update section content after editing
 */
function ReportItem({ item, onRemove, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);

  if (item.type === 'image') {
    return (
      <div 
        className="relative group border rounded-lg overflow-hidden print:border-0 print:shadow-none print:max-w-full print:box-border"
        style={{ maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <img 
          src={item.imageUrl} 
          alt="Report chart"
          className="w-full print:max-w-full print:h-auto print:block"
          style={{ 
            maxWidth: '100%', 
            height: 'auto', 
            display: 'block',
            boxSizing: 'border-box'
          }}
        />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Text item
  const isEmpty = !item.content || item.content === '<p></p>' || item.content === '<p>Start typing...</p>' || item.content === '<p>New text section...</p>';

  if (!isEditing) {
    // Preview mode
    return (
      <div 
        className="relative group border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors min-h-[100px] print:border-0 print:cursor-default print:hover:bg-white print:min-h-0 print:max-w-full print:box-border"
        onClick={() => setIsEditing(true)}
        style={{ maxWidth: '100%', boxSizing: 'border-box' }}
      >
        {isEmpty ? (
          <p className="text-gray-400 italic print:hidden">Write here...</p>
        ) : (
          <div 
            className="formatted-content print:max-w-full print:box-border"
            dangerouslySetInnerHTML={{ __html: item.content }}
            style={{ maxWidth: '100%', boxSizing: 'border-box', wordWrap: 'break-word' }}
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Edit mode
  return (
    <div className="relative group border rounded-lg print:border-0">
      <RichTextEditor
        content={item.content}
        onChange={(newContent) => onUpdate(item.id, newContent)}
        showToolbar={true}
      />
      <div className="p-2 border-t flex gap-2 justify-end print:hidden">
        <button
          onClick={() => setIsEditing(false)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Done
        </button>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 print:hidden"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * ReportPanel Component
 * Simplified right-side panel for creating reports with text and images.
 * Users can add text editors and upload images to build their report.
 * 
 * Features:
 * - Add Text button (creates new rich text editor)
 * - Add Image button (uploads/adds chart images)
 * - Each item is editable/removable
 * - Receives items from parent (including chart images and AI insights)
 * - PDF export via browser print
 * 
 * @param {boolean} isOpen - Whether panel is currently visible
 * @param {Function} onClose - Callback when panel is closed
 * @param {Array} reportItems - Array of report items from parent
 * @param {Function} onUpdateItems - Callback to update items array
 */
function ReportPanel({ isOpen, onClose, reportItems, onUpdateItems }) {
  const fileInputRef = useRef(null);

  const handleAddText = () => {
    const newItem = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: ''
    };
    onUpdateItems([...reportItems, newItem]);
  };

  const handleAddImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newItem = {
          id: `image-${Date.now()}`,
          type: 'image',
          imageUrl: event.target.result
        };
        onUpdateItems([...reportItems, newItem]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateItem = (itemId, newContent) => {
    onUpdateItems(reportItems.map(item =>
      item.id === itemId ? { ...item, content: newContent } : item
    ));
  };

  const handleRemoveItem = (itemId) => {
    onUpdateItems(reportItems.filter(item => item.id !== itemId));
  };

  const handlePrint = () => {
    const reportContent = document.getElementById('report-content');
    
    if (!reportContent) {
      alert('Report content not found. Please ensure you have content in your report.');
      return;
    }

    // Check if report has any content
    const hasContent = reportContent.children.length > 0 && 
      (reportContent.textContent.trim().length > 0 || reportContent.querySelectorAll('img').length > 0);

    if (!hasContent) {
      alert('Your report appears to be empty. Please add some content before exporting to PDF.');
      return;
    }

    // Remove any existing print container to avoid duplication
    const existingContainer = document.getElementById('print-only-container');
    if (existingContainer) {
      document.body.removeChild(existingContainer);
    }

    // Create print container
    const printContainer = document.createElement('div');
    printContainer.id = 'print-only-container';
    printContainer.style.cssText = `
      position: fixed;
      top: -10000px;
      left: 0;
      width: 100%;
      background: white;
      padding: 0;
    `;

    // Get input values before cloning
    const originalInputs = reportContent.querySelectorAll('input[type="text"]');
    const inputValues = Array.from(originalInputs).map(input => ({
      value: input.value,
      placeholder: input.placeholder
    }));

    // Clone content
    const clonedContent = reportContent.cloneNode(true);
    clonedContent.id = 'cloned-report-content';
    
    // Remove buttons
    clonedContent.querySelectorAll('button').forEach(btn => btn.remove());
    
    // Style cloned content
    clonedContent.style.cssText = 'width: 100%; padding: 15mm; box-sizing: border-box;';

    // Style images - prevent page breaks after them
    clonedContent.querySelectorAll('img').forEach(img => {
      img.style.cssText = 'width: 90%; max-width: 90%; height: auto; display: block; margin: 10pt auto 8pt auto; page-break-inside: avoid; page-break-after: avoid;';
    });

    // Style all report items to keep them together
    clonedContent.querySelectorAll('.border, .border-l-4, .rounded-lg').forEach(item => {
      item.style.cssText = item.style.cssText + ' page-break-before: avoid; page-break-inside: avoid; margin-top: 0;';
    });

    // Convert input fields to styled divs
    clonedContent.querySelectorAll('input[type="text"]').forEach((input, index) => {
      const div = document.createElement('div');
      const data = inputValues[index] || {};
      div.textContent = data.value || data.placeholder || '';
      
      if (index === 0 || data.placeholder === 'Heading') {
        div.style.cssText = 'font-size: 24pt; font-weight: bold; text-align: center; margin: 0 0 15pt 0; color: #000; page-break-after: avoid;';
      } else if (index === 1 || data.placeholder === 'Subheading') {
        div.style.cssText = 'font-size: 16pt; font-weight: 600; text-align: center; margin: 0 0 20pt 0; color: #555; page-break-after: avoid;';
      } else {
        div.style.cssText = 'font-size: 14pt; font-weight: bold; margin: 10pt 0; color: #000;';
      }
      
      input.parentNode?.replaceChild(div, input);
    });

    // Style headings in rich text - prevent page breaks after them
    clonedContent.querySelectorAll('h2').forEach(h => {
      h.style.cssText = 'font-size: 16pt; font-weight: bold; margin: 12pt 0 8pt 0; color: #000; page-break-after: avoid;';
    });

    // Append to DOM
    printContainer.appendChild(clonedContent);
    document.body.appendChild(printContainer);

    // Wait for images to load then print
    const images = Array.from(clonedContent.querySelectorAll('img'));
    const imagePromises = images.map(img => new Promise(resolve => {
      if (img.complete) resolve();
      else {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        setTimeout(resolve, 1500);
      }
    }));

    Promise.all(imagePromises).then(() => {
      setTimeout(() => {
        window.print();
        // Cleanup after print dialog closes
        setTimeout(() => {
          const container = document.getElementById('print-only-container');
          if (container) document.body.removeChild(container);
        }, 1000);
      }, 100);
    });
  };

  return (
    <div 
      className="h-full flex flex-col panel-base"
      style={{
        backgroundColor: 'var(--color-surface-elevated)',
        borderLeft: '1px solid var(--color-border)'
      }}
    >
      {/* Panel Header - Hidden in print */}
      <div 
        className="flex items-center justify-between p-4 print:hidden"
        style={{ 
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)'
        }}
      >
        <h2 
          className="font-semibold"
          style={{ 
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-text)'
          }}
        >
          Report
        </h2>
        <div className="flex gap-2">
          <IconButton
            icon={Download}
            onClick={handlePrint}
            size="sm"
            label="Export as PDF"
          />
          <IconButton
            icon={X}
            onClick={onClose}
            size="sm"
            label="Close Report"
          />
        </div>
      </div>
      
      {/* Report Content */}
      <div 
        id="report-content" 
        className="flex-1 overflow-y-auto p-4 space-y-4 print:p-0"
        style={{ 
          backgroundColor: 'var(--color-bg)',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Heading and Subheading Inputs */}
        <div 
          className="space-y-3 pb-4 print:border-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <input
            type="text"
            placeholder="Heading"
            className="w-full font-bold border-0 shadow-none px-0 bg-transparent focus:ring-0 focus:outline-none"
            style={{ 
              fontSize: 'var(--font-size-2xl)',
              color: 'var(--color-text)',
              '::placeholder': { color: 'var(--color-text-muted)' }
            }}
          />
          <input
            type="text"
            placeholder="Subheading"
            className="w-full font-medium border-0 shadow-none px-0 bg-transparent focus:ring-0 focus:outline-none"
            style={{ 
              fontSize: 'var(--font-size-lg)',
              color: 'var(--color-text)',
              '::placeholder': { color: 'var(--color-text-muted)' }
            }}
          />
        </div>
        
        {reportItems.map((item) => (
          <ReportItem
            key={item.id}
            item={item}
            onRemove={() => handleRemoveItem(item.id)}
            onUpdate={handleUpdateItem}
          />
        ))}
      </div>

      {/* Add Buttons - Hidden in print */}
      <div 
        className="p-4 flex gap-2 print:hidden"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <DesignButton 
          onClick={handleAddText}
          variant="secondary"
          size="md"
          className="flex-1 gap-2"
        >
          <Type size={16} />
          Add Text
        </DesignButton>
        <DesignButton 
          onClick={handleAddImage}
          variant="secondary"
          size="md"
          className="flex-1 gap-2"
        >
          <Upload size={16} />
          Add Image
        </DesignButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}

/**
 * Get color for minimap nodes based on node type
 * Provides visual differentiation in the minimap for better navigation
 * 
 * @param {Object} node - React Flow node object
 * @returns {string} - Hex color code for the node
 */
const getMinimapNodeColor = (node) => {
  switch (node.type) {
    case 'chart':
      return '#3b82f6'; // Blue - for chart nodes
    case 'textbox':
      return '#fbbf24'; // Yellow - for sticky notes/text boxes
    case 'expression':
      return '#10b981'; // Green - for expression nodes
    case 'table':
      return '#8b5cf6'; // Purple - for table nodes
    case 'arrow':
      return '#6b7280'; // Gray - for arrow nodes
    default:
      return '#94a3b8'; // Light gray - fallback
  }
};

/**
 * CustomReactFlow Component
 * Wrapper component around ReactFlow that adds custom pan/zoom behaviors.
 * Enables canvas panning with two-finger scroll and pinch-to-zoom gestures.
 * 
 * @param {ReactNode} children - ReactFlow child components
 * @param {Object} props - Additional ReactFlow props (passed through)
 */
function CustomReactFlow({ children, ...props }) {
  return (
    <ReactFlow
      {...props}
    >
      {children}
    </ReactFlow>
  );
}

/**
 * ReactFlowWrapper Component
 * Main application component that manages all state and orchestrates the data flow.
 * Handles:
 * - Dataset upload and management
 * - Chart creation and manipulation
 * - Node and edge management for React Flow canvas
 * - Tool interactions (arrow, text, expression tools)
 * - Chart merging and auto-layout
 * - AI configuration and token tracking
 * - Report generation and management
 * 
 * This is the core orchestrator that connects all UI components and manages
 * the application state. It renders the layout with sidebars, panels, canvas, and report.
 */
function ReactFlowWrapper() {
  const [datasetId, setDatasetId] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [availableDimensions, setAvailableDimensions] = useState([]);
  const [availableMeasures, setAvailableMeasures] = useState([]);
  
  // Dataset analysis state
  const [datasetAnalysis, setDatasetAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState(null);
  
  // Chart suggestion state
  const [goalText, setGoalText] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsError, setSuggestionsError] = useState(null);
  const [aiGeneratedChartCount, setAiGeneratedChartCount] = useState(0);  // Track count for auto-insights
  const [selectedDimension, setSelectedDimension] = useState('');
  const [selectedMeasure, setSelectedMeasure] = useState('');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedCharts, setSelectedCharts] = useState([]);
  const tldrawEditorRef = useRef(null); // Reference to TLDraw editor for programmatic control
  const isProgrammaticDeselect = useRef(false); // Flag to prevent listener from re-selecting during programmatic clear
  
  // AI-assisted merge state
  const [mergePanelOpen, setMergePanelOpen] = useState(false);
  const [mergeContextText, setMergeContextText] = useState('');
  const [pendingMergeCharts, setPendingMergeCharts] = useState(null);
  const [mergeMetadata, setMergeMetadata] = useState(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  
  // Toolbar and tools state
  const [activeTool, setActiveTool] = useState('select');
  const [arrowStart, setArrowStart] = useState(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1000);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [showLearningModal, setShowLearningModal] = useState(() => {
    // Show learning modal by default for first-time users
    const hasSeenInstructions = localStorage.getItem('dfuse_instructions_seen');
    return !hasSeenInstructions;
  });
  
  // Sidebar panel states
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [variablesPanelOpen, setVariablesPanelOpen] = useState(false);
  const [chartActionsPanelOpen, setChartActionsPanelOpen] = useState(false);
  const [selectedChartForActions, setSelectedChartForActions] = useState(null);
  
  // Report state
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [reportItems, setReportItems] = useState([]);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('gemini_model') || 'gemini-2.0-flash');
  const [configStatus, setConfigStatus] = useState('idle'); // idle, testing, success, error
  const [configMessage, setConfigMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConfigLocked, setIsConfigLocked] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0
  });
  
  

  // Helper function to calculate token costs (Gemini pricing)
  const updateTokenUsage = useCallback((newUsage) => {
    if (!newUsage) return;
    
    const inputCostPer1K = 0.00075; // $0.00075 per 1K input tokens for Gemini
    const outputCostPer1K = 0.003;  // $0.003 per 1K output tokens for Gemini
    
    const inputCost = (newUsage.inputTokens / 1000) * inputCostPer1K;
    const outputCost = (newUsage.outputTokens / 1000) * outputCostPer1K;
    
    setTokenUsage(prev => ({
      inputTokens: prev.inputTokens + (newUsage.inputTokens || 0),
      outputTokens: prev.outputTokens + (newUsage.outputTokens || 0),
      totalTokens: prev.totalTokens + (newUsage.inputTokens || 0) + (newUsage.outputTokens || 0),
      estimatedCost: prev.estimatedCost + inputCost + outputCost
    }));
  }, []);


  // Initialize locked state if configuration is already stored
  useEffect(() => {
    const storedApiKey = localStorage.getItem('gemini_api_key');
    
    if (storedApiKey && storedApiKey.trim()) {
      setIsConfigLocked(true);
      setConfigStatus('success');
      setConfigMessage('Configuration loaded from previous session.');
    }
    
    // Remove cache clearing to avoid potential interference with active charts
  }, []);

  // Sync selected chart with Chart Actions Panel (for single selection only)
  useEffect(() => {
    // Get all chart nodes that match the selected IDs in selectedCharts
    // Handle both regular node IDs and TLDraw shape IDs (format: "shape:nodeId")
    const selectedChartNodes = nodes.filter(node => {
      if (node.type !== 'chart') return false;
      
      // Check if any selected ID matches this node
      return selectedCharts.some(selectedId => {
        // Direct match
        if (selectedId === node.id) return true;
        // TLDraw format: "shape:nodeId" - extract the nodeId part
        if (selectedId.startsWith('shape:') && selectedId === `shape:${node.id}`) return true;
        return false;
      });
    });
    
    // Track selected charts count
    const selectedCount = selectedChartNodes.length;
    
    console.log('🔍 Chart selection sync:', {
      selectedCharts,
      matchedNodes: selectedChartNodes.map(n => n.id),
      selectedCount
    });
    
    // Only set selectedChartForActions when exactly 1 chart is selected
    if (selectedCount === 1) {
      setSelectedChartForActions(selectedChartNodes[0]);
      // Don't auto-open panel - let user control it via sidebar toggle
      // The Chart Actions button will be available/enabled when a chart is selected
    } else {
      // Clear selection when 0 charts or more than 1 chart is selected
      // This ensures the "Select a chart to access actions" message appears
      setSelectedChartForActions(null);
    }
    
    // Note: Multiple chart selections (2+) will trigger merge panel separately
  }, [nodes, selectedCharts]);

  // Analyze merge scenario to determine which UI state to show
  const analyzeMergeScenario = useCallback(() => {
    const selectedCount = selectedCharts.length;
    
    // State 1: Not enough charts
    if (selectedCount !== 2) {
      return {
        type: 'none',
        selectedCount,
        message: selectedCount === 0 
          ? 'Please select 2 charts to merge'
          : selectedCount === 1
          ? 'Please select 1 more chart to merge'
          : 'Please select exactly 2 charts to merge'
      };
    }

    // Get chart data
    const [c1, c2] = selectedCharts;
    
    // Helper function to find node by ID (handles both regular IDs and TLDraw shape IDs)
    const findNodeById = (searchId) => {
      return nodes.find(n => {
        // Direct match
        if (n.id === searchId) return true;
        // TLDraw format: "shape:nodeId"
        if (searchId.startsWith('shape:') && searchId === `shape:${n.id}`) return true;
        return false;
      });
    };
    
    const node1 = findNodeById(c1);
    const node2 = findNodeById(c2);
    
    if (!node1 || !node2) return { type: 'none', selectedCount };
    
    const data1 = node1.data;
    const data2 = node2.data;
    
    // Get variables (excluding 'count')
    const dims1 = (data1.dimensions || []).filter(d => d !== 'count');
    const dims2 = (data2.dimensions || []).filter(d => d !== 'count');
    const meas1 = data1.measures || [];
    const meas2 = data2.measures || [];
    
    // Count variables per chart
    const chart1VarCount = dims1.length + meas1.length;
    const chart2VarCount = dims2.length + meas2.length;
    
    // Check for common variables
    const commonDims = dims1.filter(d => dims2.includes(d));
    const commonMeas = meas1.filter(m => meas2.includes(m));
    const hasCommon = commonDims.length > 0 || commonMeas.length > 0;
    
    // All unique variables
    const allDims = [...new Set([...dims1, ...dims2])];
    const allMeas = [...new Set([...meas1, ...meas2])];
    const totalVariables = allDims.length + allMeas.length;
    
    // Determine chart types
    const chart1Is1D1M = dims1.length === 1 && meas1.length === 1;
    const chart2Is1D1M = dims2.length === 1 && meas2.length === 1;
    
    // AI is ONLY needed when:
    // - Both charts are exactly 1D+1M (2 variables each)
    // - No common variables
    // - Results in 4 total unique variables (AI must pick 3)
    const needsAI = chart1Is1D1M && chart2Is1D1M && !hasCommon && totalVariables === 4;
    
    if (needsAI) {
      // State 3: AI needed for merging
      return {
        type: 'ai-assist',
        selectedCount: 2,
        variables: {
          dimensions: allDims,
          measures: allMeas
        },
        totalVariables,
        chart1: { 
          dimensions: dims1, 
          measures: meas1,
          varCount: chart1VarCount,
          type: chart1VarCount === 1 ? 'single-variable' : '1D+1M'
        },
        chart2: { 
          dimensions: dims2, 
          measures: meas2,
          varCount: chart2VarCount,
          type: chart2VarCount === 1 ? 'single-variable' : '1D+1M'
        }
      };
    }
    
    // State 2: No AI required - deterministic merge
    // This includes:
    // - Charts with common variables
    // - Single variable charts (histogram, simple bar chart)
    // - Any other combination where merge logic is clear
    return {
      type: 'no-ai-required',
      selectedCount: 2,
      variables: {
        dimensions: allDims,
        measures: allMeas,
        common: { dimensions: commonDims, measures: commonMeas }
      },
      totalVariables,
      hasCommon,
      chart1: { 
        dimensions: dims1, 
        measures: meas1,
        varCount: chart1VarCount,
        type: chart1VarCount === 1 ? 'single-variable' : (dims1.length > 0 && meas1.length > 0 ? 'multi-variable' : 'single-variable')
      },
      chart2: { 
        dimensions: dims2, 
        measures: meas2,
        varCount: chart2VarCount,
        type: chart2VarCount === 1 ? 'single-variable' : (dims2.length > 0 && meas2.length > 0 ? 'multi-variable' : 'single-variable')
      }
    };
  }, [selectedCharts, nodes]);

  // Update merge metadata whenever merge panel opens or selection changes
  useEffect(() => {
    if (mergePanelOpen) {
      const metadata = analyzeMergeScenario();
      setMergeMetadata(metadata);
      setMergeSuccess(false); // Reset success state when selection changes
    }
  }, [mergePanelOpen, selectedCharts, analyzeMergeScenario]);

  // Handler for adding items to report (must be before nodeTypes)
  const handleAddReportItems = useCallback((newItems) => {
    // newItems can be an array of items (image + text) or a single item
    const itemsArray = Array.isArray(newItems) ? newItems : [newItems];
    setReportItems(prev => [...prev, ...itemsArray]);
    // Auto-open report panel when items are added
    setReportPanelOpen(true);
  }, []);

  // Handle resize start - disable node dragging (must be before nodeTypes)
  const handleChartResizeStart = useCallback((chartId, draggable) => {
    // Parent: Resize start callback
    setNodes(nds => nds.map(node => 
      node.id === chartId 
        ? { ...node, draggable: draggable }
        : node
    ));
  }, []);

  // Handle resize end - re-enable node dragging (must be before nodeTypes)  
  const handleChartResizeEnd = useCallback((chartId, draggable) => {
    // Parent: Resize end callback
    setNodes(nds => nds.map(node => 
      node.id === chartId 
        ? { ...node, draggable: draggable }
        : node
    ));
  }, []);

  // Node types with access to settings state
  const nodeTypes = useMemo(() => ({
    chart: (props) => (
      <ChartNode 
        key={props.id}
        {...props} 
        selected={props.data.selected}
        apiKey={apiKey}
        selectedModel={selectedModel}
        setShowSettings={setShowSettings}
        updateTokenUsage={updateTokenUsage}
        onAddToReport={handleAddReportItems}
        setReportPanelOpen={setReportPanelOpen}
        onResizeStart={handleChartResizeStart}
        onResizeEnd={handleChartResizeEnd}
      />
    ),
    arrow: ArrowNode,
    textbox: TextBoxNode,
    table: TableNode,
    expression: (props) => (
      <ExpressionNode
        {...props}
        apiKey={apiKey}
        selectedModel={selectedModel}
        setShowSettings={setShowSettings}
        updateTokenUsage={updateTokenUsage}
      />
    )
  }), [apiKey, selectedModel, setShowSettings, updateTokenUsage, handleAddReportItems, setReportPanelOpen, handleChartResizeStart, handleChartResizeEnd]);

  // Viewport transform: [translateX, translateY, zoom]
  const transform = useStore(s => s.transform);
  const tx = transform ? transform[0] : 0;
  const ty = transform ? transform[1] : 0;
  const zoom = transform ? transform[2] : 1;

  // Convert a pane click event to flow-space coordinates
  const toFlowPosition = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const paneX = event.clientX - rect.left;
    const paneY = event.clientY - rect.top;
    return {
      x: (paneX - tx) / zoom,
      y: (paneY - ty) / zoom
    };
  }, [tx, ty, zoom]);

  // Get the center of the current viewport in flow coordinates
  const getViewportCenter = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate center in screen coordinates
    const centerScreenX = viewportWidth / 2;
    const centerScreenY = viewportHeight / 2;
    
    // Convert to flow coordinates using current transform
    return {
      x: (centerScreenX - tx) / zoom,
      y: (centerScreenY - ty) / zoom,
    };
  }, [tx, ty, zoom]);

  const onNodesChange = useCallback(
    (changes) => {
      // Filter out selection changes that might interfere with interactive elements
      const filteredChanges = changes.filter(change => {
        // Allow all changes except selection changes that might be caused by button clicks
        if (change.type === 'select') {
          // Check if this selection change is legitimate (not from button clicks)
          return true; // For now, allow all selection changes
        }
        return true;
      });
      
      // Check for node deletions - let React handle cleanup via component unmount
      const deletionChanges = changes.filter(change => change.type === 'remove');
      if (deletionChanges.length > 0) {
        // React will handle cleanup through ChartNode's useEffect cleanup
        // No manual DOM manipulation needed - improves performance
      }
      
      setNodes((nds) => applyNodeChanges(filteredChanges, nds));
    },
    []
  );
  
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Handle node deletions (required for delete key to work)
  const onNodesDelete = useCallback(
    (deletedNodes) => {
      console.log('🗑️ Deleting nodes:', deletedNodes.map(n => n.id));
      // The actual deletion is handled by onNodesChange, but this callback enables the delete key
      setNodes((nds) => nds.filter(node => !deletedNodes.find(dn => dn.id === node.id)));
    },
    []
  );

  // Handle edge deletions
  const onEdgesDelete = useCallback(
    (deletedEdges) => {
      console.log('Deleting edges:', deletedEdges.map(e => e.id));
      setEdges((eds) => eds.filter(edge => !deletedEdges.find(de => de.id === edge.id)));
    },
    []
  );
  
  // Canvas click handler for tools
  const onPaneClick = useCallback((event) => {
    if (activeTool === 'select') return;
    
    // Convert click to flow coordinates using current transform
    const position = toFlowPosition(event);
    
    if (activeTool === 'arrow') {
      if (!arrowStart) {
        // First click - set arrow start point in flow space
        setArrowStart(position);
      } else {
        // Second click - create arrow with absolute start/end in flow space
        const start = arrowStart;
        const end = position;
        const minX = Math.min(start.x, end.x);
        const minY = Math.min(start.y, end.y);

        const arrowId = `arrow-${nodeIdCounter}`;
        const newArrow = {
          id: arrowId,
          type: 'arrow',
          position: { x: minX, y: minY },
          data: { id: arrowId, start, end },
          draggable: true,
          selectable: true
        };

        setNodes(nds => [...nds, newArrow]);
        setNodeIdCounter(c => c + 1);
        setArrowStart(null);
      }
    } else if (activeTool === 'textbox') {
      // Create text box
      const newTextBox = {
        id: `textbox-${nodeIdCounter}`,
        type: 'textbox',
        position,
        data: {
          text: '',
          isNew: true,
          onTextChange: (id, newText) => {
            setNodes(nds => nds.map(node => 
              node.id === id 
                ? { ...node, data: { ...node.data, text: newText, isNew: false } }
                : node
            ));
          },
          onSelect: (nodeId) => {
            // Handle textbox selection (similar to chart selection)
            setSelectedCharts(prev => 
              prev.includes(nodeId) 
                ? prev.filter(id => id !== nodeId)  // Deselect if already selected
                : [...prev, nodeId]  // Add to selection
            );
          }
        },
        draggable: true,
        selectable: true
      };
      
      setNodes(nds => [...nds, newTextBox]);
      setNodeIdCounter(c => c + 1);
    } else if (activeTool === 'expression') {
      // Create expression node
      if (!datasetId) {
        alert('Please upload a dataset first to create expressions');
        return;
      }
      
      const newExpression = {
        id: `expression-${nodeIdCounter}`,
        type: 'expression',
        position,
        data: {
          expression: '',
          result: null,
          isNew: true,
          datasetId: datasetId,
          filters: {},
          onExpressionChange: (id, expression, result, filters) => {
            setNodes(nds => nds.map(node => 
              node.id === id 
                ? { ...node, data: { ...node.data, expression, result, filters, isNew: false } }
                : node
            ));
          }
        },
        draggable: true,
        selectable: true
      };
      
      setNodes(nds => [...nds, newExpression]);
      setNodeIdCounter(c => c + 1);
    }
  }, [activeTool, arrowStart, nodeIdCounter, toFlowPosition, datasetId]);
  
  // Tool change handler
  const handleToolChange = useCallback((toolId) => {
    setActiveTool(toolId);
    setArrowStart(null); // Reset arrow state when changing tools
  }, []);

  const handleChartSelect = useCallback((chartId) => {
    // Ignore selection changes during programmatic deselection
    if (isProgrammaticDeselect.current) {
      return;
    }
    
    setSelectedCharts(prev => {
      if (prev.includes(chartId)) {
        // Deselect if already selected
        return prev.filter(id => id !== chartId);
      } else {
        // Select chart (max 2 charts can be selected)
        if (prev.length >= 2) {
          // Replace oldest selection with new one
          return [prev[1], chartId];
        }
        return [...prev, chartId];
      }
    });
    
    // Note: Chart Actions panel opening is handled by useEffect that syncs selected charts
    // This ensures panel opens automatically when charts are selected, including for merge
  }, [nodes]);

  // Deselect all charts (clears both React state and TLDraw editor selection)
  const deselectAllCharts = useCallback(() => {
    // Set flag to prevent listener from re-selecting during programmatic clear
    isProgrammaticDeselect.current = true;
    
    // Clear React state first
    setSelectedCharts([]);
    
    // Clear TLDraw editor selection if available
    if (tldrawEditorRef.current) {
      try {
        tldrawEditorRef.current.setSelectedShapes([]);
      } catch (error) {
        console.warn('Could not deselect TLDraw shapes:', error);
      }
    }
    
    // Reset flag after a short delay to allow listener to process
    setTimeout(() => {
      isProgrammaticDeselect.current = false;
    }, 100);
  }, []);

  const handleShowTable = useCallback(async (chartId) => {
    try {
      console.log('Showing table for chart:', chartId);
      
      // Call the backend to get table data
      const res = await fetch(`${API}/chart-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_id: chartId })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      const tableData = await res.json();
      console.log('Table data received:', tableData);
      
      // Use setNodes with functional update to get current nodes
      setNodes(currentNodes => {
        // Find the chart node to position the table next to it
        const chartNode = currentNodes.find(n => n.id === chartId);
        if (!chartNode) {
          console.error('Chart node not found in current nodes:', chartId);
          console.error('Available nodes:', currentNodes.map(n => ({ id: n.id, type: n.type })));
          alert('Chart node not found');
          return currentNodes;
        }
        
        // Calculate position for table node (to the right of chart with offset)
        const tablePosition = {
          x: chartNode.position.x + (chartNode.data.strategy === 'same-dimension-different-measures' || 
              chartNode.data.strategy === 'same-measure-different-dimensions-stacked' ? 520 : 400),
          y: chartNode.position.y
        };
        
        // Create table node
        const tableId = `table-${chartId}-${Date.now()}`;
        const newTableNode = {
          id: tableId,
          type: 'table',
          position: tablePosition,
          data: {
            title: `${tableData.title} - Data Table`,
            headers: tableData.headers,
            rows: tableData.rows,
            totalRows: tableData.total_rows,
            sourceChartId: chartId
          },
          draggable: true,
          selectable: true
        };
        
        // Add table node to canvas
        return [...currentNodes, newTableNode];
      });
      
      setNodeIdCounter(c => c + 1);
      
    } catch (error) {
      console.error('Failed to show table:', error);
      alert('Failed to show table: ' + error.message);
    }
  }, []);

  const mergeSelectedCharts = useCallback(async () => {
    if (selectedCharts.length !== 2) {
      alert('Please select exactly 2 charts to merge');
      return;
    }

    const [c1Raw, c2Raw] = selectedCharts;
    
    // Normalize IDs by removing "shape:" prefix if present
    const c1 = c1Raw.startsWith('shape:') ? c1Raw.replace('shape:', '') : c1Raw;
    const c2 = c2Raw.startsWith('shape:') ? c2Raw.replace('shape:', '') : c2Raw;
    
    // Get node data for both charts
    const node1 = nodes.find(n => n.id === c1);
    const node2 = nodes.find(n => n.id === c2);
    
    if (!node1 || !node2) {
      alert('Could not find chart data for selected charts');
      return;
    }
    
    // Standard merge flow - panel UI handles AI vs deterministic logic
    // This function now only executes the actual merge API call
    try {
      const res = await fetch(`${API}/fuse`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chart1_id: c1, chart2_id: c2 }) 
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const fused = await res.json();
      const newId = fused.chart_id;
      
      // Position the fused node in the center of the current viewport
      const position = getViewportCenter();
      
      const figure = figureFromPayload(fused);
      
      // Add the new merged chart
      
      // For 2D+1M charts, backend now sends clean row-based data
      let finalDimensions = fused.dimensions || [];
      let finalMeasures = fused.measures || [];
      
      setNodes(nds => nds.concat({ 
        id: newId, 
        type: 'chart', 
        position, 
        draggable: true,
        selectable: false, // Disable React Flow selection - use checkbox instead
        data: { 
          title: fused.title, 
          figure,
          selected: false,
          onSelect: handleChartSelect,
          onShowTable: handleShowTable,
          onAggChange: updateChartAgg, // Add aggregation handler for fused charts
          onAIExplore: handleAIExplore,
          isFused: true,
          strategy: fused.strategy.type,
          dimensions: finalDimensions,
          measures: finalMeasures,
          agg: fused.agg || 'sum',
          datasetId: fused.dataset_id, // Store dataset ID for aggregation updates
          table: fused.table || [] // Add table data for chart type switching
        } 
      }));
      
      // Note: Arrow creation removed to avoid TLDraw validation issues
      // The merged chart appears without visual connectors to parent charts
      
      // Show success message instead of closing panel
      setMergeSuccess(true);
      
      // Clear selections after successful merge (both React state and TLDraw editor)
      deselectAllCharts();
      
    } catch (e) {
      alert('Merge failed: ' + e.message);
    }
  }, [selectedCharts, nodes, handleChartSelect, getViewportCenter, deselectAllCharts]);

  // Update aggregation on an existing chart node
  const updateChartAgg = useCallback(async (nodeId, newAgg) => {
    console.log('🔄 Aggregation change requested:', { nodeId, newAgg });
    
    setNodes(currentNodes => {
      const node = currentNodes.find(n => n.id === nodeId);
      if (!node) {
        console.log('❌ Node not found in current nodes:', nodeId);
        return currentNodes;
      }
      
      const dims = node.data.dimensions || [];
      const meas = node.data.measures || [];
      
      // Use the global datasetId as primary source, but for fused charts we need to ensure we have it
      const currentDatasetId = datasetId || node.data.datasetId;
      
      console.log('📋 Aggregation update context:', { 
        nodeId, 
        currentAgg: node.data.agg,
        newAgg, 
        dims, 
        meas, 
        currentDatasetId,
        isFused: node.data.isFused,
        chartType: node.data.chartType
      });
      
      // Special handling for fused charts
      if (node.data.isFused) {
        console.warn('⚠️ Aggregation changes not supported for fused charts yet');
        alert('Aggregation changes are not yet supported for fused charts. This feature is coming soon!');
        return currentNodes;
      }
      
      if (!currentDatasetId || dims.length === 0 || meas.length === 0) {
        console.warn('❌ Missing required data for aggregation update:', { nodeId, dims, meas, currentDatasetId });
        alert(`Cannot update aggregation: Missing required data. Dataset: ${currentDatasetId ? 'OK' : 'MISSING'}, Dimensions: ${dims.length}, Measures: ${meas.length}`);
        return currentNodes;
      }

      console.log('✅ Validation passed, proceeding with aggregation update');

      // Optimistically update UI so the dropdown reflects immediately
      const updatedNodes = currentNodes.map(n => 
        n.id === nodeId ? ({ ...n, data: { ...n.data, agg: (newAgg || 'sum') } }) : n
      );

      // Make the API call asynchronously
      (async () => {
        try {
          const body = { 
            dataset_id: currentDatasetId, 
            dimensions: dims, 
            measures: meas, 
            agg: newAgg 
          };
          
          console.log('📡 Making aggregation API call:', { 
            endpoint: `${API}/charts`, 
            body 
          });
          
          const res = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ API call failed:', res.status, errorText);
            throw new Error(`HTTP ${res.status}: ${errorText}`);
          }
          
          const chart = await res.json();
          
          console.log('📥 Aggregation API response:', {
            hasTable: !!chart.table,
            tableLength: chart.table?.length,
            tableSample: chart.table?.slice(0, 2),
            newAgg: chart.agg,
            title: chart.title,
            dimensions: chart.dimensions,
            measures: chart.measures
          });
          
          const title = chart.title || `${(newAgg || 'sum').toUpperCase()} ${meas.join(', ')} by ${dims.join(', ')}`;
          
          // When using TLDraw, we MUST use ECharts because ChartShape renders with EChartsWrapper
          const shouldUseECharts = USE_ECHARTS || USE_TLDRAW;
          
          console.log('🔧 Regenerating chart with new aggregation:', {
            chartType: node.data.chartType,
            shouldUseECharts,
            USE_ECHARTS,
            USE_TLDRAW
          });
          
          let updatedData;
          
          if (shouldUseECharts) {
            console.log('✅ Using ECharts registry for aggregation update');
            // Use ECharts registry to regenerate chart
            const chartType = node.data.chartType || 'bar';
            const chartConfig = ECHARTS_TYPES[chartType.toUpperCase()];
            
            if (chartConfig && chartConfig.isSupported(dims.length, meas.length)) {
              console.log('📊 Chart config found and supported:', chartType.toUpperCase());
              try {
                const option = chartConfig.createOption(chart.table, {
                  dimensions: chart.dimensions,
                  measures: chart.measures
                });
                
                console.log('✨ Generated ECharts option for aggregation:', {
                  hasSeries: !!option.series,
                  seriesLength: option.series?.length,
                  seriesType: option.series?.[0]?.type,
                  firstSeriesData: option.series?.[0]?.data?.slice(0, 3)
                });
                
                updatedData = {
                  chartData: option.series,
                  chartLayout: option,
                  agg: newAgg || 'sum',
                  table: chart.table || [],
                  title: title,
                  dimensions: chart.dimensions,
                  measures: chart.measures
                };
              } catch (error) {
                console.error('❌ Error generating ECharts option:', error);
                throw error;
              }
            } else {
              console.warn('⚠️ Chart config not found or not supported, falling back');
              // Fallback to Plotly
              const figure = figureFromPayload(chart);
              updatedData = {
                figure,
                agg: newAgg || 'sum',
                table: chart.table || [],
                title: title,
                dimensions: chart.dimensions,
                measures: chart.measures
              };
            }
          } else {
            console.log('📊 Using Plotly for aggregation update');
            // Use Plotly (existing logic)
            const figure = figureFromPayload(chart);
            updatedData = {
              figure,
              agg: newAgg || 'sum',
              table: chart.table || [],
              title: title,
              dimensions: chart.dimensions,
              measures: chart.measures
            };
          }
          
          console.log('✅ Aggregation update successful, applying to node:', {
            nodeId,
            newAgg,
            hasChartData: !!updatedData.chartData,
            hasChartLayout: !!updatedData.chartLayout,
            hasFigure: !!updatedData.figure
          });
          
          setNodes(nds => nds.map(n => n.id === nodeId ? ({
            ...n,
            data: { 
              ...n.data, 
              ...updatedData
            }
          }) : n));
        } catch (e) {
          console.error('❌ Aggregation update failed:', e);
          // Revert optimistic change on error
          setNodes(nds => nds.map(n => n.id === nodeId ? ({ ...n, data: { ...n.data, agg: (node.data.agg || 'sum') } }) : n));
          alert('Aggregation update failed: ' + e.message);
        }
      })();

      return updatedNodes;
    });
  }, [datasetId]);

  // Update chart type on an existing chart node
  const updateChartType = useCallback((nodeId, newChartType) => {
    console.log('🔄 updateChartType called:', { nodeId, newChartType, USE_ECHARTS, USE_TLDRAW });
    
    setNodes(currentNodes => {
      console.log('📊 Current nodes:', currentNodes.length);
      const targetNode = currentNodes.find(n => n.id === nodeId && n.type === 'chart');
      console.log('🎯 Target node found:', targetNode ? 'YES' : 'NO', targetNode?.id);
      
      if (targetNode) {
        console.log('📦 Node data:', {
          hasDimensions: !!targetNode.data?.dimensions,
          hasMeasures: !!targetNode.data?.measures,
          hasTable: !!targetNode.data?.table,
          dimensions: targetNode.data?.dimensions,
          measures: targetNode.data?.measures,
          tableLength: targetNode.data?.table?.length
        });
      }
      
      return currentNodes.map(node => {
        if (node.id === nodeId && node.type === 'chart') {
          // Extract data needed for regeneration
          const { dimensions, measures, table } = node.data;
          
          // Regenerate chart with new type based on which chart library is active
          let updatedData = {
            ...node.data,
            chartType: newChartType
          };
          
          // When using TLDraw, we MUST use ECharts because ChartShape renders with EChartsWrapper
          const shouldUseECharts = USE_ECHARTS || USE_TLDRAW;
          console.log('🔍 Checking chart library:', { USE_ECHARTS, USE_TLDRAW, shouldUseECharts, hasTable: !!table, hasDimensions: !!dimensions, hasMeasures: !!measures });
          
          if (shouldUseECharts && table && dimensions && measures) {
            console.log('✅ Using ECharts registry');
            // Use ECharts registry to regenerate chart
            const chartConfig = ECHARTS_TYPES[newChartType.toUpperCase()];
            console.log('📋 Chart config found:', !!chartConfig, 'for type:', newChartType.toUpperCase());
            
            if (chartConfig && chartConfig.isSupported(dimensions.length, measures.length)) {
              console.log('✅ Chart type is supported. Dims:', dimensions.length, 'Measures:', measures.length);
              try {
                console.log('🔍 Input data for chart generation:', {
                  tableLength: table.length,
                  tableSample: table.slice(0, 2),
                  dimensions,
                  measures
                });
                
                const option = chartConfig.createOption(table, { dimensions, measures });
                console.log('📊 Generated ECharts option:', {
                  hasSeries: !!option.series,
                  seriesLength: option.series?.length,
                  seriesType: option.series?.[0]?.type,
                  seriesData: option.series?.[0]?.data,
                  fullOption: option
                });
                
                // For ECharts, store the full option as chartLayout
                // The series data can be extracted from the option if needed
                updatedData = {
                  ...updatedData,
                  chartData: option.series, // Series data for compatibility
                  chartLayout: option // Full ECharts option
                };
                console.log('✅ Chart type changed to', newChartType, 'using ECharts', {
                  updatedChartData: updatedData.chartData,
                  updatedChartLayout: updatedData.chartLayout
                });
              } catch (error) {
                console.error('❌ Error regenerating chart with ECharts:', error);
                // Keep existing data on error
              }
            } else {
              console.warn('⚠️ Chart config not found or not supported');
            }
          } else if (!shouldUseECharts && table && dimensions && measures) {
            // Use Plotly CHART_TYPES registry (existing logic)
            const chartTypeConfig = CHART_TYPES[newChartType.toUpperCase()];
            
            if (chartTypeConfig && chartTypeConfig.isSupported(dimensions.length, measures.length)) {
              try {
                const payload = {
                  table: table,
                  dimensions: dimensions,
                  measures: measures
                };
                const newFigure = chartTypeConfig.createFigure(table, payload);
                updatedData = {
                  ...updatedData,
                  figure: newFigure
                };
                console.log('✅ Chart type changed to', newChartType, 'using Plotly');
              } catch (error) {
                console.error('Error regenerating chart with Plotly:', error);
                // Keep existing data on error
              }
            }
          }
          
          const updatedNode = {
            ...node,
            data: updatedData
          };
          console.log('📤 Returning updated node:', {
            nodeId: updatedNode.id,
            chartType: updatedNode.data.chartType,
            hasChartData: !!updatedNode.data.chartData,
            hasChartLayout: !!updatedNode.data.chartLayout,
            chartDataLength: updatedNode.data.chartData?.length
          });
          return updatedNode;
        }
        return node;
      });
    });
  }, []);

  // Update nodes with current selection status - OPTIMIZED VERSION
  // Only update nodes that actually changed selection state to prevent unnecessary re-renders
  const nodesWithSelection = useMemo(() => {
    return nodes.map(node => {
      const isSelected = selectedCharts.includes(node.id);
      // Add onChartClick handler for chart nodes
      const needsUpdate = node.data.selected !== isSelected || 
                         (node.type === 'chart' && !node.data.onChartClick);
      
      // Only create new object if selection state changed or handler is missing
      if (!needsUpdate) {
        return node; // Return same reference to prevent re-render
      }
      
      return {
        ...node,
        data: {
          ...node.data,
          selected: isSelected,
          ...(node.type === 'chart' && { 
            onChartClick: handleChartSelect  // Keep for React Flow compatibility
          })
        }
      };
    });
  }, [nodes, selectedCharts, handleChartSelect]);

  function figureFromPayload(payload, chartType = null) {
    // Temporarily disable caching to avoid potential Plotly conflicts
    // TODO: Re-enable after resolving hover state issues
    
    // Internal helper to ensure all figures have sanitized layouts
    const createSafeFigure = (data, layout) => ({
      data,
      layout: sanitizeLayout(layout)
    });
    const rows = payload.table || [];
    
    // Get actual dimension and measure arrays for chart type checking
    const dims = payload.dimensions || [];
    const measures = payload.measures || [];
    
    // Strategy A: same-dimension-different-measures => grouped bar or dual-axis
    if (payload.strategy?.type === 'same-dimension-different-measures') {
      // Check if a specific chart type is requested via the chart registry
      if (chartType && CHART_TYPES[chartType.toUpperCase()]) {
        const chartTypeConfig = CHART_TYPES[chartType.toUpperCase()];
        if (chartTypeConfig.isSupported(dims, measures)) {
          return chartTypeConfig.createFigure(rows, payload);
        }
      }
      const xKey = dims[0];
      const measureKeys = payload.measures.filter(m => m !== xKey);
      const xValues = [...new Set(rows.map(r => r[xKey]))];
      
      // Check if we need dual Y-axis (2 measures with different scales)
      if (measureKeys.length === 2) {
        const m1Values = xValues.map(v => (rows.find(r => r[xKey] === v)?.[measureKeys[0]]) ?? 0);
        const m2Values = xValues.map(v => (rows.find(r => r[xKey] === v)?.[measureKeys[1]]) ?? 0);
        
        // Calculate scale difference to determine if dual-axis is needed
        const m1Max = Math.max(...m1Values);
        const m2Max = Math.max(...m2Values);
        const scaleRatio = Math.max(m1Max, m2Max) / Math.min(m1Max, m2Max);
        
        // Use dual Y-axis if scale difference is significant (>10x)
        if (scaleRatio > 10) {
          const data = [
            {
              type: 'bar',
              name: measureKeys[0],
              x: xValues,
              y: m1Values,
              yaxis: 'y',
              marker: { color: '#3182ce' }
            },
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: measureKeys[1],
              x: xValues,
              y: m2Values,
              yaxis: 'y2',
              line: { color: '#e53e3e', width: 3 },
              marker: { color: '#e53e3e', size: 8 }
            }
          ];
          
          return createSafeFigure(data, {
              // Remove title to avoid duplication with ChartNode title
              xaxis: {
                title: { text: xKey, font: { size: 14, color: '#4a5568' } },
                tickangle: -45
              },
              yaxis: {
                title: { text: measureKeys[0], font: { size: 14, color: '#3182ce' } },
                side: 'left'
              },
              yaxis2: {
                title: { text: measureKeys[1], font: { size: 14, color: '#e53e3e' } },
                side: 'right',
                overlaying: 'y'
              },
              margin: { t: 20, b: 160, l: 80, r: 80 }, // Increased bottom margin even more for legend
              plot_bgcolor: 'white',
              paper_bgcolor: 'white',
              showlegend: true,
              legend: {
                orientation: 'h',
                x: 0.5,
                xanchor: 'center',
                y: -0.35, // Moved even further down to avoid overlap
                yanchor: 'top',
                bgcolor: 'rgba(255,255,255,0.8)',
                bordercolor: '#E2E8F0',
                borderwidth: 1,
                font: { size: 11 },
                tracegroupgap: 5, // Add gap between legend groups
                itemsizing: 'constant',
                itemwidth: 30
              }
          });
        }
      }
      
      // Fallback to grouped bar chart for single measure or similar scales
      const data = measureKeys.map(m => ({
        type: 'bar',
        name: truncateLabel(m), // Truncate long legend labels
        x: xValues,
        y: xValues.map(v => (rows.find(r => r[xKey] === v)?.[m]) ?? 0)
      }));
      
      return createSafeFigure(data, { 
          // Remove title to avoid duplication with ChartNode title
          xaxis: {
            title: {
              text: xKey,
              font: { size: 14, color: '#4a5568' }
            },
            tickangle: -45
          },
          yaxis: {
            title: {
              text: measureKeys.length > 1 ? 'Values' : measureKeys[0],
              font: { size: 14, color: '#4a5568' }
            }
          },
          barmode: 'group', 
          margin: { t: 20, b: measureKeys.length > 1 ? 140 : 80, l: 80, r: 30 }, // Keep normal right margin
          plot_bgcolor: 'white',
          paper_bgcolor: 'white',
          showlegend: measureKeys.length > 1,
          legend: measureKeys.length > 1 ? {
            orientation: 'h',
            x: 0.5,
            xanchor: 'center',
            y: -0.3, // Moved further down to avoid overlap
            yanchor: 'top',
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E8F0',
            borderwidth: 1,
            font: { size: 11 },
            tracegroupgap: 5, // Add gap between legend groups
            itemsizing: 'constant',
            itemwidth: 30,
            // Add responsive behavior for many legend items
            ...(measureKeys.length > 8 ? {
              orientation: 'v', // Switch to vertical for many items
              x: 1.05, // Closer to chart to avoid excessive gap
              xanchor: 'left',
              y: 0.5,
              yanchor: 'middle',
              itemwidth: 30, // Reduced item width
              font: { size: 10 }, // Smaller font
              borderwidth: 0, // Remove border to save space
              tracegroupgap: 2 // Reduced gap between items
            } : {})
          } : undefined
      });
    }
    
    // Strategy C: measure-by-dimension (1-variable fusion)
    if (payload.strategy?.type === 'measure-by-dimension') {
      const dims = payload.dimensions.filter(d => d !== 'count');
      const xKey = dims[0];
      const measures = payload.measures.filter(m => m !== 'count');
      const m = measures[0];
      const xValues = [...new Set(rows.map(r => r[xKey]))];
      const data = [{
        type: 'bar',
        name: m,
        x: xValues.map(v => truncateText(v)),
        y: xValues.map(v => (rows.find(r => r[xKey] === v)?.[m]) ?? 0),
        text: xValues.map(v => String(v)), // Full text for hover
        hovertemplate: '%{text}<br>%{y}<extra></extra>'
      }];
      return createSafeFigure(data, {
          // Remove title to avoid duplication with ChartNode title
          xaxis: { title: { text: xKey, font: { size: 14, color: '#4a5568' } }, tickangle: -45 },
          yaxis: { title: { text: m, font: { size: 14, color: '#4a5568' } } },
          margin: { t: 20, b: 80, l: 80, r: 30 }, // Reduced top margin
          plot_bgcolor: 'white',
          paper_bgcolor: 'white'
      });
    }

    // Strategy B: same-measure-different-dimensions => STACKED BAR
    if (payload.strategy?.type === 'same-measure-different-dimensions-stacked') {
      // Check if a specific chart type is requested via the chart registry
      if (chartType && CHART_TYPES[chartType.toUpperCase()]) {
        const chartTypeConfig = CHART_TYPES[chartType.toUpperCase()];
        if (chartTypeConfig.isSupported(dims, measures)) {
          return chartTypeConfig.createFigure(rows, payload);
        }
      }
      
      // Default to stacked bar for 2D+1M
      return CHART_TYPES.STACKED_BAR.createFigure(rows, payload);
    }
    
    // Strategy B: same-measure-different-dimensions => multi-series line (fallback)
    if (payload.strategy?.type === 'same-measure-different-dimensions') {
      const groups = {};
      rows.forEach(r => {
        const g = r['DimensionType'];
        if (!groups[g]) groups[g] = [];
        groups[g].push(r);
      });
      const data = Object.entries(groups).map(([g, arr]) => {
        const xValues = arr.map(a => a['DimensionValue']);
        return {
          type: 'scatter', 
          mode: 'lines+markers', 
          name: g,
          x: xValues.map(v => truncateText(v)),
          y: arr.map(a => a['Value']),
          text: xValues.map(v => String(v)), // Full text for hover
          hovertemplate: '%{text}<br>%{y}<extra></extra>',
          line: { width: 3 },
          marker: { size: 8 }
        };
      });
      
      return createSafeFigure(data, { 
          // Remove title to avoid duplication with ChartNode title
          xaxis: {
            title: {
              text: 'Categories',
              font: { size: 14, color: '#4a5568' }
            },
            tickangle: -45
          },
          yaxis: {
            title: {
              text: 'Value',
              font: { size: 14, color: '#4a5568' }
            }
          },
          margin: { t: 20, b: 100, l: 80, r: 30 }, // Reduced top margin, increased bottom for legend
          plot_bgcolor: 'white',
          paper_bgcolor: 'white',
          showlegend: true,
          legend: {
            orientation: 'h',
            x: 0.5,
            xanchor: 'center',
            y: -0.2,
            yanchor: 'top',
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E8F0',
            borderwidth: 1,
            font: { size: 12 }
          }
      });
    }
    
    // Fallback: Use chart registry system for flexible chart types
    const keys = rows.length ? Object.keys(rows[0]) : [];
    
    // Respect chart configuration first (important for AI-generated charts!)
    const xKey = (payload.dimensions && payload.dimensions.length > 0) 
      ? payload.dimensions[0] 
      : keys.find(k => keys.indexOf(k) === 0 || !rows.some(r => typeof r[k] === 'number')) || 'Category';
      
    const numKey = (payload.measures && payload.measures.length > 0)
      ? payload.measures[0]  // Use first measure from chart configuration
      : keys.find(k => rows.some(r => typeof r[k] === 'number'));
    
    // Debug logging for AI-generated charts
    if (payload.is_ai_generated) {
      console.log('🤖 AI-generated chart detected:', {
        dimensions: payload.dimensions,
        measures: payload.measures,
        selectedXKey: xKey,
        selectedNumKey: numKey,
        availableKeys: keys
      });
    }
    
    // Determine chart type: explicit override > strategy > default
    let activeChartType;
    
    if (chartType && CHART_TYPES[chartType.toUpperCase()]) {
      // Explicit chart type requested
      activeChartType = CHART_TYPES[chartType.toUpperCase()];
    } else {
      // Get default chart type for this dimension/measure combination
      // Pass counts, not arrays, and normalize 'count' handling
      const normalizedDims = (payload.dimensions || []).filter(d => d !== 'count');
      const normalizedMeas = payload.measures || [];
      activeChartType = getDefaultChartType(normalizedDims.length, normalizedMeas.length);
    }
    
    // Create standardized payload for chart type functions
    const standardPayload = {
      ...payload,
      dimensions: payload.dimensions || [xKey],
      measures: payload.measures || [numKey].filter(Boolean)
    };
    
    // Use chart registry to create figure
    return activeChartType.createFigure(rows, standardPayload);
  }

  // AI Exploration handler - defined after all dependencies (handleShowTable, updateChartAgg, figureFromPayload)
  const handleAIExplore = useCallback(async (chartId, aiResult) => {
    // AI exploration is now text-based and handled directly within ChartNode components
    // This callback is no longer used for creating chart nodes
    console.log('AI exploration (text-based):', aiResult);
  }, []);

  // AI-assisted merge function (defined after all dependencies to avoid initialization errors)
  const performAIAssistedMerge = useCallback(async (c1Raw, c2Raw, userGoal) => {
    try {
      console.log('🤖 Calling AI to select best 3 variables...');
      
      // Normalize IDs by removing "shape:" prefix if present
      const c1 = c1Raw.startsWith('shape:') ? c1Raw.replace('shape:', '') : c1Raw;
      const c2 = c2Raw.startsWith('shape:') ? c2Raw.replace('shape:', '') : c2Raw;
      
      // Get node data for dataset ID
      const node1 = nodes.find(n => n.id === c1);
      const nodeDatasetId = node1?.data?.datasetId;
      
      if (!nodeDatasetId) {
        throw new Error('Dataset ID not found for charts');
      }
      
      // Call AI variable selection endpoint
      const aiRes = await fetch(`${API}/fuse-with-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart1_id: c1,
          chart2_id: c2,
          user_goal: userGoal,
          api_key: apiKey,
          model: selectedModel
        })
      });
      
      if (!aiRes.ok) {
        const errorText = await aiRes.text();
        throw new Error(errorText);
      }
      
      const aiResult = await aiRes.json();
      console.log('✅ AI selected variables:', aiResult);
      
      // Update token usage if provided
      if (aiResult.token_usage) {
        updateTokenUsage(aiResult.token_usage);
      }
      
      // Create chart with AI-selected variables using /charts endpoint
      const chartRes = await fetch(`${API}/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: nodeDatasetId,
          dimensions: aiResult.dimensions || [],
          measures: aiResult.measures || [],
          title: aiResult.title || `AI-Merged: ${aiResult.dimensions?.join(', ')} × ${aiResult.measures?.join(', ')}`
        })
      });
      
      if (!chartRes.ok) {
        throw new Error('Failed to create merged chart');
      }
      
      const chart = await chartRes.json();
      const newId = chart.chart_id;
      const position = getViewportCenter();
      const figure = figureFromPayload(chart);
      
      // Add the AI-merged chart to canvas
      setNodes(nds => nds.concat({
        id: newId,
        type: 'chart',
        position,
        draggable: true,
        selectable: false, // Disable React Flow selection - use checkbox instead
        data: {
          title: chart.title,
          figure,
          selected: false,
          onShowTable: handleShowTable,
          onAggChange: updateChartAgg,
          onAIExplore: handleAIExplore,
          isFused: true,
          isAIMerged: true,
          ai_reasoning: aiResult.reasoning,
          dimensions: aiResult.dimensions || [],
          measures: aiResult.measures || [],
          agg: chart.agg || 'sum',
          datasetId: nodeDatasetId,
          table: chart.table || []
        }
      }));
      
      // Note: Arrow creation removed to avoid TLDraw validation issues
      // The AI-merged chart appears without visual connectors to parent charts
      
      // Show success message instead of closing panel
      setMergeSuccess(true);
      
      // Clear selections (both React state and TLDraw editor)
      deselectAllCharts();
      
      // Show success message with AI reasoning
      if (aiResult.reasoning) {
        console.log('🎯 AI reasoning:', aiResult.reasoning);
      }
      
    } catch (error) {
      console.error('AI-assisted merge failed:', error);
      alert('AI-assisted merge failed: ' + error.message);
    }
  }, [nodes, apiKey, selectedModel, updateTokenUsage, getViewportCenter, handleShowTable, updateChartAgg, handleAIExplore, setNodes, setEdges, deselectAllCharts]);

  // Handle merge context submission
  const handleMergeContextSubmit = useCallback(async () => {
    if (!mergeContextText.trim()) {
      alert('Please provide context about what you want to analyze');
      return;
    }
    
    if (!pendingMergeCharts) {
      alert('No pending merge found');
      return;
    }
    
    // Close panel and perform merge
    setMergePanelOpen(false);
    await performAIAssistedMerge(
      pendingMergeCharts.c1,
      pendingMergeCharts.c2,
      mergeContextText
    );
    setPendingMergeCharts(null);
    setMergeContextText('');
  }, [mergeContextText, pendingMergeCharts, performAIAssistedMerge]);

  const uploadCSV = async (file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }
      
      const meta = await res.json();
      setDatasetId(meta.dataset_id);
      setCsvFileName(file.name); // Store the filename
      setAvailableDimensions(meta.dimensions || []);
      setAvailableMeasures(meta.measures || []);
      // Clear previous selections
      setSelectedDimension('');
      setSelectedMeasure('');
      
      // Clear previous analysis
      setDatasetAnalysis(null);
      setAnalysisError(null);
      setEditingMetadata(false);
      setMetadataDraft(null);
      
      console.log('CSV uploaded successfully:', meta);
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      setCsvFileName(''); // Clear filename on error
      alert(`Failed to upload CSV: ${error.message}`);
    }
  };

  const analyzeDataset = async (dataset_id = datasetId) => {
    if (!dataset_id) {
      console.log('No dataset ID available for analysis');
      return;
    }

    try {
      console.log('🤖 Starting dataset analysis...');
      setAnalysisLoading(true);
      setAnalysisError(null);

      const response = await fetch(`${API}/analyze-dataset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_id: dataset_id,
          api_key: apiKey || undefined,
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Analysis completed:', result);
      
      setDatasetAnalysis(result.analysis);
      
      // Track token usage in settings panel
      if (result.analysis.token_usage) {
        updateTokenUsage(result.analysis.token_usage);
      }
      
      // Initialize draft for editing
      const draft = {
        dataset_summary: result.analysis.dataset_summary || '',
        column_descriptions: {}
      };
      
      if (result.analysis.columns) {
        result.analysis.columns.forEach(col => {
          draft.column_descriptions[col.name] = col.description || '';
        });
      }
      
      setMetadataDraft(draft);

    } catch (error) {
      console.error('❌ Dataset analysis failed:', error);
      setAnalysisError(error.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const saveDatasetMetadata = async () => {
    if (!datasetId || !metadataDraft) {
      console.log('No dataset or draft available for saving');
      return;
    }

    try {
      console.log('💾 Saving dataset metadata...');
      
      const response = await fetch(`${API}/save-dataset-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          dataset_summary: metadataDraft.dataset_summary,
          column_descriptions: metadataDraft.column_descriptions
        })
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Metadata saved successfully:', result);
      
      // Update analysis with saved data
      if (datasetAnalysis) {
        const updatedAnalysis = { ...datasetAnalysis };
        updatedAnalysis.dataset_summary = metadataDraft.dataset_summary;
        updatedAnalysis.user_edited = true;
        
        if (updatedAnalysis.columns) {
          updatedAnalysis.columns.forEach(col => {
            if (metadataDraft.column_descriptions[col.name]) {
              col.description = metadataDraft.column_descriptions[col.name];
            }
          });
        }
        
        setDatasetAnalysis(updatedAnalysis);
      }
      
      setEditingMetadata(false);
      
    } catch (error) {
      console.error('❌ Failed to save metadata:', error);
      alert(`Failed to save metadata: ${error.message}`);
    }
  };

  const startEditingMetadata = () => {
    if (!datasetAnalysis) return;
    
    const draft = {
      dataset_summary: datasetAnalysis.dataset_summary || '',
      column_descriptions: {}
    };
    
    if (datasetAnalysis.columns) {
      datasetAnalysis.columns.forEach(col => {
        draft.column_descriptions[col.name] = col.description || '';
      });
    }
    
    setMetadataDraft(draft);
    setEditingMetadata(true);
  };

  const cancelEditingMetadata = () => {
    setEditingMetadata(false);
    setMetadataDraft(null);
  };

  const updateMetadataDraft = (field, value, columnName = null) => {
    if (!metadataDraft) return;
    
    const newDraft = { ...metadataDraft };
    
    if (columnName) {
      // Updating column description
      newDraft.column_descriptions[columnName] = value;
    } else if (field === 'dataset_summary') {
      // Updating dataset summary
      newDraft.dataset_summary = value;
    }
    
    setMetadataDraft(newDraft);
  };

  // Chart suggestion functions
  const suggestCharts = async () => {
    if (!datasetId || !goalText.trim()) {
      setSuggestionsError('Please upload a dataset and enter a goal first');
      return;
    }

    if (!datasetAnalysis) {
      setSuggestionsError('Please analyze the dataset first to enable chart suggestions');
      return;
    }
    
    // Reset AI-generated chart counter for new Smart Visualise session
    setAiGeneratedChartCount(0);
    console.log('🔄 Reset AI chart counter for new Smart Visualise session');

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions([]);

    try {
      const response = await fetch('http://localhost:8000/suggest-charts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          goal: goalText.trim(),
          api_key: apiKey,
          model: selectedModel
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setSuggestions(result.suggestions || []);
        // Update token usage
        if (result.token_usage) {
          updateTokenUsage(result.token_usage);
        }
        
        // Auto-generate charts on canvas using existing chart creation logic
        await generateSuggestedCharts(result.suggestions || []);
        
      } else {
        setSuggestionsError(result.error || 'Failed to generate chart suggestions');
      }
      
    } catch (error) {
      console.error('Chart suggestion error:', error);
      setSuggestionsError('Failed to generate chart suggestions. Please check your API key and try again.');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const generateSuggestedCharts = async (variableSuggestions) => {
    if (!variableSuggestions.length) return;

    try {
      // Position charts in a grid layout
      let xPosition = 50;
      let yPosition = 50;
      const chartWidth = 300;
      const chartHeight = 200;
      const spacing = 50;
      const chartsPerRow = 2;

      for (let i = 0; i < variableSuggestions.length; i++) {
        const suggestion = variableSuggestions[i];
        
        // Calculate grid position
        const row = Math.floor(i / chartsPerRow);
        const col = i % chartsPerRow;
        const x = xPosition + col * (chartWidth + spacing);
        const y = yPosition + row * (chartHeight + spacing);

        // Create charts using existing chart creation infrastructure
        await createAIVisualization(suggestion, { x, y });
        
        // Small delay between chart generation for better UX
        if (i < variableSuggestions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

    } catch (error) {
      console.error('Failed to generate suggested charts:', error);
    }
  };

  const createAIVisualization = async (suggestion, position) => {
    if (!datasetId) return;

    const { method, dimensions, measures, title } = suggestion;
    
    try {
      let id = `ai-viz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Use existing chart creation logic based on method
      if (method === 'dimension_measure' || method === 'two_dimensions_one_measure' || method === 'one_dimension_two_measures') {
        // Multi-variable charts: Use /charts endpoint (same as Case 1 in createVisualization)
        const body = { 
          dataset_id: datasetId, 
          dimensions: dimensions || [], 
          measures: measures || [],
          title: title
        };
        
        const res = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!res.ok) {
          console.error('Failed to create AI chart:', res.statusText);
          return;
        }
        
        const chart = await res.json();
        id = chart.chart_id;
        const figure = figureFromPayload(chart);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure,
            selected: false,
            onSelect: handleChartSelect,
            onShowTable: handleShowTable,
            onAggChange: updateChartAgg,
            onAIExplore: handleAIExplore,
            agg: chart.agg || 'sum',
            dimensions: dimensions || [],
            measures: measures || [],
            datasetId: datasetId,
            table: chart.table || [],
            ai_generated: true,
            ai_method: method,
            ai_reasoning: suggestion.reasoning,
            user_goal: goalText  // Store original user query for AI-assisted merging
          } 
        }));
      }
      
      else if (method === 'single_measure') {
        // Single measure: Use histogram logic (same as Case 2 in createVisualization)
        const measure = measures[0];
        const res = await fetch(`${API}/histogram`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, measure })
        });
        
        if (!res.ok) {
          console.error('Failed to create AI histogram:', res.statusText);
          return;
        }
        
        const { values, stats } = await res.json();
        
        // Register server-side chart for fusion compatibility
        try {
          const body = { 
            dataset_id: datasetId, 
            dimensions: [], 
            measures: [measure], 
            agg: 'sum', 
            title: title || `Histogram: ${measure}` 
          };
          const reg = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          if (reg.ok) {
            const chart = await reg.json();
            id = chart.chart_id;
          }
        } catch {}
        
        const figure = {
          data: [{ type: 'histogram', x: values, marker: { color: '#7c3aed' }, opacity: 0.85 }],
          layout: { 
            xaxis: { title: { text: measure } }, 
            yaxis: { title: { text: 'Count' } }, 
            margin: { t: 20, b: 60, l: 60, r: 30 }, 
            plot_bgcolor: 'white', 
            paper_bgcolor: 'white',
            showlegend: false
          }
        };
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: title || `Histogram: ${measure}`, 
            figure, 
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            stats, 
            agg: 'sum', 
            dimensions: [], 
            measures: [measure], 
            datasetId: datasetId,
            onAggChange: updateChartAgg,
            ai_generated: true,
            ai_method: method,
            ai_reasoning: suggestion.reasoning,
            user_goal: goalText  // Store original user query for AI-assisted merging
          } 
        }));
      }
      
      else if (method === 'single_dimension') {
        // Single dimension: Use dimension counts logic (same as Case 3 in createVisualization)
        const dimension = dimensions[0];
        const res = await fetch(`${API}/dimension_counts`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, dimension })
        });
        
        if (!res.ok) {
          console.error('Failed to create AI dimension chart:', res.statusText);
          return;
        }
        
        const { labels, counts } = await res.json();
        
        // Create table data for chart type switching
        const tableData = labels.map((label, i) => ({
          [dimension]: label,
          count: counts[i]
        }));
        
        // Register server-side chart for fusion compatibility
        try {
          const body = { 
            dataset_id: datasetId, 
            dimensions: [dimension], 
            measures: [], 
            agg: 'count', 
            title: title || `Counts of ${dimension}` 
          };
          const reg = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          if (reg.ok) {
            const chart = await reg.json();
            id = chart.chart_id;
          }
        } catch {}
        
        const figure = {
          data: [{ 
            type: 'bar', 
            x: labels, 
            y: counts, 
            marker: { color: '#7c3aed' } 
          }],
          layout: { 
            xaxis: { title: { text: dimension } }, 
            yaxis: { title: { text: 'Count' } }, 
            margin: { t: 20, b: 60, l: 60, r: 30 }, 
            plot_bgcolor: 'white', 
            paper_bgcolor: 'white',
            showlegend: false
          }
        };
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: title || `Counts of ${dimension}`, 
            figure, 
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            agg: 'count', 
            dimensions: [dimension], 
            measures: [], 
            datasetId: datasetId, 
            onAggChange: updateChartAgg,
            table: tableData,
            ai_generated: true,
            ai_method: method,
            ai_reasoning: suggestion.reasoning,
            user_goal: goalText  // Store original user query for AI-assisted merging
          } 
        }));
      }
      
      // Auto-generate insights for first 4 AI-generated charts
      if (aiGeneratedChartCount < 4 && apiKey && apiKey.trim()) {
        try {
          console.log(`🎯 Auto-generating insights for chart ${aiGeneratedChartCount + 1}/4`);
          
          const insightsResponse = await fetch(`${API}/chart-insights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chart_id: id,
              api_key: apiKey,
              model: selectedModel,
              user_context: goalText  // Pass user's Smart Visualise goal as context
            })
          });
          
          if (insightsResponse.ok) {
            const insightsResult = await insightsResponse.json();
            
            // Track token usage
            if (insightsResult.token_usage) {
              updateTokenUsage(insightsResult.token_usage);
            }
            
            // Update the chart node with pre-loaded insights
            setNodes(nds => nds.map(node => 
              node.id === id 
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      preloadedInsights: {
                        contextInsights: insightsResult.context_insights || '',
                        genericInsights: insightsResult.generic_insights || '',
                        hasContext: insightsResult.has_context || false,
                        insight: insightsResult.insight,
                        statistics: insightsResult.statistics
                      }
                    }
                  }
                : node
            ));
            
            console.log(`✅ Auto-insights generated for chart ${id}`);
          }
          
          // Increment counter after attempt (success or fail)
          setAiGeneratedChartCount(prev => prev + 1);
        } catch (insightError) {
          console.error('Failed to auto-generate insights:', insightError);
          // Still increment counter to avoid retrying
          setAiGeneratedChartCount(prev => prev + 1);
        }
      }

    } catch (error) {
      console.error('Failed to create AI visualization:', error);
    }
  };

  const clearSuggestions = () => {
    setSuggestions([]);
    setSuggestionsError(null);
    setGoalText('');
  };

  const createVisualization = async () => {
    if (!datasetId) return alert('Upload a CSV first.');
    
    // Validate selection - need at least one dimension or measure
    if (!selectedDimension && !selectedMeasure) {
      return alert('Please select at least one dimension or measure');
    }

    try {
      let id = `viz-${Date.now()}`;
      
      // Case 1: Two variables selected (Dimension + Measure)
      if (selectedDimension && selectedMeasure) {
        const body = { 
          dataset_id: datasetId, 
          dimensions: [selectedDimension], 
          measures: [selectedMeasure] 
        };
        const res = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!res.ok) return alert('Create chart failed');
        const chart = await res.json();
        id = chart.chart_id;
        const figure = figureFromPayload(chart);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure,
            selected: false,
            onSelect: handleChartSelect,
            onShowTable: handleShowTable,
            onAggChange: updateChartAgg,
            onAIExplore: handleAIExplore,
            agg: chart.agg || 'sum',
            dimensions: [selectedDimension],
            measures: [selectedMeasure],
            datasetId: datasetId, // Store dataset ID for aggregation updates
            table: chart.table || [] // Add table data for chart type switching
          } 
        }));
      }
      
      // Case 2: Single Measure (Histogram)
      else if (selectedMeasure && !selectedDimension) {
        const res = await fetch(`${API}/histogram`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, measure: selectedMeasure })
        });
        
        if (!res.ok) throw new Error(await res.text());
        const { values, stats } = await res.json();
        
        // Register server-side chart for fusion
        try {
          const body = { 
            dataset_id: datasetId, 
            dimensions: [], 
            measures: [selectedMeasure], 
            agg: 'sum', 
            title: `Histogram: ${selectedMeasure}` 
          };
          const reg = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          if (reg.ok) {
            const chart = await reg.json();
            id = chart.chart_id;
          }
        } catch {}
        
        const figure = {
          data: [{ type: 'histogram', x: values, marker: { color: '#7c3aed' }, opacity: 0.85 }],
          layout: { 
            xaxis: { title: { text: selectedMeasure } }, 
            yaxis: { title: { text: 'Count' } }, 
            margin: { t: 20, b: 60, l: 60, r: 30 }, 
            plot_bgcolor: 'white', 
            paper_bgcolor: 'white',
            showlegend: false,
            legend: undefined
          }
        };
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: `Histogram: ${selectedMeasure}`, 
            figure, 
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            stats, 
            agg: 'sum', 
            dimensions: [], 
            measures: [selectedMeasure], 
            datasetId: datasetId, // Store dataset ID for aggregation updates
            onAggChange: updateChartAgg 
          } 
        }));
      }
      
      // Case 3: Single Dimension (Bar Chart)
      else if (selectedDimension && !selectedMeasure) {
        const res = await fetch(`${API}/dimension_counts`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, dimension: selectedDimension })
        });
        
        if (!res.ok) throw new Error(await res.text());
        const { labels, counts } = await res.json();
        
        // Create table data for chart type switching
        const tableData = labels.map((label, i) => ({
          [selectedDimension]: label,
          count: counts[i]
        }));
        
        // Register server-side chart for fusion
        try {
          const body = { 
            dataset_id: datasetId, 
            dimensions: [selectedDimension], 
            measures: [], 
            agg: 'count', 
            title: `Counts of ${selectedDimension}` 
          };
          const reg = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          if (reg.ok) {
            const chart = await reg.json();
            id = chart.chart_id;
          }
        } catch {}
        
        const figure = {
          data: [{ type: 'bar', x: labels, y: counts, marker: { color: '#0ea5e9' } }],
          layout: { 
            xaxis: { title: { text: selectedDimension } }, 
            yaxis: { title: { text: 'Count' } }, 
            margin: { t: 20, b: 80, l: 60, r: 30 }, 
            plot_bgcolor: 'white', 
            paper_bgcolor: 'white',
            showlegend: false,
            legend: undefined
          }
        };
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: `Bar: ${selectedDimension} vs Count`, 
            figure, 
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            agg: 'count', 
            dimensions: [selectedDimension], 
            measures: ['count'], 
            table: tableData,  // Add table data for chart type switching
            datasetId: datasetId, // Store dataset ID for aggregation updates
            onAggChange: updateChartAgg 
          } 
        }));
      }
    } catch (e) {
      alert('Visualization failed: ' + e.message);
    }
  };

  // Helper function to format user-friendly error messages
  const formatErrorMessage = (errorMessage) => {
    if (!errorMessage) return 'Unknown error occurred.';
    
    // Check for quota exceeded errors
    if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('exceeded')) {
      return 'You exceeded your current quota, please check your plan and billing details.';
    }
    
    // Check for API key errors
    if (errorMessage.includes('API key not valid') || errorMessage.includes('401') || errorMessage.includes('403')) {
      return 'Invalid API key. Please check your API key and try again.';
    }
    
    // Check for rate limiting
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return 'Rate limit exceeded. Please wait a moment and try again.';
    }
    
    // Check for network errors
    if (errorMessage.includes('Network error') || errorMessage.includes('fetch')) {
      return 'Network connection error. Please check your internet connection.';
    }
    
    // For other errors, try to extract a short meaningful message
    const lines = errorMessage.split('\n');
    const firstLine = lines[0];
    
    // If first line is too long, truncate it
    if (firstLine.length > 100) {
      return firstLine.substring(0, 100) + '...';
    }
    
    return firstLine;
  };

  // Memoized API key change handler to prevent unnecessary re-renders
  const handleApiKeyChange = useCallback((e) => {
    setApiKey(e.target.value);
  }, []);

  // Debounced version of expensive operations for better performance
  // Note: This will be defined after applyHierarchicalLayout to avoid reference errors

  // Simple Custom Layout Algorithm (No ELK.js dependency)
  const applyHierarchicalLayout = useCallback(() => {
    if (nodes.length === 0) return;

    try {
      // Calculate node dimensions based on type - using ACTUAL chart dimensions
      const getNodeDimensions = (node) => {
        switch (node.type) {
          case 'chart':
            // Use the SAME logic as ChartNode component for accurate dimensions
            const { strategy, title, dimensions = [], measures = [], isFused } = node.data;
            const isDualAxis = strategy === 'same-dimension-different-measures' && title?.includes('(Dual Scale)');
            const isHeatmap = strategy === 'same-dimension-different-dimensions-heatmap';
            const isMultiVariable = dimensions.length >= 1 && measures.length >= 1;
            const isThreeVariable = (dimensions.length >= 2 && measures.length >= 1) || (dimensions.length >= 1 && measures.length >= 2);
            const isFusedWithLegend = isFused && (
              (strategy === 'same-dimension-different-measures') || 
              (strategy === 'same-measure-different-dimensions-stacked')
            );
            
            // Check if this fused chart would use vertical legend
            const hasVerticalLegend = isFused && (
              (strategy === 'same-dimension-different-measures' && measures.length > 8) ||
              (strategy === 'same-measure-different-dimensions-stacked' && dimensions.length > 10)
            );
            
            // Exact same logic as ChartNode component
            const chartWidth = (isDualAxis || isHeatmap) ? 1000 : 
              isMultiVariable ? (hasVerticalLegend ? 1000 : 760) : 380;
            const chartHeight = (isDualAxis || isHeatmap || isThreeVariable) ? (isFusedWithLegend ? 500 : 400) : 300;
            
            return {
              width: chartWidth,
              height: chartHeight + 100 // Add padding for title, controls, etc.
            };
          case 'table':
            // TableNode uses max-w-2xl (672px) + table height 384px + headers/padding
            return { width: 672, height: 450 };
          case 'expression':
            // ExpressionNode uses max-w-md (448px) + variable height based on content
            return { width: 448, height: 250 };
          case 'textbox':
            // TextBoxNode sticky note with dynamic height (estimate for layout)
            return { width: 220, height: 300 };
          case 'arrow':
            return { width: 50, height: 50 };
          default:
            return { width: 300, height: 200 };
        }
      };

      // Find connected components (groups of interconnected nodes)
      const findConnectedComponents = () => {
        const visited = new Set();
        const components = [];
        
        // Build adjacency list
        const adjacencyList = new Map();
        nodes.forEach(node => adjacencyList.set(node.id, []));
        edges.forEach(edge => {
          if (adjacencyList.has(edge.source)) adjacencyList.get(edge.source).push(edge.target);
          if (adjacencyList.has(edge.target)) adjacencyList.get(edge.target).push(edge.source);
        });
        
        // DFS to find connected components
        const dfs = (nodeId, component) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);
          
          const node = nodes.find(n => n.id === nodeId);
          if (node) component.push(node);
          
          const neighbors = adjacencyList.get(nodeId) || [];
          neighbors.forEach(neighborId => dfs(neighborId, component));
        };
        
        // Find all connected components
        nodes.forEach(node => {
          if (!visited.has(node.id)) {
            const component = [];
            dfs(node.id, component);
            components.push(component);
          }
        });
        
        return components;
      };
      
      const connectedComponents = findConnectedComponents();
      
      // Separate single nodes from connected groups
      const individualNodes = connectedComponents.filter(component => component.length === 1).flat();
      const connectedGroups = connectedComponents.filter(component => component.length > 1);

      // Debug: Log detailed component information
      console.log('🔍 DEBUG: Connected Components Analysis:');
      console.log('Total nodes:', nodes.length);
      console.log('Total edges:', edges.length);
      console.log('Edges details:', edges.map(e => `${e.source} → ${e.target}`));
      console.log('All node IDs:', nodes.map(n => n.id));
      console.log('All components:', connectedComponents.map((comp, i) => ({
        groupId: i,
        nodeIds: comp.map(n => n.id),
        nodeCount: comp.length
      })));
      console.log('Connected groups (>1 node):', connectedGroups.length);
      console.log('Individual nodes (<2 nodes):', individualNodes.length);
      
      console.log('📊 Organizing layout:', {
        total: nodes.length,
        connectedGroups: connectedGroups.length,
        groupSizes: connectedGroups.map(g => g.length),
        individual: individualNodes.length
      });

      let yOffset = 50; // Starting Y position
      const nodeSpacing = 100; // Space between nodes in the same row
      const rowSpacing = 550; // Space between rows
      let newNodes = [];

      // Rows 1-N: Each connected group gets its own row
      connectedGroups.forEach((group, groupIndex) => {
        console.log(`📊 Arranging connected group ${groupIndex + 1} with ${group.length} nodes at Y=${yOffset}`);
        console.log(`   Group nodes: [${group.map(n => n.id).join(', ')}]`);
        
        // Organize nodes in this group by their relationships
        const organizeGroupNodes = (groupNodes) => {
          if (groupNodes.length <= 1) return groupNodes;
          
          const arrangedNodes = [];
          const processedNodes = new Set();
          
          // Find root nodes in this group (not targets of any edge within the group)
          const groupNodeIds = new Set(groupNodes.map(n => n.id));
          const groupEdges = edges.filter(edge => 
            groupNodeIds.has(edge.source) && groupNodeIds.has(edge.target)
          );
          const targetNodes = new Set(groupEdges.map(edge => edge.target));
          const rootNodes = groupNodes.filter(node => !targetNodes.has(node.id));
          
          console.log(`   Root nodes in group: [${rootNodes.map(n => n.id).join(', ')}]`);
          console.log(`   Group edges: [${groupEdges.map(e => `${e.source}→${e.target}`).join(', ')}]`);
          
          // Process chains starting from root nodes
          const processChain = (nodeId) => {
            const node = groupNodes.find(n => n.id === nodeId);
            if (!node || processedNodes.has(nodeId)) return;
            
            processedNodes.add(nodeId);
            arrangedNodes.push(node);
            
            // Find children in this group
            const childEdges = groupEdges.filter(edge => edge.source === nodeId);
            childEdges.forEach(edge => processChain(edge.target));
          };
          
          // Process all root nodes and their chains
          rootNodes.forEach(rootNode => processChain(rootNode.id));
          
          // Add any remaining nodes in the group
          groupNodes.forEach(node => {
            if (!processedNodes.has(node.id)) {
              arrangedNodes.push(node);
            }
          });
          
          console.log(`   Final arrangement: [${arrangedNodes.map(n => n.id).join(', ')}]`);
          return arrangedNodes;
        };
        
        const arrangedGroup = organizeGroupNodes(group);
        
        // Arrange this group horizontally
        let xOffset = 80; // Left margin
        arrangedGroup.forEach((node, nodeIndex) => {
          const dimensions = getNodeDimensions(node);
          console.log(`   Positioning node ${node.id} at (${xOffset}, ${yOffset})`);
          newNodes.push({
            ...node,
            position: { x: xOffset, y: yOffset }
          });
          xOffset += dimensions.width + nodeSpacing;
        });
        
        console.log(`   Moving to next row: Y ${yOffset} → ${yOffset + rowSpacing}`);
        yOffset += rowSpacing; // Move to next row
      });

      // Final row: Individual nodes (standalone)
      if (individualNodes.length > 0) {
        console.log(`📊 Arranging ${individualNodes.length} individual nodes at Y=${yOffset}`);
        console.log(`   Individual nodes: [${individualNodes.map(n => n.id).join(', ')}]`);
        let xOffset = 80; // Left margin
        individualNodes.forEach((node, nodeIndex) => {
          const dimensions = getNodeDimensions(node);
          console.log(`   Positioning individual node ${node.id} at (${xOffset}, ${yOffset})`);
          newNodes.push({
            ...node,
            position: { x: xOffset, y: yOffset }
          });
          xOffset += dimensions.width + nodeSpacing;
        });
      }

      // Update nodes with new positions
      setNodes(newNodes);
      
      console.log('✅ Charts arranged successfully in organized rows');

    } catch (error) {
      console.error('❌ Error arranging charts:', error);
      alert('Failed to arrange charts: ' + error.message);
    }
  }, [nodes, edges]);

  // Debounced version of expensive operations for better performance
  const debouncedAutoLayout = useCallback(
    debounce(() => {
      if (nodes.length > 0) {
        applyHierarchicalLayout();
      }
    }, 300), 
    [applyHierarchicalLayout]
  );

  // Settings panel component - now using Modal from design system
  // Render function - returns JSX directly to avoid component recreation issues
  const renderSettingsPanel = () => {
    const handleTestConfiguration = async () => {
      if (!apiKey.trim()) {
        setConfigStatus('error');
        setConfigMessage('Please enter an API key');
        return;
      }

      setConfigStatus('testing');
      setConfigMessage('Testing configuration...');

      try {
        const response = await fetch(`${API}/test-config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            model: selectedModel
          })
        });

        const result = await response.json();
        
        if (result.success) {
          setConfigStatus('success');
          setConfigMessage('Configuration successful! LLM is ready to use.');
          localStorage.setItem('gemini_api_key', apiKey);
          localStorage.setItem('gemini_model', selectedModel);
          setIsConfigLocked(true);
          
          if (result.token_usage) {
            updateTokenUsage(result.token_usage);
          }
        } else {
          setConfigStatus('error');
          setConfigMessage(`❌ ${formatErrorMessage(result.error)}`);
        }
      } catch (error) {
        setConfigStatus('error');
        setConfigMessage(`❌ ${formatErrorMessage(error.message)}`);
      }
    };

    const handleEditConfiguration = () => {
      setIsConfigLocked(false);
      setConfigStatus('idle');
      setConfigMessage('');
    };

    return (
      <Modal 
        isOpen={true} 
        onClose={() => setShowSettings(false)}
        size="md"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 
            className="font-semibold flex items-center gap-2"
            style={{ 
              fontSize: 'var(--font-size-xl)',
              color: 'var(--color-text)'
            }}
          >
            <Settings size={20} />
            AI Settings
          </h3>
          <IconButton
            icon={X}
            onClick={() => setShowSettings(false)}
            size="sm"
            label="Close Settings"
          />
        </div>

        <div className="space-y-5">
          {/* API Key Input */}
          <div>
            <label 
              className="block font-medium mb-2"
              style={{ 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text)'
              }}
            >
              Gemini API Key
            </label>
            <div className="relative">
              <input
                key="gemini-api-key-input"
                type={showApiKey ? "text" : "password"}
                placeholder="Enter your Gemini API key"
                value={apiKey}
                onChange={handleApiKeyChange}
                disabled={isConfigLocked}
                className={`input-base pr-12 ${isConfigLocked ? 'opacity-60' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors"
                style={{ 
                  color: 'var(--color-text-muted)',
                  ':hover': { color: 'var(--color-text-secondary)' }
                }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p 
              className="mt-2"
              style={{ 
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)'
              }}
            >
              Get your free API key from{' '}
              <a 
                href="https://makersuite.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label 
              className="block font-medium mb-2"
              style={{ 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text)'
              }}
            >
              Model Selection
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isConfigLocked}>
              <SelectTrigger className={`w-full ${isConfigLocked ? 'opacity-60' : ''}`}>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent 
                position="popper"
                side="bottom"
                align="start"
                sideOffset={5}
                style={{ zIndex: 9999 }}
              >
                <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Test/Edit Configuration Button */}
          <DesignButton 
            variant={isConfigLocked ? "secondary" : "primary"}
            size="md"
            onClick={isConfigLocked ? handleEditConfiguration : handleTestConfiguration}
            disabled={configStatus === 'testing'}
            className="w-full gap-2"
          >
            {configStatus === 'testing' ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Testing...
              </>
            ) : isConfigLocked ? (
              <>
                <Edit size={16} />
                Edit Configuration
              </>
            ) : (
              <>
                <Check size={16} />
                Test Configuration
              </>
            )}
          </DesignButton>

          {/* Status Message */}
          {configMessage && (
            <div 
              className="p-4 rounded-lg text-sm break-words whitespace-normal leading-relaxed border"
              style={{
                backgroundColor: configStatus === 'success' 
                  ? 'var(--color-success-light)' 
                  : configStatus === 'error'
                  ? 'var(--color-error-light)'
                  : 'var(--color-info-light)',
                color: configStatus === 'success' 
                  ? 'var(--color-success)' 
                  : configStatus === 'error'
                  ? 'var(--color-error)'
                  : 'var(--color-info)',
                borderColor: configStatus === 'success' 
                  ? 'var(--color-success)' 
                  : configStatus === 'error'
                  ? 'var(--color-error)'
                  : 'var(--color-info)'
              }}
            >
              {configMessage}
            </div>
          )}

          {/* Token Usage Display */}
          {tokenUsage.totalTokens > 0 && (
            <div 
              className="pt-4 mt-4"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <h4 
                className="font-medium mb-3"
                style={{ 
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text)'
                }}
              >
                Token Usage (This Session)
              </h4>
              <div 
                className="space-y-2"
                style={{ 
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)'
                }}
              >
                <div className="flex justify-between">
                  <span>Input Tokens:</span>
                  <span>{tokenUsage.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Output Tokens:</span>
                  <span>{tokenUsage.outputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span>Total Tokens:</span>
                  <span>{tokenUsage.totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium" style={{ color: 'var(--color-success)' }}>
                  <span>Est. Cost:</span>
                  <span>${tokenUsage.estimatedCost.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // Learning Modal component with instruction panel
  const LearningModal = React.memo(() => {
    // Handle closing the modal and marking instructions as seen
    const handleCloseModal = () => {
      localStorage.setItem('dfuse_instructions_seen', 'true');
      setShowLearningModal(false);
    };
    // Flexible instructions structure - easy to edit and maintain
    const instructions = {
      title: "Welcome to D.Fuse - Your Data Visualization Playground!",
      subtitle: "Transform your data into stunning insights with our AI-powered platform with Infinite canvas • AI-powered insights • Smart chart fusion • Effortless reporting",
      videoIframe: '<iframe width="560" height="315" src="https://www.youtube.com/embed/rDHrFO6vyCE?si=YUNiEx5C_p3rnBt7&amp;controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
      
      sections: [
        {
          title: "Setup",
          items: [
            {
              title: "Enter Your Gemini API Key",
              content: [
                "- Go to the Settings panel.",
                "- Paste your Gemini API key in the designated field.",
                "- This securely connects Dfuse to your preferred AI service."
              ]
            },
            {
              title: "Select Your AI Model",
              content: [
                "- Choose from the available Gemini AI models using the dropdown menu."
              ]
            },
            {
              title: "Confirm Your Connection",
              content: [
                "- After saving your settings, look for a confirmation message.",
                "- This indicates your connection is active and your model is ready for use."
              ]
            },
            {
              title: "Track Token Usage",
              content: [
                "- Monitor your AI token consumption directly within the Settings panel."
              ]
            }
          ]
        },
        
        {
          title: "Feature 1 — Create Charts Easily",
          items: [
            {
              title: "Upload Your Data",
              content: [
                "- Click the Upload Data button on the left action bar.",
                "- Select and upload your CSV file."
              ]
            },
            {
              title: "Select Variables",
              content: [
                "- Choose variables from the Variables panel.",
                "- You can select, a single dimension or measure, or One dimension and one measure together",
              ]
            },
            {
              title: "View Your Chart",
              content: [
                "A chart based on your selected variables automatically appears on the canvas."
              ]
            }
          ],
          tip: "You can change the chart's aggregation type (Sum, Average, Min, Max) using the menu icon on the chart."
        },
        
        {
          title: "Feature 2 — Fuse Charts Together",
          content: [
            "You can fuse:",
            "• Two single-variable charts (one dimension + one measure each), or",
            "• Two two-variable charts that share a common variable.",
            "",
            "To fuse charts:",
            "- Select two charts by clicking on their titles.",
            "- Click the Fuse icon on the left action bar.",
            "- A fused chart will be created on the canvas.",
            "- Change its chart type anytime from the top-right corner menu."
          ]
        },
        
        {
          title: "Feature 3 — Ask AI for Insights",
          items: [
            {
              title: "Use AI to Analyze or Transform Data",
              content: [
                "- Find the \"Explore with AI\" box below each chart.",
                "- Type a query or command in plain English, for example: show top 5 products, calculate a metric, filter by a dimension etc",
                "- Press Enter and AI gives you the anwser along with the code."
              ]
            },
            {
              title: "2. Generate AI Insights Instantly",
              content: [
                "- Next to the \"Explore with AI\" box, click the \"Insights\" button.",
                "- Dfuse will automatically generate key patterns, outliers, and smart summaries — no typing needed."
              ]
            }
          ]
        },
        
        {
          title: "Feature 4 — Organize Your Charts",
          items: [
            {
              title: "Auto Arrange",
              content: [
                "- Access Auto Arrange from the left action bar.",
                "- With one click, your dashboard neatly aligns charts — making comparisons and patterns easier to spot."
              ]
            },
            {
              title: "Arrow Tool",
              content: [
                "- Use the Arrow Tool from the left action bar.",
                "- Draw arrows between charts or notes to visualize relationships, highlight flows, and tell compelling data stories."
              ]
            },
            {
              title: "Sticky Notes",
              content: [
                "- Add Sticky Notes from the left action bar.",
                "- Use them to jot quick thoughts, findings, or action items next to charts — keeping your ideas visible and connected."
              ]
            }
          ]
        },
        
        {
          title: "Feature 5 — Create and Share Reports",
          items: [
            {
              title: "Add Charts to Report",
              content: [
                "- From any chart, click \"Add to Report\" in its menu.",
                "- The chart and its AI-generated insights are instantly added to your Report Workspace."
              ]
            },
            {
              title: "Review Your Report",
              content: [
                "- Each added chart appears with its main insights.",
                "- Build your narrative step by step — chart by chart."
              ]
            },
            {
              title: "Format and Personalize",
              content: [
                "- Enhance your report by adding:",
                "- Headings for structure",
                "- Text blocks for explanations or conclusions",
                "- Images for visual context",
                "- All edits happen live for real-time refinement."
              ]
            },
            {
              title: "Download as PDF",
              content: [
                "-When ready, click Download to export your report as a PDF — ideal for presentations, sharing, or printing."
              ]
            }
          ]
        }
      ]
    };

    // Helper function to render instruction content
    const renderContent = (content) => {
      if (Array.isArray(content)) {
        return content.map((item, index) => (
          <p key={index} className="mb-2 text-sm leading-relaxed">
            {item}
          </p>
        ));
      }
      return <p className="mb-2 text-sm leading-relaxed">{content}</p>;
    };

    return (
      <Modal 
        isOpen={showLearningModal} 
        onClose={handleCloseModal}
        size="lg"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 
            className="font-semibold flex items-center gap-2"
            style={{ 
              fontSize: 'var(--font-size-xl)',
              color: 'var(--color-text-primary)' 
            }}
          >
            <BookOpen size={20} />
            User Instructions
          </h3>
          <button 
            onClick={handleCloseModal}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Instruction Panel */}
        <div 
          className="max-h-96 overflow-y-auto border rounded-lg p-4 bg-gray-50"
          style={{ 
            maxHeight: '60vh',
            fontSize: 'var(--font-size-sm)',
            lineHeight: '1.6'
          }}
        >
          <div className="prose prose-sm max-w-none">
            {/* Title and Introduction */}
            <h1 className="text-xl font-bold text-gray-900 mb-3">{instructions.title}</h1>
            <p className="text-gray-600 mb-4 leading-relaxed">{instructions.subtitle}</p>
            
            {/* YouTube Tutorial Video */}
            <div className="mb-6 text-center">
              <div 
                className="inline-block rounded-lg overflow-hidden shadow-lg"
                style={{ maxWidth: '100%' }}
              >
                <div 
                  dangerouslySetInnerHTML={{ __html: instructions.videoIframe }}
                  style={{
                    width: '100%',
                    maxWidth: '560px',
                    aspectRatio: '16/9'
                  }}
                />
              </div>
            </div>

            {/* Sections */}
            {instructions.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="mb-8">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                  {section.title}
                </h2>
                
                {/* Section with items */}
                {section.items && section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="mb-4">
                    <h4 className="font-medium text-gray-700 mb-2">{item.title}</h4>
                    <div className="ml-4">
                      {renderContent(item.content)}
                    </div>
                  </div>
                ))}
                
                {/* Section with direct content */}
                {section.content && (
                  <div className="mb-4">
                    {renderContent(section.content)}
                  </div>
                )}
                
                {/* Tip box */}
                {section.tip && (
                  <div className="bg-green-50 border border-green-200 rounded p-3 mt-4">
                    <p className="text-sm text-green-800 font-medium mb-0">
                      Tip: {section.tip}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Call to Action */}
            <div 
              className="text-center p-4 rounded-lg text-white mb-6"
              style={{
                background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)'
              }}
            >
              <p className="font-semibold mb-1">Ready to create amazing visualizations?</p>
              <p className="text-sm opacity-90">Start by uploading your first dataset and let D.Fuse work its magic!</p>
            </div>

            {/* Support */}
            <div className="text-center text-gray-500 text-sm border-t border-gray-200 pt-4">
              <p>Questions? Reach out at <strong>dubey.ujjjwal1994@gmail.com</strong></p>
            </div>
          </div>
        </div>
      </Modal>
    );
  });

  // Development debugging helpers
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.debugCanvas = {
        getNodes: () => nodes,
        getEdges: () => edges,
        getSelectedCharts: () => nodes.filter(n => n.data?.selected),
        getConfig: () => ({
          useTLDraw: USE_TLDRAW,
          useECharts: USE_ECHARTS,
          nodeCount: nodes.length,
          edgeCount: edges.length
        }),
        logState: () => {
          console.group('🐛 Canvas Debug State');
          console.log('Nodes:', nodes.length);
          console.log('Edges:', edges.length);
          console.log('Selected:', nodes.filter(n => n.data?.selected).length);
          console.log('Config:', { USE_TLDRAW, USE_ECHARTS });
          console.groupEnd();
        }
      };
      console.log('🐛 Debug helpers available: window.debugCanvas.logState()');
    }
  }, [nodes, edges]);

  return (
    <div className="w-screen h-screen flex">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        uploadPanelOpen={uploadPanelOpen}
        setUploadPanelOpen={setUploadPanelOpen}
        variablesPanelOpen={variablesPanelOpen}
        setVariablesPanelOpen={setVariablesPanelOpen}
        chartActionsPanelOpen={chartActionsPanelOpen}
        setChartActionsPanelOpen={setChartActionsPanelOpen}
        mergePanelOpen={mergePanelOpen}
        setMergePanelOpen={setMergePanelOpen}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onMergeCharts={mergeSelectedCharts}
        onAutoLayout={applyHierarchicalLayout}
        selectedChartsCount={selectedCharts.length}
        canMerge={selectedCharts.length === 2}
        selectedChartForActions={selectedChartForActions}
        showLearningModal={showLearningModal}
        setShowLearningModal={setShowLearningModal}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        reportPanelOpen={reportPanelOpen}
        setReportPanelOpen={setReportPanelOpen}
      />
      
      {/* Single Panel Container - Only one panel can be open at a time */}
      {uploadPanelOpen && (
        <SlidingPanel 
          isOpen={uploadPanelOpen} 
          title="Upload Data"
          onClose={() => setUploadPanelOpen(false)}
          size="md"
        >
          <div className="p-4">
            <div className="space-y-4">
              {/* File Upload Section */}
              <div className="pt-2">
                <FileUpload 
                  accept=".csv,.xlsx,.xls" 
                  onFileChange={(file) => uploadCSV(file)}
                >
                  {datasetId ? 'Replace File' : 'Choose CSV or XLSX File'}
                </FileUpload>
                
                {(csvFileName || datasetId) && (
                  <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50/30">
                    {csvFileName && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                        <File size={16} />
                        {csvFileName}
                      </div>
                    )}
                    
                    {datasetId && (
                      <>
                        <Badge variant="outline" className="w-fit mb-2">
                          Dataset: {datasetId.substring(0, 8)}...
                        </Badge>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {availableDimensions.length} dimensions
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {availableMeasures.length} measures
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Analysis Section */}
              {datasetId && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">Dataset Analysis</h3>
                    {datasetAnalysis && !editingMetadata && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={startEditingMetadata}
                        className="h-6 px-2 text-xs"
                      >
                        Edit
                      </Button>
                    )}
                  </div>

                  {/* Prominent Analysis CTA when no analysis exists */}
                  {!datasetAnalysis && !analysisLoading && !analysisError && (
                    <div className="text-center py-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                      <Sparkles size={24} className="mx-auto mb-2 text-blue-500" />
                      <h4 className="font-medium text-gray-900 mb-1">Let AI Analyze Your Dataset</h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Analyze your dataset to get meaningful column descriptions and context
                      </p>
                      <Button 
                        onClick={() => analyzeDataset()}
                        disabled={!apiKey}
                        className="flex items-center gap-2 mx-auto"
                      >
                        <Sparkles size={16} />
                        {apiKey ? 'Analyze Dataset' : 'Configure API Key First'}
                      </Button>
                      {!apiKey && (
                        <p className="text-xs text-gray-500 mt-2">
                          Go to Settings → Configure your Gemini API key to enable AI analysis
                        </p>
                      )}
                    </div>
                  )}

                  {/* Analysis Loading */}
                  {analysisLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 p-3 bg-blue-50 rounded-lg">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                      Analyzing dataset with AI...
                    </div>
                  )}

                  {/* Analysis Error */}
                  {analysisError && (
                    <div className="text-sm text-red-600 p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="font-medium mb-1">Analysis Failed</div>
                      <div>{analysisError}</div>
                      {!apiKey && (
                        <div className="mt-2 text-xs">
                          Configure your API key in Settings to use AI analysis.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Analysis Results */}
                  {datasetAnalysis && (
                    <div className="space-y-4">
                      {/* Dataset Summary */}
                      <div>
                        <div className="mb-2">
                          <label className="text-sm font-medium text-gray-700">Dataset Summary</label>
                        </div>
                        
                        {editingMetadata ? (
                          <textarea
                            value={metadataDraft?.dataset_summary || ''}
                            onChange={(e) => updateMetadataDraft('dataset_summary', e.target.value)}
                            className="w-full p-2 text-sm border border-gray-300 rounded-md resize-none"
                            rows={5}
                            placeholder="Describe your dataset..."
                          />
                        ) : (
                          <div className="text-sm text-gray-700 p-2 bg-gray-50 rounded-md border">
                            {datasetAnalysis.dataset_summary || 'No summary available'}
                          </div>
                        )}
                      </div>

                      {/* Column Descriptions */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">
                          Column Descriptions ({datasetAnalysis.columns?.length || 0} columns)
                        </label>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {datasetAnalysis.columns?.map((column, index) => (
                            <div key={column.name} className="border border-gray-200 rounded-lg p-3 bg-white">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="mb-2">
                                    <span className="font-medium text-sm">{column.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      {getReadableDataType(column.dtype)}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {column.unique_count} unique
                                    </Badge>
                                    {column.missing_pct > 0 && (
                                      <Badge variant="secondary" className="text-xs">
                                        {column.missing_pct}% missing
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {editingMetadata ? (
                                    <Input
                                      value={metadataDraft?.column_descriptions[column.name] || ''}
                                      onChange={(e) => updateMetadataDraft(null, e.target.value, column.name)}
                                      placeholder="Enter column description..."
                                      className="text-sm"
                                    />
                                  ) : (
                                    <div className="text-sm text-gray-600">
                                      {column.description || 'No description available'}
                                    </div>
                                  )}
                                  
                                  {column.sample_values && column.sample_values.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Sample values: {column.sample_values.slice(0, 3).join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Edit/Save Controls */}
                      {editingMetadata && (
                        <div className="flex gap-2 pt-3 border-t border-gray-200">
                          <Button 
                            onClick={saveDatasetMetadata}
                            className="flex items-center gap-1"
                            size="sm"
                          >
                            <Check size={14} />
                            Save Changes
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={cancelEditingMetadata}
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </SlidingPanel>
      )}
      
      {variablesPanelOpen && (
        <SlidingPanel 
          isOpen={variablesPanelOpen} 
          title="Create Charts"
          onClose={() => setVariablesPanelOpen(false)}
        >
          <div className="p-4">
            <div className="space-y-4">
              {/* Goal-Oriented Chart Suggestion */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Use AI to visualise data</h3>
                    {suggestions.length > 0 && (
                      <Button 
                        onClick={clearSuggestions}
                        variant="ghost"
                        size="sm" 
                        className="text-xs"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <textarea
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    placeholder="e.g., 'Compare sales across regions' or 'Show trend over time' or 'Find correlations'"
                    className="w-full min-h-[80px] p-3 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={500}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {goalText.length}/500 characters
                  </div>
                </div>

                <div className="space-y-2">
<DesignButton 
                    variant="accent"
                    size="lg"
                    className="w-full gap-2" 
                    onClick={suggestCharts}
                    disabled={!goalText.trim() || !datasetAnalysis || suggestionsLoading}
                    style={{
                      width: '286px',
                      height: '40px',
                      fontSize: '14px'
                    }}
                  >
                    {suggestionsLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                        <span style={{ fontSize: '14px' }}>Analyzing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Sparkles size={16} />
                        <span style={{ fontSize: '14px' }}>Smart Visualise</span>
                      </div>
                    )}
                  </DesignButton>
                  
                  {suggestionsError && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {suggestionsError}
                    </div>
                  )}
                  
                  {suggestions.length > 0 && (
                    <div className="text-xs bg-teal-50 border border-teal-200 text-teal-800 p-2 rounded">
                      Generated {suggestions.length} visualization{suggestions.length !== 1 ? 's' : ''} based on your goal
                    </div>
                  )}
                  
                  {!datasetAnalysis && datasetId && (
                    <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                      💡 Analyze your dataset first to enable Smart Visualise
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-4"></div>

              {/* Select Variables Section */}
              <div>
                <h3 className="text-sm font-medium mb-3">Select variables</h3>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Dimensions</h3>
                </div>
                <RadioGroup
                  options={availableDimensions}
                  value={selectedDimension}
                  onChange={setSelectedDimension}
                  name="dimensions"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Measures</h3>
                </div>
                <RadioGroup
                  options={availableMeasures}
                  value={selectedMeasure}
                  onChange={setSelectedMeasure}
                  name="measures"
                />
              </div>

              {/* Manual Chart Creation Button */}
              <div className="space-y-2">
                <Button 
                  className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:text-gray-500" 
                  onClick={createVisualization}
                  disabled={!selectedDimension && !selectedMeasure}
                >
                  <ChartColumn size={16} />
                  Visualise
                </Button>
              </div>
            </div>
          </div>
        </SlidingPanel>
      )}
      
      {/* Chart Actions Panel */}
      {chartActionsPanelOpen && (
        <ChartActionsPanel
          isOpen={chartActionsPanelOpen}
          selectedChart={selectedChartForActions}
          onClose={() => setChartActionsPanelOpen(false)}
          apiKey={apiKey}
          selectedModel={selectedModel}
          setShowSettings={setShowSettings}
          updateTokenUsage={updateTokenUsage}
          onChartTypeChange={updateChartType}
          onAggChange={updateChartAgg}
          onShowTable={handleShowTable}
          onAddToReport={handleAddReportItems}
        />
      )}

      {/* Unified Merge Panel with 3 States */}
      {mergePanelOpen && (
        <SlidingPanel
          isOpen={mergePanelOpen}
          title="Merge Charts"
          onClose={() => {
            setMergePanelOpen(false);
            setPendingMergeCharts(null);
            setMergeContextText('');
            setMergeMetadata(null);
            setMergeSuccess(false);
          }}
          size="md"
        >
          <div className="p-4">
            <div className="space-y-6">
              
              {/* STATE 1: Not Enough Charts Selected */}
              {mergeMetadata?.type === 'none' && (
                <div className="space-y-4">
                  {/* Chart Selection Indicator */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Charts Selected</span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                          mergeMetadata.selectedCount === 0 ? 'bg-gray-200 text-gray-600' :
                          mergeMetadata.selectedCount === 1 ? 'bg-blue-100 text-blue-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {mergeMetadata.selectedCount}
                        </span>
                        <span className="text-sm text-gray-600">out of 2</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Steps to Merge</h4>
                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Select the charts</li>
                      <li>Read the properties of upcoming merged chart, or Give additional context to AI</li>
                      <li>Click on the Merge button</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* STATE 2: No AI Required - Deterministic Merge */}
              {mergeMetadata?.type === 'no-ai-required' && (
                <div className="space-y-4">
                  {/* Chart Selection Indicator */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Charts Selected</span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold bg-teal-100 text-teal-700">
                          2
                        </span>
                        <span className="text-sm text-gray-600">out of 2</span>
                      </div>
                    </div>
                  </div>

                  {/* Merge Preview */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      Merged chart will have {mergeMetadata.totalVariables} variable{mergeMetadata.totalVariables !== 1 ? 's' : ''}:
                    </h4>
                    
                    {mergeMetadata.variables.dimensions.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Dimensions</p>
                        <div className="flex flex-wrap gap-2">
                          {mergeMetadata.variables.dimensions.map(dim => (
                            <span 
                              key={dim}
                              className={`px-2 py-1 text-xs rounded ${
                                mergeMetadata.variables.common?.dimensions.includes(dim)
                                  ? 'bg-green-100 text-green-800 font-medium'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {dim} {mergeMetadata.variables.common?.dimensions.includes(dim) && '(common)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {mergeMetadata.variables.measures.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Measures</p>
                        <div className="flex flex-wrap gap-2">
                          {mergeMetadata.variables.measures.map(meas => (
                            <span 
                              key={meas}
                              className={`px-2 py-1 text-xs rounded ${
                                mergeMetadata.variables.common?.measures.includes(meas)
                                  ? 'bg-green-100 text-green-800 font-medium'
                                  : 'bg-orange-100 text-orange-800'
                              }`}
                            >
                              {meas} {mergeMetadata.variables.common?.measures.includes(meas) && '(common)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <Button
                    onClick={async () => {
                      await mergeSelectedCharts();
                      // Don't close panel - mergeSuccess state will show success UI
                    }}
                    className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Merge
                  </Button>
                </div>
              )}

              {/* STATE 3: AI Needed for Merging */}
              {mergeMetadata?.type === 'ai-assist' && (
                <div className="space-y-4">
                  {/* Chart Selection Indicator */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Charts Selected</span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold bg-teal-100 text-teal-700">
                          2
                        </span>
                        <span className="text-sm text-gray-600">out of 2</span>
                      </div>
                    </div>
                  </div>

                  {/* Available Variables Info */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Available Variables</h4>
                    <div className="space-y-2 text-sm">
                      {mergeMetadata.variables.dimensions.length > 0 && (
                        <div>
                          <span className="text-gray-600">Dimensions: </span>
                          <span className="text-gray-800 font-medium">
                            {mergeMetadata.variables.dimensions.join(', ')}
                          </span>
                        </div>
                      )}
                      {mergeMetadata.variables.measures.length > 0 && (
                        <div>
                          <span className="text-gray-600">Measures: </span>
                          <span className="text-gray-800 font-medium">
                            {mergeMetadata.variables.measures.join(', ')}
                          </span>
                        </div>
                      )}
                </div>
              </div>

              {/* Input Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What are you trying to analyze?
                </label>
                <textarea
                      className="w-full min-h-[80px] p-3 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={mergeContextText}
                  onChange={(e) => setMergeContextText(e.target.value)}
                      placeholder="Provide context about your analysis goal to help AI select the most relevant variables. e.g., I want to understand the relationship between sales and customer segments..."
                    />
                  </div>

                  {/* API Key Warning */}
                  {!apiKey && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-800">
                        ⚠️ Please configure your API key in Settings to use AI-assisted merge.
                </p>
              </div>
                  )}

                  {/* Action Button */}
                  <DesignButton
                    variant="accent"
                    size="lg"
                    className="w-full gap-2"
                    onClick={async () => {
                      if (!mergeContextText.trim()) {
                        alert('Please provide context about what you want to analyze');
                        return;
                      }
                      
                      const [c1, c2] = selectedCharts;
                      await performAIAssistedMerge(c1, c2, mergeContextText);
                      
                      // Don't close panel - mergeSuccess state will show success UI
                    setPendingMergeCharts(null);
                    setMergeContextText('');
                  }}
                  disabled={!mergeContextText.trim() || !apiKey}
                >
                  <Sparkles size={16} />
                  {apiKey ? 'Merge with AI' : 'Configure API Key First'}
                  </DesignButton>
              </div>
              )}

              {/* STATE 4: Success - Charts Merged */}
              {mergeSuccess && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-emerald-600 mt-1 text-2xl">🎉</div>
                      <div>
                        <h3 className="font-medium text-emerald-900 mb-1">Charts Merged Successfully!</h3>
                        <p className="text-sm text-emerald-800">
                          Your merged chart has been created and added to the canvas.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">What's next?</h4>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                      <li>The new merged chart is connected to its parent charts</li>
                      <li>You can interact with it like any other chart</li>
                      <li>Select 2 more charts to create another merge</li>
                    </ul>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => {
                        setMergePanelOpen(false);
                        setMergeMetadata(null);
                        setMergeSuccess(false);
                      }}
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </SlidingPanel>
      )}

      {/* Main Canvas - Responsive to Report Panel */}
      <div className="flex-1 relative flex">
        {/* Canvas Area */}
        <div 
          className="flex-1 relative transition-all duration-300"
          style={{
            marginRight: reportPanelOpen ? 'var(--size-panel-lg)' : '0'
          }}
        >
          {USE_TLDRAW ? (
            /* TLDraw Canvas Implementation */
            <CanvasAdapter
              useTLDraw={true}
              editorRef={tldrawEditorRef}
              nodes={nodesWithSelection}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onChartSelect={handleChartSelect}
              onNodeClick={(event) => {
                // TLDraw passes { node } object
                const node = event.node || event;
                
                // For other node types, prevent clicks on interactive elements
                if (event.target) {
                  const target = event.target;
                  const isInteractiveElement = target.closest('button') || 
                                             target.closest('[role="button"]') || 
                                             target.closest('[role="menu"]') || 
                                             target.closest('[role="menuitem"]') ||
                                             target.closest('input') ||
                                             target.closest('select') ||
                                             target.closest('textarea') ||
                                             target.closest('.tiptap') ||
                                             target.closest('[data-radix-collection-item]');
                  
                  if (isInteractiveElement) {
                    return;
                  }
                }
              }}
              onPaneClick={onPaneClick}
              reportPanelOpen={reportPanelOpen}
              fitView
              style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
            />
          ) : (
            /* React Flow Canvas Implementation (Original) */
            <CustomReactFlow
              nodes={nodesWithSelection}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onPaneClick={onPaneClick}
              onNodeClick={(event, node) => {
                // Disable React Flow's built-in node selection for chart nodes
                // Selection is now handled exclusively through checkboxes
                if (node.type === 'chart') {
                  event.stopPropagation();
                  return;
                }
                
                // For other node types (textbox, expression, etc.), allow normal interaction
                // but prevent clicks on interactive elements
                const target = event.target;
                const isInteractiveElement = target.closest('button') || 
                                           target.closest('[role="button"]') || 
                                           target.closest('[role="menu"]') || 
                                           target.closest('[role="menuitem"]') ||
                                           target.closest('input') ||
                                           target.closest('select') ||
                                           target.closest('textarea') ||
                                           target.closest('.tiptap') ||
                                           target.closest('[data-radix-collection-item]');
                
                if (isInteractiveElement) {
                  event.stopPropagation();
                  return;
                }
              }}
              fitView
              style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
              zoomOnScroll={false}
              zoomOnPinch={true}
              panOnScroll={true}
              panOnScrollMode="free"
              preventScrolling={false}
              // Enable viewport culling for better performance with many charts
              onlyRenderVisibleElements={true}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              maxZoom={3}
              minZoom={0.1}
              snapToGrid={false}
              // snapGrid={[16, 16]}  // Disable snapping for now
              deleteKeyCode="Delete"
              multiSelectionKeyCode="Meta"
              selectionKeyCode="Shift"
            >
              <MiniMap 
                nodeColor={getMinimapNodeColor}
                nodeStrokeWidth={3}
                style={{
                  backgroundColor: '#f8fafc',
                  width: 200,
                  height: 150,
                }}
                position="bottom-right"
              />
              <Controls 
                style={{ 
                  position: 'absolute', 
                  bottom: '10px', 
                  right: '230px',
                  left: 'auto',
                  transition: 'right 300ms ease'
                }} 
                className="modern-controls"
              />
              <Background gap={16} />
            </CustomReactFlow>
          )}
          
          {/* Arrow preview line when creating arrow */}
          {activeTool === 'arrow' && arrowStart && (
            <div className="absolute top-4 left-4 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg text-sm font-medium z-10">
              Click to set arrow end point
            </div>
          )}
          
          {/* Settings Panel - Positioned near sidebar when open */}
          {showSettings && (
            <div 
              className="absolute transition-all duration-300"
              style={{
                top: 'var(--space-4)',
                left: 'calc(var(--size-sidebar) + var(--space-4))',
                zIndex: 'var(--z-fixed)'
              }}
            >
              {renderSettingsPanel()}
            </div>
          )}
        </div>
        
        {/* Report Panel - Fixed Position */}
        <div 
          className="absolute top-0 right-0 h-full transition-transform duration-300"
          style={{
            width: 'var(--size-panel-lg)',
            transform: reportPanelOpen ? 'translateX(0)' : 'translateX(100%)'
          }}
        >
          <ReportPanel
            isOpen={reportPanelOpen}
            onClose={() => setReportPanelOpen(false)}
            reportItems={reportItems}
            onUpdateItems={setReportItems}
          />
        </div>
      </div>
      
      {/* Learning Modal */}
      {showLearningModal && <LearningModal />}
    </div>
  );
}

/**
 * App Component (Main Entry Point)
 * Root component that wraps ReactFlowWrapper with ReactFlowProvider context.
 * Provides React Flow context to all child components for canvas interactions.
 * 
 * @returns {JSX.Element} The complete D.Fuse application
 */
export default function App() {
  return (
    <ReactFlowProvider>
      <ReactFlowWrapper />
    </ReactFlowProvider>
  );
}
