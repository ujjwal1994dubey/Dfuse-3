import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Send, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import SchemaGraph from '../components/schema/SchemaGraph';
import SchemaNodeDetail from '../components/schema/SchemaNodeDetail';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ─── Build graph nodes + edges from a schema record ───────────────────────────
function buildGraph(schema) {
  if (!schema) return { nodes: [], edges: [] };

  const relationships = Array.isArray(schema.relationships) ? schema.relationships : [];

  // Collect unique source datasets from relationship links
  const sourceMap = new Map(); // id → { id, label (filename) }
  relationships.forEach(rel => {
    if (rel.dataset_a_id && rel.dataset_a_name) {
      sourceMap.set(rel.dataset_a_id, { id: rel.dataset_a_id, label: rel.dataset_a_name });
    }
    if (rel.dataset_b_id && rel.dataset_b_name) {
      sourceMap.set(rel.dataset_b_id, { id: rel.dataset_b_id, label: rel.dataset_b_name });
    }
  });

  const nodes = [];

  // Source CSV nodes
  sourceMap.forEach(ds => {
    nodes.push({ id: ds.id, label: ds.label, nodeType: 'source', rows: null });
  });

  // Output / merged flat table node
  if (schema.merged_dataset_id) {
    nodes.push({
      id: schema.merged_dataset_id,
      label: schema.name || 'Flat Table',
      nodeType: 'output',
      rows: schema.record_count || null,
      dimensions: null,
      measures: null,
    });
  }

  const edges = [];

  // Join edges between source tables (from relationships)
  relationships.forEach(rel => {
    if (rel.dataset_a_id && rel.dataset_b_id) {
      const cardinality = rel.cardinality ? ` (${rel.cardinality})` : '';
      edges.push({
        id: `rel-${rel.link_id || `${rel.dataset_a_id}-${rel.dataset_b_id}`}`,
        source: rel.dataset_a_id,
        target: rel.dataset_b_id,
        label: `${rel.col_a} → ${rel.col_b}${cardinality}`,
        dashed: false,
      });
    }
  });

  // Lineage edges from each source to the merged output
  if (schema.merged_dataset_id) {
    sourceMap.forEach(ds => {
      edges.push({
        id: `lineage-${ds.id}`,
        source: ds.id,
        target: schema.merged_dataset_id,
        label: '',
        dashed: true,
      });
    });
  }

  return { nodes, edges };
}

// ─── Page component ───────────────────────────────────────────────────────────
export default function SchemaVisualizationPage() {
  const { schemaId } = useParams();
  const navigate = useNavigate();

  // ── Core data ──
  const [schema, setSchema]                 = useState(null);
  const [loadingSchema, setLoadingSchema]   = useState(true);
  const [schemaError, setSchemaError]       = useState(null);

  // ── Per-node metadata ──
  // { [datasetId]: { dataset_summary, columns[] } }
  const [analysisMap, setAnalysisMap]       = useState({});
  // { [datasetId]: { dimensions, measures, rows } }
  const [metaMap, setMetaMap]               = useState({});
  // { [datasetId]: rows[] }
  const [previewMap, setPreviewMap]         = useState({});
  // { [datasetId]: 'not_in_session' | 'fetch_error' | null }
  const [previewErrorMap, setPreviewErrorMap] = useState({});
  const [previewLoadingMap, setPreviewLoadingMap] = useState({});

  // ── Selection ──
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // ── Query Engine ──
  const [queryPanelOpen, setQueryPanelOpen] = useState(true);
  const [queryText, setQueryText]           = useState('');
  const [queryLoading, setQueryLoading]     = useState(false);
  const [queryResult, setQueryResult]       = useState(null);   // last result from /query-engine
  const [queryError, setQueryError]         = useState(null);
  const queryInputRef = useRef(null);

  // ── Step 1: Load the schema record ──
  useEffect(() => {
    if (!schemaId) return;
    setLoadingSchema(true);
    setSchemaError(null);
    fetch(`${API}/schemas/${schemaId}`)
      .then(r => {
        if (!r.ok) throw new Error('Schema not found');
        return r.json();
      })
      .then(data => {
        const rec = data.data || data;
        setSchema(rec);
        // Default selection: merged output node if present, otherwise first source node
        if (rec.merged_dataset_id) {
          setSelectedNodeId(rec.merged_dataset_id);
        } else if (rec.relationships?.length > 0) {
          setSelectedNodeId(rec.relationships[0].dataset_a_id);
        }
      })
      .catch(err => setSchemaError(err.message))
      .finally(() => setLoadingSchema(false));
  }, [schemaId]);

  // ── Step 2: Load per-dataset metadata once schema is known ──
  useEffect(() => {
    if (!schema) return;

    const relationships = Array.isArray(schema.relationships) ? schema.relationships : [];
    // Unique source dataset IDs from relationships
    const sourceIds = new Map();
    relationships.forEach(rel => {
      if (rel.dataset_a_id) sourceIds.set(rel.dataset_a_id, rel.dataset_a_name);
      if (rel.dataset_b_id) sourceIds.set(rel.dataset_b_id, rel.dataset_b_name);
    });

    // Fetch AI analysis metadata for each source dataset
    const fetchAnalysis = async (datasetId) => {
      try {
        const res = await fetch(`${API}/dataset/${datasetId}/metadata`);
        if (!res.ok) return; // not in session — analysis unavailable
        const data = await res.json();
        if (data.metadata) {
          setAnalysisMap(prev => ({ ...prev, [datasetId]: data.metadata }));
        }
      } catch (_) { /* ignore */ }
    };

    sourceIds.forEach((_, id) => fetchAnalysis(id));
  }, [schema]);

  // ── Step 3: Load preview for a specific dataset ──
  const loadPreview = useCallback(async (datasetId) => {
    if (!datasetId) return;
    setPreviewLoadingMap(prev => ({ ...prev, [datasetId]: true }));
    setPreviewErrorMap(prev => ({ ...prev, [datasetId]: null }));
    try {
      // Fetch meta first (dimensions, measures, rows)
      const metaRes = await fetch(`${API}/datasets/${datasetId}/meta`);
      if (!metaRes.ok) {
        setPreviewErrorMap(prev => ({ ...prev, [datasetId]: 'not_in_session' }));
        return;
      }
      const metaData = await metaRes.json();
      setMetaMap(prev => ({ ...prev, [datasetId]: metaData }));

      // Fetch table rows via /charts (same pattern as SchemaDetailPanel)
      const allCols = [...(metaData.dimensions || []), ...(metaData.measures || [])];
      if (allCols.length > 0) {
        const chartRes = await fetch(`${API}/charts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_id: datasetId,
            dimensions: allCols.slice(0, 20),
            measures: [],
            agg: 'count',
          }),
        });
        if (chartRes.ok) {
          const chartData = await chartRes.json();
          setPreviewMap(prev => ({ ...prev, [datasetId]: chartData.table || [] }));
        }
      } else {
        setPreviewMap(prev => ({ ...prev, [datasetId]: [] }));
      }
    } catch (_) {
      setPreviewErrorMap(prev => ({ ...prev, [datasetId]: 'fetch_error' }));
    } finally {
      setPreviewLoadingMap(prev => ({ ...prev, [datasetId]: false }));
    }
  }, []);

  // Load preview when selected node changes (and it hasn't been loaded yet)
  useEffect(() => {
    if (!selectedNodeId) return;
    if (previewMap[selectedNodeId] !== undefined) return; // already loaded
    if (previewErrorMap[selectedNodeId]) return;
    loadPreview(selectedNodeId);
  }, [selectedNodeId, previewMap, previewErrorMap, loadPreview]);

  // ── Query Engine runner ──
  const runQuery = useCallback(async () => {
    const q = queryText.trim();
    if (!q || !schema) return;

    // Collect all source dataset IDs from schema relationships
    const rels = Array.isArray(schema.relationships) ? schema.relationships : [];
    const sourceIds = new Set();
    rels.forEach(rel => {
      if (rel.dataset_a_id) sourceIds.add(rel.dataset_a_id);
      if (rel.dataset_b_id) sourceIds.add(rel.dataset_b_id);
    });

    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await fetch(`${API}/query-engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: q,
          dataset_ids: sourceIds.size > 0 ? Array.from(sourceIds) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQueryResult(data);
    } catch (e) {
      setQueryError(e.message);
    } finally {
      setQueryLoading(false);
    }
  }, [queryText, schema]);

  // ── Derived graph data ──
  const { nodes: graphNodes, edges: graphEdges } = schema ? buildGraph(schema) : { nodes: [], edges: [] };

  // Enrich graph nodes with loaded meta (rows from metaMap)
  const enrichedNodes = graphNodes.map(n => {
    const meta = metaMap[n.id];
    if (!meta) return n;
    return {
      ...n,
      rows: meta.rows ?? n.rows,
      dimensions: meta.dimensions?.length ?? n.dimensions,
      measures: meta.measures?.length ?? n.measures,
    };
  });

  // Selected node full object
  const selectedGraphNode = enrichedNodes.find(n => n.id === selectedNodeId) || null;
  const selectedAnalysis  = selectedNodeId ? (analysisMap[selectedNodeId] || null) : null;
  const selectedMeta      = selectedNodeId ? (metaMap[selectedNodeId] || null) : null;
  const selectedPreview   = selectedNodeId ? (previewMap[selectedNodeId] ?? null) : null;
  const selectedPrevLoading = selectedNodeId ? (previewLoadingMap[selectedNodeId] || false) : false;
  const selectedPrevError   = selectedNodeId ? (previewErrorMap[selectedNodeId] || null) : null;

  // ── Render: loading / error states ──
  if (loadingSchema) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6B7280',
          fontSize: 14,
          gap: 10,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            border: '2.5px solid #E5E7EB',
            borderTopColor: '#2563EB',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        Loading schema…
      </div>
    );
  }

  if (schemaError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          color: '#6B7280',
        }}
      >
        <AlertCircle size={32} style={{ color: '#F59E0B' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Schema not found</p>
        <p style={{ fontSize: 12 }}>{schemaError}</p>
        <button
          onClick={() => navigate('/library')}
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: '#2563EB',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          ← Back to Library
        </button>
      </div>
    );
  }

  const schemaName = schema?.name || 'Schema';
  const createdDate = schema?.created_at
    ? new Date(schema.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#F8FAFC',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 24px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate('/library')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#6B7280',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            transition: 'color 0.15s',
          }}
          onMouseOver={e => e.currentTarget.style.color = '#111827'}
          onMouseOut={e => e.currentTarget.style.color = '#6B7280'}
        >
          <ArrowLeft size={15} />
          Back
        </button>

        <div style={{ width: 1, height: 20, backgroundColor: '#E5E7EB' }} />

        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
            {schemaName}
          </h1>
          {createdDate && (
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
              Created {createdDate}
              {schema?.file_count ? ` · ${schema.file_count} source files` : ''}
              {schema?.relationships?.length
                ? ` · ${schema.relationships.length} join${schema.relationships.length !== 1 ? 's' : ''}`
                : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── Body: graph + detail panel ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: React Flow graph */}
        <div
          style={{
            width: '42%',
            flexShrink: 0,
            borderRight: '1px solid #E5E7EB',
            backgroundColor: '#FAFBFC',
            position: 'relative',
          }}
        >
          <SchemaGraph
            nodes={enrichedNodes}
            edges={graphEdges}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
          />
        </div>

        {/* Right: node detail panel */}
        <div style={{ flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
          <SchemaNodeDetail
            node={selectedGraphNode}
            analysis={selectedAnalysis}
            tableData={selectedPreview}
            tableMeta={selectedMeta}
            previewLoading={selectedPrevLoading}
            previewError={selectedPrevError}
            onRefreshPreview={() => {
              setPreviewMap(prev => { const n = { ...prev }; delete n[selectedNodeId]; return n; });
              setPreviewErrorMap(prev => { const n = { ...prev }; delete n[selectedNodeId]; return n; });
              loadPreview(selectedNodeId);
            }}
          />
        </div>
      </div>

      {/* ── Query Engine panel ── */}
      <QueryPanel
        open={queryPanelOpen}
        onToggle={() => setQueryPanelOpen(p => !p)}
        queryText={queryText}
        onQueryChange={setQueryText}
        onSubmit={runQuery}
        loading={queryLoading}
        result={queryResult}
        error={queryError}
        inputRef={queryInputRef}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Query Panel sub-component ────────────────────────────────────────────────
function QueryPanel({ open, onToggle, queryText, onQueryChange, onSubmit, loading, result, error, inputRef }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E5E7EB',
        transition: 'max-height 0.25s ease',
        maxHeight: open ? 520 : 44,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toggle header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 20px',
          height: 44,
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: open ? '1px solid #F3F4F6' : 'none',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: '#2563EB',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>
          Ask a question about this schema
        </span>
        {open ? <ChevronDown size={15} color="#6B7280" /> : <ChevronUp size={15} color="#6B7280" />}
      </button>

      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          value={queryText}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. What is the average order value per city?"
          disabled={loading}
          style={{
            flex: 1,
            height: 36,
            padding: '0 12px',
            fontSize: 13,
            border: '1px solid #D1D5DB',
            borderRadius: 8,
            outline: 'none',
            color: '#111827',
            backgroundColor: loading ? '#F9FAFB' : '#FFFFFF',
          }}
        />
        <button
          onClick={onSubmit}
          disabled={loading || !queryText.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 36,
            padding: '0 16px',
            fontSize: 13,
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: loading || !queryText.trim() ? '#93C5FD' : '#2563EB',
            border: 'none',
            borderRadius: 8,
            cursor: loading || !queryText.trim() ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />}
          {loading ? 'Running…' : 'Ask'}
        </button>
      </div>

      {/* Result area */}
      {(result || error) && (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0 20px 16px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: 8,
                fontSize: 13,
                color: '#DC2626',
              }}
            >
              {error}
            </div>
          )}

          {result && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Meta badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor:
                      result.result_type === 'table' ? '#EFF6FF' :
                      result.result_type === 'value' ? '#F0FDF4' : '#F9FAFB',
                    color:
                      result.result_type === 'table' ? '#2563EB' :
                      result.result_type === 'value' ? '#16A34A' : '#6B7280',
                    border: '1px solid',
                    borderColor:
                      result.result_type === 'table' ? '#BFDBFE' :
                      result.result_type === 'value' ? '#BBF7D0' : '#E5E7EB',
                  }}
                >
                  {result.result_type}
                </span>
                {result.token_usage?.totalTokens > 0 && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {result.token_usage.totalTokens.toLocaleString()} tokens
                  </span>
                )}
                {result.join_description && result.join_description !== 'single table — no join' && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>· {result.join_description}</span>
                )}
              </div>

              {/* Value result */}
              {result.result_type === 'value' && result.data != null && (
                <div
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#F0FDF4',
                    borderRadius: 10,
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#15803D',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {typeof result.data === 'number'
                    ? result.data.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : result.data}
                </div>
              )}

              {/* Table result */}
              {result.result_type === 'table' && Array.isArray(result.data) && result.data.length > 0 && (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F9FAFB' }}>
                        {(result.columns || Object.keys(result.data[0])).map(col => (
                          <th
                            key={col}
                            style={{
                              padding: '7px 12px',
                              textAlign: 'left',
                              fontWeight: 600,
                              color: '#374151',
                              borderBottom: '1px solid #E5E7EB',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.slice(0, 50).map((row, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F9FAFB' }}>
                          {(result.columns || Object.keys(result.data[0])).map(col => (
                            <td
                              key={col}
                              style={{
                                padding: '6px 12px',
                                color: '#374151',
                                borderBottom: '1px solid #F3F4F6',
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.data.length > 50 && (
                    <p style={{ fontSize: 11, color: '#9CA3AF', padding: '6px 12px' }}>
                      Showing 50 of {result.data.length} rows
                    </p>
                  )}
                </div>
              )}

              {/* Text / answer */}
              {result.answer && (
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {result.answer}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
