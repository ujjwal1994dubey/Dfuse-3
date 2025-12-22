/**
 * Action Scheduler - Manages priority queue for multi-step workflows
 * Enables complex agentic behaviors with intelligent action sequencing
 */

import { rateLimiter } from './rateLimiter';
import { ACTION_TYPES, ACTION_WEIGHTS } from './types';

export class ActionScheduler {
  constructor() {
    this.queue = [];
    this.executing = false;
  }
  
  /**
   * Schedule actions with priority
   */
  scheduleActions(actions) {
    // Assign priorities
    const prioritizedActions = actions.map(action => ({
      action,
      priority: this.getPriority(action.type),
      weight: ACTION_WEIGHTS[action.type] || 'medium',
      estimatedTokens: this.estimateTokens(action)
    }));
    
    // Sort by priority (lower number = higher priority)
    prioritizedActions.sort((a, b) => a.priority - b.priority);
    
    this.queue.push(...prioritizedActions);
    
    console.log(`📋 Scheduled ${actions.length} actions. Queue size: ${this.queue.length}`);
    
    return this.queue;
  }
  
  /**
   * Get priority for action type
   */
  getPriority(actionType) {
    const priorities = {
      // Priority 1: Data creation (must happen first)
      [ACTION_TYPES.CREATE_CHART]: 1,
      [ACTION_TYPES.CREATE_KPI]: 1,
      [ACTION_TYPES.CREATE_DASHBOARD]: 1,
      [ACTION_TYPES.SHOW_TABLE]: 1,
      
      // Priority 2: Organization (needs data to exist)
      [ACTION_TYPES.ORGANIZE_CANVAS]: 2,
      [ACTION_TYPES.ARRANGE_ELEMENTS]: 2,
      [ACTION_TYPES.SEMANTIC_GROUPING]: 2,
      
      // Priority 3: AI enhancement (needs organized data)
      [ACTION_TYPES.GENERATE_CHART_INSIGHTS]: 3,
      [ACTION_TYPES.AI_QUERY]: 3,
      
      // Priority 4: Visual annotation (needs everything else)
      [ACTION_TYPES.CREATE_SHAPE]: 4,
      [ACTION_TYPES.CREATE_ARROW]: 4,
      [ACTION_TYPES.CREATE_TEXT]: 4,
      [ACTION_TYPES.HIGHLIGHT_ELEMENT]: 4,
      [ACTION_TYPES.CREATE_INSIGHT]: 4
    };
    
    return priorities[actionType] || 5;
  }
  
  /**
   * Estimate tokens for an action
   */
  estimateTokens(action) {
    const estimates = {
      [ACTION_TYPES.CREATE_CHART]: 1500,
      [ACTION_TYPES.GENERATE_CHART_INSIGHTS]: 3000,
      [ACTION_TYPES.CREATE_DASHBOARD]: 2500,
      [ACTION_TYPES.AI_QUERY]: 2000,
      [ACTION_TYPES.CREATE_KPI]: 800
    };
    
    return estimates[action.type] || 1000;
  }
  
  /**
   * Execute queue with intelligent batching
   */
  async executeQueue(context, onProgress) {
    if (this.executing) {
      console.warn('⚠️ Queue already executing');
      return;
    }
    
    this.executing = true;
    const results = [];
    
    try {
      console.log(`🚀 Executing queue with ${this.queue.length} actions`);
      
      // Group by priority
      const batches = this.groupByPriority(this.queue);
      
      for (const [priority, batch] of Object.entries(batches)) {
        console.log(`📦 Executing Priority ${priority} batch: ${batch.length} actions`);
        
        // Separate local and API actions within batch
        const localActions = batch.filter(item => item.weight === 'local');
        const apiActions = batch.filter(item => item.weight !== 'local');
        
        // Execute local actions first (parallel possible)
        if (localActions.length > 0) {
          console.log(`⚡ Executing ${localActions.length} local actions (fast)`);
          const localResults = await Promise.all(
            localActions.map(item => 
              this.executeAction(item.action, context)
                .then(result => ({ success: true, action: item.action, result }))
                .catch(error => ({ success: false, action: item.action, error: error.message }))
            )
          );
          results.push(...localResults);
          onProgress?.(results.length, this.queue.length);
        }
        
        // Execute API actions with rate limiting (sequential)
        if (apiActions.length > 0) {
          console.log(`🔄 Executing ${apiActions.length} API actions (rate limited)`);
          
          for (let i = 0; i < apiActions.length; i++) {
            const item = apiActions[i];
            
            try {
              const result = await rateLimiter.executeWithRateLimit(
                item.action.type,
                () => this.executeAction(item.action, context)
              );
              
              results.push({ success: true, action: item.action, result });
              onProgress?.(results.length, this.queue.length);
              
            } catch (error) {
              console.error(`❌ Action failed:`, error);
              results.push({ success: false, action: item.action, error: error.message });
            }
          }
        }
        
        console.log(`✅ Priority ${priority} batch complete`);
      }
      
      console.log(`✅ Queue execution complete: ${results.length} actions processed`);
      
    } finally {
      this.executing = false;
      this.queue = []; // Clear queue
    }
    
    return results;
  }
  
  /**
   * Group actions by priority
   */
  groupByPriority(queue) {
    const groups = {};
    
    queue.forEach(item => {
      if (!groups[item.priority]) {
        groups[item.priority] = [];
      }
      groups[item.priority].push(item);
    });
    
    return groups;
  }
  
  /**
   * Execute single action (delegate to actionExecutor)
   */
  async executeAction(action, context) {
    // Import dynamically to avoid circular dependency
    const { executeAction } = await import('./actionExecutor');
    return executeAction(action, context);
  }
  
  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      executing: this.executing,
      priorities: this.queue.reduce((acc, item) => {
        acc[item.priority] = (acc[item.priority] || 0) + 1;
        return acc;
      }, {})
    };
  }
  
  /**
   * Clear queue
   */
  clearQueue() {
    this.queue = [];
    console.log('🗑️ Queue cleared');
  }
}

// Global scheduler
export const actionScheduler = new ActionScheduler();

