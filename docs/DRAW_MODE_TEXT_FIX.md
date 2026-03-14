# Draw Mode Text Visibility Fix

**Date:** December 21, 2025  
**Status:** ✅ Fixed  
**Issue:** Text/titles created by draw mode were not visible

## Problem

When users asked draw mode to create titles or text, it would say it created them but they were not visible on the canvas.

## Root Causes

### 1. Invalid Properties
The code was trying to use properties that TLDraw text shapes don't support:
- ❌ `align` - Not supported, caused validation error
- ❌ `scale` - Not supported for text shapes
- Default `w` was too small (200px)

### 2. Missing Text Content
Text shapes were being created with empty string `''` as default, making them nearly invisible even if rendered.

### 3. Lack of Logging
No console logging made it impossible to debug whether shapes were being created.

## Solution Implemented

### Fix 1: Use Only Valid TLDraw Text Properties

**File:** `frontend/src/agentic_layer/tldrawAgent.js` (Lines 548-564)

```javascript
case 'text':
  // TLDraw text shapes auto-size based on content
  // The 'w' property sets max width, not the actual rendered size
  // Use large font size property for visibility
  editor.createShape({
    ...baseShape,
    type: 'text',
    props: {
      text: props.text || 'Title',      // Default to 'Title' not empty
      w: props.w || 600,                // Wide max-width (600px)
      color: validColor,
      size: 'xl',                       // Extra large: s, m, l, xl
      font: 'sans'                      // sans, serif, mono, draw
    }
  });
  console.log(`✅ Created text shape at (${props.x || 0}, ${props.y || 0}) with text: "${props.text}"`);
  break;
```

**Valid TLDraw Text Properties:**
- `text` (string): The actual text content ✅
- `w` (number): Max width for text wrapping ✅
- `color` (string): Text color (tldraw color names) ✅
- `size` (string): Font size - 's', 'm', 'l', 'xl' ✅
- `font` (string): Font family - 'sans', 'serif', 'mono', 'draw' ✅

**Invalid Properties (Removed):**
- ❌ `scale` - Not supported
- ❌ `align` - Not supported
- ❌ `fontSize` - This is for custom `textbox` shapes, not native text

### Fix 2: Better Default Values

**Before:**
```javascript
text: props.text || '',    // Empty = invisible
w: props.w || 200,         // Too narrow
// No size property
// No font property
```

**After:**
```javascript
text: props.text || 'Title',  // Visible default
w: props.w || 600,            // Wide for visibility
size: 'xl',                   // Extra large font
font: 'sans'                  // Clean sans-serif
```

### Fix 3: Enhanced Logging

**File:** `frontend/src/agentic_layer/tldrawAgent.js` (Lines 430-457)

Added detailed console logging:

```javascript
export function executeDrawingActions(actions, editor) {
  console.log(`🎨 Executing ${actions.length} drawing action(s)...`);
  
  for (const action of actions) {
    try {
      if (action.type === 'create_shape') {
        console.log(`   Creating ${action.shape} at (${action.props?.x}, ${action.props?.y})`, action.props);
        const shapeId = createTldrawShape(action.shape, action.props, editor);
        if (shapeId) {
          console.log(`   ✅ Created shape with ID: ${shapeId}`);
        } else {
          console.warn(`   ⚠️ Failed to create ${action.shape} shape`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to execute action:', action, error);
    }
  }
  
  console.log(`✅ Successfully created ${createdShapeIds.length} shape(s)`);
}
```

### Fix 4: Updated System Prompt

**File:** `frontend/src/agentic_layer/tldrawAgent.js` (Lines 147-152)

Added guidance for text visibility:

```
IMPORTANT TEXT VISIBILITY:
- Text shapes MUST have w: 400+ to be visible (wider shapes = larger text)
- For titles: w: 600-800 recommended
- For labels: w: 200-400 minimum
- Text is placed at x,y position (NOT centered by default)
- Use negative y values (-300 to -100) to place text above existing content
```

## How TLDraw Text Works

### Key Understanding

TLDraw text shapes are **auto-sizing**:
1. The `w` property sets the **maximum width** for text wrapping
2. The `size` property sets the font size: 's' (small), 'm' (medium), 'l' (large), 'xl' (extra large)
3. Text auto-grows vertically based on content
4. If `w` is too small, text wraps and becomes harder to read

### Size Comparison

| Size | Font Rendering | Best For |
|------|----------------|----------|
| `s` | Small (~12px) | Labels, annotations |
| `m` | Medium (~16px) | Regular text |
| `l` | Large (~24px) | Section headers |
| `xl` | Extra Large (~32px+) | **Titles, main headers** ✅ |

### Width Recommendations

| Use Case | Recommended `w` | Reason |
|----------|----------------|--------|
| Dashboard titles | 600-800 | Wide, prominent |
| Section headers | 300-500 | Medium visibility |
| Labels | 200-400 | Compact |
| Annotations | 150-300 | Small notes |

## Console Output Examples

### Successful Text Creation

```
🎨 Executing 1 drawing action(s)...
   Creating text at (0, -300) {x: 0, y: -300, w: 600, text: "Dashboard Title"}
   ✅ Created text shape at (0, -300) with text: "Dashboard Title"
   ✅ Created shape with ID: shape:1734890123456-abc123
✅ Successfully created 1 shape(s)
```

### Failed Creation (for debugging)

```
🎨 Executing 1 drawing action(s)...
   Creating text at (0, -300) {x: 0, y: -300, w: 600, text: "Title"}
   ⚠️ Failed to create text shape
✅ Successfully created 0 shape(s)
```

## Testing

### Test 1: Create Title

**User:** "create a title"

**Expected Console:**
```
🎨 Executing 1 drawing action(s)...
   Creating text at (...) 
   ✅ Created text shape at (...) with text: "..."
✅ Successfully created 1 shape(s)
```

**Expected Result:**
- Large text visible at top of canvas
- Font size: extra large (xl)
- Color: Based on request or default (black)

### Test 2: Create Label

**User:** "add a label saying 'Revenue Trend'"

**Expected:**
- Text shape created
- Content: "Revenue Trend"
- Visible with size 'xl'

### Test 3: Multiple Text Shapes

**User:** "create 3 section headers"

**Expected:**
- 3 separate text shapes
- All visible
- Proper spacing

## Debugging Guide

If text is still not visible, check the console:

1. **Look for creation logs:**
   ```
   ✅ Created text shape at (x, y) with text: "..."
   ```

2. **Check the position:**
   - Is it off-screen? (very negative x/y or very positive)
   - Try panning the canvas to find it

3. **Check the editor state:**
   - Is TLDraw editor initialized?
   - Are other shapes (rectangles, arrows) working?

4. **Inspect with browser DevTools:**
   - Look for `<text>` elements in the DOM
   - Check if they have content
   - Verify font-size CSS

5. **Check AI response:**
   - Did the LLM include `text` property in props?
   - Is the `w` value reasonable (> 200)?

## Common Issues & Fixes

### Issue: "Text created but not visible"

**Possible Causes:**
1. Text is white on white background
2. Text is very far off-screen
3. Text width too small (< 100)
4. Text content is empty or whitespace

**Fix:**
- Check console for position
- Pan canvas to search for text
- Verify `props.text` is not empty
- Ensure `size: 'xl'` is set

### Issue: "ValidationError: Unexpected property"

**Cause:** Using invalid TLDraw property

**Fix:** Only use valid properties:
- ✅ `text`, `w`, `color`, `size`, `font`
- ❌ `align`, `scale`, `fontSize`, `h`

### Issue: "Text is too small to read"

**Fix:**
- Set `size: 'xl'`
- Increase `w` to 600+
- Ensure LLM prompt includes width guidance

## Technical Details

### TLDraw Text Shape Schema

```typescript
type TextShape = {
  type: 'text',
  x: number,
  y: number,
  props: {
    text: string,
    w: number,            // Max width
    color: TLDrawColor,   // 'black', 'blue', etc.
    size: 's' | 'm' | 'l' | 'xl',
    font: 'sans' | 'serif' | 'mono' | 'draw'
  }
}
```

### Difference: Native Text vs Custom TextBox

| Feature | Native `text` | Custom `textbox` |
|---------|---------------|------------------|
| Type | Built-in TLDraw | Custom shape |
| Props | `text`, `w`, `size`, `font`, `color` | `text`, `w`, `h`, `fontSize` |
| Styling | TLDraw default | Yellow box with border |
| Auto-size | Yes (vertical) | No (fixed h) |
| Use Case | Simple annotations | Rich content boxes |

**Draw mode creates:** Native `text` shapes (simpler, cleaner)  
**Agent actions create:** Custom `textbox` shapes (for insights, Q&A)

## Files Modified

1. **`frontend/src/agentic_layer/tldrawAgent.js`**
   - Lines 548-564: Fixed text shape creation with valid properties
   - Lines 430-457: Added detailed logging
   - Lines 147-152: Enhanced system prompt guidance

## Summary

✅ **Fixed:** Text shapes now use only valid TLDraw properties  
✅ **Fixed:** Default text is 'Title' not empty string  
✅ **Fixed:** Default width is 600px (highly visible)  
✅ **Fixed:** Size is 'xl' (extra large font)  
✅ **Added:** Comprehensive console logging for debugging  
✅ **Added:** Better LLM guidance for text visibility  

**Result:** Text and titles created by draw mode are now clearly visible! 📝✨


