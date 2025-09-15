import crypto from 'crypto';
import { createHash } from 'crypto';
import { ethers } from 'ethers';

/**
 * Hash Service
 * Provides various hashing algorithms for evidence integrity
 */
export class HashService {
  /**
   * Calculate SHA-256 hash
   */
  public calculateSHA256(data: Buffer | string): string {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Calculate SHA-512 hash
   */
  public calculateSHA512(data: Buffer | string): string {
    const hash = createHash('sha512');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Calculate MD5 hash (for legacy compatibility)
   */
  public calculateMD5(data: Buffer | string): string {
    const hash = createHash('md5');
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Calculate Keccak-256 hash (Ethereum)
   */
  public calculateKeccak256(data: Buffer | string): string {
    const dataString = typeof data === 'string' ? data : data.toString('hex');
    return ethers.keccak256('0x' + dataString);
  }

  /**
   * Generate multiple hashes for comprehensive verification
   */
  public generateMultiHash(data: Buffer | string): {
    sha256: string;
    sha512: string;
    md5: string;
    keccak256: string;
  } {
    return {
      sha256: this.calculateSHA256(data),
      sha512: this.calculateSHA512(data),
      md5: this.calculateMD5(data),
      keccak256: this.calculateKeccak256(data)
    };
  }

  /**
   * Verify hash matches data
   */
  public verifyHash(
    data: Buffer | string,
    hash: string,
    algorithm: 'sha256' | 'sha512' | 'md5' | 'keccak256' = 'sha256'
  ): boolean {
    let computedHash: string;

    switch (algorithm) {
      case 'sha256':
        computedHash = this.calculateSHA256(data);
        break;
      case 'sha512':
        computedHash = this.calculateSHA512(data);
        break;
      case 'md5':
        computedHash = this.calculateMD5(data);
        break;
      case 'keccak256':
        computedHash = this.calculateKeccak256(data);
        break;
      default:
        throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }

    return computedHash.toLowerCase() === hash.toLowerCase();
  }

  /**
   * Generate a merkle tree root from array of hashes
   */
  public generateMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    const tree = [...hashes];

    while (tree.length > 1) {
      const newLevel: string[] = [];

      for (let i = 0; i < tree.length; i += 2) {
        const left = tree[i];
        const right = tree[i + 1] || left;
        const combined = left + right;
        const hash = this.calculateSHA256(combined);
        newLevel.push(hash);
      }

      tree.length = 0;
      tree.push(...newLevel);
    }

    return tree[0];
  }

  /**
   * Generate merkle proof for a leaf
   */
  public generateMerkleProof(leaves: string[], leafIndex: number): string[] {
    if (leafIndex >= leaves.length) {
      throw new Error('Leaf index out of bounds');
    }

    const proof: string[] = [];
    let currentLevel = [...leaves];

    while (currentLevel.length > 1) {
      const newLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left;

        if (Math.floor(leafIndex / Math.pow(2, proof.length)) === Math.floor(i / 2)) {
          if (leafIndex % 2 === 0) {
            proof.push(right);
          } else {
            proof.push(left);
          }
        }

        const combined = left + right;
        const hash = this.calculateSHA256(combined);
        newLevel.push(hash);
      }

      currentLevel = newLevel;
      leafIndex = Math.floor(leafIndex / 2);
    }

    return proof;
  }

  /**
   * Verify merkle proof
   */
  public verifyMerkleProof(
    leaf: string,
    proof: string[],
    root: string
  ): boolean {
    let computedHash = leaf;

    for (let i = 0; i < proof.length; i++) {
      const proofElement = proof[i];
      
      if (i % 2 === 0) {
        computedHash = this.calculateSHA256(computedHash + proofElement);
      } else {
        computedHash = this.calculateSHA256(proofElement + computedHash);
      }
    }

    return computedHash === root;
  }

  /**
   * Generate a unique hash for evidence
   */
  public generateEvidenceHash(data: {
    fileHash: string;
    timestamp: number;
    submitter: string;
    metadata?: any;
  }): string {
    const combinedData = JSON.stringify({
      fileHash: data.fileHash,
      timestamp: data.timestamp,
      submitter: data.submitter,
      metadata: data.metadata || {},
      nonce: crypto.randomBytes(16).toString('hex')
    });

    return this.calculateSHA256(combinedData);
  }

  /**
   * Generate HMAC for message authentication
   */
  public generateHMAC(
    data: Buffer | string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): string {
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC
   */
  public verifyHMAC(
    data: Buffer | string,
    hmac: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): boolean {
    const computedHmac = this.generateHMAC(data, secret, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac),
      Buffer.from(hmac)
    );
  }
}

export default HashService;
