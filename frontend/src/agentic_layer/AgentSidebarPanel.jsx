/**
 * AgentSidebarPanel
 *
 * New AI sidebar that mirrors the tldraw Agent Starter Kit UX:
 *   - Real token-streaming responses (via SSE /agent-stream)
 *   - Full multi-turn conversation memory
 *   - Action log with per-action icons and descriptions
 *   - Context chips showing what the agent can currently see
 *   - Spatial controls (highlight, move, align, distribute)
 *   - Viewport-aware context (BlurryShapes + PeripheralClusters)
 *
 * Drop-in compatible with AgentChatPanel's prop interface.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getEnhancedCanvasContext,
  getViewportAwareContext,
} from './canvasSnapshot';
import { executeActions } from './actionExecutor';
import { validateActionsSafe } from './validation';
import { createTldrawAgent, executeDrawingActions } from './tldrawAgent';
import {
  Loader2, AlertCircle, Trash2, ArrowUp, ChevronDown, ChevronRight,
  Eye, Map, BarChart2, Layers, Move, AlignLeft, ZoomIn, Grid,
} from 'lucide-react';

// ─── Session ID ───────────────────────────────────────────────────────────────
function generateSessionId() {
  return 'sid-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now();
}

// ─── Action metadata (icon + label for the action log) ────────────────────────
const ACTION_META = {
  create_chart:        { icon: <BarChart2 className="w-3 h-3" />, label: 'Created chart' },
  create_kpi:          { icon: <Layers className="w-3 h-3" />,    label: 'Created KPI' },
  create_insight:      { icon: <Eye className="w-3 h-3" />,       label: 'Added insight' },
  create_dashboard:    { icon: <Grid className="w-3 h-3" />,      label: 'Created dashboard' },
  generate_chart_insights: { icon: <Eye className="w-3 h-3" />,   label: 'Generated insights' },
  show_table:          { icon: <Layers className="w-3 h-3" />,    label: 'Showed table' },
  arrange_elements:    { icon: <AlignLeft className="w-3 h-3" />, label: 'Arranged elements' },
  move_shape:          { icon: <Move className="w-3 h-3" />,      label: 'Moved shape' },
  highlight_shape:     { icon: <ZoomIn className="w-3 h-3" />,    label: 'Highlighted shape' },
  align_shapes:        { icon: <AlignLeft className="w-3 h-3" />, label: 'Aligned shapes' },
  distribute_shapes:   { icon: <Grid className="w-3 h-3" />,      label: 'Distributed shapes' },
  ai_query:            { icon: <Eye className="w-3 h-3" />,       label: 'Queried data' },
  create_shape:        { icon: <Map className="w-3 h-3" />,       label: 'Created shape' },
  create_arrow:        { icon: <Map className="w-3 h-3" />,       label: 'Created arrow' },
  create_text:         { icon: <Map className="w-3 h-3" />,       label: 'Added text' },
  highlight_element:   { icon: <ZoomIn className="w-3 h-3" />,    label: 'Highlighted element' },
};

function getActionMeta(type) {
  return ACTION_META[type] || { icon: <Layers className="w-3 h-3" />, label: type };
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[\s]*[-*]\s+/gm, '• ')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Context chips shown above the input area */
function ContextChips({ viewportCtx, canvasContext }) {
  if (!viewportCtx) return null;
  const { viewportShapes, peripheralClusters } = viewportCtx;
  const selectedCount = (() => {
    try { return canvasContext?.editor?.getSelectedShapeIds()?.length ?? 0; } catch (_) { return 0; }
  })();

  return (
    <div className="flex flex-wrap gap-1 px-3 pt-2 pb-1">
      {viewportShapes.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
          <Eye className="w-3 h-3" />
          Viewport: {viewportShapes.length} shape{viewportShapes.length !== 1 ? 's' : ''}
        </span>
      )}
      {peripheralClusters.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
          <Map className="w-3 h-3" />
          Off-screen: {peripheralClusters.reduce((s, c) => s + c.count, 0)} shapes
        </span>
      )}
      {selectedCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
          <AlignLeft className="w-3 h-3" />
          Selection: {selectedCount}
        </span>
      )}
    </div>
  );
}

/** Single action entry in the action log */
function ActionEntry({ action, result }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getActionMeta(action.type);
  const hasDetail = action.reasoning || result?.message;

  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className="mt-0.5 text-gray-400 shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-1 cursor-pointer group"
          onClick={() => hasDetail && setExpanded(v => !v)}
        >
          <span className="text-xs text-gray-600 truncate">{meta.label}</span>
          {action.type === 'create_chart' && action.dimensions && (
            <span className="text-[10px] text-gray-400 truncate">
              {action.measures?.join(', ')} by {action.dimensions?.join(', ')}
            </span>
          )}
          {hasDetail && (
            expanded
              ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
              : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
          )}
        </div>
        {expanded && (
          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
            {action.reasoning || result?.message}
          </p>
        )}
      </div>
    </div>
  );
}

/** AI Streaming message bubble */
function StreamingBubble({ streamText, isStreaming }) {
  return (
    <div className="bg-purple-50 rounded-lg p-3">
      <div className="text-sm text-purple-900 prose prose-sm max-w-none">
        {streamText
          ? <ReactMarkdown>{streamText}</ReactMarkdown>
          : isStreaming && (
            <span className="inline-flex items-center gap-1 text-purple-500">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )
        }
      </div>
    </div>
  );
}

/** Full message bubble (used for completed messages) */
function MessageBubble({ message, onAddToCanvas }) {
  const [showCode, setShowCode] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAIAnswer = message.type === 'ai_answer';
  const isAgent = message.type === 'agent' || message.type === 'streaming';

  if (isAIAnswer) {
    return (
      <div className="flex items-start">
        <div className="flex-1">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-sm text-blue-900 prose prose-sm max-w-none">
              <ReactMarkdown>{message.answer}</ReactMarkdown>
            </div>
            {message.has_table && message.tabular_data?.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse border border-blue-200 text-xs">
                  <thead>
                    <tr className="bg-blue-100">
                      {Object.keys(message.tabular_data[0]).map((h, i) => (
                        <th key={i} className="border border-blue-200 px-2 py-1 text-left text-blue-800 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {message.tabular_data.slice(0, 10).map((row, ri) => (
                      <tr key={ri}>
                        {Object.values(row).map((cell, ci) => (
                          <td key={ci} className="border border-blue-200 px-2 py-1 text-blue-800">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {message.tabular_data.length > 10 && (
                  <p className="text-[10px] text-blue-500 mt-1">Showing 10 of {message.tabular_data.length} rows</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onAddToCanvas && onAddToCanvas(message)}
              className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
            >
              → Add to Canvas
            </button>
            {message.python_code && (
              <button
                onClick={() => setShowCode(v => !v)}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors"
              >
                {showCode ? '▼' : '▶'} Code
              </button>
            )}
            {message.is_refined && message.raw_analysis && (
              <button
                onClick={() => setShowRawData(v => !v)}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-medium transition-colors"
              >
                {showRawData ? '▼' : '▶'} Raw Data
              </button>
            )}
          </div>
          {showCode && (
            <div className="mt-2 bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Generated Python Code:</p>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">{message.python_code}</pre>
            </div>
          )}
          {showRawData && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium mb-1">📊 Raw Pandas Output:</p>
              <pre className="text-xs text-amber-900 font-mono whitespace-pre-wrap overflow-x-auto bg-white p-2 rounded border border-amber-100">{message.raw_analysis}</pre>
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-1">{message.timestamp?.toLocaleTimeString()}</p>
        </div>
      </div>
    );
  }

  if (isAgent) {
    const hasActions = message.actions?.length > 0;
    return (
      <div className="flex items-start">
        <div className="flex-1">
          {message.content && (
            <div className="bg-purple-50 rounded-lg p-3 mb-2">
              <p className="text-sm text-purple-900 whitespace-pre-wrap">{message.content}</p>
            </div>
          )}
          {hasActions && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={() => setActionsExpanded(v => !v)}
              >
                <span className="font-medium">
                  {message.actions.length} action{message.actions.length !== 1 ? 's' : ''} taken
                </span>
                {actionsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {actionsExpanded && (
                <div className="px-3 pb-2 border-t border-gray-100 pt-2 space-y-0.5">
                  {message.actions.map((action, i) => (
                    <ActionEntry
                      key={i}
                      action={action}
                      result={message.results?.[i]}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-1">{message.timestamp?.toLocaleTimeString()}</p>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex items-start flex-row-reverse">
        <div className="flex-1 text-right">
          <div className="inline-block max-w-[85%] rounded-2xl px-3 py-2 bg-gray-900 text-white text-sm text-left">
            {message.content}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{message.timestamp?.toLocaleTimeString()}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        <p className="text-xs text-red-700">{message.content}</p>
      </div>
    );
  }

  return null;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AgentSidebarPanel({
  isOpen,
  onClose,
  datasetId,
  apiKey,
  canvasMessages,
  setCanvasMessages,
  askMessages,
  setAskMessages,
  onTokenUsage,
  canvasContext,
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('canvas');
  const [analysisType, setAnalysisType] = useState('detailed');
  const [drawMessages, setDrawMessages] = useState([]);
  const [executionProgress, setExecutionProgress] = useState(null);
  const [viewportCtx, setViewportCtx] = useState(null);

  const messagesEndRef = useRef(null);
  const sessionIdRef = useRef(generateSessionId());
  const abortRef = useRef(null);
  const textareaRef = useRef(null);

  const currentMessages = mode === 'canvas' ? canvasMessages
    : mode === 'ask' ? askMessages
    : drawMessages;

  const setCurrentMessages = mode === 'canvas' ? setCanvasMessages
    : mode === 'ask' ? setAskMessages
    : setDrawMessages;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, streamingText]);

  // Refresh viewport context whenever the panel opens or mode changes
  useEffect(() => {
    if (!isOpen) return;
    try {
      const ctx = getViewportAwareContext(canvasContext?.editor, canvasContext?.nodes || []);
      setViewportCtx(ctx);
    } catch (_) {}
  }, [isOpen, mode, canvasContext]);

  // ── Add to Canvas (Ask mode) ──────────────────────────────────────────────
  const handleAddToCanvas = useCallback((message) => {
    const { setNodes, getViewportCenter } = canvasContext || {};
    if (!setNodes || !message.answer) return;
    const position = getViewportCenter ? getViewportCenter() : { x: 0, y: 0 };
    const id = `ai-answer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setNodes(nodes => nodes.concat({
      id, type: 'textbox', position, draggable: true, selectable: false,
      data: {
        text: `❓ ${message.query}\n\n💬 ${stripMarkdown(message.answer)}`,
        width: 350, height: 250, fontSize: 14, aiGenerated: true,
        createdBy: 'agent', createdAt: new Date().toISOString(),
      },
    }));
  }, [canvasContext]);

  // ── Clear conversation ────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (!currentMessages.length) return;
    const label = mode === 'canvas' ? 'Canvas' : mode === 'ask' ? 'Ask' : 'Draw';
    if (!window.confirm(`Clear ${label} conversation? This cannot be undone.`)) return;
    setCurrentMessages([]);
    setError(null);
    const oldId = sessionIdRef.current;
    sessionIdRef.current = generateSessionId();
    if (canvasContext?.API && oldId) {
      fetch(`${canvasContext.API}/conversation/${oldId}`, { method: 'DELETE' }).catch(() => {});
    }
  }, [currentMessages, mode, setCurrentMessages, canvasContext]);

  // ── Draw mode submit ───────────────────────────────────────────────────────
  const handleDrawSubmit = useCallback(async (userInput) => {
    const newMessages = [...drawMessages, { type: 'user', content: userInput, timestamp: new Date(), mode: 'draw' }];
    setDrawMessages(newMessages);
    try {
      const agent = createTldrawAgent(apiKey);
      const editor = canvasContext?.editor;
      const enhancedContext = getEnhancedCanvasContext(editor, canvasContext?.nodes || [], canvasContext?.dataset, canvasContext?.datasetAnalysis);
      const result = await agent.generateDrawingActions(userInput, enhancedContext);
      if (result.success) {
        if (editor && result.actions?.length) executeDrawingActions(result.actions, editor);
        const assistantMsg = { type: 'agent', content: result.explanation || 'Drawing created!', actions: result.actions, timestamp: new Date(), mode: 'draw' };
        setDrawMessages([...newMessages, assistantMsg]);
        if (onTokenUsage && result.tokensUsed) {
          const inputCost = (result.tokensUsed.input / 1e6) * 0.075;
          const outputCost = (result.tokensUsed.output / 1e6) * 0.30;
          onTokenUsage({ inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.total, estimatedCost: inputCost + outputCost, mode: 'draw' });
        }
      } else throw new Error(result.error || 'Failed to generate drawing');
    } catch (err) {
      setError(err.message);
      setDrawMessages([...newMessages, { type: 'error', content: `❌ ${err.message}`, timestamp: new Date(), mode: 'draw' }]);
    }
  }, [drawMessages, apiKey, canvasContext, onTokenUsage]);

  // ── Main streaming submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    if (mode !== 'draw' && !datasetId) { setError('Please upload a dataset first'); return; }
    if (!apiKey) { setError('Please configure your Gemini API key'); return; }

    const userMessage = input.trim();
    setInput('');
    setError(null);
    setLoading(true);
    setStreamingText('');

    if (canvasContext?.trackAIUsed) canvasContext.trackAIUsed();

    if (mode === 'draw') {
      await handleDrawSubmit(userMessage);
      setLoading(false);
      return;
    }

    setCurrentMessages(prev => [...prev, { type: 'user', content: userMessage, timestamp: new Date(), mode }]);

    // Refresh viewport context
    try {
      const ctx = getViewportAwareContext(canvasContext?.editor, canvasContext?.nodes || []);
      setViewportCtx(ctx);
    } catch (_) {}

    const enhancedContext = getEnhancedCanvasContext(canvasContext?.editor, canvasContext?.nodes || []);
    const recentHistory = currentMessages.slice(-6).map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.type === 'user' ? m.content : (m.content || m.answer || ''),
      mode: m.mode || mode,
    }));

    const body = JSON.stringify({
      user_query: userMessage,
      canvas_state: {
        ...enhancedContext,
        spatial_analysis: viewportCtx ? {
          viewport_shapes: viewportCtx.viewportShapes,
          peripheral_clusters: viewportCtx.peripheralClusters,
          viewport_bounds: viewportCtx.viewportBounds,
        } : undefined,
      },
      dataset_id: datasetId,
      api_key: apiKey,
      model: 'gemini-2.5-flash',
      mode,
      analysis_type: analysisType,
      session_id: sessionIdRef.current,
      conversation_history: recentHistory,
    });

    // ── SSE streaming via /agent-stream ────────────────────────────────────
    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`${canvasContext.API}/agent-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        // Fallback to non-streaming endpoint if /agent-stream not available
        throw new Error(`Stream endpoint returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let parsedActions = null;
      let donePayload = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (line.startsWith('event: token')) continue;
          if (line.startsWith('event: actions')) continue;
          if (line.startsWith('event: done')) continue;
          if (line.startsWith('event: error')) continue;

          if (line.startsWith('data: ')) {
            const rawData = line.slice(6).trim();
            if (!rawData) continue;
            try {
              const payload = JSON.parse(rawData);

              // Token chunk
              if (payload.text !== undefined) {
                accumulated += payload.text;
                setStreamingText(accumulated);
              }
              // Actions payload
              if (payload.actions !== undefined) {
                parsedActions = payload;
              }
              // Done payload
              if (payload.session_id !== undefined) {
                donePayload = payload;
                sessionIdRef.current = payload.session_id;
              }
              // Error
              if (payload.error) {
                throw new Error(payload.error);
              }
            } catch (parseErr) {
              // Skip malformed SSE lines
            }
          }
        }
      }

      // Token usage
      if (donePayload?.token_usage && onTokenUsage) {
        const usage = donePayload.token_usage;
        const inputCost = ((usage.inputTokens || 0) / 1e6) * 0.075;
        const outputCost = ((usage.outputTokens || 0) / 1e6) * 0.30;
        onTokenUsage({ ...usage, estimatedCost: inputCost + outputCost });
      }

      if (!parsedActions) throw new Error('No actions received from stream');

      // ── Ask mode result ──
      if (mode === 'ask' && parsedActions.ask_mode_result) {
        const aiResult = parsedActions.ask_mode_result;
        setCurrentMessages(prev => [...prev, {
          type: 'ai_answer',
          query: aiResult.query,
          answer: aiResult.answer,
          raw_analysis: aiResult.raw_analysis || '',
          is_refined: aiResult.is_refined || false,
          python_code: aiResult.python_code,
          tabular_data: aiResult.tabular_data || [],
          has_table: aiResult.has_table || false,
          timestamp: new Date(),
          mode,
        }]);
        setStreamingText('');
        setLoading(false);
        return;
      }

      // ── Canvas mode: execute actions ──
      const validation = validateActionsSafe(parsedActions);
      if (!validation.success) throw new Error(`Invalid actions: ${validation.error}`);
      const validated = validation.data;

      if (validated.actions.length > 3) {
        setExecutionProgress({ current: 0, total: validated.actions.length, currentAction: 'Executing actions...' });
      }

      const results = await executeActions(validated.actions, {
        ...canvasContext,
        currentQuery: userMessage,
        mode,
      });

      setExecutionProgress(null);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      let content = '';
      if (successCount > 0) {
        content = `✅ ${successCount} action${successCount !== 1 ? 's' : ''} completed`;
        results.filter(r => r.success).forEach(r => { content += `\n• ${r.message}`; });
      }
      if (failCount > 0) {
        content += `\n❌ ${failCount} action${failCount !== 1 ? 's' : ''} failed`;
        results.filter(r => !r.success).forEach(r => { content += `\n• ${r.message}`; });
      }

      setCurrentMessages(prev => [...prev, {
        type: 'agent',
        content: content || accumulated,
        actions: validated.actions,
        results,
        timestamp: new Date(),
        mode,
      }]);

    } catch (streamErr) {
      // ── Fallback to non-streaming /agent-query ──────────────────────────
      if (streamErr.name === 'AbortError') {
        setLoading(false);
        setStreamingText('');
        return;
      }

      console.warn('⚠️ Streaming failed, falling back to /agent-query:', streamErr.message);
      setStreamingText('');

      try {
        const response = await fetch(`${canvasContext.API}/agent-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ detail: 'Unknown error' }));
          throw new Error(errData.detail || 'Agent query failed');
        }
        const data = await response.json();
        if (data.session_id) sessionIdRef.current = data.session_id;

        if (data.token_usage && onTokenUsage) {
          const usage = data.token_usage;
          const inputCost = (usage.inputTokens / 1e6) * 0.075;
          const outputCost = (usage.outputTokens / 1e6) * 0.30;
          onTokenUsage({ ...usage, estimatedCost: inputCost + outputCost });
        }

        if (mode === 'ask' && data.ask_mode_result) {
          const aiResult = data.ask_mode_result;
          setCurrentMessages(prev => [...prev, {
            type: 'ai_answer', query: aiResult.query, answer: aiResult.answer,
            raw_analysis: aiResult.raw_analysis || '', is_refined: aiResult.is_refined || false,
            python_code: aiResult.python_code, tabular_data: aiResult.tabular_data || [],
            has_table: aiResult.has_table || false, timestamp: new Date(), mode,
          }]);
          setLoading(false);
          return;
        }

        const validation = validateActionsSafe(data);
        if (!validation.success) throw new Error(`Invalid actions: ${validation.error}`);
        const validated = validation.data;
        const results = await executeActions(validated.actions, { ...canvasContext, currentQuery: userMessage, mode });
        const successCount = results.filter(r => r.success).length;
        let content = `✅ ${successCount} action${successCount !== 1 ? 's' : ''} completed`;
        results.filter(r => r.success).forEach(r => { content += `\n• ${r.message}`; });

        setCurrentMessages(prev => [...prev, {
          type: 'agent', content, actions: validated.actions, results, timestamp: new Date(), mode,
        }]);

      } catch (fallbackErr) {
        setError(fallbackErr.message);
        setCurrentMessages(prev => [...prev, {
          type: 'error', content: `❌ ${fallbackErr.message}`, timestamp: new Date(), mode,
        }]);
      }
    } finally {
      setLoading(false);
      setStreamingText('');
      setExecutionProgress(null);
    }
  }, [input, loading, mode, datasetId, apiKey, canvasContext, currentMessages, viewportCtx, analysisType, onTokenUsage, setCurrentMessages, handleDrawSubmit]);

  // ── Empty state prompts ───────────────────────────────────────────────────
  const emptyState = {
    canvas: {
      icon: '📊', title: 'Canvas Mode',
      subtitle: 'Create charts, KPIs, and insights',
      examples: ['Show me revenue by region', 'Create a sales dashboard', 'Compare top products', 'Align all charts in a grid'],
    },
    ask: {
      icon: '💬', title: 'Ask Mode',
      subtitle: 'Get analytical answers from your data',
      examples: ['Which products have the highest margin?', 'What is the average revenue?', 'Find outliers in the data'],
    },
    draw: {
      icon: '✏️', title: 'Draw Mode',
      subtitle: 'Annotate and enhance your canvas',
      examples: ["Add a title 'Q4 Dashboard'", 'Create a 3-section layout', 'Draw an arrow to the peak'],
    },
  };
  const empty = emptyState[mode];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg p-0.5">
            {['canvas', 'ask', 'draw'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                  mode === m
                    ? m === 'canvas' ? 'bg-purple-600 text-white'
                    : m === 'ask' ? 'bg-blue-600 text-white'
                    : 'bg-green-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {currentMessages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {currentMessages.length === 0 && !loading && (
          <div className="text-center py-10 px-4">
            <p className="text-3xl mb-2">{empty.icon}</p>
            <p className="text-sm font-semibold text-gray-800 mb-1">{empty.title}</p>
            <p className="text-xs text-gray-500 mb-5">{empty.subtitle}</p>
            <div className="text-left space-y-1.5">
              <p className="text-xs font-medium text-gray-600">Try asking:</p>
              {empty.examples.map((ex, i) => (
                <button
                  key={i}
                  className="block w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
                  onClick={() => { setInput(ex); textareaRef.current?.focus(); }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentMessages.map((msg, i) => (
          <MessageBubble key={i} message={msg} onAddToCanvas={handleAddToCanvas} />
        ))}

        {/* Streaming in-progress bubble */}
        {loading && (
          <StreamingBubble streamText={streamingText} isStreaming={loading} />
        )}

        {/* Multi-action progress */}
        {executionProgress && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-blue-800">{executionProgress.currentAction}</p>
              <div className="mt-1 h-1 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(executionProgress.current / executionProgress.total) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] text-blue-600 font-medium shrink-0">
              {executionProgress.current}/{executionProgress.total}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-800">Error</p>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Context Chips ──────────────────────────────────────────────────── */}
      <ContextChips viewportCtx={viewportCtx} canvasContext={canvasContext} />

      {/* ── Ask mode sub-toggle ────────────────────────────────────────────── */}
      {mode === 'ask' && (
        <div className="px-3 pb-1">
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 w-fit">
            {['raw', 'detailed'].map(at => (
              <button
                key={at}
                onClick={() => setAnalysisType(at)}
                className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors capitalize ${
                  analysisType === at ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {at === 'raw' ? 'Raw' : 'Detailed'} Analysis
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-gray-200">
        <form onSubmit={handleSubmit}>
          <div className="relative border border-gray-200 rounded-2xl bg-gray-50 focus-within:border-gray-300 focus-within:bg-white transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
              }}
              placeholder={
                mode === 'canvas' ? 'Ask to create charts, move shapes, align...'
                : mode === 'ask' ? 'Ask a question about your data...'
                : 'Describe annotation or layout to add...'
              }
              className="w-full px-4 py-3 pr-12 bg-transparent resize-none rounded-2xl focus:outline-none text-sm"
              rows={1}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-2 bottom-2 p-2 rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowUp className="w-4 h-4" />
              }
            </button>
          </div>
          {loading && (
            <button
              type="button"
              onClick={() => { abortRef.current?.abort(); setLoading(false); setStreamingText(''); }}
              className="mt-1.5 w-full text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Stop generating
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
