# Value-Based Sorting - Quick Reference Guide

## 📊 New Sorting Options

### Where to Find It
1. **Select your chart** on the canvas
2. **Open Chart Actions Panel** (right sidebar)
3. **Find "Sort Order" dropdown** (below aggregation options)

---

## 🎯 5 Sorting Options Explained

### 1. Dataset Order (Default)
**What it does:** Preserves the order from your uploaded CSV  
**Best for:** Time series, chronological data, original sequence  
**Example:** Month 1, Month 2, Month 3... Month 37

```
As in CSV: Product1, Product2, Product3...
```

---

### 2. Dimension A → Z
**What it does:** Sorts categories alphabetically ascending  
**Best for:** Finding items starting with specific letters  
**Example:** Bookshelf, Desk, Headphones, Jacket...

```
Bookshelf
Desk
Headphones
Jacket
Jeans
Lamp
...
```

---

### 3. Dimension Z → A
**What it does:** Sorts categories alphabetically descending  
**Best for:** Reverse alphabetical lookup  
**Example:** Tablet, T-Shirt, Smartphone, Running Shoes...

```
Tablet
T-Shirt
Smartphone
Running Shoes
Office Chair
...
```

---

### 4. Measure ↓ High → Low ⭐ NEW!
**What it does:** Sorts by value from highest to lowest  
**Best for:** Finding top performers, winners, leaders  
**Example:** Tablet ($740K), Laptop ($720K), Smartphone ($710K)...

```
Tablet        $740K  👑 Highest
Laptop        $720K
Smartphone    $710K
Jacket        $710K
Office Chair  $690K
Lamp          $670K
...
T-Shirt       $360K  Lowest
```

**Use Cases:**
- 📈 Top 10 products by revenue
- 🏆 Best performing regions
- 💰 Highest value customers
- ⭐ Most popular items

---

### 5. Measure ↑ Low → High ⭐ NEW!
**What it does:** Sorts by value from lowest to highest  
**Best for:** Finding underperformers, opportunities for improvement  
**Example:** T-Shirt ($360K), Headphones ($410K), Running Shoes ($445K)...

```
T-Shirt       $360K  ⚠️ Lowest
Headphones    $410K
Running Shoes $445K
Jeans         $475K
Bookshelf     $510K
...
Tablet        $740K  Highest
```

**Use Cases:**
- ⚠️ Products needing attention
- 🔍 Items to discontinue
- 🎯 Focus areas for improvement
- 📉 Low-performing segments

---

## 💡 Pro Tips

### Tip 1: Start with Value Sorting for Analytics
When analyzing performance data (revenue, sales, profit):
1. Start with **Measure ↓ High → Low**
2. Identify top performers instantly
3. Focus on what drives most value

### Tip 2: Use Alphabetical for Reference
When looking up specific items:
1. Use **Dimension A → Z**
2. Quickly find items by name
3. Good for reports and presentations

### Tip 3: Preserve Dataset Order for Time
When working with dates or sequences:
1. Keep **Dataset Order**
2. See trends over time
3. Maintain chronological flow

### Tip 4: Sort Persists Across Changes
Once you set a sort order:
- ✅ Stays when you change aggregation (Sum → Avg)
- ✅ Stays when you change chart type (Bar → Line)
- ✅ Stays when you apply filters
- ✅ Stays when you clear filters

---

## 🎨 Visual Examples

### Sales Analysis Dashboard
```
Chart 1: Revenue by Product
Sort: Measure ↓ High → Low
→ See top sellers at a glance

Chart 2: Sales by Region  
Sort: Measure ↓ High → Low
→ Identify strongest markets

Chart 3: Orders by Month
Sort: Dataset Order
→ Preserve chronological flow
```

### Inventory Management
```
Chart 1: Stock Levels by Product
Sort: Measure ↑ Low → High
→ Find low-stock items first

Chart 2: Turnover Rate by Category
Sort: Measure ↓ High → Low
→ Focus on fast-moving items
```

### Performance Review
```
Chart 1: Sales by Employee
Sort: Measure ↓ High → Low
→ Top performers first

Chart 2: Customer Satisfaction by Store
Sort: Measure ↑ Low → High
→ Address problem stores
```

---

## ⚡ Keyboard Shortcuts

While dropdown is focused:
- **↑/↓ Arrow Keys** - Navigate options
- **Enter** - Apply selection
- **Esc** - Close without changes

---

## 🔧 Technical Notes

### Multi-Measure Charts
If your chart has multiple measures (e.g., Revenue + Cost):
- Value sorting uses the **first measure** (Revenue)
- This is intuitive and avoids complexity

### Count Charts
For charts showing counts (e.g., "Count of Orders by Region"):
- Value sorting sorts by the count number
- Higher counts appear first with ↓, lower counts with ↑

### Performance
- Sorting is instant (< 10ms for typical charts)
- Works efficiently even with 100+ categories
- No impact on chart rendering speed

---

## 🐛 Troubleshooting

### Sort Not Showing Up?
**Check:** Does your chart have exactly 1 dimension?
- ✅ Revenue by Product (1 dimension) → Sort available
- ❌ Revenue by Product by Region (2 dimensions) → Sort hidden
- ❌ KPI cards (0 dimensions) → Sort hidden

### Sort Not Changing?
**Fix:** Make sure you've selected a new option and the chart has updated
1. Check the dropdown value
2. Wait for chart to re-render (1-2 seconds)
3. Verify data is different

### Want to Reset?
**Solution:** Select "Dataset Order" to return to original CSV order

---

## 📚 Related Features

- **Aggregation Changes** - Change Sum to Avg while keeping sort
- **Chart Type Changes** - Switch Bar to Line while keeping sort
- **Global Filters** - Apply filters while keeping sort
- **Chart Filters** - Filter specific dimensions while keeping sort

---

## 🎯 Common Use Cases

| Scenario | Recommended Sort |
|----------|-----------------|
| Find top 10 products | Measure ↓ High → Low |
| Find worst performers | Measure ↑ Low → High |
| Monthly trend analysis | Dataset Order |
| Alphabetical lookup | Dimension A → Z |
| Revenue ranking | Measure ↓ High → Low |
| Cost optimization | Measure ↑ Low → High |
| Regional comparison | Measure ↓ High → Low |
| Product catalog | Dimension A → Z |

---

## ✨ What's New

**Previous Version (3 options):**
- Dataset Order
- Ascending (A → Z, 0 → 9)
- Descending (Z → A, 9 → 0)

**Current Version (5 options):**
- Dataset Order
- **Sort by Dimension**
  - Dimension A → Z
  - Dimension Z → A
- **Sort by Value** ⭐ NEW!
  - Measure ↓ High → Low
  - Measure ↑ Low → High

**Key Improvements:**
- ✨ Value-based sorting for analytics
- 🎨 Better organized dropdown (optgroups)
- 📊 Clear visual indicators (arrows)
- 💡 Intuitive labeling

---

**Need Help?** Check the full documentation in `ENHANCED_SORTING_WITH_VALUE_SORTING.md`

**Happy Analyzing! 📊🚀**

