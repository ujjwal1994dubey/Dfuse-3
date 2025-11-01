/**
 * Stacked Bar Chart Configuration
 * ECharts stacked bar chart options for 2 dimensions + 1 measure
 */

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getStackedBarChartOption(data, payload) {
  const [dim1, dim2] = payload.dimensions;
  const measure = payload.measures[0];
  
  // Get unique values for both dimensions
  const uniqueDim1Values = [...new Set(data.map(r => r[dim1]))];
  const uniqueDim2Values = [...new Set(data.map(r => r[dim2]))];
  
  const truncatedDim1 = uniqueDim1Values.map(v => truncateText(v));
  
  // Create series for each dim2 value
  const series = uniqueDim2Values.map((dim2Value, i) => ({
    name: truncateText(dim2Value),
    type: 'bar',
    stack: 'total',
    data: uniqueDim1Values.map(dim1Value => {
      const row = data.find(r => r[dim1] === dim1Value && r[dim2] === dim2Value);
      return row ? (row[measure] || 0) : 0;
    }),
    itemStyle: {
      color: ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#dd6b20', '#38b2ac', '#ed64a6'][i % 8]
    }
  }));
  
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const dim1Index = params[0].dataIndex;
        let tooltip = `${uniqueDim1Values[dim1Index]}<br/>`;
        params.forEach(param => {
          tooltip += `${dim2}: ${uniqueDim2Values[param.seriesIndex]}<br/>${measure}: ${param.value}<br/>`;
        });
        return tooltip;
      }
    },
    legend: {
      data: uniqueDim2Values.map(v => truncateText(v)),
      bottom: 10,
      textStyle: { fontSize: 11, color: '#6B7280' },
      type: uniqueDim2Values.length > 10 ? 'scroll' : 'plain'
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
      data: truncatedDim1,
      axisLabel: {
        rotate: 45,
        fontSize: 11,
        color: '#4B5563'
      },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      name: dim1,
      nameLocation: 'middle',
      nameGap: 60,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#4B5563' },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      name: measure,
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    series: series
  };
}

