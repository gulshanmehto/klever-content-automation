import { google } from 'googleapis';
import type { DriveProvider } from './types';

export class GoogleDriveProvider implements DriveProvider {
  private getAuth() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google Drive API credentials (Client ID, Secret, or Refresh Token) are missing in .env');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  private getDrive() {
    const auth = this.getAuth();
    return google.drive({ version: 'v3', auth });
  }

  async createFolder(name: string, parentId?: string): Promise<string> {
    const drive = this.getDrive();
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    };

    try {
      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      const folderId = response.data.id;
      if (!folderId) throw new Error('Failed to retrieve created folder ID');
      return folderId;
    } catch (error) {
      console.error('Google Drive Folder creation failed:', error);
      throw error;
    }
  }

  async uploadFile(name: string, content: Buffer, mimeType: string, folderId: string): Promise<string> {
    const drive = this.getDrive();
    const fileMetadata = {
      name,
      parents: [folderId],
    };
    const media = {
      mimeType,
      body: new (require('stream').Readable)({
        read() {
          this.push(content);
          this.push(null);
        },
      }),
    };

    try {
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });
      const fileId = response.data.id;
      if (!fileId) throw new Error('Failed to retrieve uploaded file ID');
      return fileId;
    } catch (error) {
      console.error(`Google Drive upload failed for ${name}:`, error);
      throw error;
    }
  }

  async uploadJson(name: string, data: object, folderId: string): Promise<string> {
    const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    return this.uploadFile(name, buffer, 'application/json', folderId);
  }
}
