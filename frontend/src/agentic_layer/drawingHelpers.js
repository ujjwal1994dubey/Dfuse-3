/**
 * Drawing Helpers - Reusable action generators for semantic operations
 * Provides composable functions to generate drawing actions based on semantic filtering
 */

import { filterChartsBySemantics, groupChartsBySemantics } from './semanticHelpers';

/**
 * Generate highlight boxes for semantically filtered charts
 * @param {string} criteria - Semantic criteria (e.g., "revenue", "financial")
 * @param {Object} canvasContext - Enhanced canvas context with charts and datasetAnalysis
 * @returns {Array} Array of create_shape actions
 */
export function highlightChartsBySemantics(criteria, canvasContext) {
  const matchingCharts = filterChartsBySemantics(
    canvasContext.charts,
    criteria,
    canvasContext.datasetAnalysis
  );
  
  return matchingCharts.map(chart => ({
    type: 'create_shape',
    shape: 'rectangle',
    props: {
      x: chart.bounds.x - 20,
      y: chart.bounds.y - 20,
      w: chart.bounds.width + 40,
      h: chart.bounds.height + 40,
      color: 'yellow',
      fill: 'semi',
      dash: 'dashed',
      opacity: 0.4
    }
  }));
}

/**
 * Generate sticky note near a chart
 * @param {Object} chart - Chart object with bounds
 * @param {string} text - Note text content
 * @param {string} position - Position relative to chart ('right', 'top', 'bottom', 'left')
 * @returns {Array} Array of create_shape actions (background + text)
 */
export function generateStickyNote(chart, text, position = 'right') {
  const offsetX = position === 'right' ? (chart.bounds.width || 800) + 50 : 
                  position === 'left' ? -300 : 
                  0;
  const offsetY = position === 'top' ? -150 : 
                  position === 'bottom' ? (chart.bounds.height || 400) + 50 : 
                  100;
  
  return [
    // Background box
    {
      type: 'create_shape',
      shape: 'rectangle',
      props: {
        x: chart.bounds.x + offsetX,
        y: chart.bounds.y + offsetY,
        w: 250,
        h: 120,
        color: 'yellow',
        fill: 'solid',
        opacity: 0.9
      }
    },
    // Text content
    {
      type: 'create_shape',
      shape: 'text',
      props: {
        x: chart.bounds.x + offsetX + 10,
        y: chart.bounds.y + offsetY + 10,
        w: 230,
        text: text,
        size: 's',
        color: 'black'
      }
    }
  ];
}

/**
 * Generate visual group zone for related charts
 * @param {Array} charts - Charts to group together
 * @param {string} label - Group label
 * @param {string} color - Zone color (default: 'blue')
 * @returns {Array} Array of create_shape actions (zone background + label)
 */
export function generateGroupZone(charts, label, color = 'blue') {
  if (charts.length === 0) return [];
  
  // Calculate bounding box
  const minX = Math.min(...charts.map(c => c.bounds.x));
  const minY = Math.min(...charts.map(c => c.bounds.y));
  const maxX = Math.max(...charts.map(c => c.bounds.x + c.bounds.width));
  const maxY = Math.max(...charts.map(c => c.bounds.y + c.bounds.height));
  
  const padding = 50;
  
  return [
    // Zone background
    {
      type: 'create_shape',
      shape: 'rectangle',
      props: {
        x: minX - padding,
        y: minY - padding,
        w: maxX - minX + padding * 2,
        h: maxY - minY + padding * 2,
        color: color,
        fill: 'semi',
        opacity: 0.15
      }
    },
    // Zone label
    {
      type: 'create_shape',
      shape: 'text',
      props: {
        x: minX - padding + 20,
        y: minY - padding + 10,
        w: 300,
        text: label,
        size: 'm',
        color: color,
        font: 'sans'
      }
    }
  ];
}

/**
 * Generate semantic grouping zones for charts
 * @param {Object} canvasContext - Enhanced canvas context
 * @returns {Array} Array of create_shape actions for all groups
 */
export function generateSemanticGroups(canvasContext) {
  const groups = groupChartsBySemantics(
    canvasContext.charts,
    canvasContext.datasetAnalysis
  );
  
  const colorMap = {
    'Financial': 'green',
    'Temporal': 'blue',
    'Geographic': 'orange',
    'Other': 'grey'
  };
  
  const actions = [];
  groups.forEach(group => {
    const color = colorMap[group.label] || 'grey';
    const groupActions = generateGroupZone(group.charts, group.label, color);
    actions.push(...groupActions);
  });
  
  return actions;
}

/**
 * Generate organization grid guides
 * @param {Array} chartPositions - Array of chart positions
 * @param {number} cols - Number of columns (default: 3)
 * @returns {Array} Array of create_shape actions for grid lines
 */
export function generateGridGuides(chartPositions, cols = 3) {
  const guides = [];
  
  // Calculate grid dimensions based on existing chart positions
  const avgWidth = 850;
  const avgHeight = 450;
  const gap = 100;
  
  // Vertical guides
  for (let i = 0; i <= cols; i++) {
    guides.push({
      type: 'create_shape',
      shape: 'line',
      props: {
        x: i * (avgWidth + gap),
        y: 0,
        w: 0,
        h: 2000,
        color: 'grey',
        dash: 'dotted',
        opacity: 0.3
      }
    });
  }
  
  return guides;
}

/**
 * Generate arrow between two charts
 * @param {Object} fromChart - Source chart with bounds
 * @param {Object} toChart - Target chart with bounds
 * @param {string} label - Optional arrow label
 * @returns {Object} Create arrow action
 */
export function generateChartConnection(fromChart, toChart, label = null) {
  const fromCenterX = fromChart.bounds.centerX;
  const fromCenterY = fromChart.bounds.centerY;
  const toCenterX = toChart.bounds.centerX;
  const toCenterY = toChart.bounds.centerY;
  
  return {
    type: 'create_shape',
    shape: 'arrow',
    props: {
      x: fromCenterX,
      y: fromCenterY,
      w: toCenterX - fromCenterX,
      h: toCenterY - fromCenterY,
      color: 'black',
      text: label || '',
      arrowheadEnd: 'arrow'
    }
  };
}

/**
 * Generate section divider line
 * @param {string} orientation - 'horizontal' or 'vertical'
 * @param {number} position - Position value (x for vertical, y for horizontal)
 * @param {number} length - Length of the divider
 * @returns {Object} Create line action
 */
export function generateSectionDivider(orientation = 'horizontal', position = 0, length = 2000) {
  if (orientation === 'horizontal') {
    return {
      type: 'create_shape',
      shape: 'line',
      props: {
        x: -length / 2,
        y: position,
        w: length,
        h: 0,
        color: 'grey',
        dash: 'solid',
        opacity: 0.5
      }
    };
  } else {
    return {
      type: 'create_shape',
      shape: 'line',
      props: {
        x: position,
        y: -length / 2,
        w: 0,
        h: length,
        color: 'grey',
        dash: 'solid',
        opacity: 0.5
      }
    };
  }
}

/**
 * Generate title or header text
 * @param {string} text - Title text
 * @param {Object} position - Position {x, y}
 * @param {string} size - Text size ('small', 'medium', 'large', 'xlarge')
 * @returns {Object} Create text action
 */
export function generateTitle(text, position = { x: -100, y: -500 }, size = 'xlarge') {
  const widthMap = {
    'small': 300,
    'medium': 400,
    'large': 600,
    'xlarge': 800
  };
  
  return {
    type: 'create_shape',
    shape: 'text',
    props: {
      x: position.x,
      y: position.y,
      w: widthMap[size] || 600,
      text: text,
      size: size === 'xlarge' ? 'l' : size === 'large' ? 'm' : 's',
      color: 'blue',
      font: 'sans'
    }
  };
}

