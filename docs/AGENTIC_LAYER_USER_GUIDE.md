# AI Agent User Guide 🤖

## Quick Start

The AI Agent helps you create visualizations and analyze your data through natural conversation. Click the **✨ AI Agent** button in the sidebar to open the agent panel.

## What Can the Agent Do?

### 1. 📊 Create Charts
Ask the agent to visualize your data in various ways.

**Examples**:
- "Show me revenue by product category"
- "Compare sales across regions"
- "Create a chart of profit by quarter"
- "Visualize the top 10 customers by order value"

**What Happens**: The agent creates a chart on your canvas using the appropriate dimensions and measures from your dataset.

---

### 2. 💡 Generate Insights
Ask the agent to explain patterns, trends, or anomalies in your charts.

**Examples**:
- "Why is revenue so high in Q3?"
- "Explain this trend"
- "What's causing the spike in California?"
- "Generate insights for this chart"

**What Happens**: The agent analyzes the chart data and creates a text box with AI-generated insights explaining the patterns.

---

### 3. 💬 Answer Questions
Ask analytical questions about your data without creating a chart.

**Examples**:
- "What is the average order value?"
- "How many customers ordered more than $1000?"
- "Which region has the highest profit margin?"
- "Compare Q1 performance to Q4"

**What Happens**: The agent analyzes your data and provides a direct answer in a text box.

---

### 4. 📋 Show Data Tables
Ask to see the exact numbers behind any chart.

**Examples**:
- "Show me the data table"
- "Let me see the exact numbers"
- "Display the underlying values"
- "What are the raw numbers?"

**What Happens**: The agent creates a table next to your chart showing all the data values.

---

### 5. 📝 Add Explanations
Ask the agent to add context or explanations to your canvas.

**Examples**:
- "Add a note explaining the methodology"
- "Create a summary of key findings"
- "Write an executive summary"

**What Happens**: The agent creates a text box with the requested content.

---

## Tips for Best Results

### ✅ Good Queries
- Be specific about what you want to see
- Mention column names from your dataset when possible
- Use action verbs: "show", "compare", "explain", "create"
- Reference existing charts: "explain this chart", "show table for this"

### ❌ Avoid
- Vague requests: "show me something interesting"
- Requests outside the dataset: "compare with last year" (if last year's data isn't loaded)
- Multiple unrelated requests in one message

---

## Example Workflows

### Workflow 1: Exploratory Analysis
1. **You**: "Show revenue by state"
2. **Agent**: Creates a bar chart
3. **You**: "Generate insights for this chart"
4. **Agent**: Adds insights text box explaining state patterns
5. **You**: "Show me the data table"
6. **Agent**: Creates table with exact values

### Workflow 2: Comparative Analysis
1. **You**: "Compare sales by product category and region"
2. **Agent**: Creates appropriate chart(s)
3. **You**: "Which category performs best?"
4. **Agent**: Answers with analysis text box
5. **You**: "Explain why"
6. **Agent**: Generates detailed insights

### Workflow 3: Quick Question
1. **You**: "What is the average profit margin?"
2. **Agent**: Provides direct answer
3. **You**: "Which products are above average?"
4. **Agent**: Creates filtered chart or provides list

---

## Understanding Agent Responses

### Success Messages
```
✅ Completed 2 action(s):
• Created chart: revenue, profit by state
• Generated AI insights for chart

💡 I created a visualization and added insights to help you understand the state-level performance patterns.
```

### Error Messages
```
❌ 1 action(s) failed:
• Failed: Chart xyz not found

The agent will explain what went wrong and you can try rephrasing your request.
```

---

## Multi-Action Responses

The agent can perform multiple actions in one response (up to 5 actions):

**Example Query**: "Compare revenue by region and explain the top performer"

**Agent Actions**:
1. Creates a chart showing revenue by region
2. Generates insights explaining which region is top and why

---

## Working with Canvas Context

The agent "sees" your current canvas and can:
- Reference existing charts by position
- Avoid creating duplicate visualizations
- Place new elements strategically (center, right of chart, below chart)

**Example**: If you have a revenue chart on canvas and ask "explain the trend", the agent knows which chart you're referring to.

---

## Token Usage & Costs

The agent uses Gemini 2.0 Flash API tokens. You can monitor usage in **AI Settings**:

- **Input tokens**: Your query + canvas state + dataset context
- **Output tokens**: Agent's reasoning + action plan
- **Estimated cost**: Calculated at $0.075 per 1M input, $0.30 per 1M output

**Typical costs per query**:
- Create chart: ~$0.002-0.005
- Generate insights: ~$0.005-0.010
- Answer question: ~$0.001-0.003
- Show table: $0 (client-side only)

---

## Requirements

Before using the AI Agent:
1. ✅ Upload a dataset (CSV file)
2. ✅ Configure Gemini API key in settings
3. ✅ Ensure you have token quota available

---

## Troubleshooting

### "Please upload a dataset first"
**Solution**: Upload a CSV file using the upload panel before asking questions.

### "Please configure your Gemini API key in settings"
**Solution**: Open AI Settings and enter your Gemini API key.

### "Chart xyz not found"
**Solution**: The agent tried to reference a chart that doesn't exist. Try creating a chart first, or be more specific about which chart you're referring to.

### "429 Too Many Requests"
**Solution**: You've exceeded your token quota. Check token usage in settings and wait or upgrade your quota.

### Empty or incorrect results
**Solution**: Try rephrasing your question with more specific column names or clearer intent.

---

## Privacy & Data

- Your dataset is processed in-memory and sent to Gemini API for analysis
- No data is permanently stored by the agent
- All API calls use HTTPS encryption
- Your API key is stored locally in browser storage

---

## Keyboard Shortcuts

- **Enter**: Send message to agent
- **Escape**: Close agent panel

---

## Advanced Tips

### 1. Chain Multiple Requests
Instead of one complex request, break it into steps:
```
1. "Show revenue by product"
2. "Generate insights"
3. "Show the data table"
```

### 2. Use Context
Reference things already on canvas:
```
"Explain this trend" (agent looks at selected/recent chart)
"Add a table for this chart"
```

### 3. Combine Actions
Ask for multiple things at once:
```
"Create a profit chart and generate insights"
"Show top 5 regions and explain why they're top"
```

### 4. Iterate
Refine results by asking follow-ups:
```
"Show revenue by state"
"Only show top 10"
"Add profit as a second measure"
```

---

## What the Agent CANNOT Do (Yet)

- ❌ Modify existing charts (change type, filters, etc.)
- ❌ Create arrows or connect elements
- ❌ Delete or move existing elements
- ❌ Export or download results
- ❌ Access data outside your uploaded dataset
- ❌ Remember conversations across sessions

These features may be added in future updates!

---

## Getting Help

If the agent doesn't understand your request:
1. Try rephrasing with simpler language
2. Be more specific about column names
3. Break complex requests into smaller steps
4. Check the console for error messages (F12)

---

## Example Queries Cheat Sheet

### Creating Visualizations
- "Show [measure] by [dimension]"
- "Compare [measure] across [dimension]"
- "Visualize top 10 [dimension] by [measure]"
- "Create a chart of [measure] over time"

### Generating Insights
- "Why is [measure] high in [value]?"
- "Explain this trend"
- "What's causing the spike?"
- "Generate insights for this chart"

### Answering Questions
- "What is the average [measure]?"
- "How many [dimension] are above [threshold]?"
- "Which [dimension] has the highest [measure]?"
- "Compare [period1] to [period2]"

### Showing Data
- "Show me the data table"
- "Display exact numbers"
- "Let me see the raw values"

### Adding Context
- "Add a note explaining [topic]"
- "Summarize key findings"
- "Write an explanation of [concept]"

---

## Feedback

The AI Agent is continuously improving! If you encounter issues or have suggestions, please provide feedback through the application settings.

---

**Happy Analyzing! 🎉📊**

