import { storage } from '@/utils/storage';

const OFFLINE_CREDENTIALS_KEY = 'api_offline_credentials_v1';
const DEFAULT_PBKDF2_ITERATIONS = 120_000;

type OfflineCredentialEntry = {
  email: string;
  salt: string;
  hash: string;
  hashes?: string[];
  iterations: number;
  updatedAt: number;
};

type OfflineCredentialsStore = Record<string, OfflineCredentialEntry>;

export function normalizeCredentialEmail(email: string): string {
  // Normaliza unicode y elimina cualquier whitespace (incluido NBSP)
  // para evitar fallos por caracteres invisibles al pegar emails.
  return email.normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  const outBytes = new Uint8Array(out);
  const inBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  outBytes.set(inBytes);
  return out;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    // Fallback para entornos donde SubtleCrypto no este disponible (algunas WebViews).
    // No pretende ser criptografia fuerte, solo un respaldo determinista local.
    const encoder = new TextEncoder();
    const seedInput = encoder.encode(`${password}|${bytesToBase64(salt)}|${iterations}`);
    let a = 0x9e3779b9;
    let b = 0x85ebca6b;
    let c = 0xc2b2ae35;
    let d = 0x27d4eb2f;

    const rounds = Math.max(4096, Math.floor(iterations / 32));
    for (let r = 0; r < rounds; r += 1) {
      for (let i = 0; i < seedInput.length; i += 1) {
        const x = seedInput[i] + ((r + i) & 0xff);
        a = (a ^ x) + ((b << 5) | (b >>> 27));
        b = (b ^ a) + ((c << 7) | (c >>> 25));
        c = (c ^ b) + ((d << 9) | (d >>> 23));
        d = (d ^ c) + ((a << 13) | (a >>> 19));
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
      }
    }

    const out = new Uint8Array(32);
    let x = (a ^ c) >>> 0;
    let y = (b ^ d) >>> 0;
    for (let i = 0; i < 32; i += 1) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      y = (y + 0x9e3779b9 + i) >>> 0;
      out[i] = (x ^ y) & 0xff;
    }
    return out;
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function readStore(): Promise<OfflineCredentialsStore> {
  try {
    const raw = await storage.getItem(OFFLINE_CREDENTIALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as OfflineCredentialsStore;
  } catch {
    return {};
  }
}

async function writeStore(next: OfflineCredentialsStore): Promise<void> {
  await storage.setItem(OFFLINE_CREDENTIALS_KEY, JSON.stringify(next));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

export async function saveOfflineCredential(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeCredentialEmail(email);
  if (!normalizedEmail || !password) return;

  const salt = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    for (let i = 0; i < salt.length; i += 1) {
      salt[i] = Math.floor(Math.random() * 256);
    }
  }
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const hashBytes = await derivePasswordHash(password, salt, iterations);
  const hashes = [bytesToBase64(hashBytes)];
  const trimmedPassword = password.trim();
  if (trimmedPassword && trimmedPassword !== password) {
    const trimmedHashBytes = await derivePasswordHash(trimmedPassword, salt, iterations);
    const trimmedHash = bytesToBase64(trimmedHashBytes);
    if (!hashes.includes(trimmedHash)) {
      hashes.push(trimmedHash);
    }
  }

  const store = await readStore();
  store[normalizedEmail] = {
    email: normalizedEmail,
    salt: bytesToBase64(salt),
    hash: hashes[0],
    hashes,
    iterations,
    updatedAt: Date.now(),
  };

  await writeStore(store);
}

export async function hasOfflineCredential(email: string): Promise<boolean> {
  const normalizedEmail = normalizeCredentialEmail(email);
  if (!normalizedEmail) return false;
  const store = await readStore();
  return Boolean(store[normalizedEmail]);
}

export async function verifyOfflineCredential(email: string, password: string): Promise<boolean> {
  const normalizedEmail = normalizeCredentialEmail(email);
  if (!normalizedEmail || !password) return false;

  const store = await readStore();
  const record = store[normalizedEmail];
  if (!record) return false;

  try {
    const saltBytes = base64ToBytes(record.salt);
    const hashBytes = await derivePasswordHash(password, saltBytes, record.iterations || DEFAULT_PBKDF2_ITERATIONS);
    const candidateHash = bytesToBase64(hashBytes);
    const recordHashes = Array.isArray(record.hashes) && record.hashes.length > 0 ? record.hashes : [record.hash];
    if (recordHashes.some((entryHash) => constantTimeEqual(candidateHash, entryHash))) {
      return true;
    }

    const trimmedPassword = password.trim();
    if (trimmedPassword && trimmedPassword !== password) {
      const trimmedHashBytes = await derivePasswordHash(
        trimmedPassword,
        saltBytes,
        record.iterations || DEFAULT_PBKDF2_ITERATIONS
      );
      const trimmedCandidateHash = bytesToBase64(trimmedHashBytes);
      if (recordHashes.some((entryHash) => constantTimeEqual(trimmedCandidateHash, entryHash))) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
