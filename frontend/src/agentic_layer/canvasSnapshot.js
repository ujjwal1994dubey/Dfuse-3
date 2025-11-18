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
    .map(n => {
      const existingInsight = findAssociatedInsight(n.id, nodes);
      
      return {
        id: n.id,
        dimensions: n.data.dimensions || [],
        measures: n.data.measures || [],
        chartType: n.data.chartType || 'bar',
        title: n.data.title || '',
        position: n.position || { x: 0, y: 0 },
        
        // Token-efficient context
        existingInsight: existingInsight, // Reuse insights (zero token cost!)
        dataSummary: !existingInsight && n.data.table ? extractStatisticalSummary(n.data.table) : null,
        
        // Provenance metadata
        createdBy: n.data.createdBy || 'user',
        createdByQuery: n.data.createdByQuery || null,
        creationReasoning: n.data.creationReasoning || null
      };
    });
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
      position: n.position || { x: 0, y: 0 },
      relatedChartId: n.data.relatedChartId || null // Semantic link to chart
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

/**
 * Find insight textbox linked to chart via metadata
 * Uses semantic relationships (relatedChartId) not spatial proximity
 */
function findAssociatedInsight(chartId, nodes) {
  const textboxes = nodes.filter(n => n.type === 'textbox');
  
  // Check for explicit semantic relationship (set when insight created)
  const linkedInsight = textboxes.find(t => 
    t.data.relatedChartId === chartId
  );
  
  return linkedInsight ? linkedInsight.data.text : null;
}

/**
 * Extract statistical summary from chart data table
 * Provides min/max/avg for numeric columns - compact and informative
 */
function extractStatisticalSummary(table) {
  if (!table || table.length === 0) return null;
  
  const summary = [];
  
  // Get columns
  const columns = Object.keys(table[0] || {});
  
  // Count
  summary.push(`Count: ${table.length} items`);
  
  // For each numeric column, calculate min/max/avg
  columns.forEach(col => {
    const values = table.map(row => row[col]).filter(v => typeof v === 'number');
    
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      
      summary.push(
        `${col}: min=${min.toLocaleString()}, max=${max.toLocaleString()}, avg=${Math.round(avg).toLocaleString()}`
      );
    }
  });
  
  return summary.join(' | ');
}

