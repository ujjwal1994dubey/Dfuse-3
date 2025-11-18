/**
 * Action Executor Module
 * Executes agent actions by creating charts and insights on the canvas
 */

import { ACTION_TYPES, AGENT_CONFIG } from './types';
import { getEChartsDefaultType } from '../charts/echartsRegistry';

/**
 * Execute multiple actions in sequence
 * @param {Array} actions - Array of validated actions to execute
 * @param {Object} context - Execution context with API, datasetId, setNodes, etc.
 * @returns {Promise<Array>} Array of execution results
 */
export async function executeActions(actions, context) {
  const results = [];
  
  for (const action of actions) {
    try {
      console.log(`🤖 Executing action: ${action.type}`, action);
      const result = await executeAction(action, context);
      results.push({ 
        success: true, 
        action, 
        result,
        message: getSuccessMessage(action, result)
      });
    } catch (error) {
      console.error(`❌ Action execution failed:`, error);
      results.push({ 
        success: false, 
        action, 
        error: error.message,
        message: `Failed: ${error.message}`
      });
    }
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
    case ACTION_TYPES.GENERATE_CHART_INSIGHTS:
      return await generateChartInsightsAction(action, context);
    case ACTION_TYPES.AI_QUERY:
      return await aiQueryAction(action, context);
    case ACTION_TYPES.SHOW_TABLE:
      return await showTableAction(action, context);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Create a chart on the canvas
 */
async function createChartAction(action, context) {
  const { API, datasetId, setNodes, figureFromPayload } = context;
  
  // Call existing /charts endpoint
  const response = await fetch(`${API}/charts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset_id: datasetId,
      dimensions: action.dimensions,
      measures: action.measures
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chart creation failed: ${error}`);
  }
  
  const chart = await response.json();
  const position = calculatePosition(action.position, action, context);
  
  // Determine chart type
  const defaultChartType = getEChartsDefaultType(
    action.dimensions.length,
    action.measures.length
  );
  const chartTypeId = action.chartType || defaultChartType.id;
  
  // Use figureFromPayload to properly format chart data for ECharts
  const figure = figureFromPayload ? figureFromPayload(chart, chartTypeId) : {
    data: chart.data || [],
    layout: chart.layout || {}
  };
  
  // Add chart to canvas using existing pattern
  const chartId = chart.chart_id;
  setNodes(nodes => nodes.concat({
    id: chartId,
    type: 'chart',
    position,
    draggable: true,
    selectable: false,
    data: {
      title: chart.title || `${action.measures[0]} by ${action.dimensions[0]}`,
      figure,
      chartType: chartTypeId,
      dimensions: action.dimensions,
      measures: action.measures,
      table: chart.table || [],
      agg: chart.agg || 'sum',
      datasetId: datasetId,
      selected: false,
      filters: chart.filters || {},
      width: AGENT_CONFIG.DEFAULT_CHART_WIDTH,
      height: AGENT_CONFIG.DEFAULT_CHART_HEIGHT
    }
  }));
  
  console.log(`✅ Chart created:`, chartId, 'at position', position);
  
  return { 
    chartId, 
    position,
    dimensions: action.dimensions,
    measures: action.measures
  };
}

/**
 * Create an insight text box on the canvas
 */
function createInsightAction(action, context) {
  const { setNodes } = context;
  
  const position = calculatePosition(action.position, action, context);
  const insightId = `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Add text box to canvas
  setNodes(nodes => nodes.concat({
    id: insightId,
    type: 'textbox',
    position,
    draggable: true,
    selectable: false,
    data: {
      text: action.text,
      width: 220,
      height: 220,
      fontSize: 14,
      isNew: false
    }
  }));
  
  console.log(`✅ Insight created:`, insightId, 'at position', position);
  
  return { 
    insightId, 
    position,
    text: action.text
  };
}

/**
 * Calculate position for new element based on position type
 */
function calculatePosition(positionType, action, context) {
  const { getViewportCenter, nodes, referenceChartId } = context;
  
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
          return {
            x: refChart.position.x + AGENT_CONFIG.CHART_HORIZONTAL_SPACING,
            y: refChart.position.y
          };
        }
      }
      // Fallback to center if reference chart not found
      return getViewportCenter();
      
    case 'below_chart':
      if (chartIdToUse) {
        const refChart = findNodeById(chartIdToUse, nodes);
        if (refChart) {
          return {
            x: refChart.position.x,
            y: refChart.position.y + AGENT_CONFIG.CHART_VERTICAL_SPACING
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
  const { API, apiKey, setNodes, nodes } = context;
  
  if (!apiKey) {
    throw new Error('API key is required for generating insights');
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
      model: 'gemini-2.0-flash'
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate insights: ${error}`);
  }
  
  const result = await response.json();
  
  // Create insight text box with AI-generated insights
  const position = calculatePosition(action.position, action, { ...context, referenceChartId: action.chartId });
  const insightId = `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Format insights as bullet points
  const insightText = result.insight || result.generic_insights || 'No insights available';
  
  setNodes(nodes => nodes.concat({
    id: insightId,
    type: 'textbox',
    position,
    draggable: true,
    selectable: false,
    data: {
      text: `💡 Chart Insights:\n\n${insightText}`,
      width: 300,
      height: 250,
      fontSize: 14,
      isNew: false,
      aiGenerated: true,
      sourceChartId: action.chartId
    }
  }));
  
  console.log(`✅ Generated insights for chart:`, action.chartId, 'at position', position);
  
  return {
    insightId,
    text: insightText,
    position
  };
}

/**
 * Answer free-form AI query about data
 */
async function aiQueryAction(action, context) {
  const { API, apiKey, datasetId, setNodes, nodes, editor } = context;
  
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
    model: 'gemini-2.0-flash'
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
  
  // Create text box with answer
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
      text: `❓ ${action.query}\n\n💬 ${result.answer}`,
      width: 350,
      height: 250,
      fontSize: 14,
      isNew: false,
      aiGenerated: true
    }
  }));
  
  console.log(`✅ AI query answered:`, action.query, 'at position', position);
  
  return {
    insightId,
    query: action.query,
    answer: result.answer,
    position
  };
}

/**
 * Show table for a chart's underlying data
 */
async function showTableAction(action, context) {
  const { setNodes, nodes } = context;
  
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
  
  // Position table to the right of chart
  const tablePosition = {
    x: chartNode.position.x + AGENT_CONFIG.TABLE_HORIZONTAL_SPACING,
    y: chartNode.position.y
  };
  
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
      width: 600,
      height: 400
    }
  }));
  
  console.log(`✅ Created table for chart:`, action.chartId, 'at position', tablePosition);
  
  return {
    tableId,
    rowCount: rows.length,
    position: tablePosition
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
    case ACTION_TYPES.GENERATE_CHART_INSIGHTS:
      return `✅ Generated AI insights for chart`;
    case ACTION_TYPES.AI_QUERY:
      return `✅ Answered: "${action.query.substring(0, 50)}${action.query.length > 50 ? '...' : ''}"`;
    case ACTION_TYPES.SHOW_TABLE:
      return `✅ Created data table (${result.rowCount} rows)`;
    default:
      return '✅ Action completed';
  }
}

