'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ListTodo,
  Loader,
  Eye,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  ExternalLink,
} from 'lucide-react';
import { formatDate, STAGE_LABELS, STAGE_COLORS, getWpStatus } from '@/lib/utils';

interface DashboardStats {
  totalTasks: number;
  inProgress: number;
  readyForReview: number;
  wpDraftsCreated: number;
  failedTasks: number;
  completedTasks: number;
}

interface RecentTask {
  id: number;
  topic: string;
  currentStage: string;
  progressPercentage: number;
  createdAt: string;
  wpPostId: number | null;
  requestedIdeaCount: number;
  website: { name: string; domain: string };
  _count: { competitorSources: number };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          fetch('/api/tasks?stats=true'),
          fetch('/api/tasks?limit=10&sort=newest'),
        ]);
        const statsData = await statsRes.json();
        const tasksData = await tasksRes.json();
        setStats(statsData.stats || {
          totalTasks: 0,
          inProgress: 0,
          readyForReview: 0,
          wpDraftsCreated: 0,
          failedTasks: 0,
          completedTasks: 0,
        });
        setRecentTasks(tasksData.tasks || []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  const statCards = [
    { label: 'Total Tasks', value: stats?.totalTasks ?? 0, icon: ListTodo, color: 'blue' },
    { label: 'In Progress', value: stats?.inProgress ?? 0, icon: Loader, color: 'blue' },
    { label: 'Ready for Review', value: stats?.readyForReview ?? 0, icon: Eye, color: 'amber' },
    { label: 'WP Drafts Created', value: stats?.wpDraftsCreated ?? 0, icon: FileCheck, color: 'purple' },
    { label: 'Failed Tasks', value: stats?.failedTasks ?? 0, icon: AlertCircle, color: 'red' },
    { label: 'Completed', value: stats?.completedTasks ?? 0, icon: CheckCircle2, color: 'green' },
  ];

  if (loading) {
    return (
      <div className="empty-state">
        <Loader size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-muted mt-4">Loading dashboard...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Overview of your article production pipeline</p>
          </div>
          <Link href="/new-article" className="btn btn-primary">
            <FilePlus2 size={16} />
            New Article
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">{card.label}</span>
                <div className={`stat-card-icon ${card.color}`}>
                  <Icon size={18} />
                </div>
              </div>
              <span className="stat-card-value">{card.value}</span>
            </div>
          );
        })}
      </div>

      {/* Recent Tasks */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Tasks</h2>
          <Link href="/tasks" className="btn btn-ghost btn-sm">
            View All
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {recentTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ListTodo size={28} />
              </div>
              <h3 className="empty-state-title">No tasks yet</h3>
              <p className="empty-state-text">
                Create your first article task to get started with AI-powered content production.
              </p>
              <Link href="/new-article" className="btn btn-primary">
                <FilePlus2 size={16} />
                Create First Article
              </Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Article Topic</th>
                  <th>Website</th>
                  <th>Ideas</th>
                  <th>Competitors</th>
                  <th>Current Stage</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th>WordPress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <span className="table-task-id">#{task.id}</span>
                    </td>
                    <td>
                      <span className="table-topic">{task.topic}</span>
                    </td>
                    <td>
                      <span className="table-website">{task.website?.domain || '—'}</span>
                    </td>
                    <td>{task.requestedIdeaCount}</td>
                    <td>{task._count?.competitorSources || 0}</td>
                    <td>
                      <span className={`status-chip ${STAGE_COLORS[task.currentStage] || 'gray'}`}>
                        <span className="dot" />
                        {STAGE_LABELS[task.currentStage] || task.currentStage}
                      </span>
                    </td>
                    <td>
                      <div className="progress-bar-container" style={{ width: 100 }}>
                        <div className="progress-bar-track">
                          <div
                            className={`progress-bar-fill ${task.currentStage === 'COMPLETED' ? 'green' : ''}`}
                            style={{ width: `${task.progressPercentage}%` }}
                          />
                        </div>
                        <span className="progress-bar-label">{task.progressPercentage}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="table-date">{formatDate(task.createdAt)}</span>
                    </td>
                    <td>
                      <span className={`status-chip ${task.wpPostId ? 'green' : 'gray'}`}>
                        <span className="dot" />
                        {getWpStatus(task)}
                      </span>
                    </td>
                    <td>
                      <Link href={`/tasks/${task.id}`} className="btn btn-ghost btn-sm">
                        <ExternalLink size={14} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
