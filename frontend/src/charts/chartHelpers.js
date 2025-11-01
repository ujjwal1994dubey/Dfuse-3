/**
 * Chart Conversion Utilities
 * Converts Plotly chart configurations to ECharts options
 */

/**
 * Main conversion function from Plotly to ECharts
 * @param {Object} plotlyFigure - {data: [], layout: {}}
 * @returns {Object} ECharts option configuration
 */
export function convertPlotlyToECharts(plotlyFigure) {
  if (!plotlyFigure || !plotlyFigure.data || plotlyFigure.data.length === 0) {
    console.warn('Invalid plotly figure provided to converter');
    return null;
  }

  const { data, layout = {} } = plotlyFigure;
  const firstTrace = data[0];
  
  // Detect chart type from Plotly trace
  const chartType = detectChartType(firstTrace);
  
  console.log(`Converting ${chartType} chart to ECharts format`);
  
  // Route to specific converter
  switch (chartType) {
    case 'bar':
      return convertBarChart(data, layout);
    case 'pie':
      return convertPieChart(data, layout);
    case 'scatter':
      return convertScatterChart(data, layout);
    case 'line':
      return convertLineChart(data, layout);
    case 'heatmap':
      return convertHeatmap(data, layout);
    case 'histogram':
      return convertHistogram(data, layout);
    case 'box':
      return convertBoxPlot(data, layout);
    case 'violin':
      return convertViolinPlot(data, layout);
    default:
      console.warn(`Unknown chart type: ${chartType}, falling back to bar chart`);
      return convertBarChart(data, layout);
  }
}

/**
 * Detect chart type from Plotly trace
 */
function detectChartType(trace) {
  if (!trace) return 'bar';
  
  const type = trace.type?.toLowerCase();
  const mode = trace.mode?.toLowerCase();
  
  // Direct type mappings
  if (type === 'pie') return 'pie';
  if (type === 'heatmap') return 'heatmap';
  if (type === 'histogram') return 'histogram';
  if (type === 'box') return 'box';
  
  // Scatter with lines = line chart
  if (type === 'scatter' && mode?.includes('lines')) return 'line';
  if (type === 'scatter') return 'scatter';
  
  // Bar chart (horizontal or vertical)
  if (type === 'bar') return 'bar';
  
  return 'bar'; // Default fallback
}

/**
 * Convert Plotly Bar Chart to ECharts
 */
function convertBarChart(data, layout) {
  const isHorizontal = data[0]?.orientation === 'h';
  
  const series = data.map(trace => ({
    name: trace.name || '',
    type: 'bar',
    data: isHorizontal ? (trace.x || []) : (trace.y || []),
    barMaxWidth: 50,
    label: {
      show: false,
      position: isHorizontal ? 'right' : 'top'
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)'
      }
    }
  }));

  const categoryData = isHorizontal ? (data[0]?.y || []) : (data[0]?.x || []);
  const hasLegend = data.length > 1;

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: {
        color: '#333'
      }
    },
    legend: hasLegend ? {
      data: data.map(t => t.name || ''),
      bottom: 10,
      left: 'center',
      type: 'scroll'
    } : undefined,
    grid: {
      left: isHorizontal ? '15%' : '10%',
      right: '10%',
      bottom: hasLegend ? '15%' : '10%',
      top: layout?.title?.text ? '20%' : '15%',
      containLabel: true
    },
    xAxis: {
      type: isHorizontal ? 'value' : 'category',
      data: isHorizontal ? undefined : categoryData,
      axisLabel: {
        rotate: layout?.xaxis?.tickangle || 0,
        interval: 0,
        fontSize: 11,
        hideOverlap: true
      },
      name: layout?.xaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 35,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    yAxis: {
      type: isHorizontal ? 'category' : 'value',
      data: isHorizontal ? categoryData : undefined,
      name: layout?.yaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: isHorizontal ? 80 : 50,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    series: series
  };
}

/**
 * Convert Plotly Pie Chart to ECharts
 */
function convertPieChart(data, layout) {
  const trace = data[0];
  const pieData = (trace.labels || []).map((label, i) => ({
    name: label,
    value: trace.values?.[i] || 0
  }));

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    legend: {
      orient: 'horizontal',
      bottom: 10,
      left: 'center',
      type: 'scroll',
      data: trace.labels || []
    },
    series: [{
      name: trace.name || 'Data',
      type: 'pie',
      radius: ['0%', '65%'],
      center: ['50%', '50%'],
      data: pieData,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      },
      label: {
        formatter: '{b}: {d}%',
        fontSize: 11
      }
    }]
  };
}

/**
 * Convert Plotly Scatter Chart to ECharts
 */
function convertScatterChart(data, layout) {
  const series = data.map(trace => ({
    name: trace.name || '',
    type: 'scatter',
    data: (trace.x || []).map((x, i) => [x, trace.y?.[i] || 0]),
    symbolSize: trace.marker?.size || 8,
    itemStyle: {
      opacity: 0.7
    },
    emphasis: {
      itemStyle: {
        opacity: 1,
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)'
      }
    }
  }));

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        return `${params.seriesName}<br/>X: ${params.data[0]}<br/>Y: ${params.data[1]}`;
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    legend: data.length > 1 ? {
      data: data.map(t => t.name || ''),
      bottom: 10,
      left: 'center'
    } : undefined,
    grid: {
      left: '10%',
      right: '10%',
      bottom: data.length > 1 ? '15%' : '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: layout?.xaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 35,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    yAxis: {
      type: 'value',
      name: layout?.yaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    series: series
  };
}

/**
 * Convert Plotly Line Chart to ECharts
 */
function convertLineChart(data, layout) {
  const series = data.map(trace => ({
    name: trace.name || '',
    type: 'line',
    data: (trace.x || []).map((x, i) => [x, trace.y?.[i] || 0]),
    smooth: false,
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: {
      width: 2
    },
    emphasis: {
      focus: 'series',
      lineStyle: {
        width: 3
      }
    }
  }));

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500'
      }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    legend: data.length > 1 ? {
      data: data.map(t => t.name || ''),
      bottom: 10,
      left: 'center'
    } : undefined,
    grid: {
      left: '10%',
      right: '10%',
      bottom: data.length > 1 ? '15%' : '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      name: layout?.xaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 35,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    yAxis: {
      type: 'value',
      name: layout?.yaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: {
        fontWeight: '500'
      }
    },
    series: series
  };
}

/**
 * Convert Plotly Heatmap to ECharts
 */
function convertHeatmap(data, layout) {
  const trace = data[0];
  const heatmapData = [];
  
  // Transform z-matrix to ECharts format [x, y, value]
  if (trace.z && Array.isArray(trace.z)) {
    trace.z.forEach((row, y) => {
      if (Array.isArray(row)) {
        row.forEach((value, x) => {
          heatmapData.push([x, y, value !== null && value !== undefined ? value : 0]);
        });
      }
    });
  }

  const allValues = heatmapData.map(d => d[2]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500'
      }
    },
    tooltip: {
      position: 'top',
      formatter: (params) => {
        const xLabel = trace.x?.[params.data[0]] || params.data[0];
        const yLabel = trace.y?.[params.data[1]] || params.data[1];
        return `${yLabel} × ${xLabel}: ${params.data[2].toFixed(2)}`;
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    grid: {
      height: '55%',
      top: '20%',
      left: '15%',
      right: '10%'
    },
    xAxis: {
      type: 'category',
      data: trace.x || [],
      splitArea: {
        show: true
      },
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'category',
      data: trace.y || [],
      splitArea: {
        show: true
      },
      axisLabel: {
        fontSize: 10
      }
    },
    visualMap: {
      min: minVal,
      max: maxVal,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      }
    },
    series: [{
      name: trace.name || 'Heatmap',
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: false
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
}

/**
 * Convert Plotly Histogram to ECharts
 */
function convertHistogram(data, layout) {
  const trace = data[0];
  
  // For histograms, we need to bin the data
  // Plotly does this automatically, but for ECharts we use bar chart with binned data
  const histData = trace.x || [];
  const nbins = trace.nbinsx || 20;
  
  // Calculate bins
  const min = Math.min(...histData);
  const max = Math.max(...histData);
  const binWidth = (max - min) / nbins;
  
  const bins = Array(nbins).fill(0);
  const binLabels = [];
  
  for (let i = 0; i < nbins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
  }
  
  histData.forEach(val => {
    const binIndex = Math.min(Math.floor((val - min) / binWidth), nbins - 1);
    if (binIndex >= 0 && binIndex < nbins) {
      bins[binIndex]++;
    }
  });

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params) => {
        const p = params[0];
        return `${p.name}<br/>Count: ${p.value}`;
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: binLabels,
      axisLabel: {
        rotate: 45,
        fontSize: 10
      },
      name: layout?.xaxis?.title?.text || '',
      nameLocation: 'middle',
      nameGap: 50
    },
    yAxis: {
      type: 'value',
      name: 'Frequency',
      nameLocation: 'middle',
      nameGap: 50
    },
    series: [{
      name: trace.name || 'Frequency',
      type: 'bar',
      data: bins,
      barMaxWidth: 50,
      itemStyle: {
        color: '#5470c6'
      }
    }]
  };
}

/**
 * Convert Plotly Box Plot to ECharts
 * Note: ECharts boxplot requires pre-computed statistics
 */
function convertBoxPlot(data, layout) {
  const series = data.map(trace => {
    // Calculate boxplot statistics from raw data
    const yData = trace.y || [];
    const sorted = [...yData].sort((a, b) => a - b);
    const q1 = percentile(sorted, 25);
    const median = percentile(sorted, 50);
    const q3 = percentile(sorted, 75);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    return {
      name: trace.name || trace.x?.[0] || '',
      data: [[min, q1, median, q3, max]]
    };
  });

  return {
    title: {
      text: layout?.title?.text || '',
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 16,
        fontWeight: '500'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const data = params.data;
        return `${params.name}<br/>
          Max: ${data[4]}<br/>
          Q3: ${data[3]}<br/>
          Median: ${data[2]}<br/>
          Q1: ${data[1]}<br/>
          Min: ${data[0]}`;
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.map(t => t.name || t.x?.[0] || ''),
      boundaryGap: true,
      nameGap: 30,
      splitArea: {
        show: false
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: layout?.yaxis?.title?.text || '',
      splitArea: {
        show: true
      }
    },
    series: [{
      name: 'boxplot',
      type: 'boxplot',
      data: series.map(s => s.data[0])
    }]
  };
}

/**
 * Convert Plotly Violin Plot to ECharts
 * Note: ECharts doesn't have native violin plots, approximate with boxplot
 */
function convertViolinPlot(data, layout) {
  console.warn('Violin plots not natively supported in ECharts, rendering as box plot');
  return convertBoxPlot(data, layout);
}

/**
 * Helper: Calculate percentile
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Apply data sampling for performance
 */
export function sampleEChartsData(option, maxPoints = 1000) {
  if (!option || !option.series) return option;
  
  const sampledOption = JSON.parse(JSON.stringify(option)); // Deep clone
  
  sampledOption.series = sampledOption.series.map(series => {
    if (!series.data || series.data.length <= maxPoints) {
      return series;
    }
    
    const step = Math.ceil(series.data.length / maxPoints);
    const sampledData = [];
    
    for (let i = 0; i < series.data.length; i += step) {
      sampledData.push(series.data[i]);
    }
    
    console.log(`Sampled ${series.name || 'series'} from ${series.data.length} to ${sampledData.length} points`);
    
    return {
      ...series,
      data: sampledData
    };
  });
  
  return sampledOption;
}

/**
 * Get responsive sizing for ECharts
 */
export function getResponsiveChartSize(width, height) {
  return {
    width: width || '100%',
    height: height || 400
  };
}
