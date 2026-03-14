# Gemini API Models & Rate Limits

## Issue
Getting quota exceeded error with `gemini-2.0-flash-exp`:
```
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count
```

## Solution
Switch to `gemini-1.5-flash` which has much more generous free tier limits.

---

## Gemini Models Comparison

### 🟢 gemini-1.5-flash (RECOMMENDED for Free Tier)
- **Speed:** Very Fast ⚡
- **Free Tier Limits:** 
  - 15 RPM (requests per minute)
  - 1 million TPM (tokens per minute)
  - 1,500 RPD (requests per day)
- **Best For:** Production apps on free tier
- **Cost (Paid):** $0.075 per 1M input tokens, $0.30 per 1M output tokens

### 🟡 gemini-1.5-pro
- **Speed:** Moderate
- **Free Tier Limits:**
  - 2 RPM
  - 32,000 TPM
  - 50 RPD
- **Best For:** More complex tasks requiring better reasoning
- **Cost (Paid):** $1.25 per 1M input tokens, $5.00 per 1M output tokens

### 🔴 gemini-2.0-flash-exp (NOT RECOMMENDED for Free Tier)
- **Speed:** Very Fast ⚡
- **Free Tier Limits:** 
  - **VERY LIMITED** - Often 0 or extremely low quotas
  - Experimental model with unpredictable availability
- **Best For:** Testing new features (paid tier)
- **Status:** Experimental, quotas may change

---

## How to Change Models

### Option 1: In Code (Permanent)
Edit `frontend/src/agentic_layer/tldrawAgent.js`:

```javascript
export const TLDRAW_AGENT_CONFIG = {
  model: 'gemini-1.5-flash', // Change this line
  temperature: 0.7,
  maxTokens: 2000
};
```

### Option 2: Configuration File (Future Enhancement)
Could add a settings UI to let users choose their model preference.

---

## Free Tier Usage Tips

### Maximize Your Free Quota:
1. **Use `gemini-1.5-flash`** - Best free tier limits
2. **Batch requests** - Don't make rapid consecutive calls
3. **Monitor usage** - Check https://ai.dev/usage?tab=rate-limit
4. **Optimize prompts** - Shorter prompts = fewer tokens

### If You Hit Limits:
1. **Wait** - Free tier resets every minute/day
2. **Switch to another API key** - Create multiple projects
3. **Upgrade to paid** - Very affordable for production use

---

## Rate Limit Comparison

| Model | RPM (Free) | TPM (Free) | RPD (Free) |
|-------|------------|------------|------------|
| gemini-1.5-flash | 15 | 1,000,000 | 1,500 |
| gemini-1.5-pro | 2 | 32,000 | 50 |
| gemini-2.0-flash-exp | ~0-2 | Limited | Limited |

**RPM** = Requests Per Minute  
**TPM** = Tokens Per Minute  
**RPD** = Requests Per Day

---

## Error Messages Explained

### "Quota exceeded for metric: generate_content_free_tier_requests"
- **Meaning:** You've hit the requests per minute/day limit
- **Solution:** Wait or switch to gemini-1.5-flash

### "Quota exceeded for metric: generate_content_free_tier_input_token_count"
- **Meaning:** You've sent too many input tokens
- **Solution:** Reduce prompt length or wait

### "Please retry in X seconds"
- **Meaning:** Rate limit cooldown
- **Solution:** Wait the specified time or use gemini-1.5-flash

---

## Monitoring Your Usage

1. **Visit:** https://ai.dev/usage?tab=rate-limit
2. **Check your quotas** for each model
3. **See usage graphs** to understand patterns
4. **Get notified** before hitting limits

---

## Production Recommendations

### For Free Tier Apps:
- ✅ Use `gemini-1.5-flash`
- ✅ Implement request queuing/throttling
- ✅ Show loading states to users
- ✅ Cache responses when possible

### For Paid Tier Apps:
- ✅ Can use `gemini-2.0-flash-exp` for latest features
- ✅ Much higher limits (10,000+ RPM)
- ✅ Better for high-traffic production apps
- ✅ Still very affordable compared to other LLMs

---

## Cost Comparison (if you upgrade)

For 1,000 drawing requests averaging 500 tokens each:

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| gemini-1.5-flash | $0.0375 | $0.15 | **$0.19** |
| gemini-1.5-pro | $0.625 | $2.50 | **$3.13** |

**Gemini is 10-50x cheaper than GPT-4!** 🎉

---

## Current Configuration

Your app is now using: **`gemini-1.5-flash`**

This gives you:
- ✅ 15 requests per minute
- ✅ 1 million tokens per minute
- ✅ 1,500 requests per day
- ✅ Perfect for development and moderate production use

---

## References

- [Gemini API Pricing](https://ai.google.dev/pricing)
- [Rate Limits Documentation](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Usage Dashboard](https://ai.dev/usage?tab=rate-limit)
- [Model Comparison](https://ai.google.dev/gemini-api/docs/models/gemini)

---

**Last Updated:** December 19, 2025  
**Status:** ✅ Configured with gemini-1.5-flash

