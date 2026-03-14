/**
 * TLDraw Agent - AI-powered drawing agent using Gemini
 * Enables natural language drawing and shape manipulation on tldraw canvas
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';

/**
 * TLDraw Agent Configuration
 */
export const TLDRAW_AGENT_CONFIG = {
  model: 'gemini-2.5-flash', // Remove 'models/' prefix for Vercel AI SDK
  // Alternative models (in order of recommendation):
  // 'gemini-1.5-flash-latest' - Fast, generous free tier (BEST FOR FREE)
  // 'gemini-1.5-pro-latest' - More capable, moderate free tier
  // 'gemini-2.0-flash-exp' - Gemini 2.0, experimental, limited free tier
  // 'gemini-pro' - Stable fallback option
  temperature: 0.7,
  maxTokens: 2000
};

/**
 * System prompt for tldraw agent with spatial awareness
 */
const TLDRAW_SYSTEM_PROMPT = `You are an intelligent Visual Data Exploration assistant.

CONTEXT: You have access to data dashboards with AI-analyzed semantic information about each chart.

CAPABILITIES:

1. SEMANTIC HIGHLIGHTING:
   - Charts have AI-generated descriptions of their columns
   - Filter charts by business meaning (revenue, cost, profit, temporal, etc.)
   - Use semanticTags array: ["revenue", "financial", "temporal"]

2. STICKY NOTES:
   - Add context-aware notes near specific charts
   - Use dataset summary and column descriptions for context
   - Create as 'sticky_note' shape type with text, position, and size
   - Automatically positioned near relevant charts

3. VISUAL GROUPING:
   - Group charts by semantic similarity
   - Create labeled zones for related visualizations

4. ORGANIZATION GUIDES:
   - Draw layout guides and section dividers

5. CHART CONNECTIONS:
   - Draw arrows showing data relationships

6. DASHBOARD ANNOTATIONS:
   - Create dashboard titles and section headers
   - Add labels and professional annotations
   - Draw visual guides (boxes, arrows, highlights, dividers)

SEMANTIC UNDERSTANDING:
Charts include:
- semanticTags: AI-extracted categories like ["revenue", "financial"]
- Original measures/dimensions with AI descriptions
- Business context from dataset summary

DECISION EXAMPLES:

User: "Highlight all revenue charts"
→ Filter charts where semanticTags includes "revenue"
→ Generate yellow highlight boxes around matches

User: "Add a note explaining the revenue drop"
→ Find charts with "revenue" in semanticTags
→ Position sticky note with dataset context
→ Use shape: "sticky_note" with text and position props
→ Use AI column descriptions for relevance

User: "Group financial metrics together"
→ Filter charts with "financial" in semanticTags
→ Calculate bounding box
→ Create labeled zone "Financial Metrics"

User: "Draw an arrow from total to breakdown"
→ Identify KPI and detail chart by semantic tags
→ Generate arrow with positioning

User: "Add dashboard title"
→ Large centered text at (-100, -500), w: 700 for visibility

**CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no comments.**

Return responses in this EXACT JSON format:
{
  "actions": [
    {
      "type": "create_shape",
      "shape": "rectangle",
      "props": {
        "x": 100, "y": 100, "w": 400, "h": 300,
        "color": "yellow", "fill": "semi", "dash": "dashed"
      }
    }
  ],
  "explanation": "Highlighted 3 revenue charts based on semantic analysis"
}

CRITICAL JSON RULES:
- No trailing commas
- All strings must use double quotes
- No comments (// or /* */)
- No markdown code blocks
- For multiple shapes, add more objects to actions array

Color Guidelines:
- Blue: Professional titles, headers, KPI sections
- Green: Positive trends, growth indicators
- Red: Warnings, important callouts, decline indicators
- Orange: Highlights, attention markers
- Black: General labels, neutral content
- Yellow: Semantic highlights, review areas

Position Guidelines:
- Dashboard titles: High above content (y: -400 to -600), centered, large text (w: 600-800)
- Section headers: Above content areas (y: -100 to -200), medium text (w: 300-500)
- Labels: Near related content, small text (w: 150-300)
- Arrows: Point from label to target
- Dividers: Horizontal/vertical lines to separate sections

SPATIAL AWARENESS - Working with Existing Elements:

You will receive context about charts, KPIs, and tables with EXACT positions.
Use their positions for precise annotations:

1. Connecting Elements with Arrows:
   - Find A and B in context
   - Arrow start: A.centerX, A.centerY
   - Arrow end: B.centerX, B.centerY
   - Use w and h as deltas: w = endX - startX, h = endY - startY

2. Labeling Charts:
   - Place text ABOVE chart: x = chart.centerX - 100, y = chart.bounds.y - 60

3. Highlighting Areas (boxes around items):
   - For "box for each X": Create ONE rectangle per item
   - Draw rectangle AROUND bounds with 20px padding
   - x = bounds.x - 20, y = bounds.y - 20
   - w = bounds.width + 40, h = bounds.height + 40

4. Semantic Grouping:
   - Filter charts by semantic criteria
   - Calculate bounding box for group
   - Add labeled background zone

IMPORTANT TEXT VISIBILITY:
- Text shapes MUST have w: 400+ to be visible (wider shapes = larger text)
- For titles: w: 600-800 recommended
- For labels: w: 200-400 minimum
- For titles: Use y: -400 to -600 to place HIGH above content

SHAPE TYPES:
- "rectangle" - Basic rectangle
- "ellipse" or "circle" - Circle/ellipse shape
- "arrow" - Arrow connecting elements (use x, y, w, h as start and delta)
- "line" - Straight line
- "text" - Text only (requires large w for visibility)
- "sticky_note" - Composite shape with colored background + text (for annotations)

EXAMPLE 1: Multiple rectangles
User: "Create red box for each chart"
Context: 2 charts at positions
Response:
{
  "actions": [
    {
      "type": "create_shape",
      "shape": "rectangle",
      "props": {
        "x": 80,
        "y": 80,
        "w": 440,
        "h": 340,
        "color": "red"
      }
    },
    {
      "type": "create_shape",
      "shape": "rectangle",
      "props": {
        "x": 580,
        "y": 80,
        "w": 440,
        "h": 340,
        "color": "red"
      }
    }
  ],
  "explanation": "Created red highlight boxes around both charts"
}

EXAMPLE 2: Sticky note
User: "Add a note about revenue trends"
Context: Revenue chart at (500, 200)
Response:
{
  "actions": [
    {
      "type": "create_shape",
      "shape": "sticky_note",
      "props": {
        "x": 900,
        "y": 200,
        "w": 250,
        "h": 120,
        "text": "Revenue shows upward trend from Q1 to Q4",
        "color": "yellow"
      }
    }
  ],
  "explanation": "Added sticky note explaining revenue trend"
}
`;

/**
 * Build context description from enhanced canvas context
 * Formats charts, KPIs, tables, and annotations into readable text for AI
 */
function buildContextDescription(ctx) {
  let desc = 'Current Canvas State:\n';
  
  // Include dataset semantic context from AI analysis
  if (ctx.datasetAnalysis) {
    const analysis = ctx.datasetAnalysis;
    
    desc += '\nDATASET CONTEXT (AI-GENERATED):\n';
    if (analysis.dataset_summary) {
      desc += `Purpose: ${analysis.dataset_summary}\n\n`;
    }
    
    if (analysis.columns && analysis.columns.length > 0) {
      desc += 'COLUMN SEMANTICS:\n';
      analysis.columns.forEach(col => {
        desc += `- ${col.name} (${col.dtype}): ${col.description || 'No description'}\n`;
      });
      desc += '\n';
    }
  }
  
  if (ctx.charts && ctx.charts.length > 0) {
    desc += `📊 CHARTS (${ctx.charts.length}):\n`;
    ctx.charts.forEach((c, i) => {
      desc += `${i + 1}. "${c.title}" (${c.chartType})\n`;
      desc += `   Position: (${Math.round(c.bounds.x)}, ${Math.round(c.bounds.y)})\n`;
      desc += `   Center: (${Math.round(c.bounds.centerX)}, ${Math.round(c.bounds.centerY)})\n`;
      desc += `   Size: ${c.bounds.width}x${c.bounds.height}\n`;
      if (c.dimensions && c.dimensions.length > 0) {
        desc += `   Data: ${c.dimensions.join(', ')} → ${c.measures.join(', ')}\n`;
      }
      // Add semantic tags from AI analysis
      if (c.semanticTags && c.semanticTags.length > 0) {
        desc += `   Semantic tags: [${c.semanticTags.join(', ')}]\n`;
      }
    });
  }
  
  if (ctx.kpis && ctx.kpis.length > 0) {
    desc += `\n📈 KPI CARDS (${ctx.kpis.length}):\n`;
    ctx.kpis.forEach((k, i) => {
      desc += `${i + 1}. "${k.title}": ${k.formattedValue}\n`;
      desc += `   Position: (${Math.round(k.bounds.x)}, ${Math.round(k.bounds.y)})\n`;
      desc += `   Center: (${Math.round(k.bounds.centerX)}, ${Math.round(k.bounds.centerY)})\n`;
      desc += `   Size: ${k.bounds.width}x${k.bounds.height}\n`;
      // Add semantic tags
      const titleLower = k.title.toLowerCase();
      const queryLower = (k.query || '').toLowerCase();
      if (titleLower.includes('profit') || queryLower.includes('profit')) {
        desc += `   Tags: profit-related\n`;
      }
      if (titleLower.includes('revenue') || queryLower.includes('revenue')) {
        desc += `   Tags: revenue-related\n`;
      }
    });
  }
  
  if (ctx.tables && ctx.tables.length > 0) {
    desc += `\n📋 TABLES (${ctx.tables.length}):\n`;
    ctx.tables.forEach((t, i) => {
      desc += `${i + 1}. "${t.title}"\n`;
      desc += `   Position: (${Math.round(t.bounds.x)}, ${Math.round(t.bounds.y)})\n`;
      desc += `   Size: ${t.bounds.width}x${t.bounds.height}\n`;
    });
  }
  
  if (ctx.annotations && ctx.annotations.length > 0) {
    desc += `\n✏️ EXISTING ANNOTATIONS (${ctx.annotations.length}):\n`;
    ctx.annotations.forEach((a, i) => {
      desc += `${i + 1}. ${a.shapeType} at (${Math.round(a.bounds.x)}, ${Math.round(a.bounds.y)})\n`;
      desc += `   Size: ${Math.round(a.bounds.width)}x${Math.round(a.bounds.height)}\n`;
      if (a.text) desc += `   Label: "${a.text}"\n`;
    });
  }
  
  if (!ctx.charts?.length && !ctx.kpis?.length && !ctx.tables?.length && !ctx.annotations?.length) {
    desc += '\nCanvas is empty - no charts, KPIs, or annotations present.\n';
  }
  
  // Add filtering tips
  desc += '\n💡 FILTERING TIP: Use Tags to identify items. Example: "box for each profit-related" means find all items with "Tags: profit-related"\n';
  
  return desc;
}

/**
 * Create TLDraw Agent instance
 */
export function createTldrawAgent(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is required. Please configure it in settings.');
  }

  console.log('🔑 Initializing TLDraw Agent with Gemini API key:', apiKey.substring(0, 10) + '...');

  // Create Google AI provider with explicit API key
  const google = createGoogleGenerativeAI({
    apiKey: apiKey.trim()
  });

  // Get the specific model
  const model = google(TLDRAW_AGENT_CONFIG.model);

  return {
    /**
     * Generate drawing actions from natural language
     * @param {string} userPrompt - User's drawing request
     * @param {object} enhancedContext - Enhanced canvas context with charts, KPIs, annotations
     * @returns {Promise} Actions to execute on canvas
     */
    async generateDrawingActions(userPrompt, enhancedContext = {}) {
      try {
        console.log('🎨 Generating drawing actions for:', userPrompt);
        
        // Build rich context description
        const contextInfo = buildContextDescription(enhancedContext);

        const result = await generateText({
          model,
          temperature: TLDRAW_AGENT_CONFIG.temperature,
          maxTokens: TLDRAW_AGENT_CONFIG.maxTokens,
          messages: [
            {
              role: 'system',
              content: TLDRAW_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: `${contextInfo}\n\nUser request: ${userPrompt}\n\nUse exact coordinates from context above.`
            }
          ]
        });

        // Parse JSON from response
        const responseText = result.text;
        console.log('🔍 Raw AI response:', responseText);
        
        // Try to extract JSON - handle various formats
        let jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          console.error('❌ No JSON found in response');
          throw new Error('AI did not return valid JSON format');
        }
        
        let jsonString = jsonMatch[0];
        console.log('📝 Extracted JSON string:', jsonString);
        
        // Clean up common JSON formatting issues
        jsonString = jsonString
          .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
          .replace(/\n/g, ' ')             // Remove newlines
          .replace(/\r/g, '')              // Remove carriage returns
          .replace(/\t/g, ' ')             // Replace tabs with spaces
          .replace(/\s+/g, ' ')            // Normalize whitespace
          .trim();
        
        console.log('🧹 Cleaned JSON string:', jsonString);
        
        let parsed;
        try {
          parsed = JSON.parse(jsonString);
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          console.error('💡 Failed JSON string:', jsonString);
          
          // Try to fix common issues and retry
          try {
            // Remove any text before first { and after last }
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
              jsonString = jsonString.substring(firstBrace, lastBrace + 1);
              console.log('🔄 Retry with trimmed JSON:', jsonString);
              parsed = JSON.parse(jsonString);
            } else {
              throw parseError;
            }
          } catch (retryError) {
            throw new Error(`Failed to parse AI response as JSON: ${parseError.message}\n\nResponse excerpt: ${jsonString.substring(0, 200)}...`);
          }
        }        
        // Debug: Log raw usage from Vercel AI SDK
        console.log('📊 Raw usage from Vercel AI SDK:', result.usage);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          const tokensUsed = {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: result.usage?.totalTokens || 0
          };
          
          console.log('📊 Extracted token usage:', tokensUsed);
          
          return {
            success: true,
            actions: parsed.actions || [],
            explanation: parsed.explanation || '',
            rawResponse: responseText,
            tokensUsed: tokensUsed,
            _debugUsage: result.usage // Keep raw usage for debugging
          };
        } else {
          throw new Error('Could not parse JSON from response');
        }
      } catch (error) {
        console.error('TLDraw Agent error:', error);
        return {
          success: false,
          error: error.message,
          actions: []
        };
      }
    },

    /**
     * Stream drawing actions (for progressive rendering)
     */
    async streamDrawingActions(userPrompt, canvasState = {}) {
      const contextInfo = canvasState.shapes 
        ? `Current canvas has ${canvasState.shapes.length} shapes.`
        : 'Canvas is empty.';

      const result = await streamText({
        model,
        temperature: TLDRAW_AGENT_CONFIG.temperature,
        maxTokens: TLDRAW_AGENT_CONFIG.maxTokens,
        messages: [
          {
            role: 'system',
            content: TLDRAW_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: `${contextInfo}\n\nUser request: ${userPrompt}\n\nGenerate drawing actions as JSON.`
          }
        ]
      });

      return result;
    }
  };
}

/**
 * Execute drawing actions on tldraw editor
 * @param {Array} actions - Actions from agent
 * @param {object} editor - tldraw editor instance
 * @returns {Array} Created shape IDs
 */
export function executeDrawingActions(actions, editor) {
  if (!editor || !actions || actions.length === 0) {
    console.warn('⚠️ Cannot execute drawing actions:', { hasEditor: !!editor, actionCount: actions?.length || 0 });
    return [];
  }

  console.log(`🎨 Executing ${actions.length} drawing action(s)...`);
  const createdShapeIds = [];

  for (const action of actions) {
    try {
      if (action.type === 'create_shape') {
        console.log(`   Creating ${action.shape} at (${action.props?.x}, ${action.props?.y})`, action.props);
        const result = createTldrawShape(action.shape, action.props, editor);
        
        // Handle both single shape IDs and arrays (for composite shapes like sticky notes)
        if (result) {
          if (Array.isArray(result)) {
            createdShapeIds.push(...result);
            console.log(`   ✅ Created composite shape with ${result.length} parts: ${result.join(', ')}`);
          } else {
            createdShapeIds.push(result);
            console.log(`   ✅ Created shape with ID: ${result}`);
          }
        } else {
          console.warn(`   ⚠️ Failed to create ${action.shape} shape`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to execute action:', action, error);
    }
  }

  console.log(`✅ Successfully created ${createdShapeIds.length} shape(s)`);
  return createdShapeIds;
}

/**
 * Validate and normalize color to tldraw-compatible color name
 * TLDraw only accepts specific color strings, not hex codes
 * @param {string} color - Color input (hex or name)
 * @returns {string} Valid tldraw color name
 */
function normalizeTLDrawColor(color) {
  if (!color) return 'black';
  
  // Valid tldraw colors
  const validColors = [
    'black', 'grey', 'light-violet', 'violet',  
    'blue', 'light-blue', 'yellow', 'orange',
    'green', 'light-green', 'light-red', 'red', 'white'
  ];
  
  // If already valid, return as-is
  const lowerColor = color.toLowerCase();
  if (validColors.includes(lowerColor)) {
    return lowerColor;
  }
  
  // Hex to tldraw color mapping
  const hexMapping = {
    '#000000': 'black',
    '#808080': 'grey',
    '#E0E0E0': 'grey',  // Light grey → grey
    '#D3D3D3': 'grey',  // Light grey → grey
    '#C0C0C0': 'grey',  // Silver → grey
    '#FFFFFF': 'white',
    '#0000FF': 'blue',
    '#87CEEB': 'light-blue',
    '#ADD8E6': 'light-blue',
    '#FFFF00': 'yellow',
    '#FFA500': 'orange',
    '#00FF00': 'green',
    '#90EE90': 'light-green',
    '#98FB98': 'light-green',
    '#FF0000': 'red',
    '#FFB6C1': 'light-red',
    '#FFC0CB': 'light-red',
    '#8B00FF': 'violet',
    '#DDA0DD': 'light-violet',
    '#EE82EE': 'light-violet'
  };
  
  // Try exact hex match (case-insensitive)
  const upperColor = color.toUpperCase();
  if (hexMapping[upperColor]) {
    return hexMapping[upperColor];
  }
  
  // Default fallback
  console.warn(`⚠️ Invalid tldraw color: "${color}", using 'black' as fallback`);
  return 'black';
}

/**
 * Create a tldraw shape
 * @param {string} shapeType - Type of shape
 * @param {object} props - Shape properties
 * @param {object} editor - tldraw editor instance
 * @returns {string} Created shape ID
 */
function createTldrawShape(shapeType, props, editor) {
  // TLDraw requires shape IDs to start with "shape:" prefix
  const shapeId = `shape:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Normalize color to tldraw-compatible color name (handles hex codes)
  const validColor = normalizeTLDrawColor(props.color || 'black');
  
  const baseShape = {
    id: shapeId,
    type: shapeType === 'rectangle' ? 'geo' : shapeType,
    x: props.x || 0,
    y: props.y || 0,
    props: {}
  };

  switch (shapeType) {
    case 'rectangle':
    case 'ellipse':
    case 'circle': // Alias for ellipse
      editor.createShape({
        ...baseShape,
        type: 'geo',
        props: {
          geo: shapeType === 'rectangle' ? 'rectangle' : 'ellipse',
          w: props.w || 100,
          h: props.h || 100,
          color: validColor,  // Use normalized color
          fill: 'none'
        }
      });
      break;

    case 'text':
      // TLDraw text shapes auto-size based on content
      // The 'w' property sets max width, not the actual rendered size
      // Use large font size property for visibility
      editor.createShape({
        ...baseShape,
        type: 'text',
        props: {
          text: props.text || 'Title',
          w: props.w || 600,  // Wide max-width for text wrapping
          color: validColor,
          size: 'xl',  // Extra large font: s, m, l, xl
          font: 'sans'  // sans, serif, mono, draw
        }
      });
      console.log(`✅ Created text shape at (${props.x || 0}, ${props.y || 0}) with text: "${props.text}"`);
      break;

    case 'arrow':
      editor.createShape({
        ...baseShape,
        type: 'arrow',
        props: {
          start: { x: 0, y: 0 },
          end: { x: props.w || 100, y: props.h || 0 },
          color: validColor  // Use normalized color
        }
      });
      break;

    case 'line':
      editor.createShape({
        ...baseShape,
        type: 'line',
        props: {
          points: [
            { id: 'a1', index: 'a1', x: 0, y: 0 },
            { id: 'a2', index: 'a2', x: props.w || 100, y: props.h || 0 }
          ],
          color: validColor  // Use normalized color
        }
      });
      break;

    case 'sticky_note':
    case 'note':
      // Composite shape: Create background rectangle + text
      // Background rectangle
      const bgShapeId = `shape:${Date.now()}-bg`;
      editor.createShape({
        id: bgShapeId,
        type: 'geo',
        x: props.x || 0,
        y: props.y || 0,
        props: {
          geo: 'rectangle',
          w: props.w || 250,
          h: props.h || 120,
          color: normalizeTLDrawColor(props.color || 'yellow'),
          fill: 'solid'
          // Note: TLDraw geo shapes don't support opacity property
        }
      });
      
      // Text on top
      const textShapeId = `shape:${Date.now()}-text`;
      editor.createShape({
        id: textShapeId,
        type: 'text',
        x: (props.x || 0) + 10,
        y: (props.y || 0) + 10,
        props: {
          text: props.text || '',
          size: 's',
          w: (props.w || 250) - 20,
          color: 'black'
        }
      });
      
      console.log(`✅ Created sticky note composite: ${bgShapeId} + ${textShapeId}`);
      return [bgShapeId, textShapeId];

    default:
      console.warn(`Unknown shape type: ${shapeType}`);
      return null;
  }

  return shapeId;
}

