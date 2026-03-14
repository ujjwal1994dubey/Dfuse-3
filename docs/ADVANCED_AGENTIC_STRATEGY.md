# Advanced Agentic Layer Strategy - Architecture Analysis

## Executive Summary

This document provides a comprehensive analysis of the tldraw agent starter kit's architectural patterns and how they inform the evolution of DFuse 3.2's agentic layer. It serves as both a reference for understanding the tldraw approach and a strategic guide for future enhancements.

## Part 1: Vision & Goals

### The North Star

**Fully Agentic** for DFuse 3.2 means:

1. **Intent Understanding**: Parse complex, ambiguous requests
   - "Show me what's important" → Identifies key metrics and creates dashboard
   - "Analyze this data" → Determines relevant dimensions and generates multi-chart analysis
   
2. **Autonomous Decision-Making**: Choose visualizations without explicit instruction
   - Automatically selects appropriate chart types based on data distribution
   - Decides layout strategy based on content relationships
   - Groups related visualizations spatially

3. **Spatial Intelligence**: Arrange elements in logical, aesthetic layouts
   - Detects occupied/empty regions
   - Identifies semantic relationships
   - Applies dashboard patterns (executive, sales, analysis)

4. **Dashboard Thinking**: Create cohesive analytical stories
   - Multi-visualization coordination
   - Progressive narrative flow
   - Hierarchical information architecture

### Key Capabilities Achieved (Phase 1)

✅ **Multi-visualization planning** (create 3-10 charts in one request)
✅ **Intelligent spatial layout** (grid, flow, hero, comparison, KPI-dashboard)
✅ **Relationship detection** (data overlap, hierarchical, temporal, comparison)
⏳ **Progressive refinement** (Phase 2: iterative layout improvement)
⏳ **Context awareness** (Phase 2: memory of user preferences)

## Part 2: TLDraw Pattern Deep Dive

### 2.1 The Utility Class Pattern

**TLDraw Approach**:
```typescript
// Everything co-located in a utility class
export class CreateChartActionUtil extends AgentActionUtil<CreateChartAction> {
  static type = 'create_chart'
  
  // Schema definition
  getSchema() { 
    return z.object({
      type: z.literal('create_chart'),
      dimensions: z.array(z.string()),
      // ...
    })
  }
  
  // Execution logic
  applyAction(action, helpers) { 
    // Create chart on canvas
  }
  
  // UI representation
  getInfo(action) { 
    return { icon: 'chart-bar', description: 'Created chart' }
  }
  
  // Contribute to system prompt
  buildSystemPrompt() { 
    return 'You can create charts with dimensions and measures...'
  }
  
  // Handle sanitization
  sanitizeAction(action, helpers) {
    // Validate and clean action data
  }
}
```

**DFuse Current Approach** (Phase 1):
```javascript
// Separate concerns across files

// validation.js - Schema definition
export const CreateChartActionSchema = z.object({
  type: z.literal(ACTION_TYPES.CREATE_CHART),
  dimensions: z.array(z.string()).min(1),
  measures: z.array(z.string()).min(1),
  // ...
});

// actionExecutor.js - Execution logic
async function createChartAction(action, context) {
  // Call /charts endpoint
  // Transform data
  // Create node on canvas
}

// gemini_llm.py - Prompt contribution
prompt = f"""
ACTION SCHEMAS:
1. create_chart: {{"type": "create_chart", "dimensions": [...], ...}}
"""
```

**Comparison**:

| Aspect | TLDraw Utility Pattern | DFuse Current |
|--------|------------------------|---------------|
| **Co-location** | ✅ All in one class | ❌ Spread across files |
| **Discoverability** | ✅ Single source of truth | ⚠️ Must check multiple files |
| **Extensibility** | ✅ Inherit & override | ⚠️ Add to multiple places |
| **Testability** | ✅ Test one util | ⚠️ Test multiple functions |
| **Maintainability** | ✅ Change one place | ⚠️ Change multiple files |

**Benefits of Utility Pattern**:
1. **Plugin Architecture**: Add new action by adding one file
2. **Co-location**: Schema + execution + prompt + UI in one place
3. **Inheritance**: Extend base class for common behavior
4. **Composability**: Complex actions built from simple utils

**Trade-offs**:
- **Learning Curve**: More abstract, requires understanding class hierarchy
- **Boilerplate**: More setup code per action
- **Migration Cost**: Significant refactor to switch existing code

### 2.2 The Prompt Part System

**TLDraw Approach**:
```typescript
// Each context type is a separate utility class
class CanvasStatePartUtil extends PromptPartUtil<CanvasStatePart> {
  // Define what data to gather
  getPart(request, helpers): CanvasStatePart {
    return {
      type: 'canvas-state',
      charts: this.extractCharts(),
      spatial_clusters: this.detectClusters(),
      layout_density: this.calculateDensity()
    }
  }
  
  // Define how to present it in prompt
  buildContent(part: CanvasStatePart) {
    return [
      "Current canvas state:",
      `- ${part.charts.length} charts`,
      `- Density: ${part.layout_density}`,
      `- Clusters: ${part.spatial_clusters.length}`
    ]
  }
  
  // Control prompt ordering (lower = higher priority)
  getPriority() { return 100 }
  
  // Optionally contribute to system prompt
  buildSystemPrompt() {
    return 'The canvas contains various visualizations...'
  }
}

// Register in list
const PROMPT_PART_UTILS = [
  UserMessagePartUtil,
  CanvasStatePartUtil,
  ScreenshotPartUtil,
  SelectionPartUtil,
  // ... more utils
]
```

**DFuse Current Approach** (Phase 1):
```javascript
// Single function gathers all context
export function getCanvasSnapshot(editor, nodes, includeSpatialAnalysis = true) {
  const snapshot = {
    charts: extractCharts(nodes),
    tables: extractTables(nodes),
    textBoxes: extractTextBoxes(nodes),
    metadata: { ... }
  };
  
  // Conditionally add spatial analysis
  if (includeSpatialAnalysis && editor && nodes.length > 0) {
    snapshot.spatial_analysis = {
      density: ...,
      clusters: ...,
      // ...
    };
  }
  
  return snapshot;
}

// Backend formats into prompt
canvas_summary = self._summarize_canvas_state(canvas_state)
spatial_context = ""
if canvas_state.get('spatial_analysis'):
    spatial_context = f"""
    SPATIAL CANVAS ANALYSIS:
    - Density: {analysis.get('density', 0):.1%} occupied
    ...
    """
```

**Comparison**:

| Aspect | TLDraw Prompt Parts | DFuse Current |
|--------|---------------------|---------------|
| **Modularity** | ✅ Each context type separate | ⚠️ Monolithic function |
| **Priority Control** | ✅ Fine-grained ordering | ❌ Fixed order |
| **Conditional Inclusion** | ✅ Easy enable/disable | ⚠️ Conditional checks |
| **Visual Context** | ✅ Screenshots via PromptPart | ❌ No visual context |
| **Extensibility** | ✅ Add new PromptPart | ⚠️ Modify main function |

**Benefits of PromptPartUtil Pattern**:
1. **Modular Context**: Easy to add/remove context types
2. **Priority System**: Control what LLM sees first
3. **Visual Screenshots**: Can include canvas images for vision models
4. **Distributed Prompts**: Each util contributes to system prompt

**DFuse Advantages**:
1. **Simplicity**: One function call gets everything
2. **Performance**: No class instantiation overhead
3. **Conditional**: Easy to skip expensive analysis
4. **Backend Control**: Python formats prompt optimally

### 2.3 Spatial Intelligence Architecture

**TLDraw's Approach**:

```typescript
// Shape formats at multiple levels of detail
type BlurryShape = {
  // Minimal info for off-screen shapes
  type: string;
  bounds: { x, y, w, h };
}

type SimpleShape = {
  // Rich info for focused shapes
  type: string;
  shapeId: string;
  x: number;
  y: number;
  // ... shape-specific props
  note: string;  // Agent's notes to itself
}

type PeripheralShapeCluster = {
  // Grouped off-screen shapes
  bounds: { x, y, w, h };
  shapeCount: number;
  center: { x, y };
}

// Position normalization relative to chat start point
helpers.applyOffsetToVec({ x, y })        // Model coords → Canvas coords
helpers.removeOffsetFromVec({ x, y })     // Canvas coords → Model coords
```

**DFuse Implementation** (Phase 1):

```javascript
// LayoutManager provides spatial intelligence
class LayoutManager {
  analyzeCanvas() {
    return {
      occupiedRegions: [...],    // All element bounds
      emptyRegions: [...],        // Available space
      clusters: [...],            // Spatial groups
      density: 0.35,              // Percentage occupied
      bounds: { ... }             // Overall canvas bounds
    }
  }
  
  detectSpatialClusters() {
    // Find groups of nearby elements (< 900px)
    // Returns clusters with centroid and bounds
  }
  
  findOptimalPosition(elementType, preferredRegion) {
    // Find best empty space for new element
  }
}

// Spatial grouping detects semantic relationships
detectDataRelationships(charts)      // Shared dimensions/measures
detectHierarchicalRelationships(charts)  // Parent-child
detectTemporalRelationships(charts)     // Time-series
detectComparisonRelationships(charts)   // Side-by-side intent
```

**Key Differences**:

| Feature | TLDraw | DFuse Phase 1 |
|---------|---------|---------------|
| **Off-screen handling** | Blur shapes, cluster | Not yet implemented |
| **Position normalization** | Relative to chat origin | Absolute canvas coords |
| **Shape detail levels** | 3 levels (blurry, simple, full) | 1 level (full data) |
| **Semantic relationships** | ❌ Manual grouping | ✅ Auto-detected |
| **Layout strategies** | ❌ No built-in | ✅ 5 strategies |

**DFuse Advantages**:
1. ✅ **Semantic Detection**: Automatically finds related charts
2. ✅ **Layout Strategies**: Pre-built arrangements (grid, hero, flow, etc.)
3. ✅ **Grouping Suggestions**: Recommends which charts belong together
4. ✅ **Relationship Strength**: Quantifies how related charts are

**TLDraw Advantages**:
1. ✅ **Performance**: Blur distant shapes to reduce token count
2. ✅ **Scalability**: Handles large canvases with clustering
3. ✅ **Position Normalization**: Consistent coordinate system
4. ✅ **Agent Notes**: Shapes carry agent's memory

## Part 3: Architectural Patterns Comparison

### Action Execution Flow

**TLDraw**:
```
User Input
    ↓
Agent.prompt(message)
    ↓
Gather PromptParts (each util contributes)
    ↓
Build Complete Prompt
    ↓
LLM generates Actions
    ↓
Stream Actions (partial updates possible)
    ↓
For each Action:
    ↓
AgentActionUtil.sanitizeAction()
    ↓
AgentActionUtil.applyAction()
    ↓
Agent.schedule() if multi-turn needed
```

**DFuse**:
```
User Input
    ↓
AgentChatPanel.handleSubmit()
    ↓
getCanvasSnapshot(editor, nodes)
    ↓
POST /agent-query with canvas_state
    ↓
Backend: generate_agent_actions()
    ↓
LLM generates Actions (complete response)
    ↓
Frontend: validateActionsSafe()
    ↓
executeActions() sequentially
    ↓
For each action:
    ↓
createChartAction() / createDashboardAction() / etc.
    ↓
Update canvas via setNodes()
```

**Key Differences**:

1. **Streaming**:
   - TLDraw: ✅ Partial actions visible as they stream
   - DFuse: ❌ Wait for complete response

2. **Multi-turn**:
   - TLDraw: ✅ Agent can schedule follow-up work
   - DFuse: ❌ Single turn per query

3. **Sanitization**:
   - TLDraw: ✅ Each util validates its own actions
   - DFuse: ✅ Central Zod validation (similar effectiveness)

4. **Coordination**:
   - TLDraw: Via agent.schedule() and todos
   - DFuse: Via create_dashboard action (Phase 1)

### Memory & Context Management

**TLDraw**:
```typescript
// Persistent memory across requests
class MemorySystem {
  chatHistory: Message[]
  canvasSnapshots: CanvasState[]
  userPreferences: Preferences
  
  // Remember previous interactions
  addToHistory(request, response)
  
  // Reference previous states
  getPreviousCanvasState(turnsAgo: number)
}
```

**DFuse** (Current):
```javascript
// Conversation history per mode
const [canvasMessages, setCanvasMessages] = useState([])
const [askMessages, setAskMessages] = useState([])

// No canvas history (only current state)
// No user preference learning
```

**Phase 2 Opportunity**: Implement memory system
- Track canvas evolution over time
- Learn from user manual adjustments
- Remember preferred layout strategies
- Maintain conversation context

## Part 4: Strategic Recommendations

### Option A: Gradual Enhancement (Recommended for Phase 2)

**Keep current function-based approach**, add advanced features:

**Advantages**:
- ✅ No breaking changes
- ✅ Team familiarity
- ✅ Incremental risk
- ✅ Faster implementation

**Enhancements**:
1. **Streaming**: Add WebSocket for progressive updates
2. **Memory**: Add ConversationHistory class
3. **Visual Context**: Add screenshot capability via canvas.toDataURL()
4. **Multi-turn**: Add follow-up action scheduling

**Implementation**:
```javascript
// Add streaming support
export class ActionStreamer {
  onActionStart(action) { /* show placeholder */ }
  onActionProgress(action, percent) { /* update progress */ }
  onActionComplete(action, result) { /* finalize */ }
}

// Add memory system
export class ConversationMemory {
  constructor() {
    this.history = []
    this.canvasStates = []
  }
  
  addTurn(query, actions, results) { /* ... */ }
  getRecentContext(turns = 5) { /* ... */ }
  findSimilarQuery(query) { /* ... */ }
}
```

### Option B: Hybrid Approach

**New features use utility pattern**, existing code stays:

**Advantages**:
- ✅ Best of both worlds
- ✅ Gradual migration path
- ✅ Learn utility pattern incrementally

**Implementation**:
```javascript
// New Phase 2 actions use utility pattern
export class RefineLayoutActionUtil extends AgentActionUtil {
  static type = 'refine_layout'
  
  getSchema() { return RefineLayoutSchema }
  applyAction(action) { /* ... */ }
  getInfo() { return { icon: 'layout', description: '...' } }
}

// Register both old and new
executeAction(action, context) {
  // Check if utility-based action
  const utilClass = ACTION_UTILS[action.type]
  if (utilClass) {
    return new utilClass(context).applyAction(action)
  }
  
  // Fall back to function-based
  switch (action.type) {
    case 'create_chart': return createChartAction(action, context)
    // ...
  }
}
```

### Option C: Full Refactor

**Complete migration to utility pattern**:

**Advantages**:
- ✅ Maximum alignment with tldraw
- ✅ Future-proof architecture
- ✅ Best maintainability long-term

**Disadvantages**:
- ❌ High migration cost
- ❌ Team retraining needed
- ❌ Risk of regression bugs
- ❌ Slower feature delivery

**Not recommended** unless:
- Major version bump planned
- Significant new features requiring it
- Team ready for architectural overhaul

## Part 5: Phase 2 Roadmap

### Week 3-4: Intelligence Layer

**1. Intent Analyzer**
```javascript
export class IntentAnalyzer {
  analyzeIntent(query) {
    return {
      type: 'dashboard' | 'single-chart' | 'exploration' | 'comparison',
      entities: extractEntities(query),
      scope: 'overview' | 'detailed',
      arrangement: 'auto' | 'specific'
    }
  }
}
```

**2. Chart Recommender**
```javascript
export class ChartRecommender {
  recommend(dimensions, measures, intent, dataDistribution) {
    // Consider:
    // - Cardinality (many categories → top N)
    // - Distribution (skewed → log scale)
    // - Temporal patterns (time → line)
    // - Correlations (2 measures → scatter)
    return { chartType, options }
  }
}
```

**3. Relationship Detector** (Enhanced)
```javascript
// Add causal detection
detectCausalRelationships(charts)  // One explains another

// Add metric derivation
detectDerivedMetrics(charts)  // Revenue/Cost = Profit

// Add temporal sequences
detectTemporalSequence(charts)  // Before → After
```

**4. Layout Optimizer**
```javascript
export class LayoutOptimizer {
  optimize(elements, constraints) {
    // Apply optimization algorithms:
    // - Minimize edge crossings
    // - Balance visual weight
    // - Respect reading order
    // - Group related elements
    return optimizedLayout
  }
  
  learnFromAdjustment(originalLayout, userAdjusted) {
    // ML: Learn user preferences
    this.updateModel(originalLayout, userAdjusted)
  }
}
```

### Week 5-6: Integration & Polish

**1. Streaming Actions**
```javascript
// Progressive dashboard creation
agent.on('action-start', (action) => showPlaceholder(action))
agent.on('action-progress', (action, progress) => updateProgress(action, progress))
agent.on('action-complete', (action) => finalizeShape(action))
```

**2. Layout Preview**
```javascript
// Show before applying
const preview = layoutManager.previewArrangement(elements, strategy)
showGhostShapes(preview)
// User can approve or request changes
```

**3. Manual Adjustment**
```javascript
// UI for fine-tuning
<LayoutControls>
  <StrategySelector />
  <AlignmentTools />
  <SpacingSlider />
  <ApplyButton />
</LayoutControls>
```

**4. Layout History**
```javascript
// Undo/redo
class LayoutHistory {
  undo() { /* restore previous layout */ }
  redo() { /* reapply layout */ }
  reset() { /* back to original */ }
}
```

## Part 6: Success Metrics & KPIs

### Phase 1 (Achieved)

- ✅ Layout calculation: < 100ms
- ✅ No breaking changes
- ✅ Multi-element creation working
- ⏳ User satisfaction: (pending feedback)

### Phase 2 Targets

- Chart type accuracy: > 85%
- Intent classification: > 90%
- Dashboard creation time: < 5 seconds
- User manual adjustments: < 20%

### Phase 3 Targets

- Streaming perceived speed: 2x faster
- Layout preview adoption: > 50%
- Undo usage: < 10% (indicates good initial layouts)

## Conclusion

**Phase 1 establishes solid foundation** for spatial intelligence without requiring full architectural refactor. The function-based approach works well for current scale.

**Recommended Path Forward**:
1. ✅ Phase 1: Keep function-based, add spatial intelligence (DONE)
2. ⏳ Phase 2: Add intelligence features (intent, recommendations) using functions
3. 🔮 Phase 3: Evaluate utility pattern for new complex features only
4. 🔮 Future: Consider full refactor for v3.0 if benefits justify cost

**Key Insight**: TLDraw's utility pattern excels for highly extensible, plugin-based systems. DFuse's current approach works well for a focused set of actions. The gap can be bridged with targeted enhancements rather than full restructuring.

---

**Document Version**: 1.0
**Last Updated**: December 19, 2024
**Status**: Reference & Strategy Guide

