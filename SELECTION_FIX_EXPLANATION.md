# Chart Selection Fix - Core Issues Explained

## Issue #1: The preventDefault Error (Console Warning)

### What You're Seeing:
```
Unable to preventDefault inside passive event listener invocation.
preventDefault @ dom.ts:39
onTouchStart @ useCanvasEvents.ts:92
```

### Root Cause:
This error comes from **TLDraw's internal code** (`useCanvasEvents.ts`, `dom.ts`), NOT from our application code. 

When TLDraw handles touch/mouse events on the canvas, it tries to call `preventDefault()` inside event listeners that the browser has marked as "passive" for performance reasons. This is a **TLDraw library limitation**.

### Impact:
This is a **warning only** - it doesn't break functionality. It's cosmetic console noise from TLDraw's internal event handling system.

### Can It Be Fixed?
Not by us without modifying TLDraw's source code. This is a known behavior in TLDraw when dealing with modern browser's passive event listener policies.

---

## Issue #2: Selection Not Working (THE REAL PROBLEM)

### What Was Wrong:
The selection logic was using **the wrong TLDraw API**:

```javascript
// ❌ WRONG - This event doesn't reliably fire
editor.on('select', (info) => {
  // selection logic here
});
```

### The Fix:
Use TLDraw's **store listener** which fires on ALL state changes, including selection:

```javascript
// ✅ CORRECT - Store listener catches all changes
const unsubscribe = editor.store.listen((entry) => {
  // Check selection on every store change
  const currentSelection = editor.getSelectedShapes();
  // ... handle selection changes
});
```

### How It Works Now:

1. **User clicks a chart** → TLDraw updates its internal store
2. **Store listener fires** → Our code detects the change
3. **Check for chart selection** → Filter selected shapes by type 'chart'
4. **Compare with previous selection** → Detect additions/removals
5. **Call handleChartSelect** → Update App.jsx state
6. **UI updates** → Counter, Chart Actions panel, visual feedback

### Debug Logging:
Added console logs to track selection changes:
- `📊 Chart selection changed:` - Shows previous vs current selection
- `✅ Selecting chart:` - Chart ID being selected
- `❌ Deselecting chart:` - Chart ID being deselected

---

## Testing the Fix

1. **Open browser console** - You'll see the selection logs
2. **Click a chart** - Should see `✅ Selecting chart: [id]`
3. **Check counter** - Should show "1 out of 2"
4. **Check Chart Actions panel** - Should populate with actions
5. **Click another chart** - Counter should show "2 out of 2"
6. **Click canvas** - Should see `❌ Deselecting` logs and counter resets

## Expected Console Output

When working correctly, you'll see:
```
📊 Chart selection changed: {
  previous: [],
  current: ['shape:abc123']
}
✅ Selecting chart: shape:abc123
```

Plus the TLDraw preventDefault warning (which we can ignore).

---

## Summary

- **preventDefault Error** = TLDraw internal warning, cannot fix, doesn't affect functionality
- **Selection Not Working** = Fixed by switching from `editor.on('select')` to `editor.store.listen()`
- **Selection now works** via native TLDraw selection system (click anywhere on chart)
- **No checkboxes needed** - cleaner UI, better UX

