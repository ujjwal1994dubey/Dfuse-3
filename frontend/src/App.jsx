import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import EChartsWrapper from './charts/EChartsWrapper';
import TLDrawCanvas from './components/canvas/TLDrawCanvas';
import { Button, Badge, Card, CardHeader, CardContent, FileUpload, RadioGroup, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui';
import { MoveUpRight, Type, SquareSigma, Merge, X, ChartColumn, Funnel, SquaresExclude, Menu, BarChart, Table, Send, File, Sparkles, PieChart, Circle, TrendingUp, BarChart2, Settings, Check, Eye, EyeOff, Edit, GitBranch, MenuIcon, Upload, Download, Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, BookOpen, ArrowRightToLine, ArrowRight, CirclePlus, Plus, Minus } from 'lucide-react';
import './tiptap-styles.css';
import { ECHARTS_TYPES, getEChartsSupportedTypes, getEChartsDefaultType } from './charts/echartsRegistry';

// Backend API endpoint URL
//const API = 'http://localhost:8000';
// Replace line 13 with:
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Log configuration on app start
console.log('🎨 Canvas: TLDraw + ECharts (v3.0)');

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
 * NOTE: Currently only used once - consider inlining or removing if not needed for future features
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
 * DimensionFilterForChart Component
 * Filter panel for chart dimensions using chart's aggregated data.
 * Fetches unique values from the chart table (not full dataset).
 * 
 * @param {string} dimension - Name of the dimension to filter
 * @param {string} chartId - ID of the chart
 * @param {Array} selectedValues - Currently selected filter values
 * @param {Function} onToggle - Callback when filter values are toggled
 */
function DimensionFilterForChart({ dimension, chartId, selectedValues, onToggle }) {
  const [values, setValues] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    
    setLoading(true);
    fetch(`${API}/chart_dimension_values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart_id: chartId,
        dimension: dimension
      })
    })
    .then(res => res.json())
    .then(data => {
      setValues(data.values || []);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to fetch dimension values:', err);
      setLoading(false);
    });
  }, [chartId, dimension, isExpanded]);

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-700">{dimension}</span>
        <div className="flex items-center space-x-2">
          {selectedValues.length > 0 && (
            <Badge variant="primary">{selectedValues.length}</Badge>
          )}
          <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200 p-3 max-h-48 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : (
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
          )}
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
  
  const supportedTypes = getEChartsSupportedTypes(dims, meas);
  
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
 * @param {Function} setSettingsPanelOpen - Opens settings panel if API key is missing
 * @param {Function} updateTokenUsage - Updates token usage metrics
 */
const ChartNode = React.memo(function ChartNode({ data, id, selected, apiKey, selectedModel, setSettingsPanelOpen, updateTokenUsage, onResizeStart, onResizeEnd }) {
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
  
  // Use ref to prevent state reset during re-renders
  const chartContainerRef = useRef(null);
  
  // Chart type switching state
  const defaultChartType = getEChartsDefaultType(dimensions.length, measures.length);
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
        const chartTypeConfig = ECHARTS_TYPES[chartType.toUpperCase()];
        
        // Check if we have data
        const hasData = Array.isArray(table) && table.length > 0;
                       
        if (chartTypeConfig && hasData) {
          const payload = {
            dimensions: dimensions,
            measures: measures,
            strategy: strategy ? { type: strategy } : undefined
          };
          const option = chartTypeConfig.createOption(table, payload);
          const newFigure = {
            data: [],
            layout: option
          };
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
      // Regenerate figure with new chart type using ECharts registry
      const chartTypeConfig = ECHARTS_TYPES[newChartType.toUpperCase()];
      
      // Check if we have data
      const hasData = Array.isArray(table) && table.length > 0;
      
      if (chartTypeConfig && hasData) {
        const payload = {
          dimensions: dimensions,
          measures: measures,
          strategy: strategy ? { type: strategy } : undefined
        };
        
        const option = chartTypeConfig.createOption(table, payload);
        const newFigure = {
          data: [],
          layout: option
        };
        
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
      setSettingsPanelOpen(true);
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
  
  // Memoize layout to prevent unnecessary rerenders
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
  
  // Memoize chart initialization callback
  const handleChartInit = useCallback((figure, graphDiv) => {
    try {
      if (graphDiv && graphDiv._hoverlayer) {
        graphDiv._hoverlayer.style.pointerEvents = 'auto';
      }
      if (graphDiv && !graphDiv.layout) {
        graphDiv.layout = sanitizeLayout(currentFigure.layout || {});
      }
    } catch (e) {
      console.debug('Chart init warning:', e);
    }
  }, [currentFigure.layout]);
  
  // Memoize chart update callback
  const handleChartUpdate = useCallback((figure, graphDiv) => {
    try {
      if (graphDiv && figure && figure.layout) {
        graphDiv.layout = sanitizeLayout(figure.layout);
      }
    } catch (e) {
      console.debug('Chart update warning:', e);
    }
  }, []);
  
  // Allow aggregation changes for non-fused charts and simple fused charts (1D+1M, 2D+1M, 1D+2M)
  const canChangeAgg = Array.isArray(dimensions) && dimensions.length >= 1 && Array.isArray(measures) && measures.length >= 1 && (agg || 'sum') !== 'count' && (
    !isFused || // Allow all non-fused charts
    (isFused && dimensions.length <= 2 && measures.length <= 2 && (dimensions.length + measures.length >= 2) && (dimensions.length + measures.length <= 3)) // Allow 1D+1M, 2D+1M, 1D+2M fused charts
  );
  
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
          className="chart-container" 
          style={{ pointerEvents: 'auto', minHeight: `${plotHeight}px` }}
          data-chart-id={id}
        >
          <EChartsWrapper
            data={memoizedData} 
            layout={memoizedLayout} 
            style={{ width: '100%', height: `${plotHeight}px` }}
            onInitialized={handleChartInit}
            onUpdate={handleChartUpdate}
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
      prevProps.onResizeStart === nextProps.onResizeStart &&
      prevProps.onResizeEnd === nextProps.onResizeEnd) {
    return true; // Props are equal, skip re-render
  }
  
  return false; // Props changed, re-render
});


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
    'h-full flex flex-col overflow-hidden transition-all duration-300',
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
 * Includes panel toggles (upload, variables, chart actions, merge, instructions, settings).
 * 
 * @param {boolean} uploadPanelOpen - Whether upload panel is currently open
 * @param {Function} setUploadPanelOpen - Toggle upload panel visibility
 * @param {boolean} variablesPanelOpen - Whether variables panel is currently open
 * @param {Function} setVariablesPanelOpen - Toggle variables panel visibility
 * @param {boolean} chartActionsPanelOpen - Whether chart actions panel is currently open
 * @param {Function} setChartActionsPanelOpen - Toggle chart actions panel visibility
 * @param {boolean} mergePanelOpen - Whether merge panel is currently open
 * @param {Function} setMergePanelOpen - Toggle merge panel visibility
 * @param {boolean} instructionsPanelOpen - Whether instructions panel is currently open
 * @param {Function} setInstructionsPanelOpen - Toggle instructions panel visibility
 * @param {boolean} settingsPanelOpen - Whether settings panel is currently open
 * @param {Function} setSettingsPanelOpen - Toggle settings panel visibility
 * @param {string} activeTool - Currently active tool ID
 * @param {Function} onToolChange - Callback when tool selection changes
 * @param {Function} onMergeCharts - Callback to merge selected charts
 * @param {number} selectedChartsCount - Number of currently selected charts
 * @param {boolean} canMerge - Whether merge action is enabled (requires exactly 2 charts)
 * @param {Object} selectedChartForActions - Currently selected chart object for actions (or null)
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
  instructionsPanelOpen,
  setInstructionsPanelOpen,
  settingsPanelOpen,
  setSettingsPanelOpen,
  activeTool,
  onToolChange,
  // Action handlers
  onMergeCharts,
  selectedChartsCount,
  canMerge,
  selectedChartForActions
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
          setInstructionsPanelOpen(false);
          setSettingsPanelOpen(false);
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
          setInstructionsPanelOpen(false);
          setSettingsPanelOpen(false);
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
          setInstructionsPanelOpen(false);
          setSettingsPanelOpen(false);
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
        setInstructionsPanelOpen(false);
        setSettingsPanelOpen(false);
      }, 
      active: mergePanelOpen
      // No disabled state - always accessible
    },
    // Separator indicator
    { id: 'separator-1', isSeparator: true },
    // App control buttons (moved from bottom)
    {
      id: 'instructions',
      icon: BookOpen,
      label: 'User Instructions',
      active: instructionsPanelOpen,
      onClick: () => {
        setInstructionsPanelOpen(!instructionsPanelOpen);
        if (!instructionsPanelOpen) {
          setUploadPanelOpen(false);
          setVariablesPanelOpen(false);
          setChartActionsPanelOpen(false);
          setMergePanelOpen(false);
          setSettingsPanelOpen(false);
        }
      }
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'AI Settings',
      active: settingsPanelOpen,
      onClick: () => {
        setSettingsPanelOpen(!settingsPanelOpen);
        if (!settingsPanelOpen) {
          setUploadPanelOpen(false);
          setVariablesPanelOpen(false);
          setChartActionsPanelOpen(false);
          setMergePanelOpen(false);
          setInstructionsPanelOpen(false);
        }
      }
    }
  ];
  
  const toolButtons = [
    // Removed arrow, sticky note, and expression tools
    // These features are either provided by TLDraw natively or no longer needed
  ];
  
  return (
    <div 
      className="fixed z-[1100] flex flex-col items-center py-6 gap-3 transition-all duration-300"
      style={{ 
        left: '12px',
        top: '60px',
        width: 'var(--size-sidebar)', 
        backgroundColor: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      {/* Logo */}
      <div className="mb-4">
        <SquaresExclude size={32} className="text-primary" />
      </div>
      
      {/* Toggle Buttons with Inline Separators */}
      <div className="flex flex-col gap-2">
        {toggleButtons.map(btn => {
          // Render separator
          if (btn.isSeparator) {
            return (
              <div 
            key={btn.id}
                className="my-1"
        style={{
          width: '32px',
          height: '1px',
          backgroundColor: 'var(--color-border)'
        }}
      />
            );
          }
          // Render regular button
          return (
          <IconButton
            key={btn.id}
            icon={btn.icon}
            active={btn.active}
              disabled={btn.disabled}
            onClick={btn.onClick}
            label={btn.label}
            size="md"
          />
          );
        })}
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
    <Panel isOpen={isOpen} size={size} position="left" className="rounded-xl">
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
 * Consolidates chart type selection, aggregation, data table toggle, report addition, chart insights, and AI queries
 * 
 * @param {boolean} isOpen - Whether panel is currently visible
 * @param {Object} selectedChart - Currently selected chart node
 * @param {Function} onClose - Callback when panel is closed
 * @param {string} apiKey - Gemini API key
 * @param {string} selectedModel - Selected AI model
 * @param {Function} setSettingsPanelOpen - Function to open settings panel
 * @param {Function} updateTokenUsage - Function to track token usage
 * @param {Function} onChartTypeChange - Callback to change chart type
 * @param {Function} onAggChange - Callback to change aggregation
 * @param {Function} onShowTable - Callback to show data table
 * @param {Object} tldrawEditorRef - Reference to TLDraw editor for creating sticky notes
 */
function ChartActionsPanel({ 
  isOpen,
  selectedChart, 
  onClose,
  apiKey,
  selectedModel,
  setSettingsPanelOpen,
  updateTokenUsage,
  onChartTypeChange,
  onAggChange,
  onShowTable,
  tldrawEditorRef,
  onChartUpdate,
  scrollToAI,
  setScrollToAI
}) {
  // AI state
  const [aiQuery, setAiQuery] = useState('');
  const aiQuerySectionRef = useRef(null);
  const aiQueryTextareaRef = useRef(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  
  // Local state for buttons
  const [showTableClicked, setShowTableClicked] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  
  // Filter state
  const [dimensionFilters, setDimensionFilters] = useState({});
  const [filterApplying, setFilterApplying] = useState(false);
  
  // Update local state when selected chart changes
  useEffect(() => {
    if (selectedChart) {
      // Reset AI results and button states when chart changes
      setAiResult(null);
      setShowTableClicked(false);
      setInsightsLoading(false);
      // Initialize filters from chart data
      setDimensionFilters(selectedChart.data?.filters || {});
    }
  }, [selectedChart?.id]);
  
  // Handle scroll to AI section when triggered from toolbar
  useEffect(() => {
    if (scrollToAI && aiQuerySectionRef.current) {
      // Delay to ensure panel is fully mounted and rendered
      setTimeout(() => {
        aiQuerySectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Add highlight flash animation
        aiQuerySectionRef.current?.classList.add('highlight-flash');
        
        // Focus the textarea after scroll
        setTimeout(() => {
          aiQueryTextareaRef.current?.focus();
        }, 400);
        
        // Remove animation class after animation completes
        setTimeout(() => {
          aiQuerySectionRef.current?.classList.remove('highlight-flash');
          setScrollToAI?.(false); // Reset the scroll trigger
        }, 1500);
      }, 100);
    }
  }, [scrollToAI, setScrollToAI]);
  
  const handleAIExplore = async () => {
    if (!aiQuery.trim() || aiLoading || !selectedChart) return;
    
    if (!apiKey?.trim()) {
      setAiResult({
        success: false,
        answer: '⚠️ Please configure your Gemini API key in Settings first.'
      });
      setSettingsPanelOpen(true);
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
  
  const handleAddToCanvas = async () => {
    if (!tldrawEditorRef?.current || !aiResult || !aiQuery.trim()) return;
    
    try {
      // Get the selected chart shape to position textbox relative to it
      let chartShape = null;
      if (selectedChart?.id) {
        chartShape = tldrawEditorRef.current.getShape(selectedChart.id);
        
        if (!chartShape) {
          const allShapes = tldrawEditorRef.current.getCurrentPageShapes();
          chartShape = allShapes.find(shape => 
            shape.id === selectedChart.id || 
            shape.id.includes(selectedChart.id) ||
            (shape.type === 'chart' && shape.props?.title === selectedChart.data?.title)
          );
        }
      }
      
      // Calculate position (below the chart if found, otherwise center of viewport)
      let textboxX, textboxY;
      if (chartShape) {
        textboxX = chartShape.x;
        textboxY = chartShape.y + (chartShape.props?.h || 400) + 50;
      } else {
        const viewport = tldrawEditorRef.current.getViewportPageBounds();
        textboxX = viewport.x + viewport.w / 2 - 200;
        textboxY = viewport.y + viewport.h / 2 - 100;
      }
      
      // Create textbox content
      const textContent = `Query: ${aiQuery}\n\nAnswer:\n${aiResult.answer}`;
      
      // Define textbox dimensions
      const textboxWidth = 400;
      const textboxHeight = 250;
      
      // Create textbox
      const { createShapeId } = await import('@tldraw/tldraw');
      const textboxId = createShapeId();
      
      tldrawEditorRef.current.createShape({
        id: textboxId,
        type: 'textbox',
        x: textboxX,
        y: textboxY,
        props: {
          w: textboxWidth,
          h: textboxHeight,
          text: textContent,
          fontSize: 12
        }
      });
      
      console.log('✅ AI result added to canvas as textbox');
    } catch (error) {
      console.error('Failed to add to canvas:', error);
      alert(`Failed to add to canvas: ${error.message}`);
    }
  };
  
  const handleGenerateInsights = async () => {
    if (insightsLoading || !selectedChart) return;
    
    // Validate API key
    if (!apiKey?.trim()) {
      alert('⚠️ Please configure your Gemini API key in Settings first.');
      setSettingsPanelOpen(true);
      return;
    }
    
    // Validate TLDraw editor reference
    if (!tldrawEditorRef?.current) {
      alert('⚠️ Canvas editor not ready. Please try again.');
      return;
    }
    
    setInsightsLoading(true);
    
    try {
      // Call chart insights API
      const response = await fetch(`${API}/chart-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: selectedChart.id,
          api_key: apiKey,
          model: selectedModel || 'gemini-2.0-flash',
          user_context: selectedChart.data?.user_goal || null
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
      
      // Get the chart shape from TLDraw to calculate position
      // Try to get shape directly first, or search through all shapes
      let chartShape = tldrawEditorRef.current.getShape(selectedChart.id);
      
      if (!chartShape) {
        // If direct lookup fails, search through all shapes for matching ID
        const allShapes = tldrawEditorRef.current.getCurrentPageShapes();
        console.log('🔍 Searching for chart shape. Looking for ID:', selectedChart.id);
        console.log('📊 Available shapes:', allShapes.map(s => ({ id: s.id, type: s.type, title: s.props?.title })));
        
        chartShape = allShapes.find(shape => 
          shape.id === selectedChart.id || 
          shape.id.includes(selectedChart.id) ||
          (shape.type === 'chart' && shape.props?.title === selectedChart.data?.title)
        );
        
        if (chartShape) {
          console.log('✅ Found chart shape:', chartShape.id);
        }
      }
      
      if (!chartShape) {
        throw new Error('Chart shape not found in canvas. Please ensure you are using TLDraw mode.');
      }
      
      // Calculate position for sticky note (to the right of chart)
      const stickyX = chartShape.x + chartShape.props.w + 50;
      const stickyY = chartShape.y;
      
      // Prepare insights text (prefer generic_insights, fallback to insight)
      const insightsContent = result.generic_insights || result.insight || 'No insights generated';
      const insightsText = `AI Generated\n\n${insightsContent}`;
      
      // Create TLDraw textbox for insights
      const { createShapeId } = await import('@tldraw/tldraw');
      const textboxId = createShapeId();
      
      // Define textbox dimensions
      const textboxWidth = 300;
      const textboxHeight = 200;
      
      tldrawEditorRef.current.createShape({
        id: textboxId,
        type: 'textbox',
        x: stickyX,
        y: stickyY,
        props: {
          w: textboxWidth,
          h: textboxHeight,
          text: insightsText,
          fontSize: 12
        }
      });
      
      console.log('✅ Chart insights generated and displayed in textbox');
      
    } catch (error) {
      console.error('Generate insights failed:', error);
      alert(`Failed to generate insights: ${error.message}`);
    } finally {
      setInsightsLoading(false);
    }
  };
  
  // Filter handling functions
  const handleFilterToggle = useCallback((dimension, value) => {
    setDimensionFilters(prev => {
      const currentValues = prev[dimension] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      
      return {
        ...prev,
        [dimension]: newValues
      };
    });
  }, []);
  
  const handleApplyFilters = useCallback(async () => {
    if (!selectedChart) return;
    
    setFilterApplying(true);
    
    try {
      const body = {
        dataset_id: selectedChart.data.datasetId,
        dimensions: selectedChart.data.dimensions,
        measures: selectedChart.data.measures,
        agg: selectedChart.data.agg,
        filters: dimensionFilters
      };
      
      console.log('🔍 Applying filters to chart:', body);
      
      const res = await fetch(`${API}/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Filter application failed: ${errorText}`);
      }
      
      const chart = await res.json();
      
      console.log('✅ Filtered chart data received:', {
        tableLength: chart.table?.length,
        filters: chart.filters
      });
      
      // Regenerate chart visualization with filtered data
      const chartType = selectedChart.data.chartType || 'bar';
      const chartConfig = ECHARTS_TYPES[chartType.toUpperCase()];
      
      if (chartConfig) {
        const option = chartConfig.createOption(chart.table, {
          dimensions: chart.dimensions,
          measures: chart.measures
        });
        
        // Update chart with filtered data
        if (onChartUpdate) {
          onChartUpdate(selectedChart.id, {
            chartData: option.series,
            chartLayout: option,
            table: chart.table,
            filters: dimensionFilters
          });
        }
      }
      
      console.log('✅ Chart updated with filtered data');
      
    } catch (error) {
      console.error('Filter application failed:', error);
      alert(`Failed to apply filters: ${error.message}`);
    } finally {
      setFilterApplying(false);
    }
  }, [selectedChart, dimensionFilters, onChartUpdate]);
  
  const handleClearFilters = useCallback(async () => {
    if (!selectedChart) return;
    
    // Clear the filters state
    setDimensionFilters({});
    
    // Re-fetch chart without filters
    setFilterApplying(true);
    
    try {
      const body = {
        dataset_id: selectedChart.data.datasetId,
        dimensions: selectedChart.data.dimensions,
        measures: selectedChart.data.measures,
        agg: selectedChart.data.agg,
        filters: {} // Empty filters = no filtering
      };
      
      console.log('🧹 Clearing filters, fetching unfiltered chart data');
      
      const res = await fetch(`${API}/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Clear filters failed: ${errorText}`);
      }
      
      const chart = await res.json();
      
      console.log('✅ Unfiltered chart data received');
      
      // Regenerate chart visualization with unfiltered data
      const chartType = selectedChart.data.chartType || 'bar';
      const chartConfig = ECHARTS_TYPES[chartType.toUpperCase()];
      
      if (chartConfig) {
        const option = chartConfig.createOption(chart.table, {
          dimensions: chart.dimensions,
          measures: chart.measures
        });
        
        // Update chart with unfiltered data
        if (onChartUpdate) {
          onChartUpdate(selectedChart.id, {
            chartData: option.series,
            chartLayout: option,
            table: chart.table,
            filters: {} // Clear filters
          });
        }
      }
      
      console.log('✅ Chart restored to unfiltered state');
      
    } catch (error) {
      console.error('Clear filters failed:', error);
      alert(`Failed to clear filters: ${error.message}`);
    } finally {
      setFilterApplying(false);
    }
  }, [selectedChart, onChartUpdate]);
  
  // Get chart type info
  const dims = selectedChart?.data?.dimensions?.filter(d => d !== 'count').length || 0;
  const meas = selectedChart?.data?.measures?.length || 0;
  const supportedTypes = selectedChart 
    ? getEChartsSupportedTypes(dims, meas)
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
            
            {/* Chart Filter Section */}
            {selectedChart?.data?.dimensions?.length > 0 && (
              <div>
                <label 
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--color-text)' }}
                >
                  Chart Filter
                </label>
                
                {/* Select Product Dropdown-style label */}
                {selectedChart.data.dimensions.length > 0 && (
                  <div className="text-xs text-gray-600 mb-2">
                    Select {selectedChart.data.dimensions.join(', ')}
                  </div>
                )}
                
                {/* Dimension Filters */}
                <div className="space-y-2 border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                  {selectedChart.data.dimensions.map(dimension => (
                    <DimensionFilterForChart
                      key={dimension}
                      dimension={dimension}
                      chartId={selectedChart.id}
                      selectedValues={dimensionFilters[dimension] || []}
                      onToggle={(value) => handleFilterToggle(dimension, value)}
                    />
                  ))}
                </div>
                
                {/* Apply Filters Button */}
                <Button
                  onClick={handleApplyFilters}
                  disabled={filterApplying}
                  className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                  size="md"
                >
                  {filterApplying ? 'Applying...' : 'Apply Filters'}
                </Button>
                
                {/* Active Filters Badge */}
                {Object.keys(dimensionFilters).some(d => dimensionFilters[d]?.length > 0) && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary">
                      {Object.values(dimensionFilters).flat().length} filters active
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} disabled={filterApplying}>
                      {filterApplying ? 'Clearing...' : 'Clear All'}
                    </Button>
                  </div>
                )}
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
              
              {/* Quick Chart Insights Button */}
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  Quick Chart Insights
                </span>
                <Button
                  onClick={handleGenerateInsights}
                  disabled={insightsLoading}
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                >
                  {insightsLoading ? (
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 animate-spin" />
                      Generating...
                    </span>
                  ) : (
                    'Generate'
                  )}
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
            <div ref={aiQuerySectionRef} className="space-y-4">
              <div>
                <label 
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--color-text)' }}
                >
                  Ask AI Query
                </label>
                <textarea
                  ref={aiQueryTextareaRef}
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
                  
                  {/* Add to Canvas Button */}
                  {aiResult.success && (
                    <Button
                      onClick={handleAddToCanvas}
                      variant="ghost"
                      className="w-full text-teal-700 hover:text-teal-800 hover:bg-teal-50 border border-teal-200"
                    >
                      <ArrowRight size={16} className="mr-2" />
                      Add to Canvas
                    </Button>
                  )}
                  
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
    case 'table':
      return '#8b5cf6'; // Purple - for table nodes
    default:
      return '#94a3b8'; // Light gray - fallback
  }
};

/**
 * Main Application Component
 * Manages all state and orchestrates the data flow.
 * Handles:
 * - Dataset upload and management
 * - Chart creation and manipulation
 * - Node and edge management for React Flow canvas
 * - Chart merging and auto-layout
 * - AI configuration and token tracking
 * - Report generation and management
 * 
 * This is the core orchestrator that connects all UI components and manages
 * the application state. It renders the layout with sidebars, panels, canvas, and report.
 */
function AppWrapper() {
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
  const [numCharts, setNumCharts] = useState(2);  // Number of charts to generate (default: 2, min: 1, max: 5)
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
  const createdStickyNotes = useRef(new Set()); // Track which charts already have sticky notes
  
  // Auto-create sticky notes for charts with preloaded insights
  useEffect(() => {
    if (!tldrawEditorRef.current) return;
    
    // Find nodes with preloadedInsights that don't have sticky notes yet
    const nodesWithInsights = nodes.filter(node => 
      node.data?.preloadedInsights?.contextInsights && 
      !createdStickyNotes.current.has(node.id)
    );
    
    if (nodesWithInsights.length === 0) return;
    
    // Wait a bit longer for TLDraw to fully render all shapes
    const timeoutId = setTimeout(async () => {
      for (const node of nodesWithInsights) {
        try {
          const editor = tldrawEditorRef.current;
          if (!editor) continue;
          
          // Try multiple ways to find the chart shape
          const possibleIds = [
            `shape:${node.id}`,
            node.id,
            `shape:ai-viz-${node.id.split('ai-viz-')[1]}`
          ];
          
          let chartShape = null;
          for (const possibleId of possibleIds) {
            chartShape = editor.getShape(possibleId);
            if (chartShape) {
              console.log(`📊 Found chart shape with ID: ${possibleId}`);
              break;
            }
          }
          
          // If still not found, search all shapes
          if (!chartShape) {
            const allShapes = editor.getCurrentPageShapes();
            console.log(`🔍 Searching through ${allShapes.length} shapes for node ${node.id}`);
            
            chartShape = allShapes.find(shape => 
              shape.type === 'chart' &&
              (shape.id.includes(node.id) || 
               shape.props?.title === node.data?.title)
            );
            
            if (chartShape) {
              console.log(`✅ Found chart by search: ${chartShape.id}`);
            }
          }
          
          if (chartShape) {
            // Create textbox to the right of chart
            const stickyX = chartShape.x + (chartShape.props?.w || 800) + 50;
            const stickyY = chartShape.y;
            
            const { createShapeId } = await import('@tldraw/tldraw');
            const textboxId = createShapeId();
            
            // Define textbox dimensions
            const textboxWidth = 300;
            const textboxHeight = 200;
            
            // Add "AI Generated" header to insights
            const insightsText = `AI Generated\n\n${node.data.preloadedInsights.contextInsights}`;
            
            editor.createShape({
              id: textboxId,
              type: 'textbox',
              x: stickyX,
              y: stickyY,
              props: {
                w: textboxWidth,
                h: textboxHeight,
                text: insightsText,
                fontSize: 12
              }
            });
            
            console.log(`📝 Created textbox for chart ${node.id}`);
            createdStickyNotes.current.add(node.id);
          } else {
            console.warn(`⚠️ Could not find chart shape for node ${node.id}`);
          }
        } catch (error) {
          console.error(`Failed to create sticky note for ${node.id}:`, error);
        }
      }
    }, 500); // 500ms delay to ensure TLDraw has rendered
    
    return () => clearTimeout(timeoutId);
  }, [nodes]);
  
  // AI-assisted merge state
  const [mergePanelOpen, setMergePanelOpen] = useState(false);
  const [mergeContextText, setMergeContextText] = useState('');
  const [pendingMergeCharts, setPendingMergeCharts] = useState(null);
  const [mergeMetadata, setMergeMetadata] = useState(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  
  // Toolbar and tools state
  const [activeTool, setActiveTool] = useState('select');
  const [nodeIdCounter, setNodeIdCounter] = useState(1000);

  
  // Sidebar panel states
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [variablesPanelOpen, setVariablesPanelOpen] = useState(false);
  const [chartActionsPanelOpen, setChartActionsPanelOpen] = useState(false);
  const [selectedChartForActions, setSelectedChartForActions] = useState(null);
  const [scrollToAI, setScrollToAI] = useState(false);
  const [instructionsPanelOpen, setInstructionsPanelOpen] = useState(() => {
    // Show instructions panel by default for first-time users
    const hasSeenInstructions = localStorage.getItem('dfuse_instructions_seen');
    return !hasSeenInstructions;
  });
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  
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
        setSettingsPanelOpen={setSettingsPanelOpen}
        updateTokenUsage={updateTokenUsage}
        onResizeStart={handleChartResizeStart}
        onResizeEnd={handleChartResizeEnd}
      />
    ),
    textbox: TextBoxNode,
    table: TableNode
  }), [handleChartResizeStart, handleChartResizeEnd]);

  // Convert a pane click event to canvas coordinates
  const toFlowPosition = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  }, []);

  // Get the center of the current viewport in canvas coordinates
  const getViewportCenter = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate center in screen coordinates
    const centerScreenX = viewportWidth / 2;
    const centerScreenY = viewportHeight / 2;
    
    // Return the center coordinates
    return {
      x: centerScreenX,
      y: centerScreenY,
    };
  }, []);

  const onNodesChange = useCallback(
    (changes) => {
      // Handle node changes from TLDraw
      // This is a simplified version since we're using TLDraw, not React Flow
      if (!changes || changes.length === 0) return;
      
      // Check for node deletions
      const deletionChanges = changes.filter(change => change.type === 'remove');
      if (deletionChanges.length > 0) {
        const idsToRemove = deletionChanges.map(change => change.id);
        setNodes((nds) => nds.filter(node => !idsToRemove.includes(node.id)));
      }
    },
    []
  );
  
  const onEdgesChange = useCallback(
    (changes) => {
      // Handle edge changes from TLDraw
      // This is a simplified version since we're using TLDraw, not React Flow
      if (!changes || changes.length === 0) return;
      
      const deletionChanges = changes.filter(change => change.type === 'remove');
      if (deletionChanges.length > 0) {
        const idsToRemove = deletionChanges.map(change => change.id);
        setEdges((eds) => eds.filter(edge => !idsToRemove.includes(edge.id)));
      }
    },
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
    
    if (activeTool === 'textbox') {
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
    }
  }, [activeTool, nodeIdCounter, toFlowPosition, datasetId]);
  
  // Tool change handler
  const handleToolChange = useCallback((toolId) => {
    setActiveTool(toolId);
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
      console.log('📊 handleShowTable called with chartId:', chartId);
      console.log('📊 Current nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
      
      // Use setNodes with functional update to get current nodes
      setNodes(currentNodes => {
        console.log('📊 Inside setNodes, currentNodes:', currentNodes.map(n => ({ id: n.id, type: n.type })));
        
        // Find the chart node to position the table next to it
        const chartNode = currentNodes.find(n => n.id === chartId);
        
        if (!chartNode) {
          console.error('❌ Chart node not found in current nodes:', chartId);
          console.error('❌ Available node IDs:', currentNodes.map(n => n.id));
          console.error('❌ Looking for exact match:', chartId);
          console.error('❌ Available nodes detail:', currentNodes.map(n => ({ 
            id: n.id, 
            type: n.type,
            matches: n.id === chartId,
            idType: typeof n.id,
            chartIdType: typeof chartId
          })));
          alert('Chart node not found');
          return currentNodes;
        }
        
        // Use the chart's current table data (already filtered and aggregated)
        const chartTable = chartNode.data.table || [];
        
        if (chartTable.length === 0) {
          console.warn('No table data available for chart:', chartId);
          alert('No table data available for this chart');
          return currentNodes;
        }
        
        // Extract headers from the first row of the table
        const headers = Object.keys(chartTable[0]);
        
        // Convert table data to rows format
        const rows = chartTable.map(row => 
          headers.map(header => row[header])
        );
        
        console.log('Using chart table data:', {
          headers,
          rowCount: rows.length,
          hasFilters: Object.keys(chartNode.data.filters || {}).length > 0,
          aggregation: chartNode.data.agg
        });
        
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
            title: `${chartNode.data.title} - Data Table`,
            headers: headers,
            rows: rows,
            totalRows: rows.length,
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

  /**
   * Handle AI Query Shortcut from Contextual Toolbar
   * Opens the chart actions panel and scrolls to the AI query section
   */
  const handleAIQueryShortcut = useCallback((chartId) => {
    console.log('🎯 AI Query shortcut triggered for chart:', chartId);
    console.log('🎯 Current nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
    
    // Find the chart node
    const chartNode = nodes.find(n => n.id === chartId);
    if (!chartNode) {
      console.error('❌ Chart node not found:', chartId);
      console.error('❌ Available node IDs:', nodes.map(n => n.id));
      return;
    }
    
    // Set the selected chart for actions
    setSelectedChartForActions(chartNode);
    
    // Close all other panels first (just like the sidebar toggle buttons do)
    setUploadPanelOpen(false);
    setVariablesPanelOpen(false);
    setMergePanelOpen(false);
    setInstructionsPanelOpen(false);
    setSettingsPanelOpen(false);
    
    // Open the chart actions panel
    setChartActionsPanelOpen(true);
    
    // Trigger scroll to AI section after a short delay to ensure panel is mounted
    setTimeout(() => {
      setScrollToAI(true);
    }, 300);
  }, [nodes]);

  /**
   * Handle Chart Insight Shortcut from Contextual Toolbar
   * Generates chart insights without opening the panel
   */
  const handleChartInsightShortcut = useCallback(async (chartId) => {
    console.log('💡 Chart Insight shortcut triggered for chart:', chartId);
    console.log('💡 Current nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
    
    // Validate API key
    if (!apiKey?.trim()) {
      alert('⚠️ Please configure your Gemini API key in Settings first.');
      setSettingsPanelOpen(true);
      return;
    }
    
    // Validate TLDraw editor reference
    if (!tldrawEditorRef?.current) {
      alert('⚠️ Canvas editor not ready. Please try again.');
      return;
    }
    
    try {
      // Find the chart node
      const chartNode = nodes.find(n => n.id === chartId);
      if (!chartNode) {
        console.error('❌ Chart node not found:', chartId);
        console.error('❌ Available node IDs:', nodes.map(n => n.id));
        return;
      }
      
      // Call chart insights API
      const response = await fetch(`${API}/chart-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: chartId,
          api_key: apiKey,
          model: selectedModel || 'gemini-2.0-flash',
          user_context: chartNode.data?.user_goal || null
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
      
      // Get the chart shape from TLDraw to calculate position
      let chartShape = tldrawEditorRef.current.getShape(chartId);
      
      if (!chartShape) {
        // If direct lookup fails, search through all shapes
        const allShapes = tldrawEditorRef.current.getCurrentPageShapes();
        chartShape = allShapes.find(shape => 
          shape.id === chartId || 
          shape.id.includes(chartId) ||
          (shape.type === 'chart' && shape.props?.title === chartNode.data?.title)
        );
      }
      
      if (!chartShape) {
        throw new Error('Chart shape not found in canvas.');
      }
      
      // Calculate position for textbox (to the right of chart)
      const textboxX = chartShape.x + chartShape.props.w + 50;
      const textboxY = chartShape.y;
      
      // Prepare insights text
      const insightsContent = result.generic_insights || result.insight || 'No insights generated';
      const insightsText = `AI Generated\n\n${insightsContent}`;
      
      // Create TLDraw textbox for insights
      const { createShapeId } = await import('@tldraw/tldraw');
      const textboxId = createShapeId();
      
      tldrawEditorRef.current.createShape({
        id: textboxId,
        type: 'textbox',
        x: textboxX,
        y: textboxY,
        props: {
          w: 300,
          h: 200,
          text: insightsText,
          fontSize: 12
        }
      });
      
      console.log('✅ Chart insights generated from toolbar shortcut');
      
    } catch (error) {
      console.error('Generate insights from toolbar failed:', error);
      alert(`Failed to generate insights: ${error.message}`);
    }
  }, [nodes, apiKey, selectedModel, tldrawEditorRef, updateTokenUsage]);

  const mergeSelectedCharts = useCallback(async () => {
    if (selectedCharts.length !== 2) {
      alert('Please select exactly 2 charts to merge');
      return;
    }
    console.log("Hi");
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
      console.log('🔀 Merge response from backend:', fused);
      const newId = fused.chart_id;
      
      // Position the fused node in the center of the current viewport
      const position = getViewportCenter();
      
      // Pass the determined chart type to figureFromPayload for proper ECharts option generation
      const chartTypeToUse = fused.dimensions && fused.measures 
        ? getEChartsDefaultType(fused.dimensions.length, fused.measures.length).id
        : null;
      
      const figure = figureFromPayload(fused, chartTypeToUse);
      console.log('📊 Figure generated from merge:', figure);
      
      // Add the new merged chart
      
      // For 2D+1M charts, backend now sends clean row-based data
      let finalDimensions = fused.dimensions || [];
      let finalMeasures = fused.measures || [];
      
      // Determine default chart type based on dimensions and measures
      console.log('🔍 Determining chart type for merge:', {
        dimensions: finalDimensions,
        measures: finalMeasures,
        dimCount: finalDimensions.length,
        measCount: finalMeasures.length
      });
      const defaultChartType = getEChartsDefaultType(finalDimensions.length, finalMeasures.length);
      console.log('🔍 Default chart type:', defaultChartType);
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
          table: fused.table || [], // Add table data for chart type switching
          chartType: defaultChartType.id,
          filters: fused.filters || {} // Store filters for persistence
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

  // Update chart data (for filters and other updates)
  const handleChartUpdate = useCallback((chartId, updates) => {
    console.log('📊 Chart update requested:', { chartId, updates });
    
    setNodes(nds => nds.map(n => {
      if (n.id === chartId) {
        return {
          ...n,
          data: {
            ...n.data,
            ...updates,
            figure: {
              data: updates.chartData,
              layout: updates.chartLayout
            }
          }
        };
      }
      return n;
    }));
  }, []);

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
        isAIMerged: node.data.isAIMerged,
        strategy: node.data.strategy,
        chartType: node.data.chartType
      });
      
      // Validation for fused charts - support 1D+1M, 2D+1M, or 1D+2M configurations
      if (node.data.isFused) {
        const totalVars = dims.length + meas.length;
        // Allow 2 variables (1D+1M) or 3 variables (2D+1M or 1D+2M)
        if ((totalVars !== 2 && totalVars !== 3) || dims.length > 2 || meas.length > 2) {
          console.warn('⚠️ Aggregation only supported for 1D+1M, 2D+1M, or 1D+2M fused charts');
          alert('Aggregation changes are only supported for simple fused charts (1D+1M, 2D+1M, or 1D+2M)');
          return currentNodes;
        }
        console.log('✅ Fused chart validation passed for aggregation change (1D+1M, 2D+1M, or 1D+2M)');
      }
      
      // Block aggregation changes for count charts and histograms
      const isCountChart = meas.length === 1 && meas[0] === 'count';
      const isHistogram = node.data.isHistogram || (dims.length === 1 && dims[0] === 'bin');
      
      if (isCountChart && !isHistogram) {
        console.warn('⚠️ Cannot change aggregation for count charts');
        alert('Aggregation changes are not supported for count charts. Counts cannot be meaningfully averaged or summed.');
        return currentNodes;
      }
      
      if (isHistogram) {
        console.warn('⚠️ Cannot change aggregation for histogram charts');
        alert('Aggregation changes are not supported for histograms. Bins are fixed and aggregation does not apply.');
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
            agg: newAgg,
            filters: node.data.filters || {} // Maintain filters during aggregation change
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
          
          console.log('🔧 Regenerating chart with new aggregation:', {
            chartType: node.data.chartType
          });
          
          // Use ECharts registry to regenerate chart
          const chartType = node.data.chartType || 'bar';
          const chartConfig = ECHARTS_TYPES[chartType.toUpperCase()];
          
          let updatedData;
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
                measures: chart.measures,
                filters: chart.filters || node.data.filters || {} // Preserve filters
              };
            } catch (error) {
              console.error('❌ Error generating ECharts option:', error);
              throw error;
            }
          } else {
            console.warn('⚠️ Chart config not found or not supported');
            updatedData = {
              agg: newAgg || 'sum',
              table: chart.table || [],
              title: title,
              dimensions: chart.dimensions,
              measures: chart.measures,
              filters: chart.filters || node.data.filters || {} // Preserve filters
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
    console.log('🔄 updateChartType called:', { nodeId, newChartType });
    
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
          
          // Regenerate chart with new type using ECharts
          let updatedData = {
            ...node.data,
            chartType: newChartType
          };
          
          console.log('🔍 Updating chart type:', { hasTable: !!table, hasDimensions: !!dimensions, hasMeasures: !!measures });
          
          if (table && dimensions && measures) {
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
    // Temporarily disable caching to avoid potential conflicts
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
    
    // Strategy A: same-dimension-different-measures => Use ECharts registry
    if (payload.strategy?.type === 'same-dimension-different-measures') {
      // Always use ECharts registry for consistent behavior
      let activeChartType;
      
      // Check if a specific chart type is requested via ECharts registry
      if (chartType && ECHARTS_TYPES[chartType.toUpperCase()]) {
        const chartTypeConfig = ECHARTS_TYPES[chartType.toUpperCase()];
        if (chartTypeConfig.isSupported(dims.length, measures.length)) {
          activeChartType = chartTypeConfig;
        }
      }
      
      // If no explicit type or type not supported, use default
      if (!activeChartType) {
        activeChartType = getEChartsDefaultType(dims.length, measures.length);
      }
      
      console.log('📊 Creating chart for same-dimension-different-measures:', {
        chartType: activeChartType.id,
        dims: dims.length,
        measures: measures.length
      });
      
      const option = activeChartType.createOption(rows, payload);
      
      if (option && option.series) {
        return {
          data: [],
          layout: option
        };
      } else {
        console.error('❌ Failed to create ECharts option for strategy A');
      }
      
      // Fallback to old logic if ECharts fails (shouldn't happen)
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
      // Use ECharts registry (with fixed tooltip)
      let echartsOption;
      if (chartType && ECHARTS_TYPES[chartType.toUpperCase()]) {
        const chartTypeConfig = ECHARTS_TYPES[chartType.toUpperCase()];
        if (chartTypeConfig.isSupported(dims, measures)) {
          echartsOption = chartTypeConfig.createOption(rows, payload);
        }
      }
      if (!echartsOption) {
        // Default to ECharts stacked bar
        echartsOption = ECHARTS_TYPES.STACKED_BAR.createOption(rows, payload);
      }
      
      console.log('📊 Stacked bar option created:', {
        hasSeries: !!echartsOption?.series,
        seriesCount: echartsOption?.series?.length,
        dims,
        measures
      });
      
      // Wrap ECharts option in the format EChartsWrapper expects
      // EChartsWrapper checks for layout.series to detect native ECharts format
      return {
        data: [],
        layout: echartsOption
      };
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
    
    if (chartType && ECHARTS_TYPES[chartType.toUpperCase()]) {
      // Explicit chart type requested
      activeChartType = ECHARTS_TYPES[chartType.toUpperCase()];
    } else {
      // Get default chart type for this dimension/measure combination
      // Pass counts, not arrays, and normalize 'count' handling
      const normalizedDims = (payload.dimensions || []).filter(d => d !== 'count');
      const normalizedMeas = payload.measures || [];
      activeChartType = getEChartsDefaultType(normalizedDims.length, normalizedMeas.length);
    }
    
    // Create standardized payload for chart type functions
    const standardPayload = {
      ...payload,
      dimensions: payload.dimensions || [xKey],
      measures: payload.measures || [numKey].filter(Boolean)
    };
    
    // Use ECharts registry to create option
    const option = activeChartType.createOption(rows, standardPayload);
    
    // Validate that the option has required properties
    if (!option || !option.series || !Array.isArray(option.series)) {
      console.error('❌ Invalid ECharts option generated:', {
        option,
        activeChartType: activeChartType.name,
        rows: rows.length,
        payload: standardPayload
      });
      // Return a minimal valid option to prevent crashes
      return {
        data: [],
        layout: {
          series: [{
            type: 'bar',
            data: []
          }],
          title: { text: 'Error: Invalid chart data' }
        }
      };
    }
    
    console.log('✅ Valid ECharts option created:', {
      chartType: activeChartType.name,
      seriesCount: option.series.length,
      rowsCount: rows.length
    });
    
    return {
      data: [],
      layout: option
    };
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
      
      // Determine default chart type for AI-merged chart
      const aiChartType = getEChartsDefaultType(
        (aiResult.dimensions || []).length, 
        (aiResult.measures || []).length
      );
      
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
          chartType: aiChartType.id,
          ai_reasoning: aiResult.reasoning,
          dimensions: aiResult.dimensions || [],
          measures: aiResult.measures || [],
          agg: chart.agg || 'sum',
          datasetId: nodeDatasetId,
          table: chart.table || [],
          filters: chart.filters || {} // Store filters for persistence
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
    createdStickyNotes.current.clear(); // Reset sticky notes tracker
    console.log('🔄 Reset AI chart counter and sticky notes tracker for new Smart Visualise session');

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setSuggestions([]);

    try {
      const response = await fetch(`${API}/suggest-charts`, {
      //const response = await fetch('http://localhost:8000/suggest-charts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          goal: goalText.trim(),
          api_key: apiKey,
          model: selectedModel,
          num_charts: numCharts
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
        
        // Determine default chart type for this combination
        const defaultChartType = getEChartsDefaultType(
          (dimensions || []).length, 
          (measures || []).length
        );
        const chartTypeId = defaultChartType.id;
        
        // Pass chartType to figureFromPayload for consistent rendering
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure,
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
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
            user_goal: goalText,  // Store original user query for AI-assisted merging
            filters: chart.filters || {} // Store filters for persistence
          } 
        }));
      }
      
      else if (method === 'single_measure') {
        // Single measure: Use histogram with frontend binning
        const measure = measures[0];
        
        // Fetch raw histogram values
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
        
        // Helper function to format bin labels nicely
        const formatBinValue = (value) => {
          // For large numbers (>1000), round to nearest integer
          if (Math.abs(value) >= 1000) {
            return Math.round(value).toString();
          }
          // For medium numbers (>10), round to 1 decimal if needed
          if (Math.abs(value) >= 10) {
            return Number.isInteger(value) ? value.toString() : value.toFixed(1);
          }
          // For small numbers, use at most 2 decimals
          return Number.isInteger(value) ? value.toString() : value.toFixed(2);
        };
        
        // Create bins in frontend using Sturges' rule
        const numBins = Math.min(50, Math.max(10, Math.ceil(Math.log2(values.length) + 1)));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const rawBinWidth = (max - min) / numBins;
        
        // Create bin labels and counts with cleaner boundaries
        const tableData = [];
        for (let i = 0; i < numBins; i++) {
          const binStart = min + i * rawBinWidth;
          const binEnd = min + (i + 1) * rawBinWidth;
          const binLabel = `${formatBinValue(binStart)}-${formatBinValue(binEnd)}`;
          const count = values.filter(v => v >= binStart && (i === numBins - 1 ? v <= binEnd : v < binEnd)).length;
          tableData.push({ bin: binLabel, count });
        }
        
        // Register as 1D+1M chart with synthetic bin dimension
        const body = { 
          dataset_id: datasetId, 
          dimensions: ['bin'], 
          measures: ['count'], 
          agg: 'sum',
          title: title || `Distribution of ${measure}`,
          table: tableData,  // Pass the binned table data
          originalMeasure: measure  // Store the real measure for semantic merging
        };
        const reg = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!reg.ok) {
          console.error('Failed to register AI histogram:', reg.statusText);
          return;
        }
        
        const chart = await reg.json();
        id = chart.chart_id;
        
        // Determine default chart type for 1D+1M
        const defaultChartType = getEChartsDefaultType(1, 1);
        const chartTypeId = defaultChartType.id;
        
        // Convert to ECharts format using figureFromPayload
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure, 
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            stats,  // Keep stats for reference
            agg: 'sum', 
            dimensions: ['bin'],  // Synthetic dimension
            measures: ['count'],  // Synthetic measure
            datasetId: datasetId,
            table: chart.table || tableData,
            onAggChange: updateChartAgg,
            isHistogram: true,  // Mark as histogram for special handling
            originalMeasure: measure,  // Store the real measure for semantic merging
            ai_generated: true,
            ai_method: method,
            ai_reasoning: suggestion.reasoning,
            user_goal: goalText,  // Store original user query for AI-assisted merging
            filters: chart.filters || {} // Store filters for persistence
          } 
        }));
      }
      
      else if (method === 'single_dimension') {
        // Single dimension: Use /charts endpoint with count measure for ECharts compatibility
        const dimension = dimensions[0];
        const body = { 
          dataset_id: datasetId, 
          dimensions: [dimension], 
          measures: ['count'],  // Synthetic count measure for ECharts
          agg: 'count', 
          title: title || `Counts of ${dimension}` 
        };
        
        const res = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!res.ok) {
          console.error('Failed to create AI dimension chart:', res.statusText);
          return;
        }
        
        const chart = await res.json();
        id = chart.chart_id;
        
        // Determine default chart type for 1D+1M
        const defaultChartType = getEChartsDefaultType(1, 1);
        const chartTypeId = defaultChartType.id;
        
        // Convert to ECharts format using figureFromPayload
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position, 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure, 
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            agg: 'count', 
            dimensions: [dimension], 
            measures: ['count'],  // Store count as measure
            datasetId: datasetId, 
            onAggChange: updateChartAgg,
            table: chart.table || [],
            ai_generated: true,
            ai_method: method,
            ai_reasoning: suggestion.reasoning,
            user_goal: goalText,  // Store original user query for AI-assisted merging
            filters: chart.filters || {} // Store filters for persistence
          } 
        }));
      }
      
      // Auto-generate insights for AI-generated charts (up to user-requested count)
      if (aiGeneratedChartCount < numCharts && apiKey && apiKey.trim()) {
        try {
          console.log(`🎯 Auto-generating insights for chart ${aiGeneratedChartCount + 1}/${numCharts}`);
          
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
        
        // Determine default chart type for 1 dimension + 1 measure
        const defaultChartType = getEChartsDefaultType(1, 1);
        const chartTypeId = defaultChartType.id;
        
        // Pass chartType to figureFromPayload for consistent rendering
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure,
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
            selected: false,
            onSelect: handleChartSelect,
            onShowTable: handleShowTable,
            onAggChange: updateChartAgg,
            onAIExplore: handleAIExplore,
            agg: chart.agg || 'sum',
            dimensions: [selectedDimension],
            measures: [selectedMeasure],
            datasetId: datasetId, // Store dataset ID for aggregation updates
            table: chart.table || [], // Add table data for chart type switching
            filters: chart.filters || {} // Store filters for persistence
          } 
        }));
      }
      
      // Case 2: Single Measure (Histogram with Frontend Binning)
      else if (selectedMeasure && !selectedDimension) {
        // Fetch raw histogram values
        const res = await fetch(`${API}/histogram`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, measure: selectedMeasure })
        });
        
        if (!res.ok) throw new Error(await res.text());
        const { values, stats } = await res.json();
        
        // Helper function to format bin labels nicely
        const formatBinValue = (value) => {
          // For large numbers (>1000), round to nearest integer
          if (Math.abs(value) >= 1000) {
            return Math.round(value).toString();
          }
          // For medium numbers (>10), round to 1 decimal if needed
          if (Math.abs(value) >= 10) {
            return Number.isInteger(value) ? value.toString() : value.toFixed(1);
          }
          // For small numbers, use at most 2 decimals
          return Number.isInteger(value) ? value.toString() : value.toFixed(2);
        };
        
        // Create bins in frontend using Sturges' rule
        const numBins = Math.min(50, Math.max(10, Math.ceil(Math.log2(values.length) + 1)));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const rawBinWidth = (max - min) / numBins;
        
        // Create bin labels and counts with cleaner boundaries
        const tableData = [];
        for (let i = 0; i < numBins; i++) {
          const binStart = min + i * rawBinWidth;
          const binEnd = min + (i + 1) * rawBinWidth;
          const binLabel = `${formatBinValue(binStart)}-${formatBinValue(binEnd)}`;
          const count = values.filter(v => v >= binStart && (i === numBins - 1 ? v <= binEnd : v < binEnd)).length;
          tableData.push({ bin: binLabel, count });
        }
        
        // Register as 1D+1M chart with synthetic bin dimension
        const body = { 
          dataset_id: datasetId, 
          dimensions: ['bin'], 
          measures: ['count'], 
          agg: 'sum',
          title: `Distribution of ${selectedMeasure}`,
          table: tableData,  // Pass the binned table data
          originalMeasure: selectedMeasure  // Store the real measure for semantic merging
        };
        const reg = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!reg.ok) throw new Error(await reg.text());
        const chart = await reg.json();
        id = chart.chart_id;
        
        // Determine default chart type for 1D+1M
        const defaultChartType = getEChartsDefaultType(1, 1);
        const chartTypeId = defaultChartType.id;
        
        // Convert to ECharts format using figureFromPayload
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure, 
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            stats,  // Keep stats for reference
            agg: 'sum', 
            dimensions: ['bin'],  // Synthetic dimension
            measures: ['count'],  // Synthetic measure
            datasetId: datasetId,
            table: chart.table || tableData,
            onAggChange: updateChartAgg,
            isHistogram: true,  // Mark as histogram for special handling
            originalMeasure: selectedMeasure  // Store the real measure for semantic merging
          } 
        }));
      }
      
      // Case 3: Single Dimension (Bar Chart with Count)
      else if (selectedDimension && !selectedMeasure) {
        // Use /charts endpoint with count measure for ECharts compatibility
        const body = { 
          dataset_id: datasetId, 
          dimensions: [selectedDimension], 
          measures: ['count'],  // Synthetic count measure for ECharts
          agg: 'count',
          title: `Counts of ${selectedDimension}` 
          };
        
        const res = await fetch(`${API}/charts`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        
        if (!res.ok) throw new Error(await res.text());
        const chart = await res.json();
        id = chart.chart_id;
        
        // Determine default chart type for 1D+1M
        const defaultChartType = getEChartsDefaultType(1, 1);
        const chartTypeId = defaultChartType.id;
        
        // Convert to ECharts format using figureFromPayload
        const figure = figureFromPayload(chart, chartTypeId);
        
        setNodes(nds => nds.concat({ 
          id, 
          type: 'chart', 
          position: getViewportCenter(), 
          draggable: true,
          selectable: false, // Disable React Flow selection - use checkbox instead
          data: { 
            title: chart.title, 
            figure, 
            chartType: chartTypeId,  // Add chartType for Chart Actions panel
            selected: false, 
            onSelect: handleChartSelect, 
            onShowTable: handleShowTable, 
            onAIExplore: handleAIExplore,
            agg: 'count', 
            dimensions: [selectedDimension], 
            measures: ['count'],  // Store count as measure 
            table: chart.table || [],  // Add table data for chart type switching
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

  // Development debugging helpers
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.debugCanvas = {
        getNodes: () => nodes,
        getEdges: () => edges,
        getSelectedCharts: () => nodes.filter(n => n.data?.selected),
        getConfig: () => ({
          canvas: 'TLDraw',
          charts: 'ECharts',
          version: '3.0',
          nodeCount: nodes.length,
          edgeCount: edges.length
        }),
        logState: () => {
          console.group('🐛 Canvas Debug State');
          console.log('Nodes:', nodes.length);
          console.log('Edges:', edges.length);
          console.log('Selected:', nodes.filter(n => n.data?.selected).length);
          console.log('Config:', { canvas: 'TLDraw', charts: 'ECharts', version: '3.0' });
          console.groupEnd();
        }
      };
      console.log('🐛 Debug helpers available: window.debugCanvas.logState()');
    }
  }, [nodes, edges]);

  // Render main canvas (TLDraw or React Flow)
  const renderMainCanvas = () => {
    return (
      <TLDrawCanvas
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
        onAIQueryShortcut={handleAIQueryShortcut}
        onChartInsightShortcut={handleChartInsightShortcut}
        onShowTableShortcut={handleShowTable}
        apiKeyConfigured={!!(apiKey && apiKey.trim())}
        fitView
        style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
      />
    );
  };

  // Instructions data structure for the Instructions panel
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

  // Settings panel handlers
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
    <div className="w-screen h-screen relative">
      {/* Full-width Canvas - Base Layer */}
      <div className="absolute inset-0">
        {renderMainCanvas()}
      </div>
      
      {/* Floating Overlay Sidebar */}
      <UnifiedSidebar
        uploadPanelOpen={uploadPanelOpen}
        setUploadPanelOpen={setUploadPanelOpen}
        variablesPanelOpen={variablesPanelOpen}
        setVariablesPanelOpen={setVariablesPanelOpen}
        chartActionsPanelOpen={chartActionsPanelOpen}
        setChartActionsPanelOpen={setChartActionsPanelOpen}
        mergePanelOpen={mergePanelOpen}
        setMergePanelOpen={setMergePanelOpen}
        instructionsPanelOpen={instructionsPanelOpen}
        setInstructionsPanelOpen={setInstructionsPanelOpen}
        settingsPanelOpen={settingsPanelOpen}
        setSettingsPanelOpen={setSettingsPanelOpen}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onMergeCharts={mergeSelectedCharts}
        selectedChartsCount={selectedCharts.length}
        canMerge={selectedCharts.length === 2}
        selectedChartForActions={selectedChartForActions}
      />
      
      {/* Floating Panels Container - Positioned next to sidebar */}
      <div 
        className="fixed z-[1100] transition-all duration-300 rounded-xl overflow-hidden"
        style={{
          left: 'calc(var(--size-sidebar) + 14px)',
          top: '60px',
          bottom: '100px',
          pointerEvents: (uploadPanelOpen || variablesPanelOpen || chartActionsPanelOpen || mergePanelOpen || instructionsPanelOpen || settingsPanelOpen) ? 'auto' : 'none'
        }}
      >
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

        {/* Settings Panel */}
        {settingsPanelOpen && (
          <SlidingPanel
            isOpen={settingsPanelOpen}
            title="AI Settings"
            onClose={() => setSettingsPanelOpen(false)}
            size="md"
          >
            <div className="p-4 space-y-5">
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
          </SlidingPanel>
        )}

        {/* User Instructions Panel */}
        {instructionsPanelOpen && (
          <SlidingPanel
            isOpen={instructionsPanelOpen}
            title="User Instructions"
            onClose={() => {
              localStorage.setItem('dfuse_instructions_seen', 'true');
              setInstructionsPanelOpen(false);
            }}
            size="lg"
          >
            <div className="p-4">
              <div className="space-y-4">
                {/* Title and subtitle */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {instructions.title}
                  </h2>
                  <p className="text-gray-600 mb-4 leading-relaxed">{instructions.subtitle}</p>
                </div>

                {/* Video */}
                <div className="mb-4">
                  <div 
                    dangerouslySetInnerHTML={{ __html: instructions.videoIframe }}
                    style={{
                      width: '100%',
                      maxWidth: '560px',
                      aspectRatio: '16/9'
                    }}
                  />
                </div>

                {/* Sections */}
                {instructions.sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
                      {section.title}
                    </h3>
                    
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
                  
                  {/* Number of Charts Counter */}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                      Number of charts
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNumCharts(Math.max(1, numCharts - 1))}
                        disabled={numCharts <= 1}
                        className="h-8 w-8 p-0"
                      >
                        <Minus size={14} />
                      </Button>
                      <span className="text-sm font-medium w-8 text-center">
                        {numCharts}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNumCharts(Math.min(5, numCharts + 1))}
                        disabled={numCharts >= 5}
                        className="h-8 w-8 p-0"
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
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
          setSettingsPanelOpen={setSettingsPanelOpen}
          updateTokenUsage={updateTokenUsage}
          onChartTypeChange={updateChartType}
          onAggChange={updateChartAgg}
          onShowTable={handleShowTable}
          tldrawEditorRef={tldrawEditorRef}
          onChartUpdate={handleChartUpdate}
          scrollToAI={scrollToAI}
          setScrollToAI={setScrollToAI}
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
            </div>
    </div>
  );
}

/**
 * App Component (Main Entry Point)
 * Root component for the D.Fuse application.
 * 
 * @returns {JSX.Element} The complete D.Fuse application
 */
export default function App() {
  return <AppWrapper />;
}
