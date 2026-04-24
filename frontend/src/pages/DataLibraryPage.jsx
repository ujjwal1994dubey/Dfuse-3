import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Database, FileText, Table, Plug, Search, GitBranch, Rows3,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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

export default function DataLibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schemas, setSchemas] = useState([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date');

  const fetchSchemas = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSchemas(true);
    try {
      const res = await fetch(`${API}/schemas?user_id=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load schemas:', err);
    } finally {
      setLoadingSchemas(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchSchemas(); }, [fetchSchemas]);

  const handleDeleteSchema = async (schemaId) => {
    if (!window.confirm('Delete this schema? This cannot be undone.')) return;
    try {
      await fetch(`${API}/schemas/${schemaId}`, { method: 'DELETE' });
      setSchemas(prev => prev.filter(s => s.id !== schemaId));
    } catch (err) {
      console.error('Failed to delete schema:', err);
    }
  };

  const handleRenameSchema = async (schemaId, newName) => {
    try {
      const res = await fetch(`${API}/schemas/${schemaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.data?.name ?? newName;
        setSchemas(prev => prev.map(s => s.id === schemaId ? { ...s, name: updated } : s));
      }
    } catch (err) {
      console.error('Failed to rename schema:', err);
    }
  };

  const filtered = schemas
    .filter(s => s.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'records') return (b.record_count || 0) - (a.record_count || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 flex-shrink-0">
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>Data Library</h1>
        <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '3px' }}>
          Manage your datasets, schemas, and database connections
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Full-width grid (side panel removed — click card to navigate to detail page) */}
        <div className="flex-1 px-8 py-8 overflow-y-auto">
          {/* Schemas Section */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Schemas</h2>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  Multi-CSV uploads with AI-assisted joins
                </p>
              </div>
              <button
                onClick={() => navigate('/library/schemas/new')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#2563EB' }}
              >
                <Plus size={14} />
                New Schema
              </button>
            </div>

            {/* Search + Sort bar */}
            {!loadingSchemas && schemas.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search schemas…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="date">Newest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="records">Most records</option>
                </select>
              </div>
            )}

            {loadingSchemas ? (
              <SchemasGridSkeleton />
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {/* Create new schema card */}
                <button
                  onClick={() => navigate('/library/schemas/new')}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors bg-white"
                  style={{ minHeight: '160px', borderColor: '#D1D5DB' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#2563EB'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#D1D5DB'}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: '#EFF6FF' }}>
                    <Plus size={20} style={{ color: '#2563EB' }} />
                  </div>
                  <span style={{ fontSize: '13px', color: '#6B7280' }}>Create new schema</span>
                </button>

                {filtered.map(schema => (
                  <SchemaCard
                    key={schema.id}
                    schema={schema}
                    isSelected={false}
                    onSelect={() => navigate(`/library/schemas/${schema.id}`)}
                    onDelete={() => handleDeleteSchema(schema.id)}
                    onRename={(newName) => handleRenameSchema(schema.id, newName)}
                  />
                ))}

                {filtered.length === 0 && search && (
                  <div className="col-span-full text-center py-8 text-gray-400 text-sm">
                    No schemas match "{search}"
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Connections Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Connections</h2>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  Database connections (PostgreSQL, MySQL, etc.)
                </p>
              </div>
              <button
                onClick={() => alert('Database connections coming soon!')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }}
              >
                <Plug size={14} />
                Connect Database
              </button>
            </div>
            <div className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-14 bg-white" style={{ borderColor: '#E5E7EB' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#F3F4F6' }}>
                <Database size={22} style={{ color: '#9CA3AF' }} />
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>Database connections coming soon</h3>
              <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '6px' }}>
                Connect PostgreSQL, MySQL, and more to query data directly.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Schema card tile ──────────────────────────────────────────────────────────

function SchemaCard({ schema, isSelected, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(schema.name || 'Untitled Schema');
  const inputRef = useRef(null);

  useEffect(() => { setName(schema.name || 'Untitled Schema'); }, [schema.name]);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const trimmed = name.trim() || 'Untitled Schema';
    setName(trimmed);
    setEditing(false);
    if (trimmed !== schema.name) onRename(trimmed);
  };

  const cancelEdit = () => {
    setName(schema.name || 'Untitled Schema');
    setEditing(false);
  };

  const relationshipCount = Array.isArray(schema.relationships) ? schema.relationships.length : 0;

  return (
    <div
      onClick={() => !editing && onSelect()}
      className="rounded-xl border flex flex-col gap-0 transition-all overflow-hidden cursor-pointer"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: isSelected ? '#2563EB' : '#E5E7EB',
        boxShadow: isSelected ? '0 0 0 2px #BFDBFE' : '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
          <FileText size={16} style={{ color: '#2563EB' }} />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitEdit}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              className="text-sm font-semibold text-gray-900 border-b border-blue-500 outline-none bg-transparent w-full"
            />
          ) : (
            <button
              onClick={startEdit}
              className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left truncate w-full"
              title="Click to rename"
            >
              {name}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(schema.created_at)}</p>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded px-2 py-0.5 border border-gray-100">
          <Table size={10} />
          {schema.file_count || 0} {schema.file_count === 1 ? 'file' : 'files'}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded px-2 py-0.5 border border-gray-100">
          <Rows3 size={10} />
          {formatCount(schema.record_count)} rows
        </span>
        {relationshipCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded px-2 py-0.5 border border-gray-100">
            <GitBranch size={10} />
            {relationshipCount} join{relationshipCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
        <span className="text-xs text-gray-300">#{schema.id?.slice(0, 6)}</span>
      </div>
    </div>
  );
}


// ─── Join row ──────────────────────────────────────────────────────────────────

function JoinRow({ rel }) {
  const nameA = rel.dataset_a_name || `Dataset A`;
  const nameB = rel.dataset_b_name || `Dataset B`;
  const colA  = rel.col_a || '?';
  const colB  = rel.col_b || '?';

  const confidence = rel.confidence || 'medium';
  const confidenceColor = confidence === 'high' ? '#059669' : confidence === 'low' ? '#9CA3AF' : '#D97706';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5">
      {rel.ai_description && (
        <p className="text-xs text-gray-600 mb-2 leading-relaxed">{rel.ai_description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs text-gray-700">
        <span className="bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">{nameA}</span>
        <span className="text-gray-400">.</span>
        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">{colA}</span>
        <ArrowRight size={12} className="text-gray-400 flex-shrink-0" />
        <span className="bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">{nameB}</span>
        <span className="text-gray-400">.</span>
        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">{colB}</span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium" style={{ color: confidenceColor, borderColor: confidenceColor, backgroundColor: confidenceColor + '15' }}>
          {confidence} confidence
        </span>
        {rel.cardinality && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 font-medium">
            {rel.cardinality}
          </span>
        )}
        {rel.overlap_pct > 0 && (
          <span className="text-[10px] text-gray-400">{Math.round(rel.overlap_pct * 100)}% value overlap</span>
        )}
      </div>
    </div>
  );
}

function StatChip({ icon, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
      {icon}
      {label}
    </span>
  );
}

function SchemasGridSkeleton() {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border animate-pulse" style={{ minHeight: '160px', backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }} />
      ))}
    </div>
  );
}
