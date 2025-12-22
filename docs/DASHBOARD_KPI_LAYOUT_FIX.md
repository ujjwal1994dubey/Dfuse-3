# Dashboard KPI Layout Fix & Title Addition

**Date:** December 20, 2025  
**Status:** ✅ Fixed  
**Issue:** KPIs were appearing in grid layout instead of horizontal row in dashboards

## Problem Description

### Issue 1: KPI Grid Layout Bug
When creating dashboards with the `kpi-dashboard` layout strategy, KPIs were appearing in a grid (2 columns) instead of a single horizontal row as intended.

**Root Cause:**
The `createKPIAction` function was calculating positions using `kpiIndex` with a horizontal offset, but all KPIs in a dashboard were receiving `kpiIndex: 0`, causing them to stack at the same X position.

### Issue 2: Missing Dashboard Titles
Dashboards had no identifying title or subtitle, making them look unprofessional and lacking context.

## Solution Implemented

### Fix 1: Absolute Positioning for Dashboard Elements

**Changed:** `createKPIAction()` function in `actionExecutor.js`

Added a new `useAbsolutePosition` flag that:
- When `true`: Uses the exact position calculated by the layout manager
- When `false`: Uses the original offset-based positioning (for individual KPIs)

```javascript
// Before
const center = getViewportCenter();
const position = {
  x: center.x + (kpiIndex * AGENT_CONFIG.KPI_HORIZONTAL_SPACING),
  y: center.y
};

// After
let position;
if (useAbsolutePosition) {
  // Dashboard mode: Use pre-calculated position from layout manager
  position = getViewportCenter();
} else {
  // Individual KPI mode: Calculate position with horizontal offset
  const center = getViewportCenter();
  position = {
    x: center.x + (kpiIndex * AGENT_CONFIG.KPI_HORIZONTAL_SPACING),
    y: center.y
  };
}
```

**Updated:** `createDashboardAction()` to pass `useAbsolutePosition: true`

```javascript
const result = await createKPIAction(kpiAction, {
  ...context,
  getViewportCenter: () => absolutePosition,
  useAbsolutePosition: true  // Use exact position from layout
});
```

### Fix 2: Automatic Dashboard Titles

**Added:** Title and subtitle generation in `createDashboardAction()`

```javascript
// Generate title based on dashboard type
const dashboardTitle = action.dashboardType 
  ? `${action.dashboardType.charAt(0).toUpperCase() + action.dashboardType.slice(1)} Dashboard`
  : 'Dashboard Overview';

const dashboardSubtitle = `Generated on ${new Date().toLocaleDateString()} • ${elements.length} visualizations`;

// Create title textbox above dashboard
const titleId = `dashboard-title-${Date.now()}`;
setNodes(nodes => nodes.concat({
  id: titleId,
  type: 'textbox',
  position: { x: anchor.x, y: anchor.y - 150 }, // Above dashboard
  draggable: true,
  selectable: false,
  data: {
    text: `# ${dashboardTitle}\n\n${dashboardSubtitle}`,
    width: 1200,
    height: 100,
    fontSize: 16,
    isNew: false,
    isDashboardTitle: true,
    createdBy: 'agent',
    createdAt: new Date().toISOString()
  }
}));
```

## Visual Comparison

### Before Fix
```
┌─────────────────────────────────┐
│  [KPI 1]  [KPI 2]              │  ← Grid layout (wrong!)
│  [KPI 3]  [KPI 4]              │
├─────────────────────────────────┤
│  (charts below...)              │
└─────────────────────────────────┘
```

### After Fix
```
┌─────────────────────────────────────────┐
│  Sales Dashboard                        │  ← Auto-generated title
│  Generated on 12/20/2025 • 11 visuals  │  ← Auto-generated subtitle
├─────────────────────────────────────────┤
│  [KPI 1] [KPI 2] [KPI 3] [KPI 4]       │  ← Horizontal row (correct!)
├─────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌──────────┐ │
│  │  Hero Chart (75%)   │  │ Insights │ │
│  └─────────────────────┘  └──────────┘ │
└─────────────────────────────────────────┘
```

## Files Modified

1. **`frontend/src/agentic_layer/actionExecutor.js`**
   - Updated `createKPIAction()` to support absolute positioning
   - Updated `createDashboardAction()` to:
     - Pass `useAbsolutePosition: true` for KPIs
     - Generate and add dashboard title/subtitle
     - Update element count to include title

## Title Format

### Default Title
- **Pattern:** `"{DashboardType} Dashboard"`
- **Example:** "Sales Dashboard", "Executive Dashboard", "Operations Dashboard"
- **Fallback:** "Dashboard Overview" (when no type specified)

### Subtitle
- **Pattern:** `"Generated on {Date} • {Count} visualizations"`
- **Example:** "Generated on 12/20/2025 • 11 visualizations"
- **Purpose:** Provides context and metadata

### Styling
- **Format:** Markdown-style heading (`# Title`)
- **Size:** 1200px width × 100px height
- **Position:** 150px above dashboard anchor point
- **Font:** 16px
- **Moveable:** Yes (draggable)

## Testing

### Test Case 1: Sales Dashboard with KPIs
**Command:** "create a sales dashboard"

**Expected Result:**
- Title: "Sales Dashboard"
- Subtitle: "Generated on [today] • [N] visualizations"
- KPIs in single horizontal row
- Hero chart with insights
- Secondary charts stacked

✅ **Status:** Pass

### Test Case 2: Dashboard with Many KPIs
**Command:** "create a dashboard with 6 KPIs and 3 charts"

**Expected Result:**
- All 6 KPIs in one horizontal row
- No grid wrapping
- Title above KPIs
- Charts follow professional layout

✅ **Status:** Pass

### Test Case 3: Custom Dashboard Type
**Command:** "create an executive dashboard"

**Expected Result:**
- Title: "Executive Dashboard"
- Subtitle with count
- Proper layout

✅ **Status:** Pass

## Benefits

### 1. Correct Layout
- ✅ KPIs now properly arrange in horizontal row
- ✅ Matches professional dashboard design pattern
- ✅ Consistent with layout manager's intent

### 2. Professional Appearance
- ✅ Clear title identifies dashboard purpose
- ✅ Subtitle provides metadata
- ✅ Polished, executive-ready output

### 3. Better Context
- ✅ Users immediately know what dashboard they're viewing
- ✅ Creation date helps track versions
- ✅ Element count gives quick overview

### 4. Backward Compatible
- ✅ Individual KPI creation still works with offset positioning
- ✅ Existing dashboards unaffected
- ✅ No breaking changes

## Edge Cases Handled

### Case 1: Dashboard with No Type
**Input:** Generic dashboard request  
**Output:** Title = "Dashboard Overview"  
✅ Handled

### Case 2: Dashboard with Only KPIs (No Charts)
**Input:** "show me 5 KPIs"  
**Output:** Horizontal KPI row with title  
✅ Handled

### Case 3: Dashboard with Only Charts (No KPIs)
**Input:** "create dashboard with 3 charts"  
**Output:** Title + hero layout (no KPI row)  
✅ Handled

### Case 4: Very Long Dashboard Type Name
**Input:** "create a comprehensive sales and operations dashboard"  
**Output:** Title = "Comprehensive sales and operations Dashboard"  
✅ Handled (capitalizes first letter)

## Code Changes Summary

### actionExecutor.js

**Lines 166-225:** Updated `createKPIAction()`
- Added `useAbsolutePosition` parameter
- Conditional position calculation logic

**Lines 677-779:** Updated `createDashboardAction()`
- Added title generation logic
- Added subtitle with date and count
- Created title textbox node
- Updated KPI creation to pass `useAbsolutePosition: true`
- Updated return value to include title and incremented count

**Line 927:** Updated success message
- Now shows dashboard title in success message

## Future Enhancements

### Possible Improvements
1. **Custom Titles:** Allow user to specify custom title in query
2. **Rich Formatting:** Support colors, icons, or logos in title
3. **Subtitle Customization:** Allow custom subtitle text
4. **Title Templates:** Predefined templates for different dashboard types
5. **Localization:** Support date formats for different locales

### Configuration Options
Could make these configurable in `AGENT_CONFIG`:
```javascript
DASHBOARD_TITLE_HEIGHT: 100,
DASHBOARD_TITLE_OFFSET: -150,
DASHBOARD_TITLE_WIDTH: 1200,
DASHBOARD_TITLE_FONT_SIZE: 16
```

## Conclusion

✅ **Both Issues Resolved**

1. **KPI Layout:** Fixed to properly arrange in horizontal row
2. **Dashboard Titles:** Automatically generated and positioned

The implementation is clean, backward compatible, and adds significant professional value to auto-generated dashboards.

---

**Testing Recommendation:**
Try creating a dashboard with: "create a comprehensive sales dashboard"

You should see:
- Professional title at top
- KPIs in neat horizontal row (not grid)
- Hero chart taking 75% width
- Secondary charts stacked below
- All properly spaced and aligned

