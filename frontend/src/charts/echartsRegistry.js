/**
 * ECharts Registry
 * Central registry for all ECharts chart type configurations
 * Defines compatibility rules, data transformations, and option generation
 */

import { BarChart, PieChart, Circle, TrendingUp, BarChart2, Activity, Filter, LayoutGrid } from 'lucide-react';
import { MARK_LINE_CONFIG, createValueBasedVisualMap, createQuartileMarkArea, createSliderDataZoom, createEmphasisConfig } from './visualEnhancements';
import { createBarChartTooltip, createLineChartTooltip, createPieChartTooltip, createScatterTooltip, createMultiSeriesBarTooltip, createGroupedBarTooltip } from './tooltipFactory';
import { createSmartLabels, createPieLabels } from './labelHelper';

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
      const statistics = payload.statistics || {};
      
      const categories = data.map(r => truncateText(r[xKey]));
      const values = data.map(r => r[yKey] || 0);
      const fullLabels = data.map(r => String(r[xKey])); // For tooltips
      
      // Prepare mark lines with statistics
      const markLineData = [];
      if (statistics[yKey]) {
        const stats = statistics[yKey];
        markLineData.push(
          {
            ...MARK_LINE_CONFIG.average,
            yAxis: stats.mean,
            label: { 
              ...MARK_LINE_CONFIG.average.label,
              formatter: `Avg: ${stats.mean.toFixed(1)}`
            }
          }
        );
      }
      
      // Slider zoom for large datasets
      const dataZoomConfig = data.length > 20 ? createSliderDataZoom(data.length) : [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false
        }
      ];
      
      // Value-based visual map for color scaling
      const visualMap = statistics[yKey] ? {
        show: false, // Hide the visual map component
        dimension: 0,
        seriesIndex: 0,
        min: statistics[yKey].min,
        max: statistics[yKey].max,
        inRange: {
          color: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1']
        }
      } : null;
      
      // Smart labels
      const smartLabels = createSmartLabels(data, yKey, 0.75);
      
      return {
        tooltip: createBarChartTooltip(statistics, [yKey], data, fullLabels),
        visualMap: visualMap,
        dataZoom: dataZoomConfig,
        grid: {
          left: '80px',
          right: '30px',
          top: '20px',
          bottom: data.length > 20 ? '100px' : '80px', // Extra space for slider
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
          itemStyle: visualMap ? undefined : { color: DEFAULT_ECHARTS_COLORS.categorical[0] },
          label: smartLabels,
          markLine: markLineData.length > 0 ? { data: markLineData, silent: true } : undefined,
          emphasis: createEmphasisConfig(),
          animationDelay: (idx) => idx * 10
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
      const statistics = payload.statistics || {};
      
      const pieData = data.map((r, i) => ({
        name: truncateText(r[labelKey]),
        value: r[valueKey] || 0,
        fullName: String(r[labelKey]), // For tooltips
        itemStyle: { color: DEFAULT_ECHARTS_COLORS.categorical[i % DEFAULT_ECHARTS_COLORS.categorical.length] }
      }));
      
      return {
        tooltip: createPieChartTooltip(statistics, valueKey, pieData),
        legend: {
          type: pieData.length > 10 ? 'scroll' : 'plain',
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
            formatter: '{b}\n{d}%',
            fontSize: 11,
            color: '#374151'
          },
          labelLine: {
            show: true,
            length: 15,
            length2: 10
          },
          emphasis: {
            ...createEmphasisConfig(),
            scale: true,
            scaleSize: 10
          },
          animationType: 'scale',
          animationEasing: 'elasticOut',
          animationDelay: (idx) => idx * 50
        }]
      };
    }
  },
  
  LINE: {
    id: 'line',
    label: 'Line Chart',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures >= 1 && measures <= 5,
    createOption: (data, payload) => {
      const xKey = payload.dimensions[0];
      const measureKeys = payload.measures;
      const statistics = payload.statistics || {};
      
      const categories = data.map(r => truncateText(r[xKey]));
      const fullLabels = data.map(r => String(r[xKey]));
      
      // Create series for each measure with mark lines
      const series = measureKeys.map((measure, idx) => {
        const seriesData = data.map(r => r[measure] || 0);
        
        // Add mark lines and mark areas for this series
        const markLineData = [];
        let markArea = null;
        
        if (statistics[measure]) {
          const stats = statistics[measure];
          markLineData.push({
            ...MARK_LINE_CONFIG.average,
            yAxis: stats.mean,
            label: {
              ...MARK_LINE_CONFIG.average.label,
              formatter: `${measure} Avg: ${stats.mean.toFixed(1)}`
            }
          });
          
          // Add quartile range mark area
          markArea = createQuartileMarkArea(statistics, measure);
        }
        
        return {
          name: measure,
          type: 'line',
          data: seriesData,
          smooth: data.length > 20, // Smooth for large datasets
          lineStyle: { 
            color: DEFAULT_ECHARTS_COLORS.categorical[idx % DEFAULT_ECHARTS_COLORS.categorical.length], 
            width: 3 
          },
          itemStyle: { 
            color: DEFAULT_ECHARTS_COLORS.categorical[idx % DEFAULT_ECHARTS_COLORS.categorical.length] 
          },
          symbol: 'circle',
          symbolSize: 6,
          markLine: markLineData.length > 0 ? { 
            data: markLineData, 
            silent: true,
            symbol: ['none', 'none']
          } : undefined,
          markArea: markArea,
          emphasis: createEmphasisConfig(),
          animationDelay: idx * 100
        };
      });
      
      // Slider zoom for time series data
      const dataZoomConfig = data.length > 20 ? createSliderDataZoom(data.length) : [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false
        }
      ];
      
      return {
        tooltip: createLineChartTooltip(statistics, measureKeys, data, fullLabels),
        legend: measureKeys.length > 1 ? {
          data: measureKeys,
          top: 5,
          textStyle: { fontSize: 11, color: '#6B7280' },
          selector: measureKeys.length > 2 ? [
            { type: 'all', title: 'All' },
            { type: 'inverse', title: 'Inverse' }
          ] : undefined
        } : undefined,
        dataZoom: dataZoomConfig,
        grid: {
          left: '80px',
          right: '30px',
          top: measureKeys.length > 1 ? '50px' : '20px',
          bottom: data.length > 20 ? '100px' : '80px',
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
          name: measureKeys.length === 1 ? measureKeys[0] : 'Value',
          nameLocation: 'middle',
          nameGap: 50,
          nameTextStyle: { fontSize: 12, color: '#4B5563' }
        },
        series: series
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
      const statistics = payload.statistics || {};
      
      const scatterData = data.map(r => ({
        value: [r[xKey] || 0, r[yKey] || 0],
        name: String(r[labelKey])
      }));
      
      // Create quadrant lines (average lines for X and Y)
      const markLineData = [];
      if (statistics[xKey] && statistics[yKey]) {
        markLineData.push(
          {
            xAxis: statistics[xKey].mean,
            label: {
              formatter: `Avg ${xKey}`,
              position: 'insideEndTop',
              fontSize: 10,
              color: '#6366f1'
            },
            lineStyle: {
              type: 'dashed',
              color: '#6366f1',
              width: 2,
              opacity: 0.6
            }
          },
          {
            yAxis: statistics[yKey].mean,
            label: {
              formatter: `Avg ${yKey}`,
              position: 'insideEndTop',
              fontSize: 10,
              color: '#6366f1'
            },
            lineStyle: {
              type: 'dashed',
              color: '#6366f1',
              width: 2,
              opacity: 0.6
            }
          }
        );
      }
      
      return {
        tooltip: createScatterTooltip(statistics, xKey, yKey),
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true
          },
          {
            type: 'inside',
            yAxisIndex: 0,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true
          }
        ],
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
          },
          markLine: markLineData.length > 0 ? {
            data: markLineData,
            silent: true,
            symbol: ['none', 'none']
          } : undefined,
          emphasis: createEmphasisConfig(),
          animationDelay: (idx) => idx * 5
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
      const statistics = payload.statistics || {};
      
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
        },
        emphasis: createEmphasisConfig()
      }));
      
      // Slider zoom for large datasets
      const dataZoomConfig = data.length > 20 ? createSliderDataZoom(data.length) : [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false
        }
      ];
      
      return {
        tooltip: createGroupedBarTooltip(statistics, measureKeys, categories, categories),
        legend: {
          type: measureKeys.length > 10 ? 'scroll' : 'plain',
          data: measureKeys.map(m => truncateText(m)),
          bottom: 10,
          textStyle: { fontSize: 11, color: '#6B7280' }
        },
        dataZoom: dataZoomConfig,
        grid: {
          left: '80px',
          right: '30px',
          top: '20px',
          bottom: data.length > 20 ? '120px' : '100px',
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
          type: 'plain',
          data: [m1, m2],
          bottom: 5,
          textStyle: { fontSize: 11, color: '#6B7280' }
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            start: 0,
            end: 100,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: false
          }
        ],
        grid: {
          left: '90px',
          right: '90px',
          top: '60px',
          bottom: '120px',
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
            axisLabel: { fontSize: 11, color: '#2563EB' },
            axisLine: { lineStyle: { color: '#2563EB' } },
            splitLine: { lineStyle: { color: '#E5E7EB' } },
            nameTextStyle: { fontSize: 12, color: '#2563EB' },
            nameRotate: 90,
            nameLocation: 'middle',
            nameGap: 60
          },
          {
            type: 'value',
            name: m2,
            position: 'right',
            axisLabel: { fontSize: 11, color: '#F97316' },
            axisLine: { lineStyle: { color: '#F97316' } },
            splitLine: { show: false },
            nameTextStyle: { fontSize: 12, color: '#F97316' },
            nameRotate: 90,
            nameLocation: 'middle',
            nameGap: 60
          }
        ],
        series: [
          {
            name: m1,
            type: 'line',
            data: m1Values,
            smooth: false,
            lineStyle: { color: '#2563EB', width: 3 },
            itemStyle: { color: '#2563EB' },
            symbol: 'circle',
            symbolSize: 8
          },
          {
            name: m2,
            type: 'line',
            yAxisIndex: 1,
            data: m2Values,
            smooth: false,
            lineStyle: { color: '#F97316', width: 3 },
            itemStyle: { color: '#F97316' },
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
  },

  MULTI_SERIES_BAR: {
    id: 'multi_series_bar',
    label: 'Multi-Series Bar',
    icon: BarChart,
    isSupported: (dims, measures) => dims === 1 && measures >= 2 && measures <= 5,
    createOption: (data, payload) => {
      const xKey = payload.dimensions[0];
      const measureKeys = payload.measures;
      const statistics = payload.statistics || {};
      
      const categories = data.map(r => truncateText(r[xKey]));
      const fullLabels = data.map(r => String(r[xKey]));
      
      // Create series for each measure with mark lines
      const series = measureKeys.map((measure, idx) => {
        const markLineData = [];
        if (statistics[measure]) {
          const stats = statistics[measure];
          markLineData.push({
            ...MARK_LINE_CONFIG.average,
            yAxis: stats.mean,
            label: {
              ...MARK_LINE_CONFIG.average.label,
              formatter: `${measure} Avg: ${stats.mean.toFixed(1)}`
            }
          });
        }
        
        return {
          name: measure,
          type: 'bar',
          data: data.map(r => r[measure] || 0),
          animationDelay: idx * 100,
          itemStyle: {
            color: DEFAULT_ECHARTS_COLORS.categorical[idx % DEFAULT_ECHARTS_COLORS.categorical.length]
          },
          markLine: markLineData.length > 0 ? {
            data: markLineData,
            silent: true,
            symbol: ['none', 'none']
          } : undefined,
          emphasis: createEmphasisConfig()
        };
      });
      
      // Slider zoom for large datasets
      const dataZoomConfig = data.length > 20 ? createSliderDataZoom(data.length) : [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true
        }
      ];
      
      return {
        tooltip: createMultiSeriesBarTooltip(statistics, measureKeys, data, fullLabels),
        legend: {
          data: measureKeys,
          top: 5,
          textStyle: { fontSize: 11, color: '#4B5563' },
          selector: measureKeys.length > 2 ? [
            { type: 'all', title: 'All' },
            { type: 'inverse', title: 'Inverse' }
          ] : undefined
        },
        dataZoom: dataZoomConfig,
        grid: {
          left: '80px',
          right: '30px',
          top: '50px',
          bottom: data.length > 20 ? '100px' : '80px',
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
          axisLabel: { 
            fontSize: 11, 
            color: '#4B5563',
            formatter: (value) => value.toLocaleString()
          },
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

  GAUGE: {
    id: 'gauge',
    label: 'Gauge',
    icon: Activity,
    isSupported: (dims, measures) => dims === 0 && measures === 1,
    createOption: (data, payload) => {
      const measure = payload.measures[0];
      const statistics = payload.statistics || {};
      
      // Extract single value
      const value = data && data.length > 0 ? (data[0][measure] || 0) : 0;
      
      // Determine min/max from statistics or defaults
      let min = 0;
      let max = 100;
      if (statistics[measure]) {
        min = Math.floor(statistics[measure].min);
        max = Math.ceil(statistics[measure].max);
      }
      
      return {
        tooltip: {
          formatter: `{b}: {c}`
        },
        series: [{
          type: 'gauge',
          min: min,
          max: max,
          splitNumber: 5,
          radius: '75%',
          axisLine: {
            lineStyle: {
              width: 30,
              color: [
                [0.3, '#ef4444'],
                [0.7, '#facc15'],
                [1, '#22c55e']
              ]
            }
          },
          pointer: {
            itemStyle: { color: 'auto' },
            width: 8
          },
          axisTick: {
            distance: -30,
            length: 8,
            lineStyle: { color: '#fff', width: 2 }
          },
          splitLine: {
            distance: -30,
            length: 30,
            lineStyle: { color: '#fff', width: 4 }
          },
          axisLabel: {
            distance: 30,
            color: '#4B5563',
            fontSize: 14
          },
          detail: {
            valueAnimation: true,
            formatter: '{value}',
            color: 'auto',
            fontSize: 24,
            fontWeight: 'bold',
            offsetCenter: [0, '70%']
          },
          title: {
            offsetCenter: [0, '90%'],
            fontSize: 16,
            color: '#6B7280'
          },
          data: [{ value: value, name: measure }]
        }]
      };
    }
  },

  FUNNEL: {
    id: 'funnel',
    label: 'Funnel',
    icon: Filter,
    isSupported: (dims, measures) => dims === 1 && measures === 1,
    createOption: (data, payload) => {
      const labelKey = payload.dimensions[0];
      const valueKey = payload.measures[0];
      const statistics = payload.statistics || {};
      
      // Sort data descending by value for funnel
      const sortedData = [...data].sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0));
      
      const funnelData = sortedData.map((r, i) => ({
        name: String(r[labelKey]),
        value: r[valueKey] || 0,
        itemStyle: {
          color: DEFAULT_ECHARTS_COLORS.categorical[i % DEFAULT_ECHARTS_COLORS.categorical.length]
        }
      }));
      
      // Calculate conversion rates
      const total = funnelData[0]?.value || 1;
      
      return {
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            const percentage = ((params.value / total) * 100).toFixed(1);
            const conversionFromPrev = params.dataIndex > 0 
              ? ((params.value / funnelData[params.dataIndex - 1].value) * 100).toFixed(1)
              : '100.0';
            
            return `
              <div style="padding: 8px;">
                <div style="font-weight: 600; margin-bottom: 6px;">${params.name}</div>
                <div>Value: <strong>${params.value.toLocaleString()}</strong></div>
                <div>% of Total: <strong>${percentage}%</strong></div>
                ${params.dataIndex > 0 ? `<div>Conversion: <strong>${conversionFromPrev}%</strong></div>` : ''}
              </div>
            `;
          }
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'center',
          textStyle: { fontSize: 11, color: '#6B7280' }
        },
        series: [{
          type: 'funnel',
          sort: 'descending',
          gap: 2,
          left: '30%',
          top: '10%',
          bottom: '10%',
          width: '60%',
          label: {
            show: true,
            position: 'inside',
            formatter: '{b}: {c}',
            fontSize: 12,
            color: '#fff'
          },
          labelLine: {
            show: false
          },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1
          },
          emphasis: createEmphasisConfig(),
          data: funnelData
        }]
      };
    }
  },

  TREEMAP: {
    id: 'treemap',
    label: 'Treemap',
    icon: LayoutGrid,
    isSupported: (dims, measures) => (dims === 1 || dims === 2) && measures === 1,
    createOption: (data, payload) => {
      const dimensions = payload.dimensions;
      const measure = payload.measures[0];
      const statistics = payload.statistics || {};
      
      // Transform data to tree structure
      const transformToTreeData = () => {
        if (dimensions.length === 1) {
          // Flat treemap
          return data.map((r, i) => ({
            name: String(r[dimensions[0]]),
            value: r[measure] || 0,
            itemStyle: {
              color: DEFAULT_ECHARTS_COLORS.categorical[i % DEFAULT_ECHARTS_COLORS.categorical.length]
            }
          }));
        } else {
          // Hierarchical treemap
          const grouped = {};
          data.forEach(r => {
            const parent = String(r[dimensions[0]]);
            const child = String(r[dimensions[1]]);
            if (!grouped[parent]) {
              grouped[parent] = { name: parent, children: [] };
            }
            grouped[parent].children.push({
              name: child,
              value: r[measure] || 0
            });
          });
          return Object.values(grouped);
        }
      };
      
      const treeData = transformToTreeData();
      
      return {
        tooltip: {
          formatter: (params) => {
            const percentage = statistics[measure] 
              ? ((params.value / statistics[measure].sum) * 100).toFixed(1)
              : '';
            
            return `
              <div style="padding: 8px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${params.name}</div>
                <div>Value: <strong>${params.value.toLocaleString()}</strong></div>
                ${percentage ? `<div>% of Total: <strong>${percentage}%</strong></div>` : ''}
              </div>
            `;
          }
        },
        series: [{
          type: 'treemap',
          data: treeData,
          roam: false,
          breadcrumb: {
            show: dimensions.length > 1,
            bottom: '5%',
            textStyle: { fontSize: 11, color: '#6B7280' }
          },
          label: {
            show: true,
            formatter: '{b}\n{c}',
            fontSize: 11,
            color: '#fff'
          },
          upperLabel: {
            show: true,
            height: 30,
            fontSize: 12,
            color: '#fff',
            fontWeight: 'bold'
          },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2,
            gapWidth: 2
          },
          emphasis: {
            itemStyle: {
              borderColor: '#333',
              borderWidth: 3
            },
            upperLabel: {
              show: true,
              fontSize: 14
            }
          },
          levels: [
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 5
              }
            },
            {
              colorSaturation: [0.35, 0.5],
              itemStyle: {
                gapWidth: 1,
                borderColorSaturation: 0.6
              }
            }
          ]
        }]
      };
    }
  },

  CANDLESTICK: {
    id: 'candlestick',
    label: 'Candlestick',
    icon: TrendingUp,
    isSupported: (dims, measures) => dims === 1 && measures === 4,
    createOption: (data, payload) => {
      const xKey = payload.dimensions[0];
      const [openKey, closeKey, lowKey, highKey] = payload.measures;
      
      const categories = data.map(r => truncateText(r[xKey]));
      const fullLabels = data.map(r => String(r[xKey]));
      
      const candlestickData = data.map(r => [
        r[openKey] || 0,
        r[closeKey] || 0,
        r[lowKey] || 0,
        r[highKey] || 0
      ]);
      
      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params) => {
            const dataIndex = params[0].dataIndex;
            const values = candlestickData[dataIndex];
            const isUp = values[1] >= values[0];
            
            return `
              <div style="padding: 8px;">
                <div style="font-weight: 600; margin-bottom: 6px;">${fullLabels[dataIndex]}</div>
                <div style="color: ${isUp ? '#22c55e' : '#ef4444'};">
                  ${isUp ? '▲' : '▼'} ${isUp ? 'Up' : 'Down'}
                </div>
                <div style="margin-top: 6px;">
                  <div>Open: <strong>${values[0].toLocaleString()}</strong></div>
                  <div>Close: <strong>${values[1].toLocaleString()}</strong></div>
                  <div>Low: <strong>${values[2].toLocaleString()}</strong></div>
                  <div>High: <strong>${values[3].toLocaleString()}</strong></div>
                  <div style="margin-top: 4px;">Change: <strong style="color: ${isUp ? '#22c55e' : '#ef4444'};">${(values[1] - values[0]).toFixed(2)}</strong></div>
                </div>
              </div>
            `;
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
          scale: true,
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
          scale: true,
          axisLabel: { fontSize: 11, color: '#4B5563' },
          axisLine: { lineStyle: { color: '#E5E7EB' } },
          splitLine: { lineStyle: { color: '#E5E7EB' } },
          nameLocation: 'middle',
          nameGap: 50,
          nameTextStyle: { fontSize: 12, color: '#4B5563' }
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            start: 0,
            end: 100
          },
          {
            type: 'slider',
            xAxisIndex: 0,
            start: 0,
            end: 100,
            bottom: 10,
            height: 20
          }
        ],
        series: [{
          type: 'candlestick',
          data: candlestickData,
          itemStyle: {
            color: '#22c55e',
            color0: '#ef4444',
            borderColor: '#22c55e',
            borderColor0: '#ef4444',
            borderWidth: 2
          },
          emphasis: {
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 5,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          }
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
  
  // Prefer multi_series_bar for 3+ measures
  if (measures >= 3) {
    const multiSeries = supported.find(t => t.id === 'multi_series_bar');
    if (multiSeries) return multiSeries;
  }
  
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
 * Group 1 (1D + 1M): bar ↔ pie ↔ line ↔ funnel ↔ treemap
 * Group 2 (1D + 2M): scatter ↔ grouped_bar ↔ dual_axis ↔ line
 * Group 3 (2D + 1M): stacked_bar ↔ bubble ↔ treemap
 * Group 4 (1D + 3-5M): multi_series_bar ↔ line
 * Group 5 (0D + 1M): gauge
 * Group 6 (1D + 4M): candlestick
 */
export const COMPATIBILITY_GROUPS = {
  'GROUP_1': ['bar', 'pie', 'line', 'funnel', 'treemap'],
  'GROUP_2': ['scatter', 'grouped_bar', 'dual_axis', 'line'],
  'GROUP_3': ['stacked_bar', 'bubble', 'treemap'],
  'GROUP_4': ['multi_series_bar', 'grouped_bar', 'dual_axis', 'line'],
  'GROUP_5': ['gauge'],
  'GROUP_6': ['candlestick']
};

