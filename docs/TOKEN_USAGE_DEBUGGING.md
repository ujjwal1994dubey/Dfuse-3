# Token Usage Debugging - Draw Mode

## Issue Reported
Token usage displaying unexpected values:
- Input Tokens: **16** (Expected: ~550-600)
- Output Tokens: **3** (Expected: ~150-200)  
- Total Tokens: **1,436** (Possibly correct if cumulative)

## Debugging Added

### Changes Made

#### 1. `tldrawAgent.js` - Added Detailed Logging
```javascript
// Lines 120-145
console.log('📊 Raw usage from Vercel AI SDK:', result.usage);
console.log('📊 Full result object:', result);
console.log('📊 Extracted token usage:', tokensUsed);
```

**What to look for:**
- Does `result.usage` exist?
- What properties does it have?
- Are `promptTokens`, `completionTokens`, `totalTokens` present?

#### 2. `AgentChatPanel.jsx` - Added Cost Calculation & Logging
```javascript
// Lines 157-182
console.log('📊 Token usage from agent:', result.tokensUsed);
console.log('📊 Debug usage object:', result._debugUsage);
console.log('📊 Sending to token tracker:', usageData);
```

**What to look for:**
- What values are being sent to `onTokenUsage()`?
- Is the data being transformed correctly?

## Testing Instructions

### 1. Refresh Your Browser
Make sure the updated code is loaded.

### 2. Open Browser Console
Press `F12` or Right-click → Inspect → Console

### 3. Try Draw Mode
1. Open Agent Chat Panel
2. Click "Draw" mode (green button)
3. Type: **"Draw an arrow"**
4. Press Enter

### 4. Check Console Output

Look for these emoji markers in order:

#### From tldrawAgent.js:
```
🔑 Initializing TLDraw Agent with Gemini API key: AIzaSyBXXX...
🎨 Generating drawing actions for: Draw an arrow
📊 Raw usage from Vercel AI SDK: {promptTokens: 550, completionTokens: 200, totalTokens: 750}
📊 Full result object: {...}
📊 Extracted token usage: {input: 550, output: 200, total: 750}
```

#### From AgentChatPanel.jsx:
```
📊 Token usage from agent: {input: 550, output: 200, total: 750}
📊 Debug usage object: {promptTokens: 550, completionTokens: 200, totalTokens: 750}
📊 Sending to token tracker: {inputTokens: 550, outputTokens: 200, totalTokens: 750, estimatedCost: 0.000101}
```

#### Success Indicators:
```
✅ Created 1 shapes on canvas
💰 Draw mode token usage: {input: 550, output: 200, cost: '$0.000101'}
```

## Possible Issues & Solutions

### Issue 1: `result.usage` is undefined
**Symptoms:**
```
📊 Raw usage from Vercel AI SDK: undefined
📊 Extracted token usage: {input: 0, output: 0, total: 0}
```

**Cause:** Vercel AI SDK not returning usage metadata  
**Solution:** Check SDK version, might need to pass `includeUsage: true` option

### Issue 2: Different Property Names
**Symptoms:**
```
📊 Raw usage from Vercel AI SDK: {prompt_tokens: 550, ...}
```

**Cause:** SDK using snake_case instead of camelCase  
**Solution:** Update property access in tldrawAgent.js line 132-134

### Issue 3: UI Not Updating
**Symptoms:**
- Console shows correct values
- UI still shows 16/3

**Cause:** Token tracker component issue  
**Solution:** Check `onTokenUsage` callback in parent component

### Issue 4: Session Accumulation
**Symptoms:**
- First call: 550/200
- Second call: 1100/400
- UI shows: 1100/400

**Cause:** Token tracker is cumulative  
**Solution:** This is correct behavior for session tracking!

## Expected Real Values

For "Draw an arrow":

### Tokens Breakdown:
```
Input:
- System Prompt: ~400 tokens
- User Query: ~20 tokens  
- Context Info: ~10 tokens
= Total Input: ~430-450 tokens

Output:
- JSON Response: ~100-150 tokens
- Explanation: ~30-50 tokens
= Total Output: ~130-200 tokens

TOTAL: ~560-650 tokens
```

### Cost:
```
Input:  430 × ($0.075 / 1M) = $0.000032
Output: 150 × ($0.30 / 1M)  = $0.000045
TOTAL: $0.000077
```

## What's Now Tracked

✅ Input tokens (prompt + context)  
✅ Output tokens (AI response)  
✅ Total tokens (sum)  
✅ Estimated cost (calculated correctly)  
✅ Debug logging at every step  

## Next Steps

1. **Test immediately** - Try "Draw an arrow" and check console
2. **Share console output** - Copy the 📊 emoji logs
3. **Check UI** - See if values match console logs
4. **Report findings** - Let me know what you see!

---

**Last Updated:** December 19, 2025  
**Status:** 🔍 Debugging Active - Awaiting Test Results

