/**
 * Agent Chat Panel Component
 * Main UI for the agentic layer - two-mode conversational interface
 * Canvas Mode: Create charts, insights, and tables on canvas
 * Ask Mode: Get analytical answers from data
 */

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getCanvasSnapshot, getEnhancedCanvasContext } from './canvasSnapshot';
import { executeActions } from './actionExecutor';
import { validateActionsSafe } from './validation';
import { createTldrawAgent, executeDrawingActions } from './tldrawAgent';
import { organizeCanvas, organizeByHeuristics } from './canvasOrganizer';
import { Loader2, AlertCircle, Trash2, ArrowUp } from 'lucide-react';

// Progress messages for each mode (defined outside component to avoid re-creation)
const PROGRESS_MESSAGES = {
  canvas: [
    "Understanding your request...",
    "Analyzing dataset structure...",
    "Determining chart type...",
    "Generating visualization..."
  ],
  ask: [
    "Understanding your question...",
    "Scanning the dataset...",
    "Running analysis...",
    "Preparing your answer..."
  ],
  draw: [
    "Understanding your drawing request...",
    "Planning shape layout...",
    "Generating drawing actions...",
    "Creating shapes on canvas..."
  ]
};

/**
 * Strip markdown formatting for plain text display (e.g., canvas textboxes)
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold **text**
    .replace(/\*([^*]+)\*/g, '$1')       // Italic *text*
    .replace(/^[\s]*[-*]\s+/gm, '• ')    // List items - or *
    .replace(/^#+\s+/gm, '')             // Headers #, ##, ###
    .replace(/`([^`]+)`/g, '$1')         // Inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links [text](url)
    .trim();
}

export function AgentChatPanel({
  isOpen,
  onClose,
  datasetId,
  apiKey,
  canvasMessages,
  setCanvasMessages,
  askMessages,
  setAskMessages,
  onTokenUsage,
  canvasContext
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('canvas'); // 'canvas', 'ask', or 'draw'
  const [progressStep, setProgressStep] = useState(0);
  const [analysisType, setAnalysisType] = useState('detailed'); // 'raw' or 'detailed' (Ask mode only)
  const [drawMessages, setDrawMessages] = useState([]); // Draw mode messages
  const [executionProgress, setExecutionProgress] = useState(null); // Progress tracking for multi-step workflows
  const messagesEndRef = useRef(null);

  // Get current messages based on mode
  const currentMessages = mode === 'canvas' ? canvasMessages 
    : mode === 'ask' ? askMessages 
    : drawMessages;
  
  const setCurrentMessages = mode === 'canvas' ? setCanvasMessages 
    : mode === 'ask' ? setAskMessages 
    : setDrawMessages;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // Cycle through progress messages when loading
  useEffect(() => {
    if (!loading) {
      setProgressStep(0);
      return;
    }
    
    const messages = PROGRESS_MESSAGES[mode];
    const interval = setInterval(() => {
      setProgressStep(prev => (prev + 1) % messages.length);
    }, 2000); // Change every 2 seconds
    
    return () => clearInterval(interval);
  }, [loading, mode]);

  // Clear conversation handler for current mode only
  const handleClearConversation = () => {
    if (currentMessages.length > 0) {
      const modeLabel = mode === 'canvas' ? 'Canvas' : mode === 'ask' ? 'Ask' : 'Draw';
      const confirmed = window.confirm(`Clear all ${modeLabel} mode conversation? This cannot be undone.`);
      if (confirmed) {
        setCurrentMessages([]);
        setError(null);
      }
    }
  };

  // Handle Draw mode submission
  const handleDrawSubmit = async (userInput) => {
    // Add user message
    const newMessages = [...drawMessages, { 
      type: 'user', 
      content: userInput,
      timestamp: new Date(),
      mode: 'draw'
    }];
    setDrawMessages(newMessages);
    
    try {
      // Create agent
      const agent = createTldrawAgent(apiKey);
      
      // Get dataset and analysis from canvas context
      const editor = canvasContext?.editor;
      const dataset = canvasContext?.dataset;
      const datasetAnalysis = canvasContext?.datasetAnalysis;  // NEW
      
      // Enhanced context with AI analysis
      const enhancedContext = getEnhancedCanvasContext(
        editor, 
        canvasContext.nodes, 
        dataset,
        datasetAnalysis  // NEW - Pass AI analysis
      );
      
      console.log('🎨 Draw mode with AI semantic context:', enhancedContext);
      
      // Generate drawing actions with full context
      const result = await agent.generateDrawingActions(userInput, enhancedContext);
      
      if (result.success) {
        // Execute actions on canvas
        if (editor && result.actions.length > 0) {
          const createdShapeIds = executeDrawingActions(result.actions, editor);
          console.log(`✅ Created ${createdShapeIds.length} shapes on canvas`);
        }
        
        // Add assistant response
        const assistantMessage = {
          type: 'agent',
          content: result.explanation || 'Drawing created!',
          actions: result.actions,
          timestamp: new Date(),
          mode: 'draw'
        };
        
        setDrawMessages([...newMessages, assistantMessage]);
        
        // Track token usage with cost calculation
        if (onTokenUsage && result.tokensUsed) {
          console.log('📊 Token usage from agent:', result.tokensUsed);
          console.log('📊 Debug usage object:', result._debugUsage);
          
          // Calculate cost based on Gemini pricing
          // Gemini 2.5 Flash: $0.075 per 1M input tokens, $0.30 per 1M output tokens
          const inputCost = (result.tokensUsed.input / 1000000) * 0.075;
          const outputCost = (result.tokensUsed.output / 1000000) * 0.30;
          const estimatedCost = inputCost + outputCost;
          
          const usageData = {
            inputTokens: result.tokensUsed.input,
            outputTokens: result.tokensUsed.output,
            totalTokens: result.tokensUsed.total,
            estimatedCost: estimatedCost,
            mode: 'draw'
          };
          
          console.log('📊 Sending to token tracker:', usageData);
          
          onTokenUsage(usageData);
        } else {
          console.warn('⚠️ No token usage data available:', {
            hasOnTokenUsage: !!onTokenUsage,
            hasTokensUsed: !!result.tokensUsed,
            result: result
          });
        }
      } else {
        throw new Error(result.error || 'Failed to generate drawing');
      }
    } catch (err) {
      console.error('Draw mode error:', err);
      setError(err.message);
      setDrawMessages([...newMessages, {
        type: 'error',
        content: `❌ Error: ${err.message}`,
        timestamp: new Date(),
        mode: 'draw'
      }]);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || loading) return;
    
    // Draw mode doesn't require dataset
    if (mode !== 'draw') {
      if (!datasetId) {
        setError('Please upload a dataset first');
        return;
      }
    }
    
    if (!apiKey) {
      setError('Please configure your Gemini API key in settings');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setError(null);
    setLoading(true);
    
    // Track AI feature usage
    if (canvasContext.trackAIUsed) {
      canvasContext.trackAIUsed();
    }

    // Handle Draw mode separately
    if (mode === 'draw') {
      await handleDrawSubmit(userMessage);
      setLoading(false);
      return;
    }

    // Add user message to current mode's chat (Canvas or Ask mode)
    setCurrentMessages(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date(),
      mode
    }]);

    try {
      // Get enhanced canvas context with charts, KPIs, tables, and annotations
      const enhancedContext = getEnhancedCanvasContext(
        canvasContext.editor,
        canvasContext.nodes
      );
      
      // For backward compatibility, also get traditional canvas state
      const canvasState = getCanvasSnapshot(
        canvasContext.editor,
        canvasContext.nodes
      );
      
      // Merge enhanced context into canvas state
      const enrichedCanvasState = {
        ...canvasState,
        charts: enhancedContext.charts,
        kpis: enhancedContext.kpis,
        tables: enhancedContext.tables,
        annotations: enhancedContext.annotations
      };

      console.log(`🤖 [${mode.toUpperCase()} MODE] Sending query:`, userMessage);
      console.log('📸 Enhanced canvas context:', enhancedContext);

      // Call agent API with mode
      const response = await fetch(`${canvasContext.API}/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: userMessage,
          canvas_state: enrichedCanvasState,
          dataset_id: datasetId,
          api_key: apiKey,
          model: 'gemini-2.5-flash',
          mode: mode, // Send current mode to backend
          analysis_type: analysisType // 'raw' or 'detailed' for Ask mode
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Agent query failed');
      }

      const data = await response.json();
      console.log('✅ Agent response:', data);

      // Track token usage
      if (data.token_usage && onTokenUsage) {
        const usage = data.token_usage;
        const inputCost = (usage.inputTokens / 1000000) * 0.075;
        const outputCost = (usage.outputTokens / 1000000) * 0.30;
        const estimatedCost = inputCost + outputCost;
        
        onTokenUsage({
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
          estimatedCost: estimatedCost
        });
        
        console.log('📊 Token usage:', usage, 'Cost:', `$${estimatedCost.toFixed(4)}`);
      }

      // =====================================================================
      // OPTIMIZATION: Handle Ask Mode embedded result (skipped planning call)
      // Backend returns ask_mode_result directly, no need to execute actions
      // =====================================================================
      if (mode === 'ask' && data.ask_mode_result) {
        console.log('✨ Ask Mode: Using embedded result (planning skipped)');
        const aiResult = data.ask_mode_result;
        
        // Add agent response with AI answer data directly
        setCurrentMessages(prev => [...prev, {
          type: 'ai_answer',
          query: aiResult.query,
          answer: aiResult.answer,
          raw_analysis: aiResult.raw_analysis || '',
          is_refined: aiResult.is_refined || false,
          python_code: aiResult.python_code,
          code_steps: aiResult.code_steps,
          tabular_data: aiResult.tabular_data || [],
          has_table: aiResult.has_table || false,
          timestamp: new Date(),
          mode,
          canvasContext
        }]);
        
        setLoading(false);
        return; // Skip validation and action execution
      }

      // Validate actions (for Canvas mode or legacy flow)
      const validation = validateActionsSafe(data);
      if (!validation.success) {
        throw new Error(`Invalid actions: ${validation.error}`);
      }

      const validated = validation.data;

      // Execute actions immediately
      console.log('⚡ Executing actions:', validated.actions);
      
      // Show progress indicator for multi-step workflows (3+ actions)
      if (validated.actions.length > 3) {
        setExecutionProgress({
          current: 0,
          total: validated.actions.length,
          currentAction: 'Starting workflow...'
        });
      }
      
      const results = await executeActions(validated.actions, {
        ...canvasContext,
        currentQuery: userMessage,
        mode
      });
      
      // Clear progress indicator
      setExecutionProgress(null);

      console.log('📦 Action results:', results);

      // Handle Ask Mode differently - show actual AI response (legacy path)
      if (mode === 'ask' && results.length > 0 && results[0].success && results[0].result?.mode === 'ask') {
        console.log('✨ Ask Mode response detected, showing AI answer');
        const aiResult = results[0].result;
        
        // Add agent response with AI answer data
        setCurrentMessages(prev => [...prev, {
          type: 'ai_answer',
          query: aiResult.query,
          answer: aiResult.answer,
          raw_analysis: aiResult.raw_analysis || '',  // Original pandas output
          is_refined: aiResult.is_refined || false,   // Whether insights were refined
          python_code: aiResult.python_code,
          code_steps: aiResult.code_steps,
          tabular_data: aiResult.tabular_data || [],
          has_table: aiResult.has_table || false,
          timestamp: new Date(),
          mode,
          canvasContext // Pass context for "Add to Canvas"
        }]);
      } else {
        // Canvas Mode or other actions - show regular message
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        let responseContent = '';
        if (successCount > 0) {
          responseContent = `✅ Created ${successCount} ${successCount === 1 ? 'item' : 'items'}:\n\n`;
          results.filter(r => r.success).forEach(r => {
            responseContent += `• ${r.message}\n`;
          });
        }

        if (failCount > 0) {
          responseContent += `\n❌ ${failCount} ${failCount === 1 ? 'action' : 'actions'} failed:\n`;
          results.filter(r => !r.success).forEach(r => {
            responseContent += `• ${r.message}\n`;
          });
        }

        if (validated.reasoning) {
          responseContent += `\n💡 ${validated.reasoning}`;
        }

        // Add agent response to current mode's chat
        setCurrentMessages(prev => [...prev, {
          type: 'agent',
          content: responseContent,
          timestamp: new Date(),
          mode,
          actions: validated.actions,
          results
        }]);
      }

    } catch (err) {
      console.error('❌ Agent query failed:', err);
      setError(err.message);
      setExecutionProgress(null); // Clear progress on error
      
      // Add error message to current mode's chat
      setCurrentMessages(prev => [...prev, {
        type: 'error',
        content: `❌ Error: ${err.message}`,
        timestamp: new Date(),
        mode
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with Mode Toggle */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {/* Mode Toggle - Left Side */}
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg p-1">
            <button
              onClick={() => setMode('canvas')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                mode === 'canvas'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Canvas
            </button>
            <button
              onClick={() => setMode('ask')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                mode === 'ask'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Ask
            </button>
            <button
              onClick={() => setMode('draw')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                mode === 'draw'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Draw
            </button>
          </div>
          
          {/* Clear Button - Right Side */}
          {currentMessages.length > 0 && (
            <button
              onClick={handleClearConversation}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={`Clear ${mode === 'canvas' ? 'Canvas' : mode === 'ask' ? 'Ask' : 'Draw'} conversation`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages - Mode Scoped */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentMessages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            {mode === 'canvas' ? (
              <>
                <p className="text-2xl mb-2">📊</p>
                <p className="text-base font-semibold mb-2">Canvas Mode</p>
                <p className="text-sm">Create charts, insights, and tables</p>
                <div className="mt-6 text-left max-w-md mx-auto space-y-2 text-xs">
                  <p className="font-medium text-gray-700">Try asking:</p>
                  <p className="text-gray-600">• "Show me revenue by region"</p>
                  <p className="text-gray-600">• "Compare top products"</p>
                  <p className="text-gray-600">• "Create a chart for capacity by sprint"</p>
                </div>
              </>
            ) : mode === 'ask' ? (
              <>
                <p className="text-2xl mb-2">💬</p>
                <p className="text-base font-semibold mb-2">Ask Mode</p>
                <p className="text-sm">Get analytical answers from your data</p>
                <div className="mt-6 text-left max-w-md mx-auto space-y-2 text-xs">
                  <p className="font-medium text-gray-700">Try asking:</p>
                  <p className="text-gray-600">• "Which two sprints performed best?"</p>
                  <p className="text-gray-600">• "What is the average capacity?"</p>
                  <p className="text-gray-600">• "Find products with profit &gt; $1000"</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl mb-2">✏️</p>
                <p className="text-base font-semibold mb-2">Draw Mode</p>
                <p className="text-sm">Enhance dashboards with annotations and layouts</p>
                <div className="mt-6 text-left max-w-md mx-auto space-y-2 text-xs">
                  <p className="font-medium text-gray-700">Try asking:</p>
                  <p className="text-gray-600">• "Add a title 'Q4 Performance Dashboard'"</p>
                  <p className="text-gray-600">• "Create a 3-section layout for KPIs"</p>
                  <p className="text-gray-600">• "Draw an arrow highlighting the peak"</p>
                  <p className="text-gray-600">• "Add a callout box with insights"</p>
                </div>
              </>
            )}
          </div>
        )}
        
        {currentMessages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        
        {loading && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {PROGRESS_MESSAGES[mode][progressStep]}
              </p>
              <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-600 rounded-full transition-all duration-500"
                  style={{ width: `${((progressStep + 1) / PROGRESS_MESSAGES[mode].length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Multi-step workflow progress indicator */}
        {executionProgress && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                {executionProgress.currentAction}
              </p>
              <div className="flex items-center justify-between mt-1 text-xs text-blue-600">
                <span>Processing actions...</span>
                <span className="font-medium">
                  {executionProgress.current}/{executionProgress.total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${(executionProgress.current / executionProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        {/* Analysis Type Toggle - Only in Ask Mode */}
        {mode === 'ask' && (
          <div className="mb-3">
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1 w-fit">
              <button
                onClick={() => setAnalysisType('raw')}
                type="button"
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  analysisType === 'raw'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Raw Analysis
              </button>
              <button
                onClick={() => setAnalysisType('detailed')}
                type="button"
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  analysisType === 'detailed'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Detailed Analysis
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative border border-gray-200 rounded-2xl bg-gray-50 focus-within:border-gray-300 focus-within:bg-white transition-colors">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={
                mode === 'canvas'
                  ? "Ask me to create charts..."
                  : mode === 'ask'
                  ? "Ask a question about your data..."
                  : "Describe layout, annotation, or title to add..."
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
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const [showCode, setShowCode] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAIAnswer = message.type === 'ai_answer';

  // Handle Add to Canvas for AI answers
  const handleAddToCanvas = () => {
    if (!message.canvasContext || !message.answer) return;
    
    const { setNodes, getViewportCenter } = message.canvasContext;
    const position = getViewportCenter();
    const insightId = `ai-answer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Strip markdown for clean plain text on canvas
    const plainTextAnswer = stripMarkdown(message.answer);
    
    setNodes(nodes => nodes.concat({
      id: insightId,
      type: 'textbox',
      position,
      draggable: true,
      selectable: false,
      data: {
        text: `❓ ${message.query}\n\n💬 ${plainTextAnswer}`,
        width: 350,
        height: 250,
        fontSize: 14,
        isNew: false,
        aiGenerated: true,
        createdBy: 'agent',
        createdAt: new Date().toISOString()
      }
    }));
    
    console.log('✅ Added AI answer to canvas:', insightId);
  };

  // Special rendering for AI Answer
  if (isAIAnswer) {
    // Parse tabular data if available
    const hasTable = message.has_table && message.tabular_data && message.tabular_data.length > 0;
    let headers = [];
    let rows = [];
    
    if (hasTable) {
      // Extract headers and rows from tabular_data
      headers = Object.keys(message.tabular_data[0]);
      rows = message.tabular_data.map(row => Object.values(row));
    }

    // Mode-specific colors for AI Answer
    const bgColor = message.mode === 'ask' ? 'bg-blue-50' : 'bg-purple-50';
    const textColor = message.mode === 'ask' ? 'text-blue-900' : 'text-purple-900';
    const tableHeaderBg = message.mode === 'ask' ? 'bg-blue-100' : 'bg-purple-100';
    const tableBorderColor = message.mode === 'ask' ? 'border-blue-200' : 'border-purple-200';
    const tableTextColor = message.mode === 'ask' ? 'text-blue-800' : 'text-purple-800';

    return (
      <div className="flex items-start">
        {/* Content */}
        <div className="flex-1">
          {/* Answer Box - No query repetition, no intro line */}
          <div className={`${bgColor} rounded-lg p-4`}>
            <div className={`text-sm ${textColor} prose prose-sm max-w-none`}>
              <ReactMarkdown>{message.answer}</ReactMarkdown>
            </div>
            
            {/* Embedded Table if available */}
            {hasTable && (
              <div className="mt-4 overflow-x-auto">
                <table className={`min-w-full border-collapse border ${tableBorderColor}`}>
                  <thead>
                    <tr className={tableHeaderBg}>
                      {headers.map((header, idx) => (
                        <th
                          key={idx}
                          className={`border ${tableBorderColor} px-3 py-2 text-left text-xs font-semibold ${textColor}`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, rowIdx) => (
                      <tr key={rowIdx} className={`hover:${bgColor}`}>
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className={`border ${tableBorderColor} px-3 py-2 text-xs ${tableTextColor}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <p className={`text-xs ${tableTextColor} mt-2 italic`}>
                    Showing first 10 of {rows.length} rows
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAddToCanvas}
              className={`px-4 py-2 bg-white border ${message.mode === 'ask' ? 'border-blue-300 text-blue-700 hover:bg-blue-50' : 'border-purple-300 text-purple-700 hover:bg-purple-50'} rounded-lg text-sm font-medium transition-colors flex items-center gap-2`}
            >
              → Add to Canvas
            </button>
            
            {message.python_code && (
              <button
                onClick={() => setShowCode(!showCode)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                {showCode ? '▼' : '▶'} View Code
              </button>
            )}
            
            {/* View Raw Data button - only show if refined */}
            {message.is_refined && message.raw_analysis && (
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm font-medium transition-colors"
              >
                {showRawData ? '▼' : '▶'} View Raw Data
              </button>
            )}
          </div>

          {/* Python Code (Collapsible) */}
          {showCode && message.python_code && (
            <div className="mt-3 bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Generated Python Code:</p>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">
                {message.python_code}
              </pre>
            </div>
          )}
          
          {/* Raw Data (Collapsible) - shows original pandas output before refinement */}
          {showRawData && message.raw_analysis && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-700 font-medium mb-2">📊 Raw Pandas Output:</p>
              <pre className="text-xs text-amber-900 font-mono whitespace-pre-wrap overflow-x-auto bg-white p-3 rounded border border-amber-100">
                {message.raw_analysis}
              </pre>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-2">
            {message.timestamp.toLocaleTimeString()}
          </p>
        </div>
      </div>
    );
  }

  // Regular message rendering
  // Mode-specific colors for AI messages (Canvas mode)
  const getMessageStyles = () => {
    if (isUser) {
      return 'bg-gray-100 text-gray-900';
    }
    if (isError) {
      return 'bg-red-50 text-red-900';
    }
    // AI message in Canvas mode
    if (message.mode === 'canvas') {
      return 'bg-purple-50 text-purple-900';
    }
    // AI message in Ask mode (fallback, though ai_answer should handle most)
    return 'bg-blue-50 text-blue-900';
  };

  return (
    <div className={`flex items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Content */}
      <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block max-w-full rounded-lg p-3 ${getMessageStyles()}`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

/**
 * Calculate bounds for a group of nodes
 * Helper function for zooming to organized content
 */
function calculateBounds(nodes) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  
  const positions = nodes.map(node => ({
    x: node.position.x,
    y: node.position.y,
    w: node.data?.width || 800,
    h: node.data?.height || 400
  }));
  
  const minX = Math.min(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxX = Math.max(...positions.map(p => p.x + p.w));
  const maxY = Math.max(...positions.map(p => p.y + p.h));
  
  return {
    x: minX - 50,
    y: minY - 50,
    w: maxX - minX + 100,
    h: maxY - minY + 100
  };
}
