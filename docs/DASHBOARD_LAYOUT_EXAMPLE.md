# Dashboard Layout Example: 3 KPIs + 4 Charts + 2 Tables

## Layout Pattern

For **3 KPIs**, **4 Charts**, and **2 Tables**, the dashboard would be arranged as:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              Sales Dashboard                                │
│         Generated on 12/20/2025 • 9 visualizations          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    [KPI 1]  ·12px·  [KPI 2]  ·12px·  [KPI 3]              │  ← KPI Row
│   Total Rev        Total Profit      Avg Sales             │
│   1,306,294        5,690,978         8,767.07              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ↕ 12px gap                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────┐  ┌─────────────────┐   │
│  │                                │  │                 │   │
│  │                                │  │  📊 Insights    │   │
│  │   Chart 1 (Hero - 75%)         │  │                 │   │  ← Hero Section
│  │   Cost by Category             │  │  - Furniture    │   │    Chart 1 + Insight
│  │   [Bar Chart]                  │  │    leads        │   │
│  │                                │  │  - Trends up    │   │
│  │                                │  │    in 2023      │   │
│  │                                │  │                 │   │
│  └────────────────────────────────┘  └─────────────────┘   │
│              (880px)                      (300px)           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ↕ 12px gap                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │                 │  │                 │                  │
│  │   Chart 2       │  │  💡 Insight     │                  │  ← Secondary 1
│  │   Cost by       │  │  West region    │                  │    Chart 2 + Insight
│  │   Region        │  │  highest        │                  │
│  │   [Bar Chart]   │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│      (300px)              (300px)                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ↕ 12px gap                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │                 │  │                 │                  │
│  │   Chart 3       │  │  💡 Insight     │                  │  ← Secondary 2
│  │   Cost by Year  │  │  Spike in       │                  │    Chart 3 + Insight
│  │   [Line Chart]  │  │  2023           │                  │
│  │                 │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│      (300px)              (300px)                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ↕ 12px gap                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │                 │  │                 │                  │
│  │   Chart 4       │  │  📋 Table 1     │                  │  ← Secondary 3
│  │   Revenue &     │  │  Category       │                  │    Chart 4 + Table 1
│  │   Cost by Cat   │  │  Details        │                  │
│  │   [Multi-Bar]   │  │  [Data Table]   │                  │
│  └─────────────────┘  └─────────────────┘                  │
│      (300px)              (300px)                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ↕ 12px gap                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │                                      │                  │
│  │   Table 2 (if no more charts)        │                  │  ← Remaining Table
│  │   Regional Summary                   │                  │    (Full width option)
│  │   [Data Table]                       │                  │
│  │                                      │                  │
│  └──────────────────────────────────────┘                  │
│                (600px or full width)                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Element Distribution Logic

### With 3 KPIs + 4 Charts + 2 Tables

**Total Elements:** 9 (3 KPIs + 4 Charts + 2 Tables)

**Layout Strategy:** `kpi-dashboard`

**Distribution:**
1. **Row 0:** Title + Subtitle (auto-generated)
2. **Row 1:** 3 KPIs in horizontal row
3. **Row 2:** Chart 1 (Hero, 75%) + Insight/Table (25%)
4. **Row 3:** Chart 2 (25%) + Insight/Table (25%)
5. **Row 4:** Chart 3 (25%) + Insight/Table (25%)
6. **Row 5:** Chart 4 (25%) + Table 1 (25%)
7. **Row 6:** Table 2 (full width or paired)

**Note:** Tables can be treated as "insights" in the layout system, so they get positioned similarly.

## Spacing Details

- **Between KPIs:** 12px
- **Between sections:** 12px
- **Title to KPIs:** 12px (from title bottom)
- **All consistent:** 12px everywhere

## Dimensions

### KPI Section
- **Each KPI:** 320px × 160px
- **Total width:** (320 × 3) + (12 × 2) = 984px

### Hero Section
- **Hero chart:** 880px × 400px
- **Hero insight/table:** 300px × 400px
- **Gap:** 12px
- **Total width:** 880 + 12 + 300 = 1192px

### Secondary Sections (each)
- **Chart:** 300px × 300px
- **Insight/Table:** 300px × 300px
- **Gap:** 12px
- **Total width per section:** 612px

### Full-Width Table (if used)
- **Width:** 600-1200px
- **Height:** 400px

## Total Dashboard Height Calculation

For 3 KPIs + 4 Charts + 2 Tables:

```
Title height:           90px
Gap:                    12px
KPI section:           160px
Gap:                    12px
Hero section:          400px
Gap:                    12px
Secondary 1:           300px
Gap:                    12px
Secondary 2:           300px
Gap:                    12px
Secondary 3:           300px
Gap:                    12px
Table section:         400px
─────────────────────────────
Total:                ~2022px
```

## Implementation Notes

### Current Behavior

The `arrangeKPIDashboard()` function in `layoutManager.js`:

1. **Separates elements by type:**
   ```javascript
   const kpis = elements.filter(e => e.type === 'kpi');
   const charts = elements.filter(e => e.type === 'chart');
   const insights = elements.filter(e => e.type === 'insight' || e.type === 'textbox');
   ```

2. **KPIs go in horizontal row at top**

3. **First chart becomes hero (75% width)**

4. **First insight/table goes next to hero (25% width)**

5. **Remaining charts stack vertically with paired insights/tables**

### Table Handling

Tables are currently NOT explicitly handled in the layout function. They would need to be:

**Option A:** Treated as insights (current behavior)
- Works if tables are created as "insight" type
- Gets positioned like any insight

**Option B:** Add explicit table handling
- Filter tables separately
- Position them strategically
- Could place them full-width at bottom

### Recommended Enhancement

Add table support to `arrangeKPIDashboard()`:

```javascript
const tables = elements.filter(e => e.type === 'table');

// After all chart+insight pairs, add tables
tables.forEach((table, i) => {
  layout.push({
    ...table,
    position: { x: 0, y: currentY },
    size: { w: 600, h: 400 } // Full or half width
  });
  currentY += 412; // 400 + 12 padding
});
```

## Edge Cases

### More Charts than Insights
If you have 4 charts but only 1 insight:
- Chart 1 (hero) + Insight 1 (hero insights)
- Chart 2 (no paired insight)
- Chart 3 (no paired insight)
- Chart 4 (no paired insight)

Charts without insights just appear alone.

### More Insights than Charts
If you have 2 charts but 5 insights:
- Chart 1 (hero) + Insight 1
- Chart 2 + Insight 2
- Remaining 3 insights → arranged in 3-column grid at bottom

### Tables Mixed In
Tables can be:
1. Paired with charts (like insights)
2. Placed full-width at bottom
3. Treated as data displays separate from visualizations

## Conclusion

For **3 KPIs + 4 Charts + 2 Tables**, you get:
- Clean KPI row at top
- Hero chart with first insight/table
- 3 secondary chart+insight/table pairs
- Remaining table at bottom
- Total height ~2000px
- Consistent 12px spacing throughout

This creates a professional, hierarchical dashboard that guides the eye from high-level KPIs through detailed charts to supporting data tables.

