import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, ReactFlowProvider, useStore, useReactFlow } from 'react-flow-renderer';
import Plot from 'react-plotly.js';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Button, Badge, Card, CardHeader, CardContent, FileUpload, RadioGroup, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui';
import { MousePointer2, MoveUpRight, Type, SquareSigma, Merge, X, ChartColumn, Funnel, SquaresExclude, Menu, BarChart, Table, Send, File, Sparkles, PieChart, Circle, TrendingUp, BarChart2, Settings, Check, Eye, EyeOff, Edit, GitBranch, AlignStartVertical, MenuIcon, Upload, Calculator, ArrowRight, Download, Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, BookOpen } from 'lucide-react';
import { marked } from 'marked';
import './tiptap-styles.css';

// Backend API endpoint URL
//const API = 'http://localhost:8000';
// Replace line 13 with:
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
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
      return {
        data: [{
          type: 'bar',
          x: data.map(r => r[xKey]),
          y: data.map(r => r[yKey] || 0),
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
      return {
        data: [{
          type: 'pie',
          labels: data.map(r => r[labelKey]),
          values: data.map(r => r[valueKey] || 0),
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
      return {
        data: [{
          type: 'scatter',
          mode: 'markers',
          x: data.map(r => r[xKey] || 0),
          y: data.map(r => r[yKey] || 0),
          text: data.map(r => r[labelKey]),
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
          name: truncateLabel(measure), // Truncate long legend labels
          x: xValues,
          y: xValues.map(v => (data.find(r => r[xKey] === v)?.[measure]) ?? 0),
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
            x: xValues,
            y: m1Values,
            yaxis: 'y',
            line: { color: '#3182ce', width: 3 },
            marker: { color: '#3182ce', size: 8 }
          },
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: m2,
            x: xValues,
            y: m2Values,
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
        const category = row[dim1];    // First dimension (e.g., Category)
        const product = row[dim2];     // Second dimension (e.g., Product)
        const value = row[measure] || 0; // Measure value
        
        if (category && product) { // Ensure valid values
          if (!groups[product]) groups[product] = {};
          groups[product][category] = value;
        }
      });
      
      const uniqueProducts = [...new Set(data.map(r => r[dim2]))];
      const uniqueCategories = [...new Set(data.map(r => r[dim1]))];
      
      const chartData = uniqueProducts.map((product, i) => ({
        type: 'bar',
        name: truncateLabel(product), // Truncate long legend labels
        x: uniqueCategories,
        y: uniqueCategories.map(cat => groups[product]?.[cat] || 0),
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
          x: validData.map(r => r[dim2]), // Product names directly
          y: validData.map(r => r[dim1]), // Category names directly
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
      return {
        data: [{
          type: 'scatter',
          mode: 'lines+markers',
          x: data.map(r => r[xKey]),
          y: data.map(r => r[yKey] || 0),
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
const ChartNode = function ChartNode({ data, id, selected, onSelect, apiKey, selectedModel, setShowSettings, updateTokenUsage, onAddToReport, setReportPanelOpen, onResizeStart, onResizeEnd }) {
  const { title, figure, isFused, strategy, stats, agg, dimensions = [], measures = [], onAggChange, onShowTable, table = [] } = data;
  const [menuOpen, setMenuOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [aiExploreOpen, setAiExploreOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showTableView, setShowTableView] = useState(false);
  const [insightSticky, setInsightSticky] = useState(null);
  
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
  
  // Use ref to prevent state reset during React Flow re-renders
  const aiExploreRef = useRef(false);
  const plotlyRef = useRef(null);
  const chartContainerRef = useRef(null);
  
  // Cleanup Plotly instance on unmount for performance
  useEffect(() => {
    // Completely remove cleanup to avoid any interference with Plotly's internal state
    // Let React and Plotly handle their own cleanup naturally
    return () => {
      // No cleanup to avoid null reference errors
    };
  }, []);
  
  // Chart type switching state
  const defaultChartType = getDefaultChartType(dimensions.length, measures.length);
  const [chartType, setChartType] = useState(defaultChartType.id);
  const [currentFigure, setCurrentFigure] = useState(figure);
  const [hasUserChangedType, setHasUserChangedType] = useState(false);
  
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

  // Cleanup effect to prevent memory leaks
  useEffect(() => {
    return () => {
      // Comprehensive Plotly cleanup when component unmounts
      try {
        // Find all Plotly divs that might be related to this chart
        const plotlyDivs = document.querySelectorAll('.js-plotly-plot');
        plotlyDivs.forEach(plotlyDiv => {
          if (plotlyDiv && plotlyDiv._fullLayout) {
            // Clean up Plotly internal references
            plotlyDiv._hoverlayer = null;
            plotlyDiv._fullLayout = null;
            plotlyDiv._fullData = null;
            plotlyDiv._context = null;
            plotlyDiv._rehover = null;
            plotlyDiv._hoversubplot = null;
            plotlyDiv._hoverdata = null;
            plotlyDiv._hoverpoints = null;
            plotlyDiv._maindrag = null;
            plotlyDiv._mainhover = null;
            
            // Remove event listeners
            if (plotlyDiv.removeAllListeners) {
              plotlyDiv.removeAllListeners();
            }
          }
        });
        
        // Also try to find by data-id attribute
        const specificDiv = document.querySelector(`[data-id="${id}"]`);
        if (specificDiv) {
          specificDiv._hoverlayer = null;
          specificDiv._fullLayout = null;
          specificDiv._fullData = null;
          specificDiv._context = null;
          specificDiv._rehover = null;
          specificDiv._hoversubplot = null;
          specificDiv._hoverdata = null;
          specificDiv._hoverpoints = null;
          specificDiv._maindrag = null;
          specificDiv._mainhover = null;
        }
      } catch (error) {
        console.warn('Plotly cleanup warning:', error);
      }
    };
  }, [id]);

  // Restore AI explore state if it gets reset by React Flow
  useEffect(() => {
    if (aiExploreRef.current && !aiExploreOpen) {
      setAiExploreOpen(true);
    }
  }, [aiExploreOpen]);

  // Additional cleanup effect to handle node deletion
  useEffect(() => {
    return () => {
      // This runs when the component is about to be unmounted
      // Clean up any remaining Plotly references
      try {
        // Use a timeout to ensure cleanup happens after React Flow processes the deletion
        setTimeout(() => {
          const plotlyDivs = document.querySelectorAll('.js-plotly-plot');
          plotlyDivs.forEach(plotlyDiv => {
            if (plotlyDiv && plotlyDiv._hoverlayer) {
              // Set hoverlayer to null to prevent errors
              plotlyDiv._hoverlayer = null;
            }
          });
        }, 100);
      } catch (error) {
        // Silently handle any cleanup errors
      }
    };
  }, []);

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
      
      setChartDimensions({ width: newWidth, height: newHeight });
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
  }, [chartDimensions, onResizeStart, onResizeEnd, id]);

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
  
  const handleSelect = (e) => {
    e.stopPropagation();
    onSelect(id);
  };

  // Handle selection only for specific areas (not buttons or plot area)
  const handleChartAreaClick = (e) => {
    // Only select if clicking directly on empty container areas
    // NOT on plot area (users need that for data interaction)
    const target = e.target;
    const currentTarget = e.currentTarget;
    
    // Check what was clicked
    const isPlotElement = target.closest('.js-plotly-plot') || 
                         target.closest('.main-svg') || 
                         target.closest('.plotly') ||
                         target.closest('svg');
    const isButton = target.closest('button') || target.closest('[role="button"]') || target.closest('[data-radix-collection-item]');
    const isDropdown = target.closest('[role="menu"]') || target.closest('[role="menuitem"]') || target.closest('[data-radix-popper-content-wrapper]');
    const isInteractiveElement = target.closest('input') || target.closest('select') || target.closest('textarea');
    
    // Only allow selection if clicking directly on the empty container
    // NOT on plot elements, buttons, dropdowns, or other interactive elements
    if (target === currentTarget && !isButton && !isDropdown && !isPlotElement && !isInteractiveElement) {
      handleSelect(e);
    }
  };
  
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
  
  const handleAIExplore = async () => {
    if (!aiQuery.trim() || aiLoading) return;
    
    // Check if API key is configured
    const currentApiKey = apiKey || localStorage.getItem('gemini_api_key');
    const currentModel = selectedModel || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    
    if (!currentApiKey.trim()) {
      setAiResult({
        success: false,
        answer: '⚠️ Please configure your Gemini API key in Settings first.'
      });
      setShowSettings(true);
      return;
    }
    
    setAiLoading(true);
    setShowTableView(false);  // Reset to text view for new queries
    try {
      const response = await fetch(`${API}/ai-explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          user_query: aiQuery.trim(),
          api_key: currentApiKey,
          model: currentModel
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
      
      // AI analysis completed with generated Python code
      
      // Store AI result for display
      setAiResult(result);
      
      // Keep the query visible and don't close the section for easier follow-up questions
      // setAiQuery('');
      // setAiExploreOpen(false);
      setMenuOpen(false);
      
    } catch (error) {
      console.error('AI exploration failed:', error);
      setAiResult({
        success: false,
        answer: `AI exploration failed: ${error.message}. ${error.message.includes('401') || error.message.includes('403') ? 'Please check your API key in Settings.' : ''}`
      });
    } finally {
      setAiLoading(false);
    }
  };

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
      const response = await fetch(`${API}/chart-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          api_key: currentApiKey,
          model: currentModel
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
      
      // Show sticky note with insights
      setInsightSticky({
        insight: result.insight,
        statistics: result.statistics
      });
      
    } catch (error) {
      console.error('Generate insights failed:', error);
      alert(`Failed to generate insights: ${error.message}. ${error.message.includes('401') || error.message.includes('403') ? 'Please check your API key in Settings.' : ''}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddToReport = async () => {
    if (!apiKey || !apiKey.trim()) {
      alert('⚠️ Please configure your Gemini API key in Settings first.');
      setShowSettings(true);
      return;
    }
    
    setMenuOpen(false);
    setAiLoading(true);
    
    try {
      // Step 1: Capture chart as image using Plotly's toImage which includes all elements
      const chartElement = document.querySelector(`[data-id="${id}"] .js-plotly-plot`);
      if (!chartElement) {
        throw new Error('Chart not found');
      }
      
      // Try to use Plotly.toImage (includes all chart elements) with fallback to canvas method
      let chartImage;
      const Plotly = window.Plotly;
      
      if (Plotly && Plotly.toImage) {
        // Preferred method: Use Plotly.toImage to capture complete chart with title, axes, and legend
        try {
          chartImage = await Plotly.toImage(chartElement, {
            format: 'png',
            width: chartDimensions.width || 800,
            height: chartDimensions.height || 500,
            scale: 2 // Higher resolution for better quality in reports
          });
        } catch (error) {
          console.warn('Plotly.toImage failed, falling back to canvas method:', error);
          chartImage = null;
        }
      }
      
      // Fallback: Canvas-based capture if Plotly.toImage is not available or fails
      if (!chartImage) {
        const svgElement = chartElement.querySelector('.main-svg');
        if (!svgElement) {
          throw new Error('Chart SVG not found');
        }
        
        const bbox = svgElement.getBoundingClientRect();
        const width = bbox.width || 800;
        const height = bbox.height || 500;
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        chartImage = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load chart image'));
          };
          img.src = url;
        });
      }
      
      // Step 2: Call backend to generate report section
      const response = await fetch(`${API}/generate-report-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          api_key: apiKey,
          model: selectedModel,
          ai_explore_result: aiResult?.answer || null
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      const result = await response.json();
      
      // Step 3: Update token usage
      if (result.token_usage) {
        updateTokenUsage(result.token_usage);
      }
      
      // Step 4: Add to report - Create image and text items
      const imageItem = {
        id: `image-${Date.now()}`,
        type: 'image',
        imageUrl: chartImage
      };
      
      const textItem = {
        id: `text-${Date.now()}`,
        type: 'text',
        content: result.report_section
      };
      
      // Call parent handler with both items
      if (onAddToReport) {
        onAddToReport([imageItem, textItem]);
      }
      
      // Auto-open report panel
      setReportPanelOpen(true);
      
    } catch (error) {
      console.error('Add to report failed:', error);
      // Show error in console, no alert needed as report panel will open
      console.error(`Failed to add to report: ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };
  
  // Calculate plot height (subtract header and padding from total height)
  const plotHeight = Math.max(chartDimensions.height - 80, 200);
  
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
      {/* Clean Header with Title and Menu */}
      <div className="flex items-center justify-between mb-2">
        <div 
          className="flex-1 cursor-pointer" 
          onClick={handleSelect}
        >
          <div className="font-semibold">{title}</div>
        </div>
        
        {/* Chart Type Selector - show for charts with supported dimension/measure combinations */}
        {(() => {
          // Normalize dimensions and measures for chart type selection
          // Remove 'count' from dimensions but treat 'count' measure as valid for single-var charts
          const normalizedDimensions = dimensions?.filter(d => d !== 'count') || [];
          const normalizedMeasures = measures || [];
          
          const dims = normalizedDimensions.length;
          // For single variable charts with 'count' measure, treat as 1 measure for chart type purposes
          const meas = normalizedMeasures.length;
          
          const supportedTypes = getSupportedChartTypes(dims, meas);
          
          // Show selector if multiple chart types are supported
          // Now we support 3-variable charts too!
          const showSelector = supportedTypes.length > 1;
          
          return showSelector ? (
            <ChartTypeSelector
              dimensions={normalizedDimensions}
              measures={normalizedMeasures}
              currentType={chartType}
              onTypeChange={handleChartTypeChange}
            />
          ) : null;
        })()}
        
        <div className="flex items-center space-x-2" style={{ zIndex: 1000, position: 'relative' }}>
          {/* AI Explore Button */}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              const newState = !aiExploreOpen;
              setAiExploreOpen(newState);
              aiExploreRef.current = newState;
            }}
            variant={aiExploreOpen ? "default" : "ghost"}
            size="icon"
            title={aiExploreOpen ? "Close AI Explorer" : "Explore with AI"}
            className={`transition-all duration-200 ${aiExploreOpen ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
            style={{ zIndex: 1000, position: 'relative' }}
          >
            <Sparkles size={16} />
          </Button>
          
          {/* Chart Options Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-10 w-10 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              style={{ zIndex: 1000, position: 'relative' }}
            >
              <Menu size={16} />
            </DropdownMenuTrigger>
            
            <DropdownMenuContent 
              isOpen={menuOpen} 
              onClose={() => setMenuOpen(false)}
            >
              <DropdownMenuLabel>Chart Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Show Table Option */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onShowTable?.(id);
                  setMenuOpen(false);
                }}
              >
                <Table size={14} className="mr-2" />
                Data Table
              </DropdownMenuItem>
              
              {/* Toggle Stats Option */}
              {stats && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatsVisible(!statsVisible);
                    setMenuOpen(false);
                  }}
                >
                  <BarChart size={14} className="mr-2" />
                  {statsVisible ? 'Hide' : 'Show'} Statistics
                </DropdownMenuItem>
              )}
              
              {/* Add to Report Option */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToReport();
                  setMenuOpen(false);
                }}
              >
                <File size={14} className="mr-2" />
                Add to Report
              </DropdownMenuItem>
              
              {/* Aggregation Options */}
              {canChangeAgg && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Aggregation</DropdownMenuLabel>
                  {['sum', 'avg', 'min', 'max'].map(aggType => (
                    <DropdownMenuItem
                      key={aggType}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAggChange?.(id, aggType);
                        setMenuOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="capitalize">{aggType === 'avg' ? 'Average' : aggType}</span>
                        {(agg || 'sum') === aggType && (
                          <span className="text-blue-600">✓</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Chart Plot - Now with more space! */}
      <div 
        className="chart-plot-container"
        onClick={handleChartAreaClick}
      >
      {currentFigure && currentFigure.data && currentFigure.layout ? (
        <div className="plotly-container" style={{ pointerEvents: 'auto' }}>
          <Plot 
            key={`${id}-${chartType}-${chartDimensions.width}-${chartDimensions.height}`}
            data={currentFigure.data || []} 
            layout={sanitizeLayout({
              ...currentFigure.layout,
              width: chartDimensions.width - 40, // Account for padding
              height: plotHeight
            })} 
            style={{ width: '100%', height: `${plotHeight}px` }} 
            useResizeHandler={true}
            onError={(err) => {
              console.warn('Plotly error:', err);
            }}
            onInitialized={(figure, graphDiv) => {
              // Minimal initialization with defensive checks
              try {
                if (graphDiv && graphDiv._hoverlayer) {
                  graphDiv._hoverlayer.style.pointerEvents = 'auto';
                }
                // Ensure layout exists on graphDiv to prevent scroll handler errors
                if (graphDiv && !graphDiv.layout) {
                  graphDiv.layout = sanitizeLayout(currentFigure.layout || {});
                }
              } catch (e) {
                console.debug('Plotly init warning:', e);
              }
            }}
            onUpdate={(figure, graphDiv) => {
              // Defensive update handling for chart type changes
              try {
                if (graphDiv && figure && figure.layout) {
                  // Ensure layout is properly sanitized during updates
                  graphDiv.layout = sanitizeLayout(figure.layout);
                }
              } catch (e) {
                console.debug('Plotly update warning:', e);
              }
            }}
          config={{
            displayModeBar: selected, // Only show when chart is selected
            displaylogo: false,
            modeBarButtons: [
              [
                'zoomIn2d',
                'zoomOut2d',
                'resetScale2d',
                'lasso2d',
                'select2d',
                'autoScale2d',
                'toImage'
              ]
            ],
            modeBarButtonsToRemove: [
              'zoom2d',
              'pan2d',
              'toggleSpikelines',
              'sendDataToCloud',
              'editInChartStudio'
            ],
            // Position modebar outside chart area
            modeBarButtonsToAdd: [],
            toImageButtonOptions: {
              format: 'png',
              filename: title?.replace(/[^a-z0-9]/gi, '_') || 'chart',
              height: 500,
              width: 700,
              scale: 1
            },
            // Add these to prevent hover layer issues
            staticPlot: false,
            responsive: true,
            doubleClick: 'reset+autosize',
            showTips: true,
            showLink: false,
            linkText: '',
            sendData: false,
            showSources: false
          }}
        />
        </div>
      ) : (
        <div className="text-sm text-gray-500">Loading chart...</div>
      )}
      </div>

      {/* Collapsible Stats - only show when toggled */}
      {stats && statsVisible && (
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-700">
          <div className="bg-gray-50 rounded-md p-2">
            <div className="font-semibold">Sum</div>
            <div className="tabular-nums">{Number(stats.sum).toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-2">
            <div className="font-semibold">Avg</div>
            <div className="tabular-nums">{Number(stats.avg).toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-2">
            <div className="font-semibold">Max</div>
            <div className="tabular-nums">{Number(stats.max).toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-2">
            <div className="font-semibold">Min</div>
            <div className="tabular-nums">{Number(stats.min).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* AI Explore Input Box */}
      {aiExploreOpen && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Explore with AI
              </div>
              <Button
                onClick={handleGenerateInsights}
                disabled={aiLoading}
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 h-auto transition-all duration-200"
                title="Generate automatic insights for this chart"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Insights
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAIExplore();
                  }
                }}
                placeholder="Use AI to filter data, aggregate data, calculate new columns etc"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={aiLoading}
              />
              <Button
                onClick={handleAIExplore}
                disabled={!aiQuery.trim() || aiLoading}
                size="sm"
                className="px-3"
              >
                {aiLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Send size={14} />
                )}
              </Button>
            </div>
            
            {/* AI Result Display */}
            {aiResult && (
              <div className={`p-3 rounded-md text-sm ${
                aiResult.success 
                  ? 'bg-teal-50 border border-teal-200 text-teal-800' 
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <div className="flex items-start gap-2">
                  {aiResult.success ? (
                    <Sparkles className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      {/* Remove AI Analysis header for success, keep Error header */}
                      {!aiResult.success && (
                        <div className="font-medium">Error:</div>
                      )}
                      {/* Toggle Button - only show if we have table data */}
                      {aiResult.success && aiResult.has_table && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setShowTableView(false)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              !showTableView 
                                ? 'bg-teal-600 text-white' 
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            Text
                          </button>
                          <button
                            onClick={() => setShowTableView(true)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              showTableView 
                                ? 'bg-teal-600 text-white' 
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            Table
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Content Display - Text or Table View - Scrollable Container */}
                    <div className="max-h-96 overflow-y-auto">
                      {showTableView && aiResult.tabular_data && aiResult.tabular_data.length > 0 ? (
                      /* Table View */
                      <div className="space-y-3">
                        {aiResult.tabular_data.map((tableData, idx) => (
                          <DataTable key={idx} data={tableData} />
                        ))}
                        {/* Show summary text below tables */}
                        <div className="text-xs text-gray-600 mt-2">
                          {aiResult.answer.split('--- AI Analysis Details ---')[0].trim()}
                        </div>
                      </div>
                    ) : (
                      /* Text View */
                      <div className="whitespace-pre-wrap leading-relaxed space-y-2">
                        <div className="text-sm">
                          {aiResult.answer.split('--- AI Analysis Details ---')[0].trim()}
                        </div>
                        
                        {/* AI Analysis Details - show code_steps if available */}
                        {(aiResult.code_steps && aiResult.code_steps.length > 0) && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-teal-600 hover:text-teal-800 flex items-center gap-1">
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
                        {aiResult.answer.includes('--- AI Analysis Details ---') && !(aiResult.code_steps && aiResult.code_steps.length > 0) && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-gray-600 hover:text-gray-800 flex items-center gap-1">
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
                    {/* Removed dataset info display */}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Resize Handles - Only show when chart is selected */}
      {selected && (
        <>
          {/* Rendering resize handles for selected chart */}
          {/* Corner Handles */}
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize hover:bg-blue-600 transition-colors resize-handle"
            onPointerDown={(e) => {
              // NW resize handle onPointerDown
              e.preventDefault();
              e.stopPropagation();
              // Safe stopImmediatePropagation - check if method exists
              if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
              } else if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
              handleResizeStart('nw', e);
            }}
            onMouseDown={(e) => {
              // NW resize handle onMouseDown
              e.preventDefault();
              e.stopPropagation();
              // Safe stopImmediatePropagation - check if method exists
              if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
              } else if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
              handleResizeStart('nw', e);
            }}
            onClick={(e) => { 
              // NW resize handle onClick
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
              top: '-12px',
              left: '-12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              position: 'absolute',
              touchAction: 'none'
            }}
          />
          <div
            className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ne-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('ne', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
          />
          <div
            className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-sw-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('sw', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
          />
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-se-resize hover:bg-blue-600 transition-colors resize-handle"
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
              bottom: '-12px',
              right: '-12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              position: 'absolute',
              touchAction: 'none'
            }}
          />

          {/* Edge Handles */}
          <div
            className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-n-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('n', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
          />
          <div
            className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-s-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('s', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
          />
          <div
            className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-w-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('w', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
          />
          <div
            className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-e-resize hover:bg-blue-600 transition-colors resize-handle"
            onMouseDown={(e) => handleResizeStart('e', e)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-nopan="true"
            data-noselect="true"
            style={{ zIndex: 1001, pointerEvents: 'all' }}
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
            insight={insightSticky.insight}
            onClose={() => setInsightSticky(null)}
          />
        </div>
      )}
    </div>
  );
};

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
 * Automatically adjusts height to accommodate content without scrolling.
 * 
 * @param {string} insight - The insight text to display
 * @param {Function} onClose - Callback when sticky note is closed (optional, not used in UI)
 */
function InsightStickyNote({ 
  insight, 
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
      
      {/* Content */}
      <div className="text-xs text-yellow-900 whitespace-pre-wrap leading-relaxed">
        {insight}
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
    icon: 'btn-icon'
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
 * and action buttons (merge, arrange).
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
 */
function UnifiedSidebar({
  // Toggle states
  uploadPanelOpen,
  setUploadPanelOpen,
  variablesPanelOpen,
  setVariablesPanelOpen,
  activeTool,
  onToolChange,
  // Action handlers
  onMergeCharts,
  onAutoLayout,
  selectedChartsCount,
  canMerge
}) {
  const toggleButtons = [
    { 
      id: 'upload', 
      icon: Upload, 
      label: 'Upload Data', 
      onClick: () => {
        setUploadPanelOpen(!uploadPanelOpen);
        if (!uploadPanelOpen) setVariablesPanelOpen(false);
      }, 
      active: uploadPanelOpen 
    },
    { 
      id: 'variables', 
      icon: ChartColumn, 
      label: 'Variables', 
      onClick: () => {
        setVariablesPanelOpen(!variablesPanelOpen);
        if (!variablesPanelOpen) setUploadPanelOpen(false);
      }, 
      active: variablesPanelOpen 
    },
  ];
  
  const toolButtons = [
    { id: 'select', icon: MousePointer2, label: 'Select Tool' },
    { id: 'arrow', icon: ArrowRight, label: 'Arrow Tool' },
    { id: 'textbox', icon: Type, label: 'Text Tool' },
    { id: 'expression', icon: Calculator, label: 'Expression Tool' },
  ];
  
  const actionButtons = [
    { 
      id: 'merge', 
      icon: Merge, 
      label: 'Merge Charts', 
      onClick: onMergeCharts, 
      disabled: !canMerge
    },
    { 
      id: 'arrange', 
      icon: AlignStartVertical, 
      label: 'Auto Arrange', 
      onClick: onAutoLayout 
    },
  ];
  
  return (
    <div 
      className="flex flex-col items-center py-6 gap-3"
      style={{ 
        width: 'var(--size-sidebar)', 
        backgroundColor: 'var(--color-surface-elevated)',
        borderRight: '1px solid var(--color-border)'
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
            onClick={btn.onClick}
            label={btn.label}
            badge={btn.badge}
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
  const [selectedDimension, setSelectedDimension] = useState('');
  const [selectedMeasure, setSelectedMeasure] = useState('');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedCharts, setSelectedCharts] = useState([]);
  
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
        onSelect={props.data.onSelect}
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
      
      // Check for node deletions and clean up Plotly instances
      const deletionChanges = changes.filter(change => change.type === 'remove');
      if (deletionChanges.length > 0) {
        // Clean up Plotly instances for deleted nodes
        setTimeout(() => {
          try {
            const plotlyDivs = document.querySelectorAll('.js-plotly-plot');
            plotlyDivs.forEach(plotlyDiv => {
              if (plotlyDiv) {
                // Clean up all Plotly internal references
                plotlyDiv._hoverlayer = null;
                plotlyDiv._fullLayout = null;
                plotlyDiv._fullData = null;
                plotlyDiv._context = null;
                plotlyDiv._rehover = null;
                plotlyDiv._hoversubplot = null;
                plotlyDiv._hoverdata = null;
                plotlyDiv._hoverpoints = null;
                
                // Remove all event listeners
                if (plotlyDiv.removeAllListeners) {
                  plotlyDiv.removeAllListeners();
                }
                
                // Clear any remaining references
                if (plotlyDiv._maindrag) {
                  plotlyDiv._maindrag = null;
                }
                if (plotlyDiv._mainhover) {
                  plotlyDiv._mainhover = null;
                }
              }
            });
          } catch (error) {
            console.warn('Plotly cleanup during deletion:', error);
          }
        }, 50);
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

    const [c1, c2] = selectedCharts;
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
        selectable: true,
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
      
      // Create edges connecting parent charts to fused result
      setEdges(currentEdges => currentEdges.concat([
        {
          id: `${c1}-${newId}`,
          source: c1,
          target: newId,
          type: 'default',
          style: { stroke: '#94a3b8', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#94a3b8' }
        },
        {
          id: `${c2}-${newId}`,
          source: c2,
          target: newId,
          type: 'default', 
          style: { stroke: '#94a3b8', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#94a3b8' }
        }
      ]));
      
      // Clear selections after successful merge
      setSelectedCharts([]);
      
    } catch (e) {
      alert('Merge failed: ' + e.message);
    }
  }, [selectedCharts, nodes, handleChartSelect, getViewportCenter]);

  // Update aggregation on an existing chart node
  const updateChartAgg = useCallback(async (nodeId, newAgg) => {
    
    setNodes(currentNodes => {
      const node = currentNodes.find(n => n.id === nodeId);
      if (!node) {
        console.log('Node not found in current nodes:', nodeId);
        return currentNodes;
      }
      
      const dims = node.data.dimensions || [];
      const meas = node.data.measures || [];
      
      // Use the global datasetId as primary source, but for fused charts we need to ensure we have it
      const currentDatasetId = datasetId || node.data.datasetId;
      
      console.log('Aggregation update debug:', { 
        nodeId, 
        newAgg, 
        dims, 
        meas, 
        datasetId, 
        nodeDatasetId: node.data.datasetId,
        currentDatasetId,
        isFused: node.data.isFused,
        strategy: node.data.strategy,
        nodeData: node.data
      });
      
      // Special handling for fused charts
      if (node.data.isFused) {
        console.warn('Aggregation changes not supported for fused charts yet');
        alert('Aggregation changes are not yet supported for fused charts. This feature is coming soon!');
        return currentNodes;
      }
      
      if (!currentDatasetId || dims.length === 0 || meas.length === 0) {
        console.warn('Missing required data for aggregation update:', { nodeId, dims, meas, currentDatasetId });
        alert(`Cannot update aggregation: Missing required data. Dataset: ${currentDatasetId ? 'OK' : 'MISSING'}, Dimensions: ${dims.length}, Measures: ${meas.length}`);
        return currentNodes;
      }

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
          
          console.log('Making aggregation API call:', { url: `${API}/charts`, body });
          
          const res = await fetch(`${API}/charts`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body) 
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            console.error('API call failed:', res.status, errorText);
            throw new Error(`HTTP ${res.status}: ${errorText}`);
          }
          
          const chart = await res.json();
          const figure = figureFromPayload(chart);
          const title = chart.title || `${(newAgg || 'sum').toUpperCase()} ${meas.join(', ')} by ${dims.join(', ')}`;
          
          console.log('Aggregation API call successful, updating node:', nodeId);
          
          setNodes(nds => nds.map(n => n.id === nodeId ? ({
            ...n,
            data: { 
              ...n.data, 
              title, 
              figure, 
              agg: (newAgg || 'sum'), 
              dimensions: chart.dimensions, 
              measures: chart.measures,
              table: chart.table || [] // Update table data for chart type switching
            }
          }) : n));
        } catch (e) {
          console.error('Aggregation update failed:', e);
          // Revert optimistic change on error
          setNodes(nds => nds.map(n => n.id === nodeId ? ({ ...n, data: { ...n.data, agg: (node.data.agg || 'sum') } }) : n));
          alert('Aggregation update failed: ' + e.message);
        }
      })();

      return updatedNodes;
    });
  }, [datasetId]);

  // Update nodes with current selection status - OPTIMIZED VERSION
  // Only update nodes that actually changed selection state to prevent unnecessary re-renders
  const nodesWithSelection = useMemo(() => {
    return nodes.map(node => {
      const isSelected = selectedCharts.includes(node.id);
      // Only create new object if selection state actually changed
      if (node.data.selected === isSelected) {
        return node; // Return same reference to prevent re-render
      }
      return {
        ...node,
        data: {
          ...node.data,
          selected: isSelected,
        }
      };
    });
  }, [nodes, selectedCharts]);

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
        x: xValues,
        y: xValues.map(v => (rows.find(r => r[xKey] === v)?.[m]) ?? 0)
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
      const data = Object.entries(groups).map(([g, arr]) => ({
        type: 'scatter', 
        mode: 'lines+markers', 
        name: g,
        x: arr.map(a => a['DimensionValue']),
        y: arr.map(a => a['Value']),
        line: { width: 3 },
        marker: { size: 8 }
      }));
      
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
          selectable: true,
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
            ai_reasoning: suggestion.reasoning
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
          selectable: true,
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
            ai_reasoning: suggestion.reasoning
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
          selectable: true,
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
            ai_reasoning: suggestion.reasoning
          } 
        }));
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
          selectable: true,
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
          selectable: true,
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
          selectable: true,
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
  const SettingsPanel = React.memo(() => {
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
  });

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

  return (
    <div className="w-screen h-screen flex">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        uploadPanelOpen={uploadPanelOpen}
        setUploadPanelOpen={setUploadPanelOpen}
        variablesPanelOpen={variablesPanelOpen}
        setVariablesPanelOpen={setVariablesPanelOpen}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onMergeCharts={mergeSelectedCharts}
        onAutoLayout={applyHierarchicalLayout}
        selectedChartsCount={selectedCharts.length}
        canMerge={selectedCharts.length === 2}
      />
      
      {/* Single Panel Container - Only one panel can be open at a time */}
      {uploadPanelOpen && (
        <SlidingPanel 
          isOpen={uploadPanelOpen} 
          title="Upload Data"
          onClose={() => setUploadPanelOpen(false)}
          size="lg"
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
                  <div className="mb-3">
                    <h3 className="font-medium text-gray-900">Dataset Analysis</h3>
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
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Dataset Summary</label>
                          {!editingMetadata && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={startEditingMetadata}
                              className="h-6 px-2 text-xs"
                            >
                              <Edit size={12} className="mr-1" />
                              Edit
                            </Button>
                          )}
                        </div>
                        
                        {editingMetadata ? (
                          <textarea
                            value={metadataDraft?.dataset_summary || ''}
                            onChange={(e) => updateMetadataDraft('dataset_summary', e.target.value)}
                            className="w-full p-2 text-sm border border-gray-300 rounded-md resize-none"
                            rows={3}
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
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {datasetAnalysis.columns?.map((column, index) => (
                            <div key={column.name} className="border border-gray-200 rounded-lg p-3 bg-white">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">{column.name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {column.dtype}
                                    </Badge>
                                    {column.missing_pct > 0 && (
                                      <Badge variant="secondary" className="text-xs">
                                        {column.missing_pct}% missing
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                      {column.unique_count} unique
                                    </Badge>
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

                      {/* Token Usage */}
                      {datasetAnalysis.token_usage && datasetAnalysis.token_usage.totalTokens > 0 && (
                        <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                          AI Analysis: {datasetAnalysis.token_usage.totalTokens} tokens used (added to Settings total)
                          {datasetAnalysis.user_edited && (
                            <span className="ml-2 text-green-600">✓ Saved</span>
                          )}
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
                  <Button 
                    className="w-full gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 active:from-purple-800 active:to-blue-800 disabled:bg-gray-300 disabled:text-gray-500" 
                    onClick={suggestCharts}
                    disabled={!goalText.trim() || !datasetAnalysis || suggestionsLoading}
                  >
                    {suggestionsLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Smart Visualise
                      </>
                    )}
                  </Button>
                  
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

      {/* Main Canvas - Responsive to Report Panel */}
      <div className="flex-1 relative flex">
        {/* Canvas Area */}
        <div 
          className="flex-1 relative transition-all duration-300"
          style={{
            marginRight: reportPanelOpen ? 'var(--size-panel-lg)' : '0'
          }}
        >
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
              // Prevent React Flow from handling node clicks when clicking on interactive elements
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
                // Don't let React Flow handle this click
                event.stopPropagation();
                return;
              }
              
              // Only handle clicks on the node background
              console.log('Node background clicked:', node.id);
            }}
            fitView
            style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
            zoomOnScroll={false}
            zoomOnPinch={true}
            panOnScroll={true}
            panOnScrollMode="free"
            preventScrolling={false}
            // Temporarily remove performance props that might cause Plotly instability
            // onlyRenderVisibleElements={true}  // This might be causing mount/unmount issues
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
          
          {/* Arrow preview line when creating arrow */}
          {activeTool === 'arrow' && arrowStart && (
            <div className="absolute top-4 left-4 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg text-sm font-medium z-10">
              Click to set arrow end point
            </div>
          )}
          
          {/* Settings Button and Panel - Responsive Position */}
          <div 
            className="absolute flex gap-2 transition-all duration-300"
            style={{
              top: 'var(--space-4)',
              right: reportPanelOpen ? 'var(--space-4)' : 'var(--space-4)',
              zIndex: 'var(--z-fixed)'
            }}
          >
            <IconButton
              icon={BookOpen}
              onClick={() => {
                if (showLearningModal) {
                  // If modal is open, close it and mark as seen
                  localStorage.setItem('dfuse_instructions_seen', 'true');
                  setShowLearningModal(false);
                } else {
                  // If modal is closed, open it
                  setShowLearningModal(true);
                }
              }}
              active={showLearningModal}
              label="User Instructions"
              size="sm"
              className="shadow-sm"
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)'
              }}
            />
            <IconButton
              icon={Settings}
              onClick={() => setShowSettings(!showSettings)}
              active={showSettings}
              label="AI Settings"
              size="sm"
              className="shadow-sm"
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)'
              }}
            />
            <IconButton
              icon={File}
              onClick={() => setReportPanelOpen(!reportPanelOpen)}
              active={reportPanelOpen}
              label={reportPanelOpen ? 'Hide Report' : 'Show Report'}
              size="sm"
              className="shadow-sm"
              style={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)'
              }}
            />
            {showSettings && <SettingsPanel />}
          </div>
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
