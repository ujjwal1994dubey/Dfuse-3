import React, { useState } from 'react';

/**
 * ExecutionLog — collapsible step-by-step AI pipeline transparency panel.
 *
 * Each step can carry:
 *   label   {string}  — short step name shown always
 *   detail  {string}  — plain text beneath the label (table names, join desc, etc.)
 *   code    {string}  — pandas / Python code block (dark bg, green monospace)
 *   raw     {string}  — raw pandas output block (amber bg, monospace)
 *
 * Collapsed by default; user expands to inspect internals.
 * Zero additional LLM calls — all data is sourced from existing pipeline responses.
 */
export default function ExecutionLog({ steps }) {
  const [open, setOpen] = useState(false);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden text-xs">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors font-medium"
      >
        <span className="flex items-center gap-1.5">
          {/* Terminal icon inline SVG — no extra dependency */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Execution log
          <span className="text-gray-400 font-normal">({steps.length} step{steps.length !== 1 ? 's' : ''})</span>
        </span>
        <span className="text-gray-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>

      {/* Steps list */}
      {open && (
        <ol className="divide-y divide-gray-100">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StepRow({ step, index }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [rawOpen, setRawOpen]   = useState(false);

  return (
    <li className="px-3 py-2.5 space-y-1.5 bg-white">
      {/* Step label */}
      <div className="flex items-center gap-2 text-gray-600 font-medium">
        <span className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
          {index + 1}
        </span>
        {step.label}
      </div>

      {/* Plain text detail */}
      {step.detail && (
        <p className="pl-6 text-gray-500 leading-relaxed">{step.detail}</p>
      )}

      {/* Code block — collapsed by default, user clicks to expand */}
      {step.code && (
        <div className="pl-6">
          <button
            onClick={() => setCodeOpen(v => !v)}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span>{codeOpen ? '▼' : '▶'}</span>
            <span>Python code</span>
          </button>
          {codeOpen && (
            <pre className="mt-1.5 bg-gray-900 text-green-400 font-mono text-[11px] rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {step.code}
            </pre>
          )}
        </div>
      )}

      {/* Raw pandas output — collapsed by default */}
      {step.raw && (
        <div className="pl-6">
          <button
            onClick={() => setRawOpen(v => !v)}
            className="flex items-center gap-1 text-amber-600 hover:text-amber-700 transition-colors"
          >
            <span>{rawOpen ? '▼' : '▶'}</span>
            <span>Raw pandas output</span>
          </button>
          {rawOpen && (
            <pre className="mt-1.5 bg-amber-50 border border-amber-100 text-amber-900 font-mono text-[11px] rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {step.raw}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
