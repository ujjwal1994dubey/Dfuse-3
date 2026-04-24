import React, { useState, useCallback } from 'react';
import {
  Check, AlertTriangle, Info, Sparkles, ArrowRight, XCircle,
  Edit2, RefreshCw, Table2, PlayCircle, CheckCircle2, Loader2, X,
  ChevronDown, ChevronUp,
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ─── Step definitions (5 steps) ──────────────────────────────────────────────
// Steps 4 & 5 (old Detect + Confirm Schema) are merged into one.
// Step 7 (old Ready placeholder) is removed — modal closes on flat table creation.

const STEPS = [
  { id: 1, label: 'Upload Files',        subtitle: 'Review uploaded files' },
  { id: 2, label: 'Data Quality',        subtitle: 'Fast scan, no AI needed' },
  { id: 3, label: 'AI Analysis & Detect', subtitle: '1 Gemini call for all files' },
  { id: 4, label: 'Confirm Schema',       subtitle: 'Review joins and save' },
];

// ─── Vertical step navigation ─────────────────────────────────────────────────

function VerticalStepNav({ currentStep, onStepClick }) {
  return (
    <nav className="w-52 shrink-0 border-r border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-1">
      {STEPS.map(step => {
        const done   = step.id < currentStep;
        const active = step.id === currentStep;
        const locked = step.id > currentStep;
        return (
          <button
            key={step.id}
            onClick={() => !locked && onStepClick(step.id)}
            disabled={locked}
            className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors flex items-start gap-3 ${
              active  ? 'bg-blue-600 text-white shadow-sm' :
              done    ? 'hover:bg-gray-100 text-gray-700' :
                        'opacity-40 cursor-not-allowed text-gray-500'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
              active ? 'bg-white text-blue-600' :
              done   ? 'bg-green-500 text-white' :
                       'bg-gray-200 text-gray-400'
            }`}>
              {done ? <Check size={11} /> : step.id}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-medium leading-tight ${active ? 'text-white' : ''}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-0.5 leading-tight ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                {step.subtitle}
              </p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

// ─── File quality card ────────────────────────────────────────────────────────

function IssueChip({ issue }) {
  const style = issue.type === 'missing'
    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
    : 'bg-orange-50 text-orange-700 border-orange-200';
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${style}`}>
      <AlertTriangle size={10} />
      {issue.message}
    </span>
  );
}

function FileQualityCard({ dataset, quality, scanning, onScan }) {
  const [expanded, setExpanded] = useState(false);
  const hasIssues = quality?.issues?.length > 0;
  const hasDups   = quality && quality.duplicate_rows > 0;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{dataset.filename}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {dataset.rows?.toLocaleString()} rows · {(dataset.dimensions?.length || 0) + (dataset.measures?.length || 0)} columns
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {quality && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 px-2 py-1 rounded hover:bg-gray-100"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Hide' : 'Details'}
            </button>
          )}
          <button
            onClick={() => onScan(dataset.id)}
            disabled={scanning}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 font-medium flex items-center gap-1.5 transition-colors"
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {quality ? 'Re-scan' : 'Scan'}
          </button>
        </div>
      </div>

      {quality && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {hasIssues || hasDups ? (
              <>
                {quality.issues.map((issue, i) => <IssueChip key={i} issue={issue} />)}
                {hasDups && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                    <AlertTriangle size={10} />
                    {quality.duplicate_rows} duplicate rows
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle2 size={13} /> No issues found
              </span>
            )}
          </div>

          {expanded && quality.column_stats && (
            <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Column', 'Type', 'Missing', 'Unique'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quality.column_stats.map(col => (
                    <tr key={col.name} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-700 max-w-[120px] truncate">{col.name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{col.dtype}</td>
                      <td className={`px-3 py-1.5 ${col.missing_pct > 5 ? 'text-yellow-600 font-medium' : 'text-gray-400'}`}>
                        {col.missing_pct > 0 ? `${col.missing_pct}%` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400">{col.unique_count?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI analysis card ─────────────────────────────────────────────────────────

function FileAnalysisCard({ dataset, analyzing, analysisResult, onAnalyze, apiKey }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = analysisResult || dataset.analysis;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 truncate">{dataset.filename}</p>
          {analysis?.dataset_summary ? (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{analysis.dataset_summary.slice(0, 80)}…</p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">Not yet analyzed</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {analysis && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 px-2 py-1 rounded hover:bg-gray-100"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Hide' : 'Details'}
            </button>
          )}
          {analyzing ? (
            <span className="text-xs flex items-center gap-1 text-blue-600 font-medium">
              <Loader2 size={12} className="animate-spin" /> Analyzing…
            </span>
          ) : (
            <button
              onClick={() => onAnalyze(dataset.id)}
              disabled={!apiKey}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                analysis ? 'bg-gray-50 text-gray-600 hover:bg-gray-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              } disabled:opacity-50`}
            >
              <Sparkles size={12} />
              {analysis ? 'Re-analyze' : 'Analyze'}
            </button>
          )}
          {analysis && !analyzing && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
        </div>
      </div>

      {analysis && expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3">
          {analysis.dataset_summary && (
            <p className="text-xs text-gray-600 leading-relaxed">{analysis.dataset_summary}</p>
          )}
          {analysis.columns && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              {analysis.columns.slice(0, 10).map(col => (
                <div key={col.name} className="flex gap-2 text-xs">
                  <span className="font-mono text-gray-700 shrink-0">{col.name}</span>
                  <span className="text-gray-400 truncate">{col.description || '—'}</span>
                </div>
              ))}
              {analysis.columns.length > 10 && (
                <p className="text-xs text-gray-400 col-span-2">+{analysis.columns.length - 10} more columns</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Relationship link row ────────────────────────────────────────────────────

const CONFIDENCE_STYLES = {
  high:   'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:    'bg-gray-100 text-gray-600 border-gray-200',
};
const CARDINALITY_STYLES = {
  '1:1': 'bg-blue-100 text-blue-700',
  '1:M': 'bg-purple-100 text-purple-700',
  'M:1': 'bg-purple-100 text-purple-700',
  'M:M': 'bg-orange-100 text-orange-700',
};

function InlineLinkRow({ link, decision, datasets, onDecide, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [editColA, setEditColA] = useState(link.col_a);
  const [editColB, setEditColB] = useState(link.col_b);

  const dsA   = datasets.find(d => d.id === link.dataset_a_id);
  const dsB   = datasets.find(d => d.id === link.dataset_b_id);
  const colsA = dsA ? [...(dsA.dimensions || []), ...(dsA.measures || [])] : [];
  const colsB = dsB ? [...(dsB.dimensions || []), ...(dsB.measures || [])] : [];

  const cardBg =
    decision === 'accepted' ? 'border-green-400 bg-green-50/40' :
    decision === 'rejected' ? 'border-red-300 bg-red-50/20 opacity-60' :
                              'border-gray-200 bg-white';

  return (
    <div className={`rounded-xl border ${cardBg} p-4 transition-all`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {link.ai_description && (
            <p className="text-sm text-gray-700 leading-snug mb-2">{link.ai_description}</p>
          )}
          {!editing ? (
            <div className="flex items-center gap-1.5 flex-wrap text-sm font-mono text-gray-600">
              <span className="bg-gray-100 px-2 py-0.5 rounded-md">{link.dataset_a_name}</span>
              <span className="text-gray-400 font-bold">.</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-semibold">{link.col_a}</span>
              <ArrowRight size={14} className="text-gray-400 shrink-0" />
              <span className="bg-gray-100 px-2 py-0.5 rounded-md">{link.dataset_b_name}</span>
              <span className="text-gray-400 font-bold">.</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-semibold">{link.col_b}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{link.dataset_a_name}.</span>
                <select
                  value={editColA}
                  onChange={e => setEditColA(e.target.value)}
                  className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                  className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {colsB.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                onClick={() => { onEdit(link.link_id, editColA, editColB); setEditing(false); onDecide(link.link_id, 'accepted'); }}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >Save</button>
              <button
                onClick={() => setEditing(false)}
                className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >Cancel</button>
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONFIDENCE_STYLES[link.confidence] || CONFIDENCE_STYLES.low}`}>
              {link.confidence} confidence
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CARDINALITY_STYLES[link.cardinality] || 'bg-gray-100 text-gray-600'}`}>
              {link.cardinality}
            </span>
            {link.overlap_pct > 0 && (
              <span className="text-xs text-gray-400">{Math.round(link.overlap_pct * 100)}% value overlap</span>
            )}
          </div>
        </div>

        {!editing && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              title="Accept"
              onClick={() => onDecide(link.link_id, decision === 'accepted' ? null : 'accepted')}
              className={`p-2 rounded-lg transition-colors ${
                decision === 'accepted' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
              }`}
            ><Check size={14} /></button>
            <button
              title="Edit join keys"
              onClick={() => setEditing(true)}
              className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
            ><Edit2 size={14} /></button>
            <button
              title="Reject"
              onClick={() => onDecide(link.link_id, decision === 'rejected' ? null : 'rejected')}
              className={`p-2 rounded-lg transition-colors ${
                decision === 'rejected' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
              }`}
            ><XCircle size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Join preview table ───────────────────────────────────────────────────────

function JoinPreviewTable({ preview }) {
  if (!preview?.success) return null;
  const cols        = preview.columns || [];
  const rows        = preview.rows    || [];
  const displayCols = cols.slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
        <Table2 size={15} />
        <span>{preview.total_rows?.toLocaleString()} rows · {preview.total_columns} columns after join</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {displayCols.map(c => (
                <th key={c} className="text-left px-3 py-2 text-gray-600 font-semibold whitespace-nowrap border-r border-gray-100 last:border-r-0">
                  {c}
                </th>
              ))}
              {cols.length > 10 && (
                <th className="px-3 py-2 text-gray-400 font-medium">+{cols.length - 10} more</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, 12).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                {displayCols.map(c => (
                  <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap border-r border-gray-100 last:border-r-0 max-w-[140px] truncate">
                    {row[c] == null ? <span className="text-gray-300 italic">null</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <p className="text-xs text-gray-400 text-center">Showing 12 of {rows.length} preview rows</p>
      )}
      {preview.description && (
        <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">{preview.description}</p>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function DataWorkflowPanel({
  datasets,
  workflowStep,
  setWorkflowStep,
  fileQuality,
  setFileQuality,
  analysisResults,       // lifted to App.jsx — survives modal close/reopen
  setAnalysisResults,
  joinPreview,
  setJoinPreview,
  pendingRelationships,
  setPendingRelationships,
  confirmedRelationships,
  setConfirmedRelationships,
  apiKey,
  selectedModel,
  updateTokenUsage,
  onMergedDatasetCreated,
  onClose,
  setActiveDatasetId,
  showToast,
  variant = 'modal',   // 'modal' | 'page'
}) {
  const [analyzingIds,           setAnalyzingIds]           = useState(new Set());
  const [scanningIds,            setScanningIds]             = useState(new Set());
  const [detectingRelationships, setDetectingRelationships] = useState(false);
  const [batchAnalyzing,         setBatchAnalyzing]         = useState(false);
  const [previewLoading,         setPreviewLoading]          = useState(false);
  const [creatingTable,          setCreatingTable]            = useState(false);
  // decisions and editedLinks are local — they reset on modal reopen which is correct
  // (user should re-review if they reopen the modal after closing mid-flow)
  const [decisions,   setDecisions]   = useState({});
  const [editedLinks, setEditedLinks] = useState({});

  const nonMergedDatasets = datasets.filter(d => !d.isMerged);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const scanFile = useCallback(async (datasetId) => {
    setScanningIds(prev => new Set([...prev, datasetId]));
    try {
      const res = await fetch(`${API}/dataset-quality/${datasetId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFileQuality(prev => ({ ...prev, [datasetId]: data }));
    } catch (err) {
      showToast?.(`Scan failed: ${err.message}`, 'error');
    } finally {
      setScanningIds(prev => { const s = new Set(prev); s.delete(datasetId); return s; });
    }
  }, [setFileQuality, showToast]);

  const scanAllFiles = useCallback(async () => {
    for (const ds of nonMergedDatasets) await scanFile(ds.id);
  }, [nonMergedDatasets, scanFile]);

  const analyzeFile = useCallback(async (datasetId) => {
    if (!apiKey) { showToast?.('Configure your Gemini API key in Settings first.', 'error'); return; }
    setAnalyzingIds(prev => new Set([...prev, datasetId]));
    try {
      const res = await fetch(`${API}/analyze-dataset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, api_key: apiKey, model: selectedModel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalysisResults(prev => ({ ...prev, [datasetId]: data.analysis }));
      if (data.analysis?.token_usage) updateTokenUsage?.(data.analysis.token_usage);
    } catch (err) {
      showToast?.(`Analysis failed: ${err.message}`, 'error');
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(datasetId); return s; });
    }
  }, [apiKey, selectedModel, setAnalysisResults, updateTokenUsage, showToast]);

  const analyzeAllFiles = useCallback(async () => {
    for (const ds of nonMergedDatasets) await analyzeFile(ds.id);
  }, [nonMergedDatasets, analyzeFile]);

  // Single-call batch: profile all datasets + detect relationships in one Gemini call.
  const batchAnalyze = useCallback(async () => {
    if (!apiKey) { showToast?.('Configure your Gemini API key in Settings first.', 'error'); return; }
    setBatchAnalyzing(true);
    try {
      const ids = nonMergedDatasets.map(d => d.id);
      const res = await fetch(`${API}/batch-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_ids: ids, api_key: apiKey, model: selectedModel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Populate analysis results for all datasets at once
      const newAnalyses = {};
      for (const [did, analysis] of Object.entries(data.analyses || {})) {
        newAnalyses[did] = analysis;
      }
      setAnalysisResults(prev => ({ ...prev, ...newAnalyses }));

      // Pre-populate relationships (AI descriptions already filled in)
      const allLinks = data.relationships || [];
      setPendingRelationships(allLinks);
      setDecisions(prev => {
        const next = {};
        allLinks.forEach(l => {
          if (l.status === 'accepted')      next[l.link_id] = 'accepted';
          else if (l.status === 'rejected') next[l.link_id] = 'rejected';
          else                              next[l.link_id] = prev[l.link_id] ?? null;
        });
        return next;
      });
      setEditedLinks({});

      if (data.token_usage) updateTokenUsage?.(data.token_usage);

      // Auto-advance to schema confirmation step
      setWorkflowStep(4);
    } catch (err) {
      showToast?.(`Batch analysis failed: ${err.message}`, 'error');
    } finally {
      setBatchAnalyzing(false);
    }
  }, [apiKey, selectedModel, nonMergedDatasets, setAnalysisResults, setPendingRelationships,
      updateTokenUsage, setWorkflowStep, showToast]);

  const detectRelationships = useCallback(async () => {
    setDetectingRelationships(true);
    try {
      await fetch(`${API}/detect-relationships`, { method: 'POST' });
      const enrichRes = await fetch(`${API}/enrich-relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey || undefined, model: selectedModel }),
      });
      const enriched = enrichRes.ok ? await enrichRes.json() : null;
      if (enriched?.token_usage) updateTokenUsage?.(enriched.token_usage);
      const relRes   = await fetch(`${API}/relationships`);
      const relData  = relRes.ok ? await relRes.json() : { relationships: [] };
      // Include all links (pending_confirmation AND previously accepted/rejected ones from
      // a prior workflow run that the backend re-surfaces with their saved status).
      const allLinks = enriched?.relationships || relData.relationships || [];
      setPendingRelationships(allLinks);
      // Pre-populate decisions from the link's backend status so re-opened workflows
      // show the same accept/reject state the user left them in.
      setDecisions(prev => {
        const next = {};
        allLinks.forEach(l => {
          if (l.status === 'accepted') next[l.link_id] = 'accepted';
          else if (l.status === 'rejected') next[l.link_id] = 'rejected';
          else next[l.link_id] = prev[l.link_id] ?? null;
        });
        return next;
      });
      setEditedLinks({});
      // Stay on step 4 — results render inline below the detect button
    } catch (err) {
      showToast?.(`Detection failed: ${err.message}`, 'error');
    } finally {
      setDetectingRelationships(false);
    }
  }, [apiKey, selectedModel, setPendingRelationships, updateTokenUsage, showToast]);


  const confirmSchema = useCallback(async () => {
    setCreatingTable(true);
    try {
      const finalDecisions = {};
      pendingRelationships.forEach(l => {
        finalDecisions[l.link_id] = decisions[l.link_id] === 'accepted' ? 'accepted' : 'rejected';
      });
      const res = await fetch(`${API}/relationships/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: finalDecisions, edited_links: editedLinks, build_merge: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data    = await res.json();
      const accepted = (data.relationships || []).filter(l => l.status === 'accepted');
      setConfirmedRelationships(accepted);
      setPendingRelationships([]);
      // Pass accepted relationships so SchemaPage can save the schema — no merged datasets
      onMergedDatasetCreated?.([], accepted);
      onClose();
    } catch (err) {
      showToast?.(`Failed to save schema: ${err.message}`, 'error');
    } finally {
      setCreatingTable(false);
    }
  }, [
    pendingRelationships, decisions, editedLinks,
    setConfirmedRelationships, setPendingRelationships,
    onMergedDatasetCreated, onClose, showToast,
  ]);

  const handleDecide = useCallback((linkId, decision) => {
    setDecisions(prev => ({ ...prev, [linkId]: decision }));
  }, []);

  const handleEdit = useCallback((linkId, colA, colB) => {
    setEditedLinks(prev => ({ ...prev, [linkId]: { col_a: colA, col_b: colB } }));
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const allScanned     = nonMergedDatasets.length > 0 && nonMergedDatasets.every(d => fileQuality[d.id]);
  const allAnalyzed    = nonMergedDatasets.length > 0 && nonMergedDatasets.every(d => (analysisResults || {})[d.id] || d.analysis);
  const acceptedCount  = Object.values(decisions).filter(v => v === 'accepted').length;
  const isAnyScanning  = scanningIds.size > 0;
  const isAnyAnalyzing = analyzingIds.size > 0;
  const hasDetected    = pendingRelationships.length > 0;

  // ── Step renderers ────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3">
          {nonMergedDatasets.map(ds => (
            <div key={ds.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 bg-white">
              <div>
                <p className="text-sm font-semibold text-gray-800">{ds.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ds.rows?.toLocaleString()} rows · {(ds.dimensions?.length || 0) + (ds.measures?.length || 0)} columns
                </p>
              </div>
              <CheckCircle2 size={18} className="text-green-500 shrink-0" />
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 rounded-xl p-3 border border-blue-200">
          <Info size={15} className="shrink-0 mt-0.5" />
          <span>
            {nonMergedDatasets.length} file{nonMergedDatasets.length !== 1 ? 's' : ''} uploaded.
            The workflow will detect relationships and create a flat joined table ready for AI analysis.
          </span>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Instant quality check — no AI required. Detects missing values, type mismatches, and duplicate rows.
        </p>
        <div className="grid gap-3">
          {nonMergedDatasets.map(ds => (
            <FileQualityCard
              key={ds.id}
              dataset={ds}
              quality={fileQuality[ds.id]}
              scanning={scanningIds.has(ds.id)}
              onScan={scanFile}
            />
          ))}
        </div>
        {allScanned && (
          <p className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={15} /> All files scanned
          </p>
        )}
      </div>
    );
  }

  function renderStep3() {
    const batchDone = nonMergedDatasets.length > 0 &&
      nonMergedDatasets.every(d => (analysisResults || {})[d.id]);

    return (
      <div className="space-y-4">
        {/* Intro */}
        <p className="text-sm text-gray-500">
          Analyses all files and detects cross-file relationships in a{' '}
          <strong>single AI call</strong> — no matter how many files you have uploaded.
        </p>

        {/* API key warning */}
        {!apiKey && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl p-3 border border-amber-200">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Configure your Gemini API key in Settings to enable AI analysis.</span>
          </div>
        )}

        {/* File list (read-only summary cards, shown before and after analysis) */}
        <div className="grid gap-3">
          {nonMergedDatasets.map(ds => (
            <FileAnalysisCard
              key={ds.id}
              dataset={ds}
              analyzing={batchAnalyzing}
              analysisResult={(analysisResults || {})[ds.id]}
              onAnalyze={null}   // no per-file trigger in batch mode
              apiKey={null}      // hides the per-file Analyze button
            />
          ))}
        </div>

        {/* Loading state */}
        {batchAnalyzing && (
          <div className="flex items-center gap-3 text-sm text-blue-700 bg-blue-50 rounded-xl p-3 border border-blue-200">
            <Loader2 size={15} className="animate-spin shrink-0" />
            <span>
              Analysing {nonMergedDatasets.length} file{nonMergedDatasets.length !== 1 ? 's' : ''} and
              detecting relationships… this may take 15–30 seconds.
            </span>
          </div>
        )}

        {/* Success state */}
        {batchDone && !batchAnalyzing && (
          <p className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={15} />
            All files analysed — advancing to relationship review.
          </p>
        )}
      </div>
    );
  }

  // Step 4: Confirm Schema.
  // Relationships arrive pre-filled from the batch analyse step.
  // A secondary "Re-detect" fallback is available for users who want to re-run.
  function renderStep4() {
    return (
      <div className="space-y-5">

        {/* ── No relationships yet (came here without running batch analyse) ── */}
        {!hasDetected && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl p-3 border border-amber-200">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              No relationships detected yet. Go back to Step 3 and run{' '}
              <strong>Analyse &amp; Detect</strong>, or use the Re-detect button below.
            </span>
          </div>
        )}

        {/* ── Relationship review cards ── */}
        {hasDetected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Confirm Relationships</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pendingRelationships.length} relationship{pendingRelationships.length !== 1 ? 's' : ''} detected
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => { const n = {}; pendingRelationships.forEach(l => { n[l.link_id] = 'accepted'; }); setDecisions(n); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                >Accept all</button>
                <button
                  onClick={() => { const n = {}; pendingRelationships.forEach(l => { n[l.link_id] = 'rejected'; }); setDecisions(n); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                >Reject all</button>
              </div>
            </div>
            <div className="space-y-3">
              {pendingRelationships.map(link => (
                <InlineLinkRow
                  key={link.link_id}
                  link={link}
                  decision={decisions[link.link_id] || null}
                  datasets={datasets}
                  onDecide={handleDecide}
                  onEdit={handleEdit}
                />
              ))}
            </div>
            {acceptedCount > 0 && (
              <p className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
                <Check size={15} />
                {acceptedCount} relationship{acceptedCount !== 1 ? 's' : ''} accepted
              </p>
            )}
          </div>
        )}

        {/* ── Secondary fallback: Re-detect without going back ── */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400 mb-2">
            Not seeing the right relationships? You can re-run detection.
          </p>
          <button
            onClick={detectRelationships}
            disabled={detectingRelationships}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-2 transition-colors font-medium"
          >
            {detectingRelationships
              ? <><Loader2 size={13} className="animate-spin" /> Detecting…</>
              : <><RefreshCw size={13} /> Re-detect Relationships</>
            }
          </button>
        </div>
      </div>
    );
  }

  // ── Footer config per step ────────────────────────────────────────────────

  const stepConfig = {
    1: {
      showBack: false,
      nextLabel: 'Continue to Quality Check',
      onNext: () => setWorkflowStep(2),
    },
    2: {
      showBack: true,
      nextLabel: 'Next: AI Analysis & Detect',
      onNext: () => setWorkflowStep(3),
      actionLabel: isAnyScanning ? null : 'Scan All Files',
      onAction: isAnyScanning ? null : scanAllFiles,
      actionIcon: isAnyScanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />,
      actionDisabled: isAnyScanning,
    },
    3: {
      showBack: true,
      // Navigation is handled by auto-advance inside batchAnalyze()
      nextLabel: null,
      onNext: null,
      actionLabel: batchAnalyzing ? 'Analysing…' : 'Analyse & Detect',
      onAction: batchAnalyzing ? null : batchAnalyze,
      actionIcon: batchAnalyzing
        ? <Loader2 size={14} className="animate-spin" />
        : <Sparkles size={14} />,
      actionDisabled: batchAnalyzing || !apiKey,
    },
    4: {
      showBack: true,
      nextLabel: acceptedCount > 0 ? 'Save Schema' : null,
      onNext: acceptedCount > 0 ? confirmSchema : null,
      nextLoading: creatingTable,
      nextIcon: <CheckCircle2 size={14} />,
      nextVariant: acceptedCount > 0 ? 'green' : undefined,
    },
  };

  const cfg = stepConfig[workflowStep] || {};

  const stepRenderers = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 };

  // ── Render ────────────────────────────────────────────────────────────────

  const isPage = variant === 'page';

  const inner = (
      <div
        className={isPage ? 'flex flex-col h-full' : 'relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col'}
        style={isPage ? {} : { height: '88vh', maxHeight: '820px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Multi-File Data Workflow</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Step {workflowStep} of {STEPS.length} — {STEPS[workflowStep - 1]?.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <VerticalStepNav currentStep={workflowStep} onStepClick={setWorkflowStep} />
          <div className="flex-1 overflow-y-auto p-6">
            {(stepRenderers[workflowStep] || renderStep1)()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60 shrink-0 rounded-b-2xl">
          <div>
            {cfg.showBack && (
              <button
                onClick={() => setWorkflowStep(s => s - 1)}
                className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors font-medium"
              >
                ← Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {cfg.actionLabel && cfg.onAction && (
              <button
                onClick={cfg.onAction}
                disabled={cfg.actionDisabled}
                className="px-4 py-2 text-sm rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 font-medium flex items-center gap-1.5 transition-colors"
              >
                {cfg.actionIcon}
                {cfg.actionLabel}
              </button>
            )}
            {cfg.nextLabel && cfg.onNext && (
              <button
                onClick={cfg.onNext}
                disabled={cfg.nextLoading}
                className={`px-5 py-2 text-sm rounded-xl font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-60 ${
                  cfg.nextVariant === 'green'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {cfg.nextLoading ? <Loader2 size={14} className="animate-spin" /> : cfg.nextIcon}
                {cfg.nextLabel}
              </button>
            )}
          </div>
        </div>
      </div>
  );

  if (isPage) return inner;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {inner}
    </div>
  );
}
