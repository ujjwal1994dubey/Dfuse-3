/**
 * Grouped Bar Chart Configuration
 * ECharts grouped bar chart options for 1 dimension + 2 measures
 */

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

const DEFAULT_COLORS = ['#2563EB', '#F97316'];

export function getGroupedBarChartOption(data, payload) {
  const xKey = payload.dimensions[0];
  const measureKeys = payload.measures;
  
  const categories = [...new Set(data.map(r => r[xKey]))];
  const truncatedCategories = categories.map(c => truncateText(c));
  
  const series = measureKeys.map((measure, i) => ({
    name: truncateText(measure),
    type: 'bar',
    data: categories.map(cat => {
      const row = data.find(r => r[xKey] === cat);
      return row ? (row[measure] || 0) : 0;
    }),
    itemStyle: {
      color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]
    }
  }));
  
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const categoryIndex = params[0].dataIndex;
        let tooltip = `${categories[categoryIndex]}<br/>`;
        params.forEach(param => {
          tooltip += `${param.seriesName}: ${param.value}<br/>`;
        });
        return tooltip;
      }
    },
    legend: {
      data: measureKeys.map(m => truncateText(m)),
      bottom: 10,
      textStyle: { fontSize: 11, color: '#6B7280' }
    },
    grid: {
      left: '80px',
      right: '30px',
      top: '20px',
      bottom: '100px',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: truncatedCategories,
      axisLabel: {
        rotate: 45,
        fontSize: 11,
        color: '#4B5563'
      },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      name: xKey,
      nameLocation: 'middle',
      nameGap: 60,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#4B5563' },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      name: 'Value',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    series: series
  };
}

