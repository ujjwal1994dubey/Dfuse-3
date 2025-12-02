import React, { useEffect, useRef, useMemo } from 'react';
import { Tldraw, createShapeId } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { ChartShape } from './shapes/ChartShape';
import { TextBoxShape } from './shapes/TextShape';
import { TableShape } from './shapes/TableShape';
import { convertEdgesToArrows, convertArrowsToEdges } from './util/stateConverter';
import ChartContextualToolbar from './ChartContextualToolbar';
import './tldraw-custom.css';

/**
 * TLDraw Canvas Component
 * Infinite canvas with custom shapes for data visualization
 */
const TLDrawCanvas = ({
  editorRef: externalEditorRef,
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onPaneClick,
  onSelectionChange,
  onChartSelect,
  initialViewport,
  onAIQueryShortcut,
  onChartInsightShortcut,
  onShowTableShortcut,
  apiKeyConfigured,
  onEditorMount
}) => {
  const editorRef = useRef(null);
  const initialImportDone = useRef(false);
  const previousNodeIdsRef = useRef(new Set());
  const previousNodesDataRef = useRef(new Map()); // Track node data to detect changes
  const previouslySelectedChartsRef = useRef(new Set()); // Track selected charts

  // Custom shape utilities
  const shapeUtils = [ChartShape, TextBoxShape, TableShape];
  
  // TLDraw components configuration - memoized to prevent unnecessary re-renders
  const components = useMemo(() => {
    // Contextual toolbar component
    const ContextualToolbarComponent = (props) => {
      console.log('🔧 ContextualToolbarComponent rendering with callbacks:', {
        hasAIQuery: !!onAIQueryShortcut,
        hasInsights: !!onChartInsightShortcut,
        hasShowTable: !!onShowTableShortcut,
        apiKeyConfigured
      });
      
      return (
        <ChartContextualToolbar
          {...props}
          onAIQueryShortcut={onAIQueryShortcut}
          onChartInsightShortcut={onChartInsightShortcut}
          onShowTableShortcut={onShowTableShortcut}
          apiKeyConfigured={apiKeyConfigured}
        />
      );
    };
    
    return {
      InFrontOfTheCanvas: ContextualToolbarComponent
    };
  }, [onAIQueryShortcut, onChartInsightShortcut, onShowTableShortcut, apiKeyConfigured]);

  // Watch for new nodes being added AND existing nodes being updated
  useEffect(() => {
    if (!editorRef.current) return;

    const currentNodeIds = new Set(nodes.map(n => n.id));
    const previousNodeIds = previousNodeIdsRef.current;

    // Find new nodes
    const newNodes = nodes.filter(node => !previousNodeIds.has(node.id));
    
    if (newNodes.length > 0) {
      console.log('🆕 Adding new nodes to TLDraw:', newNodes.length);
      importNodesToTLDraw(editorRef.current, newNodes);
    }

    // Find updated nodes (nodes whose data has changed)
    const updatedNodes = nodes.filter(node => {
      const previousData = previousNodesDataRef.current.get(node.id);
      if (!previousData) return false; // Skip new nodes (already handled above)
      
      // Deep comparison of node data
      const currentDataStr = JSON.stringify(node.data);
      const previousDataStr = JSON.stringify(previousData);
      return currentDataStr !== previousDataStr;
    });

    if (updatedNodes.length > 0) {
      console.log('🔄 Updating existing nodes in TLDraw:', updatedNodes.length, updatedNodes.map(n => n.id));
      updateNodesInTLDraw(editorRef.current, updatedNodes);
    }

    // Update tracked IDs and data
    previousNodeIdsRef.current = currentNodeIds;
    const newDataMap = new Map();
    nodes.forEach(node => {
      newDataMap.set(node.id, node.data);
    });
    previousNodesDataRef.current = newDataMap;
  }, [nodes]);

  // Watch for new edges being added
  useEffect(() => {
    if (!editorRef.current || edges.length === 0) return;
    
    // For simplicity, we'll reimport all edges when they change
    // This could be optimized to only add new ones
    const existingArrows = editorRef.current.getCurrentPageShapes().filter(s => s.type === 'arrow');
    if (existingArrows.length !== edges.length) {
      importEdgesToTLDraw(editorRef.current, edges);
    }
  }, [edges]);

  const handleMount = (editor) => {
    editorRef.current = editor;
    
    // Expose editor to parent component via ref if provided
    if (externalEditorRef) {
      externalEditorRef.current = editor;
    }
    
    // Notify parent that editor is ready
    if (onEditorMount) {
      onEditorMount();
    }

    // Import existing nodes and edges as TLDraw shapes (only once on mount)
    if (!initialImportDone.current && (nodes.length > 0 || edges.length > 0)) {
      console.log('📥 Initial import of nodes:', nodes.length);
      importNodesToTLDraw(editor, nodes);
      importEdgesToTLDraw(editor, edges);
      initialImportDone.current = true;
      
      // Track initial node IDs
      previousNodeIdsRef.current = new Set(nodes.map(n => n.id));
    }

    // Track previous selection for detecting changes (DISABLED - using checkbox selection)
    // let previouslySelectedCharts = new Set();

    // Listen to shape changes AND selection changes via store
    const unsubscribe = editor.store.listen((entry) => {
      if (entry.source === 'user') {
        // Get all shapes and separate by type
        const shapes = editor.getCurrentPageShapes();
        const nodeShapes = shapes.filter(s => ['chart', 'textbox', 'table'].includes(s.type));
        const arrowShapes = shapes.filter(s => s.type === 'arrow');
        
        // Convert and emit node changes
        if (onNodesChange) {
          const convertedNodes = convertShapesToNodes(nodeShapes);
          onNodesChange(convertedNodes);
        }
        
        // Convert and emit edge changes
        if (onEdgesChange) {
          const convertedEdges = convertArrowsToEdges(arrowShapes);
          onEdgesChange(convertedEdges);
        }
      }
      
      // Handle chart selection changes (restored - normal TLDraw selection)
      const currentSelection = editor.getSelectedShapes();
      const currentlySelectedCharts = new Set(
        currentSelection
          .filter(s => s.type === 'chart')
          .map(s => s.id)
      );
      
      const previouslySelectedCharts = previouslySelectedChartsRef.current;
      
      const selectionChanged = 
        currentlySelectedCharts.size !== previouslySelectedCharts.size ||
        ![...currentlySelectedCharts].every(id => previouslySelectedCharts.has(id));
      
      if (selectionChanged && onChartSelect) {
        console.log('📊 Chart selection changed:', {
          previous: Array.from(previouslySelectedCharts),
          current: Array.from(currentlySelectedCharts)
        });
        
        const added = [...currentlySelectedCharts].filter(id => !previouslySelectedCharts.has(id));
        const removed = [...previouslySelectedCharts].filter(id => !currentlySelectedCharts.has(id));
        
        added.forEach(chartId => {
          console.log('✅ Selecting chart:', chartId);
          onChartSelect(chartId);
        });
        
        removed.forEach(chartId => {
          console.log('❌ Deselecting chart:', chartId);
          onChartSelect(chartId);
        });
        
        previouslySelectedChartsRef.current = currentlySelectedCharts;
      }
      
      // Handle onSelectionChange callback
      if (onSelectionChange) {
        const selectedNodes = convertShapesToNodes(currentSelection.filter(s => 
          ['chart', 'textbox', 'table'].includes(s.type)
        ));
        if (selectedNodes.length > 0) {
          onSelectionChange({ nodes: selectedNodes });
        }
      }
    });

    // Listen to canvas click for pane click callback
    const handleCanvasClick = () => {
      if (onPaneClick) {
        onPaneClick();
      }
    };
    
    editor.on('click-canvas', handleCanvasClick);

    return () => {
      unsubscribe();
    };
  };

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        backgroundColor: '#fafafa'
      }}
    >
      <Tldraw
        shapeUtils={shapeUtils}
        components={components}
        onMount={handleMount}
        autoFocus
      />
    </div>
  );
};

/**
 * Convert React Flow nodes to TLDraw shapes
 */
function importNodesToTLDraw(editor, nodes) {
  const shapes = [];

  nodes.forEach(node => {
    let shapeType, shapeProps;

    if (node.type === 'chart') {
      shapeType = 'chart';
      shapeProps = {
        w: node.data.width || 800,
        h: node.data.height || 400,
        chartData: node.data.figure?.data || null,
        chartLayout: node.data.figure?.layout || null,
        chartType: node.data.chartType || 'bar',
        title: node.data.title || '',
        dimensions: node.data.dimensions || [],
        measures: node.data.measures || [],
        table: node.data.table || [],
        agg: node.data.agg || 'sum',
        datasetId: node.data.datasetId || '',
        selected: node.data.selected || false,
        aiInsights: node.data.aiInsights || null,
        aiQuery: node.data.aiQuery || ''
      };
    } else if (node.type === 'textbox') {
      shapeType = 'textbox';
      shapeProps = {
        w: node.data.width || 200,
        h: node.data.height || 100,
        text: node.data.text || '',
        fontSize: node.data.fontSize || 14
      };
    } else if (node.type === 'table') {
      shapeType = 'table';
      shapeProps = {
        w: node.data.width || 600,
        h: node.data.height || 400,
        title: node.data.title || '',
        headers: node.data.headers || [],
        rows: node.data.rows || [],
        totalRows: node.data.totalRows || 0
      };
    } else {
      // Skip unknown types
      return;
    }

    const shapeId = createShapeId(node.id);
    
    shapes.push({
      id: shapeId,
      type: shapeType,
      x: node.position?.x || 0,
      y: node.position?.y || 0,
      props: shapeProps
    });
  });

  if (shapes.length > 0) {
    editor.createShapes(shapes);
  }
}

/**
 * Convert single TLDraw shape to node format
 */
function convertShapeToNode(shape) {
  const baseNode = {
    id: shape.id,
    type: shape.type,
    position: { x: shape.x, y: shape.y }
  };

  if (shape.type === 'chart') {
    return {
      ...baseNode,
      data: {
        title: shape.props.title,
        figure: {
          data: shape.props.chartData,
          layout: shape.props.chartLayout
        },
        chartType: shape.props.chartType,
        dimensions: shape.props.dimensions,
        measures: shape.props.measures,
        table: shape.props.table,
        agg: shape.props.agg,
        datasetId: shape.props.datasetId,
        selected: shape.props.selected,
        width: shape.props.w,
        height: shape.props.h,
        aiInsights: shape.props.aiInsights,
        aiQuery: shape.props.aiQuery
      }
    };
  }

  if (shape.type === 'textbox') {
    return {
      ...baseNode,
      data: {
        text: shape.props.text,
        fontSize: shape.props.fontSize,
        width: shape.props.w,
        height: shape.props.h
      }
    };
  }

  if (shape.type === 'table') {
    return {
      ...baseNode,
      data: {
        title: shape.props.title,
        headers: shape.props.headers,
        rows: shape.props.rows,
        totalRows: shape.props.totalRows,
        width: shape.props.w,
        height: shape.props.h
      }
    };
  }

  return baseNode;
}

/**
 * Convert all TLDraw shapes to nodes format
 */
function convertShapesToNodes(shapes) {
  return shapes
    .filter(shape => ['chart', 'textbox', 'table'].includes(shape.type))
    .map(convertShapeToNode);
}

/**
 * Import React Flow edges as TLDraw arrows
 */
function importEdgesToTLDraw(editor, edges) {
  if (!edges || edges.length === 0) return;
  
  const arrows = convertEdgesToArrows(edges);
  
  if (arrows.length > 0) {
    editor.createShapes(arrows);
  }
}

/**
 * Update existing TLDraw shapes with new node data
 * This is called when node data changes (e.g., chart type change)
 */
function updateNodesInTLDraw(editor, nodes) {
  if (!nodes || nodes.length === 0) return;
  
  console.log('🔧 updateNodesInTLDraw: Updating shapes for', nodes.length, 'nodes');
  
  nodes.forEach(node => {
    // Construct the TLDraw shape ID from the node ID
    const shapeId = `shape:${node.id}`;
    
    // Get the existing shape
    const existingShape = editor.getShape(shapeId);
    
    if (!existingShape) {
      console.warn(`⚠️ Shape not found for node ${node.id}`);
      return;
    }
    
    console.log('📝 Updating shape:', shapeId, 'Type:', node.type, 'ChartType:', node.data?.chartType);
    
    // Prepare updated props based on node type
    let updatedProps = {};
    
    if (node.type === 'chart') {
      // Handle both Plotly (figure) and ECharts (chartData/chartLayout) formats
      let chartData = null;
      let chartLayout = null;
      
      if (node.data?.chartData && node.data?.chartLayout) {
        // ECharts format
        chartData = node.data.chartData;
        chartLayout = node.data.chartLayout;
      } else if (node.data?.figure) {
        // Plotly format
        chartData = node.data.figure.data;
        chartLayout = node.data.figure.layout;
      }
      
      updatedProps = {
        w: node.data.width || existingShape.props.w,
        h: node.data.height || existingShape.props.h,
        chartData: chartData,
        chartLayout: chartLayout,
        chartType: node.data.chartType || existingShape.props.chartType,
        title: node.data.title || existingShape.props.title,
        dimensions: node.data.dimensions || existingShape.props.dimensions || [],
        measures: node.data.measures || existingShape.props.measures || [],
        table: node.data.table || existingShape.props.table || [],
        agg: node.data.agg || existingShape.props.agg,
        datasetId: node.data.datasetId || existingShape.props.datasetId,
        selected: node.data.selected || existingShape.props.selected,
        aiInsights: node.data.aiInsights || existingShape.props.aiInsights,
        aiQuery: node.data.aiQuery || existingShape.props.aiQuery
      };
      
      console.log('✨ Updated chart props:', {
        chartType: updatedProps.chartType,
        hasChartData: !!updatedProps.chartData,
        hasChartLayout: !!updatedProps.chartLayout
      });
    } else if (node.type === 'textbox') {
      updatedProps = {
        w: node.data.width || existingShape.props.w,
        h: node.data.height || existingShape.props.h,
        text: node.data.text || existingShape.props.text,
        fontSize: node.data.fontSize || existingShape.props.fontSize
      };
    } else if (node.type === 'table') {
      updatedProps = {
        w: node.data.width || existingShape.props.w,
        h: node.data.height || existingShape.props.h,
        title: node.data.title || existingShape.props.title,
        headers: node.data.headers || existingShape.props.headers,
        rows: node.data.rows || existingShape.props.rows,
        totalRows: node.data.totalRows || existingShape.props.totalRows
      };
    }
    
    // Update the shape with new props
    editor.updateShape({
      id: shapeId,
      type: existingShape.type,
      props: updatedProps
    });
    
    console.log('✅ Shape updated successfully:', shapeId);
  });
}

export default TLDrawCanvas;
