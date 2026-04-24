import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Dagre layout helper (pure JS, no extra package needed) ───────────────────
// Simple top-down layout: source nodes in a row at top, output node at bottom.
function computeLayout(nodes, edges) {
  const SOURCE_Y = 60;
  const OUTPUT_Y = 280;
  const NODE_W = 200;
  const NODE_H = 72;
  const H_GAP = 40;

  const sourceNodes = nodes.filter(n => n.data.nodeType === 'source');
  const outputNodes = nodes.filter(n => n.data.nodeType === 'output');

  const totalSourceW = sourceNodes.length * NODE_W + (sourceNodes.length - 1) * H_GAP;
  const startX = -totalSourceW / 2;

  const positioned = [];
  sourceNodes.forEach((n, i) => {
    positioned.push({
      ...n,
      position: { x: startX + i * (NODE_W + H_GAP), y: SOURCE_Y },
    });
  });
  outputNodes.forEach((n, i) => {
    positioned.push({
      ...n,
      position: { x: -NODE_W / 2, y: OUTPUT_Y },
    });
  });

  return { nodes: positioned, edges, NODE_W, NODE_H };
}

// ─── Custom: Source CSV node ──────────────────────────────────────────────────
function SourceNode({ data, selected }) {
  return (
    <div
      style={{
        width: 200,
        padding: '10px 14px',
        borderRadius: 12,
        border: `2px solid ${selected ? '#2563EB' : '#D1D5DB'}`,
        backgroundColor: '#FFFFFF',
        boxShadow: selected
          ? '0 0 0 3px #BFDBFE, 0 2px 8px rgba(0,0,0,0.08)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: '#EFF6FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* CSV file icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#111827',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 130,
          }}
          title={data.label}
        >
          {data.label}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {data.rows != null && (
          <span
            style={{
              fontSize: 10,
              color: '#6B7280',
              backgroundColor: '#F3F4F6',
              border: '1px solid #E5E7EB',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {data.rows.toLocaleString()} rows
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            color: '#2563EB',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          Source
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#9CA3AF', width: 8, height: 8 }} />
    </div>
  );
}

// ─── Custom: Flat/output table node ──────────────────────────────────────────
function OutputNode({ data, selected }) {
  return (
    <div
      style={{
        width: 220,
        padding: '12px 14px',
        borderRadius: 12,
        border: `2px solid ${selected ? '#1D4ED8' : '#2563EB'}`,
        backgroundColor: selected ? '#EFF6FF' : '#F0F9FF',
        boxShadow: selected
          ? '0 0 0 3px #BFDBFE, 0 4px 12px rgba(37,99,235,0.15)'
          : '0 2px 8px rgba(37,99,235,0.12)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: '#DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Table/grid icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
        </div>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#1E3A8A',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 150,
          }}
          title={data.label}
        >
          {data.label}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {data.rows != null && (
          <span
            style={{
              fontSize: 10,
              color: '#6B7280',
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid #E5E7EB',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {data.rows.toLocaleString()} rows
          </span>
        )}
        {data.dimensions != null && (
          <span
            style={{
              fontSize: 10,
              color: '#2563EB',
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid #BFDBFE',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {data.dimensions} dims
          </span>
        )}
        {data.measures != null && (
          <span
            style={{
              fontSize: 10,
              color: '#059669',
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid #A7F3D0',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {data.measures} msrs
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            color: '#7C3AED',
            backgroundColor: '#F5F3FF',
            border: '1px solid #DDD6FE',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          Flat Table
        </span>
      </div>
      <Handle type="target" position={Position.Top} style={{ background: '#2563EB', width: 8, height: 8 }} />
    </div>
  );
}

const NODE_TYPES = { sourceNode: SourceNode, outputNode: OutputNode };

// ─── Main SchemaGraph component ───────────────────────────────────────────────
export default function SchemaGraph({ nodes: nodeProp, edges: edgeProp, selectedNodeId, onNodeSelect }) {
  // Build React Flow node/edge arrays from props
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!nodeProp?.length) return { rfNodes: [], rfEdges: [] };

    // Map to RF node objects with position computed by simple layout
    const rawNodes = nodeProp.map(n => ({
      id: n.id,
      type: n.nodeType === 'output' ? 'outputNode' : 'sourceNode',
      data: {
        label: n.label,
        rows: n.rows,
        dimensions: n.dimensions,
        measures: n.measures,
        nodeType: n.nodeType,
        originalId: n.id,
      },
      position: { x: 0, y: 0 }, // will be overwritten by layout
    }));

    const rawEdges = (edgeProp || []).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || '',
      type: e.dashed ? 'smoothstep' : 'smoothstep',
      animated: !e.dashed,
      style: e.dashed
        ? { stroke: '#9CA3AF', strokeDasharray: '5 4', strokeWidth: 1.5 }
        : { stroke: '#2563EB', strokeWidth: 2 },
      labelStyle: { fontSize: 10, fill: '#374151', fontWeight: 500 },
      labelBgStyle: { fill: '#F9FAFB', fillOpacity: 0.9 },
      labelBgPadding: [4, 6],
      labelBgBorderRadius: 4,
      markerEnd: e.dashed
        ? undefined
        : { type: MarkerType.ArrowClosed, color: '#2563EB', width: 14, height: 14 },
    }));

    const { nodes: positioned } = computeLayout(rawNodes, rawEdges);

    return { rfNodes: positioned, rfEdges: rawEdges };
  }, [nodeProp, edgeProp]);

  const [rfNodeState, , onNodesChange] = useNodesState(rfNodes);
  const [rfEdgeState, , onEdgesChange] = useEdgesState(rfEdges);

  const handleNodeClick = useCallback(
    (_, node) => { onNodeSelect?.(node.id); },
    [onNodeSelect]
  );

  // Inject external selection into each node's `selected` flag
  const nodesWithSelection = useMemo(
    () => rfNodeState.map(n => ({ ...n, selected: n.id === selectedNodeId })),
    [rfNodeState, selectedNodeId]
  );

  if (!nodeProp?.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        No graph data available.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodesWithSelection}
        edges={rfEdgeState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        minZoom={0.4}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E7EB" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            bottom: 16,
            left: 16,
          }}
        />
      </ReactFlow>
    </div>
  );
}
