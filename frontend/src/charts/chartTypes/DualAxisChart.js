/**
 * Dual Axis Chart Configuration
 * ECharts dual axis chart options for 1 dimension + 2 measures
 */

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getDualAxisChartOption(data, payload) {
  const xKey = payload.dimensions[0];
  const [m1, m2] = payload.measures;
  
  const categories = [...new Set(data.map(r => r[xKey]))];
  const truncatedCategories = categories.map(c => truncateText(c));
  
  const m1Values = categories.map(cat => {
    const row = data.find(r => r[xKey] === cat);
    return row ? (row[m1] || 0) : 0;
  });
  
  const m2Values = categories.map(cat => {
    const row = data.find(r => r[xKey] === cat);
    return row ? (row[m2] || 0) : 0;
  });
  
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const categoryIndex = params[0].dataIndex;
        return `${categories[categoryIndex]}<br/>${m1}: ${params[0].value}<br/>${m2}: ${params[1].value}`;
      }
    },
    legend: {
      data: [m1, m2],
      bottom: 10,
      textStyle: { fontSize: 11, color: '#6B7280' }
    },
    grid: {
      left: '80px',
      right: '80px',
      top: '20px',
      bottom: '80px',
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
    yAxis: [
      {
        type: 'value',
        name: m1,
        position: 'left',
        axisLabel: { fontSize: 11, color: '#3182ce' },
        axisLine: { lineStyle: { color: '#3182ce' } },
        splitLine: { lineStyle: { color: '#E5E7EB' } },
        nameTextStyle: { fontSize: 12, color: '#3182ce' }
      },
      {
        type: 'value',
        name: m2,
        position: 'right',
        axisLabel: { fontSize: 11, color: '#38a169' },
        axisLine: { lineStyle: { color: '#38a169' } },
        splitLine: { show: false },
        nameTextStyle: { fontSize: 12, color: '#38a169' }
      }
    ],
    series: [
      {
        name: m1,
        type: 'line',
        data: m1Values,
        smooth: false,
        lineStyle: { color: '#3182ce', width: 3 },
        itemStyle: { color: '#3182ce' },
        symbol: 'circle',
        symbolSize: 8
      },
      {
        name: m2,
        type: 'line',
        yAxisIndex: 1,
        data: m2Values,
        smooth: false,
        lineStyle: { color: '#38a169', width: 3 },
        itemStyle: { color: '#38a169' },
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };
}

