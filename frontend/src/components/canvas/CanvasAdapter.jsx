import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from 'react-flow-renderer';
import TLDrawCanvas from './TLDrawCanvas';

/**
 * Canvas Adapter
 * Provides unified interface for both React Flow and TLDraw
 * Allows switching between implementations via feature flag
 * 
 * Props:
 * @param {boolean} useTLDraw - Feature flag to use TLDraw vs React Flow
 * @param {Array} nodes - Current nodes/shapes
 * @param {Array} edges - Current edges/arrows
 * @param {Object} nodeTypes - React Flow node type components
 * @param {Function} onNodesChange - Callback when nodes change
 * @param {Function} onEdgesChange - Callback when edges change
 * @param {Function} onNodeClick - Callback when node is clicked
 * @param {Function} onPaneClick - Callback when empty canvas is clicked
 * @param {Function} onSelectionChange - Callback when selection changes
 * @param {Function} onConnect - Callback when nodes are connected
 * @param {Object} style - Canvas style
 * @param {boolean} fitView - Whether to fit view on mount
 * @param {Object} fitViewOptions - Options for fit view
 */
const CanvasAdapter = ({
  useTLDraw = false,
  nodes = [],
  edges = [],
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onPaneClick,
  onSelectionChange,
  onConnect,
  style = {},
  fitView = false,
  fitViewOptions = {},
  children,
  ...otherProps
}) => {
  const [syncedNodes, setSyncedNodes] = useState(nodes);
  const [syncedEdges, setSyncedEdges] = useState(edges);
  const lastSyncRef = useRef({ nodes: [], edges: [] });

  // Sync nodes when they change from parent
  useEffect(() => {
    if (JSON.stringify(nodes) !== JSON.stringify(lastSyncRef.current.nodes)) {
      setSyncedNodes(nodes);
      lastSyncRef.current.nodes = nodes;
    }
  }, [nodes]);

  // Sync edges when they change from parent
  useEffect(() => {
    if (JSON.stringify(edges) !== JSON.stringify(lastSyncRef.current.edges)) {
      setSyncedEdges(edges);
      lastSyncRef.current.edges = edges;
    }
  }, [edges]);

  // Handle nodes change (unified for both implementations)
  const handleNodesChange = useCallback((changesOrNodes) => {
    if (!onNodesChange) return;

    if (useTLDraw) {
      // TLDraw returns complete node array
      onNodesChange(changesOrNodes);
    } else {
      // React Flow returns changes array
      const updatedNodes = applyNodeChanges(changesOrNodes, syncedNodes);
      onNodesChange(updatedNodes);
    }
  }, [useTLDraw, syncedNodes, onNodesChange]);

  // Handle edges change (unified for both implementations)
  const handleEdgesChange = useCallback((changesOrEdges) => {
    if (!onEdgesChange) return;

    if (useTLDraw) {
      // TLDraw returns complete edge array
      onEdgesChange(changesOrEdges);
    } else {
      // React Flow returns changes array
      const updatedEdges = applyEdgeChanges(changesOrEdges, syncedEdges);
      onEdgesChange(updatedEdges);
    }
  }, [useTLDraw, syncedEdges, onEdgesChange]);

  // Render TLDraw implementation
  if (useTLDraw) {
    return (
      <div style={{ width: '100%', height: '100%', ...style }}>
        <TLDrawCanvas
          nodes={syncedNodes}
          edges={syncedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          {...otherProps}
        />
      </div>
    );
  }

  // Render React Flow implementation (existing)
  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <ReactFlow
        nodes={syncedNodes}
        edges={syncedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        onConnect={onConnect}
        fitView={fitView}
        fitViewOptions={fitViewOptions}
        {...otherProps}
      >
        <Background />
        <Controls />
        <MiniMap />
        {children}
      </ReactFlow>
    </div>
  );
};

export default CanvasAdapter;
