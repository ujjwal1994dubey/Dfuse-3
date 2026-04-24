import React from 'react';
import { Outlet } from 'react-router-dom';
import LeftNav from './components/shell/LeftNav';

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
      <LeftNav />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
