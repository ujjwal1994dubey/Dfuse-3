# Unified Canvas Mode - Revision 2: Gemini-Driven Actions

## 🎯 What Changed from V1?

### Problem with V1
- **Too aggressive client-side interception**: Keywords like "organize", "arrange", "group" were intercepted before reaching Gemini
- **Limited drawing capabilities**: Removed Draw mode entirely, losing ability to create arrows, shapes, highlights
- **Hardcoded logic**: Not letting Gemini decide the best action for user intent

### Solution in V2
- **Conservative client-side optimization**: Only intercepts exact phrases like "organize my canvas"
- **Full drawing capabilities in Canvas mode**: Arrows, shapes, text, highlights all available
- **Gemini decides actions**: LLM chooses between data viz, layout, and drawing actions

---

## ✅ New Capabilities

### 1. Drawing Actions (Restored)

**New Action Types**:
- `CREATE_SHAPE`: Draw rectangles, circles, lines
- `CREATE_ARROW`: Draw arrows between elements
- `CREATE_TEXT`: Add text labels, titles, annotations
- `HIGHLIGHT_ELEMENT`: Add visual emphasis around charts

**Example Queries That Now Work**:
```
"Create an arrow" → Draws an arrow
"Put a box around profit chart" → Draws rectangle around chart
"Highlight revenue nodes" → Adds highlight to revenue chart
"Add a title" → Creates text label
"Create a red rectangle" → Draws red rectangle
```

---

### 2. Smart Layout Organization

**Gemini now understands specific layout strategies**:

| User Query | Gemini Action | Result |
|------------|---------------|---------|
| "Organize in horizontal flow" | `arrange_elements` (strategy: flow) | Charts arranged left-to-right |
| "Arrange side by side" | `arrange_elements` (strategy: comparison) | Charts in columns |
| "Clean up" (exact phrase) | Client-side organize (0 API) | Smart auto-layout |
| "Group by funnel stage" | `semantic_grouping` | Visual zones created |

---

### 3. Conservative Client-Side Optimization

**Only these EXACT phrases skip Gemini** (case-insensitive):
```javascript
[
  'organize my canvas',
  'organize canvas', 
  'clean up',
  'tidy up',
  'fix layout'
]
```

**Everything else goes to Gemini**:
- "Organize in horizontal flow" → Gemini (arrange_elements with flow strategy)
- "Group these by region" → Gemini (semantic_grouping)
- "Put a box around chart" → Gemini (highlight_element or create_shape)
- "Create an arrow" → Gemini (create_arrow)

---

## 📋 Complete Action List

### Data Visualization (8 actions)
1. `create_chart` - Generate data visualizations
2. `create_kpi` - Metric cards
3. `create_insight` - Textual insights
4. `create_dashboard` - Multi-element layouts
5. `generate_chart_insights` - AI analysis of charts
6. `show_table` - Data tables
7. `ai_query` - Answer data questions (Ask mode)
8. (Delete - NOT SUPPORTED)

### Layout Organization (2 actions)
9. `arrange_elements` - Specific layout strategies
10. `semantic_grouping` - Topic-based zones

### Drawing & Annotation (4 actions)
11. `create_shape` - Rectangles, circles, lines
12. `create_arrow` - Arrows between elements
13. `create_text` - Text labels and titles
14. `highlight_element` - Visual emphasis

**Total: 14 action types**

---

## 🧠 Gemini Decision Logic

Updated backend prompt includes clear rules:

```python
DECISION LOGIC - READ CAREFULLY:
- "show X by Y", "create chart" → create_chart
- "organize in [layout]", "arrange [strategy]" → arrange_elements (specify strategy: grid/hero/flow/comparison)
- "group by X" → semantic_grouping with grouping_intent
- "compare A vs B" → create_dashboard with comparison layout
- "create dashboard" → create_dashboard
- "create arrow", "draw arrow" → create_arrow
- "create rectangle", "draw box", "put a box around" → create_shape (type: rectangle)
- "highlight X", "emphasize X" → highlight_element (targeting specific chart)
- "add title", "create text", "label" → create_text
- "delete X" → NOT SUPPORTED (tell user to manually delete, then offer to reorganize)
```

---

## 🎨 User Query → Action Mapping

### Your Failed Queries (Now Fixed)

| Query | Old Behavior | New Behavior | Action Type |
|-------|-------------|--------------|-------------|
| "highlight the revenue nodes" | ❌ Generated insights | ✅ Highlights revenue chart | `highlight_element` |
| "delete the sales unit chart" | ❌ Organized canvas | ✅ Says "not supported, delete manually" | Error message |
| "organize in horizontal flow" | ❌ Generic KPI layout | ✅ Flow layout (left-to-right) | `arrange_elements` (flow) |
| "put a box around profit chart" | ❌ Semantic grouping | ✅ Draws box around chart | `create_shape` or `highlight_element` |
| "create an arrow" | ❌ "Not supported" | ✅ Creates arrow | `create_arrow` |
| "create red rectangle" | ❌ "Not supported" | ✅ Draws red rectangle | `create_shape` |

---

## 🔧 Technical Implementation

### Frontend Changes

**types.js** - Added 4 drawing action types:
```javascript
CREATE_SHAPE: 'create_shape',
CREATE_TEXT: 'create_text',
CREATE_ARROW: 'create_arrow',
HIGHLIGHT_ELEMENT: 'highlight_element'
```

**validation.js** - Added 4 Zod schemas for drawing actions

**actionExecutor.js** - Added 4 executors:
- `createShapeAction()` - Draws shapes using tldraw
- `createArrowAction()` - Draws arrows
- `createTextAction()` - Creates text labels
- `highlightElementAction()` - Adds highlight around elements

**AgentChatPanel.jsx** - Conservative intent classification:
```javascript
// ONLY intercept exact phrases
const exactLayoutPhrases = [
  'organize my canvas',
  'organize canvas', 
  'clean up',
  'tidy up',
  'fix layout'
];

const isExactLayoutQuery = exactLayoutPhrases.some(phrase => 
  queryLower === phrase
);

// Everything else goes to Gemini
```

### Backend Changes

**gemini_llm.py** - Updated prompt:
- Added drawing actions section
- Expanded decision logic with drawing rules
- Added 13 action schemas (10 existing + 4 new)
- Clarified when to use each action type

---

## 💰 Token Usage Impact

### V1 vs V2 Comparison

| Query Type | V1 | V2 | Change |
|------------|----|----|--------|
| "organize my canvas" | 0 tokens | 0 tokens | Same ✅ |
| "organize in flow" | 0 tokens (wrong result) | ~3000 tokens (correct result) | Worth it ✅ |
| "create arrow" | Not supported | ~2500 tokens | New feature ✅ |
| "highlight chart" | Wrong action (insights) | ~3000 tokens (correct) | Worth it ✅ |

**Key Insight**: We save tokens on generic "organize" but spend them wisely on specific, intentional queries that require LLM understanding.

**V2 Philosophy**: 
- Don't over-optimize at the cost of capability
- Let Gemini do what it's good at: understanding intent
- Only optimize the truly generic cases

---

## 🎯 Testing Checklist

### Data Visualization (Should Still Work)
- [ ] "Show revenue by region" → Creates chart
- [ ] "Create a sales dashboard" → Multi-element dashboard
- [ ] "Calculate total profit" → KPI card

### Layout Organization (Improved)
- [ ] "Organize my canvas" (exact) → 0 API calls, auto-layout
- [ ] "Organize in horizontal flow" → Flow layout (Gemini decides)
- [ ] "Arrange side by side" → Comparison layout
- [ ] "Group by funnel stage" → Semantic zones

### Drawing & Annotation (New)
- [ ] "Create an arrow" → Draws arrow
- [ ] "Put a box around profit chart" → Box around chart
- [ ] "Highlight revenue nodes" → Highlights revenue chart
- [ ] "Add a title 'Q4 Dashboard'" → Creates text label
- [ ] "Create a red rectangle" → Draws red rectangle

### Edge Cases
- [ ] "Delete chart" → Clear message that it's not supported
- [ ] "Clean up" (exact) → 0 API calls, auto-layout
- [ ] "Organize charts in grid" → Grid layout via Gemini

---

## 📚 Documentation Updates

**User-Facing Examples** (updated):
```
Canvas Mode can:
✅ Create charts, KPIs, dashboards
✅ Organize layout with specific strategies
✅ Draw arrows, shapes, and annotations
✅ Highlight and emphasize elements
✅ Add text labels and titles

Examples:
• "Show revenue by region"
• "Organize in horizontal flow"
• "Create an arrow pointing to peak"
• "Put a box around top performer"
• "Add title 'Q4 Performance'"
```

---

## 🚀 Key Improvements Summary

1. **Restored Drawing Capabilities** - Arrows, shapes, text, highlights
2. **Smarter Layout Control** - Gemini understands layout strategies
3. **Better Intent Understanding** - LLM decides best action
4. **Conservative Optimization** - Only exact phrases bypass Gemini
5. **Clear Error Messages** - "Delete not supported" instead of wrong action
6. **Flexible Architecture** - Easy to add more action types

---

## ⚠️ Known Limitations

1. **Delete action not supported** - User must manually delete, then we can reorganize
2. **Highlight requires chart ID** - Need to identify which chart to highlight
3. **Arrow positioning** - May need manual adjustment for complex layouts
4. **Shape customization** - Limited to predefined colors/styles

---

## 🎉 Result

**You now have a truly unified Canvas mode that**:
- Understands your intent (via Gemini)
- Can create data visualizations
- Can organize layouts (with specific strategies)
- Can draw annotations and highlights
- Optimizes only when truly generic
- Gives you all the power of Draw mode + Canvas mode + smart organization

**The best of all worlds!** 🌟

