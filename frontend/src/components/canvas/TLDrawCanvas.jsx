import React, { useEffect, useRef } from 'react';
import { Tldraw, createShapeId } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { ChartShape } from './shapes/ChartShape';
import { TextBoxShape } from './shapes/TextShape';
import { TableShape } from './shapes/TableShape';
import { ExpressionShape } from './shapes/ExpressionShape';
import './tldraw-custom.css';

/**
 * TLDraw Canvas Component
 * Infinite canvas with custom shapes for data visualization
 */
const TLDrawCanvas = ({
  nodes = [],
  onNodesChange,
  onNodeClick,
  initialViewport
}) => {
  const editorRef = useRef(null);
  const initialImportDone = useRef(false);

  // Custom shape utilities
  const shapeUtils = [ChartShape, TextBoxShape, TableShape, ExpressionShape];

  const handleMount = (editor) => {
    editorRef.current = editor;

    // Import existing nodes as TLDraw shapes (only once)
    if (!initialImportDone.current && nodes.length > 0) {
      importNodesToTLDraw(editor, nodes);
      initialImportDone.current = true;
    }

    // Listen to shape changes
    const unsubscribe = editor.store.listen((entry) => {
      if (entry.source === 'user') {
        // Get all shapes and convert to nodes format
        const shapes = editor.getCurrentPageShapes();
        if (onNodesChange) {
          const convertedNodes = convertShapesToNodes(shapes);
          onNodesChange(convertedNodes);
        }
      }
    });

    // Listen to selection changes
    editor.on('select', (info) => {
      if (onNodeClick && info.shapes.length > 0) {
        const shape = info.shapes[0];
        onNodeClick({ node: convertShapeToNode(shape) });
      }
    });

    return () => {
      unsubscribe();
    };
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      backgroundColor: '#fafafa'
    }}>
      <Tldraw
        shapeUtils={shapeUtils}
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
    } else if (node.type === 'expression') {
      shapeType = 'expression';
      shapeProps = {
        w: node.data.width || 400,
        h: node.data.height || 200,
        expression: node.data.expression || '',
        result: node.data.result || '',
        error: node.data.error || ''
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

  if (shape.type === 'expression') {
    return {
      ...baseNode,
      data: {
        expression: shape.props.expression,
        result: shape.props.result,
        error: shape.props.error,
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
    .filter(shape => ['chart', 'textbox', 'table', 'expression'].includes(shape.type))
    .map(convertShapeToNode);
}

export default TLDrawCanvas;
