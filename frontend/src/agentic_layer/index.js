/**
 * Agentic Layer Module - Public API
 * Exports all public interfaces for the AI agent functionality
 */

export { AgentChatPanel } from './AgentChatPanel';
export { 
  getCanvasSnapshot, 
  exportCanvasStateAsJSON, 
  downloadCanvasStateAsJSON, 
  loadCanvasStateFromJSON, 
  shareCanvasViaGist, 
  loadSharedCanvasState 
} from './canvasSnapshot';
export { executeActions } from './actionExecutor';
export { validateActions, validateActionsSafe } from './validation';
export { ACTION_TYPES, POSITION_TYPES, AGENT_CONFIG } from './types';
export { LayoutManager, arrangeKPIDashboard } from './layoutManager';
export { 
  detectDataRelationships, 
  detectHierarchicalRelationships,
  detectTemporalRelationships,
  detectComparisonRelationships,
  suggestGroupings,
  suggestLayoutStrategy,
  calculateGroupingScore,
  detectNarrativeSequence,
  getRelationshipStrength
} from './spatialGrouping';
export { createTldrawAgent, executeDrawingActions } from './tldrawAgent';

