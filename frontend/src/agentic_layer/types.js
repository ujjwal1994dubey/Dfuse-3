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
  SHOW_TABLE: 'show_table'
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
  KPI_HORIZONTAL_SPACING: 340  // KPI width + 20px padding
};

