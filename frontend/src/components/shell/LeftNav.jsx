import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Database, BookOpen, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/canvases', label: 'Canvases',     icon: LayoutGrid },
  { to: '/library',  label: 'Data Library', icon: Database },
  { to: '/learn',    label: 'Learn Dfuse',  icon: BookOpen },
  { to: '/settings', label: 'Settings',     icon: Settings },
];

export default function LeftNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: '200px',
        minHeight: '100vh',
        backgroundColor: '#111827',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <img src="/logo.svg" alt="D.fuse" style={{ width: '28px', height: '28px' }} />
          <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em' }}>
            D.fuse
          </span>
        </div>
        <p style={{ color: '#6B7280', fontSize: '11px', paddingLeft: '36px', lineHeight: 1.3 }}>
          Data Analytics Canvas
        </p>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10',
              ].join(' ')
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User profile at bottom */}
      <div className="p-3 border-t border-white/10">
        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors hover:bg-white/10"
            >
              <img
                src={user.picture}
                alt={user.name || 'User'}
                className="w-8 h-8 rounded-full flex-shrink-0"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'U')}&background=374151&color=9CA3AF&size=32`;
                }}
              />
              <div className="flex-1 min-w-0 text-left">
                <p style={{ color: '#F9FAFB', fontSize: '13px', fontWeight: 500 }} className="truncate">
                  {user.name || 'User'}
                </p>
                <p style={{ color: '#6B7280', fontSize: '11px' }} className="truncate">
                  {user.email}
                </p>
              </div>
              <LogOut size={14} style={{ color: '#6B7280', flexShrink: 0 }} />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="font-medium text-gray-900 text-sm truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
