/**
 * Layout Manager - Spatial Intelligence Engine
 * Provides spatial analysis and intelligent layout arrangement for canvas elements
 * 
 * Key Features:
 * - Spatial analysis (occupied regions, empty space, clusters, density)
 * - Optimal placement finding
 * - Multi-element arrangement strategies (grid, hero, flow, comparison)
 * - Collision detection
 */

import { AGENT_CONFIG } from './types';

/**
 * LayoutManager Class
 * Core spatial intelligence engine for canvas layout management
 */
export class LayoutManager {
  constructor(editor, nodes) {
    this.editor = editor;
    this.nodes = nodes || [];
  }

  // ==================== SPATIAL ANALYSIS ====================

  /**
   * Analyze canvas spatial state
   * @returns {Object} Complete spatial analysis
   */
  analyzeCanvas() {
    return {
      occupiedRegions: this.getOccupiedRegions(),
      emptyRegions: this.findEmptyRegions(),
      clusters: this.detectSpatialClusters(),
      density: this.calculateDensity(),
      bounds: this.getCanvasBounds()
    };
  }

  /**
   * Get occupied canvas regions
   * @returns {Array} Array of occupied rectangles with node metadata
   */
  getOccupiedRegions() {
    return this.nodes.map(node => ({
      x: node.position.x,
      y: node.position.y,
      w: node.data.width || AGENT_CONFIG.DEFAULT_CHART_WIDTH,
      h: node.data.height || AGENT_CONFIG.DEFAULT_CHART_HEIGHT,
      nodeId: node.id,
      nodeType: node.type
    }));
  }

  /**
   * Find empty regions suitable for new elements
   * Uses grid-based space detection and merges adjacent cells
   * @returns {Array} Array of empty rectangular regions
   */
  findEmptyRegions() {
    if (!this.editor) {
      console.warn('⚠️ Editor not available, cannot find empty regions');
      return [];
    }

    const viewport = this.editor.getViewportPageBounds();
    const occupied = this.getOccupiedRegions();
    
    // Grid-based space detection
    const gridSize = 100; // 100px grid cells
    const emptyGrid = [];
    
    // Scan viewport in grid cells
    for (let x = viewport.x; x < viewport.x + viewport.w; x += gridSize) {
      for (let y = viewport.y; y < viewport.y + viewport.h; y += gridSize) {
        const testRect = { x, y, w: gridSize, h: gridSize };
        const isOccupied = occupied.some(rect => 
          this.rectanglesOverlap(testRect, rect)
        );
        
        if (!isOccupied) {
          emptyGrid.push(testRect);
        }
      }
    }
    
    // Merge adjacent empty cells into larger regions
    return this.mergeAdjacentRegions(emptyGrid);
  }

  /**
   * Detect spatial clusters of nearby elements
   * @returns {Array} Array of cluster objects with nodes and metadata
   */
  detectSpatialClusters() {
    const CLUSTER_DISTANCE = 900; // 900px threshold for clustering
    const clusters = [];
    const visited = new Set();
    
    this.nodes.forEach(node => {
      if (visited.has(node.id)) return;
      
      const cluster = [node];
      visited.add(node.id);
      
      // Find nearby nodes
      this.nodes.forEach(other => {
        if (visited.has(other.id)) return;
        const distance = this.calculateDistance(node.position, other.position);
        if (distance < CLUSTER_DISTANCE) {
          cluster.push(other);
          visited.add(other.id);
        }
      });
      
      // Only create cluster if it has more than 1 node
      if (cluster.length > 1) {
        clusters.push({
          nodes: cluster,
          centroid: this.calculateCentroid(cluster),
          bounds: this.calculateBounds(cluster)
        });
      }
    });
    
    return clusters;
  }

  /**
   * Calculate canvas density (percentage occupied)
   * @returns {number} Density value between 0 and 1
   */
  calculateDensity() {
    if (!this.editor) return 0;
    
    const viewport = this.editor.getViewportPageBounds();
    const viewportArea = viewport.w * viewport.h;
    
    const occupiedArea = this.nodes.reduce((sum, node) => {
      const w = node.data.width || AGENT_CONFIG.DEFAULT_CHART_WIDTH;
      const h = node.data.height || AGENT_CONFIG.DEFAULT_CHART_HEIGHT;
      return sum + (w * h);
    }, 0);
    
    return Math.min(occupiedArea / viewportArea, 1);
  }

  /**
   * Get overall canvas bounds encompassing all elements
   * @returns {Object} Bounding box { x, y, w, h }
   */
  getCanvasBounds() {
    if (this.nodes.length === 0) {
      return this.editor ? this.editor.getViewportPageBounds() : { x: 0, y: 0, w: 0, h: 0 };
    }

    const occupied = this.getOccupiedRegions();
    const minX = Math.min(...occupied.map(r => r.x));
    const minY = Math.min(...occupied.map(r => r.y));
    const maxX = Math.max(...occupied.map(r => r.x + r.w));
    const maxY = Math.max(...occupied.map(r => r.y + r.h));

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }

  // ==================== OPTIMAL PLACEMENT ====================

  /**
   * Find optimal position for a new element
   * @param {string} elementType - Type of element ('chart', 'kpi', 'textbox')
   * @param {string} preferredRegion - Preferred region ('center', 'top-left', etc.)
   * @returns {Object} Position { x, y }
   */
  findOptimalPosition(elementType = 'chart', preferredRegion = 'center') {
    const analysis = this.analyzeCanvas();
    
    // Get element size based on type
    const size = this.getElementSize(elementType);
    
    // Filter empty regions by size
    const suitableRegions = analysis.emptyRegions.filter(region => 
      region.w >= size.w && region.h >= size.h
    );
    
    if (suitableRegions.length === 0) {
      // No suitable empty space, use default positioning
      return this.getDefaultPosition(preferredRegion);
    }
    
    // Select best position based on preferred region
    return this.selectBestPosition(suitableRegions, preferredRegion);
  }

  /**
   * Get element size based on type
   * @param {string} elementType - Element type
   * @returns {Object} Size { w, h }
   */
  getElementSize(elementType) {
    switch (elementType) {
      case 'kpi':
        return { w: AGENT_CONFIG.DEFAULT_KPI_WIDTH, h: AGENT_CONFIG.DEFAULT_KPI_HEIGHT };
      case 'textbox':
        return { w: 300, h: 250 };
      case 'table':
        return { w: 300, h: 400 };
      case 'chart':
      default:
        return { w: AGENT_CONFIG.DEFAULT_CHART_WIDTH, h: AGENT_CONFIG.DEFAULT_CHART_HEIGHT };
    }
  }

  /**
   * Select best position from available regions
   * @param {Array} regions - Available regions
   * @param {string} preferredRegion - Preference
   * @returns {Object} Position { x, y }
   */
  selectBestPosition(regions, preferredRegion) {
    if (regions.length === 0) {
      return this.getDefaultPosition(preferredRegion);
    }

    // For now, return the first suitable region
    // TODO: Implement smarter selection based on preferredRegion
    const region = regions[0];
    return { x: region.x, y: region.y };
  }

  /**
   * Get default position based on preference
   * @param {string} preferredRegion - Preference
   * @returns {Object} Position { x, y }
   */
  getDefaultPosition(preferredRegion) {
    if (!this.editor) {
      return { x: 0, y: 0 };
    }

    const viewport = this.editor.getViewportPageBounds();
    
    switch (preferredRegion) {
      case 'top-left':
        return { x: viewport.x + 50, y: viewport.y + 50 };
      case 'top-right':
        return { x: viewport.x + viewport.w - 850, y: viewport.y + 50 };
      case 'bottom-left':
        return { x: viewport.x + 50, y: viewport.y + viewport.h - 450 };
      case 'bottom-right':
        return { x: viewport.x + viewport.w - 850, y: viewport.y + viewport.h - 450 };
      case 'center':
      default:
        return {
          x: viewport.x + viewport.w / 2 - 400,
          y: viewport.y + viewport.h / 2 - 200
        };
    }
  }

  // ==================== ARRANGEMENT STRATEGIES ====================

  /**
   * Arrange multiple elements using specified strategy
   * @param {Array} elements - Elements to arrange
   * @param {string} strategy - Layout strategy
   * @param {Object} options - Strategy-specific options
   * @returns {Array} Arranged elements with positions
   */
  arrangeDashboard(elements, strategy = 'grid', options = {}) {
    // Special case for kpi-dashboard (standalone function)
    if (strategy === 'kpi-dashboard') {
      console.log('📊 Using kpi-dashboard layout with horizontal KPI row');
      return arrangeKPIDashboard(elements);
    }
    
    const strategies = {
      grid: this.arrangeGrid.bind(this),
      hero: this.arrangeHero.bind(this),
      flow: this.arrangeFlow.bind(this),
      comparison: this.arrangeComparison.bind(this)
    };

    const arrangeFn = strategies[strategy];
    if (!arrangeFn) {
      console.warn(`⚠️ Unknown strategy: ${strategy}, falling back to grid`);
      return this.arrangeGrid(elements, options);
    }

    return arrangeFn(elements, options);
  }

  /**
   * Grid Layout: Equal-sized elements in rows/columns
   * @param {Array} elements - Elements to arrange
   * @param {Object} options - { cols, gap, startX, startY }
   * @returns {Array} Arranged elements
   */
  arrangeGrid(elements, options = {}) {
    const { cols = 2, gap = 50, startX = 0, startY = 0 } = options;
    const chartWidth = AGENT_CONFIG.DEFAULT_CHART_WIDTH;
    const chartHeight = AGENT_CONFIG.DEFAULT_CHART_HEIGHT;

    return elements.map((el, i) => {
      const size = this.getElementSize(el.type || 'chart');
      return {
        ...el,
        position: {
          x: startX + (i % cols) * (chartWidth + gap),
          y: startY + Math.floor(i / cols) * (chartHeight + gap)
        },
        size
      };
    });
  }

  /**
   * Hero Layout: One large chart (75% width) + insights (25% width) + smaller supporting elements
   * Aligned with professional dashboard layout pattern
   * @param {Array} elements - Elements to arrange
   * @param {Object} options - Layout options
   * @returns {Array} Arranged elements
   */
  arrangeHero(elements, options = {}) {
    if (elements.length === 0) return [];

    const DASHBOARD_WIDTH = 1200;
    const PADDING = 12; // Consistent tight padding
    const heroWidth = Math.floor(DASHBOARD_WIDTH * 0.75) - PADDING;
    const sideWidth = Math.floor(DASHBOARD_WIDTH * 0.25);
    
    const heroChart = elements[0];
    const supporting = elements.slice(1);

    const layout = [{
      ...heroChart,
      position: { x: 0, y: 0 },
      size: { w: heroWidth, h: 400 }
    }];

    // If there's a second element, place it next to hero (insights/supporting)
    if (supporting.length > 0) {
      layout.push({
        ...supporting[0],
        position: { x: heroWidth + PADDING, y: 0 },
        size: { w: sideWidth, h: 400 }
      });
      
      // Arrange remaining supporting elements below hero in a row
      if (supporting.length > 1) {
        const remainingSupporting = supporting.slice(1);
        const supportingLayout = this.arrangeGrid(remainingSupporting, {
          cols: 3,
          gap: 12, // Match consistent padding
          startX: 0,
          startY: 412 // 400 + 12 padding
        });
        layout.push(...supportingLayout);
      }
    }

    return layout;
  }

  /**
   * Flow Layout: Left-to-right or top-to-bottom narrative sequence
   * @param {Array} elements - Elements to arrange
   * @param {Object} options - { direction, gap, startX, startY }
   * @returns {Array} Arranged elements
   */
  arrangeFlow(elements, options = {}) {
    const { direction = 'horizontal', gap = 50, startX = 0, startY = 0 } = options;
    let currentX = startX;
    let currentY = startY;

    return elements.map(el => {
      const size = this.getElementSize(el.type || 'chart');
      const position = { x: currentX, y: currentY };

      if (direction === 'horizontal') {
        currentX += size.w + gap;
      } else {
        currentY += size.h + gap;
      }

      return { ...el, position, size };
    });
  }

  /**
   * Comparison Layout: Side-by-side for easy comparison
   * @param {Array} elements - Elements to arrange
   * @param {Object} options - Layout options
   * @returns {Array} Arranged elements
   */
  arrangeComparison(elements, options = {}) {
    const halfCount = Math.ceil(elements.length / 2);
    const left = elements.slice(0, halfCount);
    const right = elements.slice(halfCount);

    const leftLayout = this.arrangeGrid(left, {
      cols: 1,
      gap: 50,
      startX: 0,
      startY: 0
    });

    const rightLayout = this.arrangeGrid(right, {
      cols: 1,
      gap: 50,
      startX: AGENT_CONFIG.CHART_HORIZONTAL_SPACING,
      startY: 0
    });

    return [...leftLayout, ...rightLayout];
  }

  // ==================== COLLISION DETECTION ====================

  /**
   * Check if a position would cause collision
   * @param {Object} position - { x, y }
   * @param {Object} size - { w, h }
   * @returns {boolean} True if collision detected
   */
  hasCollision(position, size) {
    return this.nodes.some(node => {
      const nodeSize = {
        w: node.data.width || AGENT_CONFIG.DEFAULT_CHART_WIDTH,
        h: node.data.height || AGENT_CONFIG.DEFAULT_CHART_HEIGHT
      };
      return this.rectanglesOverlap(
        { ...position, ...size },
        { ...node.position, ...nodeSize }
      );
    });
  }

  /**
   * Check if two rectangles overlap
   * @param {Object} rect1 - { x, y, w, h }
   * @param {Object} rect2 - { x, y, w, h }
   * @returns {boolean} True if overlap
   */
  rectanglesOverlap(rect1, rect2) {
    return !(
      rect1.x + rect1.w < rect2.x ||
      rect2.x + rect2.w < rect1.x ||
      rect1.y + rect1.h < rect2.y ||
      rect2.y + rect2.h < rect1.y
    );
  }

  // ==================== HELPER METHODS ====================

  /**
   * Calculate distance between two positions
   * @param {Object} pos1 - { x, y }
   * @param {Object} pos2 - { x, y }
   * @returns {number} Euclidean distance
   */
  calculateDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate centroid of a cluster of nodes
   * @param {Array} nodes - Array of nodes
   * @returns {Object} Centroid position { x, y }
   */
  calculateCentroid(nodes) {
    const sum = nodes.reduce(
      (acc, node) => ({
        x: acc.x + node.position.x,
        y: acc.y + node.position.y
      }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / nodes.length,
      y: sum.y / nodes.length
    };
  }

  /**
   * Calculate bounding box for a group of nodes
   * @param {Array} nodes - Array of nodes
   * @returns {Object} Bounds { x, y, w, h }
   */
  calculateBounds(nodes) {
    if (nodes.length === 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    const positions = nodes.map(node => {
      const w = node.data.width || AGENT_CONFIG.DEFAULT_CHART_WIDTH;
      const h = node.data.height || AGENT_CONFIG.DEFAULT_CHART_HEIGHT;
      return {
        x1: node.position.x,
        y1: node.position.y,
        x2: node.position.x + w,
        y2: node.position.y + h
      };
    });

    const minX = Math.min(...positions.map(p => p.x1));
    const minY = Math.min(...positions.map(p => p.y1));
    const maxX = Math.max(...positions.map(p => p.x2));
    const maxY = Math.max(...positions.map(p => p.y2));

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }

  /**
   * Merge adjacent empty regions into larger blocks
   * @param {Array} regions - Array of small regions
   * @returns {Array} Merged regions
   */
  mergeAdjacentRegions(regions) {
    if (regions.length === 0) return [];

    // Simple implementation: just return regions for now
    // TODO: Implement proper merging algorithm
    return regions;
  }

  /**
   * Snap position to grid
   * @param {Object} position - { x, y }
   * @param {number} gridSize - Grid size in pixels
   * @returns {Object} Snapped position
   */
  snapToGrid(position, gridSize = 50) {
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize
    };
  }
  
  // ==================== REGION-BASED PLACEMENT ====================
  
  /**
   * Find optimal position inside a drawn rectangle/region
   * Centers the element within the region bounds
   * @param {Object} region - TLDraw shape representing region
   * @param {Object} elementSize - {width, height} of element to place
   * @returns {Object} {x, y} position centered in region
   */
  findPositionInRegion(region, elementSize) {
    if (!region || !region.bounds) {
      console.warn('⚠️ Invalid region provided to findPositionInRegion');
      return { x: 0, y: 0 };
    }
    
    const regionBounds = region.bounds;
    
    return {
      x: regionBounds.x + (regionBounds.width - elementSize.width) / 2,
      y: regionBounds.y + (regionBounds.height - elementSize.height) / 2
    };
  }
  
  /**
   * Find empty drawn regions suitable for chart placement
   * Returns rectangles that don't have charts inside them
   * @returns {Array} Rectangles without charts inside them
   */
  findEmptyDrawnRegions() {
    if (!this.editor) {
      console.warn('⚠️ Editor not available for findEmptyDrawnRegions');
      return [];
    }
    
    try {
      // Get all rectangle annotations from tldraw
      const annotations = this.editor.getCurrentPageShapes()
        .filter(s => s.type === 'geo' && s.props.geo === 'rectangle');
      
      const charts = this.nodes.filter(n => n.type === 'chart');
      
      // Filter to only empty regions (no charts inside)
      return annotations.filter(region => {
        const regionBounds = this.editor.getShapePageBounds(region);
        
        // Check if any chart is inside this region
        const hasChart = charts.some(chart => 
          this.isPointInBounds(chart.position, regionBounds)
        );
        
        return !hasChart; // Return true if no chart inside (empty)
      }).map(region => {
        const bounds = this.editor.getShapePageBounds(region);
        return {
          id: region.id,
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.w,
            height: bounds.h,
            centerX: bounds.x + bounds.w / 2,
            centerY: bounds.y + bounds.h / 2
          },
          text: region.props.text || ''
        };
      });
    } catch (error) {
      console.error('❌ Error finding empty drawn regions:', error);
      return [];
    }
  }
  
  /**
   * Check if a point is within bounds
   * @param {Object} point - {x, y} coordinates
   * @param {Object} bounds - Rectangle bounds with x, y, and w/width, h/height
   * @returns {boolean} True if point is inside bounds
   */
  isPointInBounds(point, bounds) {
    const width = bounds.w || bounds.width;
    const height = bounds.h || bounds.height;
    
    return point.x >= bounds.x && 
           point.x <= bounds.x + width &&
           point.y >= bounds.y && 
           point.y <= bounds.y + height;
  }
  
  /**
   * Find the nearest drawn region to a given position
   * Useful for placing charts near user-drawn sections
   * @param {Object} position - {x, y} coordinates
   * @returns {Object|null} Nearest region or null if none found
   */
  findNearestDrawnRegion(position) {
    const emptyRegions = this.findEmptyDrawnRegions();
    
    if (emptyRegions.length === 0) {
      return null;
    }
    
    // Find region with center closest to position
    let nearestRegion = null;
    let minDistance = Infinity;
    
    emptyRegions.forEach(region => {
      const dx = region.bounds.centerX - position.x;
      const dy = region.bounds.centerY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestRegion = region;
      }
    });
    
    return nearestRegion;
  }
}

/**
 * Helper function to arrange KPI + Charts dashboard with professional layout
 * Layout pattern:
 * - KPIs in horizontal row at top (with padding, not grid)
 * - Hero chart (75% width) + Hero insights (25% width) side by side
 * - Secondary charts + insights pairs below, each in their own row
 * - Pattern repeats for all secondary charts
 * @param {Array} elements - All elements
 * @returns {Array} Arranged elements
 */
export function arrangeKPIDashboard(elements) {
  const kpis = elements.filter(e => e.type === 'kpi');
  const charts = elements.filter(e => e.type === 'chart');
  const insights = elements.filter(e => e.type === 'insight' || e.type === 'textbox');
  
  const layout = [];
  const DASHBOARD_WIDTH = 1200; // Total dashboard width
  const PADDING = 12; // Tight, consistent padding everywhere
  const KPI_ROW_SPACING = 12; // Space after KPI row (same as padding)
  const SECTION_SPACING = 12; // Space between sections (same as padding)
  
  let currentY = 0;
  
  // 1. KPIs in horizontal row at top (not grid)
  if (kpis.length > 0) {
    const kpiLayout = kpis.map((kpi, i) => ({
      ...kpi,
      position: { 
        x: i * (AGENT_CONFIG.DEFAULT_KPI_WIDTH + PADDING), 
        y: currentY 
      },
      size: { w: AGENT_CONFIG.DEFAULT_KPI_WIDTH, h: AGENT_CONFIG.DEFAULT_KPI_HEIGHT }
    }));
    layout.push(...kpiLayout);
    currentY += AGENT_CONFIG.DEFAULT_KPI_HEIGHT + KPI_ROW_SPACING;
  }
  
  // 2. Hero section: Hero chart (3/4 width) + Hero insights (1/4 width)
  if (charts.length > 0) {
    const heroChart = charts[0];
    const heroInsight = insights[0];
    
    const heroChartWidth = Math.floor(DASHBOARD_WIDTH * 0.75) - PADDING;
    const heroChartHeight = 400;
    const heroInsightWidth = Math.floor(DASHBOARD_WIDTH * 0.25);
    const heroInsightHeight = heroChartHeight;
    
    // Hero chart (75% width)
    layout.push({
      ...heroChart,
      position: { x: 0, y: currentY },
      size: { w: heroChartWidth, h: heroChartHeight }
    });
    
    // Hero insights next to it (25% width)
    if (heroInsight) {
      layout.push({
        ...heroInsight,
        position: { x: heroChartWidth + PADDING, y: currentY },
        size: { w: heroInsightWidth, h: heroInsightHeight }
      });
    }
    
    currentY += heroChartHeight + SECTION_SPACING;
  }
  
  // 3. Secondary charts: Arrange in rows (2 chart-insight pairs per row)
  const secondaryCharts = charts.slice(1); // All charts after the hero
  const secondaryInsights = insights.slice(1); // All insights after hero insight
  
  const secondaryWidth = Math.floor(DASHBOARD_WIDTH * 0.25);
  const secondaryHeight = 300;
  const PAIRS_PER_ROW = 2; // Number of chart-insight pairs per row
  const PAIR_WIDTH = secondaryWidth * 2 + PADDING; // Chart + insight + padding
  
  secondaryCharts.forEach((chart, i) => {
    const insight = secondaryInsights[i];
    
    // Calculate position in grid
    const column = i % PAIRS_PER_ROW; // 0 or 1
    const row = Math.floor(i / PAIRS_PER_ROW);
    
    // Base X position for this pair
    const pairX = column * PAIR_WIDTH;
    
    // Y position (only changes when moving to new row)
    const pairY = currentY + (row * (secondaryHeight + SECTION_SPACING));
    
    // Chart on left (1/4 width)
    layout.push({
      ...chart,
      position: { x: pairX, y: pairY },
      size: { w: secondaryWidth, h: secondaryHeight }
    });
    
    // Insight on right (1/4 width)
    if (insight) {
      layout.push({
        ...insight,
        position: { x: pairX + secondaryWidth + PADDING, y: pairY },
        size: { w: secondaryWidth, h: secondaryHeight }
      });
    }
  });
  
  // Update currentY to account for all secondary chart rows
  if (secondaryCharts.length > 0) {
    const numRows = Math.ceil(secondaryCharts.length / PAIRS_PER_ROW);
    currentY += numRows * (secondaryHeight + SECTION_SPACING);
  }
  
  // 4. Handle any remaining insights that weren't paired with charts
  const remainingInsights = insights.slice(secondaryCharts.length + 1);
  if (remainingInsights.length > 0) {
    const insightWidth = 300;
    const insightHeight = 250;
    
    remainingInsights.forEach((insight, i) => {
      layout.push({
        ...insight,
        position: { x: (i % 3) * (insightWidth + PADDING), y: currentY },
        size: { w: insightWidth, h: insightHeight }
      });
      
      // Move to next row after every 3 insights
      if ((i + 1) % 3 === 0) {
        currentY += insightHeight + SECTION_SPACING;
      }
    });
    
    // Add final spacing if we had remaining insights
    if (remainingInsights.length % 3 !== 0) {
      currentY += 250 + SECTION_SPACING;
    }
  }
  
  return layout;
}

