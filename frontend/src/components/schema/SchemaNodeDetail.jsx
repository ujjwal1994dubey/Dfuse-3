import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, RefreshCw, Check, Save, ChevronDown, ChevronUp } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatChip({ label, color = 'gray' }) {
  const colors = {
    gray:   { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
    blue:   { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
    green:  { bg: '#F0FDF4', text: '#059669', border: '#A7F3D0' },
    purple: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  };
  const c = colors[color] || colors.gray;
  return (
    <span
      style={{
        fontSize: 11,
        color: c.text,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        padding: '2px 8px',
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

function NotInSessionWarning({ onReCreate }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid #FCD34D',
        backgroundColor: '#FFFBEB',
        padding: '14px 16px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <AlertCircle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>
            Data not in this session
          </p>
          <p style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5 }}>
            The dataset lives in memory and is cleared when the backend restarts.
            Re-upload your original CSV files to view the table preview and descriptions again.
          </p>
          {onReCreate && (
            <button
              onClick={onReCreate}
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 500,
                color: '#B45309',
                textDecoration: 'underline',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Re-create schema →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Column description row ───────────────────────────────────────────────────
function ColumnRow({ col, editedDesc, onChange }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderBottom: '1px solid #F3F4F6',
        paddingBottom: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Column name + type */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <p
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#374151',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={col.name}
          >
            {col.name}
          </p>
          <p style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' }}>
            {col.dtype || ''}
          </p>
        </div>

        {/* Description input */}
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={editedDesc ?? col.description ?? ''}
            onChange={e => onChange(col.name, e.target.value)}
            placeholder="Add description…"
            style={{
              width: '100%',
              fontSize: 12,
              color: '#374151',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              padding: '4px 8px',
              outline: 'none',
              backgroundColor: '#FAFAFA',
            }}
            onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.backgroundColor = '#fff'; }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.backgroundColor = '#FAFAFA'; }}
          />

          {/* Sample values pill row */}
          {col.sample_values?.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {col.sample_values.slice(0, 3).map((v, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: '#9CA3AF',
                    backgroundColor: '#F3F4F6',
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontFamily: 'monospace',
                  }}
                >
                  {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Table preview ────────────────────────────────────────────────────────────
function TablePreview({ tableData, meta, loading, error, onRefresh }) {
  const displayCols = tableData ? Object.keys(tableData[0] || {}).slice(0, 12) : [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Table Preview
        </p>
        {meta && onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#9CA3AF',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseOver={e => e.currentTarget.style.color = '#2563EB'}
            onMouseOut={e => e.currentTarget.style.color = '#9CA3AF'}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        )}
      </div>

      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'center',
            padding: '24px 0',
            color: '#9CA3AF',
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: '2px solid #E5E7EB',
              borderTopColor: '#2563EB',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }}
          />
          Loading table…
        </div>
      )}

      {!loading && error === 'not_in_session' && (
        <NotInSessionWarning onReCreate={() => window.location.assign('/library/schemas/new')} />
      )}

      {!loading && !error && meta && tableData !== null && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <StatChip label={`${meta.dimensions?.length || 0} dimensions`} color="blue" />
            <StatChip label={`${meta.measures?.length || 0} measures`} color="green" />
            <StatChip label={`${meta.rows?.toLocaleString()} rows`} color="gray" />
          </div>

          {tableData.length > 0 ? (
            <div
              style={{
                overflowX: 'auto',
                borderRadius: 10,
                border: '1px solid #E5E7EB',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#F9FAFB', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    {displayCols.map(col => (
                      <th
                        key={col}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          color: '#374151',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid #F3F4F6',
                          borderBottom: '1px solid #E5E7EB',
                        }}
                      >
                        <div>
                          <div>{col}</div>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 400,
                              color: '#9CA3AF',
                              marginTop: 1,
                            }}
                          >
                            {meta.dimensions?.includes(col) ? 'dim' : 'msr'}
                          </div>
                        </div>
                      </th>
                    ))}
                    {Object.keys(tableData[0] || {}).length > 12 && (
                      <th
                        style={{
                          padding: '8px 10px',
                          color: '#9CA3AF',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        +{Object.keys(tableData[0]).length - 12} more
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableData.slice(0, 15).map((row, i) => (
                    <tr
                      key={i}
                      style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}
                    >
                      {displayCols.map(col => (
                        <td
                          key={col}
                          style={{
                            padding: '6px 10px',
                            color: '#374151',
                            whiteSpace: 'nowrap',
                            borderRight: '1px solid #F3F4F6',
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row[col] == null ? (
                            <span style={{ color: '#D1D5DB', fontStyle: 'italic' }}>null</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tableData.length > 15 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '8px 0',
                    fontSize: 11,
                    color: '#9CA3AF',
                    borderTop: '1px solid #F3F4F6',
                    backgroundColor: '#FAFAFA',
                  }}
                >
                  Showing 15 of {tableData.length} rows
                </div>
              )}
            </div>
          ) : (
            <div
              style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: '#9CA3AF' }}
            >
              No rows in this dataset.
            </div>
          )}
        </>
      )}

      {!loading && !error && !meta && (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: '#9CA3AF' }}>
          No dataset linked.
        </div>
      )}
    </div>
  );
}

// ─── Main SchemaNodeDetail component ─────────────────────────────────────────
export default function SchemaNodeDetail({
  node,           // { id, label, nodeType: 'source'|'output', rows, dimensions, measures }
  analysis,       // { dataset_summary, columns[] } | null
  tableData,      // rows[] | null
  tableMeta,      // { dimensions, measures, rows } | null
  previewLoading,
  previewError,
  onRefreshPreview,
}) {
  const [summary, setSummary]             = useState('');
  const [editedCols, setEditedCols]       = useState({});    // { colName: newDesc }
  const [saving, setSaving]               = useState(false);
  const [savedAt, setSavedAt]             = useState(null);  // timestamp of last save
  const [colsExpanded, setColsExpanded]   = useState(true);

  // Reset when node changes
  useEffect(() => {
    setSummary(analysis?.dataset_summary || '');
    setEditedCols({});
    setSavedAt(null);
  }, [node?.id, analysis]);

  const handleColChange = useCallback((colName, value) => {
    setEditedCols(prev => ({ ...prev, [colName]: value }));
  }, []);

  const isDirty = summary !== (analysis?.dataset_summary || '') || Object.keys(editedCols).length > 0;

  const handleSave = useCallback(async () => {
    if (!node?.id) return;
    setSaving(true);
    try {
      const colDescs = {};
      (analysis?.columns || []).forEach(c => {
        colDescs[c.name] = editedCols[c.name] ?? c.description ?? '';
      });
      await fetch(`${API}/save-dataset-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: node.id,
          dataset_summary: summary,
          column_descriptions: colDescs,
        }),
      });
      setSavedAt(Date.now());
      setEditedCols({});
      setTimeout(() => setSavedAt(null), 3000);
    } catch (err) {
      console.error('Failed to save metadata:', err);
    } finally {
      setSaving(false);
    }
  }, [node, summary, analysis, editedCols]);

  if (!node) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#9CA3AF',
          fontSize: 13,
          gap: 8,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <p>Click a node to see details</p>
      </div>
    );
  }

  const isOutput = node.nodeType === 'output';
  const columns = analysis?.columns || [];

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #F3F4F6',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={node.label}
            >
              {node.label}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <StatChip
                label={isOutput ? 'Flat Table' : 'Source CSV'}
                color={isOutput ? 'purple' : 'blue'}
              />
              {node.rows != null && (
                <StatChip label={`${node.rows.toLocaleString()} rows`} color="gray" />
              )}
              {isOutput && node.dimensions != null && (
                <StatChip label={`${node.dimensions} dims`} color="blue" />
              )}
              {isOutput && node.measures != null && (
                <StatChip label={`${node.measures} msrs`} color="green" />
              )}
            </div>
          </div>

          {/* Save button */}
          {analysis && (
            <div style={{ flexShrink: 0 }}>
              {savedAt ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: '#059669',
                    fontWeight: 500,
                  }}
                >
                  <Check size={14} />
                  Saved
                </div>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDirty ? '#FFFFFF' : '#9CA3AF',
                    backgroundColor: isDirty ? '#2563EB' : '#F3F4F6',
                    border: 'none',
                    borderRadius: 7,
                    cursor: isDirty ? 'pointer' : 'default',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <Save size={12} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Table description */}
        <div style={{ marginBottom: 20 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Table Description
          </p>
          {analysis ? (
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Add a description of this table…"
              rows={3}
              style={{
                width: '100%',
                fontSize: 13,
                color: '#374151',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '8px 10px',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
                backgroundColor: '#FAFAFA',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.target.style.borderColor = '#2563EB';
                e.target.style.backgroundColor = '#fff';
              }}
              onBlur={e => {
                e.target.style.borderColor = '#E5E7EB';
                e.target.style.backgroundColor = '#FAFAFA';
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 12,
                color: '#9CA3AF',
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                border: '1px solid #F3F4F6',
                padding: '10px 12px',
              }}
            >
              Run AI Analysis in the workflow to generate a description.
            </div>
          )}
        </div>

        {/* Column descriptions */}
        {columns.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => setColsExpanded(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginBottom: 10,
                width: '100%',
                justifyContent: 'space-between',
              }}
            >
              <span>Column Descriptions ({columns.length})</span>
              {colsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {colsExpanded && (
              <div>
                {columns.map(col => (
                  <ColumnRow
                    key={col.name}
                    col={col}
                    editedDesc={editedCols[col.name]}
                    onChange={handleColChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Table preview */}
        <div
          style={{
            borderTop: columns.length > 0 ? '1px solid #F3F4F6' : 'none',
            paddingTop: columns.length > 0 ? 16 : 0,
          }}
        >
          <TablePreview
            tableData={tableData}
            meta={tableMeta}
            loading={previewLoading}
            error={previewError}
            onRefresh={onRefreshPreview}
          />
        </div>
      </div>
    </div>
  );
}
