import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText } from 'lucide-react';
import { useDatasets } from '../contexts/DatasetContext';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import DataWorkflowPanel from '../components/ui/DataWorkflowPanel';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function SchemaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    datasets,
    setDatasets,
    setActiveDatasetId,
    pendingRelationships,
    setPendingRelationships,
    confirmedRelationships,
    setConfirmedRelationships,
  } = useDatasets();
  const { apiKey, selectedModel, updateTokenUsage } = useConfig();

  // Local workflow state (no longer needs to live in AppWrapper)
  const [workflowStep, setWorkflowStep] = useState(1);
  const [fileQuality, setFileQuality] = useState({});
  const [analysisResults, setAnalysisResults] = useState({});
  const [joinPreview, setJoinPreview] = useState(null);
  const [toast, setToast] = useState(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const nonMergedDatasets = datasets.filter(d => !d.isMerged);
  const hasEnoughFiles = nonMergedDatasets.length >= 2;

  const uploadFiles = useCallback(async (files) => {
    setUploading(true);
    setUploadError(null);
    const uploaded = [];
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
        const data = await res.json();
        uploaded.push({
          id: data.dataset_id,
          filename: data.filename,
          rows: data.rows,
          dimensions: data.dimensions,
          measures: data.measures,
          uploadedAt: new Date().toISOString(),
        });
      }
      setDatasets(prev => [...prev.filter(d => !d.isMerged), ...uploaded]);
      if (uploaded.length > 0 && !datasets.find(d => !d.isMerged)) {
        setActiveDatasetId(uploaded[0].id);
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }, [datasets, setDatasets, setActiveDatasetId]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    uploadFiles(files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.csv') || f.name.endsWith('.xlsx')
    );
    if (files.length > 0) uploadFiles(files);
  };

  const handleMergedDatasetCreated = useCallback(async (_mergedDatasets, acceptedRelationships) => {
    // Save schema metadata — use acceptedRelationships passed directly from the workflow
    // (not confirmedRelationships from context, which may be stale due to React closure timing)
    if (user?.id) {
      try {
        const schemaName = nonMergedDatasets.map(d => d.filename?.replace(/\.csv$/i, '')).join(' + ') || 'Untitled Schema';
        const totalRecords = nonMergedDatasets.reduce((sum, d) => sum + (d.rows || 0), 0);
        const res = await fetch(`${API}/schemas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            name: schemaName,
            file_count: nonMergedDatasets.length,
            record_count: totalRecords,
            relationships: acceptedRelationships || confirmedRelationships,
            merged_dataset_id: null,
          }),
        });
        if (!res.ok) {
          const detail = await res.text();
          console.error('Schema save failed:', detail);
          showToast('Schema confirmed but could not be saved to library.', 'error');
        } else {
          showToast('Schema saved to Data Library', 'success');
        }
      } catch (err) {
        console.error('Failed to save schema metadata:', err);
        showToast('Schema confirmed but could not be saved to library.', 'error');
      }
    }

    navigate('/library');
  }, [user?.id, nonMergedDatasets, confirmedRelationships, navigate, showToast]);

  const handleClose = () => navigate('/library');

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Page header with back button */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}
      >
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1 text-sm"
        >
          ← Back
        </button>
        <div
          className="w-px h-4 mx-1"
          style={{ backgroundColor: '#E5E7EB' }}
        />
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
            {nonMergedDatasets.length > 0
              ? nonMergedDatasets.map(d => d.filename).join(' + ')
              : 'Untitled Schema'}
          </h1>
          <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Multi-File Data Workflow</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm shadow-lg"
          style={{
            backgroundColor: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            color: toast.type === 'error' ? '#DC2626' : '#16A34A',
            border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#86EFAC'}`,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Upload area (shown before enough files are uploaded) */}
      {!hasEnoughFiles ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div
            className="w-full max-w-lg rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 p-12 transition-colors cursor-pointer"
            style={{ borderColor: '#D1D5DB', backgroundColor: '#FFFFFF' }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#EFF6FF' }}
            >
              <Upload size={24} style={{ color: '#2563EB' }} />
            </div>
            <div className="text-center">
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>
                Upload your CSV files
              </p>
              <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '4px' }}>
                Upload 2 or more CSV files to detect relationships and build a schema
              </p>
            </div>

            {nonMergedDatasets.length === 1 && (
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-lg w-full"
                style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}
              >
                <FileText size={14} style={{ color: '#16A34A' }} />
                <span style={{ fontSize: '13px', color: '#16A34A' }}>
                  {nonMergedDatasets[0].filename} uploaded — add one more to continue
                </span>
              </div>
            )}

            {uploading && (
              <p style={{ fontSize: '13px', color: '#6B7280' }}>
                Uploading...
              </p>
            )}
            {uploadError && (
              <p style={{ fontSize: '13px', color: '#DC2626' }}>{uploadError}</p>
            )}

            <button
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#2563EB' }}
            >
              {uploading ? 'Uploading...' : 'Select Files'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      ) : (
        /* Workflow panel as embedded page */
        <div className="flex-1 min-h-0">
          <DataWorkflowPanel
            variant="page"
            datasets={datasets}
            workflowStep={workflowStep}
            setWorkflowStep={setWorkflowStep}
            fileQuality={fileQuality}
            setFileQuality={setFileQuality}
            analysisResults={analysisResults}
            setAnalysisResults={setAnalysisResults}
            joinPreview={joinPreview}
            setJoinPreview={setJoinPreview}
            pendingRelationships={pendingRelationships}
            setPendingRelationships={setPendingRelationships}
            confirmedRelationships={confirmedRelationships}
            setConfirmedRelationships={setConfirmedRelationships}
            apiKey={apiKey}
            selectedModel={selectedModel}
            updateTokenUsage={updateTokenUsage}
            onMergedDatasetCreated={handleMergedDatasetCreated}
            onClose={handleClose}
            setActiveDatasetId={setActiveDatasetId}
            showToast={showToast}
          />
        </div>
      )}
    </div>
  );
}
