/**
 * Validation Module
 * Zod schemas for validating agent actions and responses
 */

import { z } from 'zod';
import { ACTION_TYPES, POSITION_TYPES } from './types';

/**
 * Schema for create_chart action
 */
export const CreateChartActionSchema = z.object({
  type: z.literal(ACTION_TYPES.CREATE_CHART),
  dimensions: z.array(z.string()).min(1, "At least one dimension required"),
  measures: z.array(z.string()).min(1, "At least one measure required"),
  chartType: z.string().optional(),
  position: z.enum([
    POSITION_TYPES.CENTER,
    POSITION_TYPES.RIGHT_OF_CHART,
    POSITION_TYPES.BELOW_CHART,
    POSITION_TYPES.AUTO
  ]),
  referenceChartId: z.string().optional(),
  reasoning: z.string()
});

/**
 * Schema for create_insight action
 */
export const CreateInsightActionSchema = z.object({
  type: z.literal(ACTION_TYPES.CREATE_INSIGHT),
  text: z.string().min(1, "Insight text cannot be empty"),
  position: z.enum([
    POSITION_TYPES.CENTER,
    POSITION_TYPES.RIGHT_OF_CHART,
    POSITION_TYPES.BELOW_CHART
  ]),
  referenceChartId: z.string().optional(),
  reasoning: z.string()
});

/**
 * Schema for create_kpi action
 * Supports pre-computed values from agent planning (eliminates extra API calls)
 */
export const CreateKPIActionSchema = z.object({
  type: z.literal(ACTION_TYPES.CREATE_KPI),
  query: z.string().min(1, "KPI query cannot be empty"),
  value: z.number().optional(),  // Pre-computed value
  formatted_value: z.string().optional(),  // Pre-computed formatted value
  explanation: z.string().optional(),  // Pre-computed explanation
  position: z.enum([
    POSITION_TYPES.CENTER,
    POSITION_TYPES.RIGHT_OF_CHART,
    POSITION_TYPES.BELOW_CHART
  ]),
  reasoning: z.string()
});

/**
 * Schema for generate_chart_insights action
 */
export const GenerateChartInsightsSchema = z.object({
  type: z.literal(ACTION_TYPES.GENERATE_CHART_INSIGHTS),
  chartId: z.string(),
  position: z.enum([
    POSITION_TYPES.RIGHT_OF_CHART,
    POSITION_TYPES.BELOW_CHART,
    POSITION_TYPES.CENTER
  ]),
  userContext: z.string().optional(),
  reasoning: z.string()
});

/**
 * Schema for ai_query action
 */
export const AIQuerySchema = z.object({
  type: z.literal(ACTION_TYPES.AI_QUERY),
  query: z.string().min(1, "Query cannot be empty"),
  chartId: z.string().optional(),
  position: z.enum([
    POSITION_TYPES.CENTER,
    POSITION_TYPES.RIGHT_OF_CHART,
    POSITION_TYPES.BELOW_CHART
  ]),
  reasoning: z.string()
});

/**
 * Schema for show_table action
 */
export const ShowTableSchema = z.object({
  type: z.literal(ACTION_TYPES.SHOW_TABLE),
  chartId: z.string(),
  reasoning: z.string()
});

/**
 * Union schema for any agent action
 */
export const AgentActionSchema = z.union([
  CreateChartActionSchema,
  CreateInsightActionSchema,
  CreateKPIActionSchema,
  GenerateChartInsightsSchema,
  AIQuerySchema,
  ShowTableSchema
]);

/**
 * Schema for complete agent response
 */
export const AgentResponseSchema = z.object({
  actions: z.array(AgentActionSchema).max(5, "Maximum 5 actions per query"),
  reasoning: z.string()
});

/**
 * Validate agent response structure
 * @param {Object} response - Agent response to validate
 * @returns {Object} Validated response
 * @throws {ZodError} If validation fails
 */
export function validateActions(response) {
  return AgentResponseSchema.parse(response);
}

/**
 * Safe validation that returns success/error object
 * @param {Object} response - Agent response to validate
 * @returns {Object} { success: boolean, data?: Object, error?: string }
 */
export function validateActionsSafe(response) {
  try {
    const validated = AgentResponseSchema.parse(response);
    return {
      success: true,
      data: validated
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

