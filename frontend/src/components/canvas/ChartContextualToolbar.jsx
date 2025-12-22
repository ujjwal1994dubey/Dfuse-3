import React from 'react';
import {
  track,
  useEditor
} from '@tldraw/tldraw';
import { Sparkle, MessageCircleQuestion, Table, ChartColumn } from 'lucide-react';

/**
 * Toolbar Actions Configuration
 * Scalable structure for adding/removing toolbar actions
 */
const TOOLBAR_ACTIONS = [
  {
    id: 'chart-insights',
    label: 'Insights',
    icon: Sparkle,
    tooltip: 'Generate quick chart insights'
  },
  {
    id: 'ai-query',
    label: 'AI Query',
    icon: MessageCircleQuestion,
    tooltip: 'Open AI query panel'
  },
  {
    id: 'show-table',
    label: 'Data Table',
    icon: Table,
    tooltip: 'Show data table'
  },
  {
    id: 'chart-actions',
    label: 'Chart Actions',
    icon: ChartColumn,
    tooltip: 'Open chart actions panel'
  }
];

/**
 * ChartContextualToolbar Component
 * 
 * Displays a contextual toolbar above selected chart shapes with quick-access actions.
 * Uses TLDraw's built-in contextual toolbar primitives for consistent UI/UX.
 * 
 * @param {Function} onAIQueryShortcut - Callback when AI Query button is clicked
 * @param {Function} onChartInsightShortcut - Callback when Chart Insights button is clicked
 * @param {Function} onShowTableShortcut - Callback when Show Data Table button is clicked
 * @param {Function} onChartActionsShortcut - Callback when Chart Actions panel button is clicked
 * @param {boolean} apiKeyConfigured - Whether API key is configured (for disabling AI features)
 */
const ChartContextualToolbar = track(({ 
  onAIQueryShortcut, 
  onChartInsightShortcut, 
  onShowTableShortcut,
  onChartActionsShortcut,
  apiKeyConfigured = true
}) => {
  const editor = useEditor();
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  
  // Only show toolbar when in select.idle state
  const showToolbar = editor.isIn('select.idle');
  
  // Get selected shapes
  const selectedShapes = editor.getSelectedShapes();
  
  // Only show toolbar when exactly one chart is selected
  const selectedCharts = selectedShapes.filter(shape => shape.type === 'chart');
  if (selectedCharts.length !== 1 || !showToolbar) {
    return null;
  }
  
  const selectedChart = selectedCharts[0];
  
  /**
   * Get selection bounds for positioning the toolbar
   * Position on the right side of the chart with 12px spacing
   * Uses fixed positioning to ensure toolbar stays at constant size regardless of zoom
   */
  const getToolbarPosition = () => {
    const bounds = editor.getSelectionRotatedScreenBounds();
    if (!bounds) return null;
    
    // Use screen coordinates for fixed positioning
    // This ensures the toolbar doesn't scale with canvas zoom
    return {
      left: `${bounds.x + bounds.width + 12}px`,
      top: `${bounds.y}px`
    };
  };
  
  /**
   * Handle action button clicks
   * Maps action IDs to their respective callbacks
   */
  const handleActionClick = async (actionId) => {
    // TLDraw shape IDs have format "shape:uuid"
    // But node state stores only the UUID part, so we need to strip the prefix
    const tldrawShapeId = selectedChart.id;
    const nodeId = tldrawShapeId.replace('shape:', '');
    
    console.log('🎯 Toolbar action clicked:', actionId);
    console.log('🎯 TLDraw shape ID:', tldrawShapeId);
    console.log('🎯 Node ID (stripped):', nodeId);
    
    try {
      switch (actionId) {
        case 'ai-query':
          console.log('📍 Calling onAIQueryShortcut with node ID:', nodeId);
          if (onAIQueryShortcut) {
            onAIQueryShortcut(nodeId);
          } else {
            console.error('❌ onAIQueryShortcut is not defined');
          }
          break;
        case 'chart-insights':
          console.log('💡 Calling onChartInsightShortcut with node ID:', nodeId);
          // Show loading state for insights generation
          setInsightsLoading(true);
          try {
            if (onChartInsightShortcut) {
              await onChartInsightShortcut(nodeId);
            } else {
              console.error('❌ onChartInsightShortcut is not defined');
            }
          } finally {
            setInsightsLoading(false);
          }
          break;
        case 'show-table':
          console.log('📊 Calling onShowTableShortcut with node ID:', nodeId);
          if (onShowTableShortcut) {
            onShowTableShortcut(nodeId);
          } else {
            console.error('❌ onShowTableShortcut is not defined');
          }
          break;
        case 'chart-actions':
          console.log('🎛️ Calling onChartActionsShortcut with node ID:', nodeId);
          if (onChartActionsShortcut) {
            onChartActionsShortcut(nodeId);
          } else {
            console.error('❌ onChartActionsShortcut is not defined');
          }
          break;
        default:
          console.warn(`Unknown action: ${actionId}`);
      }
    } catch (error) {
      console.error('Error handling toolbar action:', error);
      setInsightsLoading(false);
    }
  };
  
  /**
   * Check if an action should be disabled
   */
  const isActionDisabled = (actionId) => {
    // Disable AI-related actions if API key is not configured
    if ((actionId === 'ai-query' || actionId === 'chart-insights') && !apiKeyConfigured) {
      return true;
    }
    // Disable insights button while loading
    if (actionId === 'chart-insights' && insightsLoading) {
      return true;
    }
    return false;
  };
  
  /**
   * Get the appropriate icon for an action based on its state
   */
  const getActionIcon = (action) => {
    // For insights loading, we can add a spinning animation via CSS class
    return action.icon;
  };
  
  const position = getToolbarPosition();
  
  if (!position) return null;
  
  return (
    <div
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '6px',
        backgroundColor: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        zIndex: 1000,
        pointerEvents: 'all',
        // Ensure toolbar stays at fixed size regardless of canvas zoom
        transform: 'none',
        width: '48px', // Fixed width
        minHeight: '188px' // Minimum height to contain 4 buttons
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {TOOLBAR_ACTIONS.map((action) => {
        const disabled = isActionDisabled(action.id);
        const IconComponent = getActionIcon(action);
        const isLoading = action.id === 'chart-insights' && insightsLoading;
        
        return (
          <button
            key={action.id}
            title={disabled && !apiKeyConfigured ? 'Configure API key in Settings first' : action.tooltip}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (!disabled) {
                handleActionClick(action.id);
              }
            }}
            disabled={disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0',
              fontSize: '0', // Remove any text influence
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.3 : 1,
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '7px',
              width: '36px',
              height: '36px',
              flexShrink: 0, // Prevent button from shrinking
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: disabled ? '#6b6b6b' : '#ffffff',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'scale(1.08)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span className={isLoading ? 'loading-spin' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
              <IconComponent size={20} strokeWidth={2} />
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default ChartContextualToolbar;

