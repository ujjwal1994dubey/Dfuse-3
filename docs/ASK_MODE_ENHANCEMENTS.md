# Ask Mode Enhancements

## Overview

Enhanced the Ask Mode of the AI Agent to display actual AI responses directly in the chat, replicating the existing "Ask AI Query" feature within the conversational agent panel.

## Changes Made

### 1. Action Executor (`actionExecutor.js`)

**Modified `aiQueryAction` function** to be mode-aware:

```javascript
async function aiQueryAction(action, context) {
  const { mode } = context;
  
  // Call /ai-explore endpoint
  const result = await response.json();
  
  if (mode === 'ask') {
    // Ask Mode: Return full data without creating canvas elements
    return {
      query: action.query,
      answer: result.answer,
      code_steps: result.code_steps || [],
      python_code: result.code_steps ? result.code_steps.join('\n') : '',
      mode: 'ask'
    };
  } else {
    // Canvas Mode: Create textbox on canvas
    setNodes(nodes => nodes.concat({ /* textbox with answer */ }));
    return { insightId, query, answer, position, mode: 'canvas' };
  }
}
```

**Key Change**: In Ask Mode, the function now returns the full AI response data (answer, python_code, etc.) without creating any canvas artifacts.

---

### 2. Agent Chat Panel (`AgentChatPanel.jsx`)

#### A. Pass Mode to Executor

```javascript
const results = await executeActions(validated.actions, {
  ...canvasContext,
  currentQuery: userMessage,
  mode  // NEW: Pass current mode
});
```

#### B. Handle Ask Mode Responses Differently

```javascript
// Handle Ask Mode differently - show actual AI response
if (mode === 'ask' && results[0].success && results[0].data?.mode === 'ask') {
  const aiResult = results[0].data;
  
  // Add agent response with AI answer data
  setCurrentMessages(prev => [...prev, {
    type: 'ai_answer',  // Special message type
    query: aiResult.query,
    answer: aiResult.answer,
    python_code: aiResult.python_code,
    code_steps: aiResult.code_steps,
    canvasContext  // Pass context for "Add to Canvas"
  }]);
} else {
  // Canvas Mode or other actions - show regular message
  // ... existing logic ...
}
```

**Key Change**: Detect Ask Mode responses and create a special `ai_answer` message type instead of generic success message.

#### C. Enhanced MessageBubble Component

Added special rendering for `ai_answer` type messages:

```javascript
function MessageBubble({ message }) {
  const [showCode, setShowCode] = useState(false);
  const isAIAnswer = message.type === 'ai_answer';
  
  if (isAIAnswer) {
    return (
      <div>
        {/* Query Display */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p>❓ {message.query}</p>
        </div>
        
        {/* Answer Display */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
          <p>💬 Based on your real dataset, here are the results:</p>
          <p>{message.answer}</p>
        </div>
        
        {/* Action Buttons */}
        <button onClick={handleAddToCanvas}>
          → Add to Canvas
        </button>
        <button onClick={() => setShowCode(!showCode)}>
          {showCode ? '▼' : '▶'} View Python Code
        </button>
        
        {/* Python Code (Collapsible) */}
        {showCode && (
          <pre className="bg-gray-900 text-green-400">
            {message.python_code}
          </pre>
        )}
      </div>
    );
  }
  
  // ... regular message rendering ...
}
```

**Features**:
1. **Query Display**: Blue box showing the user's question
2. **Answer Display**: Cyan box with the AI-generated answer
3. **Add to Canvas**: Button that creates a textbox on the canvas with the Q&A
4. **View Python Code**: Collapsible section showing the underlying pandas code
5. **Timestamp**: Shows when the answer was generated

---

## User Experience

### Before (Old Ask Mode)
```
User: "What is the average points completed across all sprints?"

AI: ✅ Created 1 item:
    • ✅ Answered: "What is the average PointsCompleted across all spr..."
    💡 Direct query to calculate and return average points completed.
```
**Problem**: Generic filler message, no actual answer visible, no code transparency.

### After (Enhanced Ask Mode)
```
User: "What is the average points completed across all sprints?"

AI: 
┌─────────────────────────────────────────────────────┐
│ ❓ What is the average PointsCompleted across all   │
│    sprints?                                         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 💬 Based on your real dataset, here are the results│
│                                                     │
│ Average PointsCompleted across all sprints:        │
│ 72.5                                                │
└─────────────────────────────────────────────────────┘

[→ Add to Canvas]  [▶ View Python Code]
```

**Benefits**:
- ✅ Actual answer is visible immediately
- ✅ Clean, structured display
- ✅ Optional canvas export
- ✅ Code transparency for trust

---

## Technical Flow

```
User Query (Ask Mode)
    ↓
Backend generates ai_query action
    ↓
actionExecutor.aiQueryAction()
    ├── Calls /ai-explore endpoint
    ├── Receives: { answer, code_steps, reasoning_steps, ... }
    └── Returns data WITHOUT creating canvas elements
    ↓
AgentChatPanel detects Ask Mode response
    ├── Creates 'ai_answer' type message
    └── Stores: { query, answer, python_code, canvasContext }
    ↓
MessageBubble renders special UI
    ├── Query box (blue)
    ├── Answer box (cyan)
    ├── "Add to Canvas" button
    └── "View Python Code" toggle
    ↓
User can optionally add to canvas
```

---

## Code Integration Points

### 1. Mode Detection
```javascript
if (mode === 'ask' && results[0].data?.mode === 'ask')
```

### 2. Data Structure
```javascript
{
  type: 'ai_answer',
  query: string,
  answer: string,
  python_code: string,
  code_steps: string[],
  canvasContext: object,
  timestamp: Date
}
```

### 3. Canvas Export
```javascript
const handleAddToCanvas = () => {
  const { setNodes, getViewportCenter } = message.canvasContext;
  setNodes(nodes => nodes.concat({
    id: `ai-answer-${Date.now()}`,
    type: 'textbox',
    data: {
      text: `❓ ${message.query}\n\n💬 ${message.answer}`,
      aiGenerated: true
    }
  }));
};
```

---

## Styling

- **Query Box**: `bg-blue-50 border-blue-200` - Blue theme
- **Answer Box**: `bg-cyan-50 border-cyan-200` - Cyan theme
- **Code Block**: `bg-gray-900 text-green-400` - Terminal theme
- **Buttons**: `border hover:bg-cyan-50` - Clean, minimal

---

## Testing Checklist

### Ask Mode
- [x] Query "What is the average capacity?"
  - Response shows actual number
  - Python code is visible
  - Add to Canvas creates textbox
- [x] Query "Which two sprints performed best?"
  - Response shows sprint names
  - Python code shows filtering logic
  - Add to Canvas preserves Q&A format
- [x] Python code toggle
  - Initially collapsed
  - Expands on click
  - Shows properly formatted code
- [x] Add to Canvas
  - Creates textbox at center
  - Preserves Q&A format
  - Includes metadata (aiGenerated, createdBy)

### Canvas Mode (Unchanged)
- [x] Query "Show me revenue by region"
  - Creates chart on canvas
  - Shows success message
  - No inline answer in chat

---

## Future Enhancements

1. **Code Syntax Highlighting**: Use a library like Prism.js for better code display
2. **Copy Code Button**: Allow users to copy Python code to clipboard
3. **Export as Markdown**: Export Q&A as markdown file
4. **Follow-up Questions**: Allow clicking on answer to ask follow-up
5. **Table Display**: If `tabular_data` exists, show it as a formatted table
6. **Chart Suggestions**: If data is suitable for visualization, suggest chart creation

---

## Comparison with Existing "Ask AI Query" Feature

| Feature | Standalone "Ask AI Query" | Agent Ask Mode |
|---------|---------------------------|----------------|
| Query Input | Modal dialog | Chat interface |
| Answer Display | Modal with sections | Inline chat bubble |
| Python Code | Collapsible section | Collapsible section |
| Add to Canvas | Button | Button |
| Conversation History | None | Full chat history |
| Context Awareness | Single query | Multi-turn conversation |
| Mode Switching | N/A | Toggle between Canvas/Ask |

**Advantage**: Agent Ask Mode provides a **conversational interface** with full history, while maintaining the same transparency and features as the standalone modal.

---

## Status

✅ **Fully Implemented and Tested**

**Files Modified**:
- `frontend/src/agentic_layer/actionExecutor.js`
- `frontend/src/agentic_layer/AgentChatPanel.jsx`
- `docs/AGENTIC_TWO_MODE_SYSTEM.md`

**Version**: 1.2
**Last Updated**: 2024-11-19

---

## Version 1.2 Updates (2024-11-19)

### UI Improvements

1. **Removed Query Repetition**
   - No longer shows the blue box with "❓ What are the key..." above the answer
   - User already sees their question in the chat history above
   - Cleaner, more focused display

2. **Removed Intro Line**
   - No longer shows "💬 Based on your real dataset, here are the results:"
   - Direct answer presentation
   - Reduces visual clutter

3. **Embedded Table Display**
   - When AI returns tabular data (e.g., summary statistics), it now renders as a proper HTML table
   - Table is embedded directly in the cyan answer box
   - Features:
     - Column headers with cyan background
     - Bordered cells for clear data separation
     - Hover effect on rows
     - Automatically shows first 10 rows with count indicator
     - Responsive with horizontal scrolling for wide tables
   - Perfect for queries like:
     - "Summarize the dataset"
     - "Show top 10 products by revenue"
     - "Compare metrics across categories"

### Updated UI Example

**Before v1.2**:
```
┌─────────────────────────────────────────────────────┐
│ ❓ What are the key summary statistics for the      │
│    entire dataset?                                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 💬 Based on your real dataset, here are the results│
│                                                     │
│ Summary statistics for numerical columns:          │
│ [long text output...]                               │
└─────────────────────────────────────────────────────┘
```

**After v1.2**:
```
┌─────────────────────────────────────────────────────┐
│ Summary statistics for numerical columns:          │
│                                                     │
│ ┌─────────┬───────┬──────┬─────┬─────┐            │
│ │ Column  │ Count │ Mean │ Std │ Min │            │
│ ├─────────┼───────┼──────┼─────┼─────┤            │
│ │ Revenue │ 149   │46961 │30282│ 104 │            │
│ │ Units   │ 149   │  94  │  59 │   1 │            │
│ └─────────┴───────┴──────┴─────┴─────┘            │
│                                                     │
│ [Showing first 10 of 8 rows]                       │
└─────────────────────────────────────────────────────┘

[→ Add to Canvas]  [▶ View Python Code]
```

### Technical Changes

**AgentChatPanel.jsx - Message State**:
```javascript
setCurrentMessages(prev => [...prev, {
  type: 'ai_answer',
  query: aiResult.query,
  answer: aiResult.answer,
  python_code: aiResult.python_code,
  code_steps: aiResult.code_steps,
  tabular_data: aiResult.tabular_data || [],  // NEW
  has_table: aiResult.has_table || false,     // NEW
  timestamp: new Date(),
  mode,
  canvasContext
}]);
```

**MessageBubble Component - Table Rendering**:
```javascript
if (isAIAnswer) {
  // Parse tabular data if available
  const hasTable = message.has_table && message.tabular_data && message.tabular_data.length > 0;
  let headers = [];
  let rows = [];
  
  if (hasTable) {
    headers = Object.keys(message.tabular_data[0]);
    rows = message.tabular_data.map(row => Object.values(row));
  }
  
  return (
    <div>
      {/* Answer box */}
      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
        <p>{message.answer}</p>
        
        {/* Embedded table */}
        {hasTable && (
          <table className="min-w-full border-collapse">
            {/* headers & rows */}
          </table>
        )}
      </div>
    </div>
  );
}
```

### Benefits of v1.2

- **Less Repetition**: No redundant query display
- **Cleaner UI**: Direct answer without unnecessary intro text
- **Better Data Display**: Tables are much easier to read than raw text
- **More Professional**: Structured presentation of statistical data
- **Maintains Functionality**: All existing features (Add to Canvas, View Code) work perfectly

