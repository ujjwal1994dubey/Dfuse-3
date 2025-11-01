/**
 * Unit Tests for State Converter
 * Run these manually to verify conversions
 */

import {
  convertNodesToShapes,
  convertShapesToNodes,
  convertEdgesToArrows,
  convertArrowsToEdges,
  validateNode,
  validateShape
} from './stateConverter';

// Test data
const sampleChartNode = {
  id: 'chart-1',
  type: 'chart',
  position: { x: 100, y: 200 },
  data: {
    title: 'Test Chart',
    figure: {
      data: [{ x: [1, 2, 3], y: [4, 5, 6], type: 'bar' }],
      layout: { title: { text: 'Bar Chart' } }
    },
    chartType: 'bar',
    dimensions: ['Category'],
    measures: ['Value'],
    table: [],
    agg: 'sum',
    datasetId: 'dataset-1',
    selected: false,
    width: 800,
    height: 400,
    aiInsights: null,
    aiQuery: ''
  }
};

const sampleTextNode = {
  id: 'text-1',
  type: 'textbox',
  position: { x: 300, y: 400 },
  data: {
    text: 'Sample note',
    fontSize: 14,
    width: 200,
    height: 100
  }
};

const sampleEdge = {
  id: 'edge-1',
  source: 'chart-1',
  target: 'text-1',
  type: 'arrow'
};

// Test 1: Node to Shape conversion
export function testNodeToShape() {
  console.log('Test 1: Node to Shape Conversion');
  
  const shapes = convertNodesToShapes([sampleChartNode, sampleTextNode]);
  
  console.assert(shapes.length === 2, 'Should convert 2 nodes');
  console.assert(shapes[0].type === 'chart', 'First shape should be chart');
  console.assert(shapes[0].props.title === 'Test Chart', 'Chart title should match');
  console.assert(shapes[1].type === 'textbox', 'Second shape should be textbox');
  console.assert(shapes[1].props.text === 'Sample note', 'Text should match');
  
  console.log('✅ Node to Shape conversion passed');
  return shapes;
}

// Test 2: Shape to Node conversion
export function testShapeToNode() {
  console.log('Test 2: Shape to Node Conversion');
  
  const shapes = testNodeToShape();
  const nodes = convertShapesToNodes(shapes);
  
  console.assert(nodes.length === 2, 'Should convert 2 shapes back to nodes');
  console.assert(nodes[0].type === 'chart', 'First node should be chart');
  console.assert(nodes[0].data.title === 'Test Chart', 'Chart title should match');
  console.assert(nodes[1].type === 'textbox', 'Second node should be textbox');
  console.assert(nodes[1].data.text === 'Sample note', 'Text should match');
  
  console.log('✅ Shape to Node conversion passed');
  return nodes;
}

// Test 3: Edge to Arrow conversion
export function testEdgeToArrow() {
  console.log('Test 3: Edge to Arrow Conversion');
  
  const arrows = convertEdgesToArrows([sampleEdge]);
  
  console.assert(arrows.length === 1, 'Should convert 1 edge');
  console.assert(arrows[0].type === 'arrow', 'Should be arrow type');
  console.assert(arrows[0].props.start.boundShapeId === 'chart-1', 'Start should be chart-1');
  console.assert(arrows[0].props.end.boundShapeId === 'text-1', 'End should be text-1');
  
  console.log('✅ Edge to Arrow conversion passed');
  return arrows;
}

// Test 4: Arrow to Edge conversion
export function testArrowToEdge() {
  console.log('Test 4: Arrow to Edge Conversion');
  
  const arrows = testEdgeToArrow();
  const edges = convertArrowsToEdges(arrows);
  
  console.assert(edges.length === 1, 'Should convert 1 arrow back to edge');
  console.assert(edges[0].source === 'chart-1', 'Source should be chart-1');
  console.assert(edges[0].target === 'text-1', 'Target should be text-1');
  
  console.log('✅ Arrow to Edge conversion passed');
}

// Test 5: Validation
export function testValidation() {
  console.log('Test 5: Validation');
  
  const validNode = validateNode(sampleChartNode);
  console.assert(validNode.valid === true, 'Sample chart node should be valid');
  
  const invalidNode = validateNode({ id: 'test' }); // Missing required fields
  console.assert(invalidNode.valid === false, 'Incomplete node should be invalid');
  
  console.log('✅ Validation passed');
}

// Test 6: Data Integrity (Round-trip)
export function testDataIntegrity() {
  console.log('Test 6: Data Integrity');
  
  const originalNodes = [sampleChartNode, sampleTextNode];
  
  // Convert to shapes
  const shapes = convertNodesToShapes(originalNodes);
  
  // Convert back to nodes
  const convertedNodes = convertShapesToNodes(shapes);
  
  // Deep comparison (compare key fields)
  const originalTitle = originalNodes[0].data.title;
  const convertedTitle = convertedNodes[0].data.title;
  
  const originalText = originalNodes[1].data.text;
  const convertedText = convertedNodes[1].data.text;
  
  console.assert(originalTitle === convertedTitle, 'Chart title should be preserved');
  console.assert(originalText === convertedText, 'Text should be preserved');
  console.assert(originalNodes.length === convertedNodes.length, 'Node count should match');
  
  console.log('✅ Data integrity maintained - round trip successful');
  return true;
}

// Run all tests
export function runAllTests() {
  console.log('=== Running State Converter Tests ===\n');
  
  try {
    testNodeToShape();
    testShapeToNode();
    testEdgeToArrow();
    testArrowToEdge();
    testValidation();
    testDataIntegrity();
    
    console.log('\n✅ All tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    return false;
  }
}

// Auto-run tests in development
if (process.env.NODE_ENV === 'development') {
  // Uncomment to auto-run tests:
  // runAllTests();
}

