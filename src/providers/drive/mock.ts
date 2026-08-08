import type { DriveProvider } from './types';

export class MockDriveProvider implements DriveProvider {
  async createFolder(name: string, parentId?: string): Promise<string> {
    console.log(`[MockDrive] Created folder "${name}" (parent: ${parentId || 'root'})`);
    return `mock-folder-id-${Math.random().toString(36).substring(7)}`;
  }

  async uploadFile(name: string, content: Buffer, mimeType: string, folderId: string): Promise<string> {
    console.log(`[MockDrive] Uploaded file "${name}" (${content.length} bytes, type: ${mimeType}) to folder ${folderId}`);
    return `mock-file-id-${Math.random().toString(36).substring(7)}`;
  }

  async uploadJson(name: string, data: object, folderId: string): Promise<string> {
    console.log(`[MockDrive] Uploaded JSON "${name}" to folder ${folderId}`);
    return `mock-json-id-${Math.random().toString(36).substring(7)}`;
  }
}
