import React, { useState } from 'react';
import { GitBranch, Edit2, ChevronDown, ChevronUp, ArrowRight, Database } from 'lucide-react';

const CARDINALITY_STYLES = {
  '1:1': 'bg-blue-100 text-blue-700',
  '1:M': 'bg-purple-100 text-purple-700',
  'M:1': 'bg-purple-100 text-purple-700',
  'M:M': 'bg-orange-100 text-orange-700',
};

function DatasetCard({ dataset }) {
  const [expanded, setExpanded] = useState(false);
  const dims = dataset.dimensions || [];
  const measures = dataset.measures || [];
  const total = dims.length + measures.length;
  const preview = [...dims.slice(0, 3), ...measures.slice(0, 2)];
  const hidden = total - preview.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <Database size={13} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 truncate flex-1" title={dataset.filename}>
          {dataset.filename}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{dataset.rows?.toLocaleString()} rows</span>
      </div>

      {/* Column list */}
      <div className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {dims.slice(0, expanded ? dims.length : 3).map(col => (
            <span key={col} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono truncate max-w-[100px]" title={col}>
              {col}
            </span>
          ))}
          {measures.slice(0, expanded ? measures.length : 2).map(col => (
            <span key={col} className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono truncate max-w-[100px]" title={col}>
              {col}
            </span>
          ))}
        </div>

        {hidden > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
          >
            <ChevronDown size={11} />+{hidden} more
          </button>
        )}
        {expanded && total > 5 && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
          >
            <ChevronUp size={11} />Show less
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-3 pb-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 rounded-sm bg-indigo-200 inline-block" /> dim
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 rounded-sm bg-emerald-200 inline-block" /> measure
        </span>
      </div>
    </div>
  );
}

function RelationshipRow({ link }) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors">
      <span className="text-xs font-mono text-gray-500 truncate max-w-[70px]" title={`${link.dataset_a_name}.${link.col_a}`}>
        {link.col_a}
      </span>
      <ArrowRight size={11} className="text-gray-400 shrink-0" />
      <span className="text-xs font-mono text-gray-500 truncate max-w-[70px]" title={`${link.dataset_b_name}.${link.col_b}`}>
        {link.col_b}
      </span>
      <span className={`ml-auto text-[10px] px-1 py-0.5 rounded font-medium shrink-0 ${CARDINALITY_STYLES[link.cardinality] || 'bg-gray-100 text-gray-500'}`}>
        {link.cardinality}
      </span>
    </div>
  );
}

export default function SchemaPanel({ datasets, confirmedRelationships, onEditSchema }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!confirmedRelationships || confirmedRelationships.length === 0) {
    // Show a subtle prompt when no links are confirmed yet
    return (
      <div className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50/50">
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <GitBranch size={13} />
          <span>No cross-dataset relationships confirmed yet.</span>
          <button
            onClick={onEditSchema}
            className="ml-auto text-blue-500 hover:text-blue-700 underline underline-offset-2 shrink-0"
          >
            Detect
          </button>
        </div>
      </div>
    );
  }

  // Group links by dataset pair
  const pairMap = {};
  confirmedRelationships.forEach(lnk => {
    const key = [lnk.dataset_a_id, lnk.dataset_b_id].sort().join('::');
    if (!pairMap[key]) pairMap[key] = { nameA: lnk.dataset_a_name, nameB: lnk.dataset_b_name, links: [] };
    pairMap[key].links.push(lnk);
  });

  // Datasets involved in at least one confirmed link
  const linkedDatasetIds = new Set(confirmedRelationships.flatMap(l => [l.dataset_a_id, l.dataset_b_id]));
  const linkedDatasets = datasets.filter(d => linkedDatasetIds.has(d.id));

  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
        <GitBranch size={13} className="text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-blue-700 flex-1">
          Schema — {confirmedRelationships.length} link{confirmedRelationships.length !== 1 ? 's' : ''}
        </span>
        <button
          title="Edit schema"
          onClick={onEditSchema}
          className="p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors"
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Dataset cards */}
          <div className="grid grid-cols-1 gap-2">
            {linkedDatasets.map(ds => (
              <DatasetCard key={ds.id} dataset={ds} />
            ))}
          </div>

          {/* Relationship lines */}
          <div className="border-t border-gray-100 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1 px-2">Confirmed joins</p>
            {Object.entries(pairMap).map(([key, pair]) => (
              <div key={key} className="mb-1">
                <div className="px-2 py-0.5 text-[10px] text-gray-400 font-medium">
                  {pair.nameA} ↔ {pair.nameB}
                </div>
                {pair.links.map(lnk => (
                  <RelationshipRow key={lnk.link_id} link={lnk} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
