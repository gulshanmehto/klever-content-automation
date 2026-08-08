'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  ExternalLink,
  RefreshCw,
  Eye,
  FileText,
  Lightbulb,
  Image as ImageIcon,
  ShieldCheck,
  HardDrive,
  Newspaper,
  Activity,
  ChevronRight,
} from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  formatTime,
  STAGE_LABELS,
  STAGE_COLORS,
  PIPELINE_STAGES,
  getWpStatus,
} from '@/lib/utils';

interface TaskDetail {
  id: number;
  topic: string;
  currentStage: string;
  status: string;
  progressPercentage: number;
  requestedIdeaCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  contentApproved: boolean;
  contentQcScore: number | null;
  wpPostId: number | null;
  wpEditUrl: string | null;
  driveFolderId: string | null;
  userRating: number | null;
  userFeedback: string | null;
  totalDurationMs: number | null;
  driveFolderUrl: string | null;
  articleTitle: string | null;
  articleSlug: string | null;
  articleIntroduction: string | null;
  articleConclusion: string | null;
  articleFaq: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  website: {
    name: string;
    domain: string;
  };
  competitorSources: Array<{
    id: string;
    url: string;
    pageTitle: string | null;
    fetchStatus: string;
    createdAt: string;
  }>;
  normalizedIdeas: Array<{
    id: string;
    concept: string;
    attributesJson: string | null;
    sourceUrls: string | null;
    sourceCount: number;
    mergedFrom: string | null;
    generatedOriginal: boolean;
    selected: boolean;
    finalOrder: number | null;
  }>;
  articleSections: Array<{
    id: string;
    position: number;
    heading: string;
    body: string;
    imagePrompt: string | null;
    altText: string | null;
    imageGenerations: Array<{
      id: string;
      qcScore: number | null;
      qcStatus: string;
      generationAttempt: number;
      localPath: string | null;
      wpMediaUrl: string | null;
    }>;
  }>;
  taskLogs: Array<{
    id: string;
    eventType: string;
    message: string;
    createdAt: string;
  }>;
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'sources', label: 'Sources', icon: Globe },
  { key: 'ideas', label: 'Ideas', icon: Lightbulb },
  { key: 'article', label: 'Article', icon: FileText },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'quality', label: 'Quality Check', icon: ShieldCheck },
  { key: 'drive', label: 'Drive', icon: HardDrive },
  { key: 'wordpress', label: 'WordPress', icon: Newspaper },
  { key: 'logs', label: 'Logs', icon: Activity },
];

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [approving, setApproving] = useState(false);
  const [clientGenerationStatus, setClientGenerationStatus] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      setTask(data.task || null);
    } catch (err) {
      console.error('Failed to fetch task:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Poll for updates + kick the serverless job worker while task is active
  useEffect(() => {
    if (!task) return;
    const inProgressStages = [
      'CREATED', 'FETCHING_COMPETITORS', 'ANALYZING_COMPETITORS', 'EXTRACTING_IDEAS',
      'DEDUPLICATING', 'BUILDING_OUTLINE', 'WRITING_ARTICLE',
      // GENERATING_IMAGES is omitted because it is handled by the client orchestration loop below
      'IMAGE_QC', 'SAVING_TO_DRIVE', 'UPLOADING_TO_WORDPRESS',
    ];
    if (inProgressStages.includes(task.currentStage)) {
      const interval = setInterval(async () => {
        // Kick the serverless job worker so it processes the next pipeline step
        fetch('/api/jobs/process').catch(() => {});
        // Then refresh our task data
        await fetchTask();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [task?.currentStage, fetchTask, task]);

  // ─── Client-Side Image Generation Orchestration ───
  useEffect(() => {
    if (!task || task.currentStage !== 'GENERATING_IMAGES') {
      setClientGenerationStatus(null);
      return;
    }

    let isCancelled = false;

    const processImagesClientSide = async () => {
      try {
        setClientGenerationStatus('Initializing generation...');
        // 1. Fetch pending sections and credentials
        const qRes = await fetch(`/api/tasks/${taskId}/images/queue`);
        const queueData = await qRes.json();

        if (!qRes.ok || queueData.error) {
           setClientGenerationStatus(`Error: ${queueData.error || 'Failed to fetch queue'}`);
           return;
        }

        const { credentials, sections } = queueData;
        if (sections.length === 0) {
           // All done! Advance task.
           setClientGenerationStatus('All images generated. Advancing...');
           await fetch(`/api/tasks/${taskId}/action`, { 
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ action: 'FINISH_IMAGES' })
           });
           fetchTask();
           return;
        }

        // 2. Loop through sections and process via Edge proxy
        let doneCount = queueData.done || 0;
        const totalCount = queueData.total || 1;

        for (let i = 0; i < sections.length; i++) {
          if (isCancelled) return;
          const section = sections[i];
          setClientGenerationStatus(`Generating image ${doneCount + 1} of ${totalCount}: ${section.heading}...`);

          try {
            const edgeRes = await fetch('/api/proxy/cloudflare', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: section.prompt,
                accountId: credentials.accountId,
                apiToken: credentials.apiToken,
              }),
            });
            const edgeData = await edgeRes.json();

            // Save result (success or error)
            await fetch(`/api/tasks/${taskId}/images/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sectionId: section.id,
                prompt: section.prompt,
                provider: edgeData.provider,
                model: edgeData.model,
                mimeType: edgeData.mimeType,
                imageBase64: edgeData.imageBase64,
                error: edgeData.error || (!edgeRes.ok ? 'Edge Proxy Failed' : null),
              })
            });
          } catch (err: any) {
             // Save fatal error
             await fetch(`/api/tasks/${taskId}/images/save`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ sectionId: section.id, prompt: section.prompt, error: err.message })
             });
          }
          doneCount++;
          // Fetch task immediately to update progress bar visually
          fetchTask();
        }

        // Loop finished, all done!
        if (isCancelled) return;
        setClientGenerationStatus('Generation complete. Advancing...');
        await fetch(`/api/tasks/${taskId}/approve`, { method: 'POST' });
        fetchTask();

      } catch (err: any) {
         setClientGenerationStatus(`Fatal orchestration error: ${err.message}`);
      }
    };

    // Give it a tiny delay so the UI can render the loading state first
    setTimeout(processImagesClientSide, 500);

    return () => { isCancelled = true; };
  }, [task?.currentStage, taskId, fetchTask]);


  const handleApprove = async () => {
    setApproving(true);
    try {
      await fetch(`/api/tasks/${taskId}/approve`, { method: 'POST' });
      await fetchTask();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Loader size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-muted mt-4">Loading task...</p>
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
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/tasks" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} /> Back to Tasks
        </Link>
        <div className="page-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <span className="table-task-id" style={{ fontSize: '1rem' }}>
                Task #{task.id}
              </span>
              <span className={`status-chip ${STAGE_COLORS[task.currentStage] || 'gray'}`}>
                <span className="dot" />
                {STAGE_LABELS[task.currentStage] || task.currentStage}
              </span>
            </div>
            <h1 className="page-title">{task.articleTitle || task.topic}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(task.currentStage === 'FAILED' || task.status === 'FAILED') && (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setLoading(true);
                  await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' });
                  await fetchTask();
                  setLoading(false);
                }}
              >
                <RefreshCw size={16} style={{ marginRight: 6 }} /> RETRY TASK
              </button>
            )}
            {(task.status === 'CANCELLED' || task.currentStage === 'CANCELLED') && (
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', border: 'none' }}
                onClick={async () => {
                  setLoading(true);
                  await fetch(`/api/tasks/${taskId}/resume`, { method: 'POST' });
                  await fetchTask();
                  setLoading(false);
                }}
              >
                <RefreshCw size={16} style={{ marginRight: 6 }} /> CONTINUE FROM WHERE LEFT OFF
              </button>
            )}
            {['CREATED', 'FETCHING_COMPETITORS', 'ANALYZING_COMPETITORS', 'EXTRACTING_IDEAS', 'DEDUPLICATING', 'BUILDING_OUTLINE', 'WRITING_ARTICLE', 'GENERATING_IMAGES', 'IMAGE_QC', 'SAVING_TO_DRIVE', 'UPLOADING_TO_WORDPRESS'].includes(task.currentStage) && (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  setLoading(true);
                  await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
                  await fetchTask();
                }}
              >
                CANCEL TASK
              </button>
            )}
            {task.currentStage === 'READY_FOR_REVIEW' && (
              <button
                className="btn btn-success btn-lg"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? (
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                APPROVE CONTENT & GENERATE IMAGES
              </button>
            )}
            {task.wpEditUrl && (
              <a href={task.wpEditUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <Newspaper size={16} /> Open in WordPress
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Meta Info Row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="text-sm">
          <span className="text-muted">Website: </span>
          <span className="font-medium">{task.website.domain}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">Ideas: </span>
          <span className="font-medium">{task.requestedIdeaCount}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">Competitors: </span>
          <span className="font-medium">{task.competitorSources.length}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">Created: </span>
          <span className="font-medium">{formatDateTime(task.createdAt)}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">Progress: </span>
          <span className="font-medium">{task.progressPercentage}%</span>
        </div>
        <div className="text-sm">
          <span className="text-muted">Time Taken: </span>
          <span className="font-medium" style={{ color: 'var(--status-green)', fontWeight: 600 }}>
            {task.totalDurationMs ? (
              `${Math.floor(task.totalDurationMs / 60000)}m ${Math.floor((task.totalDurationMs % 60000) / 1000)}s`
            ) : task.completedAt ? (
              `${Math.floor((new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 60000)}m ${Math.floor(((new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) % 60000) / 1000)}s`
            ) : (
              `${Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 60000)}m ${Math.floor(((Date.now() - new Date(task.createdAt).getTime()) % 60000) / 1000)}s (Running)`
            )}
          </span>
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="progress-timeline">
            {PIPELINE_STAGES.slice(0, -1).map((stage, index) => {
              const currentIndex = PIPELINE_STAGES.indexOf(task.currentStage as typeof PIPELINE_STAGES[number]);
              const stageIndex = index;
              let status = 'pending';
              if (task.currentStage === 'FAILED' || task.currentStage === 'CANCELLED') {
                status = stageIndex < currentIndex ? 'completed' : stageIndex === currentIndex ? 'failed' : 'pending';
              } else if (stageIndex < currentIndex) {
                status = 'completed';
              } else if (stageIndex === currentIndex) {
                status = 'active';
              }

              const shortLabels: Record<string, string> = {
                CREATED: 'Created',
                FETCHING_COMPETITORS: 'Fetch',
                ANALYZING_COMPETITORS: 'Analyze',
                EXTRACTING_IDEAS: 'Ideas',
                DEDUPLICATING: 'Dedup',
                BUILDING_OUTLINE: 'Outline',
                WRITING_ARTICLE: 'Write',
                READY_FOR_REVIEW: 'Review',
                GENERATING_IMAGES: 'Images',
                IMAGE_QC: 'QC',
                SAVING_TO_DRIVE: 'Drive',
                UPLOADING_TO_WORDPRESS: 'Upload',
                WORDPRESS_DRAFT_CREATED: 'Draft',
              };

              return (
                <div key={stage} style={{ display: 'contents' }}>
                  <div className="timeline-step">
                    <div className={`timeline-icon ${status}`}>
                      {status === 'completed' ? (
                        <CheckCircle2 size={14} />
                      ) : status === 'failed' ? (
                        <XCircle size={14} />
                      ) : status === 'active' ? (
                        <Loader size={14} style={{ animation: 'spin 2s linear infinite' }} />
                      ) : (
                        <Clock size={12} />
                      )}
                    </div>
                    <span className={`timeline-label ${status}`}>
                      {shortLabels[stage] || stage}
                    </span>
                  </div>
                  {index < PIPELINE_STAGES.length - 2 && (
                    <div className={`timeline-connector ${status === 'completed' ? 'completed' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {clientGenerationStatus && task.currentStage === 'GENERATING_IMAGES' && (
        <div style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--primary)' }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{clientGenerationStatus}</span>
        </div>
      )}

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && <OverviewTab task={task} onRefresh={fetchTask} />}
        {activeTab === 'sources' && <SourcesTab task={task} />}
        {activeTab === 'ideas' && <IdeasTab task={task} />}
        {activeTab === 'article' && <ArticleTab task={task} onRefresh={fetchTask} />}
        {activeTab === 'images' && <ImagesTab task={task} onRefresh={fetchTask} />}
        {activeTab === 'quality' && <QualityTab task={task} />}
        {activeTab === 'drive' && <DriveTab task={task} />}
        {activeTab === 'wordpress' && <WordPressTab task={task} />}
        {activeTab === 'logs' && <LogsTab task={task} />}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  const [rating, setRating] = useState<number>(task.userRating || 0);
  const [feedback, setFeedback] = useState<string>(task.userFeedback || '');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveFeedback = async () => {
    setSavingFeedback(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/tasks/${task.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RATE_TASK',
          rating,
          feedback,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Task Details</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <InfoRow label="Topic" value={task.topic} />
              <InfoRow label="Website" value={task.website.domain} />
              <InfoRow label="Ideas Requested" value={String(task.requestedIdeaCount)} />
              <InfoRow label="Competitors" value={String(task.competitorSources.length)} />
              <InfoRow label="Content Approved" value={task.contentApproved ? 'Yes' : 'No'} />
              <InfoRow label="Created" value={formatDateTime(task.createdAt)} />
              <InfoRow label="Updated" value={formatDateTime(task.updatedAt)} />
              {task.completedAt && <InfoRow label="Completed" value={formatDateTime(task.completedAt)} />}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Status Summary</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <InfoRow label="Current Stage" value={STAGE_LABELS[task.currentStage] || task.currentStage} />
              <InfoRow label="Progress" value={`${task.progressPercentage}%`} />
              <InfoRow label="Content QC Score" value={task.contentQcScore ? `${task.contentQcScore}/100` : '—'} />
              <InfoRow label="WordPress" value={getWpStatus(task)} />
              <InfoRow label="Google Drive" value={task.driveFolderId ? 'Saved' : 'Not saved'} />
              <InfoRow label="Sections Generated" value={String(task.articleSections.length)} />
            </div>
          </div>
        </div>
      </div>

      {/* Rating & Learning Loop */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">AI Learning Feedback</h3>
          <span className="text-xs text-muted">Auto-trains model logic on ratings</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="text-sm font-medium mb-2">Rate Article Text & Image Quality</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      color: star <= rating ? 'var(--status-amber)' : 'var(--border-dark)',
                      padding: 0,
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Tell AI what to improve (e.g. outline flow, image styling, etc.)</label>
              <textarea
                className="form-control"
                style={{ width: '100%', minHeight: 80, fontSize: '0.875rem' }}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="The image section 2 was too dark... The introduction needed more styling details..."
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveFeedback}
                disabled={savingFeedback}
              >
                {savingFeedback ? 'Saving...' : 'Submit Rating & Feedback'}
              </button>
              {saveSuccess && (
                <span className="text-xs text-success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✓ Feedback logged to learning log successfully!
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

// ─── Sources Tab ───────────────────────────────────────────────
function SourcesTab({ task }: { task: TaskDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {task.competitorSources.length === 0 ? (
        <div className="empty-state"><p className="text-muted">No sources yet</p></div>
      ) : (
        task.competitorSources.map((source, idx) => (
          <div key={source.id} className="card">
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="section-number">{idx + 1}</span>
                  <span className="font-semibold">{source.pageTitle || 'Untitled'}</span>
                </div>
                <p className="text-sm text-muted" style={{ wordBreak: 'break-all' }}>{source.url}</p>
                <p className="text-xs text-muted mt-2">Fetched: {formatDateTime(source.createdAt)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status-chip ${source.fetchStatus === 'SUCCESS' ? 'green' : source.fetchStatus === 'FAILED' ? 'red' : 'blue'}`}>
                  <span className="dot" />
                  {source.fetchStatus}
                </span>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Ideas Tab ─────────────────────────────────────────────────
function IdeasTab({ task }: { task: TaskDetail }) {
  const selectedIdeas = task.normalizedIdeas.filter((i) => i.selected);
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <span className="text-sm text-muted">
          {selectedIdeas.length} / {task.normalizedIdeas.length} ideas selected
        </span>
      </div>
      {selectedIdeas.length === 0 ? (
        <div className="empty-state"><p className="text-muted">Ideas will appear after competitor analysis</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedIdeas.map((idea) => {
            const sources = idea.sourceUrls ? JSON.parse(idea.sourceUrls) : [];
            const merged = idea.mergedFrom ? JSON.parse(idea.mergedFrom) : [];
            return (
              <div key={idea.id} className="card">
                <div className="card-body" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span className="section-number">{idea.finalOrder ?? '—'}</span>
                    <div style={{ flex: 1 }}>
                      <p className="font-semibold">{idea.concept}</p>
                      {merged.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs text-muted">Merged from:</span>
                          <ul style={{ margin: '4px 0 0 16px' }}>
                            {merged.map((m: string, i: number) => (
                              <li key={i} className="text-xs text-muted">{m}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-2" style={{ display: 'flex', gap: 8 }}>
                        <span className="text-xs text-muted">Sources: {idea.sourceCount}</span>
                        {idea.generatedOriginal && (
                          <span className="status-chip purple" style={{ fontSize: '0.65rem' }}>
                            <span className="dot" />AI Generated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Article Tab ───────────────────────────────────────────────
function ArticleTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  if (task.articleSections.length === 0) {
    return (
      <div className="empty-state">
        <FileText size={28} className="text-muted" />
        <p className="text-muted mt-2">Article content will appear after the writing stage</p>
      </div>
    );
  }

  return (
    <div>
      {/* SEO Info */}
      {(task.metaTitle || task.metaDescription) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ padding: 16 }}>
            <h4 className="text-sm font-semibold mb-2">SEO Metadata</h4>
            {task.metaTitle && <p className="text-sm"><span className="text-muted">Title: </span>{task.metaTitle}</p>}
            {task.metaDescription && <p className="text-sm mt-2"><span className="text-muted">Description: </span>{task.metaDescription}</p>}
            {task.articleSlug && <p className="text-sm mt-2"><span className="text-muted">Slug: </span>{task.articleSlug}</p>}
          </div>
        </div>
      )}

      {/* Introduction */}
      {task.articleIntroduction && (
        <div className="section-card">
          <div className="section-header">
            <span className="section-heading">Introduction</span>
          </div>
          <div className="section-body">
            <p className="text-sm" style={{ lineHeight: 1.7 }}>{task.articleIntroduction}</p>
          </div>
        </div>
      )}

      {/* Sections */}
      {task.articleSections.map((section) => (
        <div key={section.id} className="section-card">
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="section-number">{section.position}</span>
              <span className="section-heading">{section.heading}</span>
            </div>
            <div className="section-actions">
              <button className="btn btn-ghost btn-sm">
                <RefreshCw size={12} /> Regenerate
              </button>
            </div>
          </div>
          <div className="section-body">
            <p className="text-sm" style={{ lineHeight: 1.7 }}>{section.body}</p>
          </div>
        </div>
      ))}

      {/* Conclusion */}
      {task.articleConclusion && (
        <div className="section-card">
          <div className="section-header">
            <span className="section-heading">Conclusion</span>
          </div>
          <div className="section-body">
            <p className="text-sm" style={{ lineHeight: 1.7 }}>{task.articleConclusion}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {task.currentStage === 'READY_FOR_REVIEW' && (
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <Link href={`/tasks/${task.id}/review`} className="btn btn-primary">
            <Eye size={16} /> Review & Edit Article
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Images Tab ────────────────────────────────────────────────
function ImagesTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});
  const [showEditPromptId, setShowEditPromptId] = useState<string | null>(null);

  const sectionsWithImages = task.articleSections.filter(s => s.imageGenerations.length > 0);
  
  const handleRegenerateSingle = async (sectionId: string) => {
    setRegeneratingId(sectionId);
    try {
      const customPrompt = promptEdits[sectionId];
      const res = await fetch(`/api/tasks/${task.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGENERATE_SINGLE_IMAGE',
          sectionId,
          customPrompt,
        }),
      });
      if (res.ok) {
        setShowEditPromptId(null);
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRetryAll = async () => {
    if (!confirm('Are you sure you want to regenerate all images for this task?')) return;
    setRetryingAll(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RETRY_ALL_IMAGES' }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRetryingAll(false);
    }
  };

  const handleApproveImages = async () => {
    setRetryingAll(true);
    try {
      // Set stage to IMAGE_QC and execute step
      const res = await fetch(`/api/tasks/${task.id}/action`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'FINISH_IMAGES' })
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRetryingAll(false);
    }
  };

  if (sectionsWithImages.length === 0) {
    return (
      <div className="empty-state">
        <ImageIcon size={28} className="text-muted" />
        <p className="text-muted mt-2">Images will appear after content approval and generation</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 16 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRetryAll}
          disabled={retryingAll}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {retryingAll ? (
            <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <RefreshCw size={14} />
          )}
          RETRY ALL IMAGES AT ONCE
        </button>

        {task.currentStage === 'GENERATING_IMAGES' && (
          <button
            className="btn btn-success btn-sm"
            onClick={handleApproveImages}
            disabled={retryingAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <CheckCircle2 size={14} />
            APPROVE IMAGES & PROCEED TO QC
          </button>
        )}
      </div>

      <div className="image-grid">
        {task.articleSections.map((section) => {
          const latestImage = section.imageGenerations[0];
          const imageUrl = latestImage?.wpMediaUrl || latestImage?.localPath;
          const isEditing = showEditPromptId === section.id;
          const currentPromptText = promptEdits[section.id] ?? section.imagePrompt ?? '';

          return (
            <div key={section.id} className="image-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="image-card-thumbnail" style={{ position: 'relative', height: 160 }}>
                {imageUrl ? (
                  <img src={imageUrl} alt={section.heading} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-light)' }}>
                    <ImageIcon size={32} className="text-muted" />
                  </div>
                )}
              </div>
              <div className="image-card-info" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className="section-number" style={{ width: 22, height: 22, fontSize: '0.65rem' }}>
                      {section.position}
                    </span>
                  </div>
                  <p className="image-card-heading" style={{ marginBottom: 8 }}>{section.heading}</p>
                </div>

                <div>
                  {/* Prompt Editor */}
                  {isEditing ? (
                    <div style={{ marginBottom: 10 }}>
                      <textarea
                        className="form-control text-xs"
                        style={{ width: '100%', minHeight: 60, fontSize: '0.75rem', marginBottom: 6 }}
                        value={currentPromptText}
                        onChange={(e) => setPromptEdits({ ...promptEdits, [section.id]: e.target.value })}
                        placeholder="Enter custom image generation prompt..."
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleRegenerateSingle(section.id)}
                          disabled={regeneratingId === section.id}
                        >
                          {regeneratingId === section.id ? 'Saving...' : 'Regenerate'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                          onClick={() => setShowEditPromptId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 10 }}>
                      <p className="text-xs text-muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        <strong>Prompt:</strong> {section.imagePrompt || 'No prompt set'}
                      </p>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 0, fontSize: '0.7rem', color: 'var(--primary)' }}
                        onClick={() => {
                          setPromptEdits({ ...promptEdits, [section.id]: section.imagePrompt || '' });
                          setShowEditPromptId(section.id);
                        }}
                      >
                        Edit prompt & retry
                      </button>
                    </div>
                  )}

                  <div className="image-card-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {latestImage ? (
                        <>
                          <span className="image-card-score text-sm"
                            style={{ color: latestImage.qcScore && latestImage.qcScore >= 85 ? 'var(--status-green)' : 'var(--status-amber)' }}>
                            {latestImage.qcScore ? `${latestImage.qcScore}/100` : '—'}
                          </span>
                          <span className={`status-chip ${latestImage.qcStatus === 'PASSED' ? 'green' : latestImage.qcStatus === 'FAILED' ? 'red' : 'gray'}`}
                            style={{ fontSize: '0.65rem' }}>
                            <span className="dot" />
                            {latestImage.qcStatus}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">No image yet</span>
                      )}
                    </div>
                    {imageUrl && (
                      <a
                        href={imageUrl}
                        download={`${section.position}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quality Check Tab ─────────────────────────────────────────
function QualityTab({ task }: { task: TaskDetail }) {
  const allImages = task.articleSections.flatMap(s => s.imageGenerations);
  const passed = allImages.filter(i => i.qcStatus === 'PASSED').length;
  const failed = allImages.filter(i => i.qcStatus === 'FAILED').length;
  const needsReview = allImages.filter(i => i.qcStatus === 'NEEDS_MANUAL_REVIEW').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Content QC</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoRow label="Requested Ideas" value={String(task.requestedIdeaCount)} />
            <InfoRow label="Generated Sections" value={String(task.articleSections.length)} />
            <InfoRow label="Content Approved" value={task.contentApproved ? 'Yes' : 'No'} />
            <InfoRow label="Content QC Score" value={task.contentQcScore ? `${task.contentQcScore}/100` : '—'} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Image QC</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoRow label="Total Images" value={String(allImages.length)} />
            <InfoRow label="Passed" value={String(passed)} />
            <InfoRow label="Failed" value={String(failed)} />
            <InfoRow label="Manual Review" value={String(needsReview)} />
            {allImages.length > 0 && (
              <InfoRow
                label="Average Score"
                value={`${Math.round(allImages.filter(i => i.qcScore).reduce((sum, i) => sum + (i.qcScore || 0), 0) / (allImages.filter(i => i.qcScore).length || 1))}/100`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drive Tab ─────────────────────────────────────────────────
function DriveTab({ task }: { task: TaskDetail }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Google Drive</h3></div>
      <div className="card-body">
        {task.driveFolderId ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <InfoRow label="Folder ID" value={task.driveFolderId} />
              <InfoRow label="Backup Status" value="Saved" />
            </div>
            {task.driveFolderUrl && (
              <a href={task.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <HardDrive size={16} /> OPEN DRIVE FOLDER
              </a>
            )}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            <HardDrive size={28} className="text-muted" />
            <p className="text-muted mt-2">Drive backup not created yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WordPress Tab ─────────────────────────────────────────────
function WordPressTab({ task }: { task: TaskDetail }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">WordPress</h3></div>
      <div className="card-body">
        {task.wpPostId ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <InfoRow label="Website" value={task.website.domain} />
              <InfoRow label="WordPress Post ID" value={String(task.wpPostId)} />
              <InfoRow label="Status" value="Draft Created" />
              <InfoRow label="Slug" value={task.articleSlug || '—'} />
            </div>
            {task.wpEditUrl && (
              <a href={task.wpEditUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <Newspaper size={16} /> OPEN IN WORDPRESS
              </a>
            )}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            <Newspaper size={28} className="text-muted" />
            <p className="text-muted mt-2">WordPress draft not created yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Logs Tab ──────────────────────────────────────────────────
function LogsTab({ task }: { task: TaskDetail }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Activity Log</h3></div>
      <div className="card-body" style={{ padding: 0 }}>
        {task.taskLogs.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <Activity size={28} className="text-muted" />
            <p className="text-muted mt-2">No activity yet</p>
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {task.taskLogs.map((log) => (
              <div key={log.id} style={{
                padding: '10px 20px',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <span className="text-xs text-muted" style={{ whiteSpace: 'nowrap', minWidth: 70 }}>
                  {formatTime(log.createdAt)}
                </span>
                <ChevronRight size={12} className="text-muted" style={{ marginTop: 2, flexShrink: 0 }} />
                <span className="text-sm">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
