/**
 * Performance Monitor for Canvas Adapter
 * Compares React Flow vs TLDraw performance metrics
 */

let metrics = {
  reactFlow: { renders: 0, totalTime: 0, dragEvents: 0 },
  tldraw: { renders: 0, totalTime: 0, dragEvents: 0 }
};

/**
 * Start timing a render
 * @param {string} canvasType - 'react-flow' or 'tldraw'
 * @returns {Object} Timer object
 */
export function startRenderTimer(canvasType) {
  return {
    type: canvasType,
    start: performance.now()
  };
}

/**
 * End timing a render and record metrics
 * @param {Object} timer - Timer object from startRenderTimer
 * @returns {number} Duration in milliseconds
 */
export function endRenderTimer(timer) {
  const duration = performance.now() - timer.start;
  
  if (timer.type === 'react-flow') {
    metrics.reactFlow.renders++;
    metrics.reactFlow.totalTime += duration;
  } else if (timer.type === 'tldraw') {
    metrics.tldraw.renders++;
    metrics.tldraw.totalTime += duration;
  }
  
  return duration;
}

/**
 * Record a drag event
 * @param {string} canvasType - 'react-flow' or 'tldraw'
 */
export function recordDragEvent(canvasType) {
  if (canvasType === 'react-flow') {
    metrics.reactFlow.dragEvents++;
  } else if (canvasType === 'tldraw') {
    metrics.tldraw.dragEvents++;
  }
}

/**
 * Get current metrics with calculations
 * @returns {Object} Metrics object with averages
 */
export function getMetrics() {
  return {
    reactFlow: {
      ...metrics.reactFlow,
      avgRenderTime: metrics.reactFlow.renders > 0 
        ? metrics.reactFlow.totalTime / metrics.reactFlow.renders 
        : 0
    },
    tldraw: {
      ...metrics.tldraw,
      avgRenderTime: metrics.tldraw.renders > 0 
        ? metrics.tldraw.totalTime / metrics.tldraw.renders 
        : 0
    }
  };
}

/**
 * Reset all metrics
 */
export function resetMetrics() {
  metrics = {
    reactFlow: { renders: 0, totalTime: 0, dragEvents: 0 },
    tldraw: { renders: 0, totalTime: 0, dragEvents: 0 }
  };
  console.log('📊 Performance metrics reset');
}

/**
 * Log metrics to console in a formatted table
 */
export function logMetrics() {
  const m = getMetrics();
  
  console.group('📊 Canvas Performance Metrics');
  console.table({
    'React Flow': {
      'Renders': m.reactFlow.renders,
      'Total Time (ms)': m.reactFlow.totalTime.toFixed(2),
      'Avg Time (ms)': m.reactFlow.avgRenderTime.toFixed(2),
      'Drag Events': m.reactFlow.dragEvents
    },
    'TLDraw': {
      'Renders': m.tldraw.renders,
      'Total Time (ms)': m.tldraw.totalTime.toFixed(2),
      'Avg Time (ms)': m.tldraw.avgRenderTime.toFixed(2),
      'Drag Events': m.tldraw.dragEvents
    }
  });
  
  // Calculate performance comparison
  if (m.reactFlow.renders > 0 && m.tldraw.renders > 0) {
    const rfAvg = m.reactFlow.avgRenderTime;
    const tlAvg = m.tldraw.avgRenderTime;
    const diff = Math.abs(rfAvg - tlAvg);
    const faster = rfAvg < tlAvg ? 'React Flow' : 'TLDraw';
    const percentage = ((diff / Math.max(rfAvg, tlAvg)) * 100).toFixed(1);
    
    console.log(`⚡ ${faster} is ${percentage}% faster on average`);
  }
  
  console.groupEnd();
}

/**
 * Start monitoring performance
 * @param {string} canvasType - Canvas type to monitor
 * @returns {Function} Stop function
 */
export function startMonitoring(canvasType) {
  console.log(`📊 Started performance monitoring for ${canvasType}`);
  
  const timer = startRenderTimer(canvasType);
  
  return () => {
    endRenderTimer(timer);
    console.log(`📊 Stopped performance monitoring for ${canvasType}`);
  };
}

/**
 * Create a performance report
 * @returns {string} Formatted report
 */
export function generateReport() {
  const m = getMetrics();
  
  const report = `
=== Canvas Performance Report ===

React Flow:
  - Renders: ${m.reactFlow.renders}
  - Total Time: ${m.reactFlow.totalTime.toFixed(2)}ms
  - Average Time: ${m.reactFlow.avgRenderTime.toFixed(2)}ms
  - Drag Events: ${m.reactFlow.dragEvents}

TLDraw:
  - Renders: ${m.tldraw.renders}
  - Total Time: ${m.tldraw.totalTime.toFixed(2)}ms
  - Average Time: ${m.tldraw.avgRenderTime.toFixed(2)}ms
  - Drag Events: ${m.tldraw.dragEvents}
`;
  
  return report;
}

/**
 * Export metrics as JSON
 * @returns {Object} Metrics object
 */
export function exportMetrics() {
  return {
    timestamp: new Date().toISOString(),
    metrics: getMetrics()
  };
}

/**
 * Compare two canvas implementations
 * @param {string} baseline - Baseline canvas type
 * @param {string} comparison - Comparison canvas type
 * @returns {Object} Comparison results
 */
export function compareImplementations(baseline = 'react-flow', comparison = 'tldraw') {
  const m = getMetrics();
  const baseMetrics = baseline === 'react-flow' ? m.reactFlow : m.tldraw;
  const compMetrics = comparison === 'react-flow' ? m.reactFlow : m.tldraw;
  
  if (baseMetrics.renders === 0 || compMetrics.renders === 0) {
    return {
      error: 'Insufficient data for comparison'
    };
  }
  
  const renderTimeDiff = compMetrics.avgRenderTime - baseMetrics.avgRenderTime;
  const renderTimePercent = (renderTimeDiff / baseMetrics.avgRenderTime) * 100;
  
  return {
    baseline: {
      type: baseline,
      renders: baseMetrics.renders,
      avgRenderTime: baseMetrics.avgRenderTime
    },
    comparison: {
      type: comparison,
      renders: compMetrics.renders,
      avgRenderTime: compMetrics.avgRenderTime
    },
    difference: {
      renderTime: renderTimeDiff,
      renderTimePercent: renderTimePercent,
      faster: renderTimeDiff < 0 ? comparison : baseline
    }
  };
}

// Expose globally for debugging in browser console
if (typeof window !== 'undefined') {
  window.canvasMetrics = {
    get: getMetrics,
    log: logMetrics,
    reset: resetMetrics,
    report: generateReport,
    export: exportMetrics,
    compare: compareImplementations
  };
  
  console.log('📊 Canvas performance monitoring available via window.canvasMetrics');
}

