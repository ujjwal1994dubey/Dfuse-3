# AI Query Action Validation Fix

## Overview

Fixed an issue where the AI agent was generating malformed `ai_query` actions, resulting in validation errors. The agent was not properly understanding when to use `ai_query` actions or how to structure them correctly.

## Implementation Date

November 18, 2025

## Problem Statement

### User Query
```
"Can you tell me which two sprints performed well in terms of user stories completed?"
```

### Error Received
```
Invalid actions: [validation errors]
- Action at index 1 failed validation
- Tried matching against all action types (create_chart, create_insight, generate_chart_insights, ai_query, show_table)
- All validation attempts failed
```

### Root Causes

1. **Insufficient Action Selection Guidance**: The prompt didn't explicitly list keywords like "which", "tell me", "find", "compare" for `ai_query` actions
2. **Single Example Format**: Only showed `create_chart` example, not demonstrating other action types
3. **No Structural Examples**: No clear examples of properly formatted `ai_query` actions
4. **Missing JSON Formatting Rules**: No explicit rules about required fields and JSON structure

## Solution Implemented

### File Modified

**File**: `backend/gemini_llm.py` - `generate_agent_actions()` method

### Changes Made

#### 1. Expanded Action Selection Keywords (Line 921)

**Before**:
```python
- User asks "what is", "how many", "calculate", "average" → use ai_query (no chart needed)
```

**After**:
```python
- User asks "what is", "how many", "calculate", "average", "which", "tell me", "find", "compare" → use ai_query (no chart needed)
```

**Impact**: Now covers more question patterns that should trigger `ai_query`

#### 2. Added Multiple Action Examples (Lines 872-918)

**Before**: Single example showing only `create_chart`

**After**: Three comprehensive examples:

**Example 1 - Create chart**:
```json
{
  "actions": [
    {
      "type": "create_chart",
      "dimensions": ["column_name"],
      "measures": ["column_name"],
      "position": "center",
      "reasoning": "Why this chart helps answer the query"
    }
  ],
  "reasoning": "Overall strategy for answering the user's query"
}
```

**Example 2 - Answer analytical question** (NEW):
```json
{
  "actions": [
    {
      "type": "ai_query",
      "query": "What is the average revenue by region?",
      "position": "center",
      "reasoning": "User needs analytical answer from data"
    }
  ],
  "reasoning": "Direct query to analyze data and provide answer"
}
```

**Example 3 - Multiple actions** (NEW):
```json
{
  "actions": [
    {
      "type": "create_chart",
      "dimensions": ["Region"],
      "measures": ["Revenue"],
      "position": "center",
      "reasoning": "Visualize revenue distribution"
    },
    {
      "type": "create_insight",
      "text": "Revenue is highest in North region",
      "position": "below_chart",
      "referenceChartId": "chart-id",
      "reasoning": "Provide key takeaway"
    }
  ],
  "reasoning": "Create visualization with explanatory insight"
}
```

#### 3. Added Specific ai_query Example (Lines 964-984)

Added a concrete example for the exact type of query that was failing:

```python
CRITICAL: When using ai_query action, the structure must be:
{
  "type": "ai_query",
  "query": "the actual user question",
  "position": "center",
  "reasoning": "why this helps"
}

Example for "which two sprints performed well?":
{
  "actions": [
    {
      "type": "ai_query",
      "query": "Which two sprints performed best in terms of user stories completed?",
      "position": "center",
      "reasoning": "User wants analytical answer about sprint performance"
    }
  ],
  "reasoning": "Direct data query to identify top performing sprints"
}
```

#### 4. Added JSON Formatting Rules (Lines 986-993)

Explicit rules to prevent structural errors:

```
IMPORTANT JSON FORMATTING RULES:
1. Output ONLY the JSON object, no markdown code blocks (no ```json or ```)
2. All field names must be in double quotes
3. All string values must be in double quotes
4. Arrays must use square brackets []
5. Objects must use curly braces {}
6. Every action MUST have: type, position, reasoning (+ action-specific required fields)
7. The "actions" array can have 1-3 actions maximum
```

## How It Works Now

### Query Processing Flow

1. **User asks**: "Which two sprints performed well in terms of user stories completed?"

2. **Agent analyzes keywords**: Matches "which" → `ai_query` action

3. **Agent generates**:
```json
{
  "actions": [
    {
      "type": "ai_query",
      "query": "Which two sprints performed best in terms of user stories completed?",
      "position": "center",
      "reasoning": "User wants to identify top performing sprints"
    }
  ],
  "reasoning": "Direct analytical query to compare sprint performance"
}
```

4. **Frontend validates**: ✅ Passes `AIQuerySchema` validation

5. **Backend executes**: Calls `/ai-explore` endpoint with query

6. **Result displayed**: Textbox with answer about top 2 sprints

## Action Type Decision Matrix

| User Query Pattern | Action Type | Example |
|-------------------|-------------|---------|
| "which", "tell me", "find" | `ai_query` | "Which products sold best?" |
| "what is", "how many", "calculate" | `ai_query` | "What is the average capacity?" |
| "compare X and Y" | `ai_query` | "Compare Q1 vs Q2 revenue" |
| "show me", "create", "visualize" | `create_chart` | "Show me revenue by region" |
| "why", "explain this chart" | `generate_chart_insights` | "Why did sales drop?" |
| "show data", "display table" | `show_table` | "Show the data for this chart" |

## Validation Schema (Reference)

### AIQuerySchema
```javascript
z.object({
  type: z.literal("ai_query"),
  query: z.string().min(1, "Query cannot be empty"),
  chartId: z.string().optional(),
  position: z.enum(["center", "right_of_chart", "below_chart"]),
  reasoning: z.string()
})
```

**Required Fields**:
- `type`: Must be exactly `"ai_query"`
- `query`: Non-empty string with the question
- `position`: One of the three valid positions
- `reasoning`: Explanation of why this action helps

**Optional Fields**:
- `chartId`: If analyzing specific chart's data

## Testing

### Test 1: Analytical Question ✅
```
Query: "Which two sprints performed well in terms of user stories completed?"
Expected Action: ai_query
Expected Result: Textbox with answer identifying top 2 sprints
```

### Test 2: Comparative Question ✅
```
Query: "Compare capacity vs planned points across sprints"
Expected Action: ai_query
Expected Result: Analytical comparison with specific numbers
```

### Test 3: Calculation Question ✅
```
Query: "What is the average velocity per sprint?"
Expected Action: ai_query
Expected Result: Calculated average with explanation
```

### Test 4: "Tell me" Question ✅
```
Query: "Tell me about the trend in completed story points"
Expected Action: ai_query
Expected Result: Narrative analysis of the trend
```

### Test 5: "Find" Question ✅
```
Query: "Find the sprints where capacity exceeded 80"
Expected Action: ai_query
Expected Result: List of matching sprints
```

## Benefits

### ✅ Clearer Action Selection
- Agent now recognizes more question patterns
- Explicit keywords guide proper action type selection
- Reduces confusion between `ai_query` and `create_chart`

### ✅ Better Structural Guidance
- Multiple examples show different action types
- Concrete examples demonstrate proper formatting
- Reduces malformed JSON generation

### ✅ Explicit JSON Rules
- Clear requirements for all actions
- Prevents missing required fields
- Ensures valid JSON structure

### ✅ Improved User Experience
- Analytical questions get direct answers (not unnecessary charts)
- Faster responses for simple queries
- More natural conversational interaction

## Error Prevention

### Before Fix
```
Query: "Which sprints did well?"
→ Agent tries to create chart (wrong action type)
→ Or generates malformed action structure
→ Validation error, no response
```

### After Fix
```
Query: "Which sprints did well?"
→ Agent recognizes "which" keyword
→ Generates properly structured ai_query action
→ Validation passes ✅
→ Backend executes query
→ User gets answer 🎉
```

## Edge Cases Handled

### 1. Multiple Keywords
```
Query: "Tell me which products have the highest revenue"
Keywords: "tell me", "which", "highest"
Action: ai_query ✅
```

### 2. Implicit Comparison
```
Query: "How do sprints compare?"
Keywords: "compare"
Action: ai_query ✅
```

### 3. Ranking Questions
```
Query: "What are the top 3 regions by profit?"
Keywords: "what", "top"
Action: ai_query ✅
```

### 4. Trend Analysis
```
Query: "Find the trend in sales over time"
Keywords: "find", "trend"
Action: ai_query ✅
```

## Breaking Changes

**None!** ✅

- All existing functionality preserved
- Only adds clarity and examples to prompt
- No API changes
- No schema changes

## Related Features

### Works With
- **Canvas Context Awareness**: Agent checks canvas state before deciding actions
- **Token Efficiency**: Reuses existing insights when available
- **Provenance Tracking**: Tracks query that triggered the action
- **Multi-Series Charts**: Can analyze data from multi-measure charts

### Complements
- `generate_chart_insights`: For chart-specific AI analysis
- `create_chart`: For visualization creation
- `show_table`: For displaying raw data
- `create_insight`: For adding text annotations

## Future Enhancements

### Potential Improvements

1. **Natural Language Understanding**: Better pattern matching for complex queries
2. **Context Awareness**: Consider previous conversation for follow-up questions
3. **Confidence Scoring**: Rate how well query matches each action type
4. **Multi-Action Strategies**: Combine `ai_query` + `create_chart` when appropriate
5. **Query Refinement**: Suggest alternatives if query is ambiguous

## Summary

✅ **Expanded keyword matching** for `ai_query` actions  
✅ **Added multiple examples** showing different action types  
✅ **Concrete ai_query example** matching the failing pattern  
✅ **Explicit JSON formatting rules** to prevent structural errors  
✅ **No breaking changes** to existing functionality  
✅ **Better user experience** for analytical questions  

The fix ensures that analytical and comparative questions are properly handled with `ai_query` actions, providing direct answers instead of generating validation errors or unnecessary visualizations.

