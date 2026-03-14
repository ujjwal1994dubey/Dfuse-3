/**
 * Agentic Layer Types and Constants
 * Defines action types, position types, and configuration for the AI agent
 */

export const ACTION_TYPES = {
  CREATE_CHART: 'create_chart',
  CREATE_INSIGHT: 'create_insight',
  CREATE_KPI: 'create_kpi',
  GENERATE_CHART_INSIGHTS: 'generate_chart_insights',
  AI_QUERY: 'ai_query',
  SHOW_TABLE: 'show_table',
  CREATE_DASHBOARD: 'create_dashboard',
  ARRANGE_ELEMENTS: 'arrange_elements',
  ORGANIZE_CANVAS: 'organize_canvas',
  SEMANTIC_GROUPING: 'semantic_grouping',
  // Drawing actions (from tldraw agent)
  CREATE_SHAPE: 'create_shape',
  CREATE_TEXT: 'create_text',
  CREATE_ARROW: 'create_arrow',
  HIGHLIGHT_ELEMENT: 'highlight_element'
};

export const POSITION_TYPES = {
  CENTER: 'center',
  RIGHT_OF_CHART: 'right_of_chart',
  BELOW_CHART: 'below_chart',
  AUTO: 'auto'
};

export const AGENT_CONFIG = {
  MAX_ACTIONS_PER_QUERY: 5,
  API_ENDPOINT: '/agent-query',
  DEFAULT_CHART_WIDTH: 800,
  DEFAULT_CHART_HEIGHT: 400,
  CHART_HORIZONTAL_SPACING: 850,
  CHART_VERTICAL_SPACING: 450,
  TABLE_HORIZONTAL_SPACING: 850,
  DEFAULT_KPI_WIDTH: 320,
  DEFAULT_KPI_HEIGHT: 160,
  KPI_HORIZONTAL_SPACING: 340,  // KPI width + 20px padding
  AUTO_GENERATE_INSIGHTS: true,
  MAX_INSIGHTS_PER_DASHBOARD: 5,
  INSIGHT_POSITION_OFFSET: { x: 50, y: 0 }, // Position insights to the right of charts
  INSIGHT_BATCH_SIZE: 2 // Process 2 insights in parallel for faster generation
};

// Rate limiting configuration for Gemini API
export const RATE_LIMIT_CONFIG = {
  // Base delays by action weight
  LIGHT_ACTION_DELAY: 3000,    // 3s for simple queries (20 RPM safe)
  MEDIUM_ACTION_DELAY: 5000,   // 5s for standard operations (12 RPM safe)
  HEAVY_ACTION_DELAY: 5000,    // 5s for complex operations (optimized from 8s)
  
  // Safety features
  ENABLE_JITTER: true,         // Add randomness
  JITTER_MAX: 1000,            // ±0-1 seconds (optimized from 2s)
  
  ENABLE_BACKOFF: true,        // Exponential backoff on errors
  BACKOFF_MULTIPLIER: 2,       // Double delay on each 429
  BACKOFF_MAX: 30000,          // Max 30s delay
  BACKOFF_RESET_AFTER: 120000, // Reset after 2 minutes of success
  
  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: 3, // Open after 3 rate limit errors
  CIRCUIT_BREAKER_TIMEOUT: 60000, // Close after 60s
  
  // Monitoring
  ENABLE_METRICS: true,
  LOG_API_CALLS: true
};

// Action weights (determines delay tier)
export const ACTION_WEIGHTS = {
  [ACTION_TYPES.CREATE_CHART]: 'medium',
  [ACTION_TYPES.CREATE_KPI]: 'light',
  [ACTION_TYPES.CREATE_INSIGHT]: 'light',
  [ACTION_TYPES.GENERATE_CHART_INSIGHTS]: 'heavy', // AI analysis
  [ACTION_TYPES.CREATE_DASHBOARD]: 'heavy', // Multiple elements
  [ACTION_TYPES.AI_QUERY]: 'medium',
  [ACTION_TYPES.ORGANIZE_CANVAS]: 'local', // No API call
  [ACTION_TYPES.ARRANGE_ELEMENTS]: 'local',
  [ACTION_TYPES.SEMANTIC_GROUPING]: 'local',
  [ACTION_TYPES.CREATE_SHAPE]: 'local',
  [ACTION_TYPES.CREATE_TEXT]: 'local',
  [ACTION_TYPES.CREATE_ARROW]: 'local',
  [ACTION_TYPES.HIGHLIGHT_ELEMENT]: 'local',
  [ACTION_TYPES.SHOW_TABLE]: 'local'
};

