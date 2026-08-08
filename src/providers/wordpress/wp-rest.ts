import axios from 'axios';
import type { WordPressProvider, WPMedia, WPPost, WPPostData } from './types';

export class WPRestProvider implements WordPressProvider {
  private baseUrl: string;
  private authHeader: string;

  constructor(wpBaseUrl: string, username: string, appPassword: string) {
    this.baseUrl = wpBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    // Clean spaces from application password if any
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const credentials = Buffer.from(`${username}:${cleanPassword}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  async uploadMedia(file: Buffer, filename: string, mimeType: string, altText: string): Promise<WPMedia> {
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;

    try {
      const response = await axios.post(url, file, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Authorization': this.authHeader,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const mediaId = response.data.id;
      
      // Update Alt text on the uploaded media item
      if (mediaId && altText) {
        await axios.post(`${url}/${mediaId}`, {
          alt_text: altText,
        }, {
          headers: { 'Authorization': this.authHeader },
        }).catch(err => {
          console.warn('Failed to update Alt text for uploaded media:', err.message);
        });
      }

      return {
        id: mediaId,
        sourceUrl: response.data.source_url,
      };
    } catch (error: any) {
      console.error('WordPress Media upload failed:', error.response?.data || error.message);
      throw new Error(`WordPress Media upload failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async createDraft(post: WPPostData): Promise<WPPost> {
    const url = `${this.baseUrl}/wp-json/wp/v2/posts`;

    try {
      const response = await axios.post(url, {
        title: post.title,
        slug: post.slug,
        content: post.content,
        status: 'draft',
        categories: post.categories,
        tags: post.tags,
        featured_media: post.featuredMediaId,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
      });

      return {
        id: response.data.id,
        link: response.data.link,
      };
    } catch (error: any) {
      console.error('WordPress Draft creation failed:', error.response?.data || error.message);
      throw new Error(`WordPress Draft creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  getEditUrl(postId: number): string {
    return `${this.baseUrl}/wp-admin/post.php?post=${postId}&action=edit`;
  }
}
