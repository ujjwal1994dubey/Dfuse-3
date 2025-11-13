# Complete Testing Checklist - Phase 7

## Test Environment Setup

### Prerequisites
- [ ] Backend server running (`uvicorn app:app --reload`)
- [ ] Frontend development server ready
- [ ] Test datasets available (CSV files)
- [ ] Browser DevTools open (for console monitoring)
- [ ] Clean browser cache

### Configuration Files

Create `frontend/.env.local` with:
```bash
REACT_APP_USE_ECHARTS=true
REACT_APP_USE_TLDRAW=false  # Change this for different tests
REACT_APP_API_URL=http://localhost:8000
```

## Configuration Testing Matrix

Test all features with each configuration:

### Config 1: React Flow + Plotly (Original Baseline)
```bash
REACT_APP_USE_ECHARTS=false
REACT_APP_USE_TLDRAW=false
```

### Config 2: React Flow + ECharts (Phase 1)
```bash
REACT_APP_USE_ECHARTS=true
REACT_APP_USE_TLDRAW=false
```

### Config 3: TLDraw + ECharts (Phase 7 - Target)
```bash
REACT_APP_USE_ECHARTS=true
REACT_APP_USE_TLDRAW=true
```

## Feature-by-Feature Testing

For EACH configuration above, verify ALL features below:

### 1. Dataset Management

#### Upload Dataset
- [ ] Click "Upload CSV" button
- [ ] Select test CSV file
- [ ] File uploads successfully
- [ ] Dataset info displayed (rows, columns)
- [ ] No console errors
- [ ] Upload button closes

#### View Dataset Analysis
- [ ] Dataset analysis panel visible
- [ ] Column types correct (dimensions/measures)
- [ ] Sample values displayed
- [ ] Statistics shown (for measures)
- [ ] No console errors

#### Edit Metadata
- [ ] Click edit metadata button
- [ ] Can edit column descriptions
- [ ] Can change column types
- [ ] Changes save successfully
- [ ] UI updates after save
- [ ] No console errors

### 2. Chart Creation - Manual

#### Bar Chart
- [ ] Select dimension
- [ ] Select measure
- [ ] Select "Bar" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Chart renders correctly
- [ ] Data values accurate
- [ ] No console errors

#### Pie Chart
- [ ] Select dimension
- [ ] Select measure
- [ ] Select "Pie" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Chart renders correctly
- [ ] Percentages accurate
- [ ] Legend visible
- [ ] No console errors

#### Line Chart
- [ ] Select dimension (with time/order)
- [ ] Select measure
- [ ] Select "Line" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Line smooth and continuous
- [ ] Data points accurate
- [ ] No console errors

#### Scatter Plot
- [ ] Select X-axis measure
- [ ] Select Y-axis measure
- [ ] Select "Scatter" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Points distributed correctly
- [ ] Axes labeled
- [ ] No console errors

#### Heatmap
- [ ] Select 2 dimensions
- [ ] Select 1 measure
- [ ] Select "Heatmap" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Colors represent values correctly
- [ ] Legend visible
- [ ] No console errors

#### Histogram
- [ ] Select measure
- [ ] Select "Histogram" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Bins calculated correctly
- [ ] Distribution visible
- [ ] No console errors

#### Box Plot
- [ ] Select dimension
- [ ] Select measure
- [ ] Select "Box" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Quartiles visible
- [ ] Outliers shown
- [ ] No console errors

#### Violin Plot
- [ ] Select dimension
- [ ] Select measure
- [ ] Select "Violin" chart type
- [ ] Click "Visualize"
- [ ] Chart appears on canvas
- [ ] Distribution shape visible
- [ ] No console errors

### 3. Chart Creation - AI Assisted

#### AI Suggest Charts
- [ ] Enter goal/question in text box
- [ ] Click "AI Suggest Charts"
- [ ] API key configured
- [ ] Suggestions load (with spinner)
- [ ] 3-5 suggestions shown
- [ ] Each has description
- [ ] Each has rationale
- [ ] No console errors

#### Generate from Suggestion
- [ ] Click "Generate" on a suggestion
- [ ] Chart appears on canvas
- [ ] Chart matches suggestion type
- [ ] Data is correct
- [ ] Title is set
- [ ] No console errors

#### Smart Visualize
- [ ] Select dimension and measure
- [ ] Click "Smart Visualize" (AI icon)
- [ ] API key configured
- [ ] Chart type auto-selected
- [ ] Chart appears on canvas
- [ ] Appropriate chart type chosen
- [ ] No console errors

### 4. Chart Interactions

#### Select Chart (Checkbox)
- [ ] Hover over chart
- [ ] Checkbox appears in top-right
- [ ] Click checkbox
- [ ] Chart becomes selected (visual feedback)
- [ ] Chart Actions panel opens
- [ ] Can unselect by clicking again
- [ ] No console errors

#### Drag Chart
- [ ] Click and hold chart
- [ ] Drag to new position
- [ ] Chart moves smoothly
- [ ] Chart updates position
- [ ] Other charts don't move
- [ ] No console errors

**Performance Check**:
- [ ] Drag latency < 100ms (React Flow)
- [ ] Drag latency < 30ms (TLDraw)

#### Resize Chart (if supported)
- [ ] Grab chart corner/edge
- [ ] Drag to resize
- [ ] Chart resizes smoothly
- [ ] Content scales appropriately
- [ ] No console errors

#### Delete Chart
- [ ] Select chart
- [ ] Press Delete key OR
- [ ] Click delete button
- [ ] Chart removed from canvas
- [ ] No console errors

### 5. Chart Actions Panel

#### Change Chart Type
- [ ] Select a chart
- [ ] Actions panel opens
- [ ] See available chart types
- [ ] Click different type
- [ ] Chart updates to new type
- [ ] Data preserved
- [ ] No console errors

#### Change Aggregation
- [ ] Select a chart (with dimensions)
- [ ] Actions panel opens
- [ ] See aggregation options (sum, avg, min, max, count)
- [ ] Click different aggregation
- [ ] Chart updates with new calculation
- [ ] Values change appropriately
- [ ] No console errors

#### Generate AI Insights
- [ ] Select a chart
- [ ] Actions panel opens
- [ ] Click "Get AI Insights"
- [ ] API key configured
- [ ] Loading spinner appears
- [ ] Insights generated (3-5 points)
- [ ] Insights displayed
- [ ] No console errors

#### Query Chart with AI
- [ ] Select a chart
- [ ] Actions panel opens
- [ ] Enter question in text box
- [ ] Click "Query"
- [ ] API key configured
- [ ] Loading spinner appears
- [ ] Answer displayed
- [ ] Answer is relevant
- [ ] No console errors

#### Show Data Table
- [ ] Select a chart
- [ ] Actions panel opens
- [ ] Click "Show Table"
- [ ] Table node appears on canvas
- [ ] Table shows chart data
- [ ] Headers correct
- [ ] Values match chart
- [ ] No console errors

#### Add to Report
- [ ] Select a chart
- [ ] Actions panel opens
- [ ] Click "Add to Report"
- [ ] Report panel opens (if closed)
- [ ] Chart added to report
- [ ] Chart image visible in report
- [ ] No console errors

### 6. Chart Merging

#### Select Multiple Charts
- [ ] Select first chart (checkbox)
- [ ] First chart highlighted
- [ ] Select second chart (checkbox)
- [ ] Both charts highlighted
- [ ] Merge panel appears
- [ ] "2 charts selected" message shown
- [ ] No console errors

#### Merge with AI Context
- [ ] Select 2 compatible charts
- [ ] Merge panel appears
- [ ] Enter merge context/goal
- [ ] Click "Merge with AI"
- [ ] API key configured
- [ ] Loading spinner appears
- [ ] Merge options displayed (3 states)
- [ ] Each state has preview data
- [ ] No console errors

#### Execute Merge
- [ ] Select merge state (radio button)
- [ ] Preview shows selected data
- [ ] Click "Create Merged Chart"
- [ ] New merged chart appears
- [ ] Data combined correctly
- [ ] Original charts remain
- [ ] Success message shown
- [ ] No console errors

#### Close Merge Panel
- [ ] Click X or outside panel
- [ ] Panel closes
- [ ] Charts remain selected
- [ ] Can re-open by selecting charts
- [ ] No console errors

### 7. Text Annotations

#### Create Text Note
- [ ] Click "Text" tool in toolbar OR
- [ ] Right-click canvas → Add Text
- [ ] Text node appears
- [ ] Can type in text area
- [ ] Text saves automatically
- [ ] No console errors

#### Edit Text Note
- [ ] Click existing text note
- [ ] Text area becomes editable
- [ ] Type to edit content
- [ ] Changes save automatically
- [ ] Can use formatting (if available)
- [ ] No console errors

#### Resize Text Note
- [ ] Click and drag text note edges
- [ ] Note resizes smoothly
- [ ] Text wraps appropriately
- [ ] No console errors

#### Delete Text Note
- [ ] Select text note
- [ ] Press Delete key OR
- [ ] Right-click → Delete
- [ ] Note removed from canvas
- [ ] No console errors

### 8. Data Tables

#### View Table from Chart
- [ ] Select chart
- [ ] Click "Show Table"
- [ ] Table node appears
- [ ] Table shows all data from chart
- [ ] Headers match dimensions/measures
- [ ] Values accurate
- [ ] Scrollable if many rows
- [ ] No console errors

#### Table Display
- [ ] Headers visible
- [ ] Data rows visible
- [ ] Row count shown (if large dataset)
- [ ] Alternating row colors
- [ ] Scrollbar if >10 rows
- [ ] No console errors

### 9. Expression Calculator

#### Create Expression
- [ ] Click Calculator tool OR
- [ ] Add expression node
- [ ] Expression input visible
- [ ] Enter math expression (e.g., "2+2")
- [ ] Press Enter or click Calculate
- [ ] Result displayed
- [ ] No console errors

#### Complex Expression
- [ ] Enter expression with operators: "10 * (5 + 3) / 2"
- [ ] Calculate
- [ ] Result correct (40)
- [ ] No console errors

#### Invalid Expression
- [ ] Enter invalid expression: "2 ++ 2"
- [ ] Try to calculate
- [ ] Error message displayed
- [ ] Error is clear
- [ ] No console errors

### 10. Report Generation

#### Add Charts to Report
- [ ] Select chart
- [ ] Click "Add to Report"
- [ ] Report panel opens
- [ ] Chart appears in report
- [ ] Chart image renders
- [ ] Can add multiple charts
- [ ] No console errors

#### Edit Report Text
- [ ] Click in report editor
- [ ] Type text
- [ ] Text appears in report
- [ ] Can edit existing text
- [ ] No console errors

#### Format Report Text
- [ ] Select text
- [ ] Click Bold button
- [ ] Text becomes bold
- [ ] Click Italic button
- [ ] Text becomes italic
- [ ] Try Heading 1, Heading 2
- [ ] Formatting applies
- [ ] No console errors

#### Add Report Sections
- [ ] Type text
- [ ] Format as headings
- [ ] Add paragraphs
- [ ] Structure visible
- [ ] Print preview looks good
- [ ] No console errors

#### Download Report
- [ ] Click "Download Report" button
- [ ] File download starts
- [ ] File downloads successfully
- [ ] Open PDF file
- [ ] All content visible
- [ ] Charts rendered correctly
- [ ] Text formatted correctly
- [ ] No console errors

### 11. Settings Management

#### Open Settings
- [ ] Click Settings icon (gear)
- [ ] Settings panel opens
- [ ] Current settings visible
- [ ] No console errors

#### Update API Key
- [ ] Enter new API key
- [ ] Key is masked (*****)
- [ ] Click Save or auto-saves
- [ ] Success message shown
- [ ] Key persists after refresh
- [ ] No console errors

#### Change Model
- [ ] See model dropdown
- [ ] Select different model
- [ ] Selection saves
- [ ] Model used for next AI call
- [ ] No console errors

#### View Token Usage
- [ ] Token usage displayed
- [ ] Count is accurate
- [ ] Updates after AI calls
- [ ] No console errors

## Performance Testing

### Load Time Test (10 Charts)

#### React Flow + Plotly
- [ ] Clear canvas
- [ ] Create 10 charts
- [ ] Measure time (start to all visible)
- [ ] Target: < 3000ms
- [ ] Actual: _____ ms
- [ ] No console errors

#### React Flow + ECharts
- [ ] Clear canvas
- [ ] Create 10 charts
- [ ] Measure time
- [ ] Target: < 1500ms
- [ ] Actual: _____ ms
- [ ] No console errors

#### TLDraw + ECharts
- [ ] Clear canvas
- [ ] Create 10 charts
- [ ] Measure time
- [ ] Target: < 800ms
- [ ] Actual: _____ ms
- [ ] No console errors

### Drag Performance Test

#### React Flow
- [ ] Create 5 charts
- [ ] Drag each chart 10 times
- [ ] Observe smoothness
- [ ] Target: Smooth at 30fps minimum
- [ ] Actual: _____ (Smooth / Choppy / Laggy)
- [ ] No console errors

#### TLDraw
- [ ] Create 5 charts
- [ ] Drag each chart 10 times
- [ ] Observe smoothness
- [ ] Target: Butter smooth at 60fps
- [ ] Actual: _____ (Excellent / Good / Acceptable)
- [ ] No console errors

### Memory Usage Test (5 minutes)

#### React Flow
- [ ] Open Chrome DevTools → Memory
- [ ] Take initial heap snapshot
- [ ] Create 20 charts
- [ ] Wait 5 minutes
- [ ] Take final heap snapshot
- [ ] Memory increase: _____ MB
- [ ] Target: < 200MB
- [ ] No memory leaks detected
- [ ] No console errors

#### TLDraw
- [ ] Open Chrome DevTools → Memory
- [ ] Take initial heap snapshot
- [ ] Create 20 charts
- [ ] Wait 5 minutes
- [ ] Take final heap snapshot
- [ ] Memory increase: _____ MB
- [ ] Target: < 150MB
- [ ] No memory leaks detected
- [ ] No console errors

### Zoom/Pan Performance

#### React Flow
- [ ] Create 10 charts
- [ ] Zoom in 5 levels
- [ ] Zoom out 5 levels
- [ ] Pan around canvas
- [ ] Observe smoothness
- [ ] Actual: _____ (Smooth / Acceptable / Laggy)
- [ ] No console errors

#### TLDraw
- [ ] Create 10 charts
- [ ] Zoom in 5 levels
- [ ] Zoom out 5 levels
- [ ] Pan around canvas
- [ ] Observe smoothness
- [ ] Actual: _____ (Excellent / Good / Acceptable)
- [ ] No console errors

### Large Dataset Test (50+ Charts)

#### React Flow
- [ ] Create 50 charts
- [ ] Observe rendering time: _____ ms
- [ ] Try dragging charts
- [ ] Drag performance: _____ (Smooth / Choppy / Unusable)
- [ ] Check memory usage: _____ MB
- [ ] No console errors (or acceptable warnings)

#### TLDraw
- [ ] Create 50 charts
- [ ] Observe rendering time: _____ ms
- [ ] Try dragging charts
- [ ] Drag performance: _____ (Excellent / Good / Acceptable)
- [ ] Check memory usage: _____ MB
- [ ] No console errors

## Browser Compatibility Testing

### Chrome
- [ ] All features work
- [ ] Performance acceptable
- [ ] UI renders correctly
- [ ] No console errors

### Firefox
- [ ] All features work
- [ ] Performance acceptable
- [ ] UI renders correctly
- [ ] No console errors

### Safari
- [ ] All features work
- [ ] Performance acceptable
- [ ] UI renders correctly
- [ ] No console errors

### Edge
- [ ] All features work
- [ ] Performance acceptable
- [ ] UI renders correctly
- [ ] No console errors

## Responsive Design Testing

### Desktop (1920x1080)
- [ ] Layout correct
- [ ] All panels visible
- [ ] Canvas uses full space
- [ ] Charts render correctly
- [ ] No overflow issues

### Laptop (1366x768)
- [ ] Layout adapts
- [ ] Panels resize appropriately
- [ ] Canvas usable
- [ ] Charts readable
- [ ] No overflow issues

### Large Screen (2560x1440)
- [ ] Layout scales well
- [ ] No wasted space
- [ ] Charts render crisp
- [ ] UI elements not too small
- [ ] No layout issues

## Console Error Monitoring

Throughout all tests:
- [ ] Zero console errors (red)
- [ ] Acceptable warnings only (yellow)
- [ ] No network failures
- [ ] No React warnings (except known issues)
- [ ] No TLDraw errors
- [ ] No ECharts errors

## Regression Testing

### Previously Working Features
- [ ] Dataset upload still works
- [ ] Chart creation still works
- [ ] AI features still work
- [ ] Report generation still works
- [ ] Settings still work
- [ ] All UI interactions still work

### No Data Loss
- [ ] Creating charts doesn't lose data
- [ ] Switching chart types preserves data
- [ ] Merging preserves original charts
- [ ] Deleting works correctly
- [ ] No orphaned data

## Edge Cases & Error Handling

### Empty States
- [ ] Empty canvas displays message
- [ ] No dataset shows placeholder
- [ ] No charts selected shows nothing in actions
- [ ] Empty report shows instructions

### Error States
- [ ] Invalid API key shows error
- [ ] Network failure shows error message
- [ ] Invalid chart data shows error
- [ ] File upload error shows message

### Boundary Conditions
- [ ] Very large CSV (>10,000 rows)
- [ ] Very wide CSV (>100 columns)
- [ ] CSV with missing values
- [ ] CSV with special characters
- [ ] Extremely long text in notes

## Sign-Off Checklist

### Before Deployment
- [ ] All critical features tested ✓
- [ ] All configurations tested ✓
- [ ] Performance acceptable ✓
- [ ] No blocking bugs
- [ ] Console clean (no errors)
- [ ] Documentation complete
- [ ] Rollback plan documented
- [ ] Team trained

### Post-Deployment Monitoring
- [ ] Monitor error rates (first 24 hours)
- [ ] Track performance metrics
- [ ] Collect user feedback
- [ ] Be ready to rollback if needed

## Test Results Summary

**Configuration Tested**: _______________

**Date**: _______________

**Tester**: _______________

**Overall Status**: ⭕ Pass / ❌ Fail

**Critical Issues**: _______________

**Minor Issues**: _______________

**Performance**: ⭕ Excellent / ⭕ Good / ⭕ Acceptable / ❌ Poor

**Recommendation**: ⭕ Deploy / ⭕ Fix Issues First / ❌ Do Not Deploy

**Notes**:
_______________________________________________
_______________________________________________
_______________________________________________

---

## Quick Smoke Test (5 Minutes)

For rapid verification after changes:

1. [ ] Upload dataset
2. [ ] Create bar chart
3. [ ] Create pie chart
4. [ ] Drag charts
5. [ ] Select chart
6. [ ] Change chart type
7. [ ] Add to report
8. [ ] Download report
9. [ ] Check console (no errors)
10. [ ] Configuration: `window.debugCanvas.getConfig()`

**Status**: _____ (✓ Pass / ❌ Fail)

---

**Testing Complete! 🎉**

