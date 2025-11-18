# Agentic Layer - Complete Architecture

## Overview

The agentic layer is a conversational AI system that allows users to create visualizations and analyze data through natural language. It intelligently interprets user queries, generates structured actions, and executes them on the canvas.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Query                          │
│              "Show revenue by state and explain"            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentChatPanel.jsx                       │
│  • Captures user input                                      │
│  • Displays conversation history                            │
│  • Shows loading states and errors                          │
│  • Tracks token usage                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   canvasSnapshot.js                         │
│  • Extracts current canvas state                            │
│  • Captures: charts, tables, textboxes                      │
│  • Provides "eyes" to the agent                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend: /agent-query                       │
│  • Receives: user_query + canvas_state + dataset_id         │
│  • Retrieves dataset metadata                               │
│  • Constructs enhanced prompt                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Gemini LLM (gemini_llm.py)                     │
│  • Analyzes query + context + metadata                      │
│  • Generates structured JSON actions                        │
│  • Returns reasoning + token usage                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    validation.js                            │
│  • Validates actions using Zod schemas                      │
│  • Ensures type safety and correctness                      │
│  • Returns success or detailed error                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   actionExecutor.js                         │
│  • Executes validated actions sequentially                  │
│  • Calls backend endpoints as needed                        │
│  • Creates shapes on TLDraw canvas                          │
│  • Returns execution results                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Canvas Updated                           │
│  • New charts, insights, tables appear                      │
│  • User sees results immediately                            │
│  • Can continue conversation                                │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend Components

#### `AgentChatPanel.jsx`
**Location**: `/frontend/src/agentic_layer/AgentChatPanel.jsx`

**Purpose**: Main UI component for user interaction

**Features**:
- Text input for queries
- Message history display
- Loading indicators
- Error handling
- Token usage tracking
- Requires dataset and API key

**Key Functions**:
```javascript
handleSubmit(e)
  ├─> getCanvasSnapshot()
  ├─> fetch('/agent-query')
  ├─> validateActionsSafe()
  ├─> executeActions()
  └─> updateMessages()
```

#### `canvasSnapshot.js`
**Location**: `/frontend/src/agentic_layer/canvasSnapshot.js`

**Purpose**: Extract current canvas state for agent context

**Exported Function**:
```javascript
getCanvasSnapshot(editor, nodes)
  └─> Returns: {
        charts: [...],
        tables: [...],
        textBoxes: [...],
        metadata: { nodeCount, chartCount, ... }
      }
```

**What It Captures**:
- **Charts**: dimensions, measures, chartType, position, title
- **Tables**: title, position
- **TextBoxes**: text content, position
- **Metadata**: counts and status

#### `validation.js`
**Location**: `/frontend/src/agentic_layer/validation.js`

**Purpose**: Type-safe validation using Zod schemas

**Schemas Defined**:
- `CreateChartActionSchema`
- `CreateInsightActionSchema`
- `GenerateChartInsightsSchema`
- `AIQuerySchema`
- `ShowTableSchema`
- `AgentActionSchema` (union of all)
- `AgentResponseSchema` (complete response)

**Main Function**:
```javascript
validateActionsSafe(response)
  └─> Returns: { 
        success: true/false, 
        data: validated_data,
        error: error_details 
      }
```

#### `actionExecutor.js`
**Location**: `/frontend/src/agentic_layer/actionExecutor.js`

**Purpose**: Execute validated actions on canvas

**Main Flow**:
```javascript
executeActions(actions, context)
  └─> For each action:
        ├─> executeAction(action)
        │     ├─> createChartAction()
        │     ├─> createInsightAction()
        │     ├─> generateChartInsightsAction()
        │     ├─> aiQueryAction()
        │     └─> showTableAction()
        └─> Collect results
```

**Action Handlers**:

1. **`createChartAction`**
   - Calls `/charts` endpoint
   - Uses `figureFromPayload` to format data
   - Creates chart node on canvas
   - Returns chart info

2. **`createInsightAction`**
   - Creates textbox node with provided text
   - Positions relative to reference or center
   - Returns insight info

3. **`generateChartInsightsAction`**
   - Calls `/chart-insights` endpoint
   - Creates textbox with AI-generated insights
   - Positions next to source chart
   - Returns insight info

4. **`aiQueryAction`** ⭐ (Smart Context Detection)
   - Checks for chartId (3-tier detection):
     1. Explicit chartId from LLM
     2. Selected chart in editor
     3. Falls back to dataset-level
   - Calls `/ai-explore` with chart_id OR dataset_id
   - Creates textbox with Q&A
   - Returns query result

5. **`showTableAction`**
   - Extracts table data from chart node (client-side)
   - Creates table shape next to chart
   - Returns table info

#### `types.js`
**Location**: `/frontend/src/agentic_layer/types.js`

**Purpose**: Central configuration and constants

**Exports**:
```javascript
ACTION_TYPES = {
  CREATE_CHART,
  CREATE_INSIGHT,
  GENERATE_CHART_INSIGHTS,
  AI_QUERY,
  SHOW_TABLE
}

POSITION_TYPES = {
  CENTER,
  RIGHT_OF_CHART,
  BELOW_CHART,
  AUTO
}

AGENT_CONFIG = {
  MAX_ACTIONS_PER_QUERY: 5,
  API_ENDPOINT: '/agent-query',
  DEFAULT_CHART_WIDTH: 800,
  DEFAULT_CHART_HEIGHT: 400,
  ...
}
```

#### `index.js`
**Location**: `/frontend/src/agentic_layer/index.js`

**Purpose**: Public API for the agentic layer module

**Exports**:
```javascript
export { AgentChatPanel } from './AgentChatPanel';
export { getCanvasSnapshot } from './canvasSnapshot';
export { executeActions } from './actionExecutor';
export { validateActionsSafe } from './validation';
export { ACTION_TYPES, POSITION_TYPES, AGENT_CONFIG } from './types';
```

### 2. Backend Components

#### `/agent-query` Endpoint
**Location**: `/backend/app.py`

**Request Model**:
```python
class AgentQueryRequest(BaseModel):
    user_query: str
    canvas_state: Dict[str, Any]
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"
```

**Process Flow**:
```python
@app.post("/agent-query")
  ├─> Validate dataset exists
  ├─> Validate API key
  ├─> Get dataset metadata (summary + column descriptions)
  ├─> Initialize GeminiDataFormulator
  ├─> Call generate_agent_actions()
  ├─> Track token usage
  └─> Return: actions, reasoning, token_usage
```

**Response**:
```json
{
  "success": true,
  "actions": [...],
  "reasoning": "...",
  "token_usage": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "totalTokens": 1801
  }
}
```

#### `GeminiDataFormulator.generate_agent_actions()`
**Location**: `/backend/gemini_llm.py`

**Purpose**: Core LLM interaction for action generation

**Process**:
```python
generate_agent_actions(query, canvas_state, dataset_id, dataset_metadata)
  ├─> Build enhanced context from metadata
  │     ├─> Dataset purpose/summary
  │     └─> Column descriptions
  ├─> Summarize canvas state
  ├─> Construct comprehensive prompt
  │     ├─> Dataset context
  │     ├─> Canvas state
  │     ├─> Available columns
  │     ├─> Sample data
  │     ├─> Action schemas
  │     └─> Selection guidelines
  ├─> Call run_gemini_with_usage()
  ├─> Parse JSON response
  └─> Return: actions, reasoning, token_usage
```

**Enhanced Context**:
The prompt includes:
1. **Dataset Summary**: AI-generated description of data purpose
2. **Column Descriptions**: Semantic meaning of each column
3. **Canvas State**: What's already visualized
4. **Data Structure**: Available dimensions and measures
5. **Sample Data**: First 3 rows for reference
6. **Action Schemas**: Detailed format for each action type
7. **Guidelines**: When to use which action

#### Supporting Endpoints

1. **`/charts`** (existing)
   - Creates charts from dimensions + measures
   - Used by `create_chart` action

2. **`/chart-insights`** (existing)
   - Generates AI insights for a specific chart
   - Used by `generate_chart_insights` action

3. **`/ai-explore`** (modified)
   - Answers data questions
   - Now supports both `chart_id` AND `dataset_id`
   - Used by `ai_query` action

## Action Types Deep Dive

### 1. `create_chart`

**When to Use**: User wants to visualize data

**Required Fields**:
- `dimensions`: Array of column names (0-2)
- `measures`: Array of column names (1-2)
- `position`: Where to place chart

**Optional Fields**:
- `chartType`: Specific chart type (auto-detected if not provided)
- `referenceChartId`: For relative positioning

**Example**:
```json
{
  "type": "create_chart",
  "dimensions": ["state"],
  "measures": ["revenue"],
  "chartType": "bar",
  "position": "center",
  "reasoning": "Visualize revenue distribution across states"
}
```

### 2. `create_insight`

**When to Use**: User wants to add explanatory text

**Required Fields**:
- `text`: The insight/explanation text
- `position`: Where to place textbox

**Optional Fields**:
- `referenceChartId`: For relative positioning

**Example**:
```json
{
  "type": "create_insight",
  "text": "California leads with 35% of total revenue, driven by tech sector growth.",
  "position": "right_of_chart",
  "referenceChartId": "chart-123",
  "reasoning": "Explain the standout performer"
}
```

### 3. `generate_chart_insights`

**When to Use**: User wants AI explanation of a chart

**Required Fields**:
- `chartId`: Which chart to analyze
- `position`: Where to place insights

**Optional Fields**:
- `userContext`: Additional user-provided context

**Example**:
```json
{
  "type": "generate_chart_insights",
  "chartId": "chart-123",
  "position": "right_of_chart",
  "userContext": "Focus on Q3 spike",
  "reasoning": "User wants explanation of Q3 anomaly"
}
```

### 4. `ai_query` ⭐

**When to Use**: User asks a data question

**Required Fields**:
- `query`: The question to answer
- `position`: Where to place answer

**Optional Fields**:
- `chartId`: Specific chart context (auto-detected from selection)

**Smart Context Detection**:
1. If `chartId` provided → use that chart's data
2. Else if chart selected → use selected chart
3. Else → query entire dataset

**Example**:
```json
{
  "type": "ai_query",
  "query": "What is the average capacity across sprints?",
  "position": "center",
  "reasoning": "Direct data question requiring calculation"
}
```

**Key Feature**: Works with or without charts! 🎉

### 5. `show_table`

**When to Use**: User wants to see exact data values

**Required Fields**:
- `chartId`: Which chart's data to display

**Example**:
```json
{
  "type": "show_table",
  "chartId": "chart-123",
  "reasoning": "User wants to see precise numerical values"
}
```

**Note**: Pure client-side operation, no API call needed.

## Data Flow Examples

### Example 1: Simple Chart Creation

**User Query**: "Show revenue by state"

**Flow**:
```
1. User → AgentChatPanel
   Input: "Show revenue by state"

2. AgentChatPanel → canvasSnapshot
   Get current canvas state

3. AgentChatPanel → Backend /agent-query
   POST { user_query, canvas_state, dataset_id }

4. Backend → Gemini LLM
   Prompt with dataset + canvas context

5. Gemini → Backend
   JSON: { actions: [{ type: "create_chart", dimensions: ["state"], measures: ["revenue"], ... }] }

6. Backend → AgentChatPanel
   Validated response with token usage

7. AgentChatPanel → validation.js
   Validate action schema

8. AgentChatPanel → actionExecutor
   executeActions([create_chart_action])

9. actionExecutor → Backend /charts
   POST { dimensions: ["state"], measures: ["revenue"] }

10. Backend → actionExecutor
    Chart data with ECharts config

11. actionExecutor → figureFromPayload
    Transform to ECharts format

12. actionExecutor → setNodes
    Add chart node to canvas

13. Canvas → User
    Chart appears on screen
```

### Example 2: AI Query (No Charts)

**User Query**: "What is the average capacity across sprints?"

**Flow**:
```
1. User → AgentChatPanel
   Input: "What is the average capacity across sprints?"

2. AgentChatPanel → canvasSnapshot
   Canvas state: { charts: [], tables: [], textBoxes: [] }

3. AgentChatPanel → Backend /agent-query
   POST with empty canvas state

4. Backend → Gemini LLM
   Detects query intent → ai_query

5. Gemini → Backend
   JSON: { actions: [{ type: "ai_query", query: "...", position: "center" }] }

6. Backend → AgentChatPanel
   Validated response

7. AgentChatPanel → actionExecutor
   executeActions([ai_query_action])

8. actionExecutor (smart detection):
   ├─> chartId from LLM? No
   ├─> Chart selected? No
   └─> Use dataset_id ✅

9. actionExecutor → Backend /ai-explore
   POST { dataset_id, user_query }

10. Backend → Gemini LLM
    Pandas code generation + execution

11. Backend → actionExecutor
    Answer: "Average capacity is 42.5 story points"

12. actionExecutor → setNodes
    Add textbox with Q&A

13. Canvas → User
    Answer appears in text box
```

### Example 3: Complex Multi-Action

**User Query**: "Compare revenue by region and explain the top performer"

**Flow**:
```
1-6. [Same as Example 1]

7. Gemini → Backend
   JSON: {
     actions: [
       { type: "create_chart", dimensions: ["region"], measures: ["revenue"], ... },
       { type: "generate_chart_insights", chartId: "NEWLY_CREATED", position: "right_of_chart", ... }
     ]
   }

8. actionExecutor
   Execute actions sequentially:
   
   Action 1: create_chart
   ├─> Call /charts
   ├─> Get chart data
   ├─> Create chart node (id: "chart-abc-123")
   └─> Store chart_id

   Action 2: generate_chart_insights
   ├─> Use newly created chartId
   ├─> Call /chart-insights with chart-abc-123
   ├─> Get AI-generated insights
   ├─> Create textbox positioned right of chart
   └─> Done

9. Canvas → User
   Chart + Insights appear together
```

## Context Management

### Canvas Context (`canvasContext`)

Passed from `App.jsx` to `AgentChatPanel`:

```javascript
canvasContext = {
  editor: tldrawEditorRef.current,  // TLDraw editor instance
  nodes,                              // Current canvas nodes
  setNodes,                           // Update canvas nodes
  getViewportCenter,                  // Calculate center position
  API,                                // Backend API URL
  datasetId,                          // Current dataset ID
  apiKey,                             // Gemini API key
  figureFromPayload                   // Chart data transformer
}
```

### Dataset Metadata

Retrieved from `DATASET_METADATA` (generated during upload):

```python
{
  "success": True,
  "dataset_summary": "Sales data from 2023...",
  "columns": [
    {
      "name": "revenue",
      "type": "float64",
      "description": "Total revenue in USD, calculated as quantity × unit_price"
    },
    ...
  ]
}
```

**Usage**: Provides semantic context to LLM for smarter action generation.

## Token Usage Tracking

### Flow:
```
1. Backend: GeminiDataFormulator.run_gemini_with_usage()
   └─> Returns: (response, token_usage)

2. Backend: /agent-query endpoint
   └─> Includes token_usage in response

3. Frontend: AgentChatPanel
   └─> Calls onTokenUsage(usage) callback

4. Frontend: App.jsx
   └─> Updates global tokenUsage state

5. Frontend: AI Settings Panel
   └─> Displays cumulative usage and cost
```

### Cost Calculation:
```javascript
// Gemini 2.0 Flash pricing
const inputCost = (inputTokens / 1000000) * 0.075;
const outputCost = (outputTokens / 1000000) * 0.30;
const estimatedCost = inputCost + outputCost;
```

## Error Handling

### Frontend Errors:

1. **No Dataset**: "Please upload a dataset first"
2. **No API Key**: "Please configure your Gemini API key"
3. **Validation Failed**: Zod error details displayed
4. **Execution Failed**: Specific action error shown
5. **Network Error**: HTTP error from backend

### Backend Errors:

1. **404**: Dataset/Chart not found
2. **400**: Invalid request (missing fields)
3. **500**: LLM failure, parsing error, execution error

### Graceful Degradation:

- If some actions fail, others still execute
- Partial success is reported clearly
- User can retry or rephrase query

## Performance Considerations

### Token Usage (Typical):
- Empty canvas: ~800 tokens
- With 3 charts: ~1200 tokens
- With metadata: +300-500 tokens
- Response: ~200-500 tokens

### Response Time:
- Canvas snapshot: <50ms
- Backend /agent-query: 1-3 seconds
- Action execution: 1-5 seconds (depending on actions)
- Total: 2-8 seconds

### Optimization:
- Canvas snapshot is lightweight (only essential data)
- Dataset metadata cached after upload
- Client-side actions (show_table) are instant
- Actions execute sequentially for dependency handling

## Security

### API Key:
- Stored in browser localStorage
- Never logged or exposed
- Sent with every Gemini request
- User-controlled

### Data:
- Dataset stored in backend memory
- Not persisted to disk
- Cleared on server restart
- HTTPS encryption for all API calls

## Limitations

### Current Constraints:
- Max 5 actions per query
- Charts can be created but not modified
- No arrow/connector creation
- No layout auto-arrangement
- No conversation memory across sessions

### Technical Limits:
- Requires Gemini API quota
- Requires dataset upload first
- TLDraw editor must be initialized
- Browser must support modern JavaScript

## Future Enhancements

### Planned Features:
1. **Chart Modification**: Edit existing charts (filters, type, colors)
2. **Arrow Creation**: Show relationships between elements
3. **Layout Management**: Auto-arrange canvas smartly
4. **Conversation Memory**: Multi-turn contextual conversations
5. **Batch Operations**: "Create 5 different views of this data"
6. **Export**: Save analysis as PDF/Markdown
7. **Undo/Redo**: Fine-grained action history
8. **Templates**: "Create a sales dashboard"

### Architecture Improvements:
1. **Action Queue**: Parallel execution where possible
2. **Caching**: Store common query results
3. **Streaming**: Show actions as they execute
4. **Webhooks**: Notify on long-running operations

## Testing Strategy

### Unit Tests:
- Validation schemas (Zod)
- Action executors (mock API calls)
- Canvas snapshot extraction
- Position calculations

### Integration Tests:
- Full flow: query → actions → canvas
- Error handling paths
- Token usage tracking
- Multi-action sequences

### E2E Tests:
```javascript
// Test 1: Simple chart creation
await agent.query("Show revenue by state");
expect(canvas.charts).toHaveLength(1);

// Test 2: AI query without charts
await agent.query("What is the average revenue?");
expect(canvas.textBoxes).toContain("Average revenue");

// Test 3: Multi-action
await agent.query("Compare sales and explain trends");
expect(canvas.charts).toHaveLength(1);
expect(canvas.textBoxes).toHaveLength(1);
```

## Debugging

### Frontend Console:
```javascript
// Canvas state
console.log(getCanvasSnapshot(editor, nodes));

// Action execution
console.log("🤖 Executing action:", action);

// Results
console.log("✅ Action completed:", result);
```

### Backend Logging:
```python
print(f"🤖 Agent query received: '{request.user_query}'")
print(f"📋 Using dataset metadata: {has_metadata}")
print(f"✅ Generated {len(actions)} actions")
print(f"📊 Token usage: {token_usage}")
```

### Browser DevTools:
- Network tab: Check API requests/responses
- Console: Check error messages and logs
- React DevTools: Inspect component state

## File Structure Summary

```
frontend/src/agentic_layer/
├── index.js                    # Public API exports
├── types.js                    # Constants and config
├── validation.js               # Zod schemas (5 action types)
├── canvasSnapshot.js           # Canvas state extraction
├── actionExecutor.js           # Action handlers (5 handlers)
└── AgentChatPanel.jsx          # UI component

backend/
├── app.py                      # /agent-query endpoint
└── gemini_llm.py               # LLM interaction + prompts

docs/
├── AGENTIC_LAYER_COMPLETE_ARCHITECTURE.md    # This file
├── AGENTIC_LAYER_EXPANSIONS.md               # Feature details
├── AGENTIC_LAYER_USER_GUIDE.md               # User documentation
└── AI_QUERY_INDEPENDENT_FIX.md               # Recent fix details
```

---

## Quick Reference

### Action Type Selection Guide

| User Intent | Action Type | Charts Required? |
|------------|-------------|------------------|
| "Show X by Y" | `create_chart` | No |
| "Add note about..." | `create_insight` | No |
| "Explain this chart" | `generate_chart_insights` | Yes |
| "What is the average...?" | `ai_query` | No |
| "Show data table" | `show_table` | Yes |

### Position Types

| Position | Behavior |
|----------|----------|
| `center` | Viewport center |
| `right_of_chart` | 850px right of reference chart |
| `below_chart` | 450px below reference chart |
| `auto` | Same as `center` |

### Context Detection Priority (ai_query)

1. Explicit `chartId` in action
2. Selected chart in editor
3. Dataset-level (fallback)

---

**Last Updated**: November 2025  
**Version**: 1.0  
**Status**: Production Ready ✅

