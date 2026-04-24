/**
 * Action Executor Module
 * Executes agent actions by creating charts and insights on the canvas
 */

import { ACTION_TYPES, AGENT_CONFIG, ACTION_WEIGHTS } from './types';
import { getEChartsDefaultType, ECHARTS_TYPES } from '../charts/echartsRegistry';
import { LayoutManager, arrangeKPIDashboard } from './layoutManager';
import { organizeCanvas, calculateBounds } from './canvasOrganizer';
import { executeDrawingActions } from './tldrawAgent';
import { rateLimiter } from './rateLimiter';

/**
 * Get live shape bounds from the TLDraw editor.
 * Falls back to stale React node position/size if the shape is not found.
 * Mirrors the pattern already used in canvasSnapshot.js → enrichWithBounds().
 */
function getLiveShapeBounds(nodeId, editor, fallbackNode) {
  if (editor) {
    try {
      const shape = editor.getShape(`shape:${nodeId}`);
      if (shape) {
        const b = editor.getShapePageBounds(shape);
        return { x: b.x, y: b.y, w: b.w, h: b.h };
      }
    } catch (_) {}
  }
  return {
    x: fallbackNode.position.x,
    y: fallbackNode.position.y,
    w: fallbackNode.data?.width  || 800,
    h: fallbackNode.data?.height || 400,
  };
}

/**
 * Execute multiple actions in sequence
 * @param {Array} actions - Array of validated actions to execute
 * @param {Object} context - Execution context with API, datasetId, setNodes, currentQuery, etc.
 * @returns {Promise<Array>} Array of execution results
 */
export async function executeActions(actions, context) {
  const results = [];
  let kpiIndex = 0;
  
  // Classify actions by API requirement
  const localActions = actions.filter(a => ACTION_WEIGHTS[a.type] === 'local');
  const apiActions = actions.filter(a => ACTION_WEIGHTS[a.type] !== 'local');
  
  console.log(`📋 Action Plan: ${localActions.length} local, ${apiActions.length} API-required`);
  
  // Execute local actions first (fast, no rate limiting)
  for (const action of localActions) {
    try {
      console.log(`⚡ Executing local action: ${action.type}`);
      const contextWithIndex = action.type === ACTION_TYPES.CREATE_KPI 
        ? { ...context, kpiIndex: kpiIndex++ }
        : context;
      
      const result = await executeAction(action, contextWithIndex);
      results.push({ 
        success: true, 
        action, 
        result,
        message: getSuccessMessage(action, result)
      });
    } catch (error) {
      console.error(`❌ Local action failed:`, error);
      results.push({ 
        success: false, 
        action, 
        error: error.message,
        message: `Failed: ${error.message}`
      });
    }
  }
  
  // Execute API actions with rate limiting
  if (apiActions.length > 0) {
    console.log(`🔄 Processing ${apiActions.length} API action(s) with rate limiting...`);
    
    for (let i = 0; i < apiActions.length; i++) {
      const action = apiActions[i];
      
      try {
        console.log(`🤖 Executing API action ${i + 1}/${apiActions.length}: ${action.type}`);
        
        // Show metrics before action
        const metrics = rateLimiter.getMetrics();
        console.log(`📊 Current state: ${metrics.rpm} RPM, ${metrics.daily} today, ${metrics.currentBackoff}ms backoff`);
        
        const contextWithIndex = action.type === ACTION_TYPES.CREATE_KPI 
          ? { ...context, kpiIndex: kpiIndex++ }
          : context;
        
        // Execute with rate limiting
        const result = await rateLimiter.executeWithRateLimit(
          action.type,
          () => executeAction(action, contextWithIndex)
        );
        
        results.push({ 
          success: true, 
          action, 
          result,
          message: getSuccessMessage(action, result)
        });
        
      } catch (error) {
        console.error(`❌ API action failed:`, error);
        results.push({ 
          success: false, 
          action, 
          error: error.message,
          message: `Failed: ${error.message}`
        });
      }
    }
    
    // Final metrics
    const finalMetrics = rateLimiter.getMetrics();
    console.log(`✅ Batch complete. Final state: ${finalMetrics.rpm} RPM, ${finalMetrics.daily} today`);
  }
  
  return results;
}

/**
 * Execute a single action
 */
async function executeAction(action, context) {
  switch (action.type) {
    case ACTION_TYPES.CREATE_CHART:
      return await createChartAction(action, context);
    case ACTION_TYPES.CREATE_INSIGHT:
      return createInsightAction(action, context);
    case ACTION_TYPES.CREATE_KPI:
      return await createKPIAction(action, context);
    case ACTION_TYPES.GENERATE_CHART_INSIGHTS:
      return await generateChartInsightsAction(action, context);
    case ACTION_TYPES.AI_QUERY:
      return await aiQueryAction(action, context);
    case ACTION_TYPES.SHOW_TABLE:
      return await showTableAction(action, context);
    case ACTION_TYPES.CREATE_DASHBOARD:
      return await createDashboardAction(action, context);
    case ACTION_TYPES.ARRANGE_ELEMENTS:
      return arrangeElementsAction(action, context);
    case ACTION_TYPES.ORGANIZE_CANVAS:
      return organizeCanvasAction(action, context);
    case ACTION_TYPES.SEMANTIC_GROUPING:
      return await semanticGroupingAction(action, context);
    case ACTION_TYPES.CREATE_SHAPE:
      return createShapeAction(action, context);
    case ACTION_TYPES.CREATE_ARROW:
      return createArrowAction(action, context);
    case ACTION_TYPES.CREATE_TEXT:
      return createTextAction(action, context);
    case ACTION_TYPES.HIGHLIGHT_ELEMENT:
      return highlightElementAction(action, context);
    // Spatial manipulation actions
    case ACTION_TYPES.MOVE_SHAPE:
      return moveShapeAction(action, context);
    case ACTION_TYPES.HIGHLIGHT_SHAPE:
      return highlightShapeAction(action, context);
    case ACTION_TYPES.ALIGN_SHAPES:
      return alignShapesAction(action, context);
    case ACTION_TYPES.DISTRIBUTE_SHAPES:
      return distributeShapesAction(action, context);
    case ACTION_TYPES.SMART_PLACE:
      return smartPlaceAction(action, context);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Create a chart on the canvas
 */
async function createChartAction(action, context) {
  const { API, datasetId, apiKey, model, setNodes, figureFromPayload, trackChartCreatedByAI } = context;
  
  // Step 1: Create base chart — pass all AI-supplied data parameters
  const response = await fetch(`${API}/charts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset_id: datasetId,
      dimensions: action.dimensions,
      measures: action.measures,
      agg: action.agg || 'sum',
      filters: action.filters || {},
      sort_order: action.sort_order || 'dataset'
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chart creation failed: ${error}`);
  }
  
  let chart = await response.json();
  
  // Step 2: If AI requested a data transformation, apply it via the transform endpoint
  // This handles derived columns (profit/unit, margin %), filtered subsets, top-k, normalize, etc.
  if (action.transform_prompt && chart.chart_id) {
    console.log(`🔄 Applying AI-requested transform: "${action.transform_prompt}"`);
    try {
      const transformResponse = await fetch(`${API}/chart-transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: chart.chart_id,
          user_prompt: action.transform_prompt,
          api_key: apiKey,
          model: model || 'gemini-2.5-flash'
        })
      });
      
      if (transformResponse.ok) {
        const transformed = await transformResponse.json();
        if (transformed.success) {
          console.log(`✅ Transform applied:`, transformed.transformation_steps);
          chart = transformed; // Use transformed chart (new chart_id, new table, updated dimensions/measures)
        } else {
          console.warn(`⚠️ Transform returned success:false, using base chart`);
        }
      } else {
        console.warn(`⚠️ Transform request failed (${transformResponse.status}), using base chart`);
      }
    } catch (transformErr) {
      console.warn(`⚠️ Transform error, using base chart:`, transformErr.message);
    }
  }
  
  const position = calculatePosition(action.position, action, context);
  
  // Determine chart type with validation
  // Use dimensions/measures from the (possibly transformed) chart response
  const finalDimensions = chart.dimensions || action.dimensions;
  const finalMeasures = chart.measures || action.measures;
  
  const defaultChartType = getEChartsDefaultType(
    finalDimensions.length,
    finalMeasures.length
  );
  
  // Validate that the requested chart type is compatible with final column counts
  let chartTypeId = action.chartType || defaultChartType.id;
  
  // Check if requested chart type is supported for this data shape
  const requestedType = ECHARTS_TYPES[chartTypeId.toUpperCase()];
  if (requestedType && !requestedType.isSupported(finalDimensions.length, finalMeasures.length)) {
    console.warn(`⚠️ Requested chart type "${chartTypeId}" doesn't support ${finalDimensions.length}D + ${finalMeasures.length}M. Using default: ${defaultChartType.id}`);
    chartTypeId = defaultChartType.id;
  }
  
  // Use figureFromPayload to properly format chart data for ECharts
  const figure = figureFromPayload ? figureFromPayload(chart, chartTypeId) : {
    data: chart.data || [],
    layout: chart.layout || {}
  };
  
  // Use custom size if provided, otherwise use defaults
  const chartWidth = action.width || AGENT_CONFIG.DEFAULT_CHART_WIDTH;
  const chartHeight = action.height || AGENT_CONFIG.DEFAULT_CHART_HEIGHT;
  
  // Add chart to canvas using existing pattern
  const chartId = chart.chart_id;
  setNodes(nodes => nodes.concat({
    id: chartId,
    type: 'chart',
    position,
    draggable: true,
    selectable: false,
    data: {
      title: chart.title || `${finalMeasures[0]} by ${finalDimensions[0]}`,
      figure,
      chartType: chartTypeId,
      dimensions: finalDimensions,
      measures: finalMeasures,
      table: chart.table || [],
      statistics: chart.statistics || {},
      agg: chart.agg || action.agg || 'sum',
      datasetId: datasetId,
      selected: false,
      filters: chart.filters || action.filters || {},
      sortOrder: chart.sort_order || action.sort_order || 'dataset',
      width: chartWidth,
      height: chartHeight,
      // Lineage — populated when transform was applied
      isDerived: chart.is_derived || false,
      parentChartId: chart.parent_chart_id || null,
      transformationSteps: chart.transformation_steps || null,
      // Provenance metadata
      createdBy: 'agent',
      createdByQuery: context.currentQuery || null,
      creationReasoning: action.reasoning || null,
      createdAt: new Date().toISOString(),
      isNewlyCreated: true
    }
  }));
  
  console.log(`✅ Chart created:`, chartId, 'at position', position, 'type:', chartTypeId, 'size:', `${chartWidth}x${chartHeight}`, chart.is_derived ? '(derived)' : '');
  
  // Track AI chart creation for session analytics
  if (trackChartCreatedByAI) {
    trackChartCreatedByAI();
  }
  
  return { 
    chartId, 
    position,
    dimensions: finalDimensions,
    measures: finalMeasures,
    chartType: chartTypeId,
    width: chartWidth,
    height: chartHeight
  };
}

/**
 * Create a KPI card on the canvas
 * Uses pre-computed values from agent planning when available (saves API calls)
 * Falls back to /ai-calculate-metric endpoint only if no pre-computed value
 */
async function createKPIAction(action, context) {
  const { API, datasetId, apiKey, model, setNodes, getViewportCenter, kpiIndex = 0, useAbsolutePosition = false } = context;
  
  let value, formattedValue, explanation;
  
  // Check if agent pre-computed the value (optimization - no extra API call needed)
  if (action.value !== undefined && action.value !== null) {
    console.log(`⚡ Using pre-computed KPI value for "${action.query}":`, action.value);
    value = action.value;
    formattedValue = action.formatted_value || formatKPIValue(action.value);
    explanation = action.explanation || '';
  } else {
    // Fallback: Call API if no pre-computed value (shouldn't happen with updated prompt)
    console.log(`🔄 No pre-computed value, calling API for "${action.query}"`);
    
    if (!apiKey) {
      throw new Error('API key is required for KPI calculation');
    }
    
    const response = await fetch(`${API}/ai-calculate-metric`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_query: action.query,
        dataset_id: datasetId,
        api_key: apiKey,
        model: model || 'gemini-2.5-flash'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`KPI calculation failed: ${error}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'KPI calculation failed');
    }
    
    value = result.value;
    formattedValue = result.formatted_value || formatKPIValue(result.value);
    explanation = result.explanation || '';
  }
  
  // Calculate position
  let position;
  if (useAbsolutePosition) {
    // Dashboard mode: Use the pre-calculated position from layout manager
    position = getViewportCenter();
  } else {
    // Individual KPI mode: Calculate position with horizontal offset
    const center = getViewportCenter();
    position = {
      x: center.x + (kpiIndex * AGENT_CONFIG.KPI_HORIZONTAL_SPACING),
      y: center.y
    };
  }
  
  // Generate a nice title from the query
  const title = generateKPITitle(action.query, explanation);
  
  // Use custom size if provided, otherwise use defaults
  const kpiWidth = action.width || AGENT_CONFIG.DEFAULT_KPI_WIDTH;
  const kpiHeight = action.height || AGENT_CONFIG.DEFAULT_KPI_HEIGHT;
  
  const kpiId = `kpi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Create KPI node in view mode (already calculated)
  setNodes(nodes => nodes.concat({
    id: kpiId,
    type: 'kpi',
    position,
    draggable: true,
    selectable: true,
    data: {
      query: action.query,
      title: title,
      value: value,
      formattedValue: formattedValue,
      explanation: explanation,
      isEditing: false,  // Start in view mode since we already calculated
      isLoading: false,
      datasetId: datasetId,
      error: '',
      width: kpiWidth,
      height: kpiHeight,
      // Provenance metadata
      createdBy: 'agent',
      createdByQuery: context.currentQuery || null,
      creationReasoning: action.reasoning || null,
      createdAt: new Date().toISOString(),
      isNewlyCreated: true
    }
  }));
  
  console.log(`✅ KPI created:`, kpiId, 'at position', position, 'value:', formattedValue, 'size:', `${kpiWidth}x${kpiHeight}`);
  
  return {
    kpiId,
    position,
    query: action.query,
    value: value,
    formattedValue: formattedValue,
    width: kpiWidth,
    height: kpiHeight
  };
}

/**
 * Generate a nice title from the KPI query
 */
function generateKPITitle(query, explanation) {
  if (!query) return 'KPI';
  
  let title = query.trim();
  
  // Clean up common prefixes
  const prefixes = ['what is', 'calculate', 'show me', 'get', 'compute', 'find'];
  for (const prefix of prefixes) {
    if (title.toLowerCase().startsWith(prefix + ' ')) {
      title = title.substring(prefix.length + 1);
      break;
    }
  }
  
  // Remove 'the' at the start
  if (title.toLowerCase().startsWith('the ')) {
    title = title.substring(4);
  }
  
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  
  // Truncate if too long
  if (title.length > 40) {
    title = title.substring(0, 37) + '...';
  }
  
  return title;
}

/**
 * Format a numeric value for KPI display
 */
function formatKPIValue(value) {
  if (value === null || value === undefined) return '—';
  
  if (typeof value === 'number') {
    // Check if it's a percentage (between 0 and 1 with decimals)
    if (value > 0 && value < 1 && !Number.isInteger(value)) {
      return `${(value * 100).toFixed(1)}%`;
    }
    
    // Large numbers with commas
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    
    // Small decimals
    if (!Number.isInteger(value)) {
      return value.toFixed(2);
    }
    
    return value.toLocaleString('en-US');
  }
  
  return String(value);
}

/**
 * Create an insight text box on the canvas
 */
function createInsightAction(action, context) {
  const { setNodes } = context;
  
  const position = calculatePosition(action.position, action, context);
  const insightId = `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Use custom size if provided, otherwise use defaults
  const insightWidth = action.width || 220;
  const insightHeight = action.height || 220;
  
  // Add text box to canvas
  setNodes(nodes => nodes.concat({
    id: insightId,
    type: 'textbox',
    position,
    draggable: true,
    selectable: false,
    data: {
      text: action.text,
      width: insightWidth,
      height: insightHeight,
      fontSize: 14,
      isNew: false,
      // Provenance metadata
      createdBy: 'agent',
      createdByQuery: context.currentQuery || null,
      relatedChartId: action.referenceChartId || null,
      createdAt: new Date().toISOString()
    }
  }));
  
  console.log(`✅ Insight created:`, insightId, 'at position', position, 'size:', `${insightWidth}x${insightHeight}`);
  
  return { 
    insightId, 
    position,
    text: action.text,
    width: insightWidth,
    height: insightHeight
  };
}

/**
 * Calculate position for new element based on position type
 */
function calculatePosition(positionType, action, context) {
  const { getViewportCenter, nodes, referenceChartId, editor } = context;
  
  // Use referenceChartId from context if not in action
  const chartIdToUse = action.referenceChartId || referenceChartId;
  
  switch (positionType) {
    case 'center':
    case 'auto':
      return getViewportCenter();
      
    case 'right_of_chart':
      if (chartIdToUse) {
        const refChart = findNodeById(chartIdToUse, nodes);
        if (refChart) {
          const bounds = getLiveShapeBounds(refChart.id, editor, refChart);
          return {
            x: bounds.x + AGENT_CONFIG.CHART_HORIZONTAL_SPACING,
            y: bounds.y
          };
        }
      }
      // Fallback to center if reference chart not found
      return getViewportCenter();
      
    case 'below_chart':
      if (chartIdToUse) {
        const refChart = findNodeById(chartIdToUse, nodes);
        if (refChart) {
          const bounds = getLiveShapeBounds(refChart.id, editor, refChart);
          return {
            x: bounds.x,
            y: bounds.y + AGENT_CONFIG.CHART_VERTICAL_SPACING
          };
        }
      }
      // Fallback to center if reference chart not found
      return getViewportCenter();
      
    default:
      return getViewportCenter();
  }
}

/**
 * Find node by ID
 */
function findNodeById(nodeId, nodes) {
  return nodes.find(n => n.id === nodeId);
}

/**
 * Generate AI insights for an existing chart
 */
async function generateChartInsightsAction(action, context) {
  const { API, apiKey, model, nodes, trackAIInsight, editor } = context;
  
  if (!apiKey) {
    throw new Error('API key is required for generating insights');
  }
  
  if (!editor) {
    throw new Error('TLDraw editor is required to create insights');
  }
  
  // Find the chart
  const chartNode = nodes.find(n => n.id === action.chartId);
  if (!chartNode) {
    throw new Error(`Chart ${action.chartId} not found`);
  }
  
  // Call existing /chart-insights endpoint
  const response = await fetch(`${API}/chart-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chart_id: action.chartId,
      api_key: apiKey,
      user_context: action.userContext || '',
      model: model || 'gemini-2.5-flash'
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate insights: ${error}`);
  }
  
  const result = await response.json();
  
  // Get the chart shape from TLDraw
  const chartShapeId = `shape:${action.chartId}`;
  let chartShape = editor.getShape(chartShapeId);
  
  if (!chartShape) {
    // Try without the 'shape:' prefix
    chartShape = editor.getShape(action.chartId);
  }
  
  if (!chartShape) {
    // Search through all shapes for matching chart
    const allShapes = editor.getCurrentPageShapes();
    chartShape = allShapes.find(shape => 
      shape.id === action.chartId || 
      shape.id.includes(action.chartId) ||
      (shape.type === 'chart' && shape.props?.title === chartNode.data?.title)
    );
  }
  
  if (!chartShape) {
    throw new Error('Chart shape not found in canvas.');
  }
  
  // Calculate position for insights textbox (adjacent to chart, similar to Option 1)
  const chartWidth = chartShape.props.w || 800;
  const insightsOffset = 50; // Space between chart and insights
  const textboxX = chartShape.x + chartWidth + insightsOffset;
  const textboxY = chartShape.y;
  
  // Prepare insights text
  const insightsContent = result.generic_insights || result.insight || 'No insights generated';
  
  // Get chart title for the insights header
  const chartTitle = chartNode.data?.title || 'Chart';
  
  // Create TLDraw textbox for insights (using Option 1 approach)
  const { createShapeId } = await import('@tldraw/tldraw');
  const textboxId = createShapeId();
  
  editor.createShape({
    id: textboxId,
    type: 'textbox',
    x: textboxX,
    y: textboxY,
    props: {
      w: 300,
      h: 400,
      text: insightsContent,
      fontSize: 14,
      isAIInsights: true,
      chartTitle: chartTitle // Store chart title for display
    }
  });
  
  console.log(`✅ Generated insights for chart: ${chartTitle} at position:`, { x: textboxX, y: textboxY });
  
  // Track AI insight generation for session analytics
  if (trackAIInsight) {
    trackAIInsight();
  }
  
  return {
    insightId: textboxId,
    text: insightsContent,
    chartTitle: chartTitle,
    position: { x: textboxX, y: textboxY }
  };
}

/**
 * Answer free-form AI query about data
 */
async function aiQueryAction(action, context) {
  const { API, apiKey, datasetId, model, setNodes, nodes, editor, mode } = context;
  
  if (!apiKey) {
    throw new Error('API key is required for AI queries');
  }
  
  // Determine context: chart-specific or dataset-level
  let chartIdToUse = action.chartId;
  
  // If no chartId specified, check if user has a chart selected
  if (!chartIdToUse && editor) {
    const selectedShapes = editor.getSelectedShapes();
    const selectedChart = selectedShapes.find(shape => {
      const node = nodes.find(n => n.id === shape.id);
      return node && node.type === 'chart';
    });
    if (selectedChart) {
      const chartNode = nodes.find(n => n.id === selectedChart.id);
      if (chartNode) {
        chartIdToUse = chartNode.id;
        console.log('📍 Using selected chart as context:', chartIdToUse);
      }
    }
  }
  
  // Build request payload
  const requestPayload = {
    user_query: action.query,
    api_key: apiKey,
    model: model || 'gemini-2.5-flash'
  };
  
  if (chartIdToUse) {
    // Chart-specific query
    requestPayload.chart_id = chartIdToUse;
    console.log('🎯 AI query with chart context:', chartIdToUse);
  } else {
    // Dataset-level query
    requestPayload.dataset_id = datasetId;
    console.log('📊 AI query on entire dataset:', datasetId);
  }
  
  // Call /ai-explore endpoint
  const response = await fetch(`${API}/ai-explore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI query failed: ${error}`);
  }
  
  const result = await response.json();
  
  // Format scope indicator for display
  let scopeIndicator = '';
  if (result.scope_info) {
    const scope = result.scope_info;
    if (scope.type === 'scoped') {
      scopeIndicator = `📊 Analyzed: ${scope.chart_title} (${scope.rows} rows, ${scope.description})\n\n`;
    } else if (scope.type === 'derived') {
      scopeIndicator = `🔄 Analyzed: ${scope.description} (${scope.rows} rows)\n\n`;
    } else if (scope.type === 'global') {
      scopeIndicator = `🌍 Analyzed: Full dataset (${scope.rows} rows)\n\n`;
    }
  }
  
  // In Ask Mode, return the result without creating canvas elements
  // In Canvas Mode, create a textbox on the canvas
  if (mode === 'ask') {
    console.log(`✅ AI Query answered (Ask Mode - no canvas element created)`);
    console.log(`   Scope: ${result.scope_info?.type || 'unknown'}`);
    console.log(`   Is refined: ${result.is_refined || false}`);
    
    return {
      query: action.query,
      answer: result.answer,
      scope_info: result.scope_info,              // Include scope info
      raw_analysis: result.raw_analysis || '',      // Original pandas output
      is_refined: result.is_refined || false,       // Whether insights were refined
      code_steps: result.code_steps || [],
      python_code: result.code_steps ? result.code_steps.join('\n') : '',
      reasoning_steps: result.reasoning_steps || [],
      tabular_data: result.tabular_data || [],
      has_table: result.has_table || false,
      chartIdContext: chartIdToUse,
      mode: 'ask'
    };
  } else {
    // Canvas Mode: Create text box with answer including scope indicator
    const position = calculatePosition(
      action.position, 
      { ...action, referenceChartId: action.chartId }, 
      context
    );
    const insightId = `ai-answer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    setNodes(nodes => nodes.concat({
      id: insightId,
      type: 'textbox',
      position,
      draggable: true,
      selectable: false,
      data: {
        text: `${scopeIndicator}❓ ${action.query}\n\n💬 ${result.answer}`,
        width: 350,
        height: 250,
        fontSize: 14,
        isNew: false,
        aiGenerated: true,
        // Provenance metadata
        createdBy: 'agent',
        createdByQuery: context.currentQuery || null,
        relatedChartId: chartIdToUse || null,
        scopeInfo: result.scope_info || null,      // Store scope info
        createdAt: new Date().toISOString()
      }
    }));
    
    console.log(`✅ AI query answered:`, action.query, 'at position', position);
    console.log(`   Scope: ${result.scope_info?.type || 'unknown'}`);
    
    return {
      insightId,
      query: action.query,
      answer: result.answer,
      scope_info: result.scope_info,
      position,
      mode: 'canvas'
    };
  }
}

/**
 * Show table for a chart's underlying data
 */
async function showTableAction(action, context) {
  const { setNodes, nodes, editor, trackTableCreated } = context;
  
  // Find the chart
  const chartNode = nodes.find(n => n.id === action.chartId);
  if (!chartNode) {
    throw new Error(`Chart ${action.chartId} not found`);
  }
  
  const chartTable = chartNode.data.table || [];
  if (chartTable.length === 0) {
    throw new Error('No table data available for this chart');
  }
  
  // Extract headers and rows
  const headers = Object.keys(chartTable[0]);
  const rows = chartTable.map(row => headers.map(h => row[h]));
  
  // Position table to the right of chart using live TLDraw bounds
  const chartBounds = getLiveShapeBounds(chartNode.id, editor, chartNode);
  const tablePosition = {
    x: chartBounds.x + AGENT_CONFIG.TABLE_HORIZONTAL_SPACING,
    y: chartBounds.y
  };
  
  // Use custom size if provided (for future dashboard table support)
  const tableWidth = action.width || 300;
  const tableHeight = action.height || 400;
  
  const tableId = `table-${action.chartId}-${Date.now()}`;
  
  setNodes(nodes => nodes.concat({
    id: tableId,
    type: 'table',
    position: tablePosition,
    draggable: true,
    selectable: false,
    data: {
      title: `${chartNode.data.title || 'Chart'} - Data`,
      headers,
      rows,
      totalRows: rows.length,
      width: tableWidth,
      height: tableHeight
    }
  }));
  
  console.log(`✅ Created table for chart:`, action.chartId, 'at position', tablePosition, 'size:', `${tableWidth}x${tableHeight}`);
  
  // Track table creation for session analytics  
  if (trackTableCreated) {
    trackTableCreated();
  }
  
  return {
    tableId,
    rowCount: rows.length,
    position: tablePosition,
    width: tableWidth,
    height: tableHeight
  };
}

/**
 * Create a complete dashboard with multiple coordinated elements
 */
async function createDashboardAction(action, context) {
  const { setNodes, getViewportCenter, editor, nodes } = context;
  
  console.log('📊 Creating dashboard:', action.dashboardType || 'general');
  
  // Create layout manager
  const layoutManager = new LayoutManager(editor, nodes);
  
  // Determine layout strategy
  const strategy = action.layoutStrategy || 'grid';
  const elements = action.elements || [];
  
  console.log(`📐 Using ${strategy} layout for ${elements.length} elements`);
  
  // Calculate positions using layout manager
  const layoutPlan = layoutManager.arrangeDashboard(elements, strategy);
  
  // Get viewport center as anchor point
  const anchor = getViewportCenter();
  
  // Add dashboard title and subtitle
  const dashboardTitle = action.dashboardType 
    ? `${action.dashboardType.charAt(0).toUpperCase() + action.dashboardType.slice(1)} Dashboard`
    : 'Dashboard Overview';
  const dashboardSubtitle = `Generated on ${new Date().toLocaleDateString()} • ${elements.length} visualizations`;
  
  // Create title text box
  const titleId = `dashboard-title-${Date.now()}`;
  setNodes(nodes => nodes.concat({
    id: titleId,
    type: 'textbox',
    position: { x: anchor.x, y: anchor.y - 110 }, // Reduced gap: -110 instead of -150
    draggable: true,
    selectable: false,
    data: {
      text: `# ${dashboardTitle}\n\n${dashboardSubtitle}`,
      width: 1200,
      height: 90, // Slightly smaller height
      fontSize: 16,
      isNew: false,
      isDashboardTitle: true,
      createdBy: 'agent',
      createdAt: new Date().toISOString()
    }
  }));
  
  // Create all elements with coordinated positions
  const createdElements = [];
  
  for (const element of layoutPlan) {
    const absolutePosition = {
      x: anchor.x + element.position.x,
      y: anchor.y + element.position.y
    };
    
    if (element.type === 'chart') {
      // Create chart using existing logic
      const chartAction = {
        type: 'create_chart',
        dimensions: element.dimensions,
        measures: element.measures,
        chartType: element.chartType,
        position: 'center',
        reasoning: element.reasoning,
        width: element.size?.w,
        height: element.size?.h
      };
      
      try {
        const result = await createChartAction(chartAction, {
          ...context,
          // Prefer the element-level datasetId (ephemeral dataset from unified agent)
          // over the global context datasetId
          datasetId: element.datasetId || context.datasetId,
          getViewportCenter: () => absolutePosition
        });
        createdElements.push(result);
      } catch (error) {
        console.error(`❌ Failed to create chart in dashboard:`, error);
      }
    } else if (element.type === 'kpi') {
      // Create KPI with absolute positioning
      const kpiAction = {
        type: 'create_kpi',
        query: element.query,
        value: element.value,
        formatted_value: element.formatted_value,
        position: 'center',
        reasoning: element.reasoning,
        width: element.size?.w,
        height: element.size?.h
      };
      
      try {
        const result = await createKPIAction(kpiAction, {
          ...context,
          getViewportCenter: () => absolutePosition,
          useAbsolutePosition: true  // Flag to use exact position from layout
        });
        createdElements.push(result);
      } catch (error) {
        console.error(`❌ Failed to create KPI in dashboard:`, error);
      }
    } else if (element.type === 'insight') {
      // Create insight
      const insightAction = {
        type: 'create_insight',
        text: element.text || '',
        position: 'center',
        reasoning: element.reasoning,
        width: element.size?.w,
        height: element.size?.h
      };
      
      try {
        const result = createInsightAction(insightAction, {
          ...context,
          getViewportCenter: () => absolutePosition
        });
        createdElements.push(result);
      } catch (error) {
        console.error(`❌ Failed to create insight in dashboard:`, error);
      }
    }
    
    // Add small delay for visual effect (progressive rendering)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`✅ Dashboard created: ${createdElements.length} elements + title`);
  
  // NEW: Auto-generate insights for charts
  const shouldGenerateInsights = action.includeInsights !== false && AGENT_CONFIG.AUTO_GENERATE_INSIGHTS;
  const chartElements = createdElements.filter(el => el.type === 'chart' && el.chartId);
  let chartsToAnalyze = []; // Define outside if block for return statement
  
  if (shouldGenerateInsights && chartElements.length > 0) {
    // Respect max insights limit
    const maxInsights = Math.min(
      chartElements.length,
      AGENT_CONFIG.MAX_INSIGHTS_PER_DASHBOARD
    );
    
    console.log(`💡 Auto-generating insights for ${maxInsights}/${chartElements.length} chart(s)...`);
    
    // Find created chart nodes
    chartsToAnalyze = chartElements.slice(0, maxInsights);
    
    // Generate insights with parallel batch processing for faster execution
    const batchSize = AGENT_CONFIG.INSIGHT_BATCH_SIZE || 2;
    console.log(`📦 Processing insights in batches of ${batchSize} for parallel execution`);
    
    for (let i = 0; i < chartsToAnalyze.length; i += batchSize) {
      const batch = chartsToAnalyze.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chartsToAnalyze.length / batchSize);
      
      console.log(`   📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} insights)`);
      
      try {
        // Process batch in parallel with rate limiting
        await Promise.all(batch.map((chart, idx) => {
          const chartIndex = i + idx + 1;
          console.log(`   💡 Generating insight ${chartIndex}/${maxInsights} for: ${chart.title || chart.chartId}`);
          
          const insightAction = {
            type: ACTION_TYPES.GENERATE_CHART_INSIGHTS,
            chartId: chart.chartId,
            position: 'right_of_chart'
          };
          
          // Execute with rate limiting (handles delay automatically)
          return rateLimiter.executeWithRateLimit(
            ACTION_TYPES.GENERATE_CHART_INSIGHTS,
            () => generateChartInsightsAction(insightAction, context)
          ).then(() => {
            console.log(`   ✅ Insight generated for chart ${chartIndex}`);
          }).catch(error => {
            console.error(`   ❌ Failed to generate insight for chart ${chartIndex}:`, error);
            // Continue with other insights in batch
          });
        }));
        
        console.log(`   ✅ Batch ${batchNumber}/${totalBatches} complete`);
        
      } catch (error) {
        console.error(`   ❌ Batch ${batchNumber} failed:`, error);
        // Continue with next batch
      }
    }
    
    console.log('✅ Dashboard insights generation complete!');
  }
  
  return {
    dashboardId: titleId,
    elementsCreated: createdElements.length + 1, // +1 for title
    layout: strategy,
    elements: createdElements,
    insights: chartsToAnalyze.length,
    title: dashboardTitle,
    message: `Created ${action.dashboardType || 'general'} dashboard with ${createdElements.length} elements${chartsToAnalyze.length ? ` and ${chartsToAnalyze.length} insights` : ''}`
  };
}

/**
 * Rearrange existing elements using intelligent layout
 */
function arrangeElementsAction(action, context) {
  const { nodes, setNodes, editor } = context;
  
  if (!editor) {
    throw new Error('Editor not available for arrangement');
  }
  
  const layoutManager = new LayoutManager(editor, nodes);
  
  // Get elements to arrange
  const elementIds = action.elementIds || nodes.map(n => n.id);
  const elementsToArrange = nodes.filter(n => elementIds.includes(n.id));
  
  console.log(`🔄 Arranging ${elementsToArrange.length} elements with ${action.strategy} strategy`);
  
  // Determine strategy
  const strategy = action.strategy || 'optimize';
  
  let layoutPlan;
  if (strategy === 'optimize') {
    // Detect best strategy based on element types and count
    const chartCount = elementsToArrange.filter(n => n.type === 'chart').length;
    const kpiCount = elementsToArrange.filter(n => n.type === 'kpi').length;
    
    if (kpiCount > 2 && chartCount > 0) {
      console.log('📊 Detected KPI dashboard pattern');
      layoutPlan = arrangeKPIDashboard(elementsToArrange);
    } else if (chartCount === 2) {
      console.log('📊 Using comparison layout');
      layoutPlan = layoutManager.arrangeComparison(elementsToArrange);
    } else {
      console.log('📊 Using grid layout');
      layoutPlan = layoutManager.arrangeGrid(elementsToArrange);
    }
  } else if (strategy === 'kpi-dashboard') {
    layoutPlan = arrangeKPIDashboard(elementsToArrange);
  } else {
    layoutPlan = layoutManager.arrangeDashboard(elementsToArrange, strategy);
  }
  
  // Get current viewport center as anchor
  const viewport = editor.getViewportPageBounds();
  const anchor = {
    x: viewport.x + 50,
    y: viewport.y + 50
  };
  
  // Apply new positions — two steps: React state sync + actual TLDraw canvas move
  const updatedNodes = nodes.map(node => {
    const plannedElement = layoutPlan.find(p => p.id === node.id);
    if (plannedElement) {
      return {
        ...node,
        position: {
          x: anchor.x + plannedElement.position.x,
          y: anchor.y + plannedElement.position.y
        }
      };
    }
    return node;
  });

  setNodes(updatedNodes);

  // Actually move TLDraw shapes (setNodes alone only updates React state)
  let movedCount = 0;
  editor.batch(() => {
    updatedNodes.forEach(node => {
      const plannedElement = layoutPlan.find(p => p.id === node.id);
      if (!plannedElement) return;
      const shapeId = `shape:${node.id}`;
      if (editor.getShape(shapeId)) {
        editor.updateShape({
          id: shapeId,
          x: anchor.x + plannedElement.position.x,
          y: anchor.y + plannedElement.position.y,
        });
        movedCount++;
      }
    });
  });

  // Zoom to show all arranged shapes
  try {
    const movedIds = layoutPlan.map(p => `shape:${p.id}`).filter(id => editor.getShape(id));
    if (movedIds.length > 0) {
      editor.setSelectedShapes(movedIds);
      editor.zoomToSelection({ animation: { duration: 500 } });
      editor.setSelectedShapes([]);
    }
  } catch (_) {}

  console.log(`✅ Arranged ${movedCount} elements on canvas`);

  return {
    arrangedCount: movedCount,
    strategy: strategy === 'optimize' ? 'auto-detected' : strategy
  };
}

/**
 * Organize canvas using rule-based layout (0 API calls)
 */
function organizeCanvasAction(action, context) {
  const { nodes, setNodes, editor } = context;
  
  console.log('🔄 Organizing canvas with rule-based layout (0 API calls)');
  
  const result = organizeCanvas(nodes, editor);

  // Sync React state
  setNodes(result.updatedNodes);

  // Actually move TLDraw shapes
  let movedCount = 0;
  editor.batch(() => {
    result.updatedNodes.forEach(node => {
      const shapeId = `shape:${node.id}`;
      if (editor.getShape(shapeId)) {
        editor.updateShape({ id: shapeId, x: node.position.x, y: node.position.y });
        movedCount++;
      }
    });
  });

  // Zoom to show all organised shapes
  try {
    const allIds = result.updatedNodes.map(n => `shape:${n.id}`).filter(id => editor.getShape(id));
    if (allIds.length > 0) {
      editor.setSelectedShapes(allIds);
      editor.zoomToSelection({ animation: { duration: 500 } });
      editor.setSelectedShapes([]);
    }
  } catch (_) {}

  console.log(`✅ Organised ${movedCount} elements using ${result.strategy} layout`);
  
  return {
    organized: true,
    strategy: result.strategy,
    count: result.updatedNodes.length,
    explanation: result.explanation
  };
}

/**
 * Semantic grouping action - calls backend for classification if needed
 */
async function semanticGroupingAction(action, context) {
  const { nodes, setNodes, editor, API, apiKey } = context;
  
  console.log(`🔍 Semantic grouping: "${action.grouping_intent}"`);
  
  // For now, we'll use heuristics (can add API classification later)
  const { organizeByHeuristics } = await import('./canvasOrganizer');
  
  const result = organizeByHeuristics(
    nodes,
    action.grouping_intent,
    editor
  );
  
  // Sync React state
  setNodes(result.updatedNodes);

  // Actually move TLDraw shapes
  editor.batch(() => {
    result.updatedNodes.forEach(node => {
      const shapeId = `shape:${node.id}`;
      if (editor.getShape(shapeId)) {
        editor.updateShape({ id: shapeId, x: node.position.x, y: node.position.y });
      }
    });
  });

  // Zoom to show all grouped shapes
  try {
    const allIds = result.updatedNodes.map(n => `shape:${n.id}`).filter(id => editor.getShape(id));
    if (allIds.length > 0) {
      editor.setSelectedShapes(allIds);
      editor.zoomToSelection({ animation: { duration: 500 } });
      editor.setSelectedShapes([]);
    }
  } catch (_) {}

  console.log(`✅ Created ${result.groups.length} semantic groups`);
  
  return {
    grouped: true,
    groupCount: result.groups.length,
    groups: result.groups,
    explanation: result.explanation
  };
}

/**
 * Drawing actions - use tldraw primitives
 */
function createShapeAction(action, context) {
  const { editor } = context;
  
  if (!editor) {
    throw new Error('Editor not available');
  }
  
  const shapeType = action.shapeType || 'rectangle';
  const color = action.color || 'red';
  const isStickyNote = shapeType === 'sticky_note';

  // Resolve target shape bounds when action.target is provided
  const PADDING = 16;
  let resolvedProps = null;

  if (action.target) {
    // 1. Try ID-based resolution (exact, prefixed "shape:", and fuzzy suffix)
    let targetShapeId = resolveTLDrawShapeId(action.target, editor);

    // 2. Fall back to title/label fuzzy match across all page shapes
    if (!targetShapeId) {
      const needle = action.target.toLowerCase();
      const all = editor.getCurrentPageShapes();
      const match = all.find(s => {
        const candidates = [
          s.props?.title,
          s.props?.text,
          s.props?.name,
          s.meta?.title,
          s.meta?.label,
        ].filter(Boolean).map(v => String(v).toLowerCase());
        return candidates.some(c => c.includes(needle) || needle.includes(c));
      });
      if (match) targetShapeId = match.id;
    }

    if (targetShapeId) {
      try {
        const targetShape = editor.getShape(targetShapeId);
        const bounds = targetShape && editor.getShapePageBounds(targetShape);
        if (bounds) {
          resolvedProps = {
            x: bounds.x - PADDING,
            y: bounds.y - PADDING,
            w: bounds.w + PADDING * 2,
            h: bounds.h + PADDING * 2,
          };
          console.log(`🎯 createShapeAction: wrapping "${action.target}" (${targetShapeId}) at`, resolvedProps);
        }
      } catch (e) {
        console.warn(`⚠️ createShapeAction: could not read bounds for "${action.target}":`, e);
      }
    } else {
      console.warn(`⚠️ createShapeAction: target "${action.target}" not found on canvas — falling back to viewport center`);
    }
  }

  // Fall back to viewport center when target is absent or unresolvable
  if (!resolvedProps) {
    const viewport = editor.getViewportPageBounds();
    resolvedProps = {
      x: viewport.x + viewport.width / 2 - (isStickyNote ? 125 : 200),
      y: viewport.y + viewport.height / 2 - (isStickyNote ? 60 : 100),
      w: isStickyNote ? 250 : 400,
      h: isStickyNote ? 120 : 200,
    };
  }

  // Convert to tldraw action format (expected by executeDrawingActions)
  const drawingAction = {
    type: 'create_shape',
    shape: shapeType,
    props: {
      ...resolvedProps,
      color: color,
      fill: action.style === 'solid' ? 'solid' : 'none',
      dash: action.style === 'dashed' ? 'dashed' : 'solid',
      ...(action.text ? { text: action.text } : {})
    }
  };
  
  // Execute using tldraw agent
  const shapeIds = executeDrawingActions([drawingAction], editor);
  
  console.log(`✅ Created ${shapeType} shape, IDs: ${shapeIds.join(', ')}`);
  
  return {
    created: true,
    shapeType: shapeType,
    shapeIds: shapeIds,
    count: shapeIds.length
  };
}

function createArrowAction(action, context) {
  const { editor } = context;

  if (!editor) throw new Error('Editor not available');

  // Helper: resolve a shape ID (React node id or TLDraw shape id) to page-space center
  function resolveCenter(rawId) {
    if (!rawId) return null;

    // Try exact and prefixed IDs first
    const tlId = resolveTLDrawShapeId(rawId, editor);
    if (tlId) {
      const shape = editor.getShape(tlId);
      if (shape) {
        const b = editor.getShapePageBounds(shape);
        if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      }
    }

    // Fuzzy fallback: match by title / text content
    const needle = rawId.toLowerCase();
    const all = editor.getCurrentPageShapes();
    const match = all.find(s => {
      const title = (s.props?.title || s.meta?.title || s.props?.text || '').toLowerCase();
      return title.includes(needle) || needle.includes(title.split(' ')[0]);
    });
    if (match) {
      const b = editor.getShapePageBounds(match);
      if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    return null;
  }

  const fromCenter = resolveCenter(action.from);
  const toCenter   = resolveCenter(action.to);

  let arrowX, arrowY, arrowW, arrowH;

  if (fromCenter && toCenter) {
    // Place arrow starting at fromCenter, ending at toCenter
    arrowX = fromCenter.x;
    arrowY = fromCenter.y;
    arrowW = toCenter.x - fromCenter.x;
    arrowH = toCenter.y - fromCenter.y;
    console.log(`🏹 Arrow from (${arrowX.toFixed(0)},${arrowY.toFixed(0)}) → (${toCenter.x.toFixed(0)},${toCenter.y.toFixed(0)})`);
  } else {
    // Graceful fallback to viewport center if shapes couldn't be resolved
    const viewport = editor.getViewportPageBounds();
    arrowX = viewport.x + viewport.width / 2 - 200;
    arrowY = viewport.y + viewport.height / 2;
    arrowW = 400;
    arrowH = 0;
    console.warn(`⚠️ create_arrow: couldn't resolve from="${action.from}" or to="${action.to}", using viewport center`);
  }

  const drawingAction = {
    type: 'create_shape',
    shape: 'arrow',
    props: {
      x: arrowX,
      y: arrowY,
      w: arrowW,
      h: arrowH,
      start: { x: 0, y: 0 },
      end: { x: arrowW, y: arrowH },
      color: action.color || 'black',
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      text: action.label || '',
    }
  };

  const shapeIds = executeDrawingActions([drawingAction], editor);

  console.log(`✅ Created arrow, IDs: ${shapeIds.join(', ')}`);

  return {
    created: true,
    shapeIds,
    count: shapeIds.length
  };
}

function createTextAction(action, context) {
  const { editor } = context;
  
  if (!editor) {
    throw new Error('Editor not available');
  }
  
  const fontSize = action.fontSize === 'large' ? 48 : 
                   action.fontSize === 'small' ? 16 : 24;
  
  // Get viewport center
  const viewport = editor.getViewportPageBounds();
  const centerX = viewport.x + viewport.width / 2;
  const centerY = viewport.y + viewport.height / 2;
  
  // Position based on requested position
  let y = centerY;
  if (action.position === 'top') {
    y = viewport.y + 100;
  } else if (action.position === 'bottom') {
    y = viewport.y + viewport.height - 100;
  }
  
  // Convert to tldraw action format
  const drawingAction = {
    type: 'create_shape',
    shape: 'text',
    props: {
      x: centerX - 200,
      y: y,
      w: 400,
      h: 100,
      text: action.text,
      size: fontSize === 48 ? 'xl' : fontSize === 16 ? 's' : 'm',
      color: 'black',
      font: 'sans',
      align: 'middle'
    }
  };
  
  const shapeIds = executeDrawingActions([drawingAction], editor);
  
  console.log(`✅ Created text: "${action.text}", IDs: ${shapeIds.join(', ')}`);
  
  return {
    created: true,
    text: action.text,
    shapeIds: shapeIds,
    count: shapeIds.length
  };
}

function highlightElementAction(action, context) {
  const { editor, nodes } = context;
  
  if (!editor) {
    throw new Error('Editor not available');
  }
  
  // Find target element
  const targetNode = nodes.find(n => n.id === action.targetId);
  
  if (!targetNode) {
    throw new Error(`Element ${action.targetId} not found`);
  }
  
  const highlightType = action.highlightType || 'box';
  const color = action.color || 'yellow';

  // Use live TLDraw bounds so the highlight tracks the shape's current position
  // even if the user moved it after creation.
  const bounds = getLiveShapeBounds(targetNode.id, editor, targetNode);

  // Create highlight shape around target
  const drawingAction = {
    type: 'create_shape',
    shape: 'rectangle', // Use 'rectangle' not 'geo'
    props: {
      x: bounds.x - 20,
      y: bounds.y - 20,
      w: bounds.w + 40,
      h: bounds.h + 40,
      color: color,
      fill: highlightType === 'background' ? 'semi' : 'none',
      dash: highlightType === 'box' ? 'dashed' : 'solid',
      opacity: 0.5
    }
  };
  
  const shapeIds = executeDrawingActions([drawingAction], editor);
  
  console.log(`✅ Highlighted element: ${action.targetId}, IDs: ${shapeIds.join(', ')}`);
  
  return {
    highlighted: true,
    targetId: action.targetId,
    highlightType: highlightType,
    shapeIds: shapeIds,
    count: shapeIds.length
  };
}

/**
 * Generate success message for action result
 */
function getSuccessMessage(action, result) {
  switch (action.type) {
    case ACTION_TYPES.CREATE_CHART:
      return `✅ Created ${action.chartType || 'bar'} chart: ${action.measures.join(', ')} by ${action.dimensions.join(', ')}`;
    case ACTION_TYPES.CREATE_INSIGHT:
      return `✅ Added insight: "${action.text.substring(0, 50)}${action.text.length > 50 ? '...' : ''}"`;
    case ACTION_TYPES.CREATE_KPI:
      return `✅ Created KPI: ${result.formattedValue || result.value}`;
    case ACTION_TYPES.GENERATE_CHART_INSIGHTS:
      return `✅ Generated AI insights for chart`;
    case ACTION_TYPES.AI_QUERY:
      return `✅ Answered: "${action.query.substring(0, 50)}${action.query.length > 50 ? '...' : ''}"`;
    case ACTION_TYPES.SHOW_TABLE:
      return `✅ Created data table (${result.rowCount} rows)`;
    case ACTION_TYPES.CREATE_DASHBOARD:
      return `✅ Created "${result.title || 'dashboard'}" with ${result.elementsCreated} elements`;
    case ACTION_TYPES.ARRANGE_ELEMENTS:
      return `✅ Arranged ${result.arrangedCount} elements using ${result.strategy} layout`;
    case ACTION_TYPES.ORGANIZE_CANVAS:
      return `✅ Organized ${result.count} elements using ${result.strategy} layout`;
    case ACTION_TYPES.SEMANTIC_GROUPING:
      return `✅ Created ${result.groupCount} semantic groups`;
    case ACTION_TYPES.CREATE_SHAPE:
      return result.count > 0 ? `✅ Created ${result.shapeType}` : `⚠️ Failed to create ${result.shapeType}`;
    case ACTION_TYPES.CREATE_ARROW:
      return result.count > 0 ? `✅ Created arrow` : `⚠️ Failed to create arrow`;
    case ACTION_TYPES.CREATE_TEXT:
      return result.count > 0 ? `✅ Added text: "${result.text}"` : `⚠️ Failed to create text`;
    case ACTION_TYPES.HIGHLIGHT_ELEMENT:
      return result.count > 0 ? `✅ Highlighted element` : `⚠️ Failed to highlight element`;
    case ACTION_TYPES.MOVE_SHAPE:
      return result.moved ? `✅ Moved shape to (${result.x}, ${result.y})` : `⚠️ Could not move shape`;
    case ACTION_TYPES.HIGHLIGHT_SHAPE:
      return result.highlighted ? `✅ Highlighted: ${result.title || result.shapeId}` : `⚠️ Shape not found`;
    case ACTION_TYPES.ALIGN_SHAPES:
      return `✅ Aligned ${result.count} shapes (${action.alignment})`;
    case ACTION_TYPES.DISTRIBUTE_SHAPES:
      return `✅ Distributed ${result.count} shapes (${action.direction})`;
    case ACTION_TYPES.SMART_PLACE:
      return `✅ Placed shape at (${result.x}, ${result.y})`;
    default:
      return '✅ Action completed';
  }
}

// =============================================================================
// Spatial Manipulation Actions
// =============================================================================

/**
 * Resolve a shape ID to a TLDraw shape ID.
 * The model may send either a React node ID like "abc123" or
 * a full TLDraw ID like "shape:abc123".
 */
function resolveTLDrawShapeId(rawId, editor) {
  if (!rawId || !editor) return null;
  // Try "shape:<id>" first (most common for our custom shapes)
  const fullId = rawId.startsWith('shape:') ? rawId : `shape:${rawId}`;
  const shape = editor.getShape(fullId);
  if (shape) return fullId;
  // Try as-is (for native tldraw shapes like geo, text, arrow)
  const direct = editor.getShape(rawId);
  if (direct) return rawId;
  // Fuzzy: search all shapes whose ID ends with the rawId
  const all = editor.getCurrentPageShapes();
  const fuzzy = all.find(s => s.id.endsWith(rawId));
  return fuzzy ? fuzzy.id : null;
}

/**
 * MoveShapeAction — move a shape to a new position.
 * action: { shapeId, x, y, reason? }
 */
function moveShapeAction(action, context) {
  const { editor, currentQuery } = context;
  if (!editor) throw new Error('Editor not available for move_shape');

  // Selection shortcut — same pattern as highlightShapeAction
  let shapeId = null;
  const queryLower = (currentQuery || '').toLowerCase();
  const selectionKeywords = ['selected', 'this chart', 'this shape', 'the chart i selected', 'it'];
  if (selectionKeywords.some(kw => queryLower.includes(kw))) {
    try {
      const sel = editor.getSelectedShapeIds();
      if (sel && sel.length > 0) {
        shapeId = sel[0];
        console.log(`🎯 move_shape: using active editor selection "${shapeId}"`);
      }
    } catch (_) {}
  }
  if (!shapeId) shapeId = resolveTLDrawShapeId(action.shapeId, editor);

  if (!shapeId) {
    console.warn(`⚠️ move_shape: shape "${action.shapeId}" not found`);
    return { moved: false, shapeId: action.shapeId };
  }

  const x = Number(action.x);
  const y = Number(action.y);
  if (isNaN(x) || isNaN(y)) throw new Error('move_shape: x and y must be numbers');

  editor.updateShape({ id: shapeId, x, y });
  console.log(`✅ Moved shape ${shapeId} to (${x}, ${y})`);

  // Pan viewport to show the moved shape
  try {
    editor.setSelectedShapes([shapeId]);
    editor.zoomToSelection({ animation: { duration: 400 } });
    editor.setSelectedShapes([]);
  } catch (_) {}

  return { moved: true, shapeId, x, y };
}

/**
 * HighlightShapeAction — select a shape and zoom to it.
 * Optionally flashes a temporary highlight ring and pans the viewport.
 * action: { shapeId, reason?, title? }
 *
 * Client-side shortcut: if the query refers to "selected" or "this" chart and
 * there is an active editor selection, use that directly rather than trusting
 * the model's shapeId — the model cannot see real-time selection state.
 */
function highlightShapeAction(action, context) {
  const { editor, nodes, currentQuery } = context;
  if (!editor) throw new Error('Editor not available for highlight_shape');

  // Selection shortcut — detect "selected / this / it" intent and use real selection
  let shapeId = null;
  const queryLower = (currentQuery || '').toLowerCase();
  const selectionKeywords = ['selected', 'this chart', 'this shape', 'the chart i selected', 'it', 'focused'];
  const refersToSelection = selectionKeywords.some(kw => queryLower.includes(kw));

  if (refersToSelection) {
    try {
      const currentSelection = editor.getSelectedShapeIds();
      if (currentSelection && currentSelection.length > 0) {
        shapeId = currentSelection[0];
        console.log(`🎯 highlight_shape: using active editor selection "${shapeId}" (query referred to "selected")`);
      }
    } catch (_) {}
  }

  // Fall back to model-provided shapeId
  if (!shapeId) {
    shapeId = resolveTLDrawShapeId(action.shapeId, editor);
  }

  if (!shapeId) {
    console.warn(`⚠️ highlight_shape: shape "${action.shapeId}" not found`);
    return { highlighted: false, shapeId: action.shapeId };
  }

  // Select the shape so TLDraw visually highlights it with the selection ring
  editor.setSelectedShapes([shapeId]);

  // Zoom viewport to show the shape with comfortable padding
  try {
    editor.zoomToSelection({ animation: { duration: 500 } });
  } catch (_) {}

  // Resolve title for the success message
  const node = nodes?.find(n => n.id === action.shapeId || `shape:${n.id}` === shapeId);
  const title = action.title || node?.data?.title || action.shapeId;

  console.log(`✅ Highlighted shape: ${shapeId} (${title})`);
  return { highlighted: true, shapeId, title };
}

/**
 * AlignShapesAction — align multiple shapes along an axis.
 * action: { shapeIds: string[], alignment: 'left'|'center-horizontal'|'right'|'top'|'center-vertical'|'bottom' }
 */
function alignShapesAction(action, context) {
  const { editor } = context;
  if (!editor) throw new Error('Editor not available for align_shapes');

  const shapeIds = (action.shapeIds || [])
    .map(id => resolveTLDrawShapeId(id, editor))
    .filter(Boolean);

  if (shapeIds.length < 2) {
    console.warn('⚠️ align_shapes: need at least 2 valid shapes');
    return { count: 0, alignment: action.alignment };
  }

  // Map friendly alignment names to TLDraw's expected string
  const alignmentMap = {
    'left': 'left',
    'right': 'right',
    'top': 'top',
    'bottom': 'bottom',
    'center': 'center-horizontal',
    'center-horizontal': 'center-horizontal',
    'center-vertical': 'center-vertical',
    'middle': 'center-vertical',
  };
  const tldrawAlignment = alignmentMap[action.alignment] || action.alignment;

  editor.alignShapes(shapeIds, tldrawAlignment);
  console.log(`✅ Aligned ${shapeIds.length} shapes: ${tldrawAlignment}`);
  return { count: shapeIds.length, alignment: tldrawAlignment };
}

/**
 * DistributeShapesAction — evenly distribute shapes along an axis.
 * action: { shapeIds: string[], direction: 'horizontal'|'vertical' }
 */
function distributeShapesAction(action, context) {
  const { editor } = context;
  if (!editor) throw new Error('Editor not available for distribute_shapes');

  const shapeIds = (action.shapeIds || [])
    .map(id => resolveTLDrawShapeId(id, editor))
    .filter(Boolean);

  if (shapeIds.length < 3) {
    console.warn('⚠️ distribute_shapes: need at least 3 shapes to distribute');
    return { count: shapeIds.length, direction: action.direction };
  }

  const direction = action.direction === 'vertical' ? 'vertical' : 'horizontal';
  editor.distributeShapes(shapeIds, direction);
  console.log(`✅ Distributed ${shapeIds.length} shapes: ${direction}`);
  return { count: shapeIds.length, direction };
}

/**
 * SmartPlaceAction — find a non-overlapping position and place a shape there.
 * Validates that the model-suggested coordinates don't overlap existing shapes.
 * action: { suggestedX, suggestedY, width, height, fallbackToViewport? }
 */
function smartPlaceAction(action, context) {
  const { editor, nodes, getViewportCenter } = context;
  if (!editor) throw new Error('Editor not available for smart_place');

  const width = Number(action.width) || 800;
  const height = Number(action.height) || 400;
  const padding = 30;

  // Collect occupied bounding boxes from all existing shapes
  const occupiedBoxes = [];
  try {
    const allShapes = editor.getCurrentPageShapes();
    for (const shape of allShapes) {
      const bounds = editor.getShapePageBounds(shape);
      if (bounds) {
        occupiedBoxes.push({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
      }
    }
  } catch (_) {}

  // AABB overlap test
  function overlaps(ax, ay, aw, ah) {
    return occupiedBoxes.some(b =>
      ax < b.x + b.w + padding &&
      ax + aw + padding > b.x &&
      ay < b.y + b.h + padding &&
      ay + ah + padding > b.y
    );
  }

  // Try the model-suggested position first
  let x = Number(action.suggestedX);
  let y = Number(action.suggestedY);
  let placed = false;

  if (!isNaN(x) && !isNaN(y) && !overlaps(x, y, width, height)) {
    placed = true;
  } else {
    // Fallback: scan rightward from rightmost existing shape, then below
    if (occupiedBoxes.length > 0) {
      const maxRight = Math.max(...occupiedBoxes.map(b => b.x + b.w));
      const midY = occupiedBoxes.reduce((s, b) => s + b.y + b.h / 2, 0) / occupiedBoxes.length;
      x = maxRight + padding;
      y = midY - height / 2;
      if (!overlaps(x, y, width, height)) {
        placed = true;
      } else {
        // Try below
        const maxBottom = Math.max(...occupiedBoxes.map(b => b.y + b.h));
        const midX = occupiedBoxes.reduce((s, b) => s + b.x + b.w / 2, 0) / occupiedBoxes.length;
        x = midX - width / 2;
        y = maxBottom + padding;
        placed = true;
      }
    } else {
      // Empty canvas: use viewport center
      const vc = getViewportCenter ? getViewportCenter() : { x: 0, y: 0 };
      x = vc.x - width / 2;
      y = vc.y - height / 2;
      placed = true;
    }
  }

  console.log(`✅ smart_place resolved position: (${Math.round(x)}, ${Math.round(y)})`);
  return { x: Math.round(x), y: Math.round(y), width, height, placed };
}
