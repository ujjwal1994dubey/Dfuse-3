/**
 * Spatial Grouping Utilities
 * Detects semantic and spatial relationships between visualizations
 * Used for intelligent clustering and arrangement
 */

/**
 * Detect data relationships between charts
 * Finds charts that share dimensions or measures
 * @param {Array} charts - Array of chart objects
 * @returns {Array} Array of relationship objects
 */
export function detectDataRelationships(charts) {
  const relationships = [];

  for (let i = 0; i < charts.length; i++) {
    for (let j = i + 1; j < charts.length; j++) {
      const chartA = charts[i];
      const chartB = charts[j];

      // Check for shared dimensions
      const sharedDims = findSharedColumns(
        chartA.dimensions || [],
        chartB.dimensions || []
      );

      // Check for shared measures
      const sharedMeas = findSharedColumns(
        chartA.measures || [],
        chartB.measures || []
      );

      if (sharedDims.length > 0 || sharedMeas.length > 0) {
        const totalColumns = 
          (chartA.dimensions?.length || 0) + 
          (chartA.measures?.length || 0);
        
        const sharedColumns = sharedDims.length + sharedMeas.length;
        const strength = totalColumns > 0 ? sharedColumns / totalColumns : 0;

        relationships.push({
          type: 'data-overlap',
          charts: [chartA.id, chartB.id],
          sharedDimensions: sharedDims,
          sharedMeasures: sharedMeas,
          strength: strength
        });
      }
    }
  }

  return relationships;
}

/**
 * Detect hierarchical relationships between charts
 * Identifies parent-child drill-down relationships
 * @param {Array} charts - Array of chart objects
 * @returns {Array} Array of hierarchical relationships
 */
export function detectHierarchicalRelationships(charts) {
  const relationships = [];

  charts.forEach(chart => {
    // Check if this chart could be a drill-down of another
    const potentialParents = charts.filter(other => {
      if (other.id === chart.id) return false;

      const chartDims = chart.dimensions || [];
      const otherDims = other.dimensions || [];

      // Parent has fewer dimensions but shares some
      const shared = findSharedColumns(chartDims, otherDims);
      return shared.length > 0 && chartDims.length > otherDims.length;
    });

    potentialParents.forEach(parent => {
      relationships.push({
        type: 'hierarchical',
        parent: parent.id,
        child: chart.id,
        relationship: 'drill-down'
      });
    });
  });

  return relationships;
}

/**
 * Detect temporal relationships (time-based sequences)
 * @param {Array} charts - Array of chart objects
 * @returns {Array} Array of temporal relationships
 */
export function detectTemporalRelationships(charts) {
  const relationships = [];
  const timeKeywords = ['date', 'time', 'month', 'year', 'quarter', 'week', 'day'];

  charts.forEach((chart, i) => {
    const hasTemporal = (chart.dimensions || []).some(dim =>
      timeKeywords.some(keyword => dim.toLowerCase().includes(keyword))
    );

    if (hasTemporal) {
      // Find other charts with same temporal dimension
      charts.forEach((other, j) => {
        if (i !== j) {
          const otherHasTemporal = (other.dimensions || []).some(dim =>
            timeKeywords.some(keyword => dim.toLowerCase().includes(keyword))
          );

          if (otherHasTemporal) {
            relationships.push({
              type: 'temporal',
              charts: [chart.id, other.id],
              dimension: 'time-series'
            });
          }
        }
      });
    }
  });

  return relationships;
}

/**
 * Detect comparison intent (charts meant to be compared)
 * @param {Array} charts - Array of chart objects
 * @returns {Array} Array of comparison relationships
 */
export function detectComparisonRelationships(charts) {
  const relationships = [];

  // Group charts by measure similarity
  for (let i = 0; i < charts.length; i++) {
    for (let j = i + 1; j < charts.length; j++) {
      const chartA = charts[i];
      const chartB = charts[j];

      const sharedMeasures = findSharedColumns(
        chartA.measures || [],
        chartB.measures || []
      );

      // If they share measures but different dimensions, likely comparison
      const sharedDims = findSharedColumns(
        chartA.dimensions || [],
        chartB.dimensions || []
      );

      if (sharedMeasures.length > 0 && sharedDims.length === 0) {
        relationships.push({
          type: 'comparison',
          charts: [chartA.id, chartB.id],
          comparedMetrics: sharedMeasures
        });
      }
    }
  }

  return relationships;
}

/**
 * Suggest groupings based on relationships
 * Clusters charts into logical groups
 * @param {Array} charts - Array of chart objects
 * @param {Array} relationships - Array of relationship objects
 * @returns {Array} Array of group objects
 */
export function suggestGroupings(charts, relationships) {
  const groups = [];
  const grouped = new Set();

  // Group by strong data relationships
  relationships
    .filter(r => r.type === 'data-overlap' && r.strength > 0.3)
    .forEach(rel => {
      const [chartA, chartB] = rel.charts;

      // Find existing group or create new
      let group = groups.find(g =>
        g.members.includes(chartA) || g.members.includes(chartB)
      );

      if (!group) {
        group = {
          id: `group-${groups.length + 1}`,
          type: 'related-data',
          members: [],
          relationships: []
        };
        groups.push(group);
      }

      if (!group.members.includes(chartA)) group.members.push(chartA);
      if (!group.members.includes(chartB)) group.members.push(chartB);
      group.relationships.push(rel);

      grouped.add(chartA);
      grouped.add(chartB);
    });

  // Group comparison charts
  relationships
    .filter(r => r.type === 'comparison')
    .forEach(rel => {
      const [chartA, chartB] = rel.charts;

      // Check if already grouped
      if (!grouped.has(chartA) && !grouped.has(chartB)) {
        groups.push({
          id: `group-${groups.length + 1}`,
          type: 'comparison',
          members: [chartA, chartB],
          relationships: [rel]
        });

        grouped.add(chartA);
        grouped.add(chartB);
      }
    });

  // Add ungrouped charts as individual groups
  charts.forEach(chart => {
    if (!grouped.has(chart.id)) {
      groups.push({
        id: `group-${groups.length + 1}`,
        type: 'standalone',
        members: [chart.id],
        relationships: []
      });
    }
  });

  return groups;
}

/**
 * Analyze relationships and suggest optimal layout strategy
 * @param {Array} charts - Array of chart objects
 * @returns {Object} Layout recommendation
 */
export function suggestLayoutStrategy(charts) {
  if (charts.length === 0) {
    return { strategy: 'grid', reason: 'Empty canvas' };
  }

  if (charts.length === 1) {
    return { strategy: 'center', reason: 'Single chart' };
  }

  // Detect relationships
  const dataRels = detectDataRelationships(charts);
  const comparisonRels = detectComparisonRelationships(charts);
  const temporalRels = detectTemporalRelationships(charts);

  // Analyze chart types
  const kpiCount = charts.filter(c => c.type === 'kpi').length;
  const chartCount = charts.filter(c => c.type === 'chart').length;

  // Decision logic
  if (kpiCount >= 3 && chartCount > 0) {
    return {
      strategy: 'kpi-dashboard',
      reason: 'Multiple KPIs with supporting charts'
    };
  }

  if (comparisonRels.length > 0) {
    return {
      strategy: 'comparison',
      reason: 'Charts comparing same metrics'
    };
  }

  if (temporalRels.length > 0 && charts.length <= 4) {
    return {
      strategy: 'flow',
      reason: 'Time-series narrative sequence'
    };
  }

  if (charts.length === 2 && dataRels.length > 0) {
    return {
      strategy: 'hero',
      reason: 'Two related charts, one can be hero'
    };
  }

  // Default to grid
  return {
    strategy: 'grid',
    reason: 'General purpose multi-chart layout'
  };
}

/**
 * Calculate grouping score (how well charts belong together)
 * @param {Array} chartIds - Chart IDs to evaluate
 * @param {Array} relationships - All relationships
 * @returns {number} Score between 0 and 1
 */
export function calculateGroupingScore(chartIds, relationships) {
  if (chartIds.length <= 1) return 1;

  // Count relationships within this group
  let internalRelationships = 0;
  let maxPossible = (chartIds.length * (chartIds.length - 1)) / 2;

  for (let i = 0; i < chartIds.length; i++) {
    for (let j = i + 1; j < chartIds.length; j++) {
      const hasRelationship = relationships.some(r =>
        r.charts.includes(chartIds[i]) && r.charts.includes(chartIds[j])
      );

      if (hasRelationship) {
        internalRelationships++;
      }
    }
  }

  return maxPossible > 0 ? internalRelationships / maxPossible : 0;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Find columns shared between two arrays
 * @param {Array} arrayA - First array
 * @param {Array} arrayB - Second array
 * @returns {Array} Shared elements
 */
function findSharedColumns(arrayA, arrayB) {
  if (!arrayA || !arrayB) return [];
  return arrayA.filter(col => arrayB.includes(col));
}

/**
 * Detect if charts form a narrative sequence
 * @param {Array} charts - Array of chart objects
 * @returns {boolean} True if narrative detected
 */
export function detectNarrativeSequence(charts) {
  // Look for progressive drill-down or time progression
  const hierarchicalRels = detectHierarchicalRelationships(charts);
  const temporalRels = detectTemporalRelationships(charts);

  return hierarchicalRels.length > 0 || temporalRels.length > 0;
}

/**
 * Get relationship strength between two charts
 * @param {string} chartIdA - First chart ID
 * @param {string} chartIdB - Second chart ID
 * @param {Array} relationships - All relationships
 * @returns {number} Strength (0-1)
 */
export function getRelationshipStrength(chartIdA, chartIdB, relationships) {
  const rel = relationships.find(r =>
    r.charts.includes(chartIdA) && r.charts.includes(chartIdB)
  );

  if (!rel) return 0;

  switch (rel.type) {
    case 'data-overlap':
      return rel.strength || 0.5;
    case 'hierarchical':
      return 0.8;
    case 'temporal':
      return 0.7;
    case 'comparison':
      return 0.9;
    default:
      return 0.3;
  }
}

