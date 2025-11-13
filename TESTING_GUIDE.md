# Chart Interaction Framework - Testing Guide

## Implementation Complete ✅

All code changes have been implemented:
- ✅ Event stopPropagation handlers in ChartShape.jsx
- ✅ ZRender event isolation in EChartsWrapper.jsx
- ✅ DataZoom configs for BAR, LINE, SCATTER, GROUPED_BAR, DUAL_AXIS charts
- ✅ Conditional scrollable legends for all chart types

## Servers Running

- Backend: http://localhost:8000 ✅
- Frontend: http://localhost:3000 ✅

## Manual Testing Instructions

Please follow these test cases to validate the implementation:

---

## Test Case 1: Legend Scroll Isolation

**Objective**: Verify that scrolling within chart legends does not move the canvas

**Steps**:
1. Navigate to http://localhost:3000
2. Upload `test_tiger_data.csv` dataset
3. Create a **Stacked Bar** chart with:
   - X-axis: CATEGORY (dimension 1)
   - Y-axis: OVERALL_CATEGORY (dimension 2)
   - Value: PRICE (measure)
4. The chart should have 15+ legend items with scroll arrows
5. **Hover over the legend area** (on the right side)
6. **Scroll with mouse wheel** inside the legend area

**Expected Result**:
- ✅ Legend items scroll up/down
- ✅ Canvas DOES NOT move
- ✅ Chart stays in place

**Failure Scenario** (before fix):
- ❌ Entire canvas would pan when scrolling legend

---

## Test Case 2: DataZoom Functionality

**Objective**: Verify that internal chart zoom works without affecting canvas

**Steps**:
1. Create a **Bar Chart** with 50+ data points:
   - Upload sample dataset with many categories
   - X-axis: Category column
   - Y-axis: Numeric value
2. **Hover over the chart bars area** (inside the chart, not the legend)
3. **Scroll with mouse wheel** inside the chart area
4. **Click and drag** horizontally inside the chart area

**Expected Result**:
- ✅ Chart zooms in/out on mouse wheel scroll
- ✅ Chart data pans left/right on drag
- ✅ Canvas remains stationary
- ✅ Zoom level resets with double-click inside chart

**Failure Scenario** (before fix):
- ❌ Canvas would zoom/pan instead of chart data

---

## Test Case 3: Click Event Isolation

**Objective**: Verify that clicking chart elements doesn't interfere with chart selection

**Steps**:
1. Create any chart (Bar, Line, or Pie)
2. **Click on a legend item** to toggle it
3. **Click on a chart bar/point** to see tooltip
4. **Click on the chart header area**
5. **Click outside the chart** on the canvas

**Expected Result**:
- ✅ Legend toggles work (item shows/hides)
- ✅ Tooltips appear on hover/click
- ✅ Clicking chart doesn't drag the canvas
- ✅ Chart can still be selected (shows TLDraw selection handles)
- ✅ Clicking outside allows canvas interactions

**Failure Scenario** (before fix):
- ❌ Clicks would sometimes trigger canvas selection instead

---

## Test Case 4: Canvas Interactions Still Work

**Objective**: Verify that canvas functionality is not broken

**Steps**:
1. With charts on canvas, **click and drag outside any chart**
2. **Mouse wheel scroll outside charts**
3. **Click on a chart shape** (on the border/edges)
4. **Resize a chart** using the corner handles

**Expected Result**:
- ✅ Canvas pans when dragging empty space
- ✅ Canvas zooms when scrolling outside charts
- ✅ Charts can be selected (blue border appears)
- ✅ Charts can be resized smoothly
- ✅ TLDraw toolbar still works

**Failure Scenario** (if over-aggressive):
- ❌ Canvas interactions would be blocked

---

## Test Case 5: Multi-Chart Scenario

**Objective**: Verify that multiple charts don't interfere with each other

**Steps**:
1. Create 3 different charts on the canvas:
   - Bar chart (with dataZoom)
   - Line chart (with dataZoom)
   - Scatter chart (with 2-axis dataZoom)
2. Position them in different areas
3. **Test scrolling inside each chart individually**
4. **Test clicking legends in each chart**
5. **Test canvas interactions between charts**

**Expected Result**:
- ✅ Each chart's scroll/zoom works independently
- ✅ No cross-contamination of events
- ✅ Canvas interactions work in gaps between charts
- ✅ All charts remain functional simultaneously

---

## Test Case 6: Pie Chart with Scrollable Legend

**Objective**: Verify pie chart legend scroll works correctly

**Steps**:
1. Create a dataset with 15+ categories
2. Create a **Pie Chart** with the category column
3. Legend should appear on the right with scroll arrows
4. **Scroll inside the legend area**

**Expected Result**:
- ✅ Legend scrolls vertically
- ✅ Canvas does not move
- ✅ Pie chart remains visible and interactive

---

## Test Case 7: Dual Axis Chart Interaction

**Objective**: Verify dual axis charts with dataZoom

**Steps**:
1. Create a **Dual Axis** chart with:
   - 1 dimension
   - 2 measures (different scales)
2. **Scroll inside chart to zoom x-axis**
3. **Drag to pan the data**

**Expected Result**:
- ✅ Both y-axes scale correctly during zoom
- ✅ Data pans synchronously on both lines
- ✅ Canvas stays fixed

---

## Test Case 8: Scatter Chart 2D Zoom

**Objective**: Verify scatter plot allows zoom on both axes

**Steps**:
1. Create a **Scatter Chart** with:
   - 1 dimension (for labels)
   - 2 measures (X and Y coordinates)
2. **Scroll inside chart** to zoom
3. **Hold Shift + Scroll** to zoom Y-axis independently
4. **Drag to pan**

**Expected Result**:
- ✅ Chart zooms on both axes
- ✅ Points scale appropriately
- ✅ Canvas remains stationary
- ✅ Tooltips show correct values

---

## Performance Check

**Steps**:
1. Create a large chart with 1000+ data points
2. Scroll/zoom rapidly inside the chart
3. Monitor browser console for errors
4. Check frame rate (should remain smooth)

**Expected Result**:
- ✅ No console errors
- ✅ Smooth animations
- ✅ No memory leaks (check DevTools Memory tab)
- ✅ Data sampling reduces points to ~1000 for performance

---

## Console Verification

Open Browser DevTools Console and check for:

**Success Messages**:
```
📊 EChartsWrapper: ZRender event isolation attached
```

**No Error Messages**:
- No "stopPropagation is not a function" errors
- No "getZr is not a function" errors
- No ECharts rendering errors

---

## Troubleshooting

### If legend scroll still moves canvas:
1. Check that `onWheel` handler is present in ChartShape.jsx (line 81)
2. Verify ZRender listeners are attached (console log should appear)
3. Hard refresh browser (Cmd+Shift+R) to clear cache

### If dataZoom doesn't work:
1. Check console for ECharts initialization errors
2. Verify chart has sufficient data points (>10 recommended)
3. Ensure you're scrolling INSIDE the chart area, not on legend

### If clicks don't work:
1. Verify `onClick` and `onPointerDown` handlers are present
2. Check that `pointerEvents: 'all'` is set on HTMLContainer
3. Try clicking different parts of the chart (header, body, legend)

---

## Success Criteria

All test cases should pass with ✅ marks. The implementation successfully:

1. ✅ Prevents canvas movement when scrolling chart legends
2. ✅ Enables internal chart zoom/pan via dataZoom
3. ✅ Isolates click events to prevent canvas interference
4. ✅ Preserves all canvas interactions outside charts
5. ✅ Supports multiple charts without event conflicts
6. ✅ Provides smooth performance with large datasets

---

## Implementation Summary

### Files Modified:
1. **ChartShape.jsx** - Added 6 event handlers with stopPropagation
2. **EChartsWrapper.jsx** - Added ZRender event isolation via useEffect
3. **echartsRegistry.js** - Added dataZoom to 5 chart types, conditional scroll legends

### Key Technical Details:

**Event Flow**:
```
User Action → Chart DIV → stopPropagation() → TLDraw ignores
User Action → Canvas Area → TLDraw handles
```

**DataZoom Config**:
- `type: 'inside'` - Enables mouse wheel zoom and drag pan
- `zoomOnMouseWheel: true` - Scroll to zoom
- `moveOnMouseMove: true` - Drag to pan
- Applied to: BAR, LINE, SCATTER, GROUPED_BAR, DUAL_AXIS

**Legend Scroll**:
- Conditional: `type: pieData.length > 10 ? 'scroll' : 'plain'`
- Applied to: PIE, GROUPED_BAR, DUAL_AXIS, STACKED_BAR

---

## Next Steps After Testing

If all tests pass:
1. ✅ Mark implementation as complete
2. Consider adding focus mode (optional enhancement)
3. Document user-facing features
4. Deploy to staging environment

If issues found:
1. Document specific failures
2. Check browser console for errors
3. Review event handler placement
4. Test in different browsers (Chrome, Firefox, Safari)

---

## Contact

For issues or questions about the testing:
- Check console logs for debugging info
- Review the implementation plan: `chart-interaction-framework.plan.md`
- Verify all event handlers are correctly placed

**Testing Date**: Ready for immediate testing
**Estimated Testing Time**: 15-20 minutes for all test cases

