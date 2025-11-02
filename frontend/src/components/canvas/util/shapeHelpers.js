/**
 * Shape Helper Utilities
 * Functions for working with TLDraw shapes
 */

/**
 * Create a new chart shape
 */
export function createChartShape(id, position, chartData) {
  return {
    id: id,
    type: 'chart',
    x: position.x,
    y: position.y,
    props: {
      w: chartData.width || 800,
      h: chartData.height || 400,
      chartData: chartData.figure?.data || null,
      chartLayout: chartData.figure?.layout || null,
      chartType: chartData.chartType || 'bar',
      title: chartData.title || '',
      dimensions: chartData.dimensions || [],
      measures: chartData.measures || [],
      table: chartData.table || [],
      agg: chartData.agg || 'sum',
      datasetId: chartData.datasetId || '',
      selected: false,
      aiInsights: null,
      aiQuery: ''
    }
  };
}

/**
 * Create a new text box shape
 */
export function createTextBoxShape(id, position) {
  return {
    id: id,
    type: 'textbox',
    x: position.x,
    y: position.y,
    props: {
      w: 200,
      h: 100,
      text: '',
      fontSize: 14
    }
  };
}

/**
 * Create a new table shape
 */
export function createTableShape(id, position, tableData) {
  return {
    id: id,
    type: 'table',
    x: position.x,
    y: position.y,
    props: {
      w: 600,
      h: 400,
      title: tableData.title || 'Data Table',
      headers: tableData.headers || [],
      rows: tableData.rows || [],
      totalRows: tableData.totalRows || 0
    }
  };
}

/**
 * Update chart shape data
 */
export function updateChartShape(editor, shapeId, updates) {
  const shape = editor.getShape(shapeId);
  if (!shape || shape.type !== 'chart') return;

  editor.updateShape({
    ...shape,
    props: {
      ...shape.props,
      ...updates
    }
  });
}

/**
 * Get all chart shapes
 */
export function getAllChartShapes(editor) {
  return editor.getCurrentPageShapes().filter(s => s.type === 'chart');
}

/**
 * Get selected chart shapes
 */
export function getSelectedChartShapes(editor) {
  return getAllChartShapes(editor).filter(s => s.props.selected);
}
