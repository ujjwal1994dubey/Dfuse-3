# Chart Type Switching Fix

## Problem Identified

The chart type switching was not working when using TLDraw because of a logic error in determining which chart registry to use.

### Root Cause

When using **TLDraw**, charts are rendered by the `ChartShape` component, which uses `EChartsWrapper` to display charts. This means TLDraw charts **MUST** have ECharts-formatted data, regardless of the `USE_ECHARTS` environment variable.

However, the `updateChartType` function and `ChartActionsPanel` were only using the ECharts registry when `USE_ECHARTS === true`. This meant:

1. If you set `REACT_APP_USE_TLDRAW=true` but didn't set `REACT_APP_USE_ECHARTS=true`
2. Chart type changes would try to use the Plotly registry
3. But TLDraw's ChartShape expects ECharts format
4. Result: Chart type changes didn't work

## Solution Applied

### 1. Updated `updateChartType` Function (Line 5159)

**Before:**
```javascript
if (USE_ECHARTS && table && dimensions && measures) {
  // Use ECharts registry
}
```

**After:**
```javascript
// When using TLDraw, we MUST use ECharts because ChartShape renders with EChartsWrapper
const shouldUseECharts = USE_ECHARTS || USE_TLDRAW;

if (shouldUseECharts && table && dimensions && measures) {
  // Use ECharts registry
}
```

### 2. Updated `ChartActionsPanel` Logic (Line 3464)

**Before:**
```javascript
const supportedTypes = selectedChart 
  ? (USE_ECHARTS ? getEChartsSupportedTypes(dims, meas) : getSupportedChartTypes(dims, meas))
  : [];
```

**After:**
```javascript
// When using TLDraw, we must use ECharts registry because charts render with EChartsWrapper
const shouldUseECharts = USE_ECHARTS || USE_TLDRAW;
const supportedTypes = selectedChart 
  ? (shouldUseECharts ? getEChartsSupportedTypes(dims, meas) : getSupportedChartTypes(dims, meas))
  : [];
```

### 3. Added Comprehensive Debugging

Added console logging to track:
- Whether `updateChartType` is called
- Node lookup success/failure
- Available node data (dimensions, measures, table)
- Which chart library is being used
- Chart config lookup results
- Generated ECharts options

## How to Test

1. **Ensure Environment Variables are Set:**
   ```bash
   REACT_APP_USE_TLDRAW=true
   ```
   Note: `REACT_APP_USE_ECHARTS=true` is optional now - TLDraw automatically uses ECharts

2. **Create a Test Chart:**
   - Upload sample CSV data
   - Create a chart with 1 dimension + 1 measure (e.g., Product × Sales)
   - Chart should display as a Bar chart by default

3. **Test Chart Type Conversion:**
   - Select the chart (click on it)
   - Chart Actions Panel should open on the left
   - You should see 3 chart type options: Bar, Pie, Line
   - Click "Pie" - chart should convert to pie chart
   - Click "Line" - chart should convert to line chart
   - Click "Bar" - chart should convert back to bar chart

4. **Verify Console Logs:**
   You should see logs like:
   ```
   🔄 updateChartType called: {nodeId: "...", newChartType: "pie", USE_ECHARTS: false, USE_TLDRAW: true}
   📊 Current nodes: 1
   🎯 Target node found: YES ...
   📦 Node data: {hasDimensions: true, hasMeasures: true, hasTable: true, ...}
   🔍 Checking chart library: {USE_ECHARTS: false, USE_TLDRAW: true, shouldUseECharts: true, ...}
   ✅ Using ECharts registry
   📋 Chart config found: true for type: PIE
   ✅ Chart type is supported. Dims: 1 Measures: 1
   📊 Generated ECharts option: {...}
   ✅ Chart type changed to pie using ECharts
   ```

## Expected Behavior

### Group 1 (1 Dimension + 1 Measure)
- **Compatible Types:** Bar ↔ Pie ↔ Line
- All conversions should work smoothly
- Data should be preserved (same categories and values)

### Group 2 (1 Dimension + 2 Measures)
- **Compatible Types:** Scatter ↔ Grouped Bar ↔ Dual Axis
- Create chart with 2 measures to test this group

### Group 3 (2 Dimensions + 1 Measure)
- **Compatible Types:** Stacked Bar ↔ Bubble
- Create chart with 2 dimensions to test this group

## Troubleshooting

If chart type switching still doesn't work:

1. **Check Console Logs:**
   - Look for the debug logs starting with 🔄, 📊, 🎯, 📦, 🔍
   - Check if "Target node found: YES" appears
   - Check if "shouldUseECharts: true" appears
   - Check for any error messages

2. **Verify Node Data:**
   - The node must have `dimensions`, `measures`, and `table` data
   - Check console log "📦 Node data" to verify this

3. **Check Chart Type Support:**
   - Make sure you're trying to convert to a compatible type
   - Bar chart (1D+1M) can only convert to Pie or Line
   - Check "Chart config found: true" in logs

4. **Verify Environment:**
   - Restart the dev server after changing .env variables
   - Check that TLDraw canvas is actually being used (not React Flow)

## Additional Notes

### Why This Fix Works

The fix recognizes that **rendering library** and **canvas library** are separate concerns:

- **Canvas Library:** TLDraw vs React Flow (controlled by `USE_TLDRAW`)
- **Chart Library:** ECharts vs Plotly (controlled by `USE_ECHARTS`)

The key insight: **TLDraw always requires ECharts** because:
1. TLDraw uses `ChartShape` component
2. `ChartShape` renders charts with `EChartsWrapper`
3. `EChartsWrapper` expects ECharts options, not Plotly figures

Therefore:
- If `USE_TLDRAW=true` → Must use ECharts (regardless of `USE_ECHARTS`)
- If `USE_TLDRAW=false` and `USE_ECHARTS=true` → Use ECharts with React Flow
- If both false → Use Plotly with React Flow

### Performance

Chart type conversion is instant because:
- No API calls required
- Data is already in memory (dimensions, measures, table)
- Only the visualization format changes
- React efficiently updates only what changed

## Next Steps

1. **Test all compatibility groups** with real data
2. **Remove debug logs** once confirmed working (optional - they're helpful for debugging)
3. **Update user documentation** to explain chart type compatibility
4. **Consider adding visual indicators** to show which types are compatible

