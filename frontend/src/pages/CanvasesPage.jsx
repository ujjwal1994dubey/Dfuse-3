import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, Users, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import CanvasCard from '../components/canvases/CanvasCard';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const LOCAL_KEY = 'dfuse_canvases';

// ── localStorage helpers ────────────────────────────────────────────────────
function loadLocalCanvases(userId) {
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalCanvases(userId, canvases) {
  localStorage.setItem(`${LOCAL_KEY}_${userId}`, JSON.stringify(canvases));
}

function localCreate(userId, name) {
  const canvas = {
    id: crypto.randomUUID(),
    user_id: userId,
    name,
    node_count: 0,
    thumbnail_svg: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _local: true,
  };
  const existing = loadLocalCanvases(userId);
  saveLocalCanvases(userId, [canvas, ...existing]);
  return canvas;
}

const TABS = [
  { id: 'my', label: 'My Canvases', icon: LayoutGrid },
  { id: 'shared', label: 'Shared with Me', icon: Users },
];

export default function CanvasesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('my');
  const [canvases, setCanvases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dbError, setDbError] = useState(false); // true when Supabase tables missing

  const fetchCanvases = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/canvases?user_id=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const data = await res.json();
        // Merge remote canvases with any local-only ones
        const remote = data.data || [];
        const local = loadLocalCanvases(user.id).filter(c => c._local);
        setCanvases([...remote, ...local]);
        setDbError(false);
      } else {
        // Supabase tables not set up yet — fall back to localStorage
        setDbError(true);
        setCanvases(loadLocalCanvases(user.id));
      }
    } catch (err) {
      console.error('Failed to load canvases:', err);
      setDbError(true);
      setCanvases(loadLocalCanvases(user.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const handleCreate = async () => {
    if (!user?.id || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/canvases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, name: 'Untitled Canvas' }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/canvas/${data.data.id}`);
      } else {
        // Fallback: create locally
        const canvas = localCreate(user.id, 'Untitled Canvas');
        navigate(`/canvas/${canvas.id}`);
      }
    } catch (err) {
      console.error('Failed to create canvas:', err);
      const canvas = localCreate(user.id, 'Untitled Canvas');
      navigate(`/canvas/${canvas.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (canvasId) => {
    if (!window.confirm('Delete this canvas? This cannot be undone.')) return;
    // Optimistic UI
    setCanvases(prev => prev.filter(c => c.id !== canvasId));
    // Remove from localStorage
    const updated = loadLocalCanvases(user.id).filter(c => c.id !== canvasId);
    saveLocalCanvases(user.id, updated);
    // Try remote delete too
    try {
      await fetch(`${API}/canvases/${canvasId}`, { method: 'DELETE' });
    } catch (_) {}
  };

  const handleRename = async (canvasId, newName) => {
    // Optimistic UI
    setCanvases(prev => prev.map(c => c.id === canvasId ? { ...c, name: newName } : c));
    // Update localStorage copy
    const all = loadLocalCanvases(user.id).map(c => c.id === canvasId ? { ...c, name: newName } : c);
    saveLocalCanvases(user.id, all);
    // Try remote
    try {
      await fetch(`${API}/canvases/${canvasId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
    } catch (_) {}
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Canvases</h1>
          <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>
            Create and manage your data analytics workspaces
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: creating ? '#93C5FD' : '#2563EB' }}
        >
          <Plus size={16} />
          {creating ? 'Creating...' : 'Create Canvas'}
        </button>
      </div>

      {/* DB setup banner */}
      {dbError && (
        <div
          className="mb-6 rounded-xl p-4 flex gap-3"
          style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D' }}
        >
          <AlertTriangle size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#92400E' }}>
              Supabase tables not set up yet — running in local mode
            </p>
            <p style={{ fontSize: '13px', color: '#B45309', marginTop: '4px' }}>
              Canvases are being saved to your browser. To enable cloud persistence,
              run <code style={{ fontFamily: 'monospace', backgroundColor: '#FEF3C7', padding: '1px 4px', borderRadius: '3px' }}>backend/supabase_migrations.sql</code> in your Supabase project's SQL Editor.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === id ? '#2563EB' : '#6B7280',
              borderBottom: activeTab === id ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'my' ? (
        loading ? (
          <CanvasesGridSkeleton />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {/* Create new tile */}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all"
              style={{ minHeight: '180px', borderColor: '#D1D5DB' }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#2563EB'}
              onMouseOut={e => e.currentTarget.style.borderColor = '#D1D5DB'}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: '#EFF6FF' }}
              >
                <Plus size={20} style={{ color: '#2563EB' }} />
              </div>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Create new canvas</span>
            </button>

            {canvases.map(canvas => (
              <CanvasCard
                key={canvas.id}
                canvas={canvas}
                onClick={() => navigate(`/canvas/${canvas.id}`)}
                onDelete={() => handleDelete(canvas.id)}
                onRename={(name) => handleRename(canvas.id, name)}
              />
            ))}
          </div>
        )
      ) : (
        <SharedWithMeEmpty />
      )}
    </div>
  );
}

function CanvasesGridSkeleton() {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="rounded-xl border animate-pulse"
          style={{ minHeight: '180px', backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }}
        />
      ))}
    </div>
  );
}

function SharedWithMeEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: '#F3F4F6' }}
      >
        <Users size={24} style={{ color: '#9CA3AF' }} />
      </div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>No shared canvases yet</h3>
      <p style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '6px' }}>
        Canvases shared with you will appear here.
      </p>
    </div>
  );
}
