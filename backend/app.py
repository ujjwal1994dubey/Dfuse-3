from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, AsyncGenerator
import pandas as pd
import numpy as np
import io
import uuid
import re
import ast
import operator
import json
import os
import asyncio
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from gemini_llm import GeminiDataFormulator, build_merged_dataset, find_primary_dataset
from supabase import create_client, Client

# Load environment variables from .env file (for local development)
load_dotenv()

# -----------------------
# Supabase Configuration
# -----------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase client (will be None if credentials not set)
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY and SUPABASE_URL != "https://your-project-id.supabase.co":
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized successfully")
    except Exception as e:
        print(f"⚠️ Failed to initialize Supabase client: {e}")
else:
    print("⚠️ Supabase credentials not configured - login tracking disabled")

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
    allow_origins=[
        "http://localhost:3000",  # Local development
        "https://dfusenew.onrender.com",  # Your actual frontend URL
        "https://dfusenew-backend.onrender.com"   # Backend URL
    ],
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
CONVERSATION_STORE: Dict[str, List[Dict[str, Any]]] = {}  # session_id -> list of conversation turns
CONVERSATION_MAX_TURNS = 10  # Keep last N turns in context (keeps token count bounded)
DATASET_RELATIONSHIPS: List[Dict[str, Any]] = []  # Cross-dataset relationship links
MERGED_DATASETS: Dict[str, Dict[str, Any]] = {}   # merged_id -> {primary_id, source_names, ...}

def build_schema_context(
    dataset_ids: List[str],
    datasets: Dict[str, pd.DataFrame],
    dataset_metadata: Dict[str, Any],
    relationships: List[Dict[str, Any]],
) -> dict:
    """
    Builds a compact schema context dict for plan_query().
    Uses only column names (no sample data) to keep the prompt small.
    """
    ds_context: Dict[str, Any] = {}
    for did in dataset_ids:
        if did not in datasets:
            continue
        df   = datasets[did]
        meta = dataset_metadata.get(did, {})
        ds_context[did] = {
            "name":    meta.get("dataset_name") or meta.get("filename") or did[:8],
            "columns": list(df.columns),
            "column_descriptions": {
                c["name"]: c.get("description", "")
                for c in meta.get("columns", [])
                if c.get("description")
            },
        }
    id_set = set(dataset_ids)
    relevant_rels = [
        r for r in relationships
        if r.get("dataset_a_id") in id_set
        and r.get("dataset_b_id") in id_set
        and r.get("status") == "accepted"
    ]
    return {"datasets": ds_context, "relationships": relevant_rels}


# Keywords used to classify result columns as dimensions or measures
_DIM_KEYWORDS  = {"id", "identifier", "code", "name", "category",
                  "type", "date", "region", "country", "status", "label",
                  "group", "segment", "class", "brand", "product", "city",
                  "state", "gender", "department", "location", "month",
                  "year", "quarter", "week", "day", "period"}
_MEAS_KEYWORDS = {"amount", "revenue", "price", "total", "count",
                  "quantity", "rate", "percent", "ratio", "sales",
                  "cost", "profit", "value", "score", "avg", "average",
                  "sum", "budget", "spend", "income", "loss", "gain",
                  "margin", "fee", "salary", "weight", "distance", "age"}


def _infer_col_type(col: str, result_df: "pd.DataFrame", source_col_lookup: dict) -> str:
    """
    Infer whether a result column is a 'dimension' or 'measure'.

    Priority:
      1. AI/user-edited description from source DATASET_METADATA (keyword match)
      2. Column name itself (keyword match)
      3. dtype fallback (non-numeric → dimension, numeric → measure)
    """
    desc = source_col_lookup.get(col, "").lower()
    col_lower = col.lower()
    combined = f"{desc} {col_lower}"

    if any(k in combined for k in _DIM_KEYWORDS):
        return "dimension"
    if any(k in combined for k in _MEAS_KEYWORDS):
        return "measure"

    dtype = result_df[col].dtype
    return "dimension" if not pd.api.types.is_numeric_dtype(dtype) else "measure"


@app.get("/")
async def root():
    return {"message": "D.fuse Backend API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": "2024-01-01"}

# -----------------------
# User Authentication & Tracking
# -----------------------
# Local JSON fallback store (used when Supabase tables don't exist yet)
# Data is persisted in backend/local_store.json between server restarts.
# -----------------------
_LOCAL_STORE_PATH = os.path.join(os.path.dirname(__file__), "local_store.json")

def _load_local_store() -> dict:
    try:
        if os.path.exists(_LOCAL_STORE_PATH):
            with open(_LOCAL_STORE_PATH, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {"canvases": {}, "schemas": {}}

def _save_local_store(store: dict):
    try:
        with open(_LOCAL_STORE_PATH, "w") as f:
            json.dump(store, f, indent=2)
    except Exception as e:
        print(f"⚠️  Could not save local store: {e}")

_local_store = _load_local_store()


def _is_supabase_table_error(e: Exception) -> bool:
    """Return True if the exception is a Supabase/PostgreSQL 'table not found', schema cache, or RLS error."""
    msg = str(e).lower()
    return any(k in msg for k in (
        "does not exist", "42p01", "pgrst205", "schema cache",
        "could not find the table", "relation", "permission denied", "rls"
    ))


# -----------------------
class UserLoginRequest(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

@app.post("/auth/login")
async def record_user_login(user: UserLoginRequest):
    """Record a user login event to Supabase for tracking purposes"""
    login_record = {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "login_time": datetime.now().isoformat(),
    }
    
    if supabase:
        try:
            # Insert into Supabase
            result = supabase.table("user_logins").insert(login_record).execute()
            login_id = result.data[0]["id"] if result.data else None
            print(f"✅ User login recorded: {user.email} ({user.name}) - ID: {login_id}")
            return {
                "success": True,
                "message": f"Login recorded for {user.email}",
                "login_id": login_id,  # Return UUID for session tracking
                "data": result.data
            }
        except Exception as e:
            print(f"❌ Failed to record login: {e}")
            # Don't fail the login if tracking fails
            return {
                "success": False,
                "message": f"Login tracking failed: {str(e)}",
                "error": str(e)
            }
    else:
        print(f"⚠️ Supabase not configured - login not tracked: {user.email}")
        return {
            "success": False,
            "message": "Supabase not configured - login tracking disabled"
        }

@app.get("/auth/logins")
async def get_login_history(limit: int = 100):
    """Get login history from Supabase (for admin/tracking purposes)"""
    if supabase:
        try:
            result = supabase.table("user_logins")\
                .select("*")\
                .order("login_time", desc=True)\
                .limit(limit)\
                .execute()
            
            # Get unique user count
            unique_result = supabase.table("user_logins")\
                .select("email")\
                .execute()
            unique_emails = set(record["email"] for record in unique_result.data)
            
            return {
                "success": True,
                "total_logins": len(result.data),
                "unique_users": len(unique_emails),
                "logins": result.data
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch logins: {str(e)}")
    else:
        raise HTTPException(status_code=503, detail="Supabase not configured")

@app.get("/auth/users")
async def get_unique_users():
    """Get list of unique users who have logged in"""
    if supabase:
        try:
            # Get all logins and aggregate by email
            result = supabase.table("user_logins")\
                .select("email, name, picture, login_time")\
                .order("login_time", desc=True)\
                .execute()
            
            # Group by email, keeping latest login info
            users_dict = {}
            for record in result.data:
                email = record["email"]
                if email not in users_dict:
                    users_dict[email] = {
                        "email": email,
                        "name": record["name"],
                        "picture": record["picture"],
                        "last_login": record["login_time"],
                        "login_count": 1
                    }
                else:
                    users_dict[email]["login_count"] += 1
            
            return {
                "success": True,
                "total_users": len(users_dict),
                "users": list(users_dict.values())
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")
    else:
        raise HTTPException(status_code=503, detail="Supabase not configured")

@app.post("/auth/logout")
async def record_user_logout(user: UserLoginRequest):
    """Record when a user logs out (optional tracking)"""
    print(f"👋 User logged out: {user.email}")
    return {"success": True, "message": f"Logout recorded for {user.email}"}

# -----------------------
# Session Usage Tracking
# -----------------------
class SessionStartRequest(BaseModel):
    login_id: str  # UUID from user_logins table

class SessionUpdateRequest(BaseModel):
    session_id: str
    charts_created_manually: int = 0
    charts_created_using_ai: int = 0
    tables_created: int = 0
    ai_insights_generated: int = 0
    charts_merged: int = 0
    ai_feature_used: int = 0
    total_tokens: int = 0
    canvas_objects: int = 0
    is_active: Optional[bool] = True
    session_end: Optional[str] = None

@app.post("/session/start")
async def start_session(data: SessionStartRequest):
    """Start a new user session linked to login record"""
    if supabase:
        try:
            # Use local time for session_start
            local_time = datetime.now().isoformat()
            
            result = supabase.table("user_sessions").insert({
                "login_id": data.login_id,
                "is_active": True,
                "session_start": local_time
            }).execute()
            
            if result.data:
                session_id = result.data[0]["id"]
                print(f"📊 Session started: {session_id}")
                return {"success": True, "session_id": session_id}
            return {"success": False, "error": "No data returned"}
        except Exception as e:
            print(f"❌ Failed to start session: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Supabase not configured"}

@app.post("/session/update")
async def update_session(data: SessionUpdateRequest):
    """Update session metrics"""
    if supabase:
        try:
            update_data = {
                "charts_created_manually": data.charts_created_manually,
                "charts_created_using_ai": data.charts_created_using_ai,
                "tables_created": data.tables_created,
                "ai_insights_generated": data.ai_insights_generated,
                "charts_merged": data.charts_merged,
                "ai_feature_used": data.ai_feature_used,
                "total_tokens": data.total_tokens,
                "canvas_objects": data.canvas_objects,
            }
            
            if data.session_end:
                update_data["session_end"] = data.session_end
                update_data["is_active"] = False
            
            result = supabase.table("user_sessions")\
                .update(update_data)\
                .eq("id", data.session_id)\
                .execute()
            
            return {"success": True}
        except Exception as e:
            print(f"❌ Failed to update session: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Supabase not configured"}

@app.post("/session/end")
async def end_session(data: SessionUpdateRequest):
    """End a user session with final metrics"""
    if supabase:
        try:
            result = supabase.table("user_sessions")\
                .update({
                    "charts_created_manually": data.charts_created_manually,
                    "charts_created_using_ai": data.charts_created_using_ai,
                    "tables_created": data.tables_created,
                    "ai_insights_generated": data.ai_insights_generated,
                    "charts_merged": data.charts_merged,
                    "ai_feature_used": data.ai_feature_used,
                    "total_tokens": data.total_tokens,
                    "canvas_objects": data.canvas_objects,
                    "session_end": datetime.now().isoformat(),
                    "is_active": False
                })\
                .eq("id", data.session_id)\
                .execute()
            
            print(f"📊 Session ended: {data.session_id}")
            return {"success": True}
        except Exception as e:
            print(f"❌ Failed to end session: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Supabase not configured"}

@app.get("/session/history")
async def get_session_history(email: Optional[str] = None, limit: int = 50):
    """Get session history with user details (join with user_logins)"""
    if supabase:
        try:
            # Query sessions with login info via join
            query = supabase.table("user_sessions")\
                .select("*, user_logins(email, name, login_time)")\
                .order("session_start", desc=True)\
                .limit(limit)
            
            result = query.execute()
            
            # Filter by email if provided (post-processing since Supabase doesn't support filtering on joined fields easily)
            sessions = result.data
            if email:
                sessions = [s for s in sessions if s.get("user_logins", {}).get("email") == email]
            
            return {"success": True, "sessions": sessions}
        except Exception as e:
            print(f"❌ Failed to fetch session history: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Supabase not configured"}

# -----------------------
# Canvas CRUD
# -----------------------

class CanvasCreateRequest(BaseModel):
    user_id: str
    name: str = "Untitled Canvas"

class CanvasUpdateRequest(BaseModel):
    name: Optional[str] = None
    canvas_state: Optional[dict] = None
    node_count: Optional[int] = None
    thumbnail_svg: Optional[str] = None

@app.get("/canvases")
async def list_canvases(user_id: str):
    """List all canvases for a user. Falls back to local JSON store when Supabase table is unavailable."""
    if supabase:
        try:
            result = supabase.table("canvases")\
                .select("id,user_id,name,node_count,thumbnail_svg,created_at,updated_at")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .execute()
            return {"success": True, "data": result.data}
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase canvases table unavailable, using local store: {e}")
    # Local fallback
    canvases = [c for c in _local_store.get("canvases", {}).values() if c.get("user_id") == user_id]
    canvases.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return {"success": True, "data": canvases}

@app.post("/canvases")
async def create_canvas(req: CanvasCreateRequest):
    """Create a new canvas record. Falls back to local JSON store when Supabase table is unavailable."""
    if supabase:
        try:
            result = supabase.table("canvases").insert({
                "user_id": req.user_id,
                "name": req.name,
                "canvas_state": {},
                "node_count": 0,
            }).execute()
            if result.data:
                return {"success": True, "data": result.data[0]}
            raise HTTPException(status_code=500, detail="Insert returned no data")
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase canvases table unavailable, using local store: {e}")
    # Local fallback
    now = datetime.now().isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": req.user_id,
        "name": req.name,
        "canvas_state": {},
        "node_count": 0,
        "thumbnail_svg": None,
        "created_at": now,
        "updated_at": now,
    }
    _local_store.setdefault("canvases", {})[record["id"]] = record
    _save_local_store(_local_store)
    return {"success": True, "data": record}

@app.get("/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    """Get a single canvas including its full state. Falls back to local JSON store."""
    if supabase:
        try:
            result = supabase.table("canvases").select("*").eq("id", canvas_id).execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Canvas not found")
            return {"success": True, "data": result.data[0]}
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase canvases table unavailable, using local store: {e}")
    # Local fallback
    record = _local_store.get("canvases", {}).get(canvas_id)
    if not record:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return {"success": True, "data": record}

@app.put("/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, req: CanvasUpdateRequest):
    """Update canvas name, state, node count, or thumbnail. Falls back to local JSON store."""
    from datetime import timezone
    now = datetime.now(timezone.utc).isoformat()
    if supabase:
        try:
            updates = {"updated_at": now}
            if req.name is not None:
                updates["name"] = req.name
            if req.canvas_state is not None:
                updates["canvas_state"] = req.canvas_state
            if req.node_count is not None:
                updates["node_count"] = req.node_count
            if req.thumbnail_svg is not None:
                updates["thumbnail_svg"] = req.thumbnail_svg
            result = supabase.table("canvases").update(updates).eq("id", canvas_id).execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Canvas not found")
            return {"success": True, "data": result.data[0]}
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase canvases table unavailable, using local store: {e}")
    # Local fallback
    record = _local_store.get("canvases", {}).get(canvas_id)
    if not record:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if req.name is not None:
        record["name"] = req.name
    if req.canvas_state is not None:
        record["canvas_state"] = req.canvas_state
    if req.node_count is not None:
        record["node_count"] = req.node_count
    if req.thumbnail_svg is not None:
        record["thumbnail_svg"] = req.thumbnail_svg
    record["updated_at"] = now
    _save_local_store(_local_store)
    return {"success": True, "data": record}

@app.delete("/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str):
    """Delete a canvas. Falls back to local JSON store."""
    if supabase:
        try:
            supabase.table("canvases").delete().eq("id", canvas_id).execute()
            return {"success": True}
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase canvases table unavailable, using local store: {e}")
    # Local fallback
    _local_store.get("canvases", {}).pop(canvas_id, None)
    _save_local_store(_local_store)
    return {"success": True}

# -----------------------
# Schema CRUD
# -----------------------

class SchemaCreateRequest(BaseModel):
    user_id: str
    name: str = "Untitled Schema"
    file_count: int = 0
    record_count: int = 0
    relationships: Optional[List[dict]] = []
    merged_dataset_id: Optional[str] = None

class SchemaUpdateRequest(BaseModel):
    name: Optional[str] = None
    relationships: Optional[List[dict]] = None
    merged_dataset_id: Optional[str] = None

@app.get("/schemas")
async def list_schemas(user_id: str):
    """List all schemas for a user. Falls back to local JSON store when Supabase table is unavailable."""
    if supabase:
        try:
            result = supabase.table("schemas")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .execute()
            return {"success": True, "data": result.data}
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase schemas table unavailable, using local store: {e}")
    # Local fallback
    schemas = [s for s in _local_store.get("schemas", {}).values() if s.get("user_id") == user_id]
    schemas.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return {"success": True, "data": schemas}

@app.post("/schemas")
async def create_schema(req: SchemaCreateRequest):
    """Save a new schema record after flat-table creation. Falls back to local JSON store."""
    if supabase:
        try:
            result = supabase.table("schemas").insert({
                "user_id": req.user_id,
                "name": req.name,
                "file_count": req.file_count,
                "record_count": req.record_count,
                "relationships": req.relationships or [],
                "merged_dataset_id": req.merged_dataset_id,
            }).execute()
            if result.data:
                return {"success": True, "data": result.data[0]}
            raise HTTPException(status_code=500, detail="Insert returned no data")
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase schemas table unavailable, using local store: {e}")
    # Local fallback
    now = datetime.now().isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": req.user_id,
        "name": req.name,
        "file_count": req.file_count,
        "record_count": req.record_count,
        "relationships": req.relationships or [],
        "merged_dataset_id": req.merged_dataset_id,
        "created_at": now,
        "updated_at": now,
    }
    _local_store.setdefault("schemas", {})[record["id"]] = record
    _save_local_store(_local_store)
    print(f"✅ Schema saved to local store: {record['name']} ({record['id']})")
    return {"success": True, "data": record}

@app.get("/schemas/{schema_id}")
async def get_schema(schema_id: str):
    """Get a single schema. Falls back to local JSON store."""
    if supabase:
        try:
            result = supabase.table("schemas").select("*").eq("id", schema_id).execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Schema not found")
            return {"success": True, "data": result.data[0]}
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase schemas table unavailable, using local store: {e}")
    # Local fallback
    record = _local_store.get("schemas", {}).get(schema_id)
    if not record:
        raise HTTPException(status_code=404, detail="Schema not found")
    return {"success": True, "data": record}

@app.post("/schemas/{schema_id}/connect")
async def connect_schema_to_session(schema_id: str):
    """
    Connect a schema to the current session.

    Matches each source file referenced in the schema's relationships to a
    currently-uploaded dataset (by filename, case-insensitive, .csv-agnostic).
    If all source files are found in the session, builds a merged dataset on-demand
    and returns it so the frontend can set it as the active dataset.

    Returns:
        { success: True,  merged_dataset: {...} }          — all files matched
        { success: False, missing_files: ["orders.csv"] }  — some files not uploaded
    """
    # ── 1. Load schema record ─────────────────────────────────────────────────
    schema_record = None
    if supabase:
        try:
            result = supabase.table("schemas").select("*").eq("id", schema_id).execute()
            if result.data:
                schema_record = result.data[0]
        except Exception:
            pass
    if schema_record is None:
        schema_record = _local_store.get("schemas", {}).get(schema_id)
    if not schema_record:
        raise HTTPException(status_code=404, detail="Schema not found")

    relationships = schema_record.get("relationships") or []
    if not relationships:
        raise HTTPException(status_code=400, detail="Schema has no relationships defined.")

    # ── 2. Collect unique source file names from relationships ────────────────
    # Each relationship has dataset_a_name / dataset_b_name (the original CSV filenames)
    source_names: set = set()
    for rel in relationships:
        if rel.get("dataset_a_name"):
            source_names.add(rel["dataset_a_name"].strip())
        if rel.get("dataset_b_name"):
            source_names.add(rel["dataset_b_name"].strip())

    def _norm(name: str) -> str:
        """Normalise filename for matching: lowercase, strip .csv/.xlsx extension."""
        return re.sub(r'\.(csv|xlsx?)$', '', name.strip().lower())

    # ── 3. Match source names to current session datasets ─────────────────────
    session_by_norm: Dict[str, str] = {}  # normalised_name → dataset_id
    for did, meta in DATASET_METADATA.items():
        if did in MERGED_DATASETS:
            continue  # skip merged pseudo-datasets
        fname = meta.get("filename") or meta.get("dataset_name") or ""
        session_by_norm[_norm(fname)] = did

    resolved: Dict[str, str] = {}   # original_name → current_session_dataset_id
    missing: List[str] = []
    for name in source_names:
        sid = session_by_norm.get(_norm(name))
        if sid:
            resolved[name] = sid
        else:
            missing.append(name)

    if missing:
        print(f"⚠️  /schemas/{schema_id}/connect: missing files in session: {missing}")
        return {"success": False, "missing_files": missing}

    print(f"✅ /schemas/{schema_id}/connect: all source files resolved — {list(resolved.keys())}")

    # ── 4. Build resolved relationships with current session IDs ──────────────
    resolved_rels: List[Dict[str, Any]] = []
    for rel in relationships:
        a_name = rel.get("dataset_a_name", "")
        b_name = rel.get("dataset_b_name", "")
        new_a_id = resolved.get(a_name.strip()) or resolved.get(_norm(a_name))
        new_b_id = resolved.get(b_name.strip()) or resolved.get(_norm(b_name))
        if not new_a_id or not new_b_id:
            continue
        resolved_rels.append({
            **rel,
            "dataset_a_id": new_a_id,
            "dataset_b_id": new_b_id,
            "status": "accepted",
            "link_id": str(uuid.uuid4()),
        })

    if not resolved_rels:
        raise HTTPException(status_code=400, detail="Could not resolve any relationships from uploaded datasets.")

    # ── 5. Inject resolved relationships into session DATASET_RELATIONSHIPS ───
    # Remove stale entries for these dataset IDs, then add the resolved ones
    resolved_ids = set(resolved.values())
    DATASET_RELATIONSHIPS[:] = [
        r for r in DATASET_RELATIONSHIPS
        if r.get("dataset_a_id") not in resolved_ids
        and r.get("dataset_b_id") not in resolved_ids
    ]
    DATASET_RELATIONSHIPS.extend(resolved_rels)

    # ── 6. Build source dataset info from session metadata ────────────────────
    source_datasets = []
    for name, did in resolved.items():
        df   = DATASETS.get(did)
        meta = DATASET_METADATA.get(did, {})
        dims = [c for c in (df.columns if df is not None else [])
                if df is not None and (df[c].dtype == object or str(df[c].dtype).startswith("datetime"))]
        meas = [c for c in (df.columns if df is not None else [])
                if df is not None and df[c].dtype in ["int64", "float64"]]
        source_datasets.append({
            "id":         did,
            "filename":   meta.get("filename") or name,
            "dimensions": dims,
            "measures":   meas,
            "rows":       len(df) if df is not None else 0,
            "isMerged":   False,
        })

    print(
        f"✅ Schema '{schema_record['name']}' connected — "
        f"{len(source_datasets)} source tables, {len(resolved_rels)} relationships injected"
    )
    return {
        "success":              True,
        "source_datasets":      source_datasets,
        "resolved_relationships": resolved_rels,
        "schema_name":          schema_record.get("name", ""),
    }


@app.put("/schemas/{schema_id}")
async def update_schema(schema_id: str, req: SchemaUpdateRequest):
    """Update a schema's metadata. Falls back to local JSON store."""
    from datetime import timezone
    now = datetime.now(timezone.utc).isoformat()
    if supabase:
        try:
            updates = {"updated_at": now}
            if req.name is not None:
                updates["name"] = req.name
            if req.relationships is not None:
                updates["relationships"] = req.relationships
            if req.merged_dataset_id is not None:
                updates["merged_dataset_id"] = req.merged_dataset_id
            result = supabase.table("schemas").update(updates).eq("id", schema_id).execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Schema not found")
            return {"success": True, "data": result.data[0]}
        except HTTPException:
            raise
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase schemas table unavailable, using local store: {e}")
    # Local fallback
    record = _local_store.get("schemas", {}).get(schema_id)
    if not record:
        raise HTTPException(status_code=404, detail="Schema not found")
    if req.name is not None:
        record["name"] = req.name
    if req.relationships is not None:
        record["relationships"] = req.relationships
    if req.merged_dataset_id is not None:
        record["merged_dataset_id"] = req.merged_dataset_id
    record["updated_at"] = now
    _save_local_store(_local_store)
    return {"success": True, "data": record}

@app.delete("/schemas/{schema_id}")
async def delete_schema(schema_id: str):
    """Delete a schema record. Falls back to local JSON store."""
    if supabase:
        try:
            supabase.table("schemas").delete().eq("id", schema_id).execute()
            return {"success": True}
        except Exception as e:
            if not _is_supabase_table_error(e):
                raise HTTPException(status_code=500, detail=str(e))
            print(f"⚠️  Supabase schemas table unavailable, using local store: {e}")
    # Local fallback
    _local_store.get("schemas", {}).pop(schema_id, None)
    _save_local_store(_local_store)
    return {"success": True}

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
    sort_order: Optional[str] = "dataset"  # Sort order for categorical data: "dataset", "ascending", "descending"
    is_derived: bool = False  # True for query-engine–generated charts with pre-joined/aggregated data

class SmartChartRequest(BaseModel):
    user_request: str                     # Natural language chart description
    dataset_id: Optional[str] = None      # Optional hint — falls back to all loaded datasets
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

class FuseRequest(BaseModel):
    chart1_id: str
    chart2_id: str

class FuseWithAIRequest(BaseModel):
    chart1_id: str
    chart2_id: str
    user_goal: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

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
    chart_id: Optional[str] = None  # Optional - for chart-specific context
    dataset_id: Optional[str] = None  # Optional - for dataset-level queries
    user_query: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"
    confirmed_relationships: Optional[List[Dict[str, Any]]] = None  # Cross-dataset schema links

class ChartTransformRequest(BaseModel):
    """Request model for chart transformation"""
    chart_id: str
    user_prompt: str
    api_key: str
    model: str = "gemini-2.5-flash"

class MetricCalculationRequest(BaseModel):
    user_query: str
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

class ConfigTestRequest(BaseModel):
    api_key: str
    model: str = "gemini-2.5-flash"

class DatasetAnalysisRequest(BaseModel):
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

class DatasetMetadataSaveRequest(BaseModel):
    dataset_id: str
    dataset_summary: str
    column_descriptions: Dict[str, str]

class ChartSuggestionRequest(BaseModel):
    dataset_id: str
    goal: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"
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

class AgentQueryRequest(BaseModel):
    user_query: str
    canvas_state: Dict[str, Any]
    dataset_id: str
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"
    mode: str = "canvas"  # 'canvas' or 'ask'
    analysis_type: str = "detailed"  # 'raw' or 'detailed' (Ask mode only)
    session_id: Optional[str] = None  # Persistent session for conversation memory
    conversation_history: Optional[List[Dict[str, Any]]] = None  # Previous turns from client
    confirmed_relationships: Optional[List[Dict[str, Any]]] = None  # Cross-dataset schema links

class EnrichRelationshipsRequest(BaseModel):
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

class BatchAnalyzeRequest(BaseModel):
    dataset_ids: Optional[List[str]] = None  # None = all loaded source datasets
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"

class ConfirmRelationshipsRequest(BaseModel):
    decisions: Dict[str, str]  # {link_id: "accepted" | "rejected"}
    edited_links: Optional[Dict[str, Dict[str, str]]] = None  # {link_id: {col_a, col_b}}
    build_merge: bool = True  # set False in schema-creation flow to skip eager flat-table build

class JoinPreviewRequest(BaseModel):
    primary_dataset_id: str
    confirmed_relationships: List[Dict[str, Any]]

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

def _agg(df: pd.DataFrame, dimensions: List[str], measures: List[str], agg: str = "sum", sort_order: str = "dataset") -> pd.DataFrame:
    """
    Aggregation Helper
    Performs data aggregation across specified dimensions and measures.
    Supports sum, avg, min, max, and count aggregations.
    
    Args:
        df: Source DataFrame
        dimensions: List of columns to group by
        measures: List of numeric columns to aggregate
        agg: Aggregation method ('sum', 'avg', 'min', 'max', 'count')
        sort_order: Sort order for dimension values ('dataset', 'ascending', 'descending')
    
    Returns:
        Aggregated DataFrame
    
    Special Cases:
        - count aggregation doesn't require measures
        - Maps 'avg' to pandas 'mean'
        - Handles both grouped and non-grouped aggregations
        - Applies sorting based on sort_order parameter
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
            grouped = df.groupby(dimensions, sort=False).size().reset_index(name="count")
        else:
            grouped = pd.DataFrame({"count": [len(df)]})
        
        # Apply sorting after aggregation (for count, use 'count' as measure)
        if dimensions and sort_order != "dataset":
            grouped = _apply_sort_order(grouped, dimensions[0], sort_order, measure_col="count")
        return grouped

    if not measures:
        raise HTTPException(status_code=400, detail="At least one measure is required for non-count aggregations")
    for col in dimensions + measures:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column not found: {col}")
    if dimensions:
        grouped = df.groupby(dimensions, sort=False)[measures].agg(pandas_agg).reset_index()
    else:
        grouped = df[measures].agg(pandas_agg).to_frame().T
    
    # Apply sorting after aggregation (use first measure for measure-based sorting)
    if dimensions and sort_order != "dataset":
        measure_col = measures[0] if measures else None
        grouped = _apply_sort_order(grouped, dimensions[0], sort_order, measure_col)
    
    return grouped


def _apply_sort_order(df: pd.DataFrame, dimension_col: str, sort_order: str, measure_col: str = None) -> pd.DataFrame:
    """
    Apply sorting to aggregated DataFrame based on sort_order.
    
    Args:
        df: Aggregated DataFrame
        dimension_col: Name of the dimension column to sort by (for dimension-based sorting)
        sort_order: Sort order ('dataset', 'ascending', 'descending', 'measure_desc', 'measure_asc')
        measure_col: Name of the measure column to sort by (for measure-based sorting)
    
    Returns:
        Sorted DataFrame
    """
    if sort_order == "ascending":
        # Alphabetical ascending (A → Z)
        return df.sort_values(by=dimension_col, ascending=True).reset_index(drop=True)
    elif sort_order == "descending":
        # Alphabetical descending (Z → A)
        return df.sort_values(by=dimension_col, ascending=False).reset_index(drop=True)
    elif sort_order == "measure_desc" and measure_col:
        # Value descending (High → Low)
        return df.sort_values(by=measure_col, ascending=False).reset_index(drop=True)
    elif sort_order == "measure_asc" and measure_col:
        # Value ascending (Low → High)
        return df.sort_values(by=measure_col, ascending=True).reset_index(drop=True)
    else:  # "dataset" - keep original order
        return df


def _calculate_chart_statistics(table: pd.DataFrame, measures: List[str]) -> Dict[str, Any]:
    """
    Calculate statistical metadata for chart measures.
    Returns min, max, mean, median, std, quartiles for each measure.
    Used to enable visual enhancements like mark lines, value-based coloring, and rich tooltips.
    
    Args:
        table: Aggregated DataFrame containing measure columns
        measures: List of measure column names to calculate statistics for
    
    Returns:
        Dictionary mapping measure names to their statistical properties:
        {
            "measure_name": {
                "min": float,
                "max": float,
                "mean": float,
                "median": float,
                "std": float,
                "q25": float (25th percentile),
                "q75": float (75th percentile),
                "count": int,
                "sum": float
            }
        }
    """
    stats = {}
    for measure in measures:
        if measure in table.columns and pd.api.types.is_numeric_dtype(table[measure]):
            series = pd.to_numeric(table[measure], errors='coerce').dropna()
            if len(series) > 0:
                stats[measure] = {
                    "min": float(series.min()),
                    "max": float(series.max()),
                    "mean": float(series.mean()),
                    "median": float(series.median()),
                    "std": float(series.std()) if len(series) > 1 else 0.0,
                    "q25": float(series.quantile(0.25)),
                    "q75": float(series.quantile(0.75)),
                    "count": int(series.count()),
                    "sum": float(series.sum())
                }
    return stats


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


def _apply_filter_transformation(df: pd.DataFrame, condition: str) -> pd.DataFrame:
    """
    Apply filter transformation using pandas query.
    
    Args:
        df: DataFrame to filter
        condition: Filter condition (e.g., "revenue > 100000")
    
    Returns:
        Filtered DataFrame
    """
    try:
        # Use pandas query for safe filtering
        filtered_df = df.query(condition)
        print(f"✅ Filter applied: {condition}, rows: {len(df)} → {len(filtered_df)}")
        return filtered_df
    except Exception as e:
        print(f"❌ Filter failed: {condition}, error: {str(e)}")
        raise ValueError(f"Invalid filter condition: {condition}. Error: {str(e)}")


def _add_calculated_column(df: pd.DataFrame, name: str, formula: str) -> pd.DataFrame:
    """
    Add a calculated column using a formula.
    
    Args:
        df: DataFrame to modify
        name: Name of the new column
        formula: Formula for calculation (e.g., "likes / impressions")
    
    Returns:
        DataFrame with new column added
    """
    try:
        # Create safe namespace with only DataFrame columns
        safe_namespace = {col: df[col] for col in df.columns}
        
        # Add numpy functions for common calculations
        import numpy as np
        safe_namespace.update({
            'abs': np.abs,
            'round': np.round,
            'floor': np.floor,
            'ceil': np.ceil,
            'sqrt': np.sqrt,
            'log': np.log,
            'exp': np.exp
        })
        
        # Evaluate formula
        result_df = df.copy()
        result_df[name] = eval(formula, {"__builtins__": {}}, safe_namespace)
        
        print(f"✅ Column added: {name} = {formula}")
        return result_df
    except Exception as e:
        print(f"❌ Add column failed: {name} = {formula}, error: {str(e)}")
        raise ValueError(f"Invalid formula: {formula}. Error: {str(e)}")


def _normalize_column(df: pd.DataFrame, column: str, method: str) -> pd.DataFrame:
    """
    Normalize a column using different methods.
    
    Args:
        df: DataFrame to modify
        column: Column to normalize
        method: Normalization method ('percentage', 'ratio', 'z_score')
    
    Returns:
        DataFrame with normalized column
    """
    try:
        result_df = df.copy()
        
        if method == 'percentage':
            # Convert to percentage of total
            total = result_df[column].sum()
            if total != 0:
                result_df[column] = (result_df[column] / total) * 100
            print(f"✅ Normalized to percentage: {column}")
        
        elif method == 'ratio':
            # Convert to ratio (0-1)
            total = result_df[column].sum()
            if total != 0:
                result_df[column] = result_df[column] / total
            print(f"✅ Normalized to ratio: {column}")
        
        elif method == 'z_score':
            # Standardize to z-scores
            mean = result_df[column].mean()
            std = result_df[column].std()
            if std != 0:
                result_df[column] = (result_df[column] - mean) / std
            print(f"✅ Normalized to z-score: {column}")
        
        else:
            raise ValueError(f"Unknown normalization method: {method}")
        
        return result_df
    except Exception as e:
        print(f"❌ Normalization failed: {column} ({method}), error: {str(e)}")
        raise ValueError(f"Normalization failed for {column}: {str(e)}")


def _apply_top_k(df: pd.DataFrame, k: int, by: str, order: str) -> pd.DataFrame:
    """
    Keep only top K rows.
    
    Args:
        df: DataFrame to filter
        k: Number of rows to keep
        by: Column to sort by
        order: Sort order ('asc' or 'desc')
    
    Returns:
        DataFrame with top K rows
    """
    try:
        if order == 'desc':
            result_df = df.nlargest(k, by)
        else:
            result_df = df.nsmallest(k, by)
        
        print(f"✅ Top {k} applied: sorted by {by} ({order}), rows: {len(df)} → {len(result_df)}")
        return result_df.reset_index(drop=True)
    except Exception as e:
        print(f"❌ Top K failed: {k} by {by}, error: {str(e)}")
        raise ValueError(f"Top K operation failed: {str(e)}")


def _apply_transformations(
    df: pd.DataFrame, 
    transformations: List[Dict[str, Any]], 
    dimension_col: Optional[str] = None,
    measure_col: Optional[str] = None
) -> pd.DataFrame:
    """
    Apply a chain of transformations to a DataFrame.
    
    Args:
        df: DataFrame to transform
        transformations: List of transformation operations
        dimension_col: Primary dimension column (for sorting)
        measure_col: Primary measure column (for sorting)
    
    Returns:
        Transformed DataFrame
    """
    result_df = df.copy()
    
    for i, transform in enumerate(transformations):
        transform_type = transform.get('type', '')
        print(f"🔄 Applying transformation {i+1}/{len(transformations)}: {transform_type}")
        
        try:
            if transform_type == 'filter':
                result_df = _apply_filter_transformation(result_df, transform['condition'])
            
            elif transform_type == 'add_column':
                result_df = _add_calculated_column(result_df, transform['name'], transform['formula'])
            
            elif transform_type == 'normalize':
                result_df = _normalize_column(result_df, transform['column'], transform['method'])
            
            elif transform_type == 'top_k':
                result_df = _apply_top_k(result_df, transform['k'], transform['by'], transform['order'])
            
            elif transform_type == 'sort':
                # Use existing sort function
                sort_order = transform.get('sort_order', 'dataset')
                if dimension_col:
                    result_df = _apply_sort_order(result_df, dimension_col, sort_order, measure_col)
                    print(f"✅ Sort applied: {sort_order}")
            
            else:
                print(f"⚠️ Unknown transformation type: {transform_type}, skipping")
        
        except Exception as e:
            print(f"❌ Transformation {i+1} failed: {str(e)}")
            raise
    
    return result_df


def _same_dim_diff_measures(spec1, spec2):
    """
    Chart Fusion Pattern Detector: Same Dimension, Different Measures
    Checks if two charts share the same dimensions but have different measures.
    Used to determine if charts can be fused into a multi-measure visualization.
    
    Example: Both charts show data by "State" but one shows "Revenue", other shows "Population"
    """
    try:
        # Ensure all items are hashable (strings) before using set()
        measures1 = [str(m) if not isinstance(m, str) else m for m in spec1.get("measures", [])]
        measures2 = [str(m) if not isinstance(m, str) else m for m in spec2.get("measures", [])]
        return spec1["dimensions"] == spec2["dimensions"] and set(measures1) != set(measures2) and len(spec1["dimensions"]) > 0
    except (TypeError, KeyError):
        return False


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
    
    try:
        # Ensure all items are hashable (strings) before using set()
        measures1 = [str(m) if not isinstance(m, str) else m for m in spec1.get("measures", [])]
        measures2 = [str(m) if not isinstance(m, str) else m for m in spec2.get("measures", [])]
        common_measures = set(measures1).intersection(set(measures2))
        return (len(common_measures) == 1) and (spec1["dimensions"] != spec2["dimensions"]) and (len(spec1["dimensions"]) > 0 or len(spec2["dimensions"]) > 0)
    except (TypeError, KeyError):
        return False


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

        # Auto-detect relationships when 2+ datasets are loaded
        relationships_detected = []
        if len(DATASETS) >= 2:
            print(f"🔗 Auto-detecting cross-dataset relationships ({len(DATASETS)} datasets loaded)...")
            new_links = _detect_relationships(DATASETS)
            # Preserve previously confirmed/rejected decisions for existing link pairs
            existing_decisions: Dict[str, str] = {
                f"{l['dataset_a_id']}:{l['col_a']}:{l['dataset_b_id']}:{l['col_b']}": l["status"]
                for l in DATASET_RELATIONSHIPS
                if l["status"] in ("accepted", "rejected")
            }
            for lnk in new_links:
                pair_key = f"{lnk['dataset_a_id']}:{lnk['col_a']}:{lnk['dataset_b_id']}:{lnk['col_b']}"
                if pair_key in existing_decisions:
                    lnk["status"] = existing_decisions[pair_key]
            DATASET_RELATIONSHIPS.clear()
            DATASET_RELATIONSHIPS.extend(new_links)
            relationships_detected = [l for l in new_links if l["status"] == "pending_confirmation"]
            print(f"   Found {len(new_links)} candidate links, {len(relationships_detected)} pending confirmation")

        return {
            "dataset_id": dataset_id,
            "filename": file.filename,
            "columns": list(df.columns),  # Keep for backward compatibility
            "dimensions": categorized["dimensions"],
            "measures": categorized["measures"],
            "rows": len(df),
            "relationships_detected": len(relationships_detected) > 0,
            "pending_relationship_count": len(relationships_detected),
        }
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded file is empty or invalid.")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    except Exception as e:
        print(f"❌ Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    """
    Dataset Deletion Endpoint
    Removes a dataset and its associated metadata from memory.
    Also removes any charts that were created from this dataset.
    
    Args:
        dataset_id: UUID of the dataset to delete
    
    Returns:
        success: bool
        message: Confirmation message
        charts_removed: Number of associated charts removed
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        # Remove dataset from memory
        del DATASETS[dataset_id]
        
        # Remove associated metadata
        if dataset_id in DATASET_METADATA:
            del DATASET_METADATA[dataset_id]
        
        # Remove associated charts
        charts_to_remove = [
            chart_id for chart_id, chart in CHARTS.items() 
            if chart.get('dataset_id') == dataset_id
        ]
        for chart_id in charts_to_remove:
            del CHARTS[chart_id]

        # Remove relationship links involving this dataset
        links_before = len(DATASET_RELATIONSHIPS)
        DATASET_RELATIONSHIPS[:] = [
            l for l in DATASET_RELATIONSHIPS
            if l.get("dataset_a_id") != dataset_id and l.get("dataset_b_id") != dataset_id
        ]
        links_removed = links_before - len(DATASET_RELATIONSHIPS)

        # Remove any merged datasets that were built from this dataset
        merged_to_remove = [
            mid for mid, info in MERGED_DATASETS.items()
            if info.get("primary_id") == dataset_id
        ]
        for mid in merged_to_remove:
            DATASETS.pop(mid, None)
            DATASET_METADATA.pop(mid, None)
            del MERGED_DATASETS[mid]

        print(f"🗑️ Dataset {dataset_id} deleted successfully")
        print(f"   Charts removed: {len(charts_to_remove)}")
        print(f"   Relationship links removed: {links_removed}")
        print(f"   Merged views removed: {len(merged_to_remove)}")
        
        return {
            "success": True,
            "message": f"Dataset {dataset_id} removed successfully",
            "charts_removed": len(charts_to_remove)
        }
        
    except Exception as e:
        print(f"❌ Failed to delete dataset {dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@app.get("/datasets")
async def list_datasets():
    """
    List All Datasets Endpoint
    Returns a list of all uploaded datasets with basic metadata.
    Useful for the frontend dataset selector.
    
    Returns:
        datasets: List of dataset summaries (id, filename, rows, columns count)
    """
    dataset_list = []
    for dataset_id, df in DATASETS.items():
        metadata = DATASET_METADATA.get(dataset_id, {})
        categorized = _categorize_columns(df)
        
        dataset_list.append({
            "id": dataset_id,
            "filename": metadata.get("filename", "Unknown"),
            "rows": len(df),
            "columns": len(df.columns),
            "dimensions": categorized["dimensions"],
            "measures": categorized["measures"],
            "has_analysis": dataset_id in DATASET_METADATA and DATASET_METADATA[dataset_id].get("success", False),
            "upload_timestamp": metadata.get("upload_timestamp")
        })
    
    return {"datasets": dataset_list}


@app.get("/datasets/{dataset_id}/meta")
async def get_dataset_meta(dataset_id: str):
    """
    Return stored metadata for an existing dataset.
    Used by SchemaPicker to reconnect a saved schema's merged dataset to the canvas.
    
    Returns filename, rows, dimensions, and measures for the given dataset_id.
    Looks first in the in-memory DATASETS store, then falls back to DATASET_METADATA.
    """
    if dataset_id in DATASETS:
        df = DATASETS[dataset_id]
        metadata = DATASET_METADATA.get(dataset_id, {})
        categorized = _categorize_columns(df)
        return {
            "dataset_id": dataset_id,
            "filename": metadata.get("filename", "Unknown"),
            "rows": len(df),
            "dimensions": categorized["dimensions"],
            "measures": categorized["measures"],
        }

    # If dataset was persisted to Supabase but not in memory, attempt DB lookup
    if supabase:
        try:
            result = supabase.table("datasets").select("*").eq("id", dataset_id).execute()
            if result.data:
                d = result.data[0]
                return {
                    "dataset_id": d["id"],
                    "filename": d.get("filename", "Unknown"),
                    "rows": d.get("rows", 0),
                    "dimensions": d.get("dimensions") or [],
                    "measures": d.get("measures") or [],
                }
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="Dataset not found")


# -----------------------
# Cross-Dataset Relationship Endpoints
# -----------------------

@app.post("/detect-relationships")
async def detect_relationships_endpoint():
    """
    Run relationship detection across all currently loaded datasets.
    Stores candidates (status: pending_confirmation) in DATASET_RELATIONSHIPS.
    Existing accepted/rejected decisions are preserved.
    """
    # Only consider original source datasets — exclude merged/flat tables
    source_datasets = {k: v for k, v in DATASETS.items() if k not in MERGED_DATASETS}

    if len(source_datasets) < 2:
        return {"relationships": [], "message": "Need at least 2 source datasets to detect relationships"}

    new_links = _detect_relationships(source_datasets)

    # Preserve prior confirmed/rejected decisions
    existing_decisions: Dict[str, str] = {
        f"{l['dataset_a_id']}:{l['col_a']}:{l['dataset_b_id']}:{l['col_b']}": l["status"]
        for l in DATASET_RELATIONSHIPS
        if l["status"] in ("accepted", "rejected")
    }
    for lnk in new_links:
        pair_key = f"{lnk['dataset_a_id']}:{lnk['col_a']}:{lnk['dataset_b_id']}:{lnk['col_b']}"
        if pair_key in existing_decisions:
            lnk["status"] = existing_decisions[pair_key]

    DATASET_RELATIONSHIPS.clear()
    DATASET_RELATIONSHIPS.extend(new_links)
    print(f"🔗 /detect-relationships: found {len(new_links)} candidate links")
    return {"relationships": new_links}


@app.get("/relationships")
async def get_relationships():
    """Return the full relationship list (all statuses)."""
    return {"relationships": DATASET_RELATIONSHIPS}


@app.post("/enrich-relationships")
async def enrich_relationships(request: EnrichRelationshipsRequest):
    """
    Use Gemini to add a natural-language ai_description to each pending link.
    Skips links that already have a non-empty description.
    """
    pending = [l for l in DATASET_RELATIONSHIPS if not l.get("ai_description")]
    if not pending:
        return {"enriched": 0, "relationships": DATASET_RELATIONSHIPS}

    if not request.api_key:
        # Fill in generic descriptions without calling Gemini
        for lnk in pending:
            card = lnk["cardinality"]
            lnk["ai_description"] = (
                f"'{lnk['col_a']}' in {lnk['dataset_a_name']} appears to link to "
                f"'{lnk['col_b']}' in {lnk['dataset_b_name']} ({card} relationship, "
                f"{lnk['overlap_pct']*100:.0f}% value overlap)."
            )
        return {"enriched": len(pending), "relationships": DATASET_RELATIONSHIPS}

    try:
        from gemini_llm import GeminiDataFormulator
        formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)

        links_text = "\n".join([
            f"- Link {i+1}: {l['dataset_a_name']}.{l['col_a']} → {l['dataset_b_name']}.{l['col_b']} "
            f"(cardinality: {l['cardinality']}, overlap: {l['overlap_pct']*100:.0f}%, match: {l['match_type']})"
            for i, l in enumerate(pending)
        ])

        prompt = f"""You are a data engineer reviewing potential relationships between database tables.
For each link below, write ONE concise sentence (max 20 words) explaining what the relationship means in business terms.
Output ONLY valid JSON: an array of strings in the same order as the links.

LINKS:
{links_text}

Output format: ["description 1", "description 2", ...]"""

        response_text, token_usage = formulator.run_gemini_with_usage(prompt, operation="Relationship Enrichment")
        cleaned = response_text.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].strip()

        descriptions = json.loads(cleaned)
        for i, lnk in enumerate(pending):
            if i < len(descriptions):
                lnk["ai_description"] = descriptions[i]

        print(f"✅ Enriched {len(pending)} relationship links with AI descriptions")
        return {"enriched": len(pending), "relationships": DATASET_RELATIONSHIPS, "token_usage": token_usage}
    except Exception as e:
        print(f"⚠️ AI enrichment failed, using generic descriptions: {e}")
        for lnk in pending:
            card = lnk["cardinality"]
            lnk["ai_description"] = (
                f"'{lnk['col_a']}' in {lnk['dataset_a_name']} appears to link to "
                f"'{lnk['col_b']}' in {lnk['dataset_b_name']} ({card} relationship, "
                f"{lnk['overlap_pct']*100:.0f}% value overlap)."
            )

    return {"enriched": len(pending), "relationships": DATASET_RELATIONSHIPS}


@app.post("/batch-analyze")
async def batch_analyze(request: BatchAnalyzeRequest):
    """
    Batch Analysis Endpoint — single LLM call for all datasets.

    Replaces N sequential /analyze-dataset calls + /enrich-relationships with
    one combined Gemini prompt, regardless of how many CSV files are loaded.

    Pipeline:
      1. Resolve scope (source datasets only, no merged pseudo-datasets)
      2. Compute column statistics per dataset (dtype, unique_count, sample values) — no LLM
      3. Detect cross-dataset relationships via _detect_relationships() — no LLM
      4. Build one combined prompt and make a SINGLE Gemini call
      5. Parse response: persist DATASET_METADATA + ai_description on each link
      6. Return analyses dict + relationships + token_usage

    Fallback: if the LLM call or JSON parsing fails, fills generic descriptions
    so the workflow is never blocked.
    """
    # ── 1. Resolve scope ──────────────────────────────────────────────────────
    scope_ids = request.dataset_ids or list(DATASETS.keys())
    source_datasets = {
        did: DATASETS[did]
        for did in scope_ids
        if did in DATASETS and did not in MERGED_DATASETS
    }

    if not source_datasets:
        raise HTTPException(
            status_code=400,
            detail="No valid datasets found. Please upload CSV files first."
        )

    print(f"\n🔍 /batch-analyze: {len(source_datasets)} dataset(s)")

    # ── 2. Statistical profiling per dataset (no LLM) ─────────────────────────
    # Mirrors the column-stat loop in _analyze_dataset_with_ai()
    all_col_stats: Dict[str, List[Dict[str, Any]]] = {}

    for did, df in source_datasets.items():
        col_stats = []
        for col in df.columns:
            series = df[col]
            missing_pct  = round(series.isnull().mean() * 100, 2)
            unique_count = int(series.nunique())
            total_count  = int(len(series))
            non_null     = series.dropna()
            sample_size  = min(3, len(non_null))
            sample_values = non_null.sample(sample_size).tolist() if sample_size > 0 else []
            variance = None
            if pd.api.types.is_numeric_dtype(series):
                v = series.var()
                variance = float(v) if v == v else None  # guard NaN

            col_stats.append({
                "name":         col,
                "dtype":        str(series.dtype),
                "missing_pct":  missing_pct,
                "unique_count": unique_count,
                "total_count":  total_count,
                "variance":     variance,
                "sample_values": sample_values,
                "description":  "",   # filled after LLM call
            })
        all_col_stats[did] = col_stats

    # ── 3. Relationship detection (no LLM) ────────────────────────────────────
    new_links = _detect_relationships(source_datasets)

    # Preserve prior confirmed/rejected decisions
    existing_decisions: Dict[str, str] = {
        f"{l['dataset_a_id']}:{l['col_a']}:{l['dataset_b_id']}:{l['col_b']}": l["status"]
        for l in DATASET_RELATIONSHIPS
        if l["status"] in ("accepted", "rejected")
    }
    for lnk in new_links:
        pair_key = f"{lnk['dataset_a_id']}:{lnk['col_a']}:{lnk['dataset_b_id']}:{lnk['col_b']}"
        if pair_key in existing_decisions:
            lnk["status"] = existing_decisions[pair_key]

    DATASET_RELATIONSHIPS.clear()
    DATASET_RELATIONSHIPS.extend(new_links)
    print(f"   Detected {len(new_links)} relationship candidate(s)")

    # Helper: build generic descriptions without LLM
    def _generic_col_desc(col_info: Dict[str, Any]) -> str:
        dtype = col_info["dtype"]
        uc    = col_info["unique_count"]
        if dtype in ("object", "string"):
            return f"Text column with {uc} unique values"
        elif dtype.startswith("int") or dtype.startswith("float"):
            return f"Numeric column with {uc} unique values"
        elif "date" in dtype or "time" in dtype:
            return f"Date/time column with {uc} unique values"
        return f"Data column ({dtype}) with {uc} unique values"

    def _generic_rel_desc(lnk: Dict[str, Any]) -> str:
        card = lnk.get("cardinality", "")
        return (
            f"'{lnk['col_a']}' in {lnk['dataset_a_name']} links to "
            f"'{lnk['col_b']}' in {lnk['dataset_b_name']} ({card} relationship, "
            f"{lnk.get('overlap_pct', 0)*100:.0f}% value overlap)."
        )

    # ── 4. Build combined prompt and call Gemini (single call) ────────────────
    token_usage: Dict[str, int] = {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
    ai_success  = False

    if request.api_key:
        try:
            from gemini_llm import GeminiDataFormulator
            formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)

            # Build dataset blocks (cap at 3 sample rows, 3 sample values per col)
            dataset_blocks = []
            for idx, (did, df) in enumerate(source_datasets.items(), start=1):
                meta      = DATASET_METADATA.get(did, {})
                filename  = meta.get("filename") or meta.get("dataset_name") or did[:8]
                col_stats = all_col_stats[did]
                sample_rows = df.head(3).to_dict(orient="records")

                col_lines = "\n".join(
                    f"- {c['name']}: {c['dtype']}, {c['unique_count']} unique, "
                    f"Sample: {c['sample_values']}"
                    for c in col_stats
                )
                row_lines = "\n".join(
                    f"  {row}" for row in sample_rows
                )
                dataset_blocks.append(
                    f"DATASET {idx} — {filename}  ({len(df):,} rows)\n"
                    f"Dataset ID: {did}\n"
                    f"Columns:\n{col_lines}\n"
                    f"Sample rows (first 3):\n{row_lines}"
                )

            datasets_section = "\n\n".join(dataset_blocks)

            # Build relationship block
            if new_links:
                rel_lines = "\n".join(
                    f"- Link {i+1}: {l['dataset_a_name']}.{l['col_a']} → "
                    f"{l['dataset_b_name']}.{l['col_b']} "
                    f"({l.get('cardinality','?')}, {l.get('overlap_pct',0)*100:.0f}% overlap, "
                    f"{l.get('match_type','?')} match)"
                    for i, l in enumerate(new_links)
                )
                rels_section = f"DETECTED RELATIONSHIPS:\n{rel_lines}"
            else:
                rels_section = "DETECTED RELATIONSHIPS:\nNone detected."

            # Dataset ID list for the output format instruction
            id_template = "\n".join(
                f'    "{did}": {{"dataset_summary": "...", "columns": [{{"name": "col", "description": "..."}}]}}'
                for did in source_datasets
            )

            prompt = f"""You are an expert data analyst and data engineer.

Analyze these {len(source_datasets)} dataset(s) and their detected relationships in ONE response.

{datasets_section}

{rels_section}

INSTRUCTIONS:
1. For EACH dataset: write a meaningful 2-3 sentence dataset_summary describing the real-world context.
   For EACH column: write one short business/domain description (not just the data type).
2. For EACH relationship link (in the same order listed above): write ONE sentence (max 20 words) in business terms explaining what the relationship means.

Output ONLY valid JSON — no markdown fences, no extra text:
{{
  "datasets": {{
{id_template}
  }},
  "relationships": ["description for link 1", "description for link 2", ...]
}}

Use the exact dataset IDs shown above as keys in "datasets".
If there are no relationships, return an empty array for "relationships"."""

            response_text, token_usage = formulator.run_gemini_with_usage(prompt, operation="Batch Analysis")

            # Strip markdown fences if present
            cleaned = response_text.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].strip()

            ai_data = json.loads(cleaned)
            ai_success = True
            print(f"   Single Gemini call succeeded | tokens={token_usage.get('totalTokens', 0)}")

            # Apply AI dataset descriptions
            for did, ds_result in ai_data.get("datasets", {}).items():
                if did not in all_col_stats:
                    continue
                ai_summary = ds_result.get("dataset_summary", "")
                ai_cols    = {c["name"]: c["description"] for c in ds_result.get("columns", [])}
                for col_info in all_col_stats[did]:
                    col_info["description"] = ai_cols.get(col_info["name"], _generic_col_desc(col_info))
                all_col_stats[did]  # already updated in-place

                # Persist in DATASET_METADATA
                existing_meta = DATASET_METADATA.get(did, {})
                DATASET_METADATA[did] = {
                    **existing_meta,
                    "dataset_name":    existing_meta.get("dataset_name") or existing_meta.get("filename") or did[:8],
                    "dataset_summary": ai_summary,
                    "columns":         all_col_stats[did],
                    "success":         True,
                }

            # Apply AI relationship descriptions
            ai_rel_descs = ai_data.get("relationships", [])
            for i, lnk in enumerate(new_links):
                lnk["ai_description"] = (
                    ai_rel_descs[i] if i < len(ai_rel_descs) else _generic_rel_desc(lnk)
                )

        except Exception as exc:
            print(f"⚠️  /batch-analyze LLM call failed ({exc}), using generic descriptions")
            ai_success = False

    # ── 5. Fallback: fill generic descriptions where missing ──────────────────
    if not ai_success:
        for did, col_stats in all_col_stats.items():
            for col_info in col_stats:
                if not col_info.get("description"):
                    col_info["description"] = _generic_col_desc(col_info)

            existing_meta = DATASET_METADATA.get(did, {})
            filename      = existing_meta.get("filename") or existing_meta.get("dataset_name") or did[:8]
            df            = source_datasets[did]
            DATASET_METADATA[did] = {
                **existing_meta,
                "dataset_name":    existing_meta.get("dataset_name") or filename,
                "dataset_summary": f"Dataset '{filename}' with {len(df):,} rows and {len(df.columns)} columns.",
                "columns":         col_stats,
                "success":         True,
            }

        for lnk in new_links:
            if not lnk.get("ai_description"):
                lnk["ai_description"] = _generic_rel_desc(lnk)

    # ── 6. Build and return response ──────────────────────────────────────────
    analyses_out: Dict[str, Any] = {}
    for did in source_datasets:
        meta = DATASET_METADATA.get(did, {})
        analyses_out[did] = {
            "dataset_summary": meta.get("dataset_summary", ""),
            "columns":         meta.get("columns", all_col_stats.get(did, [])),
            "success":         True,
        }

    print(f"✅ /batch-analyze done | ai={ai_success} | datasets={len(analyses_out)} | links={len(new_links)}")

    return {
        "analyses":      analyses_out,
        "relationships": DATASET_RELATIONSHIPS,
        "token_usage":   token_usage,
        "ai_success":    ai_success,
    }


@app.patch("/relationships/confirm")
async def confirm_relationships(request: ConfirmRelationshipsRequest):
    """
    Apply user Accept/Reject decisions to relationship links.
    Payload: { decisions: { link_id: "accepted" | "rejected" } }
    Only 'accepted' links are used by the LLM.
    After applying decisions, builds merged datasets for every primary dataset
    involved in an accepted link and registers them in DATASETS.
    """
    updated = 0
    edited_links = request.edited_links or {}
    for lnk in DATASET_RELATIONSHIPS:
        link_id = lnk["link_id"]
        # Apply column overrides from user edits before writing status
        if link_id in edited_links:
            override = edited_links[link_id]
            if override.get("col_a"):
                lnk["col_a"] = override["col_a"]
            if override.get("col_b"):
                lnk["col_b"] = override["col_b"]
        decision = request.decisions.get(link_id)
        if decision in ("accepted", "rejected"):
            lnk["status"] = decision
            updated += 1

    accepted = [l for l in DATASET_RELATIONSHIPS if l["status"] == "accepted"]
    print(f"✅ /relationships/confirm: {updated} decisions applied, {len(accepted)} accepted links")

    # --- Build one master merged view via BFS from the most-connected dataset ----
    merged_datasets_response = []

    if accepted and request.build_merge:
        # Clear any stale merged entries from a previous confirmation
        stale_ids = list(MERGED_DATASETS.keys())
        for stale_id in stale_ids:
            DATASETS.pop(stale_id, None)
            DATASET_METADATA.pop(stale_id, None)
            del MERGED_DATASETS[stale_id]

        # Find the best starting point (most relationship links = central node)
        primary_id = find_primary_dataset(accepted, DATASETS)

        if primary_id:
            merged_df, merge_desc = build_merged_dataset(primary_id, accepted, DATASETS)

            if merged_df is not None:
                # Collect all source dataset names reachable from the accepted links
                # (preserving encounter order so the primary name comes first)
                source_names: List[str] = []
                seen_names: set = set()
                # Start with primary name
                for lnk in accepted:
                    if lnk["dataset_a_id"] == primary_id:
                        pname = lnk.get("dataset_a_name", primary_id[:8])
                    elif lnk["dataset_b_id"] == primary_id:
                        pname = lnk.get("dataset_b_name", primary_id[:8])
                    else:
                        continue
                    if pname not in seen_names:
                        source_names.append(pname)
                        seen_names.add(pname)
                    break
                # Add all other names from accepted links
                for lnk in accepted:
                    for name_key, id_key in [("dataset_a_name", "dataset_a_id"), ("dataset_b_name", "dataset_b_id")]:
                        n = lnk.get(name_key, lnk.get(id_key, "")[:8])
                        if n and n not in seen_names:
                            source_names.append(n)
                            seen_names.add(n)

                merged_id = str(uuid.uuid4())
                DATASETS[merged_id] = merged_df

                # Infer dimensions / measures from dtypes
                dimensions = [
                    c for c in merged_df.columns
                    if merged_df[c].dtype == object or str(merged_df[c].dtype).startswith("datetime")
                ]
                measures = [
                    c for c in merged_df.columns
                    if merged_df[c].dtype in ["int64", "float64"]
                ]
                filename = " + ".join(source_names)

                MERGED_DATASETS[merged_id] = {
                    "primary_id": primary_id,
                    "source_names": source_names,
                    "merge_info": merge_desc,
                }

                # Register metadata so all endpoints that read DATASET_METADATA work
                DATASET_METADATA[merged_id] = {
                    "filename": filename,
                    "success": True,
                    "dataset_summary": f"Merged view: {filename}. {merge_desc}",
                    "columns": [
                        {"name": c, "type": "dimension" if c in dimensions else "measure", "description": ""}
                        for c in merged_df.columns
                    ],
                }

                merged_datasets_response.append({
                    "id": merged_id,
                    "filename": filename,
                    "dimensions": dimensions,
                    "measures": measures,
                    "rows": len(merged_df),
                    "isMerged": True,
                    "sourceDatasets": source_names,
                    "merge_info": merge_desc,
                    "uploadedAt": datetime.utcnow().isoformat(),
                })
                print(
                    f"✅ Master merged dataset '{filename}' → {merged_id[:8]} "
                    f"({len(merged_df)} rows, {len(merged_df.columns)} cols, "
                    f"{len(source_names)} source datasets)"
                )
            else:
                print("⚠️ build_merged_dataset returned None — no merge performed")

    return {
        "updated": updated,
        "accepted_count": len(accepted),
        "relationships": DATASET_RELATIONSHIPS,
        "merged_datasets": merged_datasets_response,
    }


@app.get("/dataset-quality/{dataset_id}")
async def dataset_quality(dataset_id: str):
    """
    Fast quality scan using pandas only — no Gemini, responds in <200ms.
    Returns missing value warnings, type mismatches, duplicate counts, and per-column stats.
    """
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    df = DATASETS[dataset_id]
    issues = []

    for col in df.columns:
        missing_pct = df[col].isnull().mean() * 100
        if missing_pct > 5:
            issues.append({
                "column": col,
                "type": "missing",
                "pct": round(missing_pct, 1),
                "message": f"{round(missing_pct, 1)}% missing values",
            })
        # Detect numeric stored as string
        if df[col].dtype == object:
            numeric_ratio = pd.to_numeric(df[col], errors="coerce").notna().mean()
            if numeric_ratio > 0.8:
                issues.append({
                    "column": col,
                    "type": "type_mismatch",
                    "hint": "Likely numeric",
                    "message": f"Column appears numeric but stored as text",
                })

    # Duplicate detection on a sample to avoid O(n×m) on large files
    sample = df.head(50_000)
    dup_count = int(sample.duplicated().sum())

    return {
        "dataset_id": dataset_id,
        "rows": len(df),
        "columns": len(df.columns),
        "duplicate_rows": dup_count,
        "issues": issues,
        "column_stats": [
            {
                "name": c,
                "dtype": str(df[c].dtype),
                "missing_pct": round(df[c].isnull().mean() * 100, 1),
                "unique_count": int(df[c].nunique()),
                "sample_values": [
                    str(v) for v in df[c].dropna().head(3).tolist()
                ],
            }
            for c in df.columns
        ],
    }


@app.post("/join-preview")
async def join_preview(request: JoinPreviewRequest):
    """
    Returns the first 20 rows of the proposed join without materializing it.
    Uses the same BFS merge logic as /relationships/confirm.
    """
    if request.primary_dataset_id not in DATASETS:
        return {"success": False, "rows": [], "columns": [], "description": "Primary dataset not found"}

    merged_df, desc = build_merged_dataset(
        request.primary_dataset_id,
        request.confirmed_relationships,
        DATASETS,
    )

    if merged_df is None:
        return {"success": False, "rows": [], "columns": [], "description": "Could not merge datasets with given relationships"}

    preview_df = _clean_dataframe_for_json(merged_df.head(20))
    return {
        "success": True,
        "columns": list(merged_df.columns),
        "rows": preview_df.to_dict(orient="records"),
        "total_rows": len(merged_df),
        "total_columns": len(merged_df.columns),
        "description": desc,
    }


def _analyze_dataset_with_ai(df: pd.DataFrame, dataset_name: str, api_key: Optional[str] = None, model: str = "gemini-2.5-flash") -> Dict[str, Any]:
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
                ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt, operation="Dataset Analysis")
                
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


def _jaccard_similarity(a: str, b: str) -> float:
    """Compute Jaccard similarity between two strings using character bigrams."""
    if not a or not b:
        return 0.0
    set_a = set(a[i:i+2] for i in range(len(a) - 1)) or {a}
    set_b = set(b[i:i+2] for i in range(len(b) - 1)) or {b}
    if not set_a and not set_b:
        return 1.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


def _infer_broad_type(series: pd.Series) -> str:
    """Return 'numeric', 'datetime', or 'string' for a pandas Series."""
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "string"


def _infer_cardinality(series_a: pd.Series, series_b: pd.Series) -> str:
    """Infer relationship cardinality between two join-key columns."""
    a_dup = series_a.duplicated().any()
    b_dup = series_b.duplicated().any()
    if not a_dup and not b_dup:
        return "1:1"
    if not a_dup and b_dup:
        return "1:M"
    if a_dup and not b_dup:
        return "M:1"
    return "M:M"


_KEY_PATTERNS = re.compile(r'(^id$|_id$|^id_|_key$|_code$|_ref$|_fk$|_num$|number$)', re.IGNORECASE)

def _is_likely_key_column(col_name: str) -> bool:
    """Return True if the column name looks like a primary/foreign key."""
    return bool(_KEY_PATTERNS.search(col_name.strip()))


def _detect_relationships(datasets: Dict[str, pd.DataFrame]) -> List[Dict[str, Any]]:
    """
    Cross-Dataset Relationship Detector

    For every pair of loaded DataFrames, finds candidate join columns by:
    1. Exact column-name match (case-insensitive, stripped)
    2. Fuzzy name match (bigram Jaccard similarity > 0.80)
    3. Value overlap >= 50% when types are compatible

    Returns a list of RelationshipLink dicts with status 'pending_confirmation'.
    """
    links: List[Dict[str, Any]] = []
    ids = list(datasets.keys())

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            id_a, id_b = ids[i], ids[j]
            df_a, df_b = datasets[id_a], datasets[id_b]
            name_a = DATASET_METADATA.get(id_a, {}).get("filename", id_a[:8])
            name_b = DATASET_METADATA.get(id_b, {}).get("filename", id_b[:8])

            # Skip pairs that are the same file uploaded twice under different UUIDs
            if name_a == name_b:
                continue

            for col_a in df_a.columns:
                for col_b in df_b.columns:
                    # Only emit a link if at least one column looks like an FK/PK.
                    # This suppresses spurious matches on non-key columns
                    # (e.g. name→name, email→email, city→city).
                    if not (_is_likely_key_column(col_a) or _is_likely_key_column(col_b)):
                        continue

                    type_a = _infer_broad_type(df_a[col_a])
                    type_b = _infer_broad_type(df_b[col_b])

                    # Skip incompatible type pairings
                    if type_a != type_b:
                        continue

                    norm_a = col_a.lower().strip()
                    norm_b = col_b.lower().strip()

                    match_type = None
                    overlap_pct = 0.0

                    if norm_a == norm_b:
                        match_type = "exact_name"
                    else:
                        sim = _jaccard_similarity(norm_a, norm_b)
                        if sim >= 0.80:
                            match_type = "fuzzy_name"

                    # Value overlap check for string/numeric columns
                    if type_a in ("string", "numeric"):
                        try:
                            vals_a = set(df_a[col_a].dropna().astype(str))
                            vals_b = set(df_b[col_b].dropna().astype(str))
                            if vals_a:
                                overlap_pct = len(vals_a & vals_b) / len(vals_a)
                            if match_type is None and overlap_pct >= 0.5:
                                match_type = "value_overlap"
                        except Exception:
                            overlap_pct = 0.0

                    if match_type is None:
                        continue

                    # Compute confidence
                    if match_type == "exact_name" and overlap_pct >= 0.8:
                        confidence = "high"
                    elif match_type == "exact_name" or overlap_pct >= 0.6:
                        confidence = "medium"
                    else:
                        confidence = "low"

                    cardinality = _infer_cardinality(df_a[col_a], df_b[col_b])

                    # Canonicalise direction: PK side is always dataset_a.
                    # Flipping M:1 to 1:M ensures bidirectional duplicates share
                    # the same dedup key and only one entry survives.
                    emit_id_a, emit_id_b     = id_a,   id_b
                    emit_name_a, emit_name_b = name_a, name_b
                    emit_col_a, emit_col_b   = col_a,  col_b
                    if cardinality == "M:1":
                        emit_id_a,   emit_id_b   = id_b,   id_a
                        emit_name_a, emit_name_b = name_b, name_a
                        emit_col_a,  emit_col_b  = col_b,  col_a
                        cardinality = "1:M"

                    links.append({
                        "link_id": str(uuid.uuid4()),
                        "dataset_a_id": emit_id_a,
                        "dataset_a_name": emit_name_a,
                        "col_a": emit_col_a,
                        "dataset_b_id": emit_id_b,
                        "dataset_b_name": emit_name_b,
                        "col_b": emit_col_b,
                        "match_type": match_type,
                        "overlap_pct": round(overlap_pct, 4),
                        "cardinality": cardinality,
                        "confidence": confidence,
                        "ai_description": "",
                        "status": "pending_confirmation",
                    })

    # Deduplicate: if exact_name and value_overlap found for same column pair, keep exact_name.
    # Use filenames (not UUIDs) so repeated uploads of the same file don't produce duplicates.
    seen: set = set()
    deduped: List[Dict[str, Any]] = []
    for lnk in sorted(links, key=lambda x: 0 if x["match_type"] == "exact_name" else 1):
        key = (lnk["dataset_a_name"], lnk["col_a"], lnk["dataset_b_name"], lnk["col_b"])
        if key not in seen:
            seen.add(key)
            deduped.append(lnk)

    # Keep only the single best (canonical) link per dataset pair.
    # Ranking: exact_name > fuzzy_name > value_overlap, then highest overlap_pct.
    # Use filenames as the pair key so multiple uploads of the same file collapse to one.
    MATCH_RANK = {"exact_name": 0, "fuzzy_name": 1, "value_overlap": 2}
    best_per_pair: Dict[tuple, Dict[str, Any]] = {}

    for lnk in deduped:
        pair_key = (lnk["dataset_a_name"], lnk["dataset_b_name"])
        existing = best_per_pair.get(pair_key)
        if existing is None:
            best_per_pair[pair_key] = lnk
        else:
            cur_rank = MATCH_RANK.get(existing["match_type"], 9)
            new_rank = MATCH_RANK.get(lnk["match_type"], 9)
            if new_rank < cur_rank or (
                new_rank == cur_rank and lnk["overlap_pct"] > existing["overlap_pct"]
            ):
                best_per_pair[pair_key] = lnk

    return list(best_per_pair.values())


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
    print(f"📊 /charts endpoint received: dimensions={spec.dimensions}, measures={spec.measures}, agg={spec.agg}, table_provided={spec.table is not None}, filters={spec.filters}, sort_order={spec.sort_order}")
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
        
        table = _agg(df, spec.dimensions, spec.measures, spec.agg, spec.sort_order or "dataset")
        
        # Clean NaN/Inf values before JSON serialization
        table_clean = _clean_dataframe_for_json(table)
        table_records = table_clean.to_dict(orient="records")
    
    chart_id = str(uuid.uuid4())
    
    # Generate descriptive title if none provided
    auto_title = _generate_chart_title(spec.dimensions, spec.measures, spec.agg)
    
    # Calculate statistical metadata for visual enhancements
    measures_out = spec.measures if spec.measures else (["count"] if spec.agg == "count" else [])
    if spec.table is not None:
        # Convert records back to DataFrame for statistics calculation
        table_df = pd.DataFrame(spec.table)
    else:
        table_df = table_clean
    
    chart_statistics = _calculate_chart_statistics(table_df, measures_out)
    print(f"📈 Calculated statistics for {len(chart_statistics)} measures")
    
    CHARTS[chart_id] = {
        "chart_id": chart_id,
        "dataset_id": spec.dataset_id,
        "dimensions": spec.dimensions,
        "measures": measures_out,
        "agg": spec.agg,
        "title": spec.title or auto_title,
        "table": table_records,
        "statistics": chart_statistics,  # Statistical metadata for visual enhancements
        "originalMeasure": spec.originalMeasure,  # Store original measure for histograms
        "filters": spec.filters or {},  # Store filters for persistence and reapplication
        "sort_order": spec.sort_order or "dataset",  # Store sort order for persistence
        "is_derived": spec.is_derived,  # True for query-engine charts with pre-joined data
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

    # Resolve the effective dataset ID for each chart.
    # Smart charts store an ephemeral dataset_id (per-chart unique) AND a
    # source_dataset_id pointing back to the original raw CSV.  Use the
    # source ID so that two smart charts derived from the same CSV can fuse.
    def _effective_ds_id(chart: dict) -> str:
        return chart.get("source_dataset_id") or chart["dataset_id"]

    ds_id_c1 = _effective_ds_id(c1)
    ds_id_c2 = _effective_ds_id(c2)

    if ds_id_c1 != ds_id_c2:
        raise HTTPException(status_code=400, detail="Charts must come from the same dataset for fusion in this demo")

    ds_id = ds_id_c1
    if ds_id not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Source dataset {ds_id[:8]} not found")
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
        table_df = pd.DataFrame(table_data)
    elif isinstance(fused_table, list):
        # Already a list of records (new stacked case)
        table_data = fused_table
        table_df = pd.DataFrame(table_data)
    else:
        # DataFrame - clean NaN/Inf values before converting to records
        fused_table_clean = _clean_dataframe_for_json(fused_table)
        table_data = fused_table_clean.to_dict(orient="records")
        table_df = fused_table_clean
    
    # Calculate statistical metadata for fused chart
    chart_statistics = _calculate_chart_statistics(table_df, measures_out)
    print(f"📈 Calculated statistics for fused chart: {len(chart_statistics)} measures")
    
    fused_payload = {
        "chart_id": chart_id,
        "dataset_id": ds_id,
        "dimensions": dims_out,
        "measures": measures_out,
        "agg": agg if 'agg' in locals() else _pick_agg(c1, c2),
        "title": title,
        "strategy": strategy,
        "table": table_data,
        "statistics": chart_statistics,  # Statistical metadata for visual enhancements
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
        response_text, token_usage = ai_formulator.run_gemini_with_usage(prompt, operation="AI-Assisted Fusion")
        
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
    # Get dataset_id from either chart context or direct dataset_id
    dataset_id = None
    chart_context = None
    analysis_data = None
    scope_info = {
        'type': 'global',
        'rows': 0,
        'description': 'Full dataset'
    }
    
    if request.chart_id:
        # Chart-specific query: use scoped context
        if request.chart_id not in CHARTS:
            raise HTTPException(status_code=404, detail="Chart not found")
        chart_context = CHARTS[request.chart_id]
        dataset_id = chart_context["dataset_id"]
        
        # Check if this is a derived/transformed chart
        is_derived = chart_context.get('is_derived', False)
        
        if is_derived:
            # For derived charts, use the chart's table directly
            analysis_data = pd.DataFrame(chart_context['table'])
            scope_info = {
                'type': 'derived',
                'rows': len(analysis_data),
                'description': f"Transformed chart data: {chart_context.get('title', 'Untitled')}"
            }
            print(f"🎯 Derived chart query: analyzing {len(analysis_data)} rows from transformed table")
        else:
            # For regular charts, filter original dataset by chart's dimension values
            full_dataset = DATASETS[dataset_id]
            chart_table = pd.DataFrame(chart_context['table'])
            dimensions = chart_context.get('dimensions', [])
            
            if dimensions and len(chart_table) > 0:
                # Extract unique dimension values from chart
                dimension_col = dimensions[0]
                
                if dimension_col in chart_table.columns:
                    dimension_values = chart_table[dimension_col].unique()
                    
                    # Filter full dataset to only rows matching chart's dimensions
                    if dimension_col in full_dataset.columns:
                        analysis_data = full_dataset[
                            full_dataset[dimension_col].isin(dimension_values)
                        ]
                        scope_info = {
                            'type': 'scoped',
                            'rows': len(analysis_data),
                            'description': f"{len(dimension_values)} {dimension_col} values from chart",
                            'chart_title': chart_context.get('title', 'Untitled')
                        }
                        print(f"🎯 Scoped query: analyzing {len(analysis_data)} rows " +
                              f"(filtered to {len(dimension_values)} {dimension_col} values)")
                    else:
                        # Dimension column doesn't exist in dataset, fall back to full
                        analysis_data = full_dataset
                        scope_info['type'] = 'global'
                        print(f"⚠️ Dimension '{dimension_col}' not in dataset, using full dataset")
                else:
                    # No valid dimension in chart table, use full dataset
                    analysis_data = full_dataset
                    scope_info['type'] = 'global'
                    print(f"⚠️ No valid dimensions, using full dataset")
            else:
                # No dimensions or empty chart, use full dataset
                analysis_data = full_dataset
                scope_info['type'] = 'global'
                print(f"📊 No dimensions to scope by, using full dataset")
                
    elif request.dataset_id:
        # Dataset-level query (no chart context)
        dataset_id = request.dataset_id
        analysis_data = DATASETS[dataset_id]
        scope_info = {
            'type': 'global',
            'rows': len(analysis_data),
            'description': 'Full dataset'
        }
        print(f"📊 Global dataset query: {len(analysis_data)} rows")
    else:
        raise HTTPException(status_code=400, detail="Either chart_id or dataset_id must be provided")
    
    if dataset_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        print(f"🤖 AI Exploration started:")
        print(f"   Query: '{request.user_query}'")
        print(f"   Scope: {scope_info['type']}")
        print(f"   Analyzing: {len(analysis_data)} rows × {len(analysis_data.columns)} columns")
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
        
        # Run AI analysis on scoped data (pass confirmed cross-dataset schema if present)
        ai_result = ai_formulator.get_text_analysis(
            request.user_query,
            analysis_data,
            dataset_id,
            dataset_metadata,
            confirmed_relationships=request.confirmed_relationships,
            all_datasets=DATASETS,
        )
        
        print(f"✅ AI Analysis completed successfully!")
        print(f"   Result length: {len(ai_result.get('answer', ''))}")
        print(f"   Is refined: {ai_result.get('is_refined', False)}")
        
        # Return complete AI analysis response including code_steps, token_usage, and refinement info
        return {
            "success": ai_result.get("success", True),
            "answer": ai_result.get("answer", "I couldn't process your query."),
            "raw_analysis": ai_result.get("raw_analysis", ""),  # Original pandas output
            "is_refined": ai_result.get("is_refined", False),  # Whether insights were refined
            "query": request.user_query,
            "dataset_info": f"Dataset: {len(analysis_data)} rows, {len(analysis_data.columns)} columns",
            "scope_info": scope_info,  # NEW: Scope metadata
            "merge_info": ai_result.get("merge_info"),  # Cross-dataset join description if applied
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
            "scope_info": scope_info,  # Include scope info in error response
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


def _analyze_dataset_with_ai(df: pd.DataFrame, dataset_name: str, api_key: Optional[str] = None, model: str = "gemini-2.5-flash") -> Dict[str, Any]:
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
                ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt, operation="Dataset Analysis")
                
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
        
        # Preserve upload-time fields (filename, timestamp, file_type) that
        # would otherwise be lost when we overwrite DATASET_METADATA.
        existing_meta = DATASET_METADATA.get(request.dataset_id, {})
        for key in ("filename", "upload_timestamp", "file_type"):
            if key in existing_meta:
                analysis_result[key] = existing_meta[key]

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
            ai_response, token_usage = ai_formulator.run_gemini_with_usage(prompt, operation="Chart Suggestions")
            
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
    model: str = "gemini-2.5-flash"
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

    response, token_usage = formulator.run_gemini_with_usage(prompt, operation="Chart Insights")
    
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


@app.post("/chart-transform")
async def transform_chart(request: ChartTransformRequest):
    """
    Chart Transformation Endpoint
    Transforms a chart's data using natural language instructions.
    Creates a new derived chart with transformation lineage.
    
    Args:
        request: ChartTransformRequest with chart_id, user_prompt, api_key, model
    
    Returns:
        New chart with transformed data and lineage metadata
    
    Process:
        1. Validate chart exists
        2. Get chart table and metadata
        3. Call LLM to generate transformation plan
        4. Execute transformations deterministically
        5. Apply/inherit sort_order
        6. Create new derived chart
        7. Return with lineage info
    """
    try:
        print(f"✨ Chart transformation request received")
        print(f"   Chart ID: {request.chart_id}")
        print(f"   Prompt: {request.user_prompt}")
        
        # Validate chart exists
        if request.chart_id not in CHARTS:
            raise HTTPException(status_code=404, detail="Chart not found")
        
        # Validate API key
        if not request.api_key:
            raise HTTPException(status_code=400, detail="API key is required")
        
        # Get original chart
        parent_chart = CHARTS[request.chart_id]
        dataset_id = parent_chart['dataset_id']
        
        # Validate dataset exists
        if dataset_id not in DATASETS:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Get chart data
        chart_table = parent_chart['table']
        dimensions = parent_chart['dimensions']
        measures = parent_chart['measures']
        parent_sort_order = parent_chart.get('sort_order', 'dataset')
        parent_agg = parent_chart.get('agg', 'sum')
        
        print(f"📊 Parent chart:")
        print(f"   Dimensions: {dimensions}")
        print(f"   Measures: {measures}")
        print(f"   Rows: {len(chart_table)}")
        print(f"   Sort Order: {parent_sort_order}")
        
        # Call LLM to generate transformation plan
        formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        transformation_plan = formulator.generate_transformation_plan(
            user_prompt=request.user_prompt,
            chart_table=chart_table,
            dimensions=dimensions,
            measures=measures,
            chart_spec={
                'sort_order': parent_sort_order,
                'agg': parent_agg
            }
        )
        
        transformations = transformation_plan.get('transformations', [])
        reasoning = transformation_plan.get('reasoning', '')
        token_usage = transformation_plan.get('token_usage', {})
        
        print(f"🔄 Transformation plan generated:")
        print(f"   Operations: {len(transformations)}")
        print(f"   Reasoning: {reasoning}")
        
        if not transformations:
            raise HTTPException(status_code=400, detail="No transformations generated from prompt")
        
        # Convert chart table to DataFrame
        df = pd.DataFrame(chart_table)
        
        # Determine dimension and measure columns for transformations
        dimension_col = dimensions[0] if dimensions else None
        measure_col = measures[0] if measures else None
        
        # Execute transformations
        try:
            transformed_df = _apply_transformations(
                df,
                transformations,
                dimension_col,
                measure_col
            )
        except Exception as e:
            print(f"❌ Transformation execution failed: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Transformation failed: {str(e)}")
        
        # Determine final sort_order
        new_sort_order = transformation_plan.get('sort_order', parent_sort_order)
        
        # Check if transformation invalidates sort_order
        # (e.g., measure removed but was sorting by measure)
        if new_sort_order in ['measure_desc', 'measure_asc']:
            if not measure_col or measure_col not in transformed_df.columns:
                print(f"⚠️ Sort order {new_sort_order} invalid after transformation, falling back to dataset")
                new_sort_order = 'dataset'
        
        # Apply sort order if needed
        if new_sort_order != 'dataset' and dimension_col:
            transformed_df = _apply_sort_order(
                transformed_df,
                dimension_col,
                new_sort_order,
                measure_col
            )
        
        # Check if dimensions/measures changed due to transformations
        final_dimensions = [d for d in dimensions if d in transformed_df.columns]
        final_measures = [m for m in measures if m in transformed_df.columns]
        
        # Add any new calculated columns as measures
        new_columns = [col for col in transformed_df.columns if col not in dimensions and col not in measures]
        if new_columns:
            print(f"✨ New columns detected: {new_columns}")
            final_measures.extend(new_columns)
        
        print(f"📋 Transformed data:")
        print(f"   Rows: {len(df)} → {len(transformed_df)}")
        print(f"   Dimensions: {final_dimensions}")
        print(f"   Measures: {final_measures}")
        print(f"   Sort Order: {new_sort_order}")
        
        # Clean and convert to records
        transformed_df_clean = _clean_dataframe_for_json(transformed_df)
        transformed_table = transformed_df_clean.to_dict(orient="records")
        
        # Generate new chart title
        parent_title = parent_chart['title']
        new_title = f"{parent_title} (transformed)"
        
        # Create new chart ID
        new_chart_id = str(uuid.uuid4())
        
        # Store new chart with lineage metadata
        CHARTS[new_chart_id] = {
            "chart_id": new_chart_id,
            "dataset_id": dataset_id,
            "dimensions": final_dimensions,
            "measures": final_measures,
            "agg": parent_agg,
            "title": new_title,
            "table": transformed_table,
            "sort_order": new_sort_order,
            "filters": {},
            # Lineage metadata
            "parent_chart_id": request.chart_id,
            "transformation_steps": transformations,
            "user_prompt": request.user_prompt,
            "is_derived": True
        }
        
        print(f"✅ Derived chart created: {new_chart_id}")
        print(f"   Parent: {request.chart_id}")
        print(f"   Title: {new_title}")
        
        # Return new chart data
        return {
            "success": True,
            "chart_id": new_chart_id,
            "table": transformed_table,
            "dimensions": final_dimensions,
            "measures": final_measures,
            "title": new_title,
            "agg": parent_agg,
            "sort_order": new_sort_order,
            "parent_chart_id": request.chart_id,
            "transformation_steps": transformations,
            "reasoning": reasoning,
            "token_usage": token_usage
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chart transformation failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transformation failed: {str(e)}")


@app.post("/agent-query")
async def agent_query(request: AgentQueryRequest):
    """
    Agent Query Endpoint
    Processes natural language queries and generates actions for the agentic layer.
    Uses canvas state, dataset metadata, and conversation history for full context.
    
    OPTIMIZATION: In Ask mode, skips the planning LLM call and directly executes
    AI query, reducing API calls from 3 to 2 (33% reduction).
    
    Request:
        - user_query: Natural language query from user
        - canvas_state: Current canvas state (charts, tables, insights)
        - dataset_id: ID of the active dataset
        - api_key: Gemini API key
        - model: Gemini model to use
        - mode: 'canvas' or 'ask'
        - session_id: Optional session identifier for conversation memory
        - conversation_history: Optional list of previous turns from client
    
    Returns:
        - success: bool
        - actions: List of actions to execute (create_chart, create_insight)
        - reasoning: Agent's reasoning for the actions
        - token_usage: Token consumption metrics
        - session_id: Session identifier to pass back on next request
    """
    import uuid
    try:
        print(f"🤖 Agent query received: '{request.user_query}'")
        print(f"   Dataset ID: {request.dataset_id}")
        print(f"   Mode: {request.mode}")
        print(f"   Session ID: {request.session_id or 'new session'}")
        print(f"   Canvas state: {len(request.canvas_state.get('charts', []))} charts, {len(request.canvas_state.get('textBoxes', []))} insights")
        
        # Validate dataset exists
        if request.dataset_id not in DATASETS:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Validate API key
        if not request.api_key:
            raise HTTPException(status_code=400, detail="API key is required")
        
        # Resolve or create session
        session_id = request.session_id or str(uuid.uuid4())
        
        # Retrieve server-side history or use client-provided history
        if session_id in CONVERSATION_STORE:
            history = CONVERSATION_STORE[session_id]
        elif request.conversation_history:
            history = request.conversation_history
        else:
            history = []
        
        print(f"📜 Conversation history: {len(history)} previous turns")
        
        # Get dataset metadata for enhanced context
        dataset_metadata = DATASET_METADATA.get(request.dataset_id, {})
        if dataset_metadata and dataset_metadata.get('success'):
            print(f"📋 Using enhanced dataset context for agent")
        else:
            print("⚠️ No dataset metadata available - using basic context")
            dataset_metadata = None
        
        # Initialize Gemini formulator
        formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
        
        # =====================================================================
        # OPTIMIZATION: Skip planning LLM call in Ask mode
        # =====================================================================
        if request.mode == "ask":
            skip_refinement = request.analysis_type == "raw"
            analysis_label = "RAW ANALYSIS" if skip_refinement else "DETAILED ANALYSIS"
            print(f"🔵 ASK MODE ({analysis_label}): Skipping planning, directly executing AI query")
            
            dataset = DATASETS[request.dataset_id]
            ai_result = formulator.get_text_analysis(
                user_query=request.user_query,
                dataset=dataset,
                dataset_id=request.dataset_id,
                dataset_metadata=dataset_metadata,
                skip_refinement=skip_refinement,
                confirmed_relationships=request.confirmed_relationships,
                all_datasets=DATASETS,
            )
            
            print(f"✅ Ask mode AI query completed")
            
            # Build slim canvas summary for history entry
            canvas_summary = _build_slim_canvas_summary(request.canvas_state)
            
            # Store this turn in conversation history
            history.append({
                "role": "user",
                "content": request.user_query,
                "canvas_summary": canvas_summary,
                "mode": "ask"
            })
            history.append({
                "role": "assistant",
                "content": ai_result.get("answer", ""),
                "actions_summary": "data analysis query",
                "mode": "ask"
            })
            
            # Keep history bounded
            if len(history) > CONVERSATION_MAX_TURNS * 2:
                history = history[-(CONVERSATION_MAX_TURNS * 2):]
            CONVERSATION_STORE[session_id] = history
            
            return {
                "success": True,
                "session_id": session_id,
                "actions": [{
                    "type": "ai_query",
                    "query": request.user_query,
                    "position": "center",
                    "reasoning": "Direct AI query in Ask mode"
                }],
                "reasoning": "Ask mode: Direct analytical response without planning",
                "token_usage": ai_result.get("token_usage", {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}),
                "ask_mode_result": {
                    "mode": "ask",
                    "query": request.user_query,
                    "answer": ai_result.get("answer", ""),
                    "raw_analysis": ai_result.get("raw_analysis", ""),
                    "is_refined": ai_result.get("is_refined", False),
                    "python_code": ai_result.get("code_steps", [""])[0] if ai_result.get("code_steps") else "",
                    "code_steps": ai_result.get("code_steps", []),
                    "tabular_data": ai_result.get("tabular_data", []),
                    "has_table": ai_result.get("has_table", False),
                    "success": ai_result.get("success", True),
                    "merge_info": ai_result.get("merge_info"),
                }
            }
        
        # =====================================================================
        # CANVAS MODE: Full planning flow with conversation history
        # =====================================================================
        print("🟣 CANVAS MODE: Using full planning flow with conversation history")
        
        result = formulator.generate_agent_actions(
            query=request.user_query,
            canvas_state=request.canvas_state,
            dataset_id=request.dataset_id,
            dataset_metadata=dataset_metadata,
            mode=request.mode,
            conversation_history=history,
            confirmed_relationships=request.confirmed_relationships,
            all_datasets=DATASETS,
        )
        
        print(f"✅ Agent generated {len(result.get('actions', []))} actions")
        
        # Store this turn in conversation history
        canvas_summary = _build_slim_canvas_summary(request.canvas_state)
        actions_summary = _summarize_actions(result.get("actions", []))
        
        history.append({
            "role": "user",
            "content": request.user_query,
            "canvas_summary": canvas_summary,
            "mode": "canvas"
        })
        history.append({
            "role": "assistant",
            "content": result.get("reasoning", ""),
            "actions_summary": actions_summary,
            "mode": "canvas"
        })
        
        if len(history) > CONVERSATION_MAX_TURNS * 2:
            history = history[-(CONVERSATION_MAX_TURNS * 2):]
        CONVERSATION_STORE[session_id] = history
        
        return {
            "success": True,
            "session_id": session_id,
            "actions": result.get("actions", []),
            "reasoning": result.get("reasoning", ""),
            "token_usage": result.get("token_usage", {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Agent query failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agent query failed: {str(e)}")


def _build_slim_canvas_summary(canvas_state: Dict[str, Any]) -> Dict[str, Any]:
    """Build a lightweight canvas summary for conversation history (not the full state)."""
    charts = canvas_state.get("charts", [])
    kpis = canvas_state.get("kpis", [])
    tables = canvas_state.get("tables", [])
    return {
        "chart_count": len(charts),
        "kpi_count": len(kpis),
        "table_count": len(tables),
        "chart_ids": [c.get("id") for c in charts],
        "chart_titles": [c.get("title", "") for c in charts],
        "chart_types": [c.get("chartType", "bar") for c in charts],
    }


def _summarize_actions(actions: List[Dict[str, Any]]) -> str:
    """Build a human-readable summary of actions taken for history storage."""
    if not actions:
        return "no actions"
    parts = []
    for a in actions:
        t = a.get("type", "unknown")
        if t == "create_chart":
            dims = ", ".join(a.get("dimensions", []))
            meas = ", ".join(a.get("measures", []))
            parts.append(f"created {a.get('chartType','bar')} chart ({meas} by {dims})")
        elif t == "create_kpi":
            parts.append(f"created KPI: {a.get('query','metric')}")
        elif t == "create_insight":
            parts.append("added insight")
        elif t == "move_shape":
            parts.append(f"moved shape {a.get('shapeId','')}")
        elif t == "highlight_shape":
            parts.append(f"highlighted shape {a.get('shapeId','')}")
        elif t == "align_shapes":
            parts.append(f"aligned shapes {a.get('alignment','')}")
        else:
            parts.append(t)
    return "; ".join(parts)


@app.delete("/conversation/{session_id}")
async def clear_conversation(session_id: str):
    """Clear conversation history for a session."""
    if session_id in CONVERSATION_STORE:
        del CONVERSATION_STORE[session_id]
    return {"success": True, "session_id": session_id}


# =============================================================================
# Shared helper — pre-compute measure statistics for Unified Agent
# =============================================================================

def _compute_measure_stats(scope_ids: List[str]) -> Dict[str, Any]:
    """
    Pre-compute sum/mean/min/max/count for every numeric column across all
    scope datasets. Results are passed to unify_and_analyse() so the LLM can
    assign KPI values without making extra API calls.
    """
    stats: Dict[str, Any] = {}
    for did in scope_ids:
        df = DATASETS.get(did)
        if df is None:
            continue
        for col in df.select_dtypes(include=["number"]).columns:
            key = col  # use raw column name; caller resolves collisions if needed
            if key not in stats:
                stats[key] = {
                    "sum":   float(df[col].sum()),
                    "mean":  float(df[col].mean()),
                    "min":   float(df[col].min()),
                    "max":   float(df[col].max()),
                    "count": int(df[col].count()),
                }
    return stats


# =============================================================================
# SSE Streaming Agent Endpoint
# Real-time token streaming for the new AgentSidebarPanel
# =============================================================================

@app.post("/agent-stream")
async def agent_stream(request: AgentQueryRequest):
    """
    Streaming Agent Endpoint
    Streams the AI planning response token-by-token using Server-Sent Events (SSE).
    The frontend reads this stream and displays tokens as they arrive.
    
    SSE event types:
      - 'token': A chunk of text from the model (AI thinking / reasoning)
      - 'actions': The final parsed JSON actions object
      - 'done': Stream complete (includes session_id and token_usage)
      - 'error': An error occurred
    """
    import uuid as _uuid

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # Resolve session
            session_id = request.session_id or str(_uuid.uuid4())

            # Retrieve history
            if session_id in CONVERSATION_STORE:
                history = CONVERSATION_STORE[session_id]
            elif request.conversation_history:
                history = request.conversation_history
            else:
                history = []

            # Validate
            if request.dataset_id not in DATASETS:
                yield f"event: error\ndata: {json.dumps({'error': 'Dataset not found'})}\n\n"
                return
            if not request.api_key:
                yield f"event: error\ndata: {json.dumps({'error': 'API key required'})}\n\n"
                return

            dataset_metadata = DATASET_METADATA.get(request.dataset_id) or {}
            if not dataset_metadata.get('success'):
                dataset_metadata = None

            formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)

            # ---- ASK MODE: stream the analysis response ----
            if request.mode == "ask":
                skip_refinement = request.analysis_type == "raw"
                dataset = DATASETS[request.dataset_id]

                # Stream the planning tokens, then send full result
                yield f"event: token\ndata: {json.dumps({'text': '🔍 Analyzing your question...'})}\n\n"
                await asyncio.sleep(0)

                ai_result = formulator.get_text_analysis(
                    user_query=request.user_query,
                    dataset=dataset,
                    dataset_id=request.dataset_id,
                    dataset_metadata=dataset_metadata,
                    skip_refinement=skip_refinement,
                    confirmed_relationships=request.confirmed_relationships,
                    all_datasets=DATASETS,
                )

                answer = ai_result.get("answer", "")

                # Stream answer in ~200-char chunks to simulate token streaming
                chunk_size = 200
                for i in range(0, len(answer), chunk_size):
                    chunk = answer[i:i + chunk_size]
                    yield f"event: token\ndata: {json.dumps({'text': chunk})}\n\n"
                    await asyncio.sleep(0.02)

                # Store history
                canvas_summary = _build_slim_canvas_summary(request.canvas_state)
                history.extend([
                    {"role": "user", "content": request.user_query, "canvas_summary": canvas_summary, "mode": "ask"},
                    {"role": "assistant", "content": answer, "actions_summary": "data analysis", "mode": "ask"}
                ])
                if len(history) > CONVERSATION_MAX_TURNS * 2:
                    history = history[-(CONVERSATION_MAX_TURNS * 2):]
                CONVERSATION_STORE[session_id] = history

                ask_result = {
                    "mode": "ask",
                    "query": request.user_query,
                    "answer": answer,
                    "raw_analysis": ai_result.get("raw_analysis", ""),
                    "is_refined": ai_result.get("is_refined", False),
                    "python_code": ai_result.get("code_steps", [""])[0] if ai_result.get("code_steps") else "",
                    "tabular_data": ai_result.get("tabular_data", []),
                    "has_table": ai_result.get("has_table", False),
                    "success": ai_result.get("success", True),
                    "merge_info": ai_result.get("merge_info"),
                }

                yield f"event: actions\ndata: {json.dumps({'actions': [{'type': 'ai_query', 'query': request.user_query, 'position': 'center', 'reasoning': 'Ask mode'}], 'reasoning': 'Direct analysis', 'ask_mode_result': ask_result})}\n\n"
                yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'token_usage': ai_result.get('token_usage', {})})}\n\n"
                return

            # ---- CANVAS MODE: stream reasoning then actions ----
            yield f"event: token\ndata: {json.dumps({'text': '🧠 Understanding your request...'})}\n\n"
            await asyncio.sleep(0)

            # Build history context string (same logic as generate_agent_actions)
            history_context = ""
            if history:
                recent = history[-6:] if len(history) > 6 else history
                lines = []
                for turn in reversed(recent):
                    role = "User" if turn.get("role") == "user" else "Agent"
                    lines.append(f"  [{role}]: {turn.get('content', '')}")
                history_context = "\n📜 RECENT HISTORY:\n" + "\n".join(lines) + "\n"

            result = formulator.generate_agent_actions(
                query=request.user_query,
                canvas_state=request.canvas_state,
                dataset_id=request.dataset_id,
                dataset_metadata=dataset_metadata,
                mode=request.mode,
                conversation_history=history,
                confirmed_relationships=request.confirmed_relationships,
                all_datasets=DATASETS,
            )

            # Stream reasoning text
            reasoning = result.get("reasoning", "")
            if reasoning:
                chunk_size = 80
                for i in range(0, len(reasoning), chunk_size):
                    yield f"event: token\ndata: {json.dumps({'text': reasoning[i:i+chunk_size]})}\n\n"
                    await asyncio.sleep(0.04)

            # Stream action summaries one by one
            actions = result.get("actions", [])
            for action in actions:
                action_label = _summarize_actions([action])
                bullet_text = "\n• " + action_label
                yield f"event: token\ndata: {json.dumps({'text': bullet_text})}\n\n"
                await asyncio.sleep(0.05)

            # Store history
            canvas_summary = _build_slim_canvas_summary(request.canvas_state)
            actions_summary = _summarize_actions(actions)
            history.extend([
                {"role": "user", "content": request.user_query, "canvas_summary": canvas_summary, "mode": "canvas"},
                {"role": "assistant", "content": reasoning, "actions_summary": actions_summary, "mode": "canvas"}
            ])
            if len(history) > CONVERSATION_MAX_TURNS * 2:
                history = history[-(CONVERSATION_MAX_TURNS * 2):]
            CONVERSATION_STORE[session_id] = history

            actions_payload = {'actions': actions, 'reasoning': reasoning}
            if result.get('merged_dataset_id'):
                actions_payload['merged_dataset_id'] = result['merged_dataset_id']
                actions_payload['merge_info'] = result.get('merge_info')
            yield f"event: actions\ndata: {json.dumps(actions_payload)}\n\n"
            yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'token_usage': result.get('token_usage', {})})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


# =============================================================================
# Unified Super Agent Endpoint
# Single-LLM-call objective decomposer → pandas execution → dashboard
# =============================================================================

@app.post("/unified-agent")
async def unified_agent(request: AgentQueryRequest):
    """
    Unified Super Agent — takes a high-level business objective and:
      1. Calls unify_and_analyse() — 1 LLM call — to decompose into analyses + KPIs
      2. Executes each pandas code block natively (no extra LLM calls)
      3. Registers results as ephemeral datasets
      4. Emits a create_dashboard SSE actions event that the existing frontend handles

    SSE event types mirror /agent-stream: token, actions, done, error.
    """
    import uuid as _uuid

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            session_id = request.session_id or str(_uuid.uuid4())

            if not request.api_key:
                yield f"event: error\ndata: {json.dumps({'error': 'API key required'})}\n\n"
                return

            # ── 1. Resolve scope datasets ─────────────────────────────────────
            scope_ids = [did for did in DATASETS if did not in MERGED_DATASETS]
            if not scope_ids:
                yield f"event: error\ndata: {json.dumps({'error': 'No datasets loaded. Upload CSV files first.'})}\n\n"
                return

            yield f"event: token\ndata: {json.dumps({'text': '✦ Reading your data...'})}\n\n"
            await asyncio.sleep(0)

            # ── 2. Build schema context + measure stats (no LLM) ─────────────
            schema        = build_schema_context(scope_ids, DATASETS, DATASET_METADATA, DATASET_RELATIONSHIPS)
            measure_stats = _compute_measure_stats(scope_ids)

            # ── 3. Pre-compute the BFS join NOW so the LLM sees the real column
            #       names that will exist in `df` at code-execution time.
            #       Doing this before the LLM call is the key fix for pandas
            #       KeyErrors caused by join-suffix column name mismatches.
            all_rels = [
                r for r in DATASET_RELATIONSHIPS
                if r.get("dataset_a_id") in scope_ids
                and r.get("dataset_b_id") in scope_ids
                and r.get("status") == "accepted"
            ]

            if len(scope_ids) == 1 or not all_rels:
                working_df   = DATASETS[scope_ids[0]]
                join_desc    = "single table — no join"
                needed_ids   = scope_ids
            else:
                primary_id   = find_primary_dataset(all_rels, DATASETS) or scope_ids[0]
                merged_df, join_desc = build_merged_dataset(primary_id, all_rels, DATASETS)
                working_df   = merged_df if merged_df is not None else DATASETS[primary_id]
                needed_ids   = scope_ids  # all scope datasets used; refined below if LLM narrows

            # Actual column names in the merged DataFrame — passed to the LLM prompt
            merged_columns = list(working_df.columns)

            yield f"event: token\ndata: {json.dumps({'text': '✦ Planning your analysis...'})}\n\n"
            await asyncio.sleep(0)

            # ── 4. Single LLM call — now armed with real merged column names ──
            formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
            result = formulator.unify_and_analyse(
                objective=request.user_query,
                schema_context=schema,
                all_datasets=DATASETS,
                dataset_metadata=DATASET_METADATA,
                measure_stats=measure_stats,
                merged_columns=merged_columns,
            )

            if not result:
                yield f"event: error\ndata: {json.dumps({'error': 'Analysis planning failed. Try rephrasing your objective.'})}\n\n"
                return

            token_usage = result.get("token_usage", {})
            analyses    = result.get("analyses", [])

            # Refine needed_ids from the LLM's table selection (best-effort)
            llm_tables = [did for did in result.get("tables", []) if did in DATASETS and did not in MERGED_DATASETS]
            if llm_tables:
                needed_ids = llm_tables

            yield f"event: token\ndata: {json.dumps({'text': f'✦ Running {len(analyses)} analyses...'})}\n\n"
            await asyncio.sleep(0)

            # ── 5a. working_df already computed above; re-join only if the LLM
            #        chose a narrower table set than the full scope ─────────────
            if set(needed_ids) != set(scope_ids) and len(needed_ids) > 0:
                narrowed_rels = [
                    r for r in DATASET_RELATIONSHIPS
                    if r.get("dataset_a_id") in needed_ids
                    and r.get("dataset_b_id") in needed_ids
                    and r.get("status") == "accepted"
                ]
                if len(needed_ids) == 1 or not narrowed_rels:
                    working_df = DATASETS[needed_ids[0]]
                    join_desc  = "single table — no join"
                else:
                    pid = find_primary_dataset(narrowed_rels, DATASETS) or needed_ids[0]
                    mdf, jd = build_merged_dataset(pid, narrowed_rels, DATASETS)
                    if mdf is not None:
                        working_df = mdf
                        join_desc  = jd

            # ── 5. Execute each pandas code block natively (no LLM) ──────────
            dashboard_elements = []
            analyses_detail: List[Dict[str, Any]] = []

            for i, analysis in enumerate(analyses):
                q_code   = analysis.get("pandas_code", "")
                q_label  = analysis.get("question", f"Analysis {i+1}")
                insight  = analysis.get("insight_text", "")
                dims     = analysis.get("dimensions", [])
                measures = analysis.get("measures", [])
                chart_t  = analysis.get("chart_type", "bar")

                if not q_code:
                    analyses_detail.append({
                        "question":    q_label,
                        "insight":     insight,
                        "python_code": q_code,
                        "chart_type":  chart_t,
                        "success":     False,
                    })
                    continue

                exec_result = formulator._execute_pandas_code(q_code, working_df, q_label)
                exec_success = exec_result.get("success") and exec_result.get("result_type") == "table"

                # Ground the insight text with actual top-result values (no extra LLM call)
                grounded_insight = insight
                if exec_success:
                    result_data = exec_result.get("result_data", [])
                    if result_data:
                        top_row = result_data[0]
                        data_summary = ", ".join(
                            f"{k}={v}" for k, v in list(top_row.items())[:3]
                        )
                        grounded_insight = f"{insight} (Top result: {data_summary})" if insight else data_summary

                if exec_success:
                    result_data = exec_result.get("result_data", [])
                    result_cols = exec_result.get("result_columns") or (list(result_data[0].keys()) if result_data else dims + measures)

                    # Register as ephemeral dataset so /charts can reference it
                    ds_id  = str(uuid.uuid4())
                    result_df = pd.DataFrame(result_data, columns=result_cols)
                    DATASETS[ds_id] = result_df
                    DATASET_METADATA[ds_id] = {
                        "filename":       f"unified_{ds_id[:8]}",
                        "dataset_name":   q_label[:60],
                        "dataset_summary": q_label,
                        "columns": [
                            {"name": c, "type": _infer_col_type(c, result_df, {}), "description": ""}
                            for c in result_df.columns
                        ],
                        "is_ephemeral": True,
                        "success": True,
                    }

                    # Resolve actual column names from result_df for chart reliability
                    actual_dims = [c for c in dims if c in result_df.columns] or [result_df.columns[0]] if len(result_df.columns) > 0 else dims
                    actual_meas = [c for c in measures if c in result_df.columns] or ([result_df.columns[1]] if len(result_df.columns) > 1 else measures)

                    dashboard_elements.append({
                        "type":       "chart",
                        "dimensions": actual_dims,
                        "measures":   actual_meas,
                        "chartType":  chart_t,
                        "datasetId":  ds_id,
                        "reasoning":  grounded_insight or q_label,
                        "agg":        "sum",
                    })

                # Always add insight text card with the grounded insight
                if grounded_insight:
                    dashboard_elements.append({
                        "type":      "insight",
                        "text":      f"**{q_label}**\n{grounded_insight}",
                        "reasoning": grounded_insight or q_label,
                    })

                # Collect per-analysis detail for the sidebar (includes python code)
                analyses_detail.append({
                    "question":    q_label,
                    "insight":     grounded_insight,
                    "python_code": q_code,
                    "chart_type":  chart_t,
                    "success":     exec_success,
                })

                yield f"event: token\ndata: {json.dumps({'text': f' ✓ {q_label[:50]}'})}\n\n"
                await asyncio.sleep(0)

            # ── 6. Prepend KPI cards (values from pre-computed stats, no LLM) ─
            kpi_elements = []
            for kpi in result.get("kpis", []):
                kpi_elements.append({
                    "type":            "kpi",
                    "query":           kpi.get("label", "Metric"),
                    "value":           kpi.get("value", 0),
                    "formatted_value": kpi.get("formatted", str(kpi.get("value", 0))),
                    "reasoning":       kpi.get("label", "Key metric"),
                })
            dashboard_elements = kpi_elements + dashboard_elements

            if not dashboard_elements:
                yield f"event: error\ndata: {json.dumps({'error': 'No analyses produced chart-ready data. Try a more specific objective.'})}\n\n"
                return

            # ── 7. Emit create_dashboard action (reuses existing frontend path) ─
            merge_info_str = join_desc if join_desc != "single table — no join" else None
            actions_payload = {
                "actions": [{
                    "type":             "create_dashboard",
                    "dashboardType":    "unified",
                    "layoutStrategy":   result.get("layout", "kpi-dashboard"),
                    "elements":         dashboard_elements,
                    "reasoning":        result.get("objective_summary", request.user_query),
                    "analyses_detail":  analyses_detail,
                    "includeInsights":  False,
                }],
                "reasoning":  result.get("objective_summary", request.user_query),
                "merge_info": merge_info_str,
            }

            yield f"event: actions\ndata: {json.dumps(actions_payload)}\n\n"
            yield f"event: done\ndata: {json.dumps({'session_id': session_id, 'token_usage': token_usage})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


# =============================================================================
# Smart Chart — single-chart variant of the Unified pipeline
# =============================================================================

@app.post("/smart-chart")
async def smart_chart(request: SmartChartRequest):
    """
    Smart Chart Endpoint — produces exactly ONE chart from a natural language request.

    Unlike /unified-agent (which always generates a full dashboard), this endpoint:
      1. Calls generate_single_chart_code() — 1 LLM call — to write focused pandas code
      2. Executes the code natively (no extra LLM calls)
      3. Registers the result as an ephemeral dataset
      4. Runs /charts aggregation on the shaped data
      5. Returns a standard chart object compatible with figureFromPayload()

    The frontend can use this response exactly like it uses POST /charts — the chart
    object has the same {chart_id, table, dimensions, measures, statistics, title} shape.
    """
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key required")

    # ── 1. Resolve scope datasets ─────────────────────────────────────────
    scope_ids = [did for did in DATASETS if did not in MERGED_DATASETS]
    if not scope_ids:
        raise HTTPException(status_code=400, detail="No datasets loaded. Upload CSV files first.")

    # ── 2. Pre-join datasets (same logic as /unified-agent) ───────────────
    all_rels = [
        r for r in DATASET_RELATIONSHIPS
        if r.get("dataset_a_id") in scope_ids
        and r.get("dataset_b_id") in scope_ids
        and r.get("status") == "accepted"
    ]

    if len(scope_ids) == 1 or not all_rels:
        source_dataset_id = scope_ids[0]
        working_df = DATASETS[source_dataset_id]
    else:
        primary_id = find_primary_dataset(all_rels, DATASETS) or scope_ids[0]
        source_dataset_id = primary_id
        merged_df, _ = build_merged_dataset(primary_id, all_rels, DATASETS)
        working_df = merged_df if merged_df is not None else DATASETS[primary_id]

    merged_columns = list(working_df.columns)

    # ── 3. Build schema context ───────────────────────────────────────────
    schema = build_schema_context(scope_ids, DATASETS, DATASET_METADATA, DATASET_RELATIONSHIPS)

    # ── 4. Single LLM call ────────────────────────────────────────────────
    formulator = GeminiDataFormulator(api_key=request.api_key, model=request.model)
    result = formulator.generate_single_chart_code(
        user_request=request.user_request,
        schema_context=schema,
        all_datasets=DATASETS,
        dataset_metadata=DATASET_METADATA,
        merged_columns=merged_columns,
    )

    if not result:
        raise HTTPException(status_code=500, detail="Chart code generation failed. Try rephrasing your request.")

    pandas_code = result["pandas_code"]
    dims        = result["dimensions"]
    measures    = result["measures"]
    chart_type  = result["chart_type"]
    title       = result["title"]

    # ── 5. Execute pandas code natively ───────────────────────────────────
    exec_result = formulator._execute_pandas_code(pandas_code, working_df, request.user_request)

    if not exec_result.get("success") or exec_result.get("result_type") != "table":
        error_hint = exec_result.get("answer", "Code execution returned no tabular result.")
        raise HTTPException(status_code=422, detail=f"Pandas execution failed: {error_hint}")

    result_data = exec_result.get("result_data", [])
    if not result_data:
        raise HTTPException(status_code=422, detail="Query produced an empty result set.")

    result_cols = exec_result.get("result_columns") or list(result_data[0].keys())

    # ── 6. Register as ephemeral dataset ──────────────────────────────────
    ds_id = str(uuid.uuid4())
    result_df = pd.DataFrame(result_data, columns=result_cols)
    DATASETS[ds_id] = result_df
    DATASET_METADATA[ds_id] = {
        "filename":        f"smart_{ds_id[:8]}",
        "dataset_name":    title[:60],
        "dataset_summary": title,
        "columns": [
            {"name": c, "type": _infer_col_type(c, result_df, {}), "description": ""}
            for c in result_df.columns
        ],
        "is_ephemeral": True,
        "success": True,
    }

    # Resolve actual dim/measure names against result_df columns
    actual_dims = [c for c in dims if c in result_df.columns] or (
        [result_df.columns[0]] if len(result_df.columns) > 0 else dims
    )
    actual_meas = [c for c in measures if c in result_df.columns] or (
        [result_df.columns[1]] if len(result_df.columns) > 1 else measures
    )

    # ── 7. Run /charts aggregation on the already-shaped data ─────────────
    # Pass the pre-computed table so _agg() is skipped (data is already shaped)
    row_limited = result_data[:500]
    table_df = pd.DataFrame(row_limited, columns=result_cols)
    chart_statistics = _calculate_chart_statistics(table_df, actual_meas)

    chart_id = str(uuid.uuid4())
    CHARTS[chart_id] = {
        "chart_id":       chart_id,
        "dataset_id":     ds_id,
        "dimensions":     actual_dims,
        "measures":       actual_meas,
        "agg":            "sum",
        "title":          title,
        "table":          row_limited,
        "statistics":     chart_statistics,
        "originalMeasure": None,
        "filters":        {},
        "sort_order":     "dataset",
        "is_derived":        True,
        "chart_type_hint":   chart_type,
        "smart_chart":       True,
        "source_dataset_id": source_dataset_id,  # original raw dataset — used by /fuse
        "pandas_code":       pandas_code,
        "token_usage":       result.get("token_usage", {}),
    }

    print(f"✦ /smart-chart: chart_id={chart_id}, dims={actual_dims}, measures={actual_meas}, type={chart_type}, rows={len(row_limited)}")
    return CHARTS[chart_id]


# =============================================================================
# GitHub Gist API - Dashboard Snapshot Storage
# =============================================================================

# Get GitHub token from environment or local file
def load_github_token():
    """
    Load GitHub Gist token from environment variable or local file.
    For local development, create a file named 'github_token.txt' with your token.
    For production, use the GITHUB_GIST_TOKEN environment variable.
    """
    # First, try environment variable (for production on Render)
    token = os.getenv('GITHUB_GIST_TOKEN', '')
    
    if token:
        print("✅ Using GitHub token from environment variable")
        return token
    
    # If not in environment, try reading from local file (for development)
    local_token_file = os.path.join(os.path.dirname(__file__), 'github_token.txt')
    
    try:
        if os.path.exists(local_token_file):
            with open(local_token_file, 'r') as f:
                token = f.read().strip()
            if token:
                print(f"✅ Using GitHub token from local file: {local_token_file}")
                return token
    except Exception as e:
        print(f"⚠️ Failed to read token from local file: {e}")
    
    print("⚠️ No GitHub token found. Set GITHUB_GIST_TOKEN env var or create github_token.txt")
    return ''

GITHUB_GIST_TOKEN = load_github_token()
GITHUB_API = 'https://api.github.com/gists'

class SnapshotSaveRequest(BaseModel):
    canvasState: dict
    metadata: dict
    expiresIn: int = 7  # Days (stored as metadata, not enforced)

@app.post("/snapshots")
async def save_snapshot_to_gist(request: SnapshotSaveRequest):
    """
    Save dashboard snapshot as a GitHub Gist
    Returns a shareable URL that can be used to load the dashboard
    """
    try:
        if not GITHUB_GIST_TOKEN:
            raise HTTPException(
                status_code=500, 
                detail="GitHub Gist token not configured. Please set GITHUB_GIST_TOKEN environment variable."
            )
        
        # Prepare snapshot data
        snapshot_data = {
            'canvasState': request.canvasState,
            'metadata': request.metadata,
            'createdAt': datetime.now().isoformat(),
            'expiresAt': (datetime.now() + timedelta(days=request.expiresIn)).isoformat()
        }
        
        # Create gist payload
        gist_title = request.metadata.get('title', 'Untitled Dashboard')
        chart_count = request.metadata.get('chartCount', 0)
        
        gist_payload = {
            'description': f"DFuse Dashboard - {gist_title} ({chart_count} charts)",
            'public': False,  # Secret gist (not indexed by search engines)
            'files': {
                'dashboard.json': {
                    'content': json.dumps(snapshot_data, indent=2)
                }
            }
        }
        
        # Make request to GitHub API
        headers = {
            'Authorization': f'token {GITHUB_GIST_TOKEN}',
            'Accept': 'application/vnd.github.v3+json'
        }
        
        print(f"📤 Creating GitHub Gist for dashboard: {gist_title}")
        response = requests.post(GITHUB_API, json=gist_payload, headers=headers)
        
        if response.status_code != 201:
            error_detail = response.json().get('message', 'Unknown error')
            print(f"❌ Failed to create gist: {response.status_code} - {error_detail}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to create gist: {error_detail}"
            )
        
        gist_data = response.json()
        gist_id = gist_data['id']
        
        # Generate shareable URL
        frontend_url = os.getenv('FRONTEND_URL', 'https://dfusenew.onrender.com')
        share_url = f"{frontend_url}?snapshot={gist_id}"
        
        print(f"✅ Gist created successfully: {gist_id}")
        print(f"   Share URL: {share_url}")
        print(f"   Gist URL: {gist_data['html_url']}")
        
        return {
            'success': True,
            'snapshot_id': gist_id,
            'share_url': share_url,
            'gist_url': gist_data['html_url'],  # Direct link to view on GitHub
            'created_at': snapshot_data['createdAt'],
            'expires_at': snapshot_data['expiresAt']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error saving snapshot: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save snapshot: {str(e)}")


@app.get("/snapshots/{gist_id}")
async def get_snapshot_from_gist(gist_id: str):
    """
    Retrieve dashboard snapshot from GitHub Gist
    Used when loading a shared dashboard via URL
    """
    try:
        if not GITHUB_GIST_TOKEN:
            raise HTTPException(
                status_code=500, 
                detail="GitHub Gist token not configured"
            )
        
        # Make request to GitHub API
        headers = {
            'Authorization': f'token {GITHUB_GIST_TOKEN}',
            'Accept': 'application/vnd.github.v3+json'
        }
        
        print(f"📥 Fetching gist: {gist_id}")
        response = requests.get(f'{GITHUB_API}/{gist_id}', headers=headers)
        
        if response.status_code == 404:
            print(f"❌ Gist not found: {gist_id}")
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        if response.status_code != 200:
            error_detail = response.json().get('message', 'Unknown error')
            print(f"❌ Failed to fetch gist: {response.status_code} - {error_detail}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to retrieve snapshot: {error_detail}"
            )
        
        gist_data = response.json()
        
        # Extract JSON content from the gist
        if 'dashboard.json' not in gist_data['files']:
            raise HTTPException(
                status_code=500, 
                detail="Invalid gist format: dashboard.json not found"
            )
        
        file_data = gist_data['files']['dashboard.json']
        
        # Check if content is truncated (GitHub truncates large files)
        if file_data.get('truncated', False):
            print(f"⚠️ Gist content is truncated, fetching from raw URL...")
            raw_url = file_data.get('raw_url')
            if not raw_url:
                raise HTTPException(
                    status_code=500,
                    detail="Gist is truncated but no raw URL available"
                )
            
            # Fetch the full content from raw URL
            raw_response = requests.get(raw_url)
            if raw_response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to fetch full gist content: {raw_response.status_code}"
                )
            file_content = raw_response.text
            print(f"✅ Fetched full content from raw URL ({len(file_content)} chars)")
        else:
            file_content = file_data['content']
        
        snapshot_data = json.loads(file_content)
        
        print(f"✅ Gist fetched successfully: {gist_id}")
        print(f"   Charts: {snapshot_data.get('metadata', {}).get('chartCount', 0)}")
        print(f"   Created: {snapshot_data.get('createdAt', 'Unknown')}")
        
        return {
            'success': True,
            'canvasState': snapshot_data.get('canvasState', {}),
            'metadata': snapshot_data.get('metadata', {}),
            'created_at': snapshot_data.get('createdAt'),
            'expires_at': snapshot_data.get('expiresAt')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error fetching snapshot: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load snapshot: {str(e)}")


# -----------------------
# Query Execution Engine
# -----------------------

class QueryEngineRequest(BaseModel):
    user_query: str
    dataset_ids: Optional[List[str]] = None  # None = use all uploaded datasets
    api_key: Optional[str] = None
    model: str = "gemini-2.5-flash"


@app.post("/query-engine")
async def query_engine_endpoint(request: QueryEngineRequest):
    """
    Lazy schema-aware query execution engine.

    Pipeline:
      1. Resolve scope (which datasets to work with)
      2. build_schema_context() — compact schema, no LLM
      3. plan_query()          — LLM Call 1: which tables + join path
      4. build_merged_dataset()— deterministic BFS join (no LLM)
      5. get_text_analysis()   — LLM Call 2: pandas code gen + execution
      6. Return typed result   — table | value | text
    """
    try:
        # ── 1. Resolve scope ──────────────────────────────────────────────────
        scope_ids = request.dataset_ids or list(DATASETS.keys())
        # Filter out merged pseudo-datasets (they live in MERGED_DATASETS)
        scope_ids = [did for did in scope_ids if did in DATASETS and did not in MERGED_DATASETS]

        if not scope_ids:
            raise HTTPException(
                status_code=400,
                detail="No valid datasets available. Please upload CSV files first."
            )

        print(f"\n🔍 /query-engine: '{request.user_query}' | scope: {len(scope_ids)} dataset(s)")

        # ── 2. Build compact schema context ──────────────────────────────────
        schema = build_schema_context(scope_ids, DATASETS, DATASET_METADATA, DATASET_RELATIONSHIPS)

        # ── 3. Single-call plan + code generation (LLM Call 1) ───────────────
        #    Falls back transparently to the original 2-call path on any failure.
        formulator = GeminiDataFormulator(api_key=request.api_key)

        pag = formulator.plan_and_generate(
            request.user_query,
            schema,
            all_datasets=DATASETS,
            dataset_metadata=DATASET_METADATA,
        )

        single_call_ok  = bool(pag and pag.get("pandas_code"))
        pandas_code_pag = pag.get("pandas_code", "") if single_call_ok else ""
        pag_token_usage = pag.get("token_usage", {}) if single_call_ok else {}

        if single_call_ok:
            plan        = pag
            needed_ids  = [did for did in pag.get("tables", []) if did in DATASETS and did not in MERGED_DATASETS]
            print(f"✅ Single-call path active")
        else:
            # ── 3-fallback. 2-call path ──────────────────────────────────────
            print("⚠️  Falling back to 2-call path (plan_query + get_text_analysis)")
            plan = formulator.plan_query(request.user_query, schema)
            needed_ids = [did for did in plan.get("tables", []) if did in DATASETS and did not in MERGED_DATASETS]

        if not needed_ids:
            needed_ids = scope_ids
            print("⚠️  Planner returned no valid IDs — using all scope datasets")

        print(f"📋 Tables selected: {[DATASET_METADATA.get(d, {}).get('dataset_name', d[:8]) for d in needed_ids]}")

        # ── 4. Build minimal merged dataset — deterministic BFS (unchanged) ──
        filtered_rels = [
            r for r in DATASET_RELATIONSHIPS
            if r.get("dataset_a_id") in needed_ids
            and r.get("dataset_b_id") in needed_ids
            and r.get("status") == "accepted"
        ]

        if len(needed_ids) == 1 or not filtered_rels:
            primary_id  = needed_ids[0]
            working_df  = DATASETS[primary_id]
            join_desc   = "single table — no join"
            print(f"📊 Single-table mode: {DATASET_METADATA.get(primary_id, {}).get('dataset_name', primary_id[:8])}")
        else:
            primary_id = find_primary_dataset(filtered_rels, DATASETS) or needed_ids[0]
            merged_df, join_desc = build_merged_dataset(primary_id, filtered_rels, DATASETS)
            if merged_df is not None:
                working_df = merged_df
                print(f"📊 Merged dataset: {working_df.shape[0]} rows × {working_df.shape[1]} cols | {join_desc}")
            else:
                working_df = DATASETS[primary_id]
                join_desc  = f"join failed — fallback to {DATASET_METADATA.get(primary_id, {}).get('dataset_name', primary_id[:8])}"
                print(f"⚠️  Merge failed, falling back to primary dataset")

        # ── 5. Combine metadata across selected tables (unchanged) ────────────
        summaries = []
        all_col_meta: List[Dict[str, Any]] = []
        for did in needed_ids:
            meta = DATASET_METADATA.get(did, {})
            if meta.get("dataset_summary"):
                summaries.append(meta["dataset_summary"])
            cols = meta.get("columns") or []
            all_col_meta.extend(cols)

        combined_meta = {
            "dataset_summary": " | ".join(summaries) if summaries else "",
            "columns": all_col_meta,
            "success": True,
        }

        # ── 6. Execute query ──────────────────────────────────────────────────
        if single_call_ok:
            # Single-call path: run LLM-generated code directly, no second LLM call
            exec_result = formulator._execute_pandas_code(
                pandas_code_pag, working_df, request.user_query
            )
            exec_result["code_steps"]  = [pandas_code_pag]
            exec_result["token_usage"] = pag_token_usage
            exec_result["merge_info"]  = join_desc if join_desc != "single table — no join" else None
        else:
            # Fallback: original 2-call path (plan_query already done above)
            exec_result = formulator.get_text_analysis(
                request.user_query,
                working_df,
                dataset_metadata=combined_meta,
                skip_refinement=False,
            )

        result_type    = exec_result.get("result_type", "text")
        result_data    = exec_result.get("result_data")
        result_columns = exec_result.get("result_columns")

        print(f"✅ /query-engine done | result_type={result_type} | success={exec_result.get('success')}")

        # ── 7. Register tabular results as ephemeral dataset ──────────────────
        result_dataset_id   = None
        suggested_dimensions: List[str] = []
        suggested_measures:   List[str] = []
        chart_title = request.user_query.strip().rstrip("?.")
        if len(chart_title) > 60:
            chart_title = chart_title[:57] + "..."

        if result_type == "table" and result_data:
            result_df = pd.DataFrame(result_data, columns=result_columns)

            # Build source column description lookup from all selected tables
            source_col_lookup: Dict[str, str] = {}
            for did in needed_ids:
                for col_info in DATASET_METADATA.get(did, {}).get("columns", []):
                    cname = col_info.get("name", "")
                    cdesc = col_info.get("description", "")
                    if cname and cdesc:
                        source_col_lookup[cname] = cdesc

            # Classify each result column
            suggested_dimensions = [
                c for c in result_df.columns
                if _infer_col_type(c, result_df, source_col_lookup) == "dimension"
            ]
            suggested_measures = [
                c for c in result_df.columns
                if _infer_col_type(c, result_df, source_col_lookup) == "measure"
            ]

            # Register as ephemeral dataset (available for /charts calls)
            result_dataset_id = str(uuid.uuid4())
            DATASETS[result_dataset_id] = result_df
            DATASET_METADATA[result_dataset_id] = {
                "filename": f"query_result_{result_dataset_id[:8]}",
                "dataset_name": f"query_result_{result_dataset_id[:8]}",
                "dataset_summary": request.user_query,
                "columns": [
                    {
                        "name": c,
                        "type": _infer_col_type(c, result_df, source_col_lookup),
                        "description": source_col_lookup.get(c, ""),
                    }
                    for c in result_df.columns
                ],
                "is_ephemeral": True,
                "success": True,
            }
            print(f"📦 Registered ephemeral dataset {result_dataset_id[:8]} | "
                  f"dims={suggested_dimensions} | measures={suggested_measures}")

        return {
            "success":             exec_result.get("success", False),
            "result_type":         result_type,
            "data":                result_data,
            "columns":             result_columns,
            "answer":              exec_result.get("answer", ""),
            "tables_used":         needed_ids,
            "join_description":    join_desc,
            "token_usage":         exec_result.get("token_usage", {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}),
            "result_dataset_id":   result_dataset_id,
            "suggested_dimensions": suggested_dimensions,
            "suggested_measures":  suggested_measures,
            "chart_title":         chart_title,
            # Execution log fields — surfaced for frontend transparency, no extra LLM calls
            "planner_reasoning":   plan.get("reasoning", ""),
            "selected_table_names": [
                DATASET_METADATA.get(d, {}).get("dataset_name") or
                DATASET_METADATA.get(d, {}).get("filename") or d[:8]
                for d in needed_ids
            ],
            "code_steps":          exec_result.get("code_steps", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ /query-engine error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

