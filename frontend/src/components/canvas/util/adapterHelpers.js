/**
 * Canvas Adapter Helper Utilities
 * Provides canvas-agnostic operations for React Flow and TLDraw
 */

import { convertShapesToNodes, convertArrowsToEdges } from './stateConverter';

/**
 * Detect which canvas implementation is being used
 * @param {HTMLElement} element - DOM element to check
 * @returns {string} 'react-flow' | 'tldraw' | 'unknown'
 */
export function detectCanvasType(element) {
  if (!element) return 'unknown';
  
  // Check for React Flow classes
  if (element.classList.contains('react-flow') || 
      element.querySelector('.react-flow__renderer')) {
    return 'react-flow';
  }
  
  // Check for TLDraw classes
  if (element.classList.contains('tl-container') || 
      element.querySelector('.tldraw')) {
    return 'tldraw';
  }
  
  return 'unknown';
}

/**
 * Get unified canvas metrics
 * @param {string} canvasType - Type of canvas ('react-flow' or 'tldraw')
 * @param {HTMLElement} element - Canvas DOM element
 * @returns {Object} Metrics object with width, height, zoom, pan
 */
export function getCanvasMetrics(canvasType, element) {
  if (!element) return null;
  
  const baseMetrics = {
    width: element.offsetWidth,
    height: element.offsetHeight,
    zoom: 1,
    pan: { x: 0, y: 0 }
  };
  
  if (canvasType === 'react-flow') {
    // React Flow stores viewport in data attributes or instance
    // This is a simplified version - actual implementation would need instance access
    return baseMetrics;
  }
  
  if (canvasType === 'tldraw') {
    // TLDraw stores camera in editor instance
    // This is a simplified version - actual implementation would need editor access
    return baseMetrics;
  }
  
  return baseMetrics;
}

/**
 * Normalize event data from different canvas types
 * @param {Object} event - Event object from canvas
 * @param {string} canvasType - Type of canvas
 * @returns {Object} Normalized event object
 */
export function normalizeCanvasEvent(event, canvasType) {
  if (!event) return null;
  
  if (canvasType === 'react-flow') {
    return {
      x: event.clientX,
      y: event.clientY,
      target: event.target,
      type: event.type,
      button: event.button
    };
  }
  
  if (canvasType === 'tldraw') {
    return {
      x: event.point?.x || event.clientX,
      y: event.point?.y || event.clientY,
      target: event.target,
      type: event.name || event.type,
      button: event.button
    };
  }
  
  return event;
}

/**
 * Create unified API for canvas operations
 * @param {string} canvasType - Type of canvas
 * @param {Object} instance - Canvas instance (ReactFlow or TLDraw editor)
 * @returns {Object} Unified API object
 */
export function createCanvasAPI(canvasType, instance) {
  if (!instance) {
    console.warn('createCanvasAPI: No instance provided');
    return null;
  }
  
  const api = {
    type: canvasType,
    instance,
    
    /**
     * Get all nodes from canvas
     */
    getNodes: () => {
      if (canvasType === 'react-flow') {
        return instance.getNodes ? instance.getNodes() : [];
      }
      if (canvasType === 'tldraw') {
        const shapes = instance.getCurrentPageShapes();
        return convertShapesToNodes(shapes);
      }
      return [];
    },
    
    /**
     * Get all edges from canvas
     */
    getEdges: () => {
      if (canvasType === 'react-flow') {
        return instance.getEdges ? instance.getEdges() : [];
      }
      if (canvasType === 'tldraw') {
        const shapes = instance.getCurrentPageShapes();
        const arrows = shapes.filter(s => s.type === 'arrow');
        return convertArrowsToEdges(arrows);
      }
      return [];
    },
    
    /**
     * Fit view to show all content
     */
    fitView: () => {
      if (canvasType === 'react-flow') {
        if (instance.fitView) {
          instance.fitView();
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.zoomToFit) {
          instance.zoomToFit();
        }
      }
    },
    
    /**
     * Zoom in
     */
    zoomIn: () => {
      if (canvasType === 'react-flow') {
        if (instance.zoomIn) {
          instance.zoomIn();
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.zoomIn) {
          instance.zoomIn();
        }
      }
    },
    
    /**
     * Zoom out
     */
    zoomOut: () => {
      if (canvasType === 'react-flow') {
        if (instance.zoomOut) {
          instance.zoomOut();
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.zoomOut) {
          instance.zoomOut();
        }
      }
    },
    
    /**
     * Reset view to default
     */
    resetView: () => {
      if (canvasType === 'react-flow') {
        if (instance.setViewport) {
          instance.setViewport({ x: 0, y: 0, zoom: 1 });
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.resetZoom) {
          instance.resetZoom();
        }
      }
    },
    
    /**
     * Get current zoom level
     */
    getZoom: () => {
      if (canvasType === 'react-flow') {
        return instance.getZoom ? instance.getZoom() : 1;
      }
      if (canvasType === 'tldraw') {
        const camera = instance.getCamera();
        return camera?.z || 1;
      }
      return 1;
    },
    
    /**
     * Set zoom level
     */
    setZoom: (zoom) => {
      if (canvasType === 'react-flow') {
        if (instance.setZoom) {
          instance.setZoom(zoom);
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.setCamera) {
          const camera = instance.getCamera();
          instance.setCamera({ ...camera, z: zoom });
        }
      }
    },
    
    /**
     * Get selected items
     */
    getSelectedNodes: () => {
      if (canvasType === 'react-flow') {
        const nodes = instance.getNodes ? instance.getNodes() : [];
        return nodes.filter(n => n.selected);
      }
      if (canvasType === 'tldraw') {
        const shapes = instance.getSelectedShapes();
        return convertShapesToNodes(shapes);
      }
      return [];
    },
    
    /**
     * Clear selection
     */
    clearSelection: () => {
      if (canvasType === 'react-flow') {
        if (instance.setNodes) {
          const nodes = instance.getNodes().map(n => ({ ...n, selected: false }));
          instance.setNodes(nodes);
        }
      }
      if (canvasType === 'tldraw') {
        if (instance.selectNone) {
          instance.selectNone();
        }
      }
    }
  };
  
  return api;
}

/**
 * Compare features between canvas types
 */
export const canvasFeatures = {
  'react-flow': {
    customNodes: true,
    customEdges: true,
    miniMap: true,
    controls: true,
    background: true,
    selection: true,
    multiSelect: true,
    zoom: true,
    pan: true,
    fitView: true,
    snapToGrid: true,
    edgeRouting: true
  },
  'tldraw': {
    customShapes: true,
    arrows: true,
    freehand: true,
    text: true,
    selection: true,
    multiSelect: true,
    zoom: true,
    pan: true,
    fitView: true,
    snapToGrid: true,
    layers: true,
    collaboration: true
  }
};

/**
 * Check if a feature is supported by canvas type
 */
export function isFeatureSupported(canvasType, feature) {
  return canvasFeatures[canvasType]?.[feature] || false;
}

