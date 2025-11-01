/**
 * Bubble Chart Configuration
 * ECharts bubble chart options for 2 dimensions + 1 measure
 */

const DEFAULT_COLORS = ['#EFF6FF', '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB'];

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getBubbleChartOption(data, payload) {
  const [dim1, dim2] = payload.dimensions;
  const measure = payload.measures[0];
  
  // Filter valid data
  const validData = data.filter(r => r[measure] && r[measure] > 0);
  const maxValue = Math.max(...validData.map(r => r[measure]));
  
  // Get unique dim1 and dim2 values for axes
  const uniqueDim1 = [...new Set(validData.map(r => r[dim1]))];
  const uniqueDim2 = [...new Set(validData.map(r => r[dim2]))];
  
  // Create bubble data
  const bubbleData = validData.map(r => {
    const x = uniqueDim2.indexOf(r[dim2]);
    const y = uniqueDim1.indexOf(r[dim1]);
    const size = Math.max(8, Math.sqrt(r[measure] / maxValue * 2000) + 5);
    return {
      value: [x, y, r[measure]],
      symbolSize: size,
      label: { show: false },
      itemStyle: {
        color: DEFAULT_COLORS[Math.floor((r[measure] / maxValue) * (DEFAULT_COLORS.length - 1))],
        opacity: 0.8,
        borderColor: 'white',
        borderWidth: 2
      },
      dim1Value: r[dim1],
      dim2Value: r[dim2]
    };
  });
  
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        return `${dim1}: ${params.data.dim1Value}<br/>${dim2}: ${params.data.dim2Value}<br/>${measure}: ${params.value[2]}`;
      }
    },
    grid: {
      left: '100px',
      right: '120px',
      top: '20px',
      bottom: '80px',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: uniqueDim2.map(v => truncateText(v)),
      axisLabel: {
        rotate: 45,
        fontSize: 11,
        color: '#4B5563'
      },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      name: dim2,
      nameLocation: 'middle',
      nameGap: 60,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    yAxis: {
      type: 'category',
      data: uniqueDim1.map(v => truncateText(v)),
      axisLabel: { fontSize: 11, color: '#4B5563' },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      name: dim1,
      nameLocation: 'middle',
      nameGap: 70,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    visualMap: {
      min: 0,
      max: maxValue,
      dimension: 2,
      orient: 'vertical',
      right: 10,
      top: 'center',
      text: ['High', 'Low'],
      calculable: true,
      inRange: {
        color: DEFAULT_COLORS
      },
      textStyle: { color: '#4B5563' }
    },
    series: [{
      type: 'scatter',
      data: bubbleData,
      animationDelay: (idx) => idx * 5
    }]
  };
}

