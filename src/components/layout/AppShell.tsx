'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Show login page without the app shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="login-page">
        <div style={{ textAlign: 'center', color: 'var(--gray-400)' }}>
          <div className="sidebar-logo-icon" style={{ width: 48, height: 48, margin: '0 auto 16px', fontSize: '1.2rem' }}>
            ⚡
          </div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Header />
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}
