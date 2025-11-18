# AI Query Independent Fix

## Problem

The `ai_query` action was failing with the error:
```
❌ AI query requires at least one chart on canvas or specify chartId
```

When users asked questions like "What is the average capacity across sprints?", they shouldn't need to have a chart already created. The agent should be able to answer data questions directly.

## Root Cause

The `/ai-explore` backend endpoint required a `chart_id` to determine which dataset to query. The frontend `aiQueryAction` was trying to find any chart to use as context, which failed when no charts existed on the canvas.

## Solution

Made `ai_query` **truly independent** and intelligent about context:

### 1. Backend Changes (`app.py`)

#### Updated `AIExploreRequest` Model
```python
class AIExploreRequest(BaseModel):
    chart_id: Optional[str] = None      # NEW: Optional
    dataset_id: Optional[str] = None    # NEW: Added
    user_query: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"
```

#### Smart Context Detection
```python
# Get dataset_id from either chart context or direct dataset_id
if request.chart_id:
    # Chart-specific query: use chart context
    chart_context = CHARTS[request.chart_id]
    dataset_id = chart_context["dataset_id"]
    print(f"🎯 Using chart context: {request.chart_id}")
elif request.dataset_id:
    # Dataset-level query: use dataset directly
    dataset_id = request.dataset_id
    print(f"📊 Using dataset context: {dataset_id[:8]}...")
else:
    raise HTTPException(status_code=400, detail="Either chart_id or dataset_id must be provided")
```

### 2. Frontend Changes (`actionExecutor.js`)

#### Intelligent Context Selection

The `aiQueryAction` now:

1. **Checks for explicit `chartId`** in the action (if LLM specified one)
2. **Checks for selected chart** (if user has a chart selected in the editor)
3. **Falls back to dataset-level query** (if no chart context available)

```javascript
// Determine context: chart-specific or dataset-level
let chartIdToUse = action.chartId;

// If no chartId specified, check if user has a chart selected
if (!chartIdToUse && editor) {
  const selectedShapes = editor.getSelectedShapes();
  const selectedChart = selectedShapes.find(shape => {
    const node = nodes.find(n => n.id === shape.id);
    return node && node.type === 'chart';
  });
  if (selectedChart) {
    const chartNode = nodes.find(n => n.id === selectedChart.id);
    if (chartNode) {
      chartIdToUse = chartNode.id;
      console.log('📍 Using selected chart as context:', chartIdToUse);
    }
  }
}

// Build request payload
const requestPayload = {
  user_query: action.query,
  api_key: apiKey,
  model: 'gemini-2.0-flash'
};

if (chartIdToUse) {
  // Chart-specific query
  requestPayload.chart_id = chartIdToUse;
  console.log('🎯 AI query with chart context:', chartIdToUse);
} else {
  // Dataset-level query
  requestPayload.dataset_id = datasetId;
  console.log('📊 AI query on entire dataset:', datasetId);
}
```

### 3. LLM Prompt Update (`gemini_llm.py`)

Updated the agent prompt to clarify that `ai_query` works independently:

```
4. ai_query: Answer a free-form question about the data (works with or without charts)
   - query (string): The question to answer
   - chartId (optional string): If provided, analyzes specific chart's data as context
   - position (string): "center", "right_of_chart", "below_chart"
   - reasoning (string): Why this query helps
   Note: chartId is optional - queries work on entire dataset if no chart specified

Action selection guidelines:
- User asks "why" or "explain" (about a chart) → use generate_chart_insights
- User asks "what is", "how many", "calculate", "average" → use ai_query (no chart needed)
- User asks "show data" or "see values" → use show_table (requires existing chart)
- User asks "create" or "visualize" → use create_chart

Important notes:
- ai_query works WITHOUT any charts on canvas - perfect for quick data questions
- generate_chart_insights and show_table REQUIRE an existing chart (specify chartId)
```

## How It Works Now

### Scenario 1: Empty Canvas (No Charts)
**User**: "What is the average capacity across sprints?"

**Flow**:
1. LLM generates: `{ type: "ai_query", query: "...", chartId: null }`
2. `aiQueryAction` checks for chartId → None
3. Checks for selected chart → None
4. Uses `dataset_id` directly
5. Backend queries entire dataset
6. Returns answer in text box

✅ **Works perfectly!**

### Scenario 2: Chart Selected
**User** selects a revenue chart, then asks: "What's the growth rate?"

**Flow**:
1. LLM generates: `{ type: "ai_query", query: "..." }`
2. `aiQueryAction` checks for selected chart → Found!
3. Uses selected chart's ID for context
4. Backend analyzes that specific chart's data
5. Returns contextualized answer

✅ **Uses chart context intelligently!**

### Scenario 3: Chart Exists but Not Selected
**User**: "Calculate average profit margin"

**Flow**:
1. LLM generates: `{ type: "ai_query", query: "..." }`
2. `aiQueryAction` checks for chartId → None
3. Checks for selected chart → None
4. Falls back to dataset-level query
5. Backend analyzes full dataset
6. Returns answer

✅ **Works independently!**

### Scenario 4: LLM Specifies Chart
**User**: "Explain the top value in this revenue chart"

**Flow**:
1. LLM generates: `{ type: "ai_query", query: "...", chartId: "chart-123" }`
2. `aiQueryAction` uses the specified chartId
3. Backend analyzes that chart's data specifically
4. Returns contextualized answer

✅ **Respects LLM's decision!**

## Benefits

### ✅ True Independence
- Users can ask questions without creating charts first
- Perfect for quick data exploration
- Natural conversational flow

### 🎯 Smart Context Awareness
- If a chart is selected, uses it for context
- If LLM specifies a chart, respects that
- Falls back gracefully to dataset-level

### 🔄 Backwards Compatible
- Existing chart-specific queries still work
- All other action types unaffected
- No breaking changes

### 📊 Better UX
- Users don't need to understand chart requirements
- Agent feels more intelligent and helpful
- Reduces error messages

## Testing

### Test 1: Empty Canvas
```
User: "What is the average capacity across sprints?"
Expected: ✅ Answer appears in text box
```

### Test 2: With Selected Chart
```
1. Create chart: "Show revenue by state"
2. Select the chart
3. Ask: "What's the total for California?"
Expected: ✅ Answer uses chart context
```

### Test 3: Chart Exists but Not Selected
```
1. Create chart: "Show sales by product"
2. Don't select it
3. Ask: "Calculate total revenue"
Expected: ✅ Answer uses full dataset
```

### Test 4: Mixed Actions
```
User: "What's the average profit and create a chart showing profit by region"
Expected: 
  ✅ Text box with average
  ✅ Chart created
```

## Code Changes Summary

### Backend
- ✅ Made `chart_id` optional in `AIExploreRequest`
- ✅ Added `dataset_id` optional field
- ✅ Smart context detection logic

### Frontend
- ✅ Enhanced `aiQueryAction` with 3-tier context detection
- ✅ Proper logging for debugging

### LLM
- ✅ Updated prompt to clarify `ai_query` independence
- ✅ Added clear action selection guidelines

### Validation
- ✅ Existing Zod schema unchanged (chartId was already optional)

## No Breaking Changes

All existing functionality continues to work:
- Chart-specific queries with explicit `chartId` ✅
- Other action types (`create_chart`, `generate_chart_insights`, `show_table`) ✅
- Token usage tracking ✅
- Error handling ✅

## Performance Impact

- **Zero**: No additional API calls
- **Slightly improved**: Avoids trying to find charts unnecessarily
- **Better logging**: Easier to debug context selection

## Future Enhancements

Potential improvements:
1. **Multi-chart context**: Analyze multiple selected charts together
2. **Historical context**: Remember previous queries in conversation
3. **Smart chart suggestions**: "Want me to visualize this?"
4. **Caching**: Cache dataset-level queries for faster responses

---

## Summary

✅ **`ai_query` now works independently**  
✅ **Smart context detection (3 tiers)**  
✅ **Backwards compatible**  
✅ **Zero linting errors**  
✅ **Better UX and error reduction**  

Users can now freely ask data questions at any time, with or without charts! 🎉

