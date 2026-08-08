'use client';

import { useSession } from 'next-auth/react';
import { Bell, Search } from 'lucide-react';

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="app-header">
      <div className="header-search">
        <Search size={18} className="header-search-icon" />
        <input
          type="text"
          placeholder="Search tasks, articles..."
          className="header-search-input"
        />
      </div>
      <div className="header-actions">
        <button className="header-notification-btn">
          <Bell size={18} />
        </button>
        <div className="header-user">
          <div className="header-avatar">
            {session?.user?.name?.charAt(0) || 'A'}
          </div>
          <span className="header-username">
            {session?.user?.name || 'Admin'}
          </span>
        </div>
      </div>
    </header>
  );
}
