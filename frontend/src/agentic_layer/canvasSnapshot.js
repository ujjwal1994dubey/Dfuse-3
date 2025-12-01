/**
 * Canvas Snapshot Module
 * Extracts current canvas state into structured JSON for agent context
 * Also provides export/import functionality for saving and restoring dashboards
 */

/**
 * Get complete canvas snapshot including all shapes and metadata
 * @param {Object} editor - TLDraw editor instance
 * @param {Array} nodes - Current canvas nodes
 * @returns {Object} Structured canvas state
 */
export function getCanvasSnapshot(editor, nodes) {
  return {
    charts: extractCharts(nodes),
    tables: extractTables(nodes),
    textBoxes: extractTextBoxes(nodes),
    metadata: {
      nodeCount: nodes.length,
      chartTypes: getUniqueChartTypes(nodes),
      hasData: nodes.length > 0
    }
  };
}

/**
 * Export entire canvas state as JSON snapshot
 * Uses TLDraw's native serialization for complete state capture
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {Array} nodes - Current canvas nodes (for metadata)
 * @param {Object} metadata - Optional additional metadata to include
 * @returns {Object} Complete snapshot including state and metadata
 */
export function exportCanvasStateAsJSON(editor, nodes, metadata = {}) {
  if (!editor) {
    console.error('Editor instance not available');
    alert('Cannot export: Editor not initialized');
    return null;
  }

  try {
    // Get complete TLDraw state
    // In TLDraw v2, store.serialize() returns a record map, not a structured object
    // We need to use getStoreSnapshot() or build the structure manually
    
    console.log('🔧 Starting serialization...');
    
    // Get all records from the store
    const allRecords = editor.store.allRecords();
    console.log('📦 All records:', allRecords.length);
    
    // Get the schema
    const schema = editor.store.schema;
    console.log('📐 Schema:', {
      hasSchema: !!schema,
      schemaVersion: schema?.schemaVersion,
      hasSerialize: typeof schema?.serialize === 'function'
    });
    
    // Build the canvas state in TLDraw snapshot format
    // Format: { schema: {...}, records: [...] }
    const canvasState = {
      schema: schema.serialize ? schema.serialize() : {
        schemaVersion: schema.schemaVersion || 2,
        sequences: schema.sequences || {}
      },
      records: allRecords
    };
    
    console.log('📸 Canvas state built:', {
      hasSchema: !!canvasState.schema,
      hasRecords: !!canvasState.records,
      recordCount: canvasState.records.length,
      schemaVersion: canvasState.schema.schemaVersion,
      recordTypes: [...new Set(canvasState.records.map(r => r.typeName))]
    });
    
    // Build rich metadata
    const snapshot = {
      // Version info for future compatibility
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      
      // TLDraw state (complete canvas)
      canvasState: canvasState,
      
      // Enhanced metadata
      metadata: {
        // Shape statistics
        totalShapes: nodes.length,
        chartCount: nodes.filter(n => n.type === 'chart').length,
        tableCount: nodes.filter(n => n.type === 'table').length,
        textBoxCount: nodes.filter(n => n.type === 'textbox').length,
        
        // Chart details
        charts: nodes
          .filter(n => n.type === 'chart')
          .map(n => ({
            id: n.id,
            title: n.data.title || 'Untitled',
            type: n.data.chartType || 'bar',
            dimensions: n.data.dimensions || [],
            measures: n.data.measures || []
          })),
        
        // Dataset info (if available)
        datasetId: nodes[0]?.data?.datasetId || null,
        
        // User-provided metadata
        ...metadata
      }
    };
    
    console.log('✅ Canvas state serialized successfully:', {
      shapes: snapshot.metadata.totalShapes,
      charts: snapshot.metadata.chartCount,
      recordCount: snapshot.canvasState.records.length,
      schemaVersion: snapshot.canvasState.schema.schemaVersion
    });
    
    return snapshot;
    
  } catch (error) {
    console.error('Failed to serialize canvas state:', error);
    alert(`Failed to export canvas: ${error.message}`);
    return null;
  }
}

/**
 * Download canvas state as JSON file
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {Array} nodes - Current canvas nodes
 * @param {string} filename - Optional custom filename
 */
export function downloadCanvasStateAsJSON(editor, nodes, filename = null) {
  const snapshot = exportCanvasStateAsJSON(editor, nodes);
  
  if (!snapshot) {
    return false;
  }
  
  try {
    // Convert to formatted JSON string
    const jsonString = JSON.stringify(snapshot, null, 2);
    
    // Create blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Generate filename
    const defaultFilename = `dashboard-${snapshot.timestamp}.json`;
    const downloadFilename = filename || defaultFilename;
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    URL.revokeObjectURL(url);
    
    console.log('✅ Canvas state downloaded:', downloadFilename);
    alert(`Dashboard saved as ${downloadFilename}`);
    
    return true;
    
  } catch (error) {
    console.error('Failed to download canvas state:', error);
    alert(`Failed to download: ${error.message}`);
    return false;
  }
}

/**
 * Load canvas state from JSON snapshot
 * Restores the entire canvas to a previously saved state
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {Object} snapshot - Previously exported snapshot object
 * @returns {boolean} Success status
 */
export function loadCanvasStateFromJSON(editor, snapshot) {
  if (!editor) {
    console.error('Editor instance not available');
    alert('Cannot load: Editor not initialized');
    return false;
  }
  
  if (!snapshot) {
    console.error('Snapshot is null or undefined');
    alert('Invalid snapshot file. Please select a valid dashboard JSON file.');
    return false;
  }
  
  console.log('📦 Received snapshot object:', {
    hasVersion: !!snapshot.version,
    hasCanvasState: !!snapshot.canvasState,
    hasMetadata: !!snapshot.metadata,
    topLevelKeys: Object.keys(snapshot),
    canvasStateKeys: snapshot.canvasState ? Object.keys(snapshot.canvasState) : 'N/A'
  });
  
  if (!snapshot.canvasState) {
    console.error('Snapshot missing canvasState property');
    alert('Invalid snapshot file. Missing canvasState property. Please select a valid dashboard JSON file.');
    return false;
  }
  
  try {
    // Check version compatibility (optional)
    if (snapshot.version && snapshot.version !== '1.0.0') {
      console.warn('Snapshot version mismatch, attempting to load anyway');
    }
    
    console.log('📥 Loading snapshot:', {
      version: snapshot.version,
      hasCanvasState: !!snapshot.canvasState,
      hasSchema: !!snapshot.canvasState?.schema,
      hasRecords: !!snapshot.canvasState?.records,
      recordCount: snapshot.canvasState?.records?.length || 0
    });
    
    // Validate the canvas state has required TLDraw structure
    if (!snapshot.canvasState.schema || !snapshot.canvasState.records) {
      console.error('Invalid canvas state structure:', {
        hasSchema: !!snapshot.canvasState?.schema,
        hasRecords: !!snapshot.canvasState?.records,
        canvasStateKeys: Object.keys(snapshot.canvasState || {})
      });
      alert('Invalid snapshot structure. Missing schema or records.');
      return false;
    }
    
    console.log('🔄 Preparing to load snapshot:', {
      recordCount: snapshot.canvasState.records.length,
      schemaVersion: snapshot.canvasState.schema.schemaVersion,
      recordTypes: [...new Set(snapshot.canvasState.records.map(r => r.typeName))]
    });
    
    // TLDraw v2.4+ recommended approach: Use editor methods, not store directly
    console.log('🔄 Loading canvas state...');
    
    try {
      // Method: Delete all existing shapes, then create shapes from snapshot
      
      // Get all current shape IDs (not document/page - just shapes)
      const currentShapeIds = Array.from(editor.getCurrentPageShapeIds());
      console.log('🧹 Deleting', currentShapeIds.length, 'existing shapes');
      
      // Delete all existing shapes
      if (currentShapeIds.length > 0) {
        editor.deleteShapes(currentShapeIds);
      }
      
      // Filter only shape records from snapshot (exclude document, page, etc.)
      const shapeRecords = snapshot.canvasState.records.filter(r => 
        r.typeName === 'shape' || r.id.startsWith('shape:')
      );
      
      console.log('➕ Creating', shapeRecords.length, 'shapes from snapshot');
      
      // Create shapes using editor.createShapes (safer than store.put)
      if (shapeRecords.length > 0) {
        editor.createShapes(shapeRecords);
      }
      
      console.log('✅ Shapes loaded successfully');
      
    } catch (loadError) {
      console.error('Failed to load records:', loadError);
      console.error('Error stack:', loadError.stack);
      throw new Error(`Failed to restore canvas: ${loadError.message}`);
    }
    
    console.log('✅ Canvas state restored:', {
      charts: snapshot.metadata?.chartCount,
      timestamp: snapshot.exportedAt,
      records: snapshot.canvasState.records?.length || 0
    });
    
    alert(`Dashboard restored successfully!\nCharts: ${snapshot.metadata?.chartCount || 0}\nExported: ${new Date(snapshot.exportedAt).toLocaleString()}`);
    return true;
    
  } catch (error) {
    console.error('Failed to load canvas state:', error);
    console.error('Error details:', error.stack);
    alert(`Failed to restore dashboard: ${error.message}\n\nPlease make sure this is a valid dashboard JSON file exported from this application.`);
    return false;
  }
}

/**
 * Extract chart nodes with relevant data
 */
function extractCharts(nodes) {
  return nodes
    .filter(n => n.type === 'chart')
    .map(n => {
      const existingInsight = findAssociatedInsight(n.id, nodes);
      
      return {
        id: n.id,
        dimensions: n.data.dimensions || [],
        measures: n.data.measures || [],
        chartType: n.data.chartType || 'bar',
        title: n.data.title || '',
        position: n.position || { x: 0, y: 0 },
        
        // Token-efficient context
        existingInsight: existingInsight, // Reuse insights (zero token cost!)
        dataSummary: !existingInsight && n.data.table ? extractStatisticalSummary(n.data.table) : null,
        
        // Provenance metadata
        createdBy: n.data.createdBy || 'user',
        createdByQuery: n.data.createdByQuery || null,
        creationReasoning: n.data.creationReasoning || null
      };
    });
}

/**
 * Extract table nodes
 */
function extractTables(nodes) {
  return nodes
    .filter(n => n.type === 'table')
    .map(n => ({
      id: n.id,
      title: n.data.title || '',
      headers: n.data.headers || [],
      rowCount: n.data.totalRows || 0,
      position: n.position || { x: 0, y: 0 }
    }));
}

/**
 * Extract text box nodes (insights)
 */
function extractTextBoxes(nodes) {
  return nodes
    .filter(n => n.type === 'textbox')
    .map(n => ({
      id: n.id,
      text: n.data.text || '',
      position: n.position || { x: 0, y: 0 },
      relatedChartId: n.data.relatedChartId || null // Semantic link to chart
    }));
}

/**
 * Get list of unique chart types on canvas
 */
function getUniqueChartTypes(nodes) {
  const chartTypes = nodes
    .filter(n => n.type === 'chart' && n.data.chartType)
    .map(n => n.data.chartType);
  
  return [...new Set(chartTypes)];
}

/**
 * Find insight textbox linked to chart via metadata
 * Uses semantic relationships (relatedChartId) not spatial proximity
 */
function findAssociatedInsight(chartId, nodes) {
  const textboxes = nodes.filter(n => n.type === 'textbox');
  
  // Check for explicit semantic relationship (set when insight created)
  const linkedInsight = textboxes.find(t => 
    t.data.relatedChartId === chartId
  );
  
  return linkedInsight ? linkedInsight.data.text : null;
}

/**
 * Extract statistical summary from chart data table
 * Provides min/max/avg for numeric columns - compact and informative
 */
function extractStatisticalSummary(table) {
  if (!table || table.length === 0) return null;
  
  const summary = [];
  
  // Get columns
  const columns = Object.keys(table[0] || {});
  
  // Count
  summary.push(`Count: ${table.length} items`);
  
  // For each numeric column, calculate min/max/avg
  columns.forEach(col => {
    const values = table.map(row => row[col]).filter(v => typeof v === 'number');
    
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      
      summary.push(
        `${col}: min=${min.toLocaleString()}, max=${max.toLocaleString()}, avg=${Math.round(avg).toLocaleString()}`
      );
    }
  });
  
  return summary.join(' | ');
}


// =============================================================================
// GitHub Gist API - Dashboard Sharing Functions
// =============================================================================

/**
 * Share canvas state via GitHub Gist (backend-hosted)
 * Creates a shareable link that can be used to load the dashboard
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {Array} nodes - Array of chart/shape nodes
 * @param {Object} options - Share options
 * @param {number} options.expiresIn - Days until expiration (default: 7)
 * @param {string} options.title - Dashboard title
 * @returns {Promise<Object>} Share result with URL
 */
export async function shareCanvasViaGist(editor, nodes, options = {}) {
  if (!editor) {
    console.error('❌ Editor instance not available');
    alert('Cannot share: Editor not initialized');
    return null;
  }

  try {
    console.log('🔄 Preparing dashboard for sharing...');
    
    // Export canvas state
    const snapshot = exportCanvasStateAsJSON(editor, nodes, {
      title: options.title || 'Shared Dashboard',
      sharedBy: 'DFuse User',
      sharedAt: new Date().toISOString()
    });

    if (!snapshot) {
      throw new Error('Failed to export canvas state');
    }

    console.log('📤 Uploading to GitHub Gist...');
    
    // Get backend API URL
    const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    
    // Send to backend
    const response = await fetch(`${API}/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        canvasState: snapshot.canvasState,
        metadata: snapshot.metadata,
        expiresIn: options.expiresIn || 7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create shareable link');
    }

    const result = await response.json();
    
    console.log('✅ Dashboard shared successfully!');
    console.log(`   Share URL: ${result.share_url}`);
    console.log(`   Gist ID: ${result.snapshot_id}`);
    console.log(`   Expires: ${new Date(result.expires_at).toLocaleString()}`);
    
    return result;

  } catch (error) {
    console.error('❌ Failed to share dashboard:', error);
    throw error;
  }
}


/**
 * Load shared canvas state from GitHub Gist
 * Used when opening a shared dashboard link
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {string} snapshotId - Gist ID from URL parameter
 * @returns {Promise<boolean>} Success status
 */
export async function loadSharedCanvasState(editor, snapshotId) {
  if (!editor) {
    console.error('❌ Editor instance not available');
    alert('Cannot load: Editor not initialized');
    return false;
  }

  if (!snapshotId) {
    console.error('❌ No snapshot ID provided');
    return false;
  }

  try {
    console.log(`🔄 Loading shared dashboard: ${snapshotId}`);
    
    // Get backend API URL
    const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    
    // Fetch from backend
    const response = await fetch(`${API}/snapshots/${snapshotId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Shared dashboard not found. The link may have expired or is invalid.');
      }
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load shared dashboard');
    }

    const data = await response.json();
    
    console.log('📥 Snapshot retrieved successfully');
    console.log(`   Charts: ${data.metadata?.chartCount || 0}`);
    console.log(`   Created: ${new Date(data.created_at).toLocaleString()}`);
    
    // Reconstruct the snapshot format expected by loadCanvasStateFromJSON
    const snapshot = {
      canvasState: data.canvasState,
      metadata: data.metadata,
      exportedAt: data.created_at
    };
    
    // Load into canvas
    const success = loadCanvasStateFromJSON(editor, snapshot);
    
    if (success) {
      console.log('✅ Shared dashboard loaded successfully!');
      
      // Show success message
      const chartCount = data.metadata?.chartCount || 0;
      const createdAt = new Date(data.created_at).toLocaleString();
      alert(
        `📊 Shared Dashboard Loaded!\n\n` +
        `Charts: ${chartCount}\n` +
        `Created: ${createdAt}\n\n` +
        `This dashboard was shared with you.`
      );
    }
    
    return success;

  } catch (error) {
    console.error('❌ Failed to load shared dashboard:', error);
    alert(`Failed to load shared dashboard:\n${error.message}`);
    return false;
  }
}

