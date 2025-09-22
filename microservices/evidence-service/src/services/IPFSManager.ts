import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { json } from '@helia/json';
import { Logger } from '../utils/Logger.js';

/**
 * IPFS Manager
 * Modern IPFS implementation using Helia
 * Handles distributed file storage and retrieval
 */
export class IPFSManager {
  private static instance: IPFSManager;
  private logger: Logger;
  private helia: any = null;
  private fs: any = null;
  private json: any = null;
  private isConnected: boolean = false;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  public static getInstance(): IPFSManager {
    if (!IPFSManager.instance) {
      IPFSManager.instance = new IPFSManager();
    }
    return IPFSManager.instance;
  }

  /**
   * Connect to IPFS using Helia
   */
  public async connect(retries: number = 5): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        this.logger.info(`Initializing IPFS with Helia (attempt ${i + 1}/${retries})...`);
        
        // Create Helia instance
        this.helia = await createHelia();
        
        // Initialize services
        this.fs = unixfs(this.helia);
        this.json = json(this.helia);
        
        this.isConnected = true;
        this.logger.info('IPFS initialized successfully with Helia');
        return;
      } catch (error) {
        this.logger.error(`IPFS initialization attempt ${i + 1} failed:`, error);
        
        if (i === retries - 1) {
          throw new Error(`Failed to initialize IPFS after ${retries} attempts: ${error}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  /**
   * Disconnect from IPFS
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.helia) {
        await this.helia.stop();
        this.helia = null;
        this.fs = null;
        this.json = null;
      }
      this.isConnected = false;
      this.logger.info('IPFS disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from IPFS:', error);
      throw error;
    }
  }

  /**
   * Check if connected to IPFS
   */
  public isIPFSConnected(): boolean {
    return this.isConnected && this.helia !== null;
  }

  /**
   * Upload file to IPFS
   */
  public async uploadFile(fileBuffer: Buffer, filename: string, metadata?: any): Promise<{ hash: string; metadata?: any }> {
    if (!this.isConnected || !this.fs) {
      throw new Error('IPFS not connected');
    }

    try {
      const cid = await this.fs.addBytes(fileBuffer);
      this.logger.info(`File uploaded to IPFS: ${filename} -> ${cid.toString()}`);
      
      const result: { hash: string; metadata?: any } = { hash: cid.toString() };
      
      // Store metadata if provided
      if (metadata) {
        const metadataCid = await this.storeJSON(metadata);
        result.metadata = { cid: metadataCid, data: metadata };
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error uploading file to IPFS:', error);
      throw error;
    }
  }

  /**
   * Download file from IPFS
   */
  public async downloadFile(hash: string): Promise<Buffer> {
    this.logger.info('Starting IPFS file download', {
      hash,
      isConnected: this.isConnected,
      hasFs: !!this.fs
    });

    if (!this.isConnected || !this.fs) {
      throw new Error('IPFS not connected');
    }

    try {
      this.logger.info('Attempting to download file from IPFS', { hash });
      
      // Add timeout to prevent hanging
      const downloadPromise = this.downloadFileWithTimeout(hash);
      const timeoutPromise = new Promise<Buffer>((_, reject) => {
        setTimeout(() => reject(new Error('IPFS download timeout after 30 seconds')), 30000);
      });
      
      const buffer = await Promise.race([downloadPromise, timeoutPromise]);
      
      this.logger.info('File downloaded from IPFS successfully', {
        hash,
        fileSize: buffer.length
      });
      return buffer;
    } catch (error) {
      this.logger.error('Error downloading file from IPFS', {
        hash,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Download file with timeout handling
   */
  private async downloadFileWithTimeout(hash: string): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    let chunkCount = 0;
    
    for await (const chunk of this.fs.cat(hash)) {
      chunks.push(chunk);
      chunkCount++;
      
      if (chunkCount % 10 === 0) {
        this.logger.debug('Downloading file chunk', { 
          hash, 
          chunkCount, 
          currentChunkSize: chunk.length 
        });
      }
    }
    
    return Buffer.concat(chunks);
  }

  /**
   * Store JSON data
   */
  public async storeJSON(data: any): Promise<string> {
    if (!this.isConnected || !this.json) {
      throw new Error('IPFS not connected');
    }

    try {
      const cid = await this.json.add(data);
      this.logger.info(`JSON stored in IPFS: ${cid.toString()}`);
      return cid.toString();
    } catch (error) {
      this.logger.error('Error storing JSON in IPFS:', error);
      throw error;
    }
  }

  /**
   * Retrieve JSON data
   */
  public async getJSON(hash: string): Promise<any> {
    if (!this.isConnected || !this.json) {
      throw new Error('IPFS not connected');
    }

    try {
      const data = await this.json.get(hash);
      this.logger.info(`JSON retrieved from IPFS: ${hash}`);
      return data;
    } catch (error) {
      this.logger.error('Error retrieving JSON from IPFS:', error);
      throw error;
    }
  }

  /**
   * Pin content
   */
  public async pin(hash: string): Promise<void> {
    if (!this.isConnected || !this.helia) {
      throw new Error('IPFS not connected');
    }

    try {
      await this.helia.pins.add(hash);
      this.logger.info(`Content pinned: ${hash}`);
    } catch (error) {
      this.logger.error('Error pinning content:', error);
      throw error;
    }
  }

  /**
   * Unpin content
   */
  public async unpin(hash: string): Promise<void> {
    if (!this.isConnected || !this.helia) {
      throw new Error('IPFS not connected');
    }

    try {
      await this.helia.pins.rm(hash);
      this.logger.info(`Content unpinned: ${hash}`);
    } catch (error) {
      this.logger.error('Error unpinning content:', error);
      throw error;
    }
  }

  /**
   * Get IPFS gateway URL
   */
  public getGatewayURL(hash: string): string {
    const gateway = 'https://ipfs.io/ipfs/';
    return `${gateway}${hash}`;
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): { connected: boolean; peerId?: string } {
    if (!this.isConnected || !this.helia) {
      return { connected: false };
    }

    try {
      const peerId = this.helia.libp2p.peerId.toString();
      return { connected: true, peerId };
    } catch (error) {
      return { connected: false };
    }
  }

  /**
   * Upload JSON data (alias for storeJSON)
   */
  public async uploadJSON(data: any): Promise<string> {
    return this.storeJSON(data);
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; connected: boolean; peerId?: string }> {
    try {
      if (!this.isConnected || !this.helia) {
        return {
          status: 'disconnected',
          connected: false
        };
      }

      const peerId = this.helia.libp2p.peerId.toString();
      return {
        status: 'healthy',
        connected: true,
        peerId
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'error',
        connected: false
      };
    }
  }
}