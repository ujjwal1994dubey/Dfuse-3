from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
import io
import uuid
import re
import ast
import operator
import json
from gemini_llm import GeminiDataFormulator

app = FastAPI(title="Chart Fusion Backend")
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # Allow all origins for development
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# In-memory stores
# -----------------------
DATASETS: Dict[str, pd.DataFrame] = {}
DATASET_METADATA: Dict[str, Dict[str, Any]] = {}  # Store dataset analysis and metadata
CHARTS: Dict[str, Dict[str, Any]] = {}
CHART_INSIGHTS_CACHE: Dict[str, Dict[str, Any]] = {}  # Cache generated chart insights


# Add this right after line 28 (after the CHARTS dictionary):

@app.get("/")
async def root():
    return {"message": "D.fuse Backend API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": "2024-01-01"}

# -----------------------
# Models
# -----------------------
class ChartCreate(BaseModel):
    dataset_id: str
    dimensions: List[str] = []
    measures: List[str] = []
    agg: str = "sum"  # future: support more
    title: Optional[str] = None
    table: Optional[List[Dict[str, Any]]] = None  # Pre-computed table for synthetic dimensions
    originalMeasure: Optional[str] = None  # Original measure for histograms (before binning)
    filters: Optional[Dict[str, List[str]]] = None  # Dimension filters for chart-level filtering

class FuseRequest(BaseModel):
    chart1_id: str
    chart2_id: str

class FuseWithAIRequest(BaseModel):
    chart1_id: str
    chart2_id: str
    user_goal: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"

class ChartTableRequest(BaseModel):
    chart_id: str

class HistogramRequest(BaseModel):
    dataset_id: str
    measure: str

class DimensionCountRequest(BaseModel):
    dataset_id: str
    dimension: str

class ExpressionRequest(BaseModel):
    dataset_id: str
    expression: str
    filters: Optional[Dict[str, Any]] = {}

class ExpressionValidateRequest(BaseModel):
    dataset_id: str
    expression: str

class AIExploreRequest(BaseModel):
    chart_id: str
    user_query: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"

class MetricCalculationRequest(BaseModel):
    user_query: str
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"

class ConfigTestRequest(BaseModel):
    api_key: str
    model: str = "gemini-2.0-flash"

class DatasetAnalysisRequest(BaseModel):
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"

class DatasetMetadataSaveRequest(BaseModel):
    dataset_id: str
    dataset_summary: str
    column_descriptions: Dict[str, str]

class ChartSuggestionRequest(BaseModel):
    dataset_id: str
    goal: str
    api_key: Optional[str] = None
    model: str = "gemini-2.0-flash"
    num_charts: Optional[int] = 4  # Default 4 for backward compatibility, min 1, max 5

class ChartSuggestion(BaseModel):
    title: str
    description: str
    chart_type: str
    dimensions: List[str]
    measures: List[str]
    importance_score: int
    insight: str

class VariableSuggestion(BaseModel):
    method: str
    dimensions: List[str]
    measures: List[str]
    title: str
    reasoning: str
    importance_score: int

class ChartSuggestionResponse(BaseModel):
    success: bool
    suggestions: List[VariableSuggestion]
    token_usage: Dict[str, int]
    error: Optional[str] = None

# -----------------------
# Helpers
# -----------------------

def _parse_expression(expression: str, dataset_id: str) -> Dict[str, Any]:
    """
    Parse Expression Helper
    Parses mathematical expressions containing field references in @Field.Aggregation format.
    Validates field names against dataset columns and checks expression syntax.
    
    Args:
        expression: Mathematical expression string (e.g., "@Revenue.Sum - @Cost.Avg")
        dataset_id: ID of the dataset to validate fields against
    
    Returns:
        Dictionary containing field_refs, errors, available_measures, and valid flag
    
    Examples:
        "@Revenue.Sum * 2" -> extracts Revenue field with Sum aggregation
        "@Price.Avg + @Tax.Max" -> extracts Price (Avg) and Tax (Max)
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    df = DATASETS[dataset_id]
    available_measures = []
    
    # Get available measures from the dataset
    for col in df.columns:
        if df[col].dtype in ['int64', 'int32', 'float64', 'float32', 'int', 'float']:
            available_measures.append(col)
    
    # Find all @Field.Aggregation patterns (case-insensitive for both field and aggregation)
    pattern = r'@([a-zA-Z_][a-zA-Z0-9_]*)\.(Sum|Avg|Min|Max|Count)'
    matches = re.findall(pattern, expression, re.IGNORECASE)
    
    field_refs = []
    errors = []
    
    for field, agg in matches:
        # Find the actual field name with correct casing
        actual_field = None
        for measure in available_measures:
            if measure.lower() == field.lower():
                actual_field = measure
                break
        
        if actual_field is None:
            errors.append(f"Field '{field}' not found in dataset")
        else:
            field_refs.append({
                "field": actual_field,
                "aggregation": agg.lower(),
                "token": f"@{field}.{agg}"  # Keep original casing in token for replacement
            })
    
    # Validate mathematical expression structure
    # Remove field references and check if remaining is valid math
    temp_expr = expression
    for field, agg in matches:
        temp_expr = temp_expr.replace(f"@{field}.{agg}", "1")
    
    # More lenient validation - allow empty expressions and basic math
    if temp_expr.strip() and not re.match(r'^[0-9+\-*/().\s]+$', temp_expr.strip()):
        errors.append("Expression contains invalid characters")
    
    return {
        "field_refs": field_refs,
        "errors": errors,
        "available_measures": available_measures,
        "valid": len(errors) == 0
    }

def _evaluate_expression(expression: str, dataset_id: str, filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Evaluate Expression Helper
    Evaluates a parsed mathematical expression with actual aggregated values from the dataset.
    Applies optional filters before aggregation.
    
    Args:
        expression: Mathematical expression with @Field.Aggregation references
        dataset_id: ID of the dataset to evaluate against
        filters: Optional dictionary of dimension filters {dimension: [values]}
    
    Returns:
        Dictionary with result, field_values, expression, evaluated_expression, filters_applied
    
    Process:
        1. Apply filters to dataset
        2. Calculate aggregated values for each field reference
        3. Replace field references with actual values
        4. Safely evaluate the mathematical expression
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    df = DATASETS[dataset_id].copy()
    
    # Apply filters if provided
    if filters:
        for field, values in filters.items():
            if field in df.columns and values:
                if isinstance(values, list):
                    df = df[df[field].isin(values)]
                else:
                    df = df[df[field] == values]
    
    # Parse expression to get field references
    parsed = _parse_expression(expression, dataset_id)
    if not parsed["valid"]:
        raise HTTPException(status_code=400, detail=f"Invalid expression: {', '.join(parsed['errors'])}")
    
    # Calculate aggregated values for each field reference
    field_values = {}
    for ref in parsed["field_refs"]:
        field = ref["field"]
        agg = ref["aggregation"]
        token = ref["token"]
        
        if agg == "sum":
            value = df[field].sum()
        elif agg == "avg":
            value = df[field].mean()
        elif agg == "min":
            value = df[field].min()
        elif agg == "max":
            value = df[field].max()
        elif agg == "count":
            value = df[field].count()
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported aggregation: {agg}")
        
        field_values[token] = float(value) if pd.notna(value) else 0.0
    
    # Replace field references with actual values in expression
    eval_expr = expression
    for token, value in field_values.items():
        eval_expr = eval_expr.replace(token, str(value))
    
    # Safely evaluate the mathematical expression
    try:
        # Use ast.literal_eval for safety, but it doesn't support math operations
        # So we'll use a simple evaluator with allowed operators
        result = _safe_eval(eval_expr)
        return {
            "result": result,
            "field_values": field_values,
            "expression": expression,
            "evaluated_expression": eval_expr,
            "filters_applied": filters or {}
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to evaluate expression: {str(e)}")

def _safe_eval(expr: str) -> float:
    """
    Safe Expression Evaluator
    Safely evaluates mathematical expressions using Python's AST module.
    Only allows basic arithmetic operations (no exec/eval vulnerabilities).
    
    Args:
        expr: Mathematical expression string (e.g., "100 + 50 * 2")
    
    Returns:
        float: Computed result
    
    Allowed Operations:
        - Addition, Subtraction, Multiplication, Division
        - Unary operations (negation, positive)
        - Numbers and constants
    
    Security: Uses AST parsing to prevent code injection attacks
    """
    # Define allowed operators
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    def eval_node(node):
        if isinstance(node, ast.Num):  # Numbers
            return node.n
        elif isinstance(node, ast.Constant):  # Python 3.8+
            return node.value
        elif isinstance(node, ast.BinOp):  # Binary operations
            left = eval_node(node.left)
            right = eval_node(node.right)
            return operators[type(node.op)](left, right)
        elif isinstance(node, ast.UnaryOp):  # Unary operations
            operand = eval_node(node.operand)
            return operators[type(node.op)](operand)
        else:
            raise ValueError(f"Unsupported operation: {type(node)}")
    
    try:
        tree = ast.parse(expr, mode='eval')
        return eval_node(tree.body)
    except Exception as e:
        raise ValueError(f"Invalid expression: {str(e)}")

def _categorize_columns(df: pd.DataFrame) -> Dict[str, List[str]]:
    """
    Column Categorization Helper
    Automatically categorizes DataFrame columns into dimensions (categorical) and measures (numeric).
    Uses heuristics to distinguish between numeric dimensions (e.g., Year) and true measures.
    
    Args:
        df: Pandas DataFrame to analyze
    
    Returns:
        Dictionary with 'dimensions' and 'measures' lists
    
    Logic:
        - Numeric columns with <10% unique values and <20 unique total -> dimension
        - Other numeric columns -> measures
        - Non-numeric columns -> dimensions
    """
    dimensions = []
    measures = []
    
    for col in df.columns:
        # Check if column contains numeric data
        if df[col].dtype in ['int64', 'int32', 'float64', 'float32', 'int', 'float']:
            # Additional check: if all values are integers and there are few unique values,
            # it might be a categorical dimension (like year, month, etc.)
            unique_count = df[col].nunique()
            total_count = len(df[col].dropna())
            
            # If less than 10% unique values and all integers, treat as dimension
            if (unique_count / total_count < 0.1 and 
                unique_count < 20 and 
                df[col].dtype in ['int64', 'int32', 'int']):
                dimensions.append(col)
            else:
                measures.append(col)
        else:
            # Non-numeric columns are dimensions
            dimensions.append(col)
    
    return {"dimensions": dimensions, "measures": measures}

def _clean_dataframe_for_json(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean DataFrame for JSON Serialization
    Replaces NaN, Infinity, and -Infinity values with JSON-compliant alternatives.
    
    Args:
        df: DataFrame to clean
    
    Returns:
        Cleaned DataFrame with:
            - NaN replaced with None (serializes as null in JSON)
            - Inf replaced with None
            - -Inf replaced with None
    
    Note: This prevents "Out of range float values are not JSON compliant" errors
    """
    import numpy as np
    
    # Create a copy to avoid modifying the original
    df_clean = df.copy()
    
    # Replace NaN, Inf, -Inf with None (which becomes null in JSON)
    df_clean = df_clean.replace([np.nan, np.inf, -np.inf], None)
    
    return df_clean

def _agg(df: pd.DataFrame, dimensions: List[str], measures: List[str], agg: str = "sum") -> pd.DataFrame:
    """
    Aggregation Helper
    Performs data aggregation across specified dimensions and measures.
    Supports sum, avg, min, max, and count aggregations.
    
    Args:
        df: Source DataFrame
        dimensions: List of columns to group by
        measures: List of numeric columns to aggregate
        agg: Aggregation method ('sum', 'avg', 'min', 'max', 'count')
    
    Returns:
        Aggregated DataFrame
    
    Special Cases:
        - count aggregation doesn't require measures
        - Maps 'avg' to pandas 'mean'
        - Handles both grouped and non-grouped aggregations
    """
    # Map frontend aggregation names to pandas aggregation names
    agg_mapping = {
        "sum": "sum",
        "avg": "mean",  # Frontend sends "avg", pandas expects "mean"
        "min": "min", 
        "max": "max",
        "count": "count"
    }
    pandas_agg = agg_mapping.get(agg, agg)
    
    # Support count aggregation without explicit measures
    if agg == "count":
        for col in dimensions:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Column not found: {col}")
        if dimensions:
            grouped = df.groupby(dimensions).size().reset_index(name="count")
        else:
            grouped = pd.DataFrame({"count": [len(df)]})
        return grouped

    if not measures:
        raise HTTPException(status_code=400, detail="At least one measure is required for non-count aggregations")
    for col in dimensions + measures:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column not found: {col}")
    if dimensions:
        grouped = df.groupby(dimensions)[measures].agg(pandas_agg).reset_index()
    else:
        grouped = df[measures].agg(pandas_agg).to_frame().T
    return grouped


def _apply_filters(df: pd.DataFrame, filters: Dict[str, List[str]]) -> pd.DataFrame:
    """
    Apply dimension filters to DataFrame before aggregation.
    Filters use AND logic between dimensions, OR logic within dimension.
    
    Args:
        df: Source DataFrame
        filters: Dict mapping dimension names to lists of allowed values
    
    Returns:
        Filtered DataFrame containing only rows matching all filter criteria
    
    Example:
        filters = {"Product": ["A", "B"], "Region": ["North"]}
        Returns rows where Product in ["A", "B"] AND Region in ["North"]
    """
    if not filters:
        return df
    
    filtered_df = df.copy()
    
    for dimension, allowed_values in filters.items():
        # Skip empty filters
        if not allowed_values or len(allowed_values) == 0:
            continue
        
        # Validate dimension exists
        if dimension not in filtered_df.columns:
            print(f"⚠️ Filter dimension '{dimension}' not found in dataset, skipping")
            continue
        
        # Apply filter: keep rows where dimension value is in allowed_values
        # This implements OR logic within the dimension
        filtered_df = filtered_df[filtered_df[dimension].isin(allowed_values)]
    
    return filtered_df


def _same_dim_diff_measures(spec1, spec2):
    """
    Chart Fusion Pattern Detector: Same Dimension, Different Measures
    Checks if two charts share the same dimensions but have different measures.
    Used to determine if charts can be fused into a multi-measure visualization.
    
    Example: Both charts show data by "State" but one shows "Revenue", other shows "Population"
    """
    return spec1["dimensions"] == spec2["dimensions"] and set(spec1["measures"]) != set(spec2["measures"]) and len(spec1["dimensions"]) > 0


def _same_measure_diff_dims(spec1, spec2):
    """
    Chart Fusion Pattern Detector: Same Measure, Different Dimensions
    Checks if two charts share exactly one common measure but have different dimensions.
    Used to create comparison or stacked visualizations.
    
    Example: Both charts show "Revenue" but one groups by "Region", other by "Product"
    
    NOTE: Excludes histogram cases - they should be handled by histogram-specific fusion logic
    """
    # Don't match histogram cases - they need special semantic merging
    if _is_measure_histogram(spec1) or _is_measure_histogram(spec2):
        return False
    
    common_measures = set(spec1["measures"]).intersection(set(spec2["measures"]))
    return (len(common_measures) == 1) and (spec1["dimensions"] != spec2["dimensions"]) and (len(spec1["dimensions"]) > 0 or len(spec2["dimensions"]) > 0)


def _is_measure_histogram(chart: Dict[str, Any]) -> bool:
    """
    Detects if a chart is a histogram (measure distribution).
    Supports both old format (0D + 1M) and new binned format (1D with 'bin' + 1M with 'count').
    """
    dims = chart.get("dimensions", [])
    meas = chart.get("measures", [])
    
    # Original format: 0D + 1M (not count)
    if len(dims) == 0 and len(meas) == 1 and meas[0] != "count":
        return True
    
    # New binned format: 1D + 1M where dimension is 'bin'
    if len(dims) == 1 and dims[0] == "bin" and len(meas) == 1 and meas[0] == "count":
        return True
    
    return False


def _is_dimension_count(chart: Dict[str, Any]) -> bool:
    """
    Detects if a chart is a dimension count (1D + 0M or 1D + count).
    """
    dims = chart.get("dimensions", [])
    meas = chart.get("measures", [])
    return len(dims) == 1 and (len(meas) == 0 or (len(meas) == 1 and meas[0] == "count"))


# -----------------------
# Routes
# -----------------------

@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Dataset Upload Endpoint
    Uploads and processes a CSV or XLSX file, stores it in memory with a unique ID.
    Automatically categorizes columns into dimensions and measures.
    
    Supported formats:
        - CSV (.csv)
        - Excel (.xlsx, .xls)
    
    Returns:
        - dataset_id: Unique identifier for the uploaded dataset
        - filename: Original filename
        - columns: All column names (for backward compatibility)
        - dimensions: Categorical columns
        - measures: Numeric columns
        - rows: Total row count
    """
    try:
        content = await file.read()
        filename = file.filename.lower()
        
        # Determine file type and read accordingly
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or XLSX files.")
        
        # Validate that the file contains data
        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        
        # Generate unique dataset ID
        dataset_id = str(uuid.uuid4())
        DATASETS[dataset_id] = df
        
        # Store original filename for analysis
        dataset_metadata = {
            "filename": file.filename,
            "upload_timestamp": pd.Timestamp.now().isoformat(),
            "file_type": "csv" if filename.endswith('.csv') else "excel"
        }
        
        if dataset_id not in DATASET_METADATA:
            DATASET_METADATA[dataset_id] = {}
        DATASET_METADATA[dataset_id].update(dataset_metadata)
        
        # Automatically categorize columns
        categorized = _categorize_columns(df)
        
        print(f"📁 Dataset uploaded successfully:")
        print(f"   File: {file.filename}")
        print(f"   Dataset ID: {dataset_id}")
        print(f"   Shape: {df.shape}")
        print(f"   Dimensions: {len(categorized['dimensions'])}")
        print(f"   Measures: {len(categorized['measures'])}")
        
        return {
            "dataset_id": dataset_id,
            "filename": file.filename,
            "columns": list(df.columns),  # Keep for backward compatibility
            "dimensions": categorized["dimensions"],
            "measures": categorized["measures"],
            "rows": len(df)
        }
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded file is empty or invalid.")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    except Exception as e:
        print(f"❌ Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


def _analyze_dataset_with_ai(df: pd.DataFrame, dataset_name: str, api_key: Optional[str] = None, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    """
    AI-Powered Dataset Analysis
    Performs comprehensive dataset analysis combining statistical profiling with AI-generated semantic insights.
    
    Args:
        df: Pandas DataFrame to analyze
        dataset_name: Name of the dataset file
        api_key: Gemini API key for AI analysis
        model: AI model to use for analysis
    
    Returns:
        Dictionary containing:
            - dataset_name: Original filename
            - dataset_summary: AI-generated overall description
            - columns: List of column analysis objects with stats and AI descriptions
            - token_usage: AI token consumption metrics
    
    Process:
        1. Calculate statistical summary for each column
        2. Generate structured schema for AI consumption
        3. Prompt Gemini for semantic analysis
        4. Combine statistical and semantic data
    """
    try:
        print(f"🤖 Starting AI analysis for dataset: {dataset_name}")
        print(f"📊 Dataset shape: {df.shape}")
        
        # Step 1: Calculate statistical summary for each column
        columns_analysis = []
        
        for col in df.columns:
            col_series = df[col]
            
            # Basic statistics
            missing_pct = col_series.isnull().mean() * 100
            unique_count = col_series.nunique()
            total_count = len(col_series)
            
            # Sample values (non-null)
            sample_values = col_series.dropna().sample(min(3, col_series.dropna().shape[0])).tolist() if not col_series.dropna().empty else []
            
            # Type-specific analysis
            variance = None
            if pd.api.types.is_numeric_dtype(col_series):
                variance = float(col_series.var()) if not col_series.var() != col_series.var() else None  # Check for NaN
            
            column_info = {
                "name": col,
                "dtype": str(col_series.dtype),
                "missing_pct": round(missing_pct, 2),
                "unique_count": unique_count,
                "total_count": total_count,
                "variance": variance,
                "sample_values": sample_values,
                "description": ""  # Will be filled by AI
            }
            
            columns_analysis.append(column_info)
        
        # Step 2: Prepare sample data for AI analysis
        # Get first 10 rows as sample to help AI understand content
        sample_rows = df.head(10).to_dict(orient='records')
        
        # Create structured data for AI including actual content
        analysis_data = {
            "dataset_name": dataset_name,
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": columns_analysis,
            "sample_data": sample_rows[:5]  # First 5 rows for context
        }
        
        # Step 3: Generate AI insights using Gemini
        if api_key:
            from gemini_llm import GeminiDataFormulator
            ai_formulator = GeminiDataFormulator(api_key=api_key, model=model)
            
            # Create comprehensive prompt for semantic dataset analysis
            prompt = f"""You are an expert data analyst. Analyze this dataset and provide meaningful, context-aware insights about what the data represents in the real world.

DATASET INFORMATION:
- File: {dataset_name}
- Size: {len(df)} rows, {len(df.columns)} columns

COLUMN DETAILS:
{chr(10).join([f"- {col['name']}: {col['dtype']}, {col['unique_count']} unique values, Sample: {col['sample_values']}" for col in columns_analysis])}

SAMPLE DATA (first 5 rows):
{chr(10).join([f"Row {i+1}: {row}" for i, row in enumerate(sample_rows[:5])])}

INSTRUCTIONS:
1. Look at the column names, data types, AND actual data values to understand what this dataset is about
2. Provide a meaningful dataset summary that describes the REAL-WORLD CONTEXT (e.g., "tiger population data", "sales performance", "customer demographics")
3. For each column, describe what it represents in BUSINESS/DOMAIN terms, not just data types

Focus on SEMANTIC MEANING, not statistical properties. Be specific about the domain/context.

Output ONLY valid JSON in this EXACT format:
{{
  "dataset_summary": "Meaningful 2-3 sentence description focusing on what this data represents in the real world",
  "columns": [
    {{"name": "column1", "description": "Business/domain description of what this column contains"}},
    {{"name": "column2", "description": "Business/domain description of what this column contains"}},
    ...
  ]
}}"""

            try:
                ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt)
                
                print(f"🤖 Raw AI Response: {ai_response[:200]}...")
                
                # Clean and parse AI response
                cleaned_response = ai_response.strip()
                
                # Sometimes Gemini returns markdown code blocks, extract JSON
                if "```json" in cleaned_response:
                    start_idx = cleaned_response.find("```json") + 7
                    end_idx = cleaned_response.find("```", start_idx)
                    if end_idx != -1:
                        cleaned_response = cleaned_response[start_idx:end_idx].strip()
                elif "```" in cleaned_response:
                    start_idx = cleaned_response.find("```") + 3
                    end_idx = cleaned_response.find("```", start_idx)
                    if end_idx != -1:
                        cleaned_response = cleaned_response[start_idx:end_idx].strip()
                
                print(f"🧹 Cleaned Response: {cleaned_response[:200]}...")
                
                # Parse AI response
                ai_data = json.loads(cleaned_response)
                
                # Merge AI descriptions with statistical data
                dataset_summary = ai_data.get("dataset_summary", "This dataset contains structured data for analysis.")
                ai_columns = {col["name"]: col["description"] for col in ai_data.get("columns", [])}
                
                # Update column descriptions
                for col_info in columns_analysis:
                    col_info["description"] = ai_columns.get(col_info["name"], f"Data column containing {col_info['dtype']} values")
                
                print(f"✅ AI analysis completed successfully!")
                print(f"   Dataset summary generated: {len(dataset_summary)} characters")
                print(f"   Column descriptions: {len(ai_columns)} columns processed")
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": dataset_summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage,
                    "success": True
                }
                
            except json.JSONDecodeError as json_error:
                print(f"❌ AI JSON parsing failed: {str(json_error)}")
                print(f"📄 Full AI Response: {ai_response}")
                
                # Still track token usage even if parsing fails
                token_usage_result = token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
                
                # Simple generic fallback descriptions
                for col_info in columns_analysis:
                    dtype = col_info['dtype']
                    unique_count = col_info['unique_count']
                    
                    if dtype in ['object', 'string']:
                        col_info["description"] = f"Text data with {unique_count} unique values"
                    elif dtype in ['int64', 'int32', 'float64', 'float32']:
                        col_info["description"] = f"Numeric data with {unique_count} unique values"
                    else:
                        col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
                
                # Generic dataset summary
                summary = f"Dataset containing {len(df)} rows and {len(df.columns)} columns. AI analysis failed - check API key configuration."
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage_result,
                    "success": False,
                    "error": f"AI response parsing failed: {str(json_error)}"
                }
                
            except Exception as ai_error:
                print(f"❌ AI analysis failed: {str(ai_error)}")
                
                # Still track token usage if available
                token_usage_result = token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
                
                # Simple generic fallback descriptions
                for col_info in columns_analysis:
                    dtype = col_info['dtype']
                    unique_count = col_info['unique_count']
                    
                    if dtype in ['object', 'string']:
                        col_info["description"] = f"Text data with {unique_count} unique values"
                    elif dtype in ['int64', 'int32', 'float64', 'float32']:
                        col_info["description"] = f"Numeric data with {unique_count} unique values"
                    else:
                        col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
                
                # Generic dataset summary  
                summary = f"Dataset containing {len(df)} rows and {len(df.columns)} columns. AI analysis failed - check API key configuration."
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage_result,
                    "success": False,
                    "error": str(ai_error)
                }
        else:
            # No API key provided - simple generic descriptions
            for col_info in columns_analysis:
                dtype = col_info['dtype']
                unique_count = col_info['unique_count']
                
                if dtype in ['object', 'string']:
                    col_info["description"] = f"Text data with {unique_count} unique values"
                elif dtype in ['int64', 'int32', 'float64', 'float32']:
                    col_info["description"] = f"Numeric data with {unique_count} unique values"
                else:
                    col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
            
            # Generic dataset summary
            summary = f"Dataset with {len(df)} rows and {len(df.columns)} columns. Configure API key in Settings for detailed AI analysis."
            
            return {
                "dataset_name": dataset_name,
                "dataset_summary": summary,
                "columns": columns_analysis,
                "token_usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                "success": False,
                "error": "No API key provided"
            }
            
    except Exception as e:
        print(f"❌ Dataset analysis failed: {str(e)}")
        return {
            "dataset_name": dataset_name,
            "dataset_summary": "Failed to analyze dataset",
            "columns": [],
            "token_usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
            "success": False,
            "error": str(e)
        }


def _generate_chart_title(dimensions: List[str], measures: List[str], agg: str = "sum") -> str:
    """
    Chart Title Generator
    Automatically generates human-readable chart titles based on chart configuration.
    Creates natural language descriptions of what the chart displays.
    
    Args:
        dimensions: List of dimension columns
        measures: List of measure columns
        agg: Aggregation method
    
    Examples:
        dimensions=["State"], measures=["Revenue"] -> "Revenue by State"
        dimensions=["State", "Year"], measures=["Revenue", "Cost"] -> "Revenue and Cost by State and Year"
        dimensions=[], measures=["Revenue"] -> "Total Revenue"
    """
    if not dimensions and not measures:
        return "Empty Chart"
    
    measure_text = ""
    if measures:
        if len(measures) == 1:
            measure_text = measures[0]
        else:
            measure_text = f"{', '.join(measures[:-1])} and {measures[-1]}"
    
    if not dimensions:
        return f"Total {measure_text}" if measures else "Chart"
    
    dimension_text = ""
    if len(dimensions) == 1:
        dimension_text = f"by {dimensions[0]}"
    else:
        dimension_text = f"by {', '.join(dimensions[:-1])} and {dimensions[-1]}"
    
    if measures:
        return f"{measure_text} {dimension_text}"
    else:
        return f"Distribution {dimension_text}"

@app.post("/charts")
async def create_chart(spec: ChartCreate):
    """
    Chart Creation Endpoint
    Creates a new chart by aggregating data from a dataset.
    Stores chart metadata and aggregated table data in memory.
    
    Args:
        spec: ChartCreate model with dataset_id, dimensions, measures, agg, title, table (optional)
    
    Returns:
        Chart object with chart_id, metadata, and aggregated table data
    
    Process:
        1. Validates dataset exists
        2. If pre-computed table provided (for synthetic dimensions), use it
        3. Otherwise, aggregates data using _agg helper
        4. Generates auto-title if not provided
        5. Stores chart in CHARTS registry
    """
    if spec.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Debug logging
    print(f"📊 /charts endpoint received: dimensions={spec.dimensions}, measures={spec.measures}, agg={spec.agg}, table_provided={spec.table is not None}, filters={spec.filters}")
    if spec.table is not None:
        print(f"   Table has {len(spec.table)} rows")
    
    # Use pre-computed table if provided (for synthetic dimensions like 'bin')
    if spec.table is not None:
        table_records = spec.table
    else:
        # Aggregate from dataset
        df = DATASETS[spec.dataset_id]
        
        # Apply filters before aggregation (Filter Early, Aggregate Later)
        if spec.filters:
            print(f"🔍 Applying filters: {spec.filters}")
            original_rows = len(df)
            df = _apply_filters(df, spec.filters)
            print(f"   Filtered from {original_rows} to {len(df)} rows")
        
        table = _agg(df, spec.dimensions, spec.measures, spec.agg)
        
        # Clean NaN/Inf values before JSON serialization
        table_clean = _clean_dataframe_for_json(table)
        table_records = table_clean.to_dict(orient="records")
    
    chart_id = str(uuid.uuid4())
    
    # Generate descriptive title if none provided
    auto_title = _generate_chart_title(spec.dimensions, spec.measures, spec.agg)
    
    CHARTS[chart_id] = {
        "chart_id": chart_id,
        "dataset_id": spec.dataset_id,
        "dimensions": spec.dimensions,
        "measures": (spec.measures if spec.measures else (["count"] if spec.agg == "count" else [])),
        "agg": spec.agg,
        "title": spec.title or auto_title,
        "table": table_records,
        "originalMeasure": spec.originalMeasure,  # Store original measure for histograms
        "filters": spec.filters or {}  # Store filters for persistence and reapplication
    }
    return CHARTS[chart_id]


@app.get("/charts/{chart_id}")
async def get_chart(chart_id: str):
    """
    Get Chart Endpoint
    Retrieves a previously created chart by its ID.
    Returns complete chart metadata including aggregated data.
    """
    if chart_id not in CHARTS:
        raise HTTPException(status_code=404, detail="Chart not found")
    return CHARTS[chart_id]


@app.post("/chart-table")
async def get_chart_table(req: ChartTableRequest):
    """
    Chart Table Endpoint
    Generates formatted table data for displaying chart data in tabular format.
    Handles both AI-generated and regular charts differently.
    
    Features:
        - Pre-computed table data for AI-generated charts
        - On-demand aggregation for regular charts
        - Number formatting (integers, decimals, N/A for nulls)
        - Returns headers and rows ready for UI display
    """
    if req.chart_id not in CHARTS:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    chart = CHARTS[req.chart_id]
    
    try:
        # For AI-generated charts, use pre-computed table data
        if chart.get("is_ai_generated", False) and "table" in chart and chart["table"]:
            print(f"📊 Returning pre-computed table for AI-generated chart: {req.chart_id}")
            
            # Extract headers from first row or from dimensions + measures
            table_data = chart["table"]
            if table_data:
                headers = list(table_data[0].keys())
                
                # Format the rows for display
                rows = []
                for record in table_data:
                    formatted_row = []
                    for header in headers:
                        val = record.get(header)
                        # Format numbers nicely and handle JSON-unsafe values
                        if isinstance(val, (int, float)):
                            if val is None or (isinstance(val, float) and not np.isfinite(val)):
                                formatted_row.append("N/A")
                            elif isinstance(val, float) and val.is_integer():
                                formatted_row.append(int(val))
                            elif isinstance(val, float):
                                formatted_row.append(round(val, 2))
                            else:
                                formatted_row.append(val)
                        else:
                            formatted_row.append(str(val) if val is not None else "N/A")
                    rows.append(formatted_row)
                
                return {
                    "chart_id": req.chart_id,
                    "title": chart.get("title", "AI Generated Chart Table"),
                    "headers": headers,
                    "rows": rows,
                    "total_rows": len(rows)
                }
            else:
                # Empty AI chart
                return {
                    "chart_id": req.chart_id,
                    "title": chart.get("title", "Empty AI Chart"),
                    "headers": [],
                    "rows": [],
                    "total_rows": 0
                }
        
        # For regular charts, use the original aggregation logic
        dataset_id = chart["dataset_id"]
        
        if dataset_id not in DATASETS:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        df = DATASETS[dataset_id]
        dimensions = chart.get("dimensions", [])
        measures = chart.get("measures", [])
        agg = chart.get("agg", "sum")
        
        # Filter out 'count' from measures if it's synthetic
        actual_measures = [m for m in measures if m != "count"]
        
        print(f"📊 Generating table for regular chart: {req.chart_id}")
        
        # Use the same _agg function that was used to create the chart
        table_df = _agg(df, dimensions, actual_measures if actual_measures else measures, agg)
        
        # Prepare headers and rows
        headers = list(table_df.columns)
        rows = []
        
        for _, row in table_df.iterrows():
            formatted_row = []
            for val in row:
                # Format numbers nicely
                if isinstance(val, (int, float)):
                    if isinstance(val, float) and val.is_integer():
                        formatted_row.append(int(val))
                    elif isinstance(val, float):
                        formatted_row.append(round(val, 2))
                    else:
                        formatted_row.append(val)
                else:
                    formatted_row.append(str(val))
            rows.append(formatted_row)
        
        return {
            "chart_id": req.chart_id,
            "title": chart.get("title", "Chart Table"),
            "headers": headers,
            "rows": rows,
            "total_rows": len(rows)
        }
        
    except Exception as e:
        print(f"❌ Failed to generate table for chart {req.chart_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate table: {str(e)}")


@app.post("/fuse")
async def fuse(req: FuseRequest):
    """
    Chart Fusion Endpoint
    Intelligently merges two charts from the same dataset based on their structure.
    Detects fusion patterns and creates appropriate combined visualizations.
    
    Fusion Patterns Supported:
        1. Same Dimension + Different Measures -> Grouped/Stacked Bar
        2. Same Measure + Different Dimensions -> Stacked/Comparison Chart
        3. Measure Histogram + Dimension Count -> Distribution by Dimension
        4. Two Measure Histograms -> Scatter Plot
        5. Two Dimension Counts -> Heatmap/Frequency Chart
    
    Returns:
        Fused chart with merged data, strategy recommendation, and visualization hints
    """
    if req.chart1_id not in CHARTS or req.chart2_id not in CHARTS:
        raise HTTPException(status_code=404, detail="One or both charts not found")

    c1, c2 = CHARTS[req.chart1_id], CHARTS[req.chart2_id]
    ds_id = c1["dataset_id"]
    if ds_id != c2["dataset_id"]:
        raise HTTPException(status_code=400, detail="Charts must come from the same dataset for fusion in this demo")
    df = DATASETS[ds_id]

    # Note: Helper functions _is_measure_histogram, _is_dimension_count moved to module level
    
    def _pick_agg(*charts: Dict[str, Any]) -> str:
        for ch in charts:
            val = ch.get("agg") if isinstance(ch, dict) else None
            if val:
                return val
        return "sum"

    # Defaults for metadata
    dims_out = list({*c1["dimensions"], *c2["dimensions"]})
    measures_out = list({*c1["measures"], *c2["measures"]})

    # Case A: Same Dimension + Different Measures
    if _same_dim_diff_measures(c1, c2):
        dims = c1["dimensions"]
        measures = sorted(list(set(c1["measures"]) | set(c2["measures"])))
        agg = _pick_agg(c1, c2)
        fused_table = _agg(df, dims, measures, agg).copy()
        strategy = {
            "type": "same-dimension-different-measures",
            "suggestion": "grouped-bar | stacked-bar | dual-axis-line"
        }
        title = f"Combined: {', '.join(measures)} by {', '.join(dims)}"
        dims_out = dims
        measures_out = measures

    # Case B: Same Measure + Different Dimensions -> Generate HEATMAP data
    elif _same_measure_diff_dims(c1, c2):
        common_measure = list(set(c1["measures"]).intersection(set(c2["measures"])))[0]
        agg = _pick_agg(c1, c2)
        
        # Get the two dimensions 
        dim1 = c1["dimensions"][0] if c1["dimensions"] else None
        dim2 = c2["dimensions"][0] if c2["dimensions"] else None
        
        if dim1 and dim2:
            # Simple approach: Just aggregate by both dimensions 
            # This gives us regular row-based data that's easy to work with
            fused_table = df.groupby([dim1, dim2])[common_measure].agg(agg).reset_index().to_dict('records')
            
            strategy = {
                "type": "same-measure-different-dimensions-stacked",
                "suggestion": "stacked-bar | bubble-chart"  
            }
            title = f"Stacked Bar: {common_measure} by {dim1} vs {dim2}"
            dims_out = [dim1, dim2]
            measures_out = [common_measure]
        else:
            # Fallback to old behavior if no proper dimensions
            t1 = _agg(df, c1["dimensions"], [common_measure], agg).copy()
            t2 = _agg(df, c2["dimensions"], [common_measure], agg).copy()
            t1["__DimensionType__"] = ",".join(c1["dimensions"]) or "(none)"
            t2["__DimensionType__"] = ",".join(c2["dimensions"]) or "(none)"
            def flatten_keys(row, dims):
                if not dims: return "(total)"
                return " | ".join(str(row[d]) for d in dims)
            t1["DimensionValue"] = t1.apply(lambda r: flatten_keys(r, c1["dimensions"]), axis=1)
            t2["DimensionValue"] = t2.apply(lambda r: flatten_keys(r, c2["dimensions"]), axis=1)
            fused_table = pd.concat([
                t1[["__DimensionType__", "DimensionValue", common_measure]],
                t2[["__DimensionType__", "DimensionValue", common_measure]],
            ], ignore_index=True)
            fused_table = fused_table.rename(columns={"__DimensionType__": "DimensionType", common_measure: "Value"})
            strategy = {
                "type": "same-measure-different-dimensions",
                "suggestion": "multi-series line/bar | heatmap-ready (if granular joint exists)"
            }
            title = f"Comparison: {common_measure} across different dimensions"
            dims_out = list({*c1["dimensions"], *c2["dimensions"]})
            measures_out = [common_measure]

    # Case C: 1-variable charts (histogram + dimension count)
    elif (_is_measure_histogram(c1) and _is_dimension_count(c2)) or (_is_measure_histogram(c2) and _is_dimension_count(c1)):
        # Measure-only + Dimension-count -> build measure by dimension
        measure_chart = c1 if _is_measure_histogram(c1) else c2
        dimension_chart = c2 if _is_dimension_count(c2) else c1
        
        # ✨ SEMANTIC MERGING: Use original measure from histogram metadata
        # Histograms are binned representations of a real measure (e.g., Population2023)
        # We want to merge using the REAL measure, not the synthetic 'count' or 'bin'
        if "originalMeasure" in measure_chart and measure_chart["originalMeasure"]:
            measure = measure_chart["originalMeasure"]
            print(f"🔍 Using originalMeasure '{measure}' from histogram for semantic merge")
        else:
            # Fallback for backward compatibility with old histograms
            measure = measure_chart["measures"][0]
            print(f"⚠️ No originalMeasure found, using synthetic measure '{measure}'")
        
        dim = dimension_chart["dimensions"][0]
        
        # For real measures, use appropriate aggregation (sum/avg/etc)
        # For synthetic counts, aggregation doesn't make sense but we default to sum
        agg = _pick_agg(measure_chart, dimension_chart)
        
        print(f"📊 Semantic merge: dim='{dim}', measure='{measure}', agg='{agg}'")
        print(f"📊 Dataset columns: {list(df.columns)}")
        print(f"📊 Checking: '{dim}' in columns = {dim in df.columns}, '{measure}' in columns = {measure in df.columns}")
        
        # Validate columns exist
        if dim not in df.columns:
            raise HTTPException(status_code=400, detail=f"❌ Dimension column not found: '{dim}'. Available columns: {list(df.columns)}")
        if measure not in df.columns:
            raise HTTPException(status_code=400, detail=f"❌ Measure column not found: '{measure}'. Available columns: {list(df.columns)}")
        
        fused_table = _agg(df, [dim], [measure], agg).copy()
        strategy = {
            "type": "histogram-dimension-semantic-merge",
            "suggestion": "bar | line | grouped-bar"
        }
        title = f"{measure} by {dim}"
        dims_out = [dim]
        measures_out = [measure]

    # Optional generic 1-variable cases: histogram vs histogram
    elif _is_measure_histogram(c1) and _is_measure_histogram(c2):
        # Use originalMeasure if available for both histograms
        m1 = c1.get("originalMeasure", c1["measures"][0])
        m2 = c2.get("originalMeasure", c2["measures"][0])
        fused_table = df[[m1, m2]].dropna().copy()
        strategy = {"type": "measure-vs-measure", "suggestion": "scatter | dual-histogram"}
        title = f"{m1} vs {m2}"
        dims_out = []
        measures_out = [m1, m2]
        agg = _pick_agg(c1, c2)

    elif _is_dimension_count(c1) and _is_dimension_count(c2):
        d1, d2 = c1["dimensions"][0], c2["dimensions"][0]
        fused_table = df.groupby([d1, d2]).size().reset_index(name="Count")
        strategy = {"type": "dimension-vs-dimension", "suggestion": "heatmap | mosaic | grouped-bar"}
        title = f"{d1} vs {d2} (frequency)"
        dims_out = [d1, d2]
        measures_out = ["Count"]
        agg = _pick_agg(c1, c2)

    # Case D: Permissive same-dimension union of measures (robust fallback)
    elif len(set(c1.get("dimensions", [])).intersection(set(c2.get("dimensions", [])))) >= 1 and \
         len(set(c1.get("measures", [])).union(set(c2.get("measures", [])))) >= 2:
        common_dims = list(set(c1["dimensions"]).intersection(set(c2["dimensions"])))
        # Preserve original order using c1's order
        common_dims = [d for d in c1["dimensions"] if d in common_dims]
        measures = sorted(list(set(c1.get("measures", [])).union(set(c2.get("measures", [])))))
        # Aggregate on first common dimension if multiple
        dims_use = [common_dims[0]] if common_dims else []
        if not dims_use:
            raise HTTPException(status_code=400, detail="Fusion failed: no common dimension found")
        agg = _pick_agg(c1, c2)
        fused_table = _agg(df, dims_use, measures, agg).copy()
        strategy = {"type": "same-dimension-different-measures", "suggestion": "grouped-bar | stacked-bar | dual-axis-line"}
        title = f"Combined: {', '.join(measures)} by {', '.join(dims_use)}"
        dims_out = dims_use
        measures_out = measures

    else:
        raise HTTPException(status_code=400, detail="Fusion not allowed: charts must share either a dimension (and differ in measures) or share a single common measure (and differ in dimensions)")

    chart_id = str(uuid.uuid4())
    
    # Handle different table formats (DataFrame vs dict for heatmap)
    if isinstance(fused_table, dict):
        # Already a dict (old heatmap case - shouldn't happen anymore)
        table_data = fused_table
    elif isinstance(fused_table, list):
        # Already a list of records (new stacked case)
        table_data = fused_table
    else:
        # DataFrame - clean NaN/Inf values before converting to records
        fused_table_clean = _clean_dataframe_for_json(fused_table)
        table_data = fused_table_clean.to_dict(orient="records")
    
    fused_payload = {
        "chart_id": chart_id,
        "dataset_id": ds_id,
        "dimensions": dims_out,
        "measures": measures_out,
        "agg": agg if 'agg' in locals() else _pick_agg(c1, c2),
        "title": title,
        "strategy": strategy,
        "table": table_data,
    }
    CHARTS[chart_id] = fused_payload
    return fused_payload


@app.post("/fuse-with-ai")
async def fuse_with_ai(req: FuseWithAIRequest):
    """
    AI-Assisted Chart Fusion Endpoint
    Uses AI to intelligently select the best 3 variables when merging two 1D+1M charts
    with no common variables. AI analyzes user goal and dataset context to pick optimal combination.
    
    Process:
        1. Validates both charts are 1D+1M
        2. Extracts all 4 variables (2 dimensions + 2 measures)
        3. Gets dataset metadata for enhanced context
        4. Calls Gemini to select best 3 variables based on user goal
        5. Returns selected dimensions and measures for chart creation
    
    Args:
        chart1_id: First chart ID
        chart2_id: Second chart ID
        user_goal: User's analysis goal/context
        api_key: Gemini API key
        model: Gemini model to use
    
    Returns:
        Dictionary with:
            - dimensions: Selected dimension columns (1 or 2)
            - measures: Selected measure columns (1 or 2)
            - reasoning: AI explanation for selection
            - title: Suggested chart title
            - token_usage: Token consumption metrics
    """
    if req.chart1_id not in CHARTS or req.chart2_id not in CHARTS:
        raise HTTPException(status_code=404, detail="One or both charts not found")
    
    c1 = CHARTS[req.chart1_id]
    c2 = CHARTS[req.chart2_id]
    
    # Validate same dataset
    if c1["dataset_id"] != c2["dataset_id"]:
        raise HTTPException(status_code=400, detail="Charts must be from the same dataset")
    
    dataset_id = c1["dataset_id"]
    df = DATASETS.get(dataset_id)
    
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Validate both are 1D+1M
    def is_1d_1m(chart):
        dims = [d for d in chart.get("dimensions", []) if d != "count"]
        meas = chart.get("measures", [])
        return len(dims) == 1 and len(meas) == 1
    
    if not (is_1d_1m(c1) and is_1d_1m(c2)):
        raise HTTPException(
            status_code=400, 
            detail="AI-assisted merge requires both charts to be 1 dimension + 1 measure"
        )
    
    # Extract all 4 variables
    dims1 = [d for d in c1.get("dimensions", []) if d != "count"]
    dims2 = [d for d in c2.get("dimensions", []) if d != "count"]
    meas1 = c1.get("measures", [])
    meas2 = c2.get("measures", [])
    
    all_dimensions = list(set(dims1 + dims2))
    all_measures = list(set(meas1 + meas2))
    
    print(f"🤖 AI-assisted merge requested:")
    print(f"   Chart 1: {dims1} + {meas1}")
    print(f"   Chart 2: {dims2} + {meas2}")
    print(f"   All variables: dimensions={all_dimensions}, measures={all_measures}")
    print(f"   User goal: {req.user_goal}")
    
    # Get dataset metadata for context
    dataset_metadata = DATASET_METADATA.get(dataset_id, {})
    
    # Build context string
    context_str = ""
    if dataset_metadata.get('success'):
        dataset_summary = dataset_metadata.get('dataset_summary', '')
        columns_info = dataset_metadata.get('columns', [])
        
        if dataset_summary:
            context_str += f"Dataset Purpose: {dataset_summary}\n\n"
        
        if columns_info:
            context_str += "Column Descriptions:\n"
            col_desc_map = {col.get('name'): col.get('description', '') for col in columns_info}
            
            for var in all_dimensions + all_measures:
                desc = col_desc_map.get(var, 'No description available')
                col_type = dict(df.dtypes.astype(str)).get(var, 'unknown')
                context_str += f"- {var} ({col_type}): {desc}\n"
    else:
        # Fallback to basic column info
        context_str = "Column Types:\n"
        for var in all_dimensions + all_measures:
            col_type = dict(df.dtypes.astype(str)).get(var, 'unknown')
            context_str += f"- {var}: {col_type}\n"
    
    # Create AI prompt
    prompt = f"""You are a data visualization expert. Two charts are being merged, and you need to select the best 3 variables.

{context_str}

USER'S GOAL: {req.user_goal}

AVAILABLE VARIABLES:
- Dimensions (categorical): {all_dimensions}
- Measures (numeric): {all_measures}

TASK: Select exactly 3 variables that best address the user's goal. You must choose either:
- Option A: 1 dimension + 2 measures (for grouped bar, dual-axis, scatter plots)
- Option B: 2 dimensions + 1 measure (for stacked bar, bubble charts, heatmaps)

Consider:
1. Which combination best answers the user's question?
2. Which variables have the most relevant relationship?
3. What visualization would provide the most insight?

Respond ONLY with valid JSON (no markdown, no code blocks):
{{
  "selected_dimensions": ["dimension_name"],
  "selected_measures": ["measure1", "measure2"],
  "reasoning": "Brief explanation of why this combination is optimal",
  "title": "Descriptive chart title"
}}

OR

{{
  "selected_dimensions": ["dimension1", "dimension2"],
  "selected_measures": ["measure_name"],
  "reasoning": "Brief explanation of why this combination is optimal",
  "title": "Descriptive chart title"
}}"""

    try:
        # Call Gemini for variable selection
        if not req.api_key:
            raise HTTPException(status_code=400, detail="API key required for AI-assisted merge")
        
        ai_formulator = GeminiDataFormulator(api_key=req.api_key, model=req.model)
        response_text, token_usage = ai_formulator.run_gemini_with_usage(prompt)
        
        print(f"🤖 Raw AI Response: {response_text[:200]}...")
        
        # Clean and parse response
        cleaned_response = response_text.strip()
        
        # Remove markdown code blocks if present
        if "```json" in cleaned_response:
            start_idx = cleaned_response.find("```json") + 7
            end_idx = cleaned_response.find("```", start_idx)
            if end_idx != -1:
                cleaned_response = cleaned_response[start_idx:end_idx].strip()
        elif "```" in cleaned_response:
            start_idx = cleaned_response.find("```") + 3
            end_idx = cleaned_response.find("```", start_idx)
            if end_idx != -1:
                cleaned_response = cleaned_response[start_idx:end_idx].strip()
        
        # Parse JSON
        ai_result = json.loads(cleaned_response)
        
        selected_dimensions = ai_result.get("selected_dimensions", [])
        selected_measures = ai_result.get("selected_measures", [])
        reasoning = ai_result.get("reasoning", "AI selected these variables")
        title = ai_result.get("title", f"{', '.join(selected_dimensions)} × {', '.join(selected_measures)}")
        
        # Validate selection
        total_vars = len(selected_dimensions) + len(selected_measures)
        if total_vars != 3:
            raise ValueError(f"AI must select exactly 3 variables, got {total_vars}")
        
        if not ((len(selected_dimensions) == 1 and len(selected_measures) == 2) or 
                (len(selected_dimensions) == 2 and len(selected_measures) == 1)):
            raise ValueError("AI must select either (1D+2M) or (2D+1M)")
        
        # Validate variables exist in available set
        for dim in selected_dimensions:
            if dim not in all_dimensions:
                raise ValueError(f"Selected dimension '{dim}' not in available dimensions")
        
        for meas in selected_measures:
            if meas not in all_measures:
                raise ValueError(f"Selected measure '{meas}' not in available measures")
        
        print(f"✅ AI Selection validated:")
        print(f"   Dimensions: {selected_dimensions}")
        print(f"   Measures: {selected_measures}")
        print(f"   Reasoning: {reasoning}")
        
        return {
            "success": True,
            "dimensions": selected_dimensions,
            "measures": selected_measures,
            "reasoning": reasoning,
            "title": title,
            "token_usage": token_usage,
            "dataset_id": dataset_id
        }
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse AI response: {e}")
        print(f"   Response was: {cleaned_response}")
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except ValueError as e:
        print(f"❌ Invalid AI selection: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid AI selection: {str(e)}")
    except Exception as e:
        print(f"❌ AI-assisted merge failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI-assisted merge failed: {str(e)}")


@app.post("/histogram")
async def histogram(req: HistogramRequest):
    """
    Histogram Data Endpoint
    Returns raw numeric values for a measure to create histograms on the frontend.
    Includes statistical summary (sum, avg, min, max, count).
    """
    if req.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    df = DATASETS[req.dataset_id]
    if req.measure not in df.columns:
        raise HTTPException(status_code=400, detail=f"Measure column not found: {req.measure}")

    # Convert to numeric and drop NaNs for clean histogram
    series = pd.to_numeric(df[req.measure], errors="coerce").dropna()
    stats = {
        "sum": float(series.sum()),
        "avg": float(series.mean()),
        "max": float(series.max()),
        "min": float(series.min()),
        "count": int(series.count()),
    }
    # Return raw values; frontend will build the histogram bins
    values = series.tolist()
    return {"measure": req.measure, "values": values, "stats": stats}


@app.post("/dimension_counts")
async def dimension_counts(req: DimensionCountRequest):
    """
    Dimension Counts Endpoint
    Returns value counts for a categorical dimension.
    Used for bar charts and filter value lists.
    """
    if req.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    df = DATASETS[req.dataset_id]
    if req.dimension not in df.columns:
        raise HTTPException(status_code=400, detail=f"Dimension column not found: {req.dimension}")

    series = df[req.dimension].dropna()
    vc = series.value_counts(dropna=False)
    labels = [str(k) for k in vc.index.tolist()]
    counts = [int(v) for v in vc.tolist()]
    return {"dimension": req.dimension, "labels": labels, "counts": counts, "total": int(series.shape[0])}


@app.post("/chart_dimension_values")
async def chart_dimension_values(req: dict):
    """
    Chart Dimension Values Endpoint
    Get unique dimension values from a chart's aggregated data.
    Used to populate filter dropdowns with values from current chart.
    
    Args:
        chart_id: ID of the chart
        dimension: Name of dimension to get values for
    
    Returns:
        List of unique values for the dimension from the chart's table
    
    Example:
        Request: {"chart_id": "abc123", "dimension": "Product"}
        Response: {"dimension": "Product", "values": ["Product A", "Product B", "Product C"]}
    """
    chart_id = req.get("chart_id")
    dimension = req.get("dimension")
    
    if not chart_id:
        raise HTTPException(status_code=400, detail="chart_id is required")
    if not dimension:
        raise HTTPException(status_code=400, detail="dimension is required")
    
    if chart_id not in CHARTS:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    chart = CHARTS[chart_id]
    table = chart.get("table", [])
    
    if not table:
        return {"dimension": dimension, "values": []}
    
    # Extract unique values for dimension from chart table
    values = list(set(row.get(dimension) for row in table if dimension in row))
    # Remove None values
    values = [v for v in values if v is not None]
    # Sort alphabetically for better UX
    try:
        values.sort()
    except TypeError:
        # If values are not comparable (mixed types), convert to strings and sort
        values = sorted([str(v) for v in values])
    
    print(f"📊 Chart dimension values: chart_id={chart_id}, dimension={dimension}, values={values}")
    
    return {"dimension": dimension, "values": values}


@app.post("/expression/validate")
async def validate_expression(req: ExpressionValidateRequest):
    """
    Expression Validation Endpoint
    Validates mathematical expression syntax and field references.
    Returns validation errors and available measures for autocomplete.
    """
    try:
        parsed = _parse_expression(req.expression, req.dataset_id)
        return {
            "valid": parsed["valid"],
            "errors": parsed["errors"],
            "field_refs": parsed["field_refs"],
            "available_measures": parsed["available_measures"]
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@app.post("/expression/evaluate")
async def evaluate_expression(req: ExpressionRequest):
    """
    Expression Evaluation Endpoint
    Evaluates a validated mathematical expression with actual dataset values.
    Supports filtering before aggregation.
    """
    try:
        result = _evaluate_expression(req.expression, req.dataset_id, req.filters)
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@app.get("/dataset/{dataset_id}/measures")
async def get_dataset_measures(dataset_id: str):
    """
    Dataset Measures Endpoint
    Returns available measures, dimensions, and aggregation options for a dataset.
    Used for autocomplete and validation in expression nodes.
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    df = DATASETS[dataset_id]
    measures = []
    dimensions = []
    
    for col in df.columns:
        if df[col].dtype in ['int64', 'int32', 'float64', 'float32', 'int', 'float']:
            measures.append(col)
        else:
            dimensions.append(col)
    
    return {
        "measures": measures,
        "dimensions": dimensions,
        "aggregations": ["Sum", "Avg", "Min", "Max", "Count"]
    }


# Initialize AI Data Formulator per request now (removed global instance)

@app.post("/test-config")
async def test_config(request: ConfigTestRequest):
    """
    AI Configuration Test Endpoint
    Tests user's Gemini API key and model configuration.
    Verifies credentials work before using AI features.
    
    Returns:
        success: bool, error message if failed, token_usage for test query
    """
    try:
        print(f"🔧 Testing configuration:")
        print(f"   API Key: {'*' * (len(request.api_key)-8) + request.api_key[-8:] if len(request.api_key) > 8 else '***'}")
        print(f"   Model: {request.model}")
        
        # Create AI formulator with user's credentials
        ai_formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        # Test the configuration
        result = ai_formulator.test_configuration()
        
        print(f"✅ Configuration test result: {result.get('success', False)}")
        return result
        
    except Exception as e:
        print(f"❌ Configuration test failed: {str(e)}")
        return {
            "success": False,
            "error": f"Configuration test failed: {str(e)}"
        }

@app.post("/ai-explore")
async def ai_explore_data(request: AIExploreRequest):
    """
    AI Data Exploration Endpoint
    AI-powered data exploration using Gemini LLM and pandas DataFrame analysis.
    Answers natural language questions about chart data.
    
    Features:
        - Natural language query processing
        - Generates and executes pandas code
        - Returns text answers with optional tabular data
        - Tracks token usage for cost estimation
    
    Args:
        request: Contains chart_id, user_query, api_key, model
    
    Returns:
        success, answer, code_steps, reasoning_steps, tabular_data, token_usage
    """
    if request.chart_id not in CHARTS:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    # Get chart context
    chart = CHARTS[request.chart_id]
    dataset_id = chart["dataset_id"]
    
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        # Get the full original dataset
        full_dataset = DATASETS[dataset_id]
        
        print(f"🤖 AI Exploration started:")
        print(f"   Query: '{request.user_query}'")
        print(f"   Dataset shape: {full_dataset.shape}")
        print(f"   Model: {request.model}")
        print(f"   API Key: {'*' * (len(request.api_key or '')-8) + (request.api_key or '')[-8:] if (request.api_key or '') and len(request.api_key) > 8 else '***'}")
        
        # Create AI formulator with user's credentials
        ai_formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        # Retrieve dataset metadata for enhanced context (avoid circular import)
        dataset_metadata = None
        if dataset_id in DATASET_METADATA:
            dataset_metadata = DATASET_METADATA[dataset_id]
            if dataset_metadata and dataset_metadata.get('success'):
                print(f"📋 Retrieved dataset analysis metadata: {len(dataset_metadata.get('columns', []))} columns analyzed")
            else:
                print("📋 Dataset metadata found but incomplete")
                dataset_metadata = None
        else:
            print(f"📋 No dataset metadata found for {dataset_id[:8]}... - using basic analysis")
        
        # Use pandas DataFrame agent for text-based results with enhanced context
        ai_result = ai_formulator.get_text_analysis(request.user_query, full_dataset, dataset_id, dataset_metadata)
        
        print(f"✅ AI Analysis completed successfully!")
        print(f"   Result length: {len(ai_result.get('answer', ''))}")
        
        # Return complete AI analysis response including code_steps and token_usage
        return {
            "success": ai_result.get("success", True),
            "answer": ai_result.get("answer", "I couldn't process your query."),
            "query": request.user_query,
            "dataset_info": f"Dataset: {full_dataset.shape[0]} rows, {full_dataset.shape[1]} columns",
            "code_steps": ai_result.get("code_steps", []),
            "reasoning_steps": ai_result.get("reasoning_steps", []),
            "tabular_data": ai_result.get("tabular_data", []),
            "has_table": ai_result.get("has_table", False),
            "token_usage": ai_result.get("token_usage", {})
        }
        
    except Exception as e:
        print(f"❌ AI Exploration failed: {str(e)}")
        error_message = str(e)
        if "401" in error_message or "403" in error_message or "API key" in error_message:
            error_message += " Please check your API key in Settings."
        
        return {
            "success": False,
            "answer": f"I encountered an error while processing your query: {error_message}",
            "query": request.user_query,
            "dataset_info": "",
            "code_steps": [],
            "reasoning_steps": [],
            "tabular_data": [],
            "has_table": False,
            "token_usage": {}
        }


@app.post("/ai-calculate-metric")
async def ai_calculate_metric(request: MetricCalculationRequest):
    """
    AI Metric Calculation Endpoint
    Calculates metrics from natural language descriptions using AI.
    Used by expression nodes to compute values from text queries.
    
    Example Queries:
        - "What is the average revenue per state?"
        - "Calculate total population growth from 2018 to 2023"
    
    Returns:
        success, value, formatted_value, explanation, token_usage
    """
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    df = DATASETS[request.dataset_id]
    
    try:
        print(f"🧮 AI Metric calculation started:")
        print(f"   Query: '{request.user_query}'")
        print(f"   Dataset: {request.dataset_id}")
        print(f"   Data shape: {df.shape}")
        print(f"   Model: {request.model}")
        print(f"   API Key: {'*' * (len(request.api_key or '')-8) + (request.api_key or '')[-8:] if (request.api_key or '') and len(request.api_key) > 8 else '***'}")
        
        # Create AI formulator with user's credentials
        ai_formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        # Use AI to calculate the metric
        result = ai_formulator.calculate_metric(request.user_query, request.dataset_id, df)
        
        print(f"🧮 AI Metric calculation result:")
        print(f"   Success: {result.get('success', False)}")
        if result.get('success'):
            print(f"   Value: {result.get('value')}")
            print(f"   Formatted: {result.get('formatted_value')}")
        else:
            print(f"   Error: {result.get('error')}")
        
        return result
        
    except Exception as e:
        print(f"❌ AI Metric calculation failed: {str(e)}")
        error_message = str(e)
        if "401" in error_message or "403" in error_message or "API key" in error_message:
            error_message += " Please check your API key in Settings."
        
        raise HTTPException(status_code=500, detail=f"Failed to calculate metric: {error_message}")


def _analyze_dataset_with_ai(df: pd.DataFrame, dataset_name: str, api_key: Optional[str] = None, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    """
    AI-Powered Dataset Analysis
    Performs comprehensive dataset analysis combining statistical profiling with AI-generated semantic insights.
    
    Args:
        df: Pandas DataFrame to analyze
        dataset_name: Name of the dataset file
        api_key: Gemini API key for AI analysis
        model: AI model to use for analysis
    
    Returns:
        Dictionary containing:
            - dataset_name: Original filename
            - dataset_summary: AI-generated overall description
            - columns: List of column analysis objects with stats and AI descriptions
            - token_usage: AI token consumption metrics
    
    Process:
        1. Calculate statistical summary for each column
        2. Generate structured schema for AI consumption
        3. Prompt Gemini for semantic analysis
        4. Combine statistical and semantic data
    """
    try:
        print(f"🤖 Starting AI analysis for dataset: {dataset_name}")
        print(f"📊 Dataset shape: {df.shape}")
        
        # Step 1: Calculate statistical summary for each column
        columns_analysis = []
        
        for col in df.columns:
            col_series = df[col]
            
            # Basic statistics
            missing_pct = col_series.isnull().mean() * 100
            unique_count = col_series.nunique()
            total_count = len(col_series)
            
            # Sample values (non-null)
            sample_values = col_series.dropna().sample(min(3, col_series.dropna().shape[0])).tolist() if not col_series.dropna().empty else []
            
            # Type-specific analysis
            variance = None
            if pd.api.types.is_numeric_dtype(col_series):
                variance = float(col_series.var()) if not col_series.var() != col_series.var() else None  # Check for NaN
            
            column_info = {
                "name": col,
                "dtype": str(col_series.dtype),
                "missing_pct": round(missing_pct, 2),
                "unique_count": unique_count,
                "total_count": total_count,
                "variance": variance,
                "sample_values": sample_values,
                "description": ""  # Will be filled by AI
            }
            
            columns_analysis.append(column_info)
        
        # Step 2: Prepare sample data for AI analysis
        # Get first 10 rows as sample to help AI understand content
        sample_rows = df.head(10).to_dict(orient='records')
        
        # Create structured data for AI including actual content
        analysis_data = {
            "dataset_name": dataset_name,
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": columns_analysis,
            "sample_data": sample_rows[:5]  # First 5 rows for context
        }
        
        # Step 3: Generate AI insights using Gemini
        if api_key:
            from gemini_llm import GeminiDataFormulator
            ai_formulator = GeminiDataFormulator(api_key=api_key, model=model)
            
            # Create comprehensive prompt for semantic dataset analysis
            prompt = f"""You are an expert data analyst. Analyze this dataset and provide meaningful, context-aware insights about what the data represents in the real world.

DATASET INFORMATION:
- File: {dataset_name}
- Size: {len(df)} rows, {len(df.columns)} columns

COLUMN DETAILS:
{chr(10).join([f"- {col['name']}: {col['dtype']}, {col['unique_count']} unique values, Sample: {col['sample_values']}" for col in columns_analysis])}

SAMPLE DATA (first 5 rows):
{chr(10).join([f"Row {i+1}: {row}" for i, row in enumerate(sample_rows[:5])])}

INSTRUCTIONS:
1. Look at the column names, data types, AND actual data values to understand what this dataset is about
2. Provide a meaningful dataset summary that describes the REAL-WORLD CONTEXT (e.g., "tiger population data", "sales performance", "customer demographics")
3. For each column, describe what it represents in BUSINESS/DOMAIN terms, not just data types

Focus on SEMANTIC MEANING, not statistical properties. Be specific about the domain/context.

Output ONLY valid JSON in this EXACT format:
{{
  "dataset_summary": "Meaningful 2-3 sentence description focusing on what this data represents in the real world",
  "columns": [
    {{"name": "column1", "description": "Business/domain description of what this column contains"}},
    {{"name": "column2", "description": "Business/domain description of what this column contains"}},
    ...
  ]
}}"""

            try:
                ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt)
                
                print(f"🤖 Raw AI Response: {ai_response[:200]}...")
                
                # Clean and parse AI response
                cleaned_response = ai_response.strip()
                
                # Sometimes Gemini returns markdown code blocks, extract JSON
                if "```json" in cleaned_response:
                    start_idx = cleaned_response.find("```json") + 7
                    end_idx = cleaned_response.find("```", start_idx)
                    if end_idx != -1:
                        cleaned_response = cleaned_response[start_idx:end_idx].strip()
                elif "```" in cleaned_response:
                    start_idx = cleaned_response.find("```") + 3
                    end_idx = cleaned_response.find("```", start_idx)
                    if end_idx != -1:
                        cleaned_response = cleaned_response[start_idx:end_idx].strip()
                
                print(f"🧹 Cleaned Response: {cleaned_response[:200]}...")
                
                # Parse AI response
                ai_data = json.loads(cleaned_response)
                
                # Merge AI descriptions with statistical data
                dataset_summary = ai_data.get("dataset_summary", "This dataset contains structured data for analysis.")
                ai_columns = {col["name"]: col["description"] for col in ai_data.get("columns", [])}
                
                # Update column descriptions
                for col_info in columns_analysis:
                    col_info["description"] = ai_columns.get(col_info["name"], f"Data column containing {col_info['dtype']} values")
                
                print(f"✅ AI analysis completed successfully!")
                print(f"   Dataset summary generated: {len(dataset_summary)} characters")
                print(f"   Column descriptions: {len(ai_columns)} columns processed")
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": dataset_summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage,
                    "success": True
                }
                
            except json.JSONDecodeError as json_error:
                print(f"❌ AI JSON parsing failed: {str(json_error)}")
                print(f"📄 Full AI Response: {ai_response}")
                
                # Still track token usage even if parsing fails
                token_usage_result = token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
                
                # Simple generic fallback descriptions
                for col_info in columns_analysis:
                    dtype = col_info['dtype']
                    unique_count = col_info['unique_count']
                    
                    if dtype in ['object', 'string']:
                        col_info["description"] = f"Text data with {unique_count} unique values"
                    elif dtype in ['int64', 'int32', 'float64', 'float32']:
                        col_info["description"] = f"Numeric data with {unique_count} unique values"
                    else:
                        col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
                
                # Generic dataset summary
                summary = f"Dataset containing {len(df)} rows and {len(df.columns)} columns. AI analysis failed - check API key configuration."
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage_result,
                    "success": False,
                    "error": f"AI response parsing failed: {str(json_error)}"
                }
                
            except Exception as ai_error:
                print(f"❌ AI analysis failed: {str(ai_error)}")
                
                # Still track token usage if available
                token_usage_result = token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
                
                # Simple generic fallback descriptions
                for col_info in columns_analysis:
                    dtype = col_info['dtype']
                    unique_count = col_info['unique_count']
                    
                    if dtype in ['object', 'string']:
                        col_info["description"] = f"Text data with {unique_count} unique values"
                    elif dtype in ['int64', 'int32', 'float64', 'float32']:
                        col_info["description"] = f"Numeric data with {unique_count} unique values"
                    else:
                        col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
                
                # Generic dataset summary  
                summary = f"Dataset containing {len(df)} rows and {len(df.columns)} columns. AI analysis failed - check API key configuration."
                
                return {
                    "dataset_name": dataset_name,
                    "dataset_summary": summary,
                    "columns": columns_analysis,
                    "token_usage": token_usage_result,
                    "success": False,
                    "error": str(ai_error)
                }
        else:
            # No API key provided - simple generic descriptions
            for col_info in columns_analysis:
                dtype = col_info['dtype']
                unique_count = col_info['unique_count']
                
                if dtype in ['object', 'string']:
                    col_info["description"] = f"Text data with {unique_count} unique values"
                elif dtype in ['int64', 'int32', 'float64', 'float32']:
                    col_info["description"] = f"Numeric data with {unique_count} unique values"
                else:
                    col_info["description"] = f"Data column ({dtype}) with {unique_count} unique values"
            
            # Generic dataset summary
            summary = f"Dataset with {len(df)} rows and {len(df.columns)} columns. Configure API key in Settings for detailed AI analysis."
            
            return {
                "dataset_name": dataset_name,
                "dataset_summary": summary,
                "columns": columns_analysis,
                "token_usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                "success": False,
                "error": "No API key provided"
            }
            
    except Exception as e:
        print(f"❌ Dataset analysis failed: {str(e)}")
        return {
            "dataset_name": dataset_name,
            "dataset_summary": "Failed to analyze dataset",
            "columns": [],
            "token_usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
            "success": False,
            "error": str(e)
        }


@app.post("/analyze-dataset")
async def analyze_dataset(request: DatasetAnalysisRequest):
    """
    Dataset Analysis Endpoint
    Performs comprehensive AI-powered analysis of an uploaded dataset.
    Generates semantic column descriptions and dataset summaries.
    
    Features:
        - Statistical profiling (variance, missing values, unique counts)
        - AI-generated semantic descriptions for each column
        - Overall dataset summary using LLM analysis
        - Token usage tracking for cost estimation
    
    Args:
        request: Contains dataset_id, optional api_key, and model selection
    
    Returns:
        Dictionary with dataset analysis results including:
            - dataset_summary: AI-generated description
            - columns: List of column analysis with stats and descriptions
            - token_usage: AI consumption metrics
            - success: Analysis completion status
    
    Process:
        1. Validates dataset exists
        2. Performs pandas statistical analysis
        3. Uses Gemini LLM for semantic understanding
        4. Stores results for future retrieval
    """
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        df = DATASETS[request.dataset_id]
        
        # Get dataset filename from metadata or use ID
        dataset_name = request.dataset_id[:8]
        if request.dataset_id in DATASET_METADATA:
            stored_filename = DATASET_METADATA[request.dataset_id].get("filename")
            if stored_filename:
                dataset_name = stored_filename
        
        print(f"🔍 Starting analysis for dataset: {request.dataset_id}")
        print(f"   Dataset shape: {df.shape}")
        print(f"   API Key provided: {'Yes' if request.api_key else 'No'}")
        print(f"   Model: {request.model}")
        
        # Perform AI analysis
        analysis_result = _analyze_dataset_with_ai(
            df=df,
            dataset_name=dataset_name,
            api_key=request.api_key,
            model=request.model
        )
        
        # Store analysis results for future use
        DATASET_METADATA[request.dataset_id] = analysis_result
        
        print(f"✅ Dataset analysis completed for: {request.dataset_id}")
        print(f"   Success: {analysis_result.get('success', False)}")
        print(f"   Columns analyzed: {len(analysis_result.get('columns', []))}")
        
        return {
            "dataset_id": request.dataset_id,
            "analysis": analysis_result,
            "timestamp": pd.Timestamp.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Dataset analysis failed for {request.dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/save-dataset-metadata")
async def save_dataset_metadata(request: DatasetMetadataSaveRequest):
    """
    Dataset Metadata Save Endpoint
    Persists user-edited dataset summaries and column descriptions.
    Updates stored metadata with user confirmations and modifications.
    
    Features:
        - Saves edited dataset summary
        - Stores confirmed column descriptions
        - Maintains version history for metadata changes
        - Prepares metadata for downstream chart generation
    
    Args:
        request: Contains dataset_id, edited dataset_summary, and column_descriptions dict
    
    Returns:
        Confirmation of successful metadata save
    
    Used by: Frontend upload panel after user edits AI-generated descriptions
    """
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        print(f"💾 Saving metadata for dataset: {request.dataset_id}")
        print(f"   Dataset summary length: {len(request.dataset_summary)}")
        print(f"   Column descriptions: {len(request.column_descriptions)} columns")
        
        # Get existing metadata or create new
        if request.dataset_id in DATASET_METADATA:
            metadata = DATASET_METADATA[request.dataset_id]
        else:
            # Create basic metadata structure if none exists
            df = DATASETS[request.dataset_id]
            metadata = {
                "dataset_name": f"dataset_{request.dataset_id[:8]}",
                "dataset_summary": "",
                "columns": [{"name": col, "description": ""} for col in df.columns],
                "token_usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                "success": True
            }
        
        # Update with user-provided data
        metadata["dataset_summary"] = request.dataset_summary
        
        # Update column descriptions
        for col_info in metadata.get("columns", []):
            col_name = col_info["name"]
            if col_name in request.column_descriptions:
                col_info["description"] = request.column_descriptions[col_name]
        
        # Add save timestamp and mark as user-edited
        metadata["last_updated"] = pd.Timestamp.now().isoformat()
        metadata["user_edited"] = True
        
        # Store updated metadata
        DATASET_METADATA[request.dataset_id] = metadata
        
        print(f"✅ Metadata saved successfully for: {request.dataset_id}")
        
        return {
            "success": True,
            "dataset_id": request.dataset_id,
            "message": "Dataset metadata saved successfully",
            "timestamp": metadata["last_updated"],
            "columns_updated": len(request.column_descriptions)
        }
        
    except Exception as e:
        print(f"❌ Failed to save metadata for {request.dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save metadata: {str(e)}")


@app.get("/dataset/{dataset_id}/metadata")
async def get_dataset_metadata(dataset_id: str):
    """
    Dataset Metadata Retrieval Endpoint
    Returns stored analysis results and user-edited metadata for a dataset.
    
    Args:
        dataset_id: ID of the dataset to retrieve metadata for
    
    Returns:
        Complete metadata including analysis results, column descriptions, and summaries
    
    Used by: Frontend to display existing analysis results and for chart generation context
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    if dataset_id not in DATASET_METADATA:
        raise HTTPException(status_code=404, detail="Dataset metadata not found. Please run analysis first.")
    
    try:
        metadata = DATASET_METADATA[dataset_id]
        
        return {
            "dataset_id": dataset_id,
            "metadata": metadata
        }
        
    except Exception as e:
        print(f"❌ Failed to retrieve metadata for {dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve metadata: {str(e)}")


@app.post("/suggest-charts")
async def suggest_charts(request: ChartSuggestionRequest):
    """
    Chart Suggestion Endpoint
    Generates AI-powered chart recommendations based on user goals and dataset schema.
    Uses Stage 1 metadata and natural language processing to suggest relevant visualizations.
    
    Features:
        - Natural language goal interpretation
        - Context-aware chart type selection
        - Dimension and measure recommendations
        - Importance scoring and insights
        - Token usage tracking
    
    Args:
        request: Contains dataset_id, goal text, optional api_key, and model selection
    
    Returns:
        Dictionary with chart suggestions including:
            - charts: List of suggested chart configurations
            - token_usage: AI consumption metrics
            - success: Generation completion status
    
    Process:
        1. Validates dataset and metadata exist
        2. Constructs comprehensive AI prompt with goal + schema
        3. Uses Gemini LLM for chart recommendations
        4. Validates and processes AI response
    """
    if request.dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    if request.dataset_id not in DATASET_METADATA:
        raise HTTPException(status_code=404, detail="Dataset metadata not found. Please run analysis first.")
    
    try:
        # Get dataset and metadata
        df = DATASETS[request.dataset_id]
        metadata = DATASET_METADATA[request.dataset_id]
        
        # Validate and clamp num_charts to acceptable range (1-5)
        num_charts = max(1, min(5, request.num_charts or 4))
        
        print(f"🎯 Starting chart suggestions for dataset: {request.dataset_id}")
        print(f"   User goal: '{request.goal}'")
        print(f"   Dataset shape: {df.shape}")
        print(f"   Requested charts: {num_charts}")
        print(f"   API Key provided: {'Yes' if request.api_key else 'No'}")
        
        if not request.api_key:
            return ChartSuggestionResponse(
                success=False,
                suggestions=[],
                token_usage={"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                error="API key required for chart suggestions"
            )
        
        # Get available dimensions and measures
        categorized = _categorize_columns(df)
        available_dimensions = categorized["dimensions"]
        available_measures = categorized["measures"]
        
        # Prepare dataset schema for AI
        schema_data = {
            "dataset_name": metadata.get("dataset_name", "dataset"),
            "dataset_summary": metadata.get("dataset_summary", ""),
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "dimensions": available_dimensions,
            "measures": available_measures,
            "columns": metadata.get("columns", [])
        }
        
        # Create AI prompt for chart suggestions
        from gemini_llm import GeminiDataFormulator
        ai_formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        prompt = f"""You are a data analyst. Given the user's goal and dataset schema, recommend the most relevant variable combinations for visualization.

USER GOAL: "{request.goal}"

DATASET INFORMATION:
- Name: {schema_data['dataset_name']} 
- Summary: {schema_data['dataset_summary']}
- Size: {schema_data['total_rows']} rows, {schema_data['total_columns']} columns
- Available Dimensions: {schema_data['dimensions']}
- Available Measures: {schema_data['measures']}

COLUMN DETAILS:
{chr(10).join([f"- {col.get('name', 'unknown')}: {col.get('description', 'no description')}" for col in schema_data['columns']])}

VARIABLE COMBINATION OPTIONS:
1. "dimension_measure": 1 dimension + 1 measure (standard comparison/aggregation)
2. "single_dimension": 1 dimension only (category frequency/counts)  
3. "single_measure": 1 measure only (distribution/histogram)
4. "two_dimensions_one_measure": 2 dimensions + 1 measure (detailed breakdown/heatmap)
5. "one_dimension_two_measures": 1 dimension + 2 measures (comparative analysis/dual-axis)

INSTRUCTIONS:
1. Focus on variable selection that directly addresses the user's goal
2. Suggest exactly {num_charts} DISTINCT variable combinations with different analytical perspectives
   - If the goal doesn't support this many distinct perspectives, suggest the maximum possible with clear reasoning
3. Choose method based on what insights are needed:
   - Compare categories → dimension_measure
   - Show detailed breakdown → two_dimensions_one_measure  
   - Compare multiple metrics → one_dimension_two_measures
   - Understand distribution → single_measure
   - Count frequencies → single_dimension
4. Use only column names that exist in the available dimensions/measures
5. Each suggestion should offer a DIFFERENT analytical angle

OUTPUT FORMAT (JSON only):
{{
  "suggestions": [
    {{
      "method": "dimension_measure|single_dimension|single_measure|two_dimensions_one_measure|one_dimension_two_measures",
      "dimensions": ["column_name1", "column_name2"],
      "measures": ["column_name3"],
      "title": "Descriptive chart title",
      "reasoning": "Why this variable combination helps achieve the goal",
      "importance_score": 1-10
    }}
  ]
}}

FOCUS: Recommend the optimal variables that best answer the user's question, not chart types."""

        try:
            ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt)
            
            print(f"🤖 Raw AI Response: {ai_response[:200]}...")
            
            # Clean and parse AI response (same logic as dataset analysis)
            cleaned_response = ai_response.strip()
            
            if "```json" in cleaned_response:
                start_idx = cleaned_response.find("```json") + 7
                end_idx = cleaned_response.find("```", start_idx)
                if end_idx != -1:
                    cleaned_response = cleaned_response[start_idx:end_idx].strip()
            elif "```" in cleaned_response:
                start_idx = cleaned_response.find("```") + 3
                end_idx = cleaned_response.find("```", start_idx)
                if end_idx != -1:
                    cleaned_response = cleaned_response[start_idx:end_idx].strip()
            
            print(f"🧹 Cleaned Response: {cleaned_response[:200]}...")
            
            # Parse AI response
            ai_data = json.loads(cleaned_response)
            
            # Validate and process variable suggestions with diversity filtering
            validated_suggestions = []
            used_methods = set()
            used_column_combinations = set()
            
            # Sort suggestions by importance score first
            suggestions_sorted = sorted(ai_data.get("suggestions", []), key=lambda x: x.get("importance_score", 0), reverse=True)
            
            for suggestion_data in suggestions_sorted:
                # Validate dimensions and measures exist in dataset
                suggested_dimensions = suggestion_data.get("dimensions", [])
                suggested_measures = suggestion_data.get("measures", [])
                
                valid_dimensions = [dim for dim in suggested_dimensions if dim in available_dimensions]
                valid_measures = [meas for meas in suggested_measures if meas in available_measures]
                
                # Skip if no valid columns or method missing
                method = suggestion_data.get("method", "")
                if not method or not (valid_dimensions or valid_measures):
                    print(f"🔄 Skipping invalid suggestion: method={method}, dims={valid_dimensions}, measures={valid_measures}")
                    continue
                
                column_combo = tuple(sorted(valid_dimensions + valid_measures))
                
                # Filter out duplicates - allow same method if columns are different, same columns if method is different
                is_duplicate_method = method in used_methods
                is_duplicate_columns = column_combo in used_column_combinations
                
                if is_duplicate_method and is_duplicate_columns:
                    print(f"🔄 Filtering out duplicate: {method} with columns {column_combo}")
                    continue
                
                # Add this suggestion as it's sufficiently different
                used_methods.add(method)
                used_column_combinations.add(column_combo)
                
                validated_suggestions.append(VariableSuggestion(
                    method=method,
                    dimensions=valid_dimensions,
                    measures=valid_measures,
                    title=suggestion_data.get("title", "Untitled Chart"),
                    reasoning=suggestion_data.get("reasoning", "No reasoning provided"),
                    importance_score=min(max(suggestion_data.get("importance_score", 5), 1), 10)
                ))
                
                # Limit to user-requested number of suggestions
                if len(validated_suggestions) >= num_charts:
                    break
            
            print(f"✅ Variable suggestions generated successfully!")
            print(f"   Requested: {num_charts}, Generated: {len(validated_suggestions)} variable combinations")
            print(f"   Token usage: {token_usage.get('totalTokens', 0)} tokens")
            
            return ChartSuggestionResponse(
                success=True,
                suggestions=validated_suggestions,
                token_usage=token_usage
            )
            
        except json.JSONDecodeError as json_error:
            print(f"❌ AI JSON parsing failed: {str(json_error)}")
            print(f"📄 Full AI Response: {ai_response}")
            
            return ChartSuggestionResponse(
                success=False,
                suggestions=[],
                token_usage=token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                error=f"Failed to parse AI response: {str(json_error)}"
            )
            
        except Exception as ai_error:
            print(f"❌ AI variable suggestion failed: {str(ai_error)}")
            
            return ChartSuggestionResponse(
                success=False,
                suggestions=[],
                token_usage=token_usage if 'token_usage' in locals() else {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                error=f"AI processing failed: {str(ai_error)}"
            )
            
    except Exception as e:
        print(f"❌ Chart suggestion endpoint failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate chart suggestions: {str(e)}")


@app.post("/list-models")
def list_models(api_key: str) -> List[Dict[str, str]]:
    """
    List Available AI Models Endpoint
    Returns list of available Gemini models for user selection.
    Currently returns a static list of Gemini models.
    """
    # Google Gemini doesn't expose a simple model list API yet.
    return [
        {"label": "Gemini 1.5 Pro", "value": "gemini-1.5-pro"},
        {"label": "Gemini 1.5 Flash", "value": "gemini-1.5-flash"},
        {"label": "Gemini 2.5 Flash", "value": "gemini-2.5-flash"}
    ]

class ChartInsightRequest(BaseModel):
    chart_id: str
    api_key: str
    model: str = "gemini-2.0-flash"
    user_context: Optional[str] = None  # User's original goal/query for context-aware insights

@app.post("/chart-insights")
async def generate_chart_insights(request: ChartInsightRequest):
    """
    Enhanced Chart Insights Generation Endpoint
    Generates AI-powered contextual insights for a chart using dataset analysis.
    Creates structured, business-focused insights with bullet points.
    
    Process:
        1. Retrieves dataset metadata for enhanced context
        2. Calculates basic statistics (min, max, mean, total)
        3. Uses Gemini LLM with dataset context to generate insights
        4. Returns structured bullet-point insights with token usage
    
    Used by: Insight sticky notes feature
    """
    if request.chart_id not in CHARTS:
        raise HTTPException(status_code=404, detail="Chart not found")
    
    chart = CHARTS[request.chart_id]
    dataset = DATASETS.get(chart["dataset_id"])
    
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Clear any stale cached insights for this chart to ensure fresh generation
    # This is especially important for merged charts
    if request.chart_id in CHART_INSIGHTS_CACHE:
        print(f"🗑️  Clearing stale cached insights for chart {request.chart_id}")
        del CHART_INSIGHTS_CACHE[request.chart_id]
    
    # Retrieve dataset metadata for enhanced context
    dataset_id = chart["dataset_id"]
    dataset_metadata = None
    if dataset_id in DATASET_METADATA:
        dataset_metadata = DATASET_METADATA[dataset_id]
        if dataset_metadata and dataset_metadata.get('success'):
            print(f"📊 Using enhanced dataset context for chart insights: {len(dataset_metadata.get('columns', []))} columns analyzed")
        else:
            print("📊 Dataset metadata found but incomplete - using basic analysis")
            dataset_metadata = None
    else:
        print(f"📊 No dataset metadata found for {dataset_id[:8]}... - using basic statistical analysis")
    
    # Create enhanced statistical summary prompt
    dimensions = chart.get("dimensions", [])
    measures = chart.get("measures", [])
    table_data = chart.get("table", [])
    
    # Debug logging for merged charts
    print(f"📊 Chart Insights Debug:")
    print(f"   - Chart ID: {request.chart_id}")
    print(f"   - Title: {chart.get('title', 'Untitled')}")
    print(f"   - Dimensions: {dimensions}")
    print(f"   - Measures: {measures}")
    print(f"   - Total rows: {len(table_data)}")
    if table_data:
        print(f"   - Sample row: {table_data[0]}")
    
    # Calculate basic statistics
    stats = {}
    for measure in measures:
        values = [row.get(measure, 0) for row in table_data if isinstance(row.get(measure), (int, float))]
        if values:
            stats[measure] = {
                "min": min(values),
                "max": max(values),
                "mean": sum(values) / len(values),
                "total": sum(values)
            }
    
    # Build enhanced context from dataset metadata if available
    enhanced_context = ""
    if dataset_metadata and dataset_metadata.get('success'):
        dataset_summary = dataset_metadata.get('dataset_summary', '')
        columns_with_descriptions = dataset_metadata.get('columns', [])
        
        if dataset_summary and dataset_summary.strip():
            enhanced_context += f"\nDATASET CONTEXT & BUSINESS DOMAIN:\n- Purpose: {dataset_summary.strip()}\n"
        
        if columns_with_descriptions and len(columns_with_descriptions) > 0:
            enhanced_context += "\nCOLUMN MEANINGS & CONTEXT:\n"
            column_desc_map = {col.get('name'): col.get('description', '') for col in columns_with_descriptions if col.get('name') and col.get('description')}
            
            # Only show descriptions for columns that appear in this chart
            chart_columns = set(dimensions + measures)
            for col in chart_columns:
                col_desc = column_desc_map.get(col, 'Standard data column')
                if col_desc and col_desc.strip():
                    enhanced_context += f"- {col}: {col_desc.strip()}\n"
    
    # Generate insight using Gemini with enhanced context
    formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
    
    context_type = 'with enhanced business context' if enhanced_context.strip() else 'with basic statistical analysis'
    print(f"🤖 Generating chart insights {context_type}...")
    
    # For insights, send all data points (up to 50 rows for token efficiency)
    # This ensures merged charts have complete data for accurate insights
    data_sample_size = min(50, len(table_data))
    data_sample = table_data[:data_sample_size]
    data_note = f"All {len(table_data)} data points:" if len(table_data) <= data_sample_size else f"Top {data_sample_size} of {len(table_data)} data points:"
    
    # Build prompt based on whether user_context is provided
    has_context = bool(request.user_context and request.user_context.strip())
    
    if has_context:
        # Context-aware insights mode: generate separated insights
        print(f"🎯 Generating context-aware insights for user goal: '{request.user_context}'")
        prompt = f"""You are a data analyst. Generate insights for this chart in TWO separate sections.

USER'S ORIGINAL GOAL: "{request.user_context}"
{enhanced_context}
CHART ANALYSIS:
- Chart Title: {chart.get('title', 'Untitled Chart')}
- Dimensions (Categories): {dimensions}
- Measures (Metrics): {measures}
- Statistical Summary: {json.dumps(stats, indent=2)}

{data_note}
{json.dumps(data_sample, indent=2)}

IMPORTANT: Only reference data points that exist in the data provided above. Do not invent or hallucinate product names or values.

Generate insights in TWO sections with this EXACT format:

CONTEXT-AWARE INSIGHTS:
• [Insight directly related to the user's goal above]
• [Another insight addressing the user's goal]

GENERIC INSIGHTS:
• [Data pattern or trend with specific numbers]
• [Notable finding about performance, outliers, or comparison]
• [Additional pattern or interesting data observation if needed]

Use simple, clear language. Focus on describing what the data shows. Include specific numbers when relevant.
Keep insights CONCISE - provide 2-3 bullet points per section.
Provide ONLY the two labeled sections with bullet points, no other text."""
    else:
        # Standard insights mode: generate single set of insights
        prompt = f"""You are a data analyst. Generate key insights for this chart using bullet points that clearly describe what the data shows.
{enhanced_context}
CHART ANALYSIS:
- Chart Title: {chart.get('title', 'Untitled Chart')}
- Dimensions (Categories): {dimensions}
- Measures (Metrics): {measures}
- Statistical Summary: {json.dumps(stats, indent=2)}

{data_note}
{json.dumps(data_sample, indent=2)}

IMPORTANT: Only reference data points that exist in the data provided above. Do not invent or hallucinate product names or values.

Generate 2-3 key insights in this EXACT format:
• [Data pattern or trend with specific numbers]
• [Notable finding about performance, outliers, or comparison]
• [Additional pattern or interesting data observation if needed]

Use simple, clear language. Focus on describing what the data shows. Include specific numbers when relevant.
Keep insights CONCISE - provide only 2-3 bullet points.
Provide ONLY the bullet points, no headers or additional text."""

    response, token_usage = formulator.run_gemini_with_usage(prompt)
    
    # Parse response based on mode
    context_insights = ""
    generic_insights = ""
    
    if has_context:
        # Split response into two sections
        response_text = response.strip()
        
        # Try to extract the two sections
        if "CONTEXT-AWARE INSIGHTS:" in response_text and "GENERIC INSIGHTS:" in response_text:
            parts = response_text.split("GENERIC INSIGHTS:")
            context_part = parts[0].replace("CONTEXT-AWARE INSIGHTS:", "").strip()
            generic_part = parts[1].strip()
            
            context_insights = context_part
            generic_insights = generic_part
        else:
            # Fallback: if sections not properly separated, split by line count
            lines = [line.strip() for line in response_text.split('\n') if line.strip().startswith('•')]
            mid = len(lines) // 2
            context_insights = '\n'.join(lines[:mid]) if mid > 0 else response_text
            generic_insights = '\n'.join(lines[mid:]) if mid > 0 else ""
    else:
        # Standard mode: all insights are generic
        generic_insights = response.strip()
    
    # Build response
    insights_result = {
        "success": True,
        "context_insights": context_insights,
        "generic_insights": generic_insights,
        "has_context": has_context,
        "insight": response.strip(),  # Keep for backward compatibility
        "statistics": stats,
        "token_usage": token_usage,
        "enhanced_context_used": bool(enhanced_context.strip()),
        "generated_at": pd.Timestamp.now().isoformat()
    }
    
    # Store in cache for report generation reuse
    CHART_INSIGHTS_CACHE[request.chart_id] = insights_result
    print(f"📋 Cached chart insights for {request.chart_id}")
    
    return insights_result

