/**
 * Scatter Chart Configuration
 * ECharts scatter chart options for 1 dimension + 2 measures
 */

export function getScatterChartOption(data, payload) {
  const labelKey = payload.dimensions[0];
  const xKey = payload.measures[0];
  const yKey = payload.measures[1];
  
  const scatterData = data.map(r => ({
    value: [r[xKey] || 0, r[yKey] || 0],
    name: String(r[labelKey])
  }));
  
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        return `<b>${params.data.name}</b><br/>${xKey}: ${params.value[0]}<br/>${yKey}: ${params.value[1]}`;
      }
    },
    grid: {
      left: '80px',
      right: '30px',
      top: '20px',
      bottom: '60px',
      containLabel: false
    },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#4B5563' },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      name: xKey,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#4B5563' },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      name: yKey,
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    series: [{
      type: 'scatter',
      data: scatterData,
      symbolSize: 10,
      itemStyle: {
        color: '#059669',
        opacity: 0.7,
        borderColor: 'white',
        borderWidth: 1
      }
    }]
  };
}

