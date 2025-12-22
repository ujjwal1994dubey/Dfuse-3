/**
 * Semantic Helpers - Uses existing AI-generated column descriptions
 * No new AI calls needed - reuses datasetAnalysis from upload
 */

/**
 * Filter charts by semantic criteria using AI column descriptions
 * @param {Array} charts - Charts from canvas
 * @param {string} criteria - User criteria (e.g., "revenue", "temporal", "financial")
 * @param {Object} datasetAnalysis - Existing analysis from upload
 * @returns {Array} Filtered charts
 */
export function filterChartsBySemantics(charts, criteria, datasetAnalysis) {
  if (!datasetAnalysis?.columns) {
    // Fallback to basic keyword matching
    return filterChartsByKeywords(charts, criteria);
  }
  
  const criteriaLower = criteria.toLowerCase();
  
  // Build search map from AI descriptions
  const columnSemantics = {};
  datasetAnalysis.columns.forEach(col => {
    const searchText = [
      col.name,
      col.description || '',
      col.dtype || ''
    ].join(' ').toLowerCase();
    columnSemantics[col.name] = searchText;
  });
  
  // Filter charts where columns match criteria
  return charts.filter(chart => {
    // Check chart title
    if (chart.title?.toLowerCase().includes(criteriaLower)) return true;
    
    // Check dimensions and measures using AI descriptions
    const allColumns = [
      ...(chart.dimensions || []),
      ...(chart.measures || [])
    ];
    
    return allColumns.some(colName => {
      const semanticText = columnSemantics[colName] || '';
      return semanticText.includes(criteriaLower);
    });
  });
}

/**
 * Fallback keyword matching (no AI descriptions available)
 */
function filterChartsByKeywords(charts, criteria) {
  const criteriaLower = criteria.toLowerCase();
  return charts.filter(chart => {
    const searchText = [
      chart.title,
      ...(chart.dimensions || []),
      ...(chart.measures || [])
    ].join(' ').toLowerCase();
    return searchText.includes(criteriaLower);
  });
}

/**
 * Get semantic tags for a chart using AI column descriptions
 * @param {Object} chart - Chart object
 * @param {Object} datasetAnalysis - Dataset analysis
 * @returns {Array} Semantic tags (e.g., ["financial", "temporal", "revenue"])
 */
export function getChartSemanticTags(chart, datasetAnalysis) {
  if (!datasetAnalysis?.columns) return [];
  
  const tags = new Set();
  const allColumns = [
    ...(chart.dimensions || []),
    ...(chart.measures || [])
  ];
  
  allColumns.forEach(colName => {
    const colInfo = datasetAnalysis.columns.find(c => c.name === colName);
    if (!colInfo) return;
    
    const desc = colInfo.description?.toLowerCase() || '';
    
    // Extract semantic categories from AI descriptions
    if (desc.includes('revenue') || desc.includes('sales') || desc.includes('income')) {
      tags.add('revenue');
      tags.add('financial');
    }
    if (desc.includes('cost') || desc.includes('expense') || desc.includes('spend')) {
      tags.add('cost');
      tags.add('financial');
    }
    if (desc.includes('profit') || desc.includes('margin')) {
      tags.add('profit');
      tags.add('financial');
    }
    if (desc.includes('date') || desc.includes('time') || desc.includes('period') || desc.includes('month') || desc.includes('year')) {
      tags.add('temporal');
    }
    if (desc.includes('region') || desc.includes('location') || desc.includes('geography')) {
      tags.add('geographic');
    }
    if (desc.includes('category') || desc.includes('segment') || desc.includes('type')) {
      tags.add('categorical');
    }
  });
  
  return Array.from(tags);
}

/**
 * Group charts by semantic similarity using AI descriptions
 * @param {Array} charts - Charts to group
 * @param {Object} datasetAnalysis - Dataset analysis
 * @returns {Array} Groups of related charts
 */
export function groupChartsBySemantics(charts, datasetAnalysis) {
  const groups = {
    financial: [],
    temporal: [],
    geographic: [],
    other: []
  };
  
  charts.forEach(chart => {
    const tags = getChartSemanticTags(chart, datasetAnalysis);
    
    if (tags.includes('financial')) {
      groups.financial.push(chart);
    } else if (tags.includes('temporal')) {
      groups.temporal.push(chart);
    } else if (tags.includes('geographic')) {
      groups.geographic.push(chart);
    } else {
      groups.other.push(chart);
    }
  });
  
  // Return only non-empty groups
  return Object.entries(groups)
    .filter(([_, charts]) => charts.length > 0)
    .map(([label, charts]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      charts: charts
    }));
}

