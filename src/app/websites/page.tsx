'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, Settings, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Website {
  id: string;
  name: string;
  domain: string;
  wpBaseUrl: string;
  targetCountry: string;
  targetAudience: string;
  defaultTone: string;
  watermarkText: string;
  createdAt: string;
  _count: { tasks: number };
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [wpBaseUrl, setWpBaseUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [watermarkText, setWatermarkText] = useState('');
  const [targetCountry, setTargetCountry] = useState('US');
  const [targetAudience, setTargetAudience] = useState('general');
  const [defaultTone, setDefaultTone] = useState('informative');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchWebsites = async () => {
    try {
      const res = await fetch('/api/websites');
      const data = await res.json();
      setWebsites(data.websites || []);
    } catch (err) {
      console.error('Failed to fetch websites:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          wpBaseUrl: wpBaseUrl || `https://${domain}`,
          wpUsername,
          wpAppPassword,
          watermarkText: watermarkText || domain,
          targetCountry,
          targetAudience,
          defaultTone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create website');
        setSaving(false);
        return;
      }

      setShowForm(false);
      setName('');
      setDomain('');
      setWpBaseUrl('');
      setWpUsername('');
      setWpAppPassword('');
      setWatermarkText('');
      fetchWebsites();
    } catch {
      setError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Websites</h1>
            <p className="page-subtitle">Manage your website configurations</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} />
            Add Website
          </button>
        </div>
      </div>

      {/* Add Website Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3 className="card-title">Add New Website</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleCreate}>
              {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Website Name</label>
                  <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Fashion Blog" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Domain</label>
                  <input className="form-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="fashionwebsite.com" required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">WordPress Base URL</label>
                <input className="form-input" value={wpBaseUrl} onChange={(e) => setWpBaseUrl(e.target.value)} placeholder="https://fashionwebsite.com" />
                <p className="form-helper">Will default to https://{domain || 'domain.com'}</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">WordPress Username</label>
                  <input className="form-input" value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} placeholder="admin" />
                </div>
                <div className="form-group">
                  <label className="form-label">WordPress Application Password</label>
                  <input className="form-input" type="password" value={wpAppPassword} onChange={(e) => setWpAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
                  <p className="form-helper">Generate in WP Admin → Users → Application Passwords</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Watermark Text</label>
                <input className="form-input" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder={domain || 'fashionwebsite.com'} />
                <p className="form-helper">Text shown in generated image watermarks</p>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Target Country</label>
                  <input className="form-input" value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Audience</label>
                  <input className="form-input" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Tone</label>
                  <select className="form-select" value={defaultTone} onChange={(e) => setDefaultTone(e.target.value)}>
                    <option value="informative">Informative</option>
                    <option value="casual">Casual</option>
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Website'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Website List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {websites.map((website) => (
          <div key={website.id} className="card">
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="stat-card-icon blue">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="font-semibold">{website.name}</h3>
                  <p className="text-sm text-muted">{website.domain}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-xs text-muted">Tasks</span>
                  <span className="text-xs font-medium">{website._count.tasks}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-xs text-muted">Watermark</span>
                  <span className="text-xs font-medium">{website.watermarkText || website.domain}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-xs text-muted">Country</span>
                  <span className="text-xs font-medium">{website.targetCountry}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-xs text-muted">Created</span>
                  <span className="text-xs font-medium">{formatDate(website.createdAt)}</span>
                </div>
              </div>

              <Link href={`/websites/${website.id}`} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                <Settings size={14} /> Manage Settings
              </Link>
            </div>
          </div>
        ))}

        {!loading && websites.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Globe size={28} /></div>
              <h3 className="empty-state-title">No websites configured</h3>
              <p className="empty-state-text">Add your first website to start creating articles.</p>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Add Website
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
