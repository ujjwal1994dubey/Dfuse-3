import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GlobalFilterProvider } from '../contexts/GlobalFilterContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const LOCAL_KEY = 'dfuse_canvases';

function findLocalCanvas(userId, canvasId) {
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY}_${userId}`);
    const all = raw ? JSON.parse(raw) : [];
    return all.find(c => c.id === canvasId) || null;
  } catch { return null; }
}

// Lazy import AppWrapper to keep the bundle split clean
const AppWrapper = React.lazy(() =>
  import('../App').then(mod => ({ default: mod.AppWrapper }))
);

export default function CanvasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [canvasMeta, setCanvasMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`${API}/canvases/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.data) {
          setCanvasMeta(data.data);
        } else {
          // Try local fallback (canvas created while Supabase tables were not set up)
          const local = findLocalCanvas(user?.id, id);
          if (local) setCanvasMeta(local);
        }
        setLoading(false);
      })
      .catch(() => {
        const local = findLocalCanvas(user?.id, id);
        if (local) setCanvasMeta(local);
        setLoading(false);
      });
  }, [id, user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <GlobalFilterProvider>
      <React.Suspense fallback={
        <div className="w-screen h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
      }>
        <AppWrapper
          user={user}
          onLogout={handleLogout}
          canvasId={id}
          canvasMeta={canvasMeta}
        />
      </React.Suspense>
    </GlobalFilterProvider>
  );
}
