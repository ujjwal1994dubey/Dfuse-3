/**
 * Visual Context Module
 * Inspired by TLDraw Agent Starter Kit's visual context system
 * Captures canvas screenshots for enhanced AI understanding (optional utility)
 * 
 * This module provides optional visual context capture capabilities
 * that can be used to enhance AI agents with visual understanding.
 */

/**
 * Capture visual context from canvas
 * Provides both structured shape data and optional screenshots
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeScreenshot - Whether to capture visual screenshot
 * @param {boolean} options.includeStructuredData - Whether to include shape data
 * @param {boolean} options.selectedShapesOnly - Only capture selected shapes
 * @returns {Promise<Object>} Visual context with shapes and optional screenshot
 */
export async function captureVisualContext(editor, options = {}) {
  const {
    includeScreenshot = false, // Default to false for performance
    includeStructuredData = true,
    selectedShapesOnly = false
  } = options;
  
  const context = {};
  
  // Structured shape data (always included by default)
  if (includeStructuredData) {
    context.shapes = extractStructuredShapeData(editor, selectedShapesOnly);
    context.shapeCount = context.shapes.length;
  }
  
  // Visual screenshot (optional, for complex visual understanding)
  // Note: This is computationally expensive and increases token usage significantly
  if (includeScreenshot) {
    try {
      const screenshot = await captureCanvasScreenshot(editor);
      context.screenshot = screenshot;
      context.screenshotMetadata = {
        width: screenshot.width,
        height: screenshot.height,
        format: 'png',
        dataUrl: screenshot.dataUrl
      };
      console.log('📸 Visual screenshot captured:', screenshot.width, 'x', screenshot.height);
    } catch (error) {
      console.error('❌ Failed to capture screenshot:', error);
      context.screenshotError = error.message;
    }
  }
  
  return context;
}

/**
 * Capture canvas as PNG screenshot
 * Converts TLDraw SVG to raster image for visual AI processing
 * 
 * @param {Object} editor - TLDraw editor instance
 * @returns {Promise<Object>} Screenshot data with dataUrl, width, height
 */
async function captureCanvasScreenshot(editor) {
  if (!editor) {
    throw new Error('Editor instance required for screenshot capture');
  }
  
  try {
    // Get SVG from TLDraw
    const shapeIds = Array.from(editor.getCurrentPageShapeIds());
    
    if (shapeIds.length === 0) {
      console.warn('⚠️ No shapes on canvas to capture');
      return {
        dataUrl: null,
        width: 0,
        height: 0
      };
    }
    
    const svg = await editor.getSvg(shapeIds, {
      scale: 1,
      background: true
    });
    
    if (!svg) {
      throw new Error('Failed to get SVG from editor');
    }
    
    // Convert SVG to PNG via canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        // Set canvas size to match image
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw image to canvas
        ctx.drawImage(img, 0, 0);
        
        // Cleanup blob URL
        URL.revokeObjectURL(url);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        resolve({
          dataUrl,
          width: canvas.width,
          height: canvas.height
        });
      };
      
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image: ' + error));
      };
      
      img.src = url;
    });
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    throw error;
  }
}

/**
 * Extract structured shape data from editor
 * Returns shape metadata without visual rendering
 * 
 * @param {Object} editor - TLDraw editor instance
 * @param {boolean} selectedOnly - Only extract selected shapes
 * @returns {Array} Array of shape objects with type, bounds, and props
 */
function extractStructuredShapeData(editor, selectedOnly = false) {
  if (!editor) {
    console.warn('⚠️ No editor provided to extractStructuredShapeData');
    return [];
  }
  
  try {
    // Get shapes based on selection preference
    const shapes = selectedOnly 
      ? Array.from(editor.getSelectedShapeIds()).map(id => editor.getShape(id))
      : editor.getCurrentPageShapes();
    
    // Extract relevant shape data
    return shapes.map(shape => {
      const bounds = editor.getShapePageBounds(shape);
      
      return {
        id: shape.id,
        type: shape.type,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.w,
          height: bounds.h,
          centerX: bounds.x + bounds.w / 2,
          centerY: bounds.y + bounds.h / 2
        },
        props: {
          // Include relevant props based on shape type
          color: shape.props.color,
          text: shape.props.text || '',
          geo: shape.props.geo, // For geo shapes (rectangle, ellipse, etc.)
          w: shape.props.w,
          h: shape.props.h
        }
      };
    });
  } catch (error) {
    console.error('❌ Failed to extract shape data:', error);
    return [];
  }
}

/**
 * Get visual context description as text
 * Converts visual context to human-readable description for AI prompts
 * 
 * @param {Object} visualContext - Visual context from captureVisualContext
 * @returns {string} Text description of visual context
 */
export function describeVisualContext(visualContext) {
  if (!visualContext) {
    return 'No visual context available.';
  }
  
  let description = '';
  
  if (visualContext.shapes && visualContext.shapes.length > 0) {
    description += `Canvas contains ${visualContext.shapeCount} shapes:\n`;
    
    // Group by type
    const shapesByType = {};
    visualContext.shapes.forEach(shape => {
      const type = shape.type;
      if (!shapesByType[type]) {
        shapesByType[type] = [];
      }
      shapesByType[type].push(shape);
    });
    
    // Describe each type
    Object.entries(shapesByType).forEach(([type, shapes]) => {
      description += `- ${shapes.length} ${type} shape(s)\n`;
    });
  } else {
    description += 'Canvas is empty.\n';
  }
  
  if (visualContext.screenshot) {
    description += `\nScreenshot: ${visualContext.screenshot.width}x${visualContext.screenshot.height} PNG`;
  }
  
  return description;
}

/**
 * Export visual context as downloadable file
 * Useful for debugging and documentation
 * 
 * @param {Object} visualContext - Visual context object
 * @param {string} filename - Optional filename for download
 */
export function downloadVisualContext(visualContext, filename = null) {
  const timestamp = Date.now();
  const defaultFilename = `visual-context-${timestamp}.json`;
  const downloadFilename = filename || defaultFilename;
  
  try {
    // Create JSON string
    const jsonString = JSON.stringify(visualContext, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
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
    
    console.log('✅ Visual context downloaded:', downloadFilename);
    return true;
  } catch (error) {
    console.error('❌ Failed to download visual context:', error);
    return false;
  }
}

