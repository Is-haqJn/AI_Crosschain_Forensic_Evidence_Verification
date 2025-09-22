import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';
import { ConfigManager } from '../config/ConfigManager.js';
import { AppError } from './ErrorHandler.js';

/**
 * File Upload Middleware
 * Handles file uploads with validation and security
 */
export class FileUploadMiddleware {
  private config: ConfigManager;
  private upload: multer.Multer;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.upload = this.configureMulter();
  }

  /**
   * Configure Multer for file uploads
   */
  private configureMulter(): multer.Multer {
    const fileUploadConfig = this.config.get<any>('fileUpload');
    
    // Debug logging
    console.log('File upload config:', fileUploadConfig);
    console.log('Max file size:', fileUploadConfig.maxFileSize);
    console.log('Environment MAX_FILE_SIZE:', process.env.MAX_FILE_SIZE);

    const storage = multer.memoryStorage();

    const fileFilter = (
      _req: Request,
      file: Express.Multer.File,
      callback: multer.FileFilterCallback
    ) => {
      // Check file type
      if (!fileUploadConfig.allowedMimeTypes.includes(file.mimetype)) {
        callback(new AppError(`File type ${file.mimetype} not allowed`, 400) as any);
        return;
      }

      // Check file extension
      const fileExt = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif',
        '.mp4', '.avi', '.mov',
        '.pdf', '.doc', '.docx',
        '.mp3', '.wav', '.m4a'
      ];

      if (!allowedExtensions.includes(fileExt)) {
        callback(new AppError(`File extension ${fileExt} not allowed`, 400) as any);
        return;
      }

      callback(null, true);
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: fileUploadConfig.maxFileSize,
        files: 1
      }
    });
  }

  /**
   * Single file upload
   */
  public single(fieldName: string) {
    return this.upload.single(fieldName);
  }

  /**
   * Multiple files upload
   */
  public array(fieldName: string, maxCount: number = 10) {
    return this.upload.array(fieldName, maxCount);
  }

  /**
   * Generate unique filename
   */
  public static generateFilename(originalName: string): string {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(originalName);
    return `${timestamp}-${randomString}${extension}`;
  }

  /**
   * Validate file size
   */
  public static validateFileSize(file: Express.Multer.File, maxSize: number): boolean {
    return file.size <= maxSize;
  }

  /**
   * Get file type category
   */
  public static getFileCategory(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'IMAGE';
    if (mimetype.startsWith('video/')) return 'VIDEO';
    if (mimetype.startsWith('audio/')) return 'AUDIO';
    if (mimetype.includes('pdf') || mimetype.includes('document')) return 'DOCUMENT';
    return 'OTHER';
  }

  /**
   * Sanitize filename
   */
  public static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }
}

export default FileUploadMiddleware;
