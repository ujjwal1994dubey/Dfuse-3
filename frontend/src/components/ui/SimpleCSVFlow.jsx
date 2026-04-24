import React, { useState, useRef } from 'react';
import { CheckCircle, Upload, Sparkles, AlertCircle, SkipForward } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const STEPS = ['Upload', 'Clean', 'Analyse'];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {STEPS.map((label, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: done ? '#2563EB' : active ? '#EFF6FF' : '#F3F4F6',
                  color: done ? '#fff' : active ? '#2563EB' : '#9CA3AF',
                  border: active ? '2px solid #2563EB' : done ? 'none' : '2px solid #E5E7EB',
                }}
              >
                {done ? <CheckCircle size={14} strokeWidth={2.5} /> : idx + 1}
              </div>
              <span className="text-xs mt-1" style={{ color: active ? '#2563EB' : done ? '#374151' : '#9CA3AF' }}>
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className="flex-1 h-0.5 mb-5 mx-1"
                style={{ backgroundColor: idx < current ? '#2563EB' : '#E5E7EB' }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function SimpleCSVFlow({ apiKey, selectedModel, updateTokenUsage, onDone, showToast, onDatasetAdded }) {
  const [step, setStep] = useState(0);           // 0=Upload 1=Clean 2=Analyse
  const [done, setDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quality, setQuality] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [datasetMeta, setDatasetMeta] = useState(null);
  const fileInputRef = useRef(null);

  // Step 1 — upload
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      const meta = await res.json();
      setDatasetMeta(meta);
      if (onDatasetAdded) onDatasetAdded(meta, file.name);
      // Advance to Clean
      await loadQuality(meta.dataset_id);
      setStep(1);
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const loadQuality = async (id) => {
    setQualityLoading(true);
    try {
      const res = await fetch(`${API}/dataset-quality/${id}`);
      if (res.ok) {
        const data = await res.json();
        setQuality(data);
      }
    } catch (_) { /* optional endpoint — silently ignore */ }
    setQualityLoading(false);
  };

  // Step 2 → Step 3
  const handleAdvanceToAnalyse = () => setStep(2);

  // Step 3 — AI analysis
  const handleAnalyse = async () => {
    if (!datasetMeta?.dataset_id) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`${API}/analyze-dataset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: datasetMeta.dataset_id,
          api_key: apiKey || undefined,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Analysis failed: ${res.statusText}`);
      const data = await res.json();
      setAnalysis(data.analysis);
      if (data.analysis?.token_usage) updateTokenUsage?.(data.analysis.token_usage);
      finishFlow();
    } catch (err) {
      setAnalysisError(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const finishFlow = () => {
    setDone(true);
    showToast?.('Dataset ready', 'success');
    setTimeout(() => onDone?.(), 800);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
          <CheckCircle size={24} style={{ color: '#059669' }} />
        </div>
        <p className="text-sm font-semibold text-gray-800">Dataset added to canvas</p>
      </div>
    );
  }

  return (
    <div>
      <StepBar current={step} />

      {/* Step 0 — Upload */}
      {step === 0 && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors"
            style={{ borderColor: '#D1D5DB' }}
            onMouseOver={e => { if (!uploading) e.currentTarget.style.borderColor = '#2563EB'; }}
            onMouseOut={e => e.currentTarget.style.borderColor = '#D1D5DB'}
          >
            {uploading ? (
              <>
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <span className="text-sm text-blue-600">Uploading…</span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
                  <Upload size={18} style={{ color: '#2563EB' }} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Click to choose a file</p>
                  <p className="text-xs text-gray-400 mt-0.5">CSV, XLSX supported</p>
                </div>
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 1 — Clean */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Data Quality</p>
            {qualityLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                Checking quality…
              </div>
            ) : quality ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>Rows</span>
                  <span className="font-medium">{quality.rows?.toLocaleString() ?? datasetMeta?.rows?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Columns</span>
                  <span className="font-medium">{quality.columns ?? '—'}</span>
                </div>
                {quality.duplicate_rows > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle size={13} />
                    {quality.duplicate_rows.toLocaleString()} duplicate rows detected
                  </div>
                )}
                {quality.missing_cells > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle size={13} />
                    {quality.missing_cells.toLocaleString()} missing values
                  </div>
                )}
                {quality.duplicate_rows === 0 && quality.missing_cells === 0 && (
                  <div className="flex items-center gap-1.5 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-xs">
                    <CheckCircle size={13} />
                    No quality issues detected
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-between text-sm text-gray-700">
                <span>Rows</span>
                <span className="font-medium">{datasetMeta?.rows?.toLocaleString() ?? '—'}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleAdvanceToAnalyse}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#2563EB' }}
          >
            Looks good — Continue
          </button>
        </div>
      )}

      {/* Step 2 — Analyse */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 text-center">
            <Sparkles size={22} className="mx-auto mb-2 text-blue-500" />
            <p className="text-sm font-semibold text-gray-800 mb-1">AI Dataset Analysis</p>
            <p className="text-xs text-gray-500">
              Get column descriptions and dataset context to power chart suggestions.
            </p>
          </div>

          {analysisError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {analysisError}
            </div>
          )}

          <button
            onClick={handleAnalyse}
            disabled={analysisLoading || !apiKey}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#2563EB' }}
          >
            {analysisLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analysing…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {apiKey ? 'Analyse with AI' : 'No API key configured'}
              </>
            )}
          </button>

          <button
            onClick={finishFlow}
            disabled={analysisLoading}
            className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            style={{ color: '#6B7280', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}
          >
            <SkipForward size={14} />
            Skip AI analysis
          </button>

          {!apiKey && (
            <p className="text-xs text-center text-gray-400">
              Configure your Gemini API key in Settings to enable AI analysis.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
