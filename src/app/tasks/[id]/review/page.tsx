'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  RefreshCw,
  Loader,
  AlertTriangle,
} from 'lucide-react';
import { STAGE_LABELS } from '@/lib/utils';

interface Section {
  id: string;
  position: number;
  heading: string;
  body: string;
  imagePrompt: string | null;
  altText: string | null;
}

interface Task {
  id: number;
  topic: string;
  currentStage: string;
  articleTitle: string | null;
  articleSlug: string | null;
  articleIntroduction: string | null;
  articleConclusion: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  articleSections: Section[];
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState('');

  // Editable fields state
  const [articleTitle, setArticleTitle] = useState('');
  const [articleSlug, setArticleSlug] = useState('');
  const [articleIntroduction, setArticleIntroduction] = useState('');
  const [articleConclusion, setArticleConclusion] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [sections, setSections] = useState<Section[]>([]);

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      const t = data.task;
      if (t) {
        setTask(t);
        setArticleTitle(t.articleTitle || t.topic || '');
        setArticleSlug(t.articleSlug || '');
        setArticleIntroduction(t.articleIntroduction || '');
        setArticleConclusion(t.articleConclusion || '');
        setMetaTitle(t.metaTitle || '');
        setMetaDescription(t.metaDescription || '');
        setSections(t.articleSections || []);
      }
    } catch (err) {
      console.error('Failed to fetch task:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      // 1. Save main task fields
      const taskRes = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleTitle,
          articleSlug,
          articleIntroduction,
          articleConclusion,
          metaTitle,
          metaDescription,
        }),
      });

      if (!taskRes.ok) throw new Error('Failed to save main metadata');

      // 2. Save individual sections
      for (const section of sections) {
        const secRes = await fetch(`/api/tasks/${taskId}/sections/${section.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heading: section.heading,
            body: section.body,
          }),
        });

        if (!secRes.ok) throw new Error(`Failed to save section ${section.position}`);
      }

      setMessage('Changes saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Error saving changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    // Save first
    await handleSave();

    setApproving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, { method: 'POST' });
      if (res.ok) {
        router.push(`/tasks/${taskId}`);
      } else {
        setMessage('Failed to approve content.');
      }
    } catch {
      setMessage('An error occurred during approval.');
    } finally {
      setApproving(false);
    }
  };

  const updateSectionField = (index: number, field: keyof Section, value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Loader size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-muted mt-4">Loading article editor...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="empty-state">
        <h3 className="empty-state-title">Task not found</h3>
        <Link href="/tasks" className="btn btn-primary mt-4">Back to Tasks</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href={`/tasks/${task.id}`} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} /> Back to Details
        </Link>
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Review & Edit Article</h1>
            <p className="page-subtitle">Make changes to the content before sending it to WordPress</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => handleSave()} disabled={saving || approving}>
              <Save size={16} /> Save Changes
            </button>
            <button className="btn btn-success" onClick={handleApprove} disabled={saving || approving}>
              <CheckCircle2 size={16} /> Approve & Generate Images
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="status-chip blue" style={{ padding: '8px 16px', display: 'block', fontSize: '0.9rem', marginBottom: 16 }}>
          {message}
        </div>
      )}

      {task.currentStage !== 'READY_FOR_REVIEW' && (
        <div className="status-chip amber" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', marginBottom: 20 }}>
          <AlertTriangle size={16} />
          <span>This task is currently in <strong>{STAGE_LABELS[task.currentStage] || task.currentStage}</strong> stage. You can edit content, but auto-processing is not waiting for your approval.</span>
        </div>
      )}

      {/* Editor Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Title & Slug */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Article Title & Metadata</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Article Title</label>
              <input type="text" className="form-input" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} required />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">URL Slug</label>
                <input type="text" className="form-input" value={articleSlug} onChange={(e) => setArticleSlug(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">SEO Title</label>
                <input type="text" className="form-input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">SEO Meta Description</label>
              <textarea className="form-input" style={{ minHeight: 60 }} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Introduction */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Introduction Paragraph</h3></div>
          <div className="card-body">
            <textarea className="form-input" style={{ minHeight: 120, lineHeight: 1.6 }} value={articleIntroduction} onChange={(e) => setArticleIntroduction(e.target.value)} />
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--gray-800)', marginTop: 8 }}>Article Sections (Ideas)</h2>
          {sections.map((section, idx) => (
            <div key={section.id} className="section-card" style={{ background: 'var(--surface)' }}>
              <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <span className="section-number">{section.position}</span>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontWeight: 600, border: 'none', background: 'transparent', padding: '4px 8px', boxShadow: 'none' }}
                    value={section.heading}
                    onChange={(e) => updateSectionField(idx, 'heading', e.target.value)}
                  />
                </div>
              </div>
              <div className="section-body" style={{ padding: 16 }}>
                <textarea
                  className="form-input"
                  style={{ minHeight: 100, lineHeight: 1.6 }}
                  value={section.body}
                  onChange={(e) => updateSectionField(idx, 'body', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Conclusion */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Conclusion Paragraph</h3></div>
          <div className="card-body">
            <textarea className="form-input" style={{ minHeight: 120, lineHeight: 1.6 }} value={articleConclusion} onChange={(e) => setArticleConclusion(e.target.value)} />
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 40 }}>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => handleSave()} disabled={saving || approving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-success btn-lg" onClick={handleApprove} disabled={saving || approving}>
            {approving ? 'Processing...' : 'Approve & Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
