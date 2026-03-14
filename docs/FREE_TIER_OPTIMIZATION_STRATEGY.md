# Free Tier Optimization Strategy - Gemini API

## Executive Summary

**Goal**: Support 50-100 active users on Gemini's free tier (~1,000 API requests/day)

**Strategy**: Eliminate 80% of API calls through client-side intent routing, heuristic classification, and deterministic layout algorithms

**Expected Results**: 
- 0.5 API calls per query (down from 2.5)
- 500 tokens per query (down from 6,000)
- 2,000 queries/day capacity = 100 users @ 20 queries/day

---

## Gemini Free Tier Constraints

### Hard Limits
- **Daily Requests**: ~1,000 per day (resets Pacific Time)
- **Rate Limit**: 5-15 requests per minute (RPM)
- **Token Limit**: 250,000 tokens per minute (TPM)
- **Model Access**: Primarily Flash models, Pro access not guaranteed

### Behavioral Characteristics
- Under load, may fall back to lighter models (quality varies)
- Strict enforcement of daily caps (hard stop at limit)
- Commercial use allowed but closely monitored
- Enabling billing removes free quotas entirely

---

## API Call Elimination by Query Type

### 1. Layout-Only Queries (0 API Calls) ✅

**User Intent**: "Organize my canvas", "Clean this up", "Arrange these charts"

**Current Cost**: 1 API call, 5,000 tokens
**Optimized Cost**: 0 API calls, 0 tokens
**Savings**: 100%

**Implementation**:
```javascript
// Client-side keyword detection
const layoutKeywords = ['organize', 'arrange', 'clean', 'layout', 'align', 'tidy', 'fix'];
if (layoutKeywords.some(kw => query.toLowerCase().includes(kw))) {
  return executeLocalLayout(nodes, editor); // Pure geometric algorithm
}
```

**Technical Approach**:
- Use existing `spatialGrouping.js` utilities to detect relationships
- Apply `LayoutManager` with predetermined rules (KPIs top, charts grid)
- No semantic understanding needed - spatial geometry is deterministic

**Capacity Impact**: 40% of queries eliminated from API usage

---

### 2. Semantic Grouping with Heuristics (0 API Calls) ✅

**User Intent**: "Group by funnel stage", "Separate revenue from costs"

**Current Cost**: 2 API calls, 6,000 tokens (planning + classification)
**Optimized Cost**: 0 API calls, 0 tokens
**Savings**: 100%

**Implementation**:
```javascript
function groupByHeuristics(charts, groupIntent) {
  // Pattern matching on column names and chart metadata
  if (/funnel|stage/i.test(groupIntent)) {
    return detectFunnelStages(charts); // Look for "top", "mid", "bottom" in dimensions
  }
  if (/region|geo|location/i.test(groupIntent)) {
    return groupByDimension(charts, findRegionColumn());
  }
  if (/metric|measure|revenue|cost/i.test(groupIntent)) {
    return classifyByMeasureType(charts); // revenue vs cost vs count patterns
  }
  
  // Fallback: relationship-based grouping (already in memory)
  return groupByDataRelationships(charts);
}

function detectFunnelStages(charts) {
  const stages = ['top', 'mid', 'bottom', 'awareness', 'consideration', 'conversion'];
  return charts.map(chart => {
    const stageName = stages.find(s => 
      chart.dimensions.some(d => d.toLowerCase().includes(s)) ||
      chart.measures.some(m => m.toLowerCase().includes(s))
    );
    return { chart, stage: stageName || 'other' };
  });
}
```

**Why This Works**:
- Chart metadata (dimensions, measures, titles) already contains semantic signals
- Column names like "top_funnel_users", "revenue", "region_name" are self-documenting
- Pattern matching captures 80-90% of common grouping intents
- No LLM reasoning needed for categorical classification

**Capacity Impact**: 20% of queries eliminated from API usage

---

### 3. Direct Chart Creation (Skip Planning) ✅

**User Intent**: "Show revenue by region"

**Current Cost**: 2 API calls, 7,000 tokens (planning + chart creation)
**Optimized Cost**: 1 API call, 1,500 tokens (chart creation only)
**Savings**: 79%

**Implementation**:
```javascript
function extractChartParams(query, datasetColumns) {
  const queryLower = query.toLowerCase();
  
  // Extract dimensions (categorical columns mentioned in query)
  const dimensions = datasetColumns
    .filter(col => col.dtype === 'object')
    .filter(col => queryLower.includes(col.name.toLowerCase()));
  
  // Extract measures (numeric columns mentioned in query)
  const measures = datasetColumns
    .filter(col => col.dtype in ['int64', 'float64'])
    .filter(col => queryLower.includes(col.name.toLowerCase()));
  
  if (dimensions.length > 0 && measures.length > 0) {
    return { dimensions, measures, chartType: inferChartType(dimensions, measures) };
  }
  
  return null; // Fall back to planning LLM
}

// If params extracted, call /charts directly
if (chartParams) {
  return fetch('/charts', { body: JSON.stringify(chartParams) });
} else {
  return fetch('/agent-query', { ...fullPlanning });
}
```

**Capacity Impact**: 30% of queries save 5,000 tokens

---

### 4. Combined Actions in Single Call

**User Intent**: "Show revenue by region and organize"

**Current Cost**: 3 API calls, 9,000 tokens
**Optimized Cost**: 1 API call, 1,500 tokens
**Savings**: 83%

**Implementation**:
```javascript
// Detect hybrid intent
if (hasChartKeyword && hasLayoutKeyword) {
  // Single API call returns both actions
  const response = await fetch('/agent-query', {
    body: {
      query: userQuery,
      context: minimalContext, // Only 800 tokens
      expect_multiple_actions: true
    }
  });
  
  // Backend returns: [{create_chart}, {organize_canvas}]
  // Frontend executes create_chart via API, organize_canvas locally
}
```

**Backend Optimization**:
```python
# Compressed context for planning
minimal_context = {
  "columns": {
    "dimensions": ["Region", "Product"],  # names only
    "measures": ["Revenue", "Cost"]       # names only
  },
  "chart_count": 2,  # don't send full chart objects
  "spatial_hint": "grid"  # pre-computed suggestion
}

# Result: 800 tokens instead of 5,000
```

---

## Context Compression Techniques

### Before (5,000 tokens)
```json
{
  "canvas_state": {
    "charts": [
      {
        "id": "chart-abc-123",
        "title": "Revenue by Quarter",
        "chartType": "bar",
        "dimensions": ["Quarter"],
        "measures": ["Revenue"],
        "position": {"x": 100, "y": 200},
        "data": {...full data arrays...},
        "filters": {...},
        "agg": "sum",
        "table": [...10 rows...]
      }
    ]
  },
  "dataset_metadata": {
    "dataset_summary": "...300 chars...",
    "columns": [
      {"name": "Quarter", "description": "...100 chars...", "type": "object"},
      ...
    ]
  },
  "sample_data": [...10 rows with all columns...]
}
```

### After (800 tokens)
```json
{
  "columns": {
    "dims": ["Quarter", "Region", "Product"],
    "meas": ["Revenue", "Cost", "Profit"]
  },
  "charts": 3,
  "kpis": 2,
  "layout_hint": "kpi-dashboard",
  "query": "show revenue by region and organize"
}
```

**Compression Ratio**: 84% reduction

---

## Caching Strategy

### 1. Spatial Analysis Cache (5-Minute TTL)

```javascript
const spatialCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedSpatialAnalysis(nodes) {
  const nodeCount = nodes.length;
  const cacheKey = `spatial_${nodeCount}_${Math.floor(Date.now() / CACHE_TTL)}`;
  
  if (spatialCache.has(cacheKey)) {
    console.log('✅ Cache hit: Spatial analysis');
    return spatialCache.get(cacheKey);
  }
  
  const analysis = {
    relationships: detectDataRelationships(nodes),
    clusters: detectSpatialClusters(nodes),
    layoutStrategy: suggestLayoutStrategy(nodes)
  };
  
  spatialCache.set(cacheKey, analysis);
  setTimeout(() => spatialCache.delete(cacheKey), CACHE_TTL);
  
  return analysis;
}
```

**Benefit**: Avoids recalculating relationships every query (~50ms compute + would add to LLM context)

### 2. Chart Metadata Cache (Session-Scoped)

```javascript
const metadataCache = new WeakMap();

function getChartMetadata(node) {
  if (metadataCache.has(node)) {
    return metadataCache.get(node);
  }
  
  const metadata = {
    dimensions: node.data.dimensions,
    measures: node.data.measures,
    chartType: node.data.chartType,
    intent: inferChartIntent(node) // 'comparison', 'trend', 'breakdown'
  };
  
  metadataCache.set(node, metadata);
  return metadata;
}
```

---

## Rate Limit Protection

### Request Queue with Circuit Breaker

```javascript
class GeminiRateLimiter {
  constructor() {
    this.queue = [];
    this.requestsThisMinute = 0;
    this.requestsToday = 0;
    this.maxRPM = 10; // Conservative (free tier: 5-15)
    this.maxDaily = 900; // Buffer below 1000
    this.circuitBreakerOpen = false;
    this.lastResetDate = new Date().toDateString();
    
    // Reset minute counter every 60s
    setInterval(() => this.requestsThisMinute = 0, 60000);
  }
  
  resetDailyIfNeeded() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.requestsToday = 0;
      this.lastResetDate = today;
      console.log('✅ Daily quota reset');
    }
  }
  
  async makeRequest(fn, context = {}) {
    this.resetDailyIfNeeded();
    
    // Check daily limit
    if (this.requestsToday >= this.maxDaily) {
      throw new Error('Daily API limit reached. Resets at midnight Pacific Time.');
    }
    
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      throw new Error('Rate limit exceeded. Please wait 60 seconds.');
    }
    
    // Check RPM limit
    if (this.requestsThisMinute >= this.maxRPM) {
      console.log('⏳ RPM limit reached, queuing request...');
      await this.waitForNextMinute();
    }
    
    try {
      this.requestsThisMinute++;
      this.requestsToday++;
      
      console.log(`📊 API Usage: ${this.requestsThisMinute}/${this.maxRPM} RPM, ${this.requestsToday}/${this.maxDaily} daily`);
      
      const result = await fn();
      return result;
      
    } catch (error) {
      if (error.status === 429) {
        console.error('🚫 Rate limit hit, opening circuit breaker');
        this.circuitBreakerOpen = true;
        setTimeout(() => {
          this.circuitBreakerOpen = false;
          console.log('✅ Circuit breaker reset');
        }, 60000);
      }
      throw error;
    }
  }
  
  waitForNextMinute() {
    return new Promise(resolve => {
      const secondsToWait = 60 - (new Date().getSeconds());
      console.log(`⏳ Waiting ${secondsToWait}s for rate limit reset...`);
      setTimeout(resolve, secondsToWait * 1000);
    });
  }
  
  getUsageStats() {
    return {
      rpm: `${this.requestsThisMinute}/${this.maxRPM}`,
      daily: `${this.requestsToday}/${this.maxDaily}`,
      dailyRemaining: this.maxDaily - this.requestsToday,
      percentUsed: ((this.requestsToday / this.maxDaily) * 100).toFixed(1) + '%'
    };
  }
}

// Global instance
const rateLimiter = new GeminiRateLimiter();

// Usage
await rateLimiter.makeRequest(() => 
  fetch('/agent-query', { body: {...} })
);
```

---

## User-Facing Quota Management

### Dashboard Widget

```javascript
function QuotaDisplay() {
  const stats = rateLimiter.getUsageStats();
  const warningThreshold = 80; // 80% of daily quota
  const isNearLimit = parseFloat(stats.percentUsed) > warningThreshold;
  
  return (
    <div className={`quota-widget ${isNearLimit ? 'warning' : 'normal'}`}>
      <div className="quota-bar">
        <div 
          className="quota-fill" 
          style={{width: stats.percentUsed}}
        />
      </div>
      <div className="quota-text">
        {stats.daily} API calls today ({stats.percentUsed})
      </div>
      {isNearLimit && (
        <div className="quota-warning">
          ⚠️ Approaching daily limit. Consider organizing canvas locally.
        </div>
      )}
    </div>
  );
}
```

### Graceful Degradation

```javascript
async function handleAgentQuery(userQuery) {
  try {
    const stats = rateLimiter.getUsageStats();
    
    // If approaching limit, prefer local operations
    if (stats.dailyRemaining < 50) {
      console.log('⚠️ Low quota, trying local-first approach');
      
      const localResult = tryLocalExecution(userQuery);
      if (localResult) {
        showMessage('Executed locally to preserve API quota');
        return localResult;
      }
    }
    
    // Normal API call
    return await rateLimiter.makeRequest(() => callAgentAPI(userQuery));
    
  } catch (error) {
    if (error.message.includes('Daily API limit')) {
      showFallbackUI('Daily limit reached. Try these local commands: organize, arrange, group by column name');
    }
    throw error;
  }
}
```

---

## Free Tier Capacity Model

### Scenario Analysis

**Conservative Estimate**:
```
Daily quota: 1,000 requests
Buffer: 100 requests (emergency/testing)
Available: 900 requests

With optimizations:
- 40% queries = 0 API calls (layout only)
- 20% queries = 0 API calls (heuristic grouping)
- 40% queries = 1 API call (direct chart or compressed planning)

Average: 0.4 API calls per query

Capacity: 900 ÷ 0.4 = 2,250 queries/day
Users: 2,250 ÷ 20 queries/user = 112 users
```

**Optimistic Estimate** (with aggressive user education):
```
If users learn to use:
- "organize" instead of "show charts and organize"
- "group by [column]" instead of vague grouping requests

Could achieve: 0.3 API calls per query
Capacity: 900 ÷ 0.3 = 3,000 queries/day = 150 users
```

### Peak Load Handling

```
RPM limit: 10 requests/minute
Optimized: 0.4 requests/query
= 25 queries/minute sustained
= 150 concurrent users (1 query per 6 minutes)

Burst capacity: 10 concurrent users submitting simultaneously
```

---

## Monitoring & Alerts

### Key Metrics to Track

```javascript
const usageMetrics = {
  dailyRequests: 0,
  queriesProcessed: 0,
  apiCallsPerQuery: [],
  tokensPerQuery: [],
  localExecutionCount: 0,
  rateLimitHits: 0,
  circuitBreakerTrips: 0
};

function recordQuery(queryType, apiCalls, tokens) {
  usageMetrics.queriesProcessed++;
  usageMetrics.apiCallsPerQuery.push(apiCalls);
  usageMetrics.tokensPerQuery.push(tokens);
  
  if (apiCalls === 0) {
    usageMetrics.localExecutionCount++;
  }
  
  // Log to analytics
  logToAnalytics({
    type: queryType,
    apiCalls,
    tokens,
    timestamp: Date.now()
  });
}

function getDailyReport() {
  return {
    totalQueries: usageMetrics.queriesProcessed,
    totalAPIRequests: usageMetrics.dailyRequests,
    avgCallsPerQuery: mean(usageMetrics.apiCallsPerQuery),
    avgTokensPerQuery: mean(usageMetrics.tokensPerQuery),
    localExecutionRate: (usageMetrics.localExecutionCount / usageMetrics.queriesProcessed * 100).toFixed(1) + '%',
    quotaUsed: (usageMetrics.dailyRequests / 900 * 100).toFixed(1) + '%'
  };
}
```

### Alert Thresholds

```javascript
// Alert at 80% daily quota
if (rateLimiter.requestsToday > 720) {
  sendAlert('WARNING: 80% of daily API quota used');
}

// Alert if optimization targets not met
const report = getDailyReport();
if (report.avgCallsPerQuery > 0.6) {
  sendAlert(`Optimization target missed: ${report.avgCallsPerQuery} calls/query (target: 0.4)`);
}
```

---

## Implementation Checklist

### Week 1: API Elimination
- [ ] Client-side intent router with keyword matching
- [ ] Local organize canvas function (0 API calls)
- [ ] Heuristic grouping for common patterns
- [ ] Direct chart param extraction

### Week 2: Rate Limiting
- [ ] `GeminiRateLimiter` class with circuit breaker
- [ ] Request queue for RPM management
- [ ] Daily quota tracking and reset logic
- [ ] User-facing quota display widget

### Week 3: Context Compression
- [ ] Minimal context format (800 tokens max)
- [ ] Skip metadata loading for simple queries
- [ ] Spatial analysis caching (5-min TTL)
- [ ] Chart metadata WeakMap cache

### Week 4: Monitoring
- [ ] Usage metrics collection
- [ ] Daily usage reports
- [ ] Alert system for quota thresholds
- [ ] A/B test optimization effectiveness

---

## Success Criteria

- [ ] **Average API calls per query**: <0.5 (target: 0.4)
- [ ] **Average tokens per query**: <1,000 (target: 500)
- [ ] **Local execution rate**: >60%
- [ ] **Daily capacity**: Support 100+ users comfortably
- [ ] **Zero rate limit errors**: During normal usage
- [ ] **User satisfaction**: No complaints about quota limits

---

## Fallback Plan if Free Tier Exceeded

If growth exceeds free tier before optimization complete:

1. **Temporary Measures**:
   - Implement waitlist/invite system
   - Add "local mode" toggle (force local-only operations)
   - Reduce per-user daily limit to 10 queries

2. **Long-term Path**:
   - Enable billing with strict monthly budget cap ($20-50)
   - Implement tiered access (free=limited, paid=unlimited)
   - Add Redis caching layer for common query patterns

3. **Cost Model with Billing**:
   ```
   Gemini pricing: ~$0.075 per 1M input tokens, $0.30 per 1M output
   
   With optimization (500 tokens avg):
   - Input: ~300 tokens = $0.0000225 per query
   - Output: ~200 tokens = $0.000060 per query
   - Total: ~$0.00008 per query
   
   100 users × 20 queries/day × 30 days = 60,000 queries/month
   Cost: 60,000 × $0.00008 = $4.80/month
   
   Very affordable to upgrade if needed!
   ```

