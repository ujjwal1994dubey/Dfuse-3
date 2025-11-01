/**
 * Pie Chart Configuration
 * ECharts pie chart options for 1 dimension + 1 measure
 */

const DEFAULT_COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF'];

function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

export function getPieChartOption(data, payload) {
  const labelKey = payload.dimensions[0];
  const valueKey = payload.measures[0];
  
  const pieData = data.map((r, i) => ({
    name: truncateText(r[labelKey]),
    value: r[valueKey] || 0,
    fullName: String(r[labelKey]), // For tooltips
    itemStyle: { color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }
  }));
  
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const fullName = params.data.fullName || params.name;
        return `${fullName}<br/>${valueKey}: ${params.value} (${params.percent}%)`;
      }
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { fontSize: 11, color: '#6B7280' },
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderColor: '#E5E7EB',
      borderWidth: 1,
      padding: 10
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'], // Donut style
      data: pieData,
      label: {
        show: true,
        formatter: '{b}',
        fontSize: 11
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
}

