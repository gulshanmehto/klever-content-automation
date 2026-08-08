export interface WPMedia {
  id: number;
  sourceUrl: string;
}

export interface WPPost {
  id: number;
  link: string;
}

export interface WPPostData {
  title: string;
  slug: string;
  content: string;
  status: 'draft';
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
}

export interface WordPressProvider {
  uploadMedia(file: Buffer, filename: string, mimeType: string, altText: string): Promise<WPMedia>;
  createDraft(post: WPPostData): Promise<WPPost>;
  getEditUrl(postId: number): string;
}
