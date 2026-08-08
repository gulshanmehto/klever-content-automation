import { type ClassValue, clsx } from 'clsx';

// Lightweight clsx replacement (no external dependency needed)
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format a date with time
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format time only (for logs)
 */
export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Slugify a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Task stage display labels
 */
export const STAGE_LABELS: Record<string, string> = {
  CREATED: 'Created',
  FETCHING_COMPETITORS: 'Fetching Competitors',
  ANALYZING_COMPETITORS: 'Analyzing Competitors',
  EXTRACTING_IDEAS: 'Extracting Ideas',
  DEDUPLICATING: 'Deduplicating',
  BUILDING_OUTLINE: 'Building Outline',
  WRITING_ARTICLE: 'Writing Article',
  READY_FOR_REVIEW: 'Ready for Review',
  GENERATING_IMAGES: 'Generating Images',
  IMAGE_QC: 'Image Quality Check',
  SAVING_TO_DRIVE: 'Saving to Drive',
  READY_FOR_WORDPRESS: 'Ready for WordPress',
  UPLOADING_TO_WORDPRESS: 'Uploading to WordPress',
  WORDPRESS_DRAFT_CREATED: 'WordPress Draft Created',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/**
 * Stage color mapping for status chips
 */
export const STAGE_COLORS: Record<string, string> = {
  CREATED: 'gray',
  FETCHING_COMPETITORS: 'blue',
  ANALYZING_COMPETITORS: 'blue',
  EXTRACTING_IDEAS: 'blue',
  DEDUPLICATING: 'blue',
  BUILDING_OUTLINE: 'blue',
  WRITING_ARTICLE: 'blue',
  READY_FOR_REVIEW: 'amber',
  GENERATING_IMAGES: 'blue',
  IMAGE_QC: 'blue',
  SAVING_TO_DRIVE: 'blue',
  READY_FOR_WORDPRESS: 'amber',
  UPLOADING_TO_WORDPRESS: 'blue',
  WORDPRESS_DRAFT_CREATED: 'green',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'gray',
};

/**
 * Progress percentage by stage
 */
export const STAGE_PROGRESS: Record<string, number> = {
  CREATED: 0,
  FETCHING_COMPETITORS: 8,
  ANALYZING_COMPETITORS: 16,
  EXTRACTING_IDEAS: 24,
  DEDUPLICATING: 32,
  BUILDING_OUTLINE: 40,
  WRITING_ARTICLE: 50,
  READY_FOR_REVIEW: 55,
  GENERATING_IMAGES: 68,
  IMAGE_QC: 78,
  SAVING_TO_DRIVE: 85,
  UPLOADING_TO_WORDPRESS: 92,
  WORDPRESS_DRAFT_CREATED: 98,
  COMPLETED: 100,
  FAILED: 0,
  CANCELLED: 0,
};

/**
 * All ordered pipeline stages
 */
export const PIPELINE_STAGES = [
  'CREATED',
  'FETCHING_COMPETITORS',
  'ANALYZING_COMPETITORS',
  'EXTRACTING_IDEAS',
  'DEDUPLICATING',
  'BUILDING_OUTLINE',
  'WRITING_ARTICLE',
  'READY_FOR_REVIEW',
  'GENERATING_IMAGES',
  'IMAGE_QC',
  'SAVING_TO_DRIVE',
  'UPLOADING_TO_WORDPRESS',
  'WORDPRESS_DRAFT_CREATED',
  'COMPLETED',
] as const;

/**
 * WordPress status display
 */
export function getWpStatus(task: { wpPostId?: number | null; currentStage: string }): string {
  if (task.wpPostId) return 'Draft Created';
  if (task.currentStage === 'UPLOADING_TO_WORDPRESS') return 'Uploading...';
  if (task.currentStage === 'FAILED') return 'Failed';
  return 'Not Sent';
}
