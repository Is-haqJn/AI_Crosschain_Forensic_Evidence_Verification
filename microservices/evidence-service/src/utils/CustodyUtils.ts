import { v4 as uuidv4 } from 'uuid';
import { HashService } from '../services/HashService.js';
import { ConfigManager } from '../config/ConfigManager.js';

type CustodyEventBase = {
  eventType: 'COLLECTION' | 'TRANSFER' | 'ANALYSIS' | 'STORAGE' | 'RELEASE' | 'BLOCKCHAIN_SUBMISSION' | 'OTHER';
  from?: { userId?: string; name?: string; organization?: string };
  to?: { userId?: string; name?: string; organization?: string };
  location?: { name?: string; address?: string; latitude?: number; longitude?: number };
  purpose?: string;
  method?: string;
  packaging?: { sealId?: string; condition?: string; tamperEvident?: boolean };
  notes?: string;
};

export type BuiltCustodyEvent = CustodyEventBase & {
  eventId: string;
  timestamp: Date;
  integrity: { dataHash: string; previousEventHash?: string; eventHash: string; algorithm: string; signature: string };
};

function sortKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, key: string) => {
        acc[key] = sortKeys(obj[key]);
        return acc;
      }, {} as any);
  }
  return obj;
}

function canonicalStringify(obj: any): string {
  return JSON.stringify(sortKeys(obj));
}

export class CustodyUtils {
  private static hashService = new HashService();
  private static config = ConfigManager.getInstance();

  static buildEvent(params: {
    evidenceId: string;
    dataHash: string;
    previousEventHash?: string;
    base: CustodyEventBase;
  }): BuiltCustodyEvent {
    const algorithm = this.config.get<any>('security.custody.hashAlgorithm');
    const signingSecret = this.config.get<any>('security.custody.signingSecret');

    const event: BuiltCustodyEvent = {
      eventId: uuidv4(),
      eventType: params.base.eventType,
      from: params.base.from,
      to: params.base.to,
      location: params.base.location,
      purpose: params.base.purpose,
      method: params.base.method,
      packaging: params.base.packaging,
      notes: params.base.notes,
      timestamp: new Date(),
      integrity: {
        dataHash: params.dataHash,
        previousEventHash: params.previousEventHash,
        eventHash: '',
        algorithm,
        signature: ''
      }
    };

    const material = canonicalStringify({
      evidenceId: params.evidenceId,
      eventId: event.eventId,
      eventType: event.eventType,
      from: event.from,
      to: event.to,
      timestamp: event.timestamp.toISOString(),
      dataHash: event.integrity.dataHash,
      previousEventHash: event.integrity.previousEventHash || ''
    });

    const hash = this.hashService.calculateSHA256(material);
    const signature = this.hashService.generateHMAC(hash, signingSecret, 'sha256');

    event.integrity.eventHash = hash;
    event.integrity.signature = signature;

    return event;
  }

  static verifyChain(evidenceId: string, dataHash: string, events: BuiltCustodyEvent[]): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    let previous: string | undefined = undefined;
    for (const ev of events) {
      // Basic timestamp/order validation is out-of-scope here; we chain by hash
      const material = canonicalStringify({
        evidenceId,
        eventId: ev.eventId,
        eventType: ev.eventType,
        from: ev.from,
        to: ev.to,
        timestamp: new Date(ev.timestamp).toISOString(),
        dataHash,
        previousEventHash: previous || ''
      });
      const expectedHash = this.hashService.calculateSHA256(material);
      if (ev.integrity.eventHash !== expectedHash) {
        issues.push(`Event ${ev.eventId} hash mismatch`);
      }
      const signingSecret = this.config.get<any>('security.custody.signingSecret');
      const expectedSig = this.hashService.generateHMAC(expectedHash, signingSecret, 'sha256');
      if (ev.integrity.signature !== expectedSig) {
        issues.push(`Event ${ev.eventId} signature mismatch`);
      }
      if (ev.integrity.dataHash !== dataHash) {
        issues.push(`Event ${ev.eventId} dataHash mismatch`);
      }
      previous = expectedHash;
    }
    return { valid: issues.length === 0, issues };
  }
}

export default CustodyUtils;

