'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Search,
  FilePlus2,
  ListTodo,
  Loader,
} from 'lucide-react';
import { formatDate, STAGE_LABELS, STAGE_COLORS, getWpStatus } from '@/lib/utils';

interface Task {
  id: number;
  topic: string;
  currentStage: string;
  progressPercentage: number;
  requestedIdeaCount: number;
  createdAt: string;
  updatedAt: string;
  wpPostId: number | null;
  website: { name: string; domain: string };
  _count: { competitorSources: number };
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ready_for_review', label: 'Ready for Review' },
  { key: 'wordpress_draft', label: 'WordPress Draft' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'recently_updated', label: 'Recently Updated' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter,
        sort,
        ...(search && { search }),
      });
      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, search, sort]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">{total} total task{total !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/new-article" className="btn btn-primary">
            <FilePlus2 size={16} />
            New Article
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="task-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div className="header-search" style={{ maxWidth: 320 }}>
          <Search size={16} className="header-search-icon" />
          <input
            type="text"
            placeholder="Search by title, ID, or website..."
            className="header-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 'auto', minWidth: 160 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Task Table */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} className="text-muted" />
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ListTodo size={28} />
              </div>
              <h3 className="empty-state-title">No tasks found</h3>
              <p className="empty-state-text">
                {filter !== 'all'
                  ? 'No tasks match the current filter. Try adjusting your filters.'
                  : 'Create your first article task to get started.'}
              </p>
              {filter === 'all' && (
                <Link href="/new-article" className="btn btn-primary">
                  <FilePlus2 size={16} />
                  Create First Article
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Article</th>
                  <th>Website</th>
                  <th>Ideas</th>
                  <th>Competitors</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>WordPress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td><span className="table-task-id">#{task.id}</span></td>
                    <td><span className="table-topic">{task.topic}</span></td>
                    <td><span className="table-website">{task.website?.domain || '—'}</span></td>
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
                            className={`progress-bar-fill ${task.currentStage === 'COMPLETED' ? 'green' : task.currentStage === 'FAILED' ? 'red' : ''}`}
                            style={{ width: `${task.progressPercentage}%` }}
                          />
                        </div>
                        <span className="progress-bar-label">{task.progressPercentage}%</span>
                      </div>
                    </td>
                    <td><span className="table-date">{formatDate(task.createdAt)}</span></td>
                    <td><span className="table-date">{formatDate(task.updatedAt)}</span></td>
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
