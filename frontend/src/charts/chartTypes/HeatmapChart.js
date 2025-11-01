/**
 * Heatmap Chart Configuration
 * ECharts heatmap chart options for 2 dimensions + 1 measure
 * Note: Similar to bubble chart but using color intensity instead of size
 */

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getHeatmapChartOption(data, payload) {
  const [dim1, dim2] = payload.dimensions;
  const measure = payload.measures[0];
  
  // Get unique values for both dimensions
  const uniqueDim1 = [...new Set(data.map(r => r[dim1]))];
  const uniqueDim2 = [...new Set(data.map(r => r[dim2]))];
  
  // Create heatmap data: [x, y, value]
  const heatmapData = [];
  const values = [];
  
  uniqueDim1.forEach((d1, y) => {
    uniqueDim2.forEach((d2, x) => {
      const row = data.find(r => r[dim1] === d1 && r[dim2] === d2);
      const value = row ? (row[measure] || 0) : 0;
      heatmapData.push([x, y, value]);
      values.push(value);
    });
  });
  
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const [x, y, value] = params.value;
        return `${dim1}: ${uniqueDim1[y]}<br/>${dim2}: ${uniqueDim2[x]}<br/>${measure}: ${value}`;
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
      splitArea: { show: true },
      name: dim2,
      nameLocation: 'middle',
      nameGap: 60,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    yAxis: {
      type: 'category',
      data: uniqueDim1.map(v => truncateText(v)),
      axisLabel: { fontSize: 11, color: '#4B5563' },
      splitArea: { show: true },
      name: dim1,
      nameLocation: 'middle',
      nameGap: 70,
      nameTextStyle: { fontSize: 12, color: '#4B5563' }
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      calculable: true,
      orient: 'vertical',
      right: 10,
      top: 'center',
      inRange: {
        color: ['#EFF6FF', '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB']
      },
      textStyle: { color: '#4B5563' }
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: false
      },
      emphasis: {
        itemStyle: {
          borderColor: '#333',
          borderWidth: 1
        }
      }
    }]
  };
}

