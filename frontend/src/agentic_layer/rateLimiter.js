/**
 * Rate Limiter Module
 * Provides intelligent rate limiting for Gemini API with circuit breaker,
 * exponential backoff, and comprehensive metrics tracking
 */

import { RATE_LIMIT_CONFIG, ACTION_WEIGHTS } from './types';

export class RateLimiter {
  constructor() {
    this.requestsThisMinute = 0;
    this.requestsToday = 0;
    this.maxRPM = 12; // Conservative (free tier: 15)
    this.maxDaily = 1400; // Buffer below 1500
    
    this.circuitBreakerOpen = false;
    this.circuitBreakerErrors = 0;
    
    this.currentBackoffDelay = 0;
    this.lastSuccessTime = Date.now();
    this.consecutiveSuccesses = 0;
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitErrors: 0,
      averageDelay: 0,
      delayHistory: []
    };
    
    // Reset minute counter
    this.minuteResetInterval = setInterval(() => {
      console.log(`📊 RPM Reset: ${this.requestsThisMinute} requests in last minute`);
      this.requestsThisMinute = 0;
    }, 60000);
    
    // Reset daily counter at midnight PT
    this.scheduleDailyReset();
  }
  
  /**
   * Clean up intervals when rate limiter is destroyed
   */
  destroy() {
    if (this.minuteResetInterval) {
      clearInterval(this.minuteResetInterval);
    }
    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
    }
  }
  
  /**
   * Get appropriate delay for an action based on weight and backoff
   */
  getDelayForAction(actionType) {
    const weight = ACTION_WEIGHTS[actionType] || 'medium';
    
    // Local actions need no delay
    if (weight === 'local') return 0;
    
    // Base delay from weight
    let baseDelay;
    switch (weight) {
      case 'light':
        baseDelay = RATE_LIMIT_CONFIG.LIGHT_ACTION_DELAY;
        break;
      case 'heavy':
        baseDelay = RATE_LIMIT_CONFIG.HEAVY_ACTION_DELAY;
        break;
      default:
        baseDelay = RATE_LIMIT_CONFIG.MEDIUM_ACTION_DELAY;
    }
    
    // Apply exponential backoff if active
    const totalDelay = baseDelay + this.currentBackoffDelay;
    
    // Add jitter if enabled
    if (RATE_LIMIT_CONFIG.ENABLE_JITTER) {
      const jitter = Math.random() * RATE_LIMIT_CONFIG.JITTER_MAX;
      return totalDelay + jitter;
    }
    
    return totalDelay;
  }
  
  /**
   * Wait with intelligent delay before API call
   */
  async waitBeforeRequest(actionType) {
    const delay = this.getDelayForAction(actionType);
    
    if (delay > 0) {
      console.log(`⏱️ Rate limit delay: ${(delay / 1000).toFixed(1)}s for ${actionType}`);
      this.metrics.delayHistory.push(delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  /**
   * Execute API request with rate limiting
   */
  async executeWithRateLimit(actionType, requestFn) {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      throw new Error('Circuit breaker open. API calls temporarily paused. Try again in 60 seconds.');
    }
    
    // Check daily limit
    if (this.requestsToday >= this.maxDaily) {
      throw new Error(`Daily API limit reached (${this.maxDaily}). Resets at midnight Pacific Time.`);
    }
    
    // Check RPM limit
    if (this.requestsThisMinute >= this.maxRPM) {
      console.log(`⚠️ RPM limit reached (${this.maxRPM}), waiting for next minute...`);
      await this.waitForNextMinute();
    }
    
    // Apply rate limit delay
    await this.waitBeforeRequest(actionType);
    
    // Execute request
    this.requestsThisMinute++;
    this.requestsToday++;
    this.metrics.totalRequests++;
    
    try {
      const result = await requestFn();
      
      // Success - reset backoff gradually
      this.onSuccess();
      this.metrics.successfulRequests++;
      
      return result;
      
    } catch (error) {
      // Handle rate limit errors
      if (error.status === 429 || error.message?.includes('rate limit')) {
        this.onRateLimitError();
      }
      
      throw error;
    }
  }
  
  /**
   * Handle successful API call
   */
  onSuccess() {
    this.consecutiveSuccesses++;
    this.lastSuccessTime = Date.now();
    this.circuitBreakerErrors = 0;
    
    // Reset backoff after sustained success
    if (RATE_LIMIT_CONFIG.ENABLE_BACKOFF) {
      const timeSinceLastSuccess = Date.now() - this.lastSuccessTime;
      
      if (timeSinceLastSuccess < RATE_LIMIT_CONFIG.BACKOFF_RESET_AFTER) {
        if (this.consecutiveSuccesses >= 5 && this.currentBackoffDelay > 0) {
          this.currentBackoffDelay = Math.max(0, this.currentBackoffDelay / 2);
          console.log(`✅ Backoff reduced to ${this.currentBackoffDelay}ms after ${this.consecutiveSuccesses} successes`);
        }
      }
    }
  }
  
  /**
   * Handle rate limit error
   */
  onRateLimitError() {
    this.circuitBreakerErrors++;
    this.consecutiveSuccesses = 0;
    
    if (RATE_LIMIT_CONFIG.ENABLE_BACKOFF) {
      const oldDelay = this.currentBackoffDelay;
      this.currentBackoffDelay = Math.min(
        (this.currentBackoffDelay || 1000) * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER,
        RATE_LIMIT_CONFIG.BACKOFF_MAX
      );
      
      console.warn(`⚠️ Rate limit hit! Backoff increased: ${oldDelay}ms → ${this.currentBackoffDelay}ms`);
    }
    
    this.metrics.rateLimitErrors++;
    
    // Open circuit breaker if too many errors
    if (this.circuitBreakerErrors >= RATE_LIMIT_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
      this.openCircuitBreaker();
    }
  }
  
  /**
   * Open circuit breaker
   */
  openCircuitBreaker() {
    console.error('🚫 Circuit breaker OPENED - Pausing all API calls');
    this.circuitBreakerOpen = true;
    
    setTimeout(() => {
      this.closeCircuitBreaker();
    }, RATE_LIMIT_CONFIG.CIRCUIT_BREAKER_TIMEOUT);
  }
  
  /**
   * Close circuit breaker
   */
  closeCircuitBreaker() {
    console.log('✅ Circuit breaker CLOSED - Resuming API calls');
    this.circuitBreakerOpen = false;
    this.circuitBreakerErrors = 0;
    this.currentBackoffDelay = 0;
  }
  
  /**
   * Wait until next minute
   */
  async waitForNextMinute() {
    const secondsToWait = 60 - (new Date().getSeconds());
    console.log(`⏳ Waiting ${secondsToWait}s for RPM reset...`);
    await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
    this.requestsThisMinute = 0;
  }
  
  /**
   * Schedule daily reset at midnight PT
   */
  scheduleDailyReset() {
    const checkReset = () => {
      const now = new Date();
      const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      
      if (pt.getHours() === 0 && pt.getMinutes() === 0) {
        console.log('🔄 Daily quota RESET');
        this.requestsToday = 0;
      }
    };
    
    this.dailyResetInterval = setInterval(checkReset, 60000); // Check every minute
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      rpm: `${this.requestsThisMinute}/${this.maxRPM}`,
      daily: `${this.requestsToday}/${this.maxDaily}`,
      dailyRemaining: this.maxDaily - this.requestsToday,
      successRate: this.metrics.totalRequests > 0 
        ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(1) + '%'
        : '0%',
      rateLimitErrors: this.metrics.rateLimitErrors,
      currentBackoff: this.currentBackoffDelay,
      circuitBreakerOpen: this.circuitBreakerOpen,
      averageDelay: this.metrics.delayHistory.length > 0 
        ? (this.metrics.delayHistory.reduce((a, b) => a + b, 0) / this.metrics.delayHistory.length / 1000).toFixed(1) + 's'
        : '0s'
    };
  }
}

// Global singleton
export const rateLimiter = new RateLimiter();

