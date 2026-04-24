import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Edit2, Trash2, LayoutGrid } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export default function CanvasCard({ canvas, onClick, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(canvas.name);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const commitRename = () => {
    setRenaming(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== canvas.name) {
      onRename(trimmed);
    } else {
      setNameInput(canvas.name);
    }
  };

  return (
    <div
      className="group relative flex flex-col rounded-xl border cursor-pointer transition-all"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = '#93C5FD';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = '#E5E7EB';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
      }}
      onClick={(e) => {
        if (!menuOpen && !renaming) onClick();
      }}
    >
      {/* Thumbnail area */}
      <div
        className="rounded-t-xl flex items-center justify-center overflow-hidden"
        style={{ height: '140px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}
      >
        {canvas.thumbnail_svg ? (
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(canvas.thumbnail_svg)}`}
            alt={canvas.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }}
          />
        ) : (
          <LayoutGrid size={32} style={{ color: '#D1D5DB' }} />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3">
        {renaming ? (
          <input
            ref={inputRef}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenaming(false); setNameInput(canvas.name); }
            }}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm font-semibold text-gray-900 border-b border-blue-500 outline-none bg-transparent"
          />
        ) : (
          <p
            className="font-semibold text-sm text-gray-900 truncate"
            title={canvas.name}
          >
            {canvas.name}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1">
          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
            {canvas.node_count > 0 ? `${canvas.node_count} chart${canvas.node_count !== 1 ? 's' : ''}` : 'Empty'}
          </span>
          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
            {formatDate(canvas.updated_at)}
          </span>
        </div>
      </div>

      {/* Three-dot menu */}
      <div
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        ref={menuRef}
      >
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="w-7 h-7 rounded-md flex items-center justify-center bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
        >
          <MoreHorizontal size={14} style={{ color: '#6B7280' }} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); setRenaming(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Edit2 size={13} />
              Rename
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
