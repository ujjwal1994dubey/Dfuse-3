/**
 * Canvas Snapshot Module
 * Extracts current canvas state into structured JSON for agent context
 */

/**
 * Get complete canvas snapshot including all shapes and metadata
 * @param {Object} editor - TLDraw editor instance
 * @param {Array} nodes - Current canvas nodes
 * @returns {Object} Structured canvas state
 */
export function getCanvasSnapshot(editor, nodes) {
  return {
    charts: extractCharts(nodes),
    tables: extractTables(nodes),
    textBoxes: extractTextBoxes(nodes),
    metadata: {
      nodeCount: nodes.length,
      chartTypes: getUniqueChartTypes(nodes),
      hasData: nodes.length > 0
    }
  };
}

/**
 * Extract chart nodes with relevant data
 */
function extractCharts(nodes) {
  return nodes
    .filter(n => n.type === 'chart')
    .map(n => ({
      id: n.id,
      dimensions: n.data.dimensions || [],
      measures: n.data.measures || [],
      chartType: n.data.chartType || 'bar',
      title: n.data.title || '',
      position: n.position || { x: 0, y: 0 }
    }));
}

/**
 * Extract table nodes
 */
function extractTables(nodes) {
  return nodes
    .filter(n => n.type === 'table')
    .map(n => ({
      id: n.id,
      title: n.data.title || '',
      headers: n.data.headers || [],
      rowCount: n.data.totalRows || 0,
      position: n.position || { x: 0, y: 0 }
    }));
}

/**
 * Extract text box nodes (insights)
 */
function extractTextBoxes(nodes) {
  return nodes
    .filter(n => n.type === 'textbox')
    .map(n => ({
      id: n.id,
      text: n.data.text || '',
      position: n.position || { x: 0, y: 0 }
    }));
}

/**
 * Get list of unique chart types on canvas
 */
function getUniqueChartTypes(nodes) {
  const chartTypes = nodes
    .filter(n => n.type === 'chart' && n.data.chartType)
    .map(n => n.data.chartType);
  
  return [...new Set(chartTypes)];
}

