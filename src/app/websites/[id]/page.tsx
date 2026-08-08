'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Loader,
  CheckCircle2,
  XCircle,
  Save,
  Trash2,
  ExternalLink,
  Wifi,
  WifiOff,
  HardDrive,
  FileText,
  Image as ImageIcon,
  Settings,
  AlertCircle,
} from 'lucide-react';

interface WebsiteDetail {
  id: string;
  name: string;
  domain: string;
  wpBaseUrl: string;
  hasWpCredentials: boolean;
  driveParentFolderId: string | null;
  targetCountry: string;
  targetAudience: string;
  defaultTone: string;
  defaultCategory: string | null;
  defaultImageStyle: string;
  defaultImageRatio: string;
  watermarkText: string;
  watermarkPlacement: string;
  createdAt: string;
  _count: { tasks: number };
}

export default function WebsiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const websiteId = params.id as string;

  const [website, setWebsite] = useState<WebsiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'wordpress' | 'content' | 'drive' | 'danger'>('wordpress');

  // WordPress fields
  const [wpBaseUrl, setWpBaseUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [wpSaving, setWpSaving] = useState(false);
  const [wpSaved, setWpSaved] = useState(false);
  const [wpError, setWpError] = useState('');

  // WP Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Content defaults fields
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [watermarkText, setWatermarkText] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [defaultTone, setDefaultTone] = useState('');
  const [defaultImageStyle, setDefaultImageStyle] = useState('');
  const [defaultImageRatio, setDefaultImageRatio] = useState('');
  const [contentSaving, setContentSaving] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [contentError, setContentError] = useState('');

  // Drive fields
  const [driveParentFolderId, setDriveParentFolderId] = useState('');
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);

  const fetchWebsite = useCallback(async () => {
    try {
      const res = await fetch(`/api/websites/${websiteId}`);
      const data = await res.json();
      const w = data.website;
      if (w) {
        setWebsite(w);
        setWpBaseUrl(w.wpBaseUrl || '');
        setName(w.name || '');
        setDomain(w.domain || '');
        setWatermarkText(w.watermarkText || '');
        setTargetCountry(w.targetCountry || 'US');
        setTargetAudience(w.targetAudience || 'general');
        setDefaultTone(w.defaultTone || 'informative');
        setDefaultImageStyle(w.defaultImageStyle || 'photorealistic');
        setDefaultImageRatio(w.defaultImageRatio || '16:9');
        setDriveParentFolderId(w.driveParentFolderId || '');
      }
    } catch (err) {
      console.error('Failed to fetch website:', err);
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => { fetchWebsite(); }, [fetchWebsite]);

  const saveWordPress = async (e: React.FormEvent) => {
    e.preventDefault();
    setWpError('');
    setWpSaving(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = { wpBaseUrl };
      if (wpUsername) body.wpUsername = wpUsername;
      if (wpAppPassword) body.wpAppPassword = wpAppPassword;

      const res = await fetch(`/api/websites/${websiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setWpError(d.error || 'Failed to save');
      } else {
        setWpSaved(true);
        setWpUsername('');
        setWpAppPassword('');
        setTimeout(() => setWpSaved(false), 3000);
        await fetchWebsite();
      }
    } catch {
      setWpError('An error occurred');
    } finally {
      setWpSaving(false);
    }
  };

  const testWordPress = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/test-wp`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `✅ Connected as ${data.user?.name || 'unknown'} (${data.user?.roles?.join(', ')})` });
      } else {
        setTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ success: false, message: 'Network error — could not reach WordPress' });
    } finally {
      setTesting(false);
    }
  };

  const saveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setContentError('');
    setContentSaving(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain, watermarkText, targetCountry, targetAudience, defaultTone, defaultImageStyle, defaultImageRatio }),
      });
      if (!res.ok) {
        const d = await res.json();
        setContentError(d.error || 'Failed to save');
      } else {
        setContentSaved(true);
        setTimeout(() => setContentSaved(false), 3000);
        await fetchWebsite();
      }
    } catch {
      setContentError('An error occurred');
    } finally {
      setContentSaving(false);
    }
  };

  const saveDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriveSaving(true);
    try {
      await fetch(`/api/websites/${websiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveParentFolderId: driveParentFolderId || null }),
      });
      setDriveSaved(true);
      setTimeout(() => setDriveSaved(false), 3000);
    } catch {
      console.error('Drive save failed');
    } finally {
      setDriveSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Loader size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-muted mt-4">Loading website settings...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="empty-state">
        <h3 className="empty-state-title">Website not found</h3>
        <Link href="/websites" className="btn btn-primary mt-4">Back to Websites</Link>
      </div>
    );
  }

  const tabs = [
    { key: 'wordpress', label: 'WordPress', icon: <Globe size={15} /> },
    { key: 'content', label: 'Content Defaults', icon: <FileText size={15} /> },
    { key: 'drive', label: 'Google Drive', icon: <HardDrive size={15} /> },
    { key: 'danger', label: 'Danger Zone', icon: <AlertCircle size={15} /> },
  ] as const;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/websites" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} /> Back to Websites
        </Link>
        <div className="page-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="stat-card-icon blue">
              <Globe size={22} />
            </div>
            <div>
              <h1 className="page-title" style={{ marginBottom: 2 }}>{website.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-sm text-muted">{website.domain}</span>
                {website.wpBaseUrl && (
                  <a href={website.wpBaseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <ExternalLink size={11} /> Visit Site
                  </a>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`status-chip ${website.hasWpCredentials ? 'green' : 'gray'}`}>
              <span className="dot" />
              {website.hasWpCredentials ? 'WP Connected' : 'WP Not Connected'}
            </span>
            <span className="text-xs text-muted">{website._count.tasks} tasks</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab-btn${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── WordPress Tab ───────────────────────────────────────── */}
      {activeTab === 'wordpress' && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Connection status banner */}
          <div className="card" style={{
            border: `1.5px solid ${website.hasWpCredentials ? 'var(--color-success)' : 'var(--color-border)'}`,
            background: website.hasWpCredentials ? 'rgba(16,185,129,.05)' : undefined,
          }}>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {website.hasWpCredentials
                ? <CheckCircle2 size={22} color="var(--color-success)" />
                : <WifiOff size={22} color="var(--color-muted)" />}
              <div style={{ flex: 1 }}>
                <div className="font-semibold" style={{ marginBottom: 2 }}>
                  {website.hasWpCredentials ? 'WordPress credentials saved' : 'WordPress not connected'}
                </div>
                <div className="text-sm text-muted">
                  {website.hasWpCredentials
                    ? `Pointing to: ${website.wpBaseUrl}`
                    : 'Enter your WordPress URL and application password below to enable auto-publishing.'}
                </div>
              </div>
              {website.hasWpCredentials && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={testWordPress}
                  disabled={testing}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {testing ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={14} />}
                  {testing ? ' Testing...' : ' Test Connection'}
                </button>
              )}
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`card`} style={{
              border: `1.5px solid ${testResult.success ? 'var(--color-success)' : 'var(--color-error)'}`,
              background: testResult.success ? 'rgba(16,185,129,.06)' : 'rgba(239,68,68,.06)',
            }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {testResult.success ? <CheckCircle2 size={18} color="var(--color-success)" /> : <XCircle size={18} color="var(--color-error)" />}
                <span className="text-sm">{testResult.message}</span>
              </div>
            </div>
          )}

          {/* Credentials form */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">WordPress Connection Settings</h3>
              <p className="card-subtitle">Connect to your WordPress site using the REST API</p>
            </div>
            <div className="card-body">
              <form onSubmit={saveWordPress}>
                {wpError && <div className="login-error" style={{ marginBottom: 16 }}>{wpError}</div>}

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">WordPress Site URL</label>
                  <input
                    className="form-input"
                    value={wpBaseUrl}
                    onChange={e => setWpBaseUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    required
                  />
                  <p className="form-helper">The root URL of your WordPress installation (no trailing slash)</p>
                </div>

                <div className="form-row" style={{ marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label">WordPress Username</label>
                    <input
                      className="form-input"
                      value={wpUsername}
                      onChange={e => setWpUsername(e.target.value)}
                      placeholder={website.hasWpCredentials ? '••••• (saved)' : 'admin'}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Application Password</label>
                    <input
                      className="form-input"
                      type="password"
                      value={wpAppPassword}
                      onChange={e => setWpAppPassword(e.target.value)}
                      placeholder={website.hasWpCredentials ? '••••• (saved)' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* How to generate app password guide */}
                <div className="card" style={{ background: 'var(--color-bg-secondary)', border: 'none', marginBottom: 20 }}>
                  <div className="card-body" style={{ padding: '12px 16px' }}>
                    <p className="text-sm font-semibold" style={{ marginBottom: 6 }}>📖 How to generate an Application Password</p>
                    <ol className="text-sm text-muted" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
                      <li>Log in to your WordPress admin dashboard</li>
                      <li>Go to <strong>Users → Profile</strong> (or <strong>Users → All Users → Edit</strong>)</li>
                      <li>Scroll down to <strong>Application Passwords</strong></li>
                      <li>Enter a name (e.g. <em>Klever Automation</em>) and click <strong>Add New Application Password</strong></li>
                      <li>Copy the generated password and paste it above</li>
                    </ol>
                    <a
                      href={`${website.wpBaseUrl}/wp-admin/profile.php#application-passwords-section`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8 }}
                    >
                      <ExternalLink size={13} /> Open WordPress Profile Page
                    </a>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={wpSaving}>
                    {wpSaving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
                    {wpSaving ? ' Saving...' : wpSaved ? ' ✓ Saved!' : ' Save WordPress Settings'}
                  </button>
                  {website.hasWpCredentials && !testing && (
                    <button type="button" className="btn btn-secondary" onClick={testWordPress}>
                      <Wifi size={15} /> Test Connection
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Content Defaults Tab ─────────────────────────────────── */}
      {activeTab === 'content' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Content & Image Defaults</h3>
            <p className="card-subtitle">These settings will be used for all new articles created under this website</p>
          </div>
          <div className="card-body">
            <form onSubmit={saveContent}>
              {contentError && <div className="login-error" style={{ marginBottom: 16 }}>{contentError}</div>}

              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Website Name</label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Domain</label>
                  <input className="form-input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yoursite.com" required />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Watermark Text</label>
                <input className="form-input" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder={domain || 'yoursite.com'} />
                <p className="form-helper">Text stamped on generated images</p>
              </div>

              <div className="form-row-3" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Target Country</label>
                  <input className="form-input" value={targetCountry} onChange={e => setTargetCountry(e.target.value)} placeholder="US" />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Audience</label>
                  <input className="form-input" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="general" />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Tone</label>
                  <select className="form-select" value={defaultTone} onChange={e => setDefaultTone(e.target.value)}>
                    <option value="informative">Informative</option>
                    <option value="casual">Casual</option>
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="authoritative">Authoritative</option>
                    <option value="conversational">Conversational</option>
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 20 }}>
                <div className="form-group">
                  <label className="form-label"><ImageIcon size={13} style={{ display: 'inline', marginRight: 5 }} />Image Style</label>
                  <select className="form-select" value={defaultImageStyle} onChange={e => setDefaultImageStyle(e.target.value)}>
                    <option value="photorealistic">Photorealistic</option>
                    <option value="illustration">Illustration</option>
                    <option value="flat design">Flat Design</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="minimalist">Minimalist</option>
                    <option value="watercolor">Watercolor</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Image Ratio</label>
                  <select className="form-select" value={defaultImageRatio} onChange={e => setDefaultImageRatio(e.target.value)}>
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="4:3">4:3</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="9:16">9:16 (Portrait)</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={contentSaving}>
                {contentSaving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
                {contentSaving ? ' Saving...' : contentSaved ? ' ✓ Saved!' : ' Save Content Settings'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Google Drive Tab ─────────────────────────────────────── */}
      {activeTab === 'drive' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ border: '1.5px solid var(--color-border)', background: 'rgba(59,130,246,.04)' }}>
            <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <HardDrive size={22} color="var(--color-primary)" />
              <div>
                <div className="font-semibold" style={{ marginBottom: 4 }}>Google Drive Backup</div>
                <div className="text-sm text-muted" style={{ lineHeight: 1.7 }}>
                  When a task completes, all generated content (article JSON, images, sources) will be automatically uploaded
                  to a folder in your Google Drive. Configure a parent folder ID below to organize articles by website.
                  <br /><br />
                  <strong>Note:</strong> Google Drive credentials (OAuth) must be configured in the global Settings page first.
                </div>
                <Link href="/settings" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>
                  <Settings size={13} /> Configure Google Drive OAuth
                </Link>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Drive Folder Settings</h3>
            </div>
            <div className="card-body">
              <form onSubmit={saveDrive}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Parent Folder ID (optional)</label>
                  <input
                    className="form-input"
                    value={driveParentFolderId}
                    onChange={e => setDriveParentFolderId(e.target.value)}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
                  />
                  <p className="form-helper">
                    Get this from the Google Drive folder URL: drive.google.com/drive/folders/<strong>[FOLDER_ID]</strong>.
                    Leave blank to save in the root of your Drive.
                  </p>
                </div>

                <button type="submit" className="btn btn-primary" disabled={driveSaving}>
                  {driveSaving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
                  {driveSaving ? ' Saving...' : driveSaved ? ' ✓ Saved!' : ' Save Drive Settings'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Danger Zone Tab ──────────────────────────────────────── */}
      {activeTab === 'danger' && (
        <div className="card" style={{ border: '1.5px solid var(--color-error)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--color-error)' }}>Danger Zone</h3>
            <p className="card-subtitle">Destructive actions — cannot be undone</p>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <div className="font-semibold" style={{ marginBottom: 4 }}>Delete this website</div>
                <div className="text-sm text-muted">Permanently remove this website and all its configuration. Tasks and articles will remain.</div>
              </div>
              <button
                className="btn btn-danger"
                style={{ background: 'var(--color-error)', color: '#fff', border: 'none', whiteSpace: 'nowrap', marginLeft: 20 }}
                onClick={async () => {
                  if (!confirm(`Delete "${website.name}"? This cannot be undone.`)) return;
                  await fetch(`/api/websites/${websiteId}`, { method: 'DELETE' });
                  router.push('/websites');
                }}
              >
                <Trash2 size={15} /> Delete Website
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
