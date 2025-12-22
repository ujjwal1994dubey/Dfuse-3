/**
 * Canvas Organizer Module
 * Provides zero-API-call layout organization and semantic grouping
 * Optimized for Gemini free tier - uses deterministic rules and heuristics
 */

import { LayoutManager } from './layoutManager';
import { 
  detectDataRelationships, 
  suggestGroupings,
  suggestLayoutStrategy 
} from './spatialGrouping';

/**
 * Organize canvas using rule-based layout (0 API calls)
 * @param {Array} nodes - All canvas nodes
 * @param {Object} editor - TLDraw editor instance
 * @returns {Object} Organization result with updated nodes
 */
export function organizeCanvas(nodes, editor) {
  if (!nodes || nodes.length === 0) {
    return {
      updatedNodes: [],
      strategy: 'empty',
      relationships: [],
      explanation: 'Canvas is empty - nothing to organize!'
    };
  }

  // 1. Extract different element types
  const charts = nodes.filter(n => n.type === 'chart');
  const kpis = nodes.filter(n => n.type === 'kpi');
  const tables = nodes.filter(n => n.type === 'table');
  const textboxes = nodes.filter(n => n.type === 'textbox');
  
  console.log(`📊 Organizing: ${charts.length} charts, ${kpis.length} KPIs, ${tables.length} tables, ${textboxes.length} textboxes`);
  
  // 2. Detect relationships (pre-computed, no LLM)
  const relationships = detectDataRelationships(charts);
  console.log(`🔗 Detected ${relationships.length} relationships`);
  
  // 3. Suggest optimal layout strategy
  const { strategy, reason } = suggestLayoutStrategy([...charts, ...kpis]);
  console.log(`📐 Layout strategy: ${strategy} (${reason})`);
  
  // 4. Use LayoutManager to calculate positions
  const layoutManager = new LayoutManager(editor, nodes);
  const allElements = [...kpis, ...charts, ...tables, ...textboxes];
  const arranged = layoutManager.arrangeDashboard(allElements, strategy);
  
  // 5. Apply positions to nodes
  const updatedNodes = applyPositions(nodes, arranged);
  
  return {
    updatedNodes,
    strategy,
    relationships,
    explanation: generateExplanation(strategy, relationships, nodes.length)
  };
}

/**
 * Apply calculated positions to nodes
 * @param {Array} nodes - Original nodes
 * @param {Array} arranged - Arranged elements with positions
 * @returns {Array} Updated nodes with new positions
 */
function applyPositions(nodes, arranged) {
  const positionMap = new Map();
  arranged.forEach(el => {
    positionMap.set(el.id, el.position);
  });
  
  return nodes.map(node => {
    const newPosition = positionMap.get(node.id);
    if (newPosition) {
      return {
        ...node,
        position: newPosition
      };
    }
    return node;
  });
}

/**
 * Generate human-readable explanation
 * @param {string} strategy - Layout strategy used
 * @param {Array} relationships - Detected relationships
 * @param {number} count - Number of elements
 * @returns {string} Explanation text
 */
function generateExplanation(strategy, relationships, count) {
  const relCount = relationships.length;
  const strategyNames = {
    'grid': 'grid layout',
    'hero': 'hero layout with primary focus',
    'flow': 'narrative flow layout',
    'comparison': 'side-by-side comparison layout',
    'kpi-dashboard': 'KPI dashboard layout'
  };
  
  const strategyName = strategyNames[strategy] || strategy;
  
  let explanation = `Organized ${count} element${count !== 1 ? 's' : ''} using ${strategyName}.`;
  
  if (relCount > 0) {
    explanation += ` Detected ${relCount} relationship${relCount !== 1 ? 's' : ''} and grouped related items together.`;
  }
  
  return explanation;
}

/**
 * Organize charts by semantic groups using heuristics (0 API calls)
 * @param {Array} nodes - All canvas nodes
 * @param {string} groupingIntent - User's grouping intent
 * @param {Object} editor - TLDraw editor instance
 * @returns {Object} Grouping result
 */
export function organizeByHeuristics(nodes, groupingIntent, editor) {
  const charts = nodes.filter(n => n.type === 'chart');
  
  if (charts.length === 0) {
    return {
      updatedNodes: nodes,
      groups: [],
      annotations: [],
      explanation: 'No charts to group'
    };
  }
  
  console.log(`🔍 Grouping ${charts.length} charts by: "${groupingIntent}"`);
  
  // 1. Classify charts using heuristics
  const groups = classifyChartsByHeuristics(charts, groupingIntent);
  console.log(`✅ Created ${groups.length} groups`);
  
  // 2. Create visual zones for each group
  const zones = createGroupZones(groups, editor);
  
  // 3. Arrange charts within zones
  const arranged = arrangeChartsInZones(nodes, zones, groups);
  
  // 4. Create zone annotations (backgrounds and labels)
  const annotations = createZoneAnnotations(zones);
  
  return {
    updatedNodes: arranged,
    groups,
    zones,
    annotations,
    explanation: `Grouped ${charts.length} charts into ${groups.length} semantic groups: ${groups.map(g => g.label).join(', ')}`
  };
}

/**
 * Classify charts using pattern matching and heuristics (no LLM)
 * @param {Array} charts - Charts to classify
 * @param {string} groupIntent - Grouping intent
 * @returns {Array} Groups with member charts
 */
function classifyChartsByHeuristics(charts, groupIntent) {
  const intent = groupIntent.toLowerCase();
  
  // Funnel stage grouping
  if (/funnel|stage/i.test(intent)) {
    return groupByFunnelStage(charts);
  }
  
  // Region/Location grouping
  if (/region|location|geo|area/i.test(intent)) {
    return groupByDimension(charts, findDimensionByPattern(charts, ['region', 'location', 'country', 'state', 'city']));
  }
  
  // Metric/Measure type grouping
  if (/metric|measure|type/i.test(intent)) {
    return groupByMeasureType(charts);
  }
  
  // Time/Temporal grouping
  if (/time|date|trend|temporal|period/i.test(intent)) {
    return groupByTemporalDimension(charts);
  }
  
  // Fallback: use existing relationship detection
  console.log('📊 Using relationship-based grouping (fallback)');
  return groupByDataRelationships(charts);
}

/**
 * Group charts by funnel stage keywords
 */
function groupByFunnelStage(charts) {
  const stages = {
    'Top of Funnel': ['top', 'awareness', 'visitor', 'impression', 'reach'],
    'Middle of Funnel': ['mid', 'middle', 'consideration', 'lead', 'interest'],
    'Bottom of Funnel': ['bottom', 'conversion', 'customer', 'sale', 'purchase']
  };
  
  const groups = {};
  const ungrouped = [];
  
  charts.forEach(chart => {
    let assigned = false;
    
    for (const [stageLabel, keywords] of Object.entries(stages)) {
      const matchesStage = keywords.some(keyword => {
        const titleMatch = chart.data?.title?.toLowerCase().includes(keyword);
        const dimMatch = chart.data?.dimensions?.some(d => d.toLowerCase().includes(keyword));
        const measMatch = chart.data?.measures?.some(m => m.toLowerCase().includes(keyword));
        return titleMatch || dimMatch || measMatch;
      });
      
      if (matchesStage) {
        if (!groups[stageLabel]) {
          groups[stageLabel] = [];
        }
        groups[stageLabel].push(chart);
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      ungrouped.push(chart);
    }
  });
  
  // Convert to array format
  const result = Object.entries(groups).map(([label, members]) => ({
    label,
    member_ids: members.map(c => c.id),
    members,
    reasoning: `Charts related to ${label.toLowerCase()}`
  }));
  
  if (ungrouped.length > 0) {
    result.push({
      label: 'Other',
      member_ids: ungrouped.map(c => c.id),
      members: ungrouped,
      reasoning: 'Charts not matching funnel stages'
    });
  }
  
  return result;
}

/**
 * Group charts by a specific dimension
 */
function groupByDimension(charts, dimensionName) {
  if (!dimensionName) {
    return groupByDataRelationships(charts);
  }
  
  const withDimension = charts.filter(c => 
    c.data?.dimensions?.some(d => d.toLowerCase().includes(dimensionName.toLowerCase()))
  );
  
  const withoutDimension = charts.filter(c => 
    !c.data?.dimensions?.some(d => d.toLowerCase().includes(dimensionName.toLowerCase()))
  );
  
  const groups = [];
  
  if (withDimension.length > 0) {
    groups.push({
      label: `By ${dimensionName}`,
      member_ids: withDimension.map(c => c.id),
      members: withDimension,
      reasoning: `Charts grouped by ${dimensionName} dimension`
    });
  }
  
  if (withoutDimension.length > 0) {
    groups.push({
      label: 'Other Charts',
      member_ids: withoutDimension.map(c => c.id),
      members: withoutDimension,
      reasoning: `Charts not using ${dimensionName}`
    });
  }
  
  return groups;
}

/**
 * Find dimension by pattern matching
 */
function findDimensionByPattern(charts, patterns) {
  for (const chart of charts) {
    if (chart.data?.dimensions) {
      for (const dim of chart.data.dimensions) {
        for (const pattern of patterns) {
          if (dim.toLowerCase().includes(pattern)) {
            return dim;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Group charts by measure type (revenue, cost, count, etc.)
 */
function groupByMeasureType(charts) {
  const measureTypes = {
    'Revenue & Sales': ['revenue', 'sales', 'income', 'earnings'],
    'Costs & Expenses': ['cost', 'expense', 'spend', 'expenditure'],
    'Counts & Volumes': ['count', 'number', 'quantity', 'volume', 'total'],
    'Rates & Percentages': ['rate', 'percent', 'ratio', 'conversion']
  };
  
  const groups = {};
  const ungrouped = [];
  
  charts.forEach(chart => {
    let assigned = false;
    
    for (const [typeLabel, keywords] of Object.entries(measureTypes)) {
      const matchesType = keywords.some(keyword => {
        const measMatch = chart.data?.measures?.some(m => m.toLowerCase().includes(keyword));
        const titleMatch = chart.data?.title?.toLowerCase().includes(keyword);
        return measMatch || titleMatch;
      });
      
      if (matchesType) {
        if (!groups[typeLabel]) {
          groups[typeLabel] = [];
        }
        groups[typeLabel].push(chart);
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      ungrouped.push(chart);
    }
  });
  
  const result = Object.entries(groups).map(([label, members]) => ({
    label,
    member_ids: members.map(c => c.id),
    members,
    reasoning: `Charts measuring ${label.toLowerCase()}`
  }));
  
  if (ungrouped.length > 0) {
    result.push({
      label: 'Other Metrics',
      member_ids: ungrouped.map(c => c.id),
      members: ungrouped,
      reasoning: 'Other measurement types'
    });
  }
  
  return result;
}

/**
 * Group charts by temporal dimensions
 */
function groupByTemporalDimension(charts) {
  const timeKeywords = ['date', 'time', 'month', 'year', 'quarter', 'week', 'day', 'period'];
  
  const withTime = charts.filter(c => 
    c.data?.dimensions?.some(d => 
      timeKeywords.some(kw => d.toLowerCase().includes(kw))
    )
  );
  
  const withoutTime = charts.filter(c => 
    !c.data?.dimensions?.some(d => 
      timeKeywords.some(kw => d.toLowerCase().includes(kw))
    )
  );
  
  const groups = [];
  
  if (withTime.length > 0) {
    groups.push({
      label: 'Time-Series Charts',
      member_ids: withTime.map(c => c.id),
      members: withTime,
      reasoning: 'Charts with temporal dimensions'
    });
  }
  
  if (withoutTime.length > 0) {
    groups.push({
      label: 'Non-Temporal Charts',
      member_ids: withoutTime.map(c => c.id),
      members: withoutTime,
      reasoning: 'Charts without time dimensions'
    });
  }
  
  return groups;
}

/**
 * Group charts by data relationships (fallback method)
 */
function groupByDataRelationships(charts) {
  const relationships = detectDataRelationships(charts);
  const suggested = suggestGroupings(charts, relationships);
  
  return suggested.map(group => ({
    label: group.type === 'comparison' ? 'Comparison Group' : 
           group.type === 'related-data' ? 'Related Data' : 
           'Standalone',
    member_ids: group.members,
    members: charts.filter(c => group.members.includes(c.id)),
    reasoning: `Grouped by ${group.type} relationship`
  }));
}

/**
 * Create spatial zones for groups
 */
function createGroupZones(groups, editor) {
  if (!editor) {
    return [];
  }
  
  const viewport = editor.getViewportPageBounds();
  const groupCount = groups.length;
  const zoneWidth = 900;
  const zoneHeight = 600;
  const gap = 100;
  
  // Arrange zones in grid
  const cols = Math.ceil(Math.sqrt(groupCount));
  
  return groups.map((group, idx) => ({
    label: group.label,
    members: group.member_ids,
    bounds: {
      x: viewport.x + (idx % cols) * (zoneWidth + gap),
      y: viewport.y + Math.floor(idx / cols) * (zoneHeight + gap),
      width: zoneWidth,
      height: zoneHeight
    }
  }));
}

/**
 * Arrange charts within their assigned zones
 */
function arrangeChartsInZones(nodes, zones, groups) {
  const positionMap = new Map();
  
  zones.forEach((zone, zoneIdx) => {
    const group = groups[zoneIdx];
    const memberNodes = nodes.filter(n => zone.members.includes(n.id));
    
    // Arrange members in a grid within the zone
    const cols = Math.ceil(Math.sqrt(memberNodes.length));
    const chartWidth = 400;
    const chartHeight = 300;
    const padding = 20;
    
    memberNodes.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      
      const x = zone.bounds.x + padding + col * (chartWidth + padding);
      const y = zone.bounds.y + padding + 60 + row * (chartHeight + padding); // 60px for zone label
      
      positionMap.set(node.id, { x, y });
    });
  });
  
  // Apply new positions
  return nodes.map(node => {
    const newPosition = positionMap.get(node.id);
    if (newPosition) {
      return { ...node, position: newPosition };
    }
    return node;
  });
}

/**
 * Create zone annotations (backgrounds and labels)
 */
function createZoneAnnotations(zones) {
  return zones.map(zone => ({
    type: 'zone',
    label: zone.label,
    bounds: zone.bounds,
    shapeProps: {
      type: 'geo',
      props: {
        geo: 'rectangle',
        x: zone.bounds.x,
        y: zone.bounds.y,
        w: zone.bounds.width,
        h: zone.bounds.height,
        fill: 'semi',
        color: 'light-blue',
        opacity: 0.1
      }
    },
    labelProps: {
      type: 'text',
      props: {
        x: zone.bounds.x + 20,
        y: zone.bounds.y + 20,
        text: zone.label,
        size: 'l',
        color: 'blue'
      }
    }
  }));
}

/**
 * Calculate bounds for a group of nodes
 */
export function calculateBounds(nodes) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  
  const positions = nodes.map(node => ({
    x: node.position.x,
    y: node.position.y,
    w: node.data?.width || 800,
    h: node.data?.height || 400
  }));
  
  const minX = Math.min(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxX = Math.max(...positions.map(p => p.x + p.w));
  const maxY = Math.max(...positions.map(p => p.y + p.h));
  
  return {
    x: minX - 50,
    y: minY - 50,
    w: maxX - minX + 100,
    h: maxY - minY + 100
  };
}

