/**
 * Agent Chat Panel Component
 * Main UI for the agentic layer - conversational interface for creating charts and insights
 */

import React, { useState, useRef, useEffect } from 'react';
import { getCanvasSnapshot } from './canvasSnapshot';
import { executeActions } from './actionExecutor';
import { validateActionsSafe } from './validation';
import { ACTION_TYPES } from './types';
import { Send, Sparkles, Loader2, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';

export function AgentChatPanel({
  isOpen,
  onClose,
  datasetId,
  apiKey,
  messages,
  setMessages,
  onTokenUsage,
  canvasContext
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear conversation handler
  const handleClearConversation = () => {
    if (messages.length > 0) {
      const confirmed = window.confirm('Clear all conversation history? This cannot be undone.');
      if (confirmed) {
        setMessages([]);
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

    // Add user message to chat
    setMessages(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setLoading(true);

    try {
      // Get canvas snapshot
      const canvasState = getCanvasSnapshot(
        canvasContext.editor,
        canvasContext.nodes
      );

      console.log('🤖 Sending query to agent:', userMessage);
      console.log('📸 Canvas state:', canvasState);

      // Call agent API
      const response = await fetch(`${canvasContext.API}/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: userMessage,
          canvas_state: canvasState,
          dataset_id: datasetId,
          api_key: apiKey,
          model: 'gemini-2.0-flash'
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
        // Calculate estimated cost (Gemini 2.0 Flash pricing: $0.075 per 1M input, $0.30 per 1M output)
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
      const results = await executeActions(validated.actions, canvasContext);

      // Generate response message
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

      // Add agent response to chat
      setMessages(prev => [...prev, {
        type: 'agent',
        content: responseContent,
        timestamp: new Date(),
        actions: validated.actions,
        results
      }]);

    } catch (err) {
      console.error('❌ Agent query failed:', err);
      setError(err.message);
      
      // Add error message to chat
      setMessages(prev => [...prev, {
        type: 'error',
        content: `❌ Error: ${err.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">AI Agent</h3>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearConversation}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Ask me to create charts and insights
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-base font-semibold mb-4">AI Agent Ready! 🤖</p>
            <div className="text-sm text-left max-w-md mx-auto space-y-2">
              <p className="font-semibold">Try asking me to:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>"Show revenue by product category"</li>
                <li>"What are the top 5 regions by profit?"</li>
                <li>"Generate insights for this chart"</li>
                <li>"Show me the data table"</li>
                <li>"Why is this trend happening?"</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
            </div>
            <div className="flex-1 bg-gray-100 rounded-lg p-3">
              <p className="text-sm text-gray-600">Thinking...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent to create charts..."
            disabled={loading || !datasetId || !apiKey}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || !datasetId || !apiKey}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>

        {!datasetId && (
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ Please upload a dataset first
          </p>
        )}
        {!apiKey && (
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ Please configure your API key in settings
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-100' : isError ? 'bg-red-100' : 'bg-purple-100'
      }`}>
        {isUser ? (
          <span className="text-sm font-medium text-blue-700">You</span>
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : (
          <Sparkles className="w-4 h-4 text-purple-600" />
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

