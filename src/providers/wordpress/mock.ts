import type { WordPressProvider, WPMedia, WPPost, WPPostData } from './types';

export class MockWordPressProvider implements WordPressProvider {
  private wpBaseUrl: string;

  constructor(wpBaseUrl: string) {
    this.wpBaseUrl = wpBaseUrl || 'https://mocksite.com';
  }

  async uploadMedia(file: Buffer, filename: string, mimeType: string, altText: string): Promise<WPMedia> {
    console.log(`[MockWordPress] Uploaded media "${filename}" (${contentLength(file)} bytes, type: ${mimeType}), alt: "${altText}"`);
    return {
      id: Math.floor(Math.random() * 1000) + 1,
      sourceUrl: `https://picsum.photos/800/600?random=${Math.floor(Math.random() * 100)}`,
    };
  }

  async createDraft(post: WPPostData): Promise<WPPost> {
    const postId = Math.floor(Math.random() * 1000) + 1;
    console.log(`[MockWordPress] Created draft post #${postId}: "${post.title}" (slug: "${post.slug}")`);
    return {
      id: postId,
      link: `${this.wpBaseUrl}/?p=${postId}`,
    };
  }

  getEditUrl(postId: number): string {
    return `${this.wpBaseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
  }
}

function contentLength(file: Buffer | any): number {
  if (Buffer.isBuffer(file)) return file.length;
  return 0;
}
