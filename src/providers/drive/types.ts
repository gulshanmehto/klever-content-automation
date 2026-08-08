export interface DriveProvider {
  createFolder(name: string, parentId?: string): Promise<string>;
  uploadFile(name: string, content: Buffer, mimeType: string, folderId: string): Promise<string>;
  uploadJson(name: string, data: object, folderId: string): Promise<string>;
}
