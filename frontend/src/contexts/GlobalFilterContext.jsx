import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Global Filter Context
 * Manages canvas-wide click-through filters for coordinated chart filtering
 * 
 * When a user clicks a bar/segment in one chart, all charts with matching
 * dimensions automatically filter to that value (Tableau-style faceting)
 */

const GlobalFilterContext = createContext(null);

/**
 * Global Filter Provider Component
 * Wraps the application to provide global filter state to all charts
 */
export function GlobalFilterProvider({ children }) {
  // Active filter state - supports multiple values per dimension
  const [globalFilter, setGlobalFilterState] = useState({
    activeDimension: null,  // e.g., "Product"
    activeValues: [],       // e.g., ["Laptop", "Phone", "Tablet"] - array for multi-select
    sourceChartId: null     // ID of the chart that triggered the filter
  });

  /**
   * Set a new global filter (supports multiple values)
   * Replaces any existing filter
   * 
   * @param {string} dimension - The dimension name (e.g., "Product")
   * @param {Array|any} values - Single value or array of values (e.g., ["Laptop", "Phone"])
   * @param {string} chartId - ID of the source chart
   */
  const setGlobalFilter = useCallback((dimension, values, chartId) => {
    // Normalize to array
    const valueArray = Array.isArray(values) ? values : [values];
    
    console.log('🔍 Setting global filter:', { dimension, values: valueArray, chartId });
    
    // If clicking the same filter again, clear it (toggle behavior)
    if (globalFilter.activeDimension === dimension && 
        JSON.stringify(globalFilter.activeValues) === JSON.stringify(valueArray) &&
        globalFilter.sourceChartId === chartId) {
      console.log('🔄 Toggling filter off (same values clicked)');
      setGlobalFilterState({
        activeDimension: null,
        activeValues: [],
        sourceChartId: null
      });
      return;
    }
    
    // Set new filter
    setGlobalFilterState({
      activeDimension: dimension,
      activeValues: valueArray,
      sourceChartId: chartId
    });
  }, [globalFilter.activeDimension, globalFilter.activeValues, globalFilter.sourceChartId]);

  /**
   * Clear the global filter
   * Returns all charts to unfiltered state
   */
  const clearGlobalFilter = useCallback(() => {
    console.log('🧹 Clearing global filter');
    setGlobalFilterState({
      activeDimension: null,
      activeValues: [],
      sourceChartId: null
    });
  }, []);

  /**
   * Check if a filter is currently active
   */
  const isFilterActive = useCallback(() => {
    return globalFilter.activeDimension !== null && globalFilter.activeValues.length > 0;
  }, [globalFilter.activeDimension, globalFilter.activeValues]);

  /**
   * Check if a specific chart should be filtered based on its dimensions
   * 
   * UNIVERSAL FILTERING: Apply filter to ALL charts regardless of their dimensions
   * This matches Tableau/Power BI behavior where filters affect the underlying data
   * for all visualizations, not just those that display the filtered dimension.
   * 
   * Example: Filtering Product = "Bookshelf" will:
   * - Filter "Revenue by Product" chart to show only Bookshelf
   * - Filter "Cost by Quarter" chart to show quarters, but only Bookshelf's data
   * 
   * @param {Array<string>} chartDimensions - Dimensions of the chart (not used for universal filtering)
   * @returns {boolean} True if a global filter is active
   */
  const shouldChartApplyFilter = useCallback((chartDimensions) => {
    // Apply filter universally to all charts
    // Backend handles filtering the underlying data before aggregation
    // Supports both single and multiple dimension values
    return isFilterActive();
  }, [isFilterActive]);

  /**
   * Get filter object in format expected by backend API
   * Returns: { [dimension]: [value1, value2, ...] }
   */
  const getFilterForAPI = useCallback(() => {
    if (!isFilterActive()) return {};
    
    return {
      [globalFilter.activeDimension]: globalFilter.activeValues
    };
  }, [globalFilter.activeDimension, globalFilter.activeValues, isFilterActive]);

  const value = {
    // State
    globalFilter,
    
    // Actions
    setGlobalFilter,
    clearGlobalFilter,
    
    // Helpers
    isFilterActive,
    shouldChartApplyFilter,
    getFilterForAPI
  };

  return (
    <GlobalFilterContext.Provider value={value}>
      {children}
    </GlobalFilterContext.Provider>
  );
}

/**
 * Hook to access global filter context
 * Must be used within a GlobalFilterProvider
 */
export function useGlobalFilter() {
  const context = useContext(GlobalFilterContext);
  
  if (!context) {
    throw new Error('useGlobalFilter must be used within a GlobalFilterProvider');
  }
  
  return context;
}

