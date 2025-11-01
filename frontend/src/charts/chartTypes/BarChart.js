/**
 * Bar Chart Configuration
 * ECharts bar chart options for 1 dimension + 1 measure
 */

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getBarChartOption(data, payload) {
  const xKey = payload.dimensions[0];
  const yKey = payload.measures[0];
  
  const categories = data.map(r => truncateText(r[xKey]));
  const values = data.map(r => r[yKey] || 0);
  const fullLabels = data.map(r => String(r[xKey])); // For tooltips
  
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const dataIndex = params[0].dataIndex;
        return `${fullLabels[dataIndex]}<br/>${yKey}: ${params[0].value}`;
      }
    },
    grid: {
      left: '80px',
      right: '30px',
      top: '20px',
      bottom: '80px',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: categories,
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
      name: yKey || 'Value',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: { color: '#2563EB' },
      label: { show: false }
    }]
  };
}

