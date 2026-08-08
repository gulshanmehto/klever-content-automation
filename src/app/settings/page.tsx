'use client';

import { Shield, Key, Database, Zap } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Global system configuration status</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
        {/* Active Integrations */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Zap size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              Active System Providers
            </h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-sm font-semibold">LLM Content Generator</span>
                <span className="status-chip green"><span className="dot" />Google Gemini (Live)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-sm font-semibold">Image Generation Engine</span>
                <span className="status-chip green"><span className="dot" />Google Imagen 3 (Live)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-sm font-semibold">File Storage Provider</span>
                <span className="status-chip green"><span className="dot" />Google Drive API (Live)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-sm font-semibold">Content Publisher</span>
                <span className="status-chip green"><span className="dot" />WordPress REST API (Live)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Shield size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              Security & Encryption
            </h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="text-sm font-semibold">WordPress Credential Cryptography</p>
                  <p className="text-xs text-muted">Passwords are encrypted at rest using AES-256-GCM prior to database storage</p>
                </div>
                <span className="status-chip green"><span className="dot" />Enforced</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="text-sm font-semibold">API Credentials Isolation</p>
                  <p className="text-xs text-muted">All Google API credentials and JWT secrets reside strictly server-side inside .env</p>
                </div>
                <span className="status-chip green"><span className="dot" />Isolated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Database */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Database size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              Database Engine
            </h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-sm text-muted">SQL Engine</span>
                <span className="text-sm font-medium">SQLite (Hostinger Compatible)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-sm text-muted">Database ORM</span>
                <span className="text-sm font-medium">Prisma 5 Client</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-sm text-muted">Task Permanence</span>
                <span className="status-chip green" style={{ fontSize: '0.65rem' }}><span className="dot" />Immutability Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Key size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              Active Config Environment
            </h3>
          </div>
          <div className="card-body">
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
              The system relies on system environment variables inside your root .env file.
            </p>
            <div style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--gray-600)' }}>
              <div>DATABASE_URL="file:./dev.db"</div>
              <div>GOOGLE_AI_API_KEY=••••••••</div>
              <div>GOOGLE_CLIENT_ID=••••••••</div>
              <div>GOOGLE_CLIENT_SECRET=••••••••</div>
              <div>GOOGLE_REFRESH_TOKEN=••••••••</div>
              <div>CREDENTIAL_ENCRYPTION_KEY=••••••••</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
