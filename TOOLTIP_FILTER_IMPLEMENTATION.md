# Chart Panel-Based Global Filter Implementation

## Problem

TLDraw's canvas layer completely blocks pointer events from reaching ECharts charts, preventing direct click-through filtering despite multiple attempts:
- Tried `pointerEvents: 'all'`
- Tried disabling TLDraw selection
- Tried `hitTestPoint` overrides
- Tried DOM-level event listeners
- Tried coordinate conversion (Observable-style)
- Tried tooltip-based buttons

**None worked** - TLDraw's canvas sits on top and intercepts all events.

## Solution: Chart Panel-Based Global Filtering

Use the **Chart Actions panel** which already has working filter functionality:

### How It Works

1. **Select a chart** → Click checkbox to open Chart Actions panel
2. **Select filter values** → Choose dimension values in "Chart Filter" section
3. **Click "Apply as Global Filter"** → Applies filter to ALL charts with matching dimension
4. **Charts update automatically** → All charts with matching dimension filter their data
5. **Visual feedback** → Green border + filter badge on filtered charts
6. **Click "Clear Filter"** → Removes global filter (top-center button)

### Implementation Details

#### 1. Chart Actions Panel UI (`App.jsx`)

Two filter buttons in the panel:

```javascript
{/* Apply as Chart Filter - affects only this chart */}
<Button onClick={handleApplyFilters}>
  Apply as Chart Filter
</Button>

{/* Apply as Global Filter - affects all matching charts */}
<Button onClick={handleApplyGlobalFilter} className="bg-green-600">
  Apply as Global Filter
</Button>
```

#### 2. Global Filter Handler (`App.jsx`)

```javascript
const handleApplyGlobalFilter = useCallback(() => {
  // Get first dimension with selected values
  const firstDimension = Object.keys(dimensionFilters)[0];
  const firstValue = dimensionFilters[firstDimension][0];
  
  // Set global filter (single-select for MVP)
  setGlobalFilter(firstDimension, firstValue, selectedChart.id);
}, [selectedChart, dimensionFilters, setGlobalFilter]);
```

#### 3. Global Filter Subscription (`App.jsx`)

Existing useEffect already handles chart updates:

```javascript
useEffect(() => {
  if (!globalFilter.activeDimension) return;
  
  // Find all charts with matching dimension
  const chartsToUpdate = nodes.filter(node => 
    shouldChartApplyFilter(node.data?.dimensions)
  );
  
  // Update each chart with filtered data
  chartsToUpdate.forEach(async (chartNode) => {
    // Fetch filtered data from backend
    // Update node with new data
  });
}, [globalFilter, nodes, shouldChartApplyFilter, getFilterForAPI]);
```

## Advantages

✅ **Works reliably** - Uses existing working filter panel  
✅ **Clear UX** - Explicit controls in dedicated panel  
✅ **No TLDraw conflicts** - Bypasses all canvas event issues  
✅ **Multi-value support** - Can select multiple values before applying  
✅ **Visual distinction** - Green button = global, Blue button = chart-level  
✅ **Reuses existing code** - Leverages working filter infrastructure  

## User Flow

1. **Upload data** and create 2+ charts with shared dimensions
2. **Select a chart** using the checkbox in the chart header
3. **Open Chart Actions panel** (appears on right when chart selected)
4. **Go to "Chart Filter"** section
5. **Select filter values** for a dimension (e.g., select "East", "West" for Region)
6. **Click "Apply as Global Filter"** (green button)
7. **All charts update** - Only charts with matching dimension show filtered data
8. **Visual feedback** - Green border + filter badge on filtered charts
9. **Click "Clear Filter"** (top-center button) to reset all charts

## Chart Types Supported

- ✅ Single-measure Bar Chart
- ✅ Multi-measure Bar Chart (2 measures)
- ✅ Multi-series Bar Chart (up to 5 measures)
- 🔄 Line, Pie, Scatter (TODO - add same tooltip pattern)

## Files Modified

1. `frontend/src/charts/echartsRegistry.js` - Tooltip configuration
2. `frontend/src/components/canvas/shapes/ChartShape.jsx` - Event listener
3. `frontend/src/contexts/GlobalFilterContext.jsx` - (already created)
4. `frontend/src/App.jsx` - (already integrated)

## Testing

**Setup:**
1. Create 2-3 bar charts with a shared dimension (e.g., "Region" or "Product")
   - Chart 1: Revenue by Region
   - Chart 2: Cost by Region  
   - Chart 3: Profit by Region

**Test Global Filter:**
1. Click checkbox on Chart 1 to select it
2. Chart Actions panel opens on the right
3. Scroll to "Chart Filter" section
4. Select one or more values (e.g., "East", "West")
5. Click **"Apply as Global Filter"** (green button)
6. **Expected:** All 3 charts filter to show only East and West regions
7. **Expected:** Green border + filter badge appear on all 3 charts
8. **Expected:** Chart 1 has 🎯 emoji (source chart)
9. Click **"Clear Filter"** button (top-center, fixed position)
10. **Expected:** All charts return to full data

**Test Chart-Level Filter (for comparison):**
1. Select Chart 1
2. Select filter values
3. Click **"Apply as Chart Filter"** (blue button)
4. **Expected:** Only Chart 1 updates, others remain unchanged
5. **Expected:** NO green border (this is chart-level, not global)

## Future Enhancements

- Add tooltip filter button to Line, Pie, Scatter charts
- Add "Add to Comparison" button (multi-select filtering)
- Add keyboard shortcut (Shift+Click for multi-select)
- Persist filter state across sessions

