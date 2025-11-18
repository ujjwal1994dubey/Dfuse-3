/**
 * Agent Chat Panel Component
 * Main UI for the agentic layer - two-mode conversational interface
 * Canvas Mode: Create charts, insights, and tables on canvas
 * Ask Mode: Get analytical answers from data
 */

import React, { useState, useRef, useEffect } from 'react';
import { getCanvasSnapshot } from './canvasSnapshot';
import { executeActions } from './actionExecutor';
import { validateActionsSafe } from './validation';
import { ACTION_TYPES } from './types';
import { Send, Loader2, AlertCircle, Trash2 } from 'lucide-react';

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
  const [mode, setMode] = useState('canvas'); // 'canvas' or 'ask'
  const messagesEndRef = useRef(null);

  // Get current messages based on mode
  const currentMessages = mode === 'canvas' ? canvasMessages : askMessages;
  const setCurrentMessages = mode === 'canvas' ? setCanvasMessages : setAskMessages;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // Clear conversation handler for current mode only
  const handleClearConversation = () => {
    if (currentMessages.length > 0) {
      const confirmed = window.confirm(`Clear all ${mode === 'canvas' ? 'Canvas' : 'Ask'} mode conversation? This cannot be undone.`);
      if (confirmed) {
        setCurrentMessages([]);
        setError(null);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || loading) return;
    
    if (!datasetId) {
      setError('Please upload a dataset first');
      return;
    }
    
    if (!apiKey) {
      setError('Please configure your Gemini API key in settings');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to current mode's chat
    setCurrentMessages(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date(),
      mode
    }]);

    setLoading(true);

    try {
      // Get canvas snapshot
      const canvasState = getCanvasSnapshot(
        canvasContext.editor,
        canvasContext.nodes
      );

      console.log(`🤖 [${mode.toUpperCase()} MODE] Sending query:`, userMessage);
      console.log('📸 Canvas state:', canvasState);

      // Call agent API with mode
      const response = await fetch(`${canvasContext.API}/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: userMessage,
          canvas_state: canvasState,
          dataset_id: datasetId,
          api_key: apiKey,
          model: 'gemini-2.0-flash',
          mode: mode // Send current mode to backend
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

      // Validate actions
      const validation = validateActionsSafe(data);
      if (!validation.success) {
        throw new Error(`Invalid actions: ${validation.error}`);
      }

      const validated = validation.data;

      // Execute actions immediately
      console.log('⚡ Executing actions:', validated.actions);
      const results = await executeActions(validated.actions, {
        ...canvasContext,
        currentQuery: userMessage,
        mode
      });

      console.log('📦 Action results:', results);

      // Handle Ask Mode differently - show actual AI response
      if (mode === 'ask' && results.length > 0 && results[0].success && results[0].result?.mode === 'ask') {
        console.log('✨ Ask Mode response detected, showing AI answer');
        const aiResult = results[0].result;
        
        // Add agent response with AI answer data
        setCurrentMessages(prev => [...prev, {
          type: 'ai_answer',
          query: aiResult.query,
          answer: aiResult.answer,
          python_code: aiResult.python_code,
          code_steps: aiResult.code_steps,
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
          </div>
          
          {/* Clear Button - Right Side */}
          {currentMessages.length > 0 && (
            <button
              onClick={handleClearConversation}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={`Clear ${mode === 'canvas' ? 'Canvas' : 'Ask'} conversation`}
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
            ) : (
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
            )}
          </div>
        )}
        
        {currentMessages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        
        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">
              {mode === 'canvas' ? 'Creating on canvas...' : 'Analyzing data...'}
            </span>
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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'canvas' 
                ? "Ask me to create charts..." 
                : "Ask a question about your data..."
            }
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const [showCode, setShowCode] = useState(false);
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAIAnswer = message.type === 'ai_answer';

  // Handle Add to Canvas for AI answers
  const handleAddToCanvas = () => {
    if (!message.canvasContext || !message.answer) return;
    
    const { setNodes, getViewportCenter } = message.canvasContext;
    const position = getViewportCenter();
    const insightId = `ai-answer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    setNodes(nodes => nodes.concat({
      id: insightId,
      type: 'textbox',
      position,
      draggable: true,
      selectable: false,
      data: {
        text: `❓ ${message.query}\n\n💬 ${message.answer}`,
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
    return (
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-100">
          <span className="text-xs font-medium text-purple-700">AI</span>
        </div>

        {/* Content */}
        <div className="flex-1">
          {/* Query */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
            <p className="text-sm font-medium text-blue-900">❓ {message.query}</p>
          </div>

          {/* Answer */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <p className="text-xs font-medium text-cyan-700 mb-2">💬 Based on your real dataset, here are the results:</p>
            <p className="text-sm text-cyan-900 whitespace-pre-wrap">{message.answer}</p>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleAddToCanvas}
              className="px-4 py-2 bg-white border border-cyan-300 text-cyan-700 rounded-lg hover:bg-cyan-50 text-sm font-medium transition-colors flex items-center gap-2"
            >
              → Add to Canvas
            </button>
            
            {message.python_code && (
              <button
                onClick={() => setShowCode(!showCode)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                {showCode ? '▼' : '▶'} View Python Code
              </button>
            )}
          </div>

          {/* Python Code (Collapsible) */}
          {showCode && message.python_code && (
            <div className="mt-3 bg-gray-900 rounded-lg p-4">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto">
                {message.python_code}
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
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-100' : isError ? 'bg-red-100' : 'bg-purple-100'
      }`}>
        {isUser ? (
          <span className="text-xs font-medium text-blue-700">You</span>
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : (
          <span className="text-xs font-medium text-purple-700">AI</span>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block max-w-full rounded-lg p-3 ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : isError 
            ? 'bg-red-50 text-red-900 border border-red-200'
            : 'bg-gray-100 text-gray-900'
        }`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
