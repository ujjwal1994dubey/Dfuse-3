import React, { createContext, useContext, useState, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const DatasetContext = createContext(null);

export function DatasetProvider({ children }) {
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [pendingRelationships, setPendingRelationships] = useState([]);
  const [confirmedRelationships, setConfirmedRelationships] = useState([]);

  const updateDataset = useCallback((datasetId, updates) => {
    setDatasets(prev => prev.map(d =>
      d.id === datasetId ? { ...d, ...updates } : d
    ));
  }, []);

  const removeDataset = useCallback(async (datasetIdToRemove) => {
    try {
      await fetch(`${API}/datasets/${datasetIdToRemove}`, { method: 'DELETE' });
      setDatasets(prev => {
        const removedEntry = prev.find(d => d.id === datasetIdToRemove);
        const removedFilename = removedEntry?.filename;
        const remaining = prev.filter(d => {
          if (d.id === datasetIdToRemove) return false;
          if (d.isMerged && removedFilename && d.sourceDatasets?.includes(removedFilename)) return false;
          return true;
        });
        const activeStillPresent = remaining.some(d => d.id === activeDatasetId);
        if (!activeStillPresent) {
          const nonMerged = remaining.filter(d => !d.isMerged);
          setActiveDatasetId(nonMerged.length > 0 ? nonMerged[0].id : (remaining.length > 0 ? remaining[0].id : null));
        }
        return remaining;
      });
    } catch (error) {
      console.error('Failed to remove dataset:', error);
    }
  }, [activeDatasetId]);

  const switchDataset = useCallback((newDatasetId) => {
    setActiveDatasetId(newDatasetId);
  }, []);

  const addDatasets = useCallback((newDatasets) => {
    setDatasets(prev => [...prev, ...newDatasets]);
    if (newDatasets.length > 0 && !activeDatasetId) {
      setActiveDatasetId(newDatasets[0].id);
    }
  }, [activeDatasetId]);

  const setMergedDatasets = useCallback((mergedDatasets) => {
    setDatasets(prev => [
      ...prev.filter(d => !d.isMerged),
      ...mergedDatasets,
    ]);
  }, []);

  return (
    <DatasetContext.Provider value={{
      datasets,
      setDatasets,
      activeDatasetId,
      setActiveDatasetId,
      pendingRelationships,
      setPendingRelationships,
      confirmedRelationships,
      setConfirmedRelationships,
      updateDataset,
      removeDataset,
      switchDataset,
      addDatasets,
      setMergedDatasets,
    }}>
      {children}
    </DatasetContext.Provider>
  );
}

export function useDatasets() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasets must be used within a DatasetProvider');
  return ctx;
}
