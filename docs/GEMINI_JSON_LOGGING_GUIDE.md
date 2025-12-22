# Gemini JSON Response Logging Guide

**Date:** December 20, 2025  
**Status:** ✅ Implemented  
**Purpose:** Debug and understand what JSON Gemini returns for canvas queries

## What Was Added

Added comprehensive logging in `backend/gemini_llm.py` to show:
1. **Raw Gemini response** (first 500 chars)
2. **Parsed JSON for ALL canvas queries**
3. **Detailed dashboard breakdown** (when dashboard is requested)

## How to View the Logs

### Step 1: Start the Backend Server

Open a terminal and run:

```bash
cd backend
source venv/bin/activate  # Activate virtual environment
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

**The logs will appear in this terminal window!**

### Step 2: Use Canvas Mode

In your frontend:
1. Switch to **Canvas** mode (purple button)
2. Ask any query, like:
   - "create a dashboard"
   - "show me profit by category"
   - "create 3 KPIs"

### Step 3: Watch the Terminal

You'll see logs like this:

## Example Log Output

### For ANY Canvas Query

```
📝 Sending prompt to Gemini...

================================================================================
🤖 GEMINI RAW RESPONSE:
================================================================================
{"actions": [{"type": "create_chart", "dimensions": ["Category"], "measures": ["Profit"], "chartType": "bar", "position": "center", "reasoning": "Bar chart for profit distribution"}], "reasoning": "Single chart visualization"}
================================================================================

🔍 Parsing response...

📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦
🔍 PARSED ACTIONS JSON:
📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦
{
  "actions": [
    {
      "type": "create_chart",
      "dimensions": ["Category"],
      "measures": ["Profit"],
      "chartType": "bar",
      "position": "center",
      "reasoning": "Bar chart for profit distribution"
    }
  ],
  "reasoning": "Single chart visualization",
  "token_usage": {
    "inputTokens": 1234,
    "outputTokens": 56,
    "totalTokens": 1290
  }
}
📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦

✅ Successfully generated 1 actions
```

### For Dashboard Queries (Extra Detail!)

```
📝 Sending prompt to Gemini...

================================================================================
🤖 GEMINI RAW RESPONSE:
================================================================================
{"actions": [{"type": "create_dashboard", "dashboardType": "sales", "layoutStrategy": "kpi-dashboard", "elements": [{"type": "kpi", "query": "Total Revenue", "value": 6997272, ...
================================================================================

🔍 Parsing response...

📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦
🔍 PARSED ACTIONS JSON:
📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦
{
  "actions": [
    {
      "type": "create_dashboard",
      "dashboardType": "sales",
      "layoutStrategy": "kpi-dashboard",
      "elements": [...]
    }
  ],
  "reasoning": "Complete sales dashboard",
  "token_usage": {...}
}
📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦📦

🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
📊 DASHBOARD ACTION DETECTED!
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
Dashboard Type: sales
Layout Strategy: kpi-dashboard
Number of Elements: 11

Elements Breakdown:
  - KPIs: 4
  - Charts: 7
  - Insights: 0

  📈 KPI Details:
    1. Total Revenue: 6,997,272.00
    2. Total Profit: 5,690,978.00
    3. Total Sales Units: 14,017.00
    4. Average Customer Satisfaction: 2.83

  📊 Chart Details:
    1. bar: Cost by Category
    2. bar: Cost by Region
    3. line: Cost by Year
    4. multi_series_bar: Revenue, Cost, Profit by Category
    5. bar: Sales Units by Region
    6. line: Profit by Year
    7. bar: Cost by Region

📋 Full Dashboard JSON:
--------------------------------------------------------------------------------
{
  "type": "create_dashboard",
  "dashboardType": "sales",
  "layoutStrategy": "kpi-dashboard",
  "elements": [
    {
      "type": "kpi",
      "query": "Total Revenue",
      "value": 6997272.0,
      "formatted_value": "6,997,272.00",
      "explanation": "Sum of all Revenue values",
      "reasoning": "Key sales metric"
    },
    {
      "type": "kpi",
      "query": "Total Profit",
      "value": 5690978.0,
      "formatted_value": "5,690,978.00",
      "explanation": "Sum of all Profit values",
      "reasoning": "Key profitability metric"
    },
    {
      "type": "chart",
      "dimensions": ["Category"],
      "measures": ["Cost"],
      "chartType": "bar",
      "reasoning": "Cost breakdown by product category"
    },
    ... (more elements)
  ],
  "reasoning": "Comprehensive sales dashboard with key metrics and visualizations"
}
--------------------------------------------------------------------------------
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯

✅ Successfully generated 1 actions
```

## What You Can Learn from These Logs

### 1. Action Types
See what action Gemini chose:
- `create_chart` - Single chart
- `create_kpi` - Single KPI
- `create_dashboard` - Full dashboard
- `ai_query` - Data question (Ask mode)
- `generate_chart_insights` - Insights for existing chart

### 2. Dashboard Structure
For dashboards, see:
- **Dashboard type**: sales, executive, operations, etc.
- **Layout strategy**: kpi-dashboard, grid, hero, flow
- **Element count**: How many KPIs, charts, insights
- **Each element's details**: Dimensions, measures, chart types

### 3. Data Mapping
See how Gemini maps your query to:
- **Dimensions**: Which columns (Category, Region, Year)
- **Measures**: Which metrics (Revenue, Profit, Cost)
- **Chart types**: bar, line, scatter, multi_series_bar

### 4. KPI Calculations
See pre-computed KPI values:
- **Value**: Raw number (6997272.0)
- **Formatted**: Display format ("6,997,272.00")
- **Explanation**: How it was calculated

### 5. Reasoning
See Gemini's thought process:
- Why it chose this action
- Why it picked these chart types
- Overall strategy

## Use Cases

### Debugging
- "Why did it create 7 charts instead of 4?"
- "Why is this KPI missing?"
- "What chart type did it choose?"

### Understanding
- "What does Gemini think a 'sales dashboard' is?"
- "How does it decide layout strategy?"
- "What elements does it include?"

### Optimization
- "Are the right columns being used?"
- "Is the chart type appropriate?"
- "Are KPIs calculated correctly?"

## Log Locations

The logs appear in:
1. **Terminal running backend** (uvicorn server)
2. **Not in browser console** (this is backend logging)
3. **Real-time** as queries are processed

## Tips

### Clear Logs
If too cluttered, restart the backend server:
```bash
# Press Ctrl+C to stop
# Then restart:
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Save Logs to File
Redirect output to file:
```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000 2>&1 | tee backend_logs.txt
```

### Filter Logs
Search for specific patterns:
```bash
# Only show dashboard logs
uvicorn app:app --reload 2>&1 | grep -A 50 "DASHBOARD ACTION"
```

## What to Look For

### ✅ Good Signs
- JSON is well-formed
- Elements match your query intent
- KPI values are reasonable
- Chart types make sense
- Dimensions/measures are correct

### ⚠️ Warning Signs
- Empty elements array
- Wrong chart types
- Missing KPIs
- Incorrect columns
- Invalid JSON structure

## Example Queries to Test

Try these in Canvas mode:

1. **"create a dashboard"**
   - See: Full dashboard with auto-selected elements

2. **"show me profit by category"**
   - See: Single chart action

3. **"calculate total revenue and average profit"**
   - See: Two KPI actions

4. **"create a sales dashboard with 3 KPIs and 4 charts"**
   - See: Dashboard with specific counts

## Code Location

The logging code is in:
- **File**: `backend/gemini_llm.py`
- **Function**: `generate_agent_actions()`
- **Lines**: ~1161-1200

## Troubleshooting

### Not seeing logs?
- Check you're running the backend in terminal (not background)
- Make sure you're in Canvas mode (not Ask mode)
- Verify backend is actually receiving requests

### Logs too verbose?
- Comment out the "PARSED ACTIONS JSON" section
- Keep only the "DASHBOARD ACTION DETECTED" section
- Or reduce indent depth in json.dumps()

### Want even more detail?
- Add logging before `_parse_agent_response()`
- Log the full prompt being sent to Gemini
- Add timing information

## Summary

✅ **Logs show:**
- Raw Gemini response
- Parsed JSON for every canvas query
- Detailed dashboard breakdown with element counts
- Full formatted JSON for inspection

✅ **View logs in:**
- Terminal running backend server
- Real-time as queries are processed
- Can save to file for later analysis

✅ **Useful for:**
- Debugging unexpected behavior
- Understanding Gemini's decisions
- Verifying correct data mapping
- Learning how the system works

Now you can see exactly what Gemini returns and how it structures dashboards! 🎉

