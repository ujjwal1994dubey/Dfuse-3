/**
 * ECharts Registry
 * Central registry for all ECharts chart type configurations
 * Defines compatibility rules, data transformations, and option generation
 */

import { BarChart, PieChart, Circle, TrendingUp, BarChart2 } from 'lucide-react';

/**
 * Default ECharts Colors
 */
const DEFAULT_ECHARTS_COLORS = {
  categorical: ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF'],
  quantitative: ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
  comparative: ['#2563EB', '#F97316'],
  sequential: ['#EFF6FF', '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB']
};

/**
 * Text truncation utility for chart labels
 */
function truncateText(text, maxLength = 20) {
  if (text == null) return '';
  const textStr = String(text);
  if (textStr.length <= maxLength) return textStr;
  return textStr.substring(0, maxLength) + '...';
}

/**
 * ECharts Types Registry
 * Each chart type contains:
 * - id: Unique identifier
 * - label: Display name
 * - icon: Lucide icon component
 * - isSupported: Function to check if dimensions/measures are compatible
 * - createOption: Function to generate ECharts option from data
 */
export const ECHARTS_TYPES = {
  BAR: {
    id: 'bar',
    label: 'Bar Chart',
    icon: BarChart,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createOption: (data, payload) => {
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
          itemStyle: { color: DEFAULT_ECHARTS_COLORS.categorical[0] },
          label: { show: false }
        }]
      };
    }
  },
  
  PIE: {
    id: 'pie',
    label: 'Pie Chart',
    icon: PieChart,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createOption: (data, payload) => {
      const labelKey = payload.dimensions[0];
      const valueKey = payload.measures[0];
      
      const pieData = data.map((r, i) => ({
        name: truncateText(r[labelKey]),
        value: r[valueKey] || 0,
        fullName: String(r[labelKey]), // For tooltips
        itemStyle: { color: DEFAULT_ECHARTS_COLORS.categorical[i % DEFAULT_ECHARTS_COLORS.categorical.length] }
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
  },
  
  LINE: {
    id: 'line',
    label: 'Line Chart',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createOption: (data, payload) => {
      const xKey = payload.dimensions[0];
      const yKey = payload.measures[0];
      
      const categories = data.map(r => truncateText(r[xKey]));
      const values = data.map(r => r[yKey] || 0);
      const fullLabels = data.map(r => String(r[xKey]));
      
      return {
        tooltip: {
          trigger: 'axis',
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
          type: 'line',
          data: values,
          smooth: false,
          lineStyle: { color: DEFAULT_ECHARTS_COLORS.quantitative[0], width: 3 },
          itemStyle: { color: DEFAULT_ECHARTS_COLORS.quantitative[0] },
          symbol: 'circle',
          symbolSize: 6
        }]
      };
    }
  },
  
  SCATTER: {
    id: 'scatter',
    label: 'Scatter Plot',
    icon: Circle,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createOption: (data, payload) => {
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
            color: DEFAULT_ECHARTS_COLORS.quantitative[0],
            opacity: 0.7,
            borderColor: 'white',
            borderWidth: 1
          }
        }]
      };
    }
  },
  
  GROUPED_BAR: {
    id: 'grouped_bar',
    label: 'Grouped Bar',
    icon: BarChart,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createOption: (data, payload) => {
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
          color: DEFAULT_ECHARTS_COLORS.comparative[i % DEFAULT_ECHARTS_COLORS.comparative.length]
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
  },
  
  DUAL_AXIS: {
    id: 'dual_axis',
    label: 'Dual Axis',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures === 2,
    createOption: (data, payload) => {
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
  },
  
  STACKED_BAR: {
    id: 'stacked_bar',
    label: 'Stacked Bar',
    icon: BarChart2,
    isSupported: (dims, measures) => dims === 2 && measures === 1,
    createOption: (data, payload) => {
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
          trigger: 'item',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const dim1Value = uniqueDim1Values[params.dataIndex];
            const dim2Value = uniqueDim2Values[params.seriesIndex];
            return `${dim1Value}<br/>${dim2}: ${dim2Value}<br/>${measure}: ${params.value}`;
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
  },
  
  BUBBLE: {
    id: 'bubble',
    label: 'Bubble Chart',
    icon: Circle,
    isSupported: (dims, measures) => dims === 2 && measures === 1,
    createOption: (data, payload) => {
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
            color: DEFAULT_ECHARTS_COLORS.sequential[Math.floor((r[measure] / maxValue) * (DEFAULT_ECHARTS_COLORS.sequential.length - 1))],
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
            color: DEFAULT_ECHARTS_COLORS.sequential
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
  }
};

/**
 * Get supported chart types for given dimensions and measures
 */
export const getEChartsSupportedTypes = (dims, measures) => {
  return Object.values(ECHARTS_TYPES).filter(chartType => 
    chartType.isSupported(dims, measures)
  );
};

/**
 * Get default chart type for dimensions and measures
 */
export const getEChartsDefaultType = (dims, measures) => {
  const supported = getEChartsSupportedTypes(dims, measures);
  return supported.length > 0 ? supported[0] : ECHARTS_TYPES.BAR;
};

/**
 * Check if chart type conversion is valid
 */
export const canConvertChartType = (fromType, toType, dims, measures) => {
  const fromConfig = Object.values(ECHARTS_TYPES).find(t => t.id === fromType);
  const toConfig = Object.values(ECHARTS_TYPES).find(t => t.id === toType);
  
  if (!fromConfig || !toConfig) return false;
  
  // Both must support the same dimension/measure combination
  return fromConfig.isSupported(dims, measures) && toConfig.isSupported(dims, measures);
};

/**
 * Compatibility Matrix for Quick Reference
 * 
 * Group 1 (1D + 1M): bar ↔ pie ↔ line
 * Group 2 (1D + 2M): scatter ↔ grouped_bar ↔ dual_axis
 * Group 3 (2D + 1M): stacked_bar ↔ bubble
 */
export const COMPATIBILITY_GROUPS = {
  'GROUP_1': ['bar', 'pie', 'line'],
  'GROUP_2': ['scatter', 'grouped_bar', 'dual_axis'],
  'GROUP_3': ['stacked_bar', 'bubble']
};

