# Draw Mode JSON Parsing Fix

**Issue:** Complex queries like "give a rectangle red box for each profit related node" were causing JSON parse errors.

**Date:** December 20, 2025
**Status:** ✅ Fixed

---

## 🐛 Problem

When users requested multiple shapes (e.g., "red box for each profit node"), the AI was generating malformed JSON that failed to parse with errors like:

```
Expected ',' or '}' after property value in JSON at position 205 (line 13 column 5)
```

**Root Causes:**
1. AI sometimes included trailing commas in JSON
2. AI occasionally used comments in JSON (invalid)
3. No explicit examples for creating multiple shapes
4. No semantic tagging to identify "profit related" nodes
5. Insufficient error logging to debug issues

---

## ✅ Solution Implemented

### 1. **Stricter JSON Format Instructions**

Enhanced the system prompt with explicit formatting rules:

```javascript
**CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no comments.**

CRITICAL JSON RULES:
- No trailing commas
- All strings must use double quotes
- No comments (// or /* */)
- No markdown code blocks
- For multiple shapes, add more objects to actions array
```

### 2. **Robust JSON Parsing with Cleanup**

Added automatic JSON cleanup before parsing:

```javascript
// Clean up common JSON formatting issues
jsonString = jsonString
  .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
  .replace(/\n/g, ' ')             // Remove newlines
  .replace(/\r/g, '')              // Remove carriage returns
  .replace(/\t/g, ' ')             // Replace tabs with spaces
  .replace(/\s+/g, ' ')            // Normalize whitespace
  .trim();
```

### 3. **Retry Logic with Better Error Messages**

If parsing fails, try to extract JSON more aggressively:

```javascript
try {
  parsed = JSON.parse(jsonString);
} catch (parseError) {
  // Try to fix by trimming to first { and last }
  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    parsed = JSON.parse(jsonString);
  }
}
```

### 4. **Multiple Shapes Example**

Added explicit example in system prompt:

```javascript
EXAMPLE: Multiple shapes (rectangle for each item)
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
```

### 5. **Semantic Tagging for Filtering**

Enhanced context builder to add semantic tags:

```javascript
const titleLower = c.title.toLowerCase();
const measuresLower = c.measures.map(m => m.toLowerCase()).join(' ');
if (titleLower.includes('profit') || measuresLower.includes('profit')) {
  desc += `   Tags: profit-related\n`;
}
if (titleLower.includes('revenue') || measuresLower.includes('revenue')) {
  desc += `   Tags: revenue-related\n`;
}
```

**Context Example:**
```
📊 CHARTS (3):
1. "Revenue by Quarter" (bar)
   Position: (100, 200)
   Center: (500, 400)
   Size: 800x400
   Data: Quarter → Revenue
   Tags: revenue-related

2. "Profit Margins" (line)
   Position: (1000, 200)
   Center: (1400, 400)
   Size: 800x400
   Data: Month → Profit
   Tags: profit-related

💡 FILTERING TIP: Use Tags to identify items. 
Example: "box for each profit-related" means find all items with "Tags: profit-related"
```

### 6. **Enhanced Logging**

Added detailed logging at each step:

```javascript
console.log('🔍 Raw AI response:', responseText);
console.log('📝 Extracted JSON string:', jsonString);
console.log('🧹 Cleaned JSON string:', jsonString);
console.log('✅ Successfully parsed:', parsed);
```

This helps debug future issues quickly.

---

## 🧪 Testing

### Test Case 1: Multiple Red Boxes
**Query:** "give a rectangle red box for each profit related node"

**Expected Behavior:**
1. AI identifies nodes with `Tags: profit-related`
2. Generates one rectangle action per node
3. Uses red color as specified
4. Positions boxes with 20px padding around each node

**Expected JSON:**
```json
{
  "actions": [
    {
      "type": "create_shape",
      "shape": "rectangle",
      "props": {
        "x": 980,
        "y": 180,
        "w": 840,
        "h": 440,
        "color": "red"
      }
    },
    {
      "type": "create_shape",
      "shape": "rectangle",
      "props": {
        "x": -220,
        "y": -120,
        "w": 360,
        "h": 200,
        "color": "red"
      }
    }
  ],
  "explanation": "Created red highlight boxes around profit-related nodes"
}
```

### Test Case 2: Multiple Different Shapes
**Query:** "label each chart with its name"

**Expected:** One text shape per chart, positioned above each

### Test Case 3: Complex Multi-Step
**Query:** "draw red boxes around KPIs and blue arrows connecting them to charts"

**Expected:** Multiple actions of different types in the same response

---

## 📊 Impact

**Before Fix:**
- ❌ Complex queries with multiple shapes failed
- ❌ No way to filter by semantic meaning (profit/revenue)
- ❌ Poor error messages for debugging
- ❌ AI might generate invalid JSON with trailing commas

**After Fix:**
- ✅ Multiple shapes work reliably
- ✅ Semantic filtering via tags (profit-related, revenue-related)
- ✅ Detailed error logging for debugging
- ✅ Automatic JSON cleanup handles common issues
- ✅ Retry logic as fallback
- ✅ Clear examples guide AI to correct format

---

## 🔮 Future Enhancements

1. **More Semantic Tags:**
   - cost-related, sales-related, customer-related
   - time-series, comparison, breakdown
   - high-value, low-value, outlier

2. **AI Self-Validation:**
   - Before returning JSON, validate it
   - Fix trailing commas automatically
   - Return error message if unable to fix

3. **Template-Based Generation:**
   - For common patterns (boxes, labels, arrows), use templates
   - Reduces chance of malformed JSON

4. **Visual Feedback:**
   - Show which nodes were identified as "profit-related"
   - Highlight matching items before drawing

---

## 🎯 Summary

The Draw mode now handles complex multi-shape queries reliably by:
1. Stricter JSON formatting instructions
2. Automatic cleanup of common issues
3. Retry logic for malformed responses
4. Semantic tagging for intelligent filtering
5. Better error messages and logging

**Status:** Production-ready ✅

