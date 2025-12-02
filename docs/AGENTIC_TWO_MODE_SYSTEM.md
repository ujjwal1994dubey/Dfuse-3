# AI Agent Two-Mode System

## Overview

The AI Agent now operates in two distinct modes that can be toggled by the user:

### 🟣 Canvas Mode
**Purpose**: Create visualizations and insights on the canvas

**Available Actions**:
- `create_chart` - Generate charts and add them to canvas
- `create_insight` - Add textual insights to canvas
- `show_table` - Display data tables on canvas
- `generate_chart_insights` - Generate insights for existing charts

**Behavior**:
- All responses result in visual artifacts on the canvas
- AI interprets queries as requests for visualizations
- Perfect for exploratory data analysis and building dashboards

**Example Queries**:
- "Show me revenue by region"
- "Compare top 5 products by profit"
- "Create a chart for capacity by sprint"
- "Add insights to this chart"

---

### 🔵 Ask Mode
**Purpose**: Get analytical answers directly in the chat

**Available Actions**:
- `ai_query` - Execute analytical queries and return inline answers

**Behavior**:
- All responses are textual answers displayed in the chat window
- No visual artifacts are automatically created on the canvas
- AI interprets queries as questions requiring direct answers
- Perfect for quick calculations, comparisons, and data exploration
- Each answer includes:
  - The AI-generated response
  - **"Add to Canvas"** button - Optionally save the answer to canvas
  - **"View Python Code"** toggle - See the underlying pandas code

**Example Queries**:
- "Which two sprints performed best?"
- "What is the average capacity across sprints?"
- "Find products with profit > $1000"
- "Tell me the total revenue for Q4"

**Ask Mode Features**:
1. **Inline Answers**: Results appear directly in the chat conversation
2. **Python Code Transparency**: Collapsible code viewer shows the exact pandas operations
3. **Optional Canvas Export**: "Add to Canvas" button creates a textbox with Q&A for reference
4. **Conversational Context**: Each answer is preserved in chat history

---

## Implementation Details

### Frontend Changes

#### 1. App.jsx
```javascript
// Separate state for each mode
const [canvasMessages, setCanvasMessages] = useState([]);
const [askMessages, setAskMessages] = useState([]);

// Pass both to AgentChatPanel
<AgentChatPanel
  canvasMessages={canvasMessages}
  setCanvasMessages={setCanvasMessages}
  askMessages={askMessages}
  setAskMessages={setAskMessages}
  // ... other props
/>
```

#### 2. AgentChatPanel.jsx
- **Mode Toggle**: UI control to switch between Canvas and Ask modes
- **Scoped Messages**: Each mode has its own independent conversation history
- **Mode-Specific Placeholders**: Different input placeholders and empty states
- **Mode Indicator**: Visual feedback showing current mode (🟣 Canvas / 🔵 Ask)

Key Features:
- Mode toggle button in header (left side)
- Separate clear conversation button (right side)
- Mode-specific empty state messages with example queries
- Messages include mode metadata for history tracking

### Backend Changes

#### 1. app.py
```python
class AgentQueryRequest(BaseModel):
    user_query: str
    canvas_state: Dict[str, Any]
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"
    mode: str = "canvas"  # NEW: 'canvas' or 'ask'

# Pass mode to Gemini
result = formulator.generate_agent_actions(
    query=request.user_query,
    canvas_state=request.canvas_state,
    dataset_id=request.dataset_id,
    dataset_metadata=dataset_metadata,
    mode=request.mode  # NEW
)
```

#### 2. gemini_llm.py
```python
def generate_agent_actions(
    self,
    query: str,
    canvas_state: Dict[str, Any],
    dataset_id: str,
    dataset_metadata: Optional[Dict[str, Any]] = None,
    mode: str = "canvas"  # NEW parameter
) -> Dict[str, Any]:
```

**Mode-Specific Prompts**:
- **Canvas Mode**: Strict rules to generate only visual actions (create_chart, create_insight, etc.)
- **Ask Mode**: Strict rules to generate only ai_query actions for inline answers

The LLM receives explicit instructions about which action types are allowed based on the current mode, preventing ambiguity and improving response accuracy.

#### 3. actionExecutor.js - Mode-Aware Execution

```javascript
async function aiQueryAction(action, context) {
  const { mode } = context;
  
  // Call /ai-explore endpoint
  const result = await fetch('/ai-explore', {...});
  
  if (mode === 'ask') {
    // Return data without creating canvas elements
    return {
      query, answer, python_code, code_steps,
      mode: 'ask'
    };
  } else {
    // Canvas Mode: Create textbox on canvas
    setNodes(...);
    return { insightId, query, answer, position, mode: 'canvas' };
  }
}
```

**Key Difference**: In Ask Mode, the action returns the full AI response data without creating any canvas elements. In Canvas Mode, it creates a textbox with the answer.

#### 4. AgentChatPanel.jsx - Special Message Type

```javascript
// Handle Ask Mode differently
if (mode === 'ask' && results[0].data?.mode === 'ask') {
  const aiResult = results[0].data;
  
  setCurrentMessages(prev => [...prev, {
    type: 'ai_answer',  // Special type
    query: aiResult.query,
    answer: aiResult.answer,
    python_code: aiResult.python_code,
    canvasContext  // For "Add to Canvas" button
  }]);
}
```

**MessageBubble Component**: Renders `ai_answer` type with:
- Query display (blue box)
- Answer display (cyan box)
- "Add to Canvas" button - calls `setNodes` to create textbox
- "View Python Code" toggle - shows/hides collapsible code block

---

## Benefits

### 1. **Clearer User Intent**
- Users explicitly choose whether they want visualizations or answers
- Reduces ambiguity in natural language queries
- Better UX with predictable outcomes

### 2. **Improved LLM Accuracy**
- Mode-specific prompts guide the LLM's decision-making
- Reduces hallucination and incorrect action selection
- Explicit constraints on allowed action types

### 3. **Separate Conversation Contexts**
- Canvas conversations focus on visualizations
- Ask conversations focus on data questions
- Easier to review and reference past queries

### 4. **Better Code Organization**
- Clean separation of concerns
- Easier to maintain and extend
- Mode-specific logic is isolated

### 5. **Scalability**
- Easy to add new modes in the future (e.g., "Edit Mode", "Report Mode")
- Framework for mode-specific behaviors

---

## Usage Guide

### For Users

1. **Starting a Session**:
   - Click the AI Agent button in the sidebar
   - Choose your mode using the toggle in the header

2. **Canvas Mode** 🟣:
   - Use for building visualizations
   - Ask the AI to create charts, tables, and insights
   - All results appear on the canvas
   - Perfect for dashboards and exploratory analysis

3. **Ask Mode** 🔵:
   - Use for quick data questions
   - Ask the AI to calculate, compare, or find information
   - All results appear in the chat
   - Perfect for ad-hoc queries and data exploration

4. **Switching Modes**:
   - Click the mode toggle at any time
   - Each mode retains its own conversation history
   - Switch freely based on your current need

5. **Clearing Conversation**:
   - Click the trash icon to clear current mode's history
   - Only clears the active mode (Canvas or Ask)
   - Other mode's history is preserved

### For Developers

#### Adding a New Action to Canvas Mode
1. Add action type to `types.js`
2. Create Zod schema in `validation.js`
3. Implement executor in `actionExecutor.js`
4. Update LLM prompt in `gemini_llm.py` (Canvas Mode section)

#### Adding a New Action to Ask Mode
1. Follow same steps as Canvas Mode
2. Update LLM prompt in `gemini_llm.py` (Ask Mode section)
3. Ensure action generates inline responses (not canvas artifacts)

#### Adding a New Mode
1. Add mode state to `App.jsx`
2. Update `AgentChatPanel.jsx` mode toggle UI
3. Add mode-specific instructions in `gemini_llm.py`
4. Update `AgentQueryRequest` in `app.py` with new mode value

---

## Technical Architecture

```
User Input
    ↓
[Mode Toggle (Canvas/Ask)]
    ↓
AgentChatPanel.jsx (Frontend)
    ├── Canvas Messages State
    ├── Ask Messages State
    └── Mode-Specific UI
    ↓
POST /agent-query (Backend)
    ├── mode: "canvas" or "ask"
    └── Other context (query, canvas_state, dataset_id)
    ↓
gemini_llm.py
    ├── Mode-Specific Prompt
    ├── Canvas Mode → visual actions
    └── Ask Mode → ai_query only
    ↓
Action Execution
    ├── Canvas Mode → Canvas artifacts
    └── Ask Mode → Chat responses
```

---

## Future Enhancements

1. **Edit Mode**: Allow AI to modify existing canvas elements
2. **Report Mode**: Generate formatted reports from canvas elements
3. **Collaborate Mode**: Multi-user agent interactions
4. **Mode Presets**: Save common mode configurations
5. **Mode History**: Track mode switching patterns for UX optimization

---

## Testing Checklist

### Canvas Mode
- [ ] Create single chart from query
- [ ] Create multiple charts from single query
- [ ] Generate insights for existing chart
- [ ] Show table for chart data
- [ ] Mode toggle persists conversation
- [ ] Clear conversation only clears Canvas messages

### Ask Mode
- [ ] Answer calculation question (e.g., "average capacity")
- [ ] Answer comparison question (e.g., "which sprints performed best")
- [ ] Answer filter question (e.g., "products with profit > $1000")
- [ ] Mode toggle persists conversation
- [ ] Clear conversation only clears Ask messages
- [ ] No canvas artifacts created

### Mode Switching
- [ ] Switch from Canvas to Ask
- [ ] Switch from Ask to Canvas
- [ ] Verify independent message histories
- [ ] Verify mode indicator updates
- [ ] Verify placeholder text changes
- [ ] Verify empty state messages change

### Edge Cases
- [ ] Switch modes during loading
- [ ] Error in one mode doesn't affect other
- [ ] Token usage tracked across modes
- [ ] Dataset change resets both modes appropriately

---

## Comparison: Before vs After

### Before (Single Mode)
- **Problem**: Ambiguous user intent
  - "Which sprints performed best?" → Sometimes created chart, sometimes gave answer
  - Relied heavily on prompt engineering
  - Inconsistent behavior for similar queries

### After (Two Modes)
- **Solution**: Explicit user intent
  - Canvas Mode: "Which sprints performed best?" → Creates bar chart
  - Ask Mode: "Which sprints performed best?" → Returns textual answer
  - Mode determines behavior, not just prompt
  - Consistent, predictable outcomes

---

## Cost Implications

- **No significant increase**: Mode parameter is minimal overhead
- **Potential savings**: Better LLM accuracy → fewer retries
- **Token efficiency**: Mode-specific prompts are clear and concise

---

## Conclusion

The two-mode system provides a clean architectural separation between visualization creation (Canvas Mode) and analytical querying (Ask Mode). This improves user experience, LLM accuracy, and code maintainability while requiring minimal additional code.

**Status**: ✅ Fully Implemented
**Version**: 1.0
**Last Updated**: 2024-11-18

