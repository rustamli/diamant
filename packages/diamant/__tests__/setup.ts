import { webcrypto } from 'node:crypto';

// Polyfill crypto.randomUUID for Node 18 which doesn't expose it as a global
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}
