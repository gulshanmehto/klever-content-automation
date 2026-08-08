/**
 * Image Provider Interface
 * Per spec §19: supports multiple providers via abstraction
 */

export interface ImageOptions {
  aspectRatio?: string;
  style?: string;
  width?: number;
  height?: number;
}

export interface ImageResult {
  imageBase64: string;
  mimeType: string;
  provider: string;
  model: string;
}

export interface ImageProvider {
  generateImage(prompt: string, options: ImageOptions): Promise<ImageResult>;
}
