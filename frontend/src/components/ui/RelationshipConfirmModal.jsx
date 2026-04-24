import React, { useState, useCallback } from 'react';
import { X, Check, Edit2, XCircle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const CARDINALITY_STYLES = {
  '1:1': 'bg-blue-100 text-blue-700',
  '1:M': 'bg-purple-100 text-purple-700',
  'M:1': 'bg-purple-100 text-purple-700',
  'M:M': 'bg-orange-100 text-orange-700',
};

const MATCH_LABEL = {
  exact_name: 'Exact name match',
  fuzzy_name: 'Similar name',
  value_overlap: 'Value overlap',
};

function LinkRow({ link, decision, datasets, onDecide, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [editColA, setEditColA] = useState(link.col_a);
  const [editColB, setEditColB] = useState(link.col_b);
  const [expanded, setExpanded] = useState(false);

  const dsA = datasets.find(d => d.id === link.dataset_a_id);
  const dsB = datasets.find(d => d.id === link.dataset_b_id);
  const colsA = dsA ? [...(dsA.dimensions || []), ...(dsA.measures || [])] : [];
  const colsB = dsB ? [...(dsB.dimensions || []), ...(dsB.measures || [])] : [];

  const handleSaveEdit = () => {
    onEdit(link.link_id, editColA, editColB);
    setEditing(false);
    onDecide(link.link_id, 'accepted');
  };

  const cardBorder =
    decision === 'accepted'
      ? 'border-green-400 bg-green-50/40'
      : decision === 'rejected'
      ? 'border-red-300 bg-red-50/30 opacity-60'
      : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-lg border ${cardBorder} p-3 transition-all duration-150`}>
      {/* Top row: description + badges */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {link.ai_description ? (
            <p className="text-sm text-gray-800 leading-snug">{link.ai_description}</p>
          ) : (
            <p className="text-sm text-gray-500 italic">No description available</p>
          )}

          {/* Column join path */}
          {!editing ? (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap text-xs font-mono text-gray-600">
              <span className="bg-gray-100 px-1.5 py-0.5 rounded">{link.dataset_a_name}</span>
              <span className="text-gray-400 font-bold">.</span>
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{link.col_a}</span>
              <ArrowRight size={12} className="text-gray-400 shrink-0" />
              <span className="bg-gray-100 px-1.5 py-0.5 rounded">{link.dataset_b_name}</span>
              <span className="text-gray-400 font-bold">.</span>
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{link.col_b}</span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{link.dataset_a_name}.</span>
                <select
                  value={editColA}
                  onChange={e => setEditColA(e.target.value)}
                  className="border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {colsA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <ArrowRight size={12} className="text-gray-400 shrink-0" />
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{link.dataset_b_name}.</span>
                <select
                  value={editColB}
                  onChange={e => setEditColB(e.target.value)}
                  className="border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {colsB.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                onClick={handleSaveEdit}
                className="ml-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              title="Accept"
              onClick={() => onDecide(link.link_id, decision === 'accepted' ? null : 'accepted')}
              className={`p-1.5 rounded transition-colors ${
                decision === 'accepted'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
              }`}
            >
              <Check size={14} />
            </button>
            <button
              title="Edit join keys"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button
              title="Reject"
              onClick={() => onDecide(link.link_id, decision === 'rejected' ? null : 'rejected')}
              className={`p-1.5 rounded transition-colors ${
                decision === 'rejected'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
              }`}
            >
              <XCircle size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Badges row */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CONFIDENCE_STYLES[link.confidence] || CONFIDENCE_STYLES.low}`}>
          {link.confidence === 'high' ? 'High confidence' : link.confidence === 'medium' ? 'Medium' : 'Low'}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CARDINALITY_STYLES[link.cardinality] || 'bg-gray-100 text-gray-600'}`}>
          {link.cardinality}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
          {MATCH_LABEL[link.match_type] || link.match_type}
        </span>
        {link.overlap_pct > 0 && (
          <span className="text-xs text-gray-400">{Math.round(link.overlap_pct * 100)}% overlap</span>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 font-mono">
          <p>Join: <code className="bg-gray-100 px-1 rounded">
            pd.merge(df_{'{'}link.dataset_a_id.slice(0,8){'}'}, df_{'{'}link.dataset_b_id.slice(0,8){'}'}, left_on=&apos;{link.col_a}&apos;, right_on=&apos;{link.col_b}&apos;)
          </code></p>
        </div>
      )}
    </div>
  );
}

export default function RelationshipConfirmModal({ relationships, datasets, onConfirm, onClose }) {
  // decisions: { link_id: 'accepted' | 'rejected' | null }
  const [decisions, setDecisions] = useState(() => {
    const init = {};
    relationships.forEach(l => {
      if (l.status === 'accepted') init[l.link_id] = 'accepted';
      else if (l.status === 'rejected') init[l.link_id] = 'rejected';
    });
    return init;
  });

  // Track edited join keys
  const [editedLinks, setEditedLinks] = useState({});

  const handleDecide = useCallback((linkId, decision) => {
    setDecisions(prev => ({ ...prev, [linkId]: decision }));
  }, []);

  const handleEdit = useCallback((linkId, colA, colB) => {
    setEditedLinks(prev => ({ ...prev, [linkId]: { col_a: colA, col_b: colB } }));
  }, []);

  // Relaxed: allow confirming as long as at least one link has been reviewed.
  // Unreviewed links are treated as rejected when confirming.
  const allActedOn = relationships.length === 0 || Object.values(decisions).some(v => v === 'accepted' || v === 'rejected');
  const acceptedCount = Object.values(decisions).filter(v => v === 'accepted').length;

  const handleConfirm = () => {
    // Unreviewed links default to rejected
    const finalDecisions = {};
    relationships.forEach(l => {
      finalDecisions[l.link_id] = decisions[l.link_id] === 'accepted' ? 'accepted' : 'rejected';
    });
    onConfirm(finalDecisions, editedLinks);
  };

  const handleAcceptAll = () => {
    const next = {};
    relationships.forEach(l => { next[l.link_id] = 'accepted'; });
    setDecisions(next);
  };

  const handleRejectAll = () => {
    const next = {};
    relationships.forEach(l => { next[l.link_id] = 'rejected'; });
    setDecisions(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Review Dataset Relationships
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              We found {relationships.length} potential link{relationships.length !== 1 ? 's' : ''} between your datasets.
              Accept the ones that are correct before querying across tables.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 ml-4 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <span className="text-xs text-gray-500 mr-1">Quick select:</span>
          <button onClick={handleAcceptAll} className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">
            Accept all
          </button>
          <button onClick={handleRejectAll} className="text-xs px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium">
            Reject all
          </button>
          <span className="ml-auto text-xs text-gray-400">
            {Object.values(decisions).filter(v => v != null).length} / {relationships.length} reviewed
          </span>
        </div>

        {/* Link list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {relationships.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No relationship candidates detected between your datasets.
            </div>
          ) : (
            relationships.map(link => (
              <LinkRow
                key={link.link_id}
                link={link}
                decision={decisions[link.link_id] || null}
                datasets={datasets}
                onDecide={handleDecide}
                onEdit={handleEdit}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/60 shrink-0">
          <span className="text-sm text-gray-500">
            {acceptedCount > 0
              ? `${acceptedCount} relationship${acceptedCount !== 1 ? 's' : ''} will be used for cross-dataset queries`
              : 'No relationships accepted yet'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
            >
              Skip for now
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allActedOn}
              className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${
                allActedOn
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              title={allActedOn ? '' : 'Accept or reject at least one relationship before confirming'}
            >
              Confirm Schema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
