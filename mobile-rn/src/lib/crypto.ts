/**
 * P.S. Vault client-side cryptography — mobile port of web/src/lib/crypto.ts
 *
 * Key differences from web version:
 *   - Uses react-native-libsodium (serenity-kit) instead of libsodium-wrappers-sumo
 *   - Named imports instead of sodium.* calls (same function signatures)
 *   - ensureReady() calls loadSumoVersion() for Argon2id support
 *   - MEK/session storage delegates to src/lib/storage.ts (expo-secure-store)
 *
 * Cryptographic model: identical to web — zero-knowledge, server never sees
 * plaintext keys or vault contents.
 */

import {
  loadSumoVersion,
  crypto_pwhash,
  crypto_pwhash_ALG_ARGON2ID13,
  crypto_aead_xchacha20poly1305_ietf_encrypt,
  crypto_aead_xchacha20poly1305_ietf_decrypt,
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  crypto_generichash,
  randombytes_buf,
} from 'react-native-libsodium';
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

let initialized = false;

async function ensureReady(): Promise<void> {
  if (!initialized) {
    await loadSumoVersion();
    initialized = true;
  }
}

// ─── Argon2id parameters ──────────────────────────────────────────────────────

export interface Argon2Params {
  memory: number;
  iterations: number;
  parallelism: number;
  key_length: number;
}

const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memory: 65536,
  iterations: 3,
  parallelism: 4,
  key_length: 32,
};

// ─── MEK salt ─────────────────────────────────────────────────────────────────

export async function generateMEKSalt(): Promise<string> {
  await ensureReady();
  return bytesToHex(randombytes_buf(16));
}

// ─── Key derivation (Argon2id) ────────────────────────────────────────────────

export async function deriveKEK(
  password: string,
  mekSaltHex: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS
): Promise<Uint8Array> {
  await ensureReady();
  const salt = hexToBytes(mekSaltHex);
  return crypto_pwhash(
    params.key_length,
    new TextEncoder().encode(password),
    salt,
    params.iterations,
    params.memory * 1024,
    crypto_pwhash_ALG_ARGON2ID13
  );
}

export async function deriveKVH(password: string, pepper: string): Promise<string> {
  await ensureReady();
  const combined = new TextEncoder().encode(password + pepper + 'kvh');
  const hash = crypto_generichash(32, combined, null);
  return bytesToHex(hash);
}

// ─── MEK management ───────────────────────────────────────────────────────────

export async function generateMEK(): Promise<Uint8Array> {
  await ensureReady();
  return randombytes_buf(32);
}

export async function wrapMEK(mek: Uint8Array, kek: Uint8Array): Promise<string> {
  return encryptRaw(mek, kek);
}

export async function unwrapMEK(envelope: string, kek: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(envelope, kek);
}

// ─── Content Encryption Key (CEK) management ─────────────────────────────────

export async function generateCEK(): Promise<Uint8Array> {
  await ensureReady();
  return randombytes_buf(32);
}

export async function wrapCEK(cek: Uint8Array, mek: Uint8Array): Promise<string> {
  return encryptRaw(cek, mek);
}

export async function unwrapCEK(envelope: string, mek: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(envelope, mek);
}

// ─── Data encryption ──────────────────────────────────────────────────────────

export async function encrypt(plaintext: string, cek: Uint8Array): Promise<string> {
  return encryptRaw(new TextEncoder().encode(plaintext), cek);
}

export async function decrypt(payload: string, cek: Uint8Array): Promise<string> {
  const plainbytes = await decryptRaw(payload, cek);
  return new TextDecoder().decode(plainbytes);
}

export async function encryptObject<T>(obj: T, cek: Uint8Array): Promise<string> {
  return encrypt(JSON.stringify(obj), cek);
}

export async function decryptObject<T>(payload: string, cek: Uint8Array): Promise<T> {
  const json = await decrypt(payload, cek);
  return JSON.parse(json) as T;
}

// ─── Beneficiary key wrapping (used in Phase 6 death report / portal flows) ──

export async function deriveBeneficiaryKey(sharedSecret: string): Promise<Uint8Array> {
  await ensureReady();
  const saltInput = crypto_generichash(
    16,
    new TextEncoder().encode('psvault-bak-' + sharedSecret),
    null
  );
  return crypto_pwhash(
    32,
    new TextEncoder().encode(sharedSecret.toLowerCase().trim()),
    saltInput,
    DEFAULT_ARGON2_PARAMS.iterations,
    DEFAULT_ARGON2_PARAMS.memory * 1024,
    crypto_pwhash_ALG_ARGON2ID13
  );
}

export async function wrapCEKForBeneficiary(
  cek: Uint8Array,
  sharedSecret: string
): Promise<string> {
  const bak = await deriveBeneficiaryKey(sharedSecret);
  return wrapCEK(cek, bak);
}

export async function unwrapCEKForBeneficiary(
  envelope: string,
  sharedSecret: string
): Promise<Uint8Array> {
  const bak = await deriveBeneficiaryKey(sharedSecret);
  return unwrapCEK(envelope, bak);
}

// ─── Recovery key (BIP39) ─────────────────────────────────────────────────────

export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function validateRecoveryMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}

export function deriveREKFromMnemonic(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic.trim(), wordlist);
  return entropy.slice(0, 32);
}

export async function wrapMEKWithRecoveryKey(
  mek: Uint8Array,
  mnemonic: string
): Promise<string> {
  const rek = deriveREKFromMnemonic(mnemonic);
  return encryptRaw(mek, rek);
}

export async function unwrapMEKWithRecoveryKey(
  envelope: string,
  mnemonic: string
): Promise<Uint8Array> {
  const rek = deriveREKFromMnemonic(mnemonic);
  return decryptRaw(envelope, rek);
}

// ─── File encryption ──────────────────────────────────────────────────────────

export async function generateFileKey(): Promise<Uint8Array> {
  await ensureReady();
  return randombytes_buf(32);
}

export async function encryptBytes(data: Uint8Array, key: Uint8Array): Promise<string> {
  return encryptRaw(data, key);
}

export async function decryptBytes(payload: string, key: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(payload, key);
}

export async function wrapFileKey(fileKey: Uint8Array, cek: Uint8Array): Promise<string> {
  return encryptRaw(fileKey, cek);
}

export async function unwrapFileKey(wrapped: string, cek: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(wrapped, cek);
}

// ─── Low-level encryption primitives (XChaCha20-Poly1305) ────────────────────

async function encryptRaw(plaintext: Uint8Array, key: Uint8Array): Promise<string> {
  await ensureReady();
  const nonce = randombytes_buf(crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  // react-native-libsodium requires additional_data to be a string (not null).
  // nsec is unused by XChaCha20-Poly1305 and is dropped by the native binding.
  const ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    '',
    null,
    nonce,
    key
  );
  return encodePayload(nonce, ciphertext);
}

async function decryptRaw(payload: string, key: Uint8Array): Promise<Uint8Array> {
  await ensureReady();
  const { nonce, ciphertext } = decodePayload(payload);
  // react-native-libsodium requires additional_data to be a string (not null).
  const plaintext = crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    '',
    nonce,
    key
  );
  if (!plaintext) throw new Error('Decryption failed — wrong key or corrupted data');
  return plaintext;
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function encodePayload(nonce: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return bytesToBase64url(combined);
}

function decodePayload(payload: string): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const combined = base64urlToBytes(payload);
  const nonceLen = crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  return {
    nonce: combined.slice(0, nonceLen),
    ciphertext: combined.slice(nonceLen),
  };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split('').map((c) => c.charCodeAt(0)));
}
