import React from 'react';
import { Database, X, Check } from 'lucide-react';

/**
 * DatasetSelector Component
 * Displays a list of uploaded datasets with selection and removal capabilities.
 * 
 * @param {Array} datasets - Array of dataset objects {id, filename, dimensions, measures, rows, analysis, uploadedAt}
 * @param {string} activeDatasetId - Currently active dataset ID
 * @param {function} onSelect - Callback when a dataset is selected
 * @param {function} onRemove - Callback when a dataset is removed
 */
export function DatasetSelector({ datasets, activeDatasetId, onSelect, onRemove }) {
  if (!datasets || datasets.length === 0) {
    return (
      <div className="dataset-selector p-3 text-center text-gray-400 text-sm">
        <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No datasets uploaded</p>
        <p className="text-xs mt-1">Upload a CSV or XLSX file to get started</p>
      </div>
    );
  }

  return (
    <div className="dataset-selector">
      <div className="dataset-header flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Datasets
          </span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
          {datasets.length}
        </span>
      </div>
      
      <div className="dataset-list p-2 space-y-1 max-h-[200px] overflow-y-auto">
        {datasets.map(dataset => {
          const isActive = dataset.id === activeDatasetId;
          const hasAnalysis = !!dataset.analysis;
          
          return (
            <div 
              key={dataset.id}
              className={`
                dataset-item group flex items-center justify-between p-2 rounded-md cursor-pointer
                transition-all duration-150 ease-in-out
                ${isActive 
                  ? 'bg-blue-50 border border-blue-200 shadow-sm' 
                  : 'bg-gray-50 border border-transparent hover:bg-gray-100 hover:border-gray-200'
                }
              `}
              onClick={() => onSelect(dataset.id)}
              title={`${dataset.filename}\n${dataset.rows?.toLocaleString() || '?'} rows\n${dataset.dimensions?.length || 0} dimensions, ${dataset.measures?.length || 0} measures`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Active indicator */}
                <div className={`
                  w-2 h-2 rounded-full flex-shrink-0
                  ${isActive ? 'bg-blue-500' : 'bg-gray-300'}
                `} />
                
                <div className="min-w-0 flex-1">
                  {/* Filename */}
                  <div className={`
                    text-sm font-medium truncate
                    ${isActive ? 'text-blue-700' : 'text-gray-700'}
                  `}>
                    {dataset.filename}
                  </div>
                  
                  {/* Stats row */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{dataset.rows?.toLocaleString() || '?'} rows</span>
                    <span>•</span>
                    <span>{dataset.dimensions?.length || 0}D / {dataset.measures?.length || 0}M</span>
                    {hasAnalysis && (
                      <>
                        <span>•</span>
                        <Check className="w-3 h-3 text-green-500" title="Analyzed" />
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Remove button - only visible on hover */}
              <button 
                className={`
                  p-1 rounded transition-opacity duration-150
                  ${isActive 
                    ? 'opacity-100 text-blue-400 hover:text-red-500 hover:bg-blue-100' 
                    : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-gray-200'
                  }
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove "${dataset.filename}" from the workspace?`)) {
                    onRemove(dataset.id);
                  }
                }}
                title="Remove dataset"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DatasetSelector;

