/**
 * Bidirectional State Converter
 * Converts between React Flow state and TLDraw state
 * Ensures data compatibility and preservation
 */

/**
 * Convert React Flow nodes to TLDraw shapes
 * @param {Array} nodes - React Flow nodes
 * @returns {Array} TLDraw shapes
 */
export function convertNodesToShapes(nodes) {
  if (!Array.isArray(nodes)) {
    console.warn('convertNodesToShapes: Invalid nodes array', nodes);
    return [];
  }

  return nodes.map((node) => {
    try {
      return convertSingleNodeToShape(node);
    } catch (error) {
      console.error('Error converting node to shape:', node.id, error);
      return null;
    }
  }).filter(Boolean); // Remove null entries
}

/**
 * Convert single React Flow node to TLDraw shape
 */
function convertSingleNodeToShape(node) {
  const baseShape = {
    id: node.id,
    type: node.type || 'chart',
    x: node.position?.x || 0,
    y: node.position?.y || 0,
    rotation: 0,
    // Don't specify index - let TLDraw assign it automatically via editor.createShapes()
    parentId: undefined,
    isLocked: false
  };

  // Route to specific converter based on type
  switch (node.type) {
    case 'chart':
      return convertChartNodeToShape(node, baseShape);
    case 'textbox':
      return convertTextBoxNodeToShape(node, baseShape);
    case 'table':
      return convertTableNodeToShape(node, baseShape);
    default:
      console.warn('Unknown node type:', node.type);
      return null;
  }
}

/**
 * Convert chart node to shape
 */
function convertChartNodeToShape(node, baseShape) {
  // Handle ECharts data structure
  const chartData = node.data?.chartData || null;
  const chartLayout = node.data?.chartLayout || null;
  
  return {
    ...baseShape,
    props: {
      w: node.data?.width || 800,
      h: node.data?.height || 400,
      chartData: chartData,
      chartLayout: chartLayout,
      chartType: node.data?.chartType || 'bar',
      title: node.data?.title || '',
      dimensions: node.data?.dimensions || [],
      measures: node.data?.measures || [],
      table: node.data?.table || [],
      agg: node.data?.agg || 'sum',
      datasetId: node.data?.datasetId || '',
      selected: node.data?.selected || false,
      aiInsights: node.data?.aiInsights || null,
      aiQuery: node.data?.aiQuery || '',
      isNewlyCreated: node.data?.isNewlyCreated || false
    }
  };
}

/**
 * Convert text box node to shape
 */
function convertTextBoxNodeToShape(node, baseShape) {
  return {
    ...baseShape,
    props: {
      w: node.data?.width || 200,
      h: node.data?.height || 100,
      text: node.data?.text || '',
      fontSize: node.data?.fontSize || 14,
      isAIInsights: node.data?.isAIInsights || false
    }
  };
}

/**
 * Convert table node to shape
 */
function convertTableNodeToShape(node, baseShape) {
  return {
    ...baseShape,
    props: {
      w: node.data?.width || 300,
      h: node.data?.height || 400,
      title: node.data?.title || '',
      headers: node.data?.headers || [],
      rows: node.data?.rows || [],
      totalRows: node.data?.totalRows || 0,
      isNewlyCreated: node.data?.isNewlyCreated || false
    }
  };
}

/**
 * Convert TLDraw shapes to React Flow nodes
 * @param {Array} shapes - TLDraw shapes
 * @returns {Array} React Flow nodes
 */
export function convertShapesToNodes(shapes) {
  if (!Array.isArray(shapes)) {
    console.warn('convertShapesToNodes: Invalid shapes array', shapes);
    return [];
  }

  return shapes
    .filter(shape => {
      // Only convert our custom shape types
      return ['chart', 'textbox', 'table'].includes(shape.type);
    })
    .map(shape => {
      try {
        return convertSingleShapeToNode(shape);
      } catch (error) {
        console.error('Error converting shape to node:', shape.id, error);
        return null;
      }
    })
    .filter(Boolean); // Remove null entries
}

/**
 * Convert single TLDraw shape to React Flow node
 */
function convertSingleShapeToNode(shape) {
  const baseNode = {
    id: shape.id,
    type: shape.type,
    position: { 
      x: shape.x || 0, 
      y: shape.y || 0 
    },
    draggable: true,
    selectable: false // We handle selection via checkbox in chart
  };

  // Route to specific converter based on type
  switch (shape.type) {
    case 'chart':
      return convertChartShapeToNode(shape, baseNode);
    case 'textbox':
      return convertTextBoxShapeToNode(shape, baseNode);
    case 'table':
      return convertTableShapeToNode(shape, baseNode);
    default:
      console.warn('Unknown shape type:', shape.type);
      return null;
  }
}

/**
 * Convert chart shape to node
 */
function convertChartShapeToNode(shape, baseNode) {
  const props = shape.props || {};
  
  return {
    ...baseNode,
    data: {
      title: props.title || '',
      figure: {
        data: props.chartData || [],
        layout: props.chartLayout || {}
      },
      chartType: props.chartType || 'bar',
      dimensions: props.dimensions || [],
      measures: props.measures || [],
      table: props.table || [],
      agg: props.agg || 'sum',
      datasetId: props.datasetId || '',
      selected: props.selected || false,
      width: props.w || 800,
      height: props.h || 400,
      aiInsights: props.aiInsights || null,
      aiQuery: props.aiQuery || '',
      isNewlyCreated: props.isNewlyCreated || false
    }
  };
}

/**
 * Convert text box shape to node
 */
function convertTextBoxShapeToNode(shape, baseNode) {
  const props = shape.props || {};
  
  return {
    ...baseNode,
    data: {
      text: props.text || '',
      fontSize: props.fontSize || 14,
      width: props.w || 200,
      height: props.h || 100,
      isAIInsights: props.isAIInsights || false
    }
  };
}

/**
 * Convert table shape to node
 */
function convertTableShapeToNode(shape, baseNode) {
  const props = shape.props || {};
  
  return {
    ...baseNode,
    data: {
      title: props.title || '',
      headers: props.headers || [],
      rows: props.rows || [],
      totalRows: props.totalRows || 0,
      width: props.w || 600,
      height: props.h || 400,
      isNewlyCreated: props.isNewlyCreated || false
    }
  };
}

/**
 * Convert React Flow edges to TLDraw arrows
 * @param {Array} edges - React Flow edges
 * @returns {Array} TLDraw arrow shapes
 */
export function convertEdgesToArrows(edges) {
  if (!Array.isArray(edges)) {
    console.warn('convertEdgesToArrows: Invalid edges array', edges);
    return [];
  }

  return edges.map((edge) => {
    // Helper function to ensure ID has "shape:" prefix for TLDraw
    const ensureShapePrefix = (id) => {
      if (!id) return id;
      return id.startsWith('shape:') ? id : `shape:${id}`;
    };
    
    return {
      id: ensureShapePrefix(edge.id),
      type: 'arrow',
      x: 0,
      y: 0,
      // Don't specify index - let TLDraw assign it automatically via editor.createShapes()
      props: {
        start: {
          x: 0,
          y: 0,
          type: 'binding',
          boundShapeId: ensureShapePrefix(edge.source),
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false
        },
        end: {
          x: 0,
          y: 0,
          type: 'binding',
          boundShapeId: ensureShapePrefix(edge.target),
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false
        },
        color: 'black',
        size: 'm',
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow'
      }
    };
  }).filter(Boolean);
}

/**
 * Convert TLDraw arrows to React Flow edges
 * @param {Array} shapes - All TLDraw shapes (including arrows)
 * @returns {Array} React Flow edges
 */
export function convertArrowsToEdges(shapes) {
  if (!Array.isArray(shapes)) {
    console.warn('convertArrowsToEdges: Invalid shapes array', shapes);
    return [];
  }

  return shapes
    .filter(shape => shape.type === 'arrow')
    .map(arrow => {
      const start = arrow.props?.start;
      const end = arrow.props?.end;

      if (!start?.boundShapeId || !end?.boundShapeId) {
        return null;
      }

      return {
        id: arrow.id,
        source: start.boundShapeId,
        target: end.boundShapeId,
        type: 'arrow',
        animated: false
      };
    })
    .filter(Boolean);
}

/**
 * Validate node data structure
 */
export function validateNode(node) {
  if (!node || typeof node !== 'object') {
    return { valid: false, error: 'Node is not an object' };
  }

  if (!node.id) {
    return { valid: false, error: 'Node missing id' };
  }

  if (!node.type) {
    return { valid: false, error: 'Node missing type' };
  }

  if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
    return { valid: false, error: 'Node missing valid position' };
  }

  if (!node.data || typeof node.data !== 'object') {
    return { valid: false, error: 'Node missing data' };
  }

  return { valid: true };
}

/**
 * Validate shape data structure
 */
export function validateShape(shape) {
  if (!shape || typeof shape !== 'object') {
    return { valid: false, error: 'Shape is not an object' };
  }

  if (!shape.id) {
    return { valid: false, error: 'Shape missing id' };
  }

  if (!shape.type) {
    return { valid: false, error: 'Shape missing type' };
  }

  if (typeof shape.x !== 'number' || typeof shape.y !== 'number') {
    return { valid: false, error: 'Shape missing valid position' };
  }

  if (!shape.props || typeof shape.props !== 'object') {
    return { valid: false, error: 'Shape missing props' };
  }

  return { valid: true };
}

/**
 * Deep clone object to prevent mutation
 */
export function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.error('Error deep cloning object:', error);
    return obj;
  }
}

/**
 * Merge node updates while preserving existing data
 */
export function mergeNodeUpdates(existingNode, updates) {
  return {
    ...existingNode,
    position: updates.position || existingNode.position,
    data: {
      ...existingNode.data,
      ...updates.data
    }
  };
}

/**
 * Merge shape updates while preserving existing data
 */
export function mergeShapeUpdates(existingShape, updates) {
  return {
    ...existingShape,
    x: updates.x !== undefined ? updates.x : existingShape.x,
    y: updates.y !== undefined ? updates.y : existingShape.y,
    props: {
      ...existingShape.props,
      ...updates.props
    }
  };
}

/**
 * Get differences between two node arrays
 */
export function getNodeDifferences(oldNodes, newNodes) {
  const oldMap = new Map(oldNodes.map(n => [n.id, n]));
  const newMap = new Map(newNodes.map(n => [n.id, n]));

  const added = newNodes.filter(n => !oldMap.has(n.id));
  const removed = oldNodes.filter(n => !newMap.has(n.id));
  const updated = newNodes.filter(n => {
    const old = oldMap.get(n.id);
    return old && JSON.stringify(old) !== JSON.stringify(n);
  });

  return { added, removed, updated };
}
