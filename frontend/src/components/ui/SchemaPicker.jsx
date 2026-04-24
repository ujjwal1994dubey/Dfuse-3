import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Plug, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCount(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}

export default function SchemaPicker({ user, onConnected, showToast, onLoadDataset, onRelationshipsConnected }) {
  const navigate = useNavigate();
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [connecting, setConnecting] = useState(null); // schemaId being connected
  // Track which merged_dataset_ids are live in the backend this session
  const [liveDatasetIds, setLiveDatasetIds] = useState(new Set());

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    fetch(`${API}/schemas?user_id=${encodeURIComponent(user.id)}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(async data => {
        const list = data.data || [];
        setSchemas(list);
        // Probe which merged datasets are still alive in this session
        const live = new Set();
        await Promise.all(
          list
            .filter(s => s.merged_dataset_id)
            .map(s =>
              fetch(`${API}/datasets/${s.merged_dataset_id}/meta`)
                .then(r => { if (r.ok) live.add(s.merged_dataset_id); })
                .catch(() => {})
            )
        );
        setLiveDatasetIds(live);
      })
      .catch(() => setSchemas([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = schemas.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleConnect = async (schema) => {
    setConnecting(schema.id);
    try {
      // Lazy schema — resolve source files in session, inject relationships (no merge built)
      if (!schema.merged_dataset_id) {
        const res = await fetch(`${API}/schemas/${schema.id}/connect`, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        if (!data.success) {
          const files = (data.missing_files || []).join(', ');
          showToast?.(
            `Upload these CSV files first, then connect: ${files}`,
            'error'
          );
          return;
        }

        // Pass resolved relationships to App so cross-table queries work in Ask mode
        onRelationshipsConnected?.(data.resolved_relationships || [], data.source_datasets || []);
        onConnected?.(schema.name);
        return;
      }

      // Legacy schema with pre-built merged_dataset_id
      const res = await fetch(`${API}/datasets/${schema.merged_dataset_id}/meta`);
      if (!res.ok) {
        if (res.status === 404) {
          showToast?.("This schema's data is not in session. Upload the source CSVs and reconnect.", 'error');
        } else {
          throw new Error(`Failed to load dataset: ${res.statusText}`);
        }
        return;
      }
      const meta = await res.json();
      onLoadDataset?.(meta);
      onConnected?.(schema.name);
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border border-gray-200 animate-pulse" style={{ height: 80, backgroundColor: '#F3F4F6' }} />
        ))}
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
          <Plug size={20} style={{ color: '#9CA3AF' }} />
        </div>
        <p className="text-sm font-semibold text-gray-700">No schemas yet</p>
        <p className="text-xs text-gray-400 max-w-[200px]">
          Create a schema in Data Library to connect it here.
        </p>
        <button
          onClick={() => navigate('/library/schemas/new')}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Create your first schema →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search schemas…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Schema list */}
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-center text-gray-400 py-4">No schemas match "{search}"</p>
        ) : (
          filtered.map(schema => (
            <SchemaPickerTile
              key={schema.id}
              schema={schema}
              connecting={connecting === schema.id}
              isLive={liveDatasetIds.has(schema.merged_dataset_id)}
              onConnect={() => handleConnect(schema)}
            />
          ))
        )}
      </div>

      <button
        onClick={() => navigate('/library/schemas/new')}
        className="text-xs text-blue-600 hover:underline text-center mt-1"
      >
        + Create a new schema in Data Library
      </button>
    </div>
  );
}

function SchemaPickerTile({ schema, connecting, isLive, onConnect }) {
  const hasMergedDataset = !!schema.merged_dataset_id;
  // Lazy schemas are always connectable (backend will tell us if CSVs are missing)
  const isLazy = !hasMergedDataset;
  const canConnect = isLazy || isLive;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3 bg-white transition-shadow hover:shadow-sm"
      style={{ borderColor: '#E5E7EB' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
          <FileText size={14} style={{ color: '#2563EB' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{schema.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{formatDate(schema.created_at)}</span>
            {schema.file_count > 0 && (
              <span className="text-xs text-gray-400">· {schema.file_count} {schema.file_count === 1 ? 'file' : 'files'}</span>
            )}
            {schema.record_count > 0 && (
              <span className="text-xs text-gray-400">· {formatCount(schema.record_count)} rows</span>
            )}
          </div>
        </div>
        <button
          onClick={onConnect}
          disabled={connecting || !canConnect}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
          style={{
            backgroundColor: canConnect ? '#2563EB' : '#F3F4F6',
            color: canConnect ? '#fff' : '#9CA3AF',
          }}
        >
          {connecting ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
              …
            </span>
          ) : 'Connect'}
        </button>
      </div>

      {/* Lazy schema — tables stay separate; joins happen only when a query needs them */}
      {isLazy && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5">
          <AlertCircle size={11} />
          Upload source CSV files first. Tables stay separate — joined only when queried.
        </div>
      )}
      {/* Legacy schema — merged dataset exists but not in this session */}
      {hasMergedDataset && !isLive && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
          <AlertCircle size={11} />
          Data not in session — re-upload CSVs via <span className="font-medium ml-0.5">Upload CSV</span> to use this schema.
        </div>
      )}
    </div>
  );
}
