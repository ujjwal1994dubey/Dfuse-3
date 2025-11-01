# Phase 5: State Conversion Mapping

## Completion Date
November 1, 2025

## Overview
This document describes the bidirectional state conversion between React Flow's node/edge format and TLDraw's shape format.

## React Flow Node → TLDraw Shape

### Base Mapping (All Types)
| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `node.id` | `shape.id` | Direct mapping |
| `node.type` | `shape.type` | Direct mapping |
| `node.position.x` | `shape.x` | Flattened structure |
| `node.position.y` | `shape.y` | Flattened structure |
| N/A | `shape.rotation` | Always 0 (no rotation) |
| N/A | `shape.index` | Format: 'a0', 'a1', etc. for z-ordering |
| N/A | `shape.parentId` | Always undefined |
| N/A | `shape.isLocked` | Always false |

### Chart Node
| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `node.data.width` | `shape.props.w` | Width property |
| `node.data.height` | `shape.props.h` | Height property |
| `node.data.figure.data` | `shape.props.chartData` | Chart data array |
| `node.data.figure.layout` | `shape.props.chartLayout` | Chart layout object |
| `node.data.chartType` | `shape.props.chartType` | Chart type (bar, pie, etc.) |
| `node.data.title` | `shape.props.title` | Chart title |
| `node.data.dimensions` | `shape.props.dimensions` | Dimension fields array |
| `node.data.measures` | `shape.props.measures` | Measure fields array |
| `node.data.table` | `shape.props.table` | Raw data table |
| `node.data.agg` | `shape.props.agg` | Aggregation method |
| `node.data.datasetId` | `shape.props.datasetId` | Dataset identifier |
| `node.data.selected` | `shape.props.selected` | Selection state |
| `node.data.aiInsights` | `shape.props.aiInsights` | AI insights data |
| `node.data.aiQuery` | `shape.props.aiQuery` | AI query string |

**Default Values:**
- w: 800, h: 400
- chartType: 'bar'
- agg: 'sum'
- All arrays default to []
- All objects default to null or {}

### TextBox Node
| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `node.data.text` | `shape.props.text` | Text content |
| `node.data.fontSize` | `shape.props.fontSize` | Font size in pixels |
| `node.data.width` | `shape.props.w` | Width |
| `node.data.height` | `shape.props.h` | Height |

**Default Values:**
- w: 200, h: 100
- text: '' (empty string)
- fontSize: 14

### Table Node
| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `node.data.title` | `shape.props.title` | Table title |
| `node.data.headers` | `shape.props.headers` | Column headers array |
| `node.data.rows` | `shape.props.rows` | Data rows (2D array) |
| `node.data.totalRows` | `shape.props.totalRows` | Total row count |
| `node.data.width` | `shape.props.w` | Width |
| `node.data.height` | `shape.props.h` | Height |

**Default Values:**
- w: 600, h: 400
- title: '' (empty string)
- headers: []
- rows: []
- totalRows: 0

### Expression Node
| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `node.data.expression` | `shape.props.expression` | Math expression string |
| `node.data.result` | `shape.props.result` | Calculation result |
| `node.data.error` | `shape.props.error` | Error message |
| `node.data.width` | `shape.props.w` | Width |
| `node.data.height` | `shape.props.h` | Height |

**Default Values:**
- w: 400, h: 200
- expression: '' (empty string)
- result: '' (empty string)
- error: '' (empty string)

## TLDraw Shape → React Flow Node

### Base Mapping (All Types)
| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `shape.id` | `node.id` | Direct mapping |
| `shape.type` | `node.type` | Direct mapping |
| `shape.x` | `node.position.x` | Nested structure |
| `shape.y` | `node.position.y` | Nested structure |
| N/A | `node.draggable` | Always true |
| N/A | `node.selectable` | Always false (checkbox handles selection) |

### Chart Shape
| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `shape.props.w` | `node.data.width` | Width property |
| `shape.props.h` | `node.data.height` | Height property |
| `shape.props.chartData` | `node.data.figure.data` | Chart data array |
| `shape.props.chartLayout` | `node.data.figure.layout` | Chart layout object |
| All other props | `node.data.*` | Direct mapping to data object |

### TextBox Shape
| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `shape.props.text` | `node.data.text` | Text content |
| `shape.props.fontSize` | `node.data.fontSize` | Font size |
| `shape.props.w` | `node.data.width` | Width |
| `shape.props.h` | `node.data.height` | Height |

### Table Shape
| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `shape.props.title` | `node.data.title` | Table title |
| `shape.props.headers` | `node.data.headers` | Column headers |
| `shape.props.rows` | `node.data.rows` | Data rows |
| `shape.props.totalRows` | `node.data.totalRows` | Total row count |
| `shape.props.w` | `node.data.width` | Width |
| `shape.props.h` | `node.data.height` | Height |

### Expression Shape
| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `shape.props.expression` | `node.data.expression` | Math expression |
| `shape.props.result` | `node.data.result` | Result |
| `shape.props.error` | `node.data.error` | Error message |
| `shape.props.w` | `node.data.width` | Width |
| `shape.props.h` | `node.data.height` | Height |

## React Flow Edge → TLDraw Arrow

| React Flow | TLDraw | Notes |
|------------|--------|-------|
| `edge.id` | `arrow.id` | Direct mapping |
| N/A | `arrow.type` | Always 'arrow' |
| `edge.source` | `arrow.props.start.boundShapeId` | Source shape ID |
| `edge.target` | `arrow.props.end.boundShapeId` | Target shape ID |
| N/A | `arrow.props.start.type` | Always 'binding' |
| N/A | `arrow.props.end.type` | Always 'binding' |
| N/A | `arrow.props.start.normalizedAnchor` | {x: 0.5, y: 0.5} (center) |
| N/A | `arrow.props.end.normalizedAnchor` | {x: 0.5, y: 0.5} (center) |
| N/A | `arrow.props.color` | Always 'black' |
| N/A | `arrow.props.size` | Always 'm' |
| N/A | `arrow.props.arrowheadStart` | Always 'none' |
| N/A | `arrow.props.arrowheadEnd` | Always 'arrow' |
| N/A | `arrow.x` | Always 0 |
| N/A | `arrow.y` | Always 0 |
| N/A | `arrow.rotation` | Always 0 |
| N/A | `arrow.index` | Format: 'b0', 'b1', etc. |

## TLDraw Arrow → React Flow Edge

| TLDraw | React Flow | Notes |
|--------|------------|-------|
| `arrow.id` | `edge.id` | Direct mapping |
| `arrow.props.start.boundShapeId` | `edge.source` | Source node ID |
| `arrow.props.end.boundShapeId` | `edge.target` | Target node ID |
| N/A | `edge.type` | Always 'arrow' |
| N/A | `edge.animated` | Always false |

## Validation Rules

### Node Validation
A valid React Flow node must have:
- ✅ `id` (string, non-empty)
- ✅ `type` (string, non-empty)
- ✅ `position` (object)
  - ✅ `position.x` (number)
  - ✅ `position.y` (number)
- ✅ `data` (object, non-null)

### Shape Validation
A valid TLDraw shape must have:
- ✅ `id` (string, non-empty)
- ✅ `type` (string, non-empty)
- ✅ `x` (number)
- ✅ `y` (number)
- ✅ `props` (object, non-null)

### Edge Validation
A valid React Flow edge must have:
- ✅ `id` (string, non-empty)
- ✅ `source` (string, non-empty)
- ✅ `target` (string, non-empty)

### Arrow Validation
A valid TLDraw arrow must have:
- ✅ `id` (string, non-empty)
- ✅ `type` (must be 'arrow')
- ✅ `props.start.boundShapeId` (string, non-empty)
- ✅ `props.end.boundShapeId` (string, non-empty)

## Error Handling Strategy

### Graceful Degradation
1. **Missing data**: Use sensible defaults (see default values above)
2. **Invalid types**: Skip item and log warning to console
3. **Malformed objects**: Filter out and log error
4. **Null values**: Replace with appropriate defaults
5. **Circular references**: Detected via JSON serialization, log error

### Never Throw Errors
- Return empty arrays for invalid input
- Filter out invalid items instead of failing
- Log warnings for skipped items (console.warn)
- Continue processing valid items
- Always return valid structure (array)

### Logging Levels
- **Info**: Successful conversions (when logging enabled)
- **Warn**: Skipped items, unknown types, missing optional data
- **Error**: Critical failures, malformed data, validation failures

## Data Integrity Guarantees

### Must Preserve (Critical Data)
- ✅ All node/shape IDs (string identity)
- ✅ All positions (x, y coordinates)
- ✅ All chart data (figure.data, figure.layout)
- ✅ All dimensions and measures arrays
- ✅ Table headers and rows (complete data)
- ✅ Text content (complete strings)
- ✅ Expression data (expression, result, error)
- ✅ Selection state (boolean)
- ✅ AI insights (complete objects)

### May Transform (Structural Changes)
- ↔️ `width`/`height` ↔ `w`/`h` (renamed but preserved)
- ↔️ `position.x`/`position.y` ↔ `x`/`y` (flattened/nested)
- ↔️ `figure.data` ↔ `chartData` (renamed but preserved)
- ↔️ `figure.layout` ↔ `chartLayout` (renamed but preserved)

### Acceptable Losses (Non-Critical)
- ⚠️  `rotation` - Always 0 (shapes don't rotate)
- ⚠️  `index` - Regenerated during conversion (z-ordering)
- ⚠️  `draggable`/`selectable` - React Flow specific, not stored
- ⚠️  Arrow styling - Uses defaults (color, size, arrowheads)

## Testing Strategy

### Unit Tests
- ✅ Test each conversion function individually
- ✅ Test round-trip conversions (Node → Shape → Node)
- ✅ Test edge cases (null, undefined, missing fields)
- ✅ Test validation functions
- ✅ Test data integrity

### Integration Tests
- Convert real application data from App.jsx
- Verify all fields preserved after round-trip
- Test with multiple node types simultaneously
- Test with edges/arrows (connections)

### Manual Testing
1. Open browser console
2. Import test file: `import { runAllTests } from './stateConverter.test'`
3. Run: `runAllTests()`
4. Check all assertions pass
5. Verify no errors in console

## Known Limitations

### TLDraw Requirements
- **Index field**: Required for z-ordering (format: 'a0', 'a1', 'b0', etc.)
- **Arrow bindings**: Must use `boundShapeId` to reference shapes
- **No nested groups**: Current implementation doesn't support grouped shapes

### React Flow Compatibility
- **Edge format**: React Flow uses separate edges, TLDraw uses arrow shapes
- **Position structure**: React Flow uses nested `position.{x,y}`, TLDraw uses flat `x,y`
- **Selection**: React Flow has built-in selection, we use custom checkbox

### Data Structure Differences
| Feature | React Flow | TLDraw | Impact |
|---------|------------|--------|--------|
| Size | width/height | w/h | Renamed |
| Position | position.{x,y} | x,y | Flattened |
| Data | data.* | props.* | Renamed container |
| Connections | edges[] | arrow shapes | Different structure |

## Performance Considerations

### Conversion Performance
- **Small datasets** (<100 items): Negligible overhead (~1-2ms)
- **Medium datasets** (100-500 items): Acceptable (~5-15ms)
- **Large datasets** (>500 items): May need optimization (~50ms+)

### Optimization Strategies
1. **Batch conversions**: Convert all at once rather than individually
2. **Shallow copying**: Use object spread where possible
3. **Memoization**: Cache conversions for unchanged data
4. **Lazy conversion**: Only convert visible shapes initially

### Memory Management
- Use `deepClone()` sparingly (creates full copy)
- Filter out invalid items early to reduce processing
- Clear references after conversion to enable garbage collection

## Version Compatibility

### React Flow Version
- Tested with: react-flow-renderer@10.3.17
- Compatible with: 10.x

### TLDraw Version
- Tested with: @tldraw/tldraw@2.4.6
- Compatible with: 2.x

### Breaking Changes to Watch
- TLDraw shape prop schema changes
- React Flow node structure changes
- Arrow binding format changes

## Migration Guide

### From React Flow to TLDraw
```javascript
import { convertNodesToShapes, convertEdgesToArrows } from './stateConverter';

// Convert existing React Flow state
const shapes = convertNodesToShapes(nodes);
const arrows = convertEdgesToArrows(edges);
const allShapes = [...shapes, ...arrows];

// Use with TLDraw
editor.createShapes(allShapes);
```

### From TLDraw to React Flow
```javascript
import { convertShapesToNodes, convertArrowsToEdges } from './stateConverter';

// Get all shapes from TLDraw
const shapes = editor.getCurrentPageShapes();

// Convert to React Flow format
const nodes = convertShapesToNodes(shapes);
const edges = convertArrowsToEdges(shapes);

// Use with React Flow
setNodes(nodes);
setEdges(edges);
```

## Debugging Tips

### Enable Logging
```javascript
import { enableConversionLogging } from './conversionLogger';
enableConversionLogging();
```

### Check Validation
```javascript
import { validateNode, validateShape } from './stateConverter';

const nodeValidation = validateNode(myNode);
if (!nodeValidation.valid) {
  console.error('Invalid node:', nodeValidation.error);
}
```

### Compare Before/After
```javascript
console.log('Before:', originalNodes);
const shapes = convertNodesToShapes(originalNodes);
const convertedNodes = convertShapesToNodes(shapes);
console.log('After:', convertedNodes);
```

## Support Matrix

| Feature | Node→Shape | Shape→Node | Edge→Arrow | Arrow→Edge |
|---------|------------|------------|------------|------------|
| Chart | ✅ Full | ✅ Full | N/A | N/A |
| TextBox | ✅ Full | ✅ Full | N/A | N/A |
| Table | ✅ Full | ✅ Full | N/A | N/A |
| Expression | ✅ Full | ✅ Full | N/A | N/A |
| Connections | N/A | N/A | ✅ Full | ✅ Full |
| Validation | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Error Handling | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

✅ Full = Complete implementation with all features
⚠️ Partial = Basic implementation, may lack some features
❌ None = Not implemented

## Changelog

### November 1, 2025 - Phase 5 Initial Release
- Implemented complete bidirectional conversion
- Added validation for all data types
- Created comprehensive test suite
- Added detailed documentation
- Error handling with graceful degradation
- Logging utilities for debugging

## Future Enhancements

### Potential Improvements
1. **Performance**: Optimize for large datasets (>1000 items)
2. **Partial updates**: Convert only changed items
3. **Type safety**: Add TypeScript definitions
4. **Schema validation**: Use JSON Schema for validation
5. **Compression**: Compress large data during conversion
6. **Versioning**: Handle multiple format versions

### Feature Requests
- Support for grouped shapes
- Custom arrow styling preservation
- Animation state preservation
- Layer management
- Shape metadata preservation

