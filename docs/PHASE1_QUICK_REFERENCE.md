# Phase 1 Foundation - Quick Reference Guide

## Overview

This guide provides quick reference for developers working with the Phase 1 spatial intelligence features.

## Quick Start

### Using LayoutManager

```javascript
import { LayoutManager } from './agentic_layer';

// Initialize
const layoutManager = new LayoutManager(editor, nodes);

// Analyze canvas
const analysis = layoutManager.analyzeCanvas();
console.log({
  density: analysis.density,
  clusters: analysis.clusters.length,
  availableSpace: analysis.emptyRegions.length
});

// Arrange elements
const elements = [
  { type: 'chart', id: 'c1' },
  { type: 'chart', id: 'c2' },
  { type: 'kpi', id: 'k1' }
];

const layout = layoutManager.arrangeDashboard(elements, 'grid');
// Returns: [{ ...el, position: { x, y }, size: { w, h } }]
```

### Using Spatial Grouping

```javascript
import { detectDataRelationships, suggestGroupings } from './agentic_layer';

// Find relationships
const charts = nodes.filter(n => n.type === 'chart');
const relationships = detectDataRelationships(charts);

// Get suggestions
const groups = suggestGroupings(charts, relationships);

groups.forEach(group => {
  console.log(`Group ${group.id}: ${group.type}`);
  console.log(`Members: ${group.members.join(', ')}`);
});
```

### Creating Dashboard Action

```json
{
  "type": "create_dashboard",
  "layoutStrategy": "grid",
  "elements": [
    {
      "type": "chart",
      "dimensions": ["Region"],
      "measures": ["Sales"],
      "chartType": "bar",
      "reasoning": "Regional breakdown"
    },
    {
      "type": "kpi",
      "query": "Total Sales",
      "value": 1250000,
      "formatted_value": "1,250,000",
      "reasoning": "Key metric"
    }
  ],
  "reasoning": "Sales dashboard"
}
```

## Layout Strategies

### Grid
```javascript
layoutManager.arrangeGrid(elements, {
  cols: 2,        // Number of columns
  gap: 50,        // Gap between elements (px)
  startX: 0,      // Starting X position
  startY: 0       // Starting Y position
});
```

**Best for**: 3-6 similar elements, general purpose

### Hero
```javascript
layoutManager.arrangeHero(elements);
```

**Best for**: 1 main chart + 3-6 supporting charts
**Layout**: First element large (1000x500), rest in grid below

### Flow
```javascript
layoutManager.arrangeFlow(elements, {
  direction: 'horizontal',  // or 'vertical'
  gap: 50,
  startX: 0,
  startY: 0
});
```

**Best for**: Time-series, narrative sequences, 2-5 elements
**Layout**: Left-to-right or top-to-bottom sequence

### Comparison
```javascript
layoutManager.arrangeComparison(elements);
```

**Best for**: 2-4 charts comparing metrics
**Layout**: Side-by-side in two columns

### KPI Dashboard
```javascript
import { arrangeKPIDashboard } from './agentic_layer';

const layout = arrangeKPIDashboard(elements);
```

**Best for**: 3+ KPIs + charts
**Layout**: KPIs in top row, charts in grid below

## API Reference

### LayoutManager

#### Constructor
```javascript
new LayoutManager(editor, nodes)
```

#### Methods

##### `analyzeCanvas()`
Returns spatial analysis of canvas.

**Returns**:
```javascript
{
  occupiedRegions: Array<{x, y, w, h, nodeId, nodeType}>,
  emptyRegions: Array<{x, y, w, h}>,
  clusters: Array<{nodes, centroid, bounds}>,
  density: number,  // 0-1
  bounds: {x, y, w, h}
}
```

##### `findOptimalPosition(elementType, preferredRegion)`
Finds best empty space for new element.

**Parameters**:
- `elementType`: 'chart' | 'kpi' | 'textbox' | 'table'
- `preferredRegion`: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

**Returns**: `{x, y}`

##### `arrangeDashboard(elements, strategy, options)`
Arranges multiple elements.

**Parameters**:
- `elements`: Array of elements to arrange
- `strategy`: 'grid' | 'hero' | 'flow' | 'comparison'
- `options`: Strategy-specific options

**Returns**: Array of elements with positions

##### `hasCollision(position, size)`
Checks if position would overlap existing elements.

**Returns**: boolean

### Spatial Grouping

#### `detectDataRelationships(charts)`
Finds charts sharing dimensions/measures.

**Returns**:
```javascript
[{
  type: 'data-overlap',
  charts: [id1, id2],
  sharedDimensions: ['Region'],
  sharedMeasures: ['Sales'],
  strength: 0.75  // 0-1
}]
```

#### `detectHierarchicalRelationships(charts)`
Finds parent-child drill-down relationships.

**Returns**:
```javascript
[{
  type: 'hierarchical',
  parent: 'chart-1',
  child: 'chart-2',
  relationship: 'drill-down'
}]
```

#### `suggestGroupings(charts, relationships)`
Suggests logical groupings.

**Returns**:
```javascript
[{
  id: 'group-1',
  type: 'related-data' | 'comparison' | 'standalone',
  members: ['chart-1', 'chart-2'],
  relationships: [...]
}]
```

#### `suggestLayoutStrategy(charts)`
Recommends best layout for charts.

**Returns**:
```javascript
{
  strategy: 'grid' | 'hero' | 'flow' | 'comparison' | 'kpi-dashboard',
  reason: 'Explanation'
}
```

### Action Types

#### CREATE_DASHBOARD
```javascript
{
  type: 'create_dashboard',
  dashboardType: 'sales' | 'executive' | 'operations' | 'analysis' | 'general',
  layoutStrategy: 'grid' | 'hero' | 'flow' | 'comparison' | 'kpi-dashboard',
  elements: [{
    type: 'chart' | 'kpi' | 'insight',
    // ... element-specific fields
    reasoning: string
  }],
  reasoning: string
}
```

#### ARRANGE_ELEMENTS
```javascript
{
  type: 'arrange_elements',
  elementIds: string[],  // optional, default: all
  strategy: 'grid' | 'hero' | 'flow' | 'comparison' | 'optimize' | 'kpi-dashboard',
  reasoning: string
}
```

## Common Patterns

### Pattern 1: Create Dashboard from Scratch

```javascript
// User query: "Create a sales dashboard"
const action = {
  type: 'create_dashboard',
  dashboardType: 'sales',
  layoutStrategy: 'kpi-dashboard',
  elements: [
    { type: 'kpi', query: 'Total Revenue', value: 1250000 },
    { type: 'kpi', query: 'Avg Deal', value: 45000 },
    { type: 'chart', dimensions: ['Month'], measures: ['Revenue'] },
    { type: 'chart', dimensions: ['Region'], measures: ['Revenue'] }
  ],
  reasoning: 'Sales overview with key metrics'
};

// Executes: Creates 4 elements in coordinated layout
// - 2 KPIs in top row
// - 2 charts in grid below
```

### Pattern 2: Rearrange Existing Elements

```javascript
// User query: "Organize these charts better"
const action = {
  type: 'arrange_elements',
  strategy: 'optimize',  // Auto-detects best layout
  reasoning: 'User wants better organization'
};

// Executes: Analyzes element types, detects optimal strategy, applies
```

### Pattern 3: Add to Existing Dashboard

```javascript
// 1. Analyze existing layout
const layoutManager = new LayoutManager(editor, nodes);
const analysis = layoutManager.analyzeCanvas();

// 2. Find optimal position for new chart
const position = layoutManager.findOptimalPosition('chart', 'center');

// 3. Create chart at optimal position
const action = {
  type: 'create_chart',
  dimensions: ['Product'],
  measures: ['Sales'],
  position: 'center'  // Will use optimal position
};
```

### Pattern 4: Detect Related Charts

```javascript
// Find charts that should be grouped
const charts = nodes.filter(n => n.type === 'chart');
const relationships = detectDataRelationships(charts);

// Group by strength
const strongRels = relationships.filter(r => r.strength > 0.5);

// Use for spatial arrangement
strongRels.forEach(rel => {
  console.log(`Charts ${rel.charts[0]} and ${rel.charts[1]} are ${rel.strength * 100}% related`);
});
```

## Testing Checklist

### Unit Tests
- [ ] LayoutManager.analyzeCanvas()
- [ ] LayoutManager.arrangeGrid()
- [ ] LayoutManager.arrangeHero()
- [ ] LayoutManager.arrangeFlow()
- [ ] LayoutManager.arrangeComparison()
- [ ] LayoutManager.hasCollision()
- [ ] detectDataRelationships()
- [ ] suggestGroupings()
- [ ] suggestLayoutStrategy()

### Integration Tests
- [ ] create_dashboard action executes
- [ ] arrange_elements action executes
- [ ] Spatial analysis included in canvas snapshot
- [ ] Backend prompt includes spatial context
- [ ] Layout strategies work with real data

### Manual Tests
- [ ] Empty canvas → dashboard creation
- [ ] Crowded canvas → optimal placement
- [ ] Random charts → arrange optimization
- [ ] KPI + charts → KPI dashboard layout

## Troubleshooting

### Issue: Dashboard elements overlap

**Cause**: Collision detection may have edge cases

**Solution**:
```javascript
// Check for collisions manually
const hasCollision = layoutManager.hasCollision(
  { x: 100, y: 100 },
  { w: 800, h: 400 }
);

// Adjust positioning if needed
```

### Issue: Spatial analysis returns empty

**Cause**: Editor not initialized or no nodes

**Solution**:
```javascript
// Check prerequisites
if (!editor) {
  console.warn('Editor not available');
  return;
}

if (nodes.length === 0) {
  console.warn('No nodes to analyze');
  return;
}

// Include spatial analysis conditionally
const snapshot = getCanvasSnapshot(editor, nodes, nodes.length > 0);
```

### Issue: Layout strategy not optimal

**Cause**: Auto-detection logic needs tuning

**Solution**:
```javascript
// Override with explicit strategy
const action = {
  type: 'create_dashboard',
  layoutStrategy: 'hero',  // Explicit instead of auto
  // ...
};
```

### Issue: Performance slow with many elements

**Cause**: Spatial analysis complexity

**Solution**:
```javascript
// Skip spatial analysis for large canvases
const includeSpatial = nodes.length < 50;
const snapshot = getCanvasSnapshot(editor, nodes, includeSpatial);
```

## Performance Tips

1. **Cache Layout Manager**
```javascript
// Don't recreate on every query
const [layoutManager] = useState(() => new LayoutManager(editor, nodes));

// Update when needed
useEffect(() => {
  layoutManager.nodes = nodes;
}, [nodes]);
```

2. **Debounce Spatial Analysis**
```javascript
const debouncedAnalysis = useMemo(
  () => debounce(() => layoutManager.analyzeCanvas(), 300),
  [layoutManager]
);
```

3. **Conditional Features**
```javascript
// Skip expensive operations when not needed
const relationships = charts.length > 1 
  ? detectDataRelationships(charts)
  : [];
```

## File Locations

- **LayoutManager**: `frontend/src/agentic_layer/layoutManager.js`
- **Spatial Grouping**: `frontend/src/agentic_layer/spatialGrouping.js`
- **Action Executor**: `frontend/src/agentic_layer/actionExecutor.js`
- **Validation**: `frontend/src/agentic_layer/validation.js`
- **Types**: `frontend/src/agentic_layer/types.js`
- **Canvas Snapshot**: `frontend/src/agentic_layer/canvasSnapshot.js`
- **Backend Prompts**: `backend/gemini_llm.py`

## Next Steps

See:
- **Phase 1 Complete**: `docs/PHASE1_FOUNDATION_COMPLETE.md`
- **Strategy Guide**: `docs/ADVANCED_AGENTIC_STRATEGY.md`
- **Phase 2 Plan**: Coming soon

---

**Version**: 1.0.0
**Last Updated**: December 19, 2024

