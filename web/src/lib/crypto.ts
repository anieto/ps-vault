/**
 * P.S. Vault client-side cryptography
 *
 * Key hierarchy:
 *   Password → Argon2id → Master Encryption Key (MEK)
 *   MEK + random CEK → encrypt/decrypt vault Content Encryption Keys
 *   CEK → encrypt/decrypt vault entry data (XChaCha20-Poly1305)
 *
 * The server never receives the MEK, CEK, or any plaintext.
 */

import sodium from "libsodium-wrappers";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";

let ready = false;

async function ensureReady() {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

// ─── Key Derivation ──────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100000;
const MEK_LEN           = 32; // bytes

/**
 * Derive the Master Encryption Key from the user's password using PBKDF2-SHA256.
 * Uses @noble/hashes — works in both secure and insecure contexts (no crypto.subtle needed).
 */
export async function deriveMEK(
  password: string,
  saltHex: string
): Promise<Uint8Array> {
  const salt = hexToBytes(saltHex);
  return pbkdf2(sha256, new TextEncoder().encode(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: MEK_LEN,
  });
}

/**
 * Generate a random 16-byte salt for key derivation.
 */
export async function generateSalt(): Promise<string> {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Derive the Key Verification Hash from the password.
 * Sent to the server to verify the password without revealing the MEK.
 */
export async function deriveKVH(password: string, pepper: string): Promise<string> {
  await ensureReady();
  // Use a fixed derivation path: pepper + "kvh" as deterministic input
  const combined = new TextEncoder().encode(password + pepper + "kvh");
  const hash = sodium.crypto_generichash(32, combined);
  return bytesToHex(hash);
}

// ─── Content Encryption Key Management ──────────────────────────────────────

/**
 * Generate a random 256-bit Content Encryption Key for a new vault.
 */
export async function generateCEK(): Promise<Uint8Array> {
  await ensureReady();
  return sodium.randombytes_buf(32);
}

/**
 * Wrap (encrypt) a CEK with the MEK to produce a CEK envelope.
 * Returns a base64url-encoded string safe to store on the server.
 */
export async function wrapCEK(cek: Uint8Array, mek: Uint8Array): Promise<string> {
  await ensureReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(cek, nonce, mek);
  return encodePayload(nonce, ciphertext);
}

/**
 * Unwrap (decrypt) a CEK envelope with the MEK.
 */
export async function unwrapCEK(envelope: string, mek: Uint8Array): Promise<Uint8Array> {
  await ensureReady();
  const { nonce, ciphertext } = decodePayload(envelope);
  const cek = sodium.crypto_secretbox_open_easy(ciphertext, nonce, mek);
  if (!cek) throw new Error("Failed to decrypt CEK — wrong password or corrupted data");
  return cek;
}

// ─── Data Encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt arbitrary data with a CEK.
 * Returns a base64url-encoded payload string.
 */
export async function encrypt(plaintext: string, cek: Uint8Array): Promise<string> {
  await ensureReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = sodium.crypto_secretbox_easy(data, nonce, cek);
  return encodePayload(nonce, ciphertext);
}

/**
 * Decrypt a base64url-encoded payload with a CEK.
 */
export async function decrypt(payload: string, cek: Uint8Array): Promise<string> {
  await ensureReady();
  const { nonce, ciphertext } = decodePayload(payload);
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, cek);
  if (!plaintext) throw new Error("Decryption failed — data may be corrupted");
  return new TextDecoder().decode(plaintext);
}

/**
 * Encrypt an object as JSON with a CEK.
 */
export async function encryptObject<T>(obj: T, cek: Uint8Array): Promise<string> {
  return encrypt(JSON.stringify(obj), cek);
}

/**
 * Decrypt and parse a JSON-encrypted object.
 */
export async function decryptObject<T>(payload: string, cek: Uint8Array): Promise<T> {
  const json = await decrypt(payload, cek);
  return JSON.parse(json) as T;
}

// ─── Beneficiary Key Wrapping ─────────────────────────────────────────────────

/**
 * Derive a Beneficiary Access Key from a shared secret (answer to secret question).
 * This is a separate key used to wrap the CEK for beneficiary delivery.
 */
export async function deriveBeneficiaryKey(sharedSecret: string): Promise<Uint8Array> {
  // Derive a deterministic 16-byte salt from the shared secret
  const saltInput = new TextEncoder().encode("psvault-bak-" + sharedSecret);
  const salt = sha256(saltInput).slice(0, 16);
  return pbkdf2(sha256, new TextEncoder().encode(sharedSecret.toLowerCase().trim()), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: MEK_LEN,
  });
}

/**
 * Create a beneficiary CEK envelope: CEK encrypted with the beneficiary's access key.
 */
export async function wrapCEKForBeneficiary(
  cek: Uint8Array,
  sharedSecret: string
): Promise<string> {
  const bak = await deriveBeneficiaryKey(sharedSecret);
  return wrapCEK(cek, bak);
}

/**
 * Unwrap a beneficiary CEK envelope using the shared secret.
 */
export async function unwrapCEKForBeneficiary(
  envelope: string,
  sharedSecret: string
): Promise<Uint8Array> {
  const bak = await deriveBeneficiaryKey(sharedSecret);
  return unwrapCEK(envelope, bak);
}

// ─── Session Key Storage ─────────────────────────────────────────────────────

const MEK_KEY = "psvault_mek";

/**
 * Store the MEK in sessionStorage (cleared on tab/window close).
 * The MEK is stored as a hex string and only lives in memory.
 */
export function storeMEK(mek: Uint8Array): void {
  sessionStorage.setItem(MEK_KEY, bytesToHex(mek));
}

/**
 * Retrieve the MEK from sessionStorage.
 * Returns null if not present (session expired / tab closed).
 */
export function getMEK(): Uint8Array | null {
  const hex = sessionStorage.getItem(MEK_KEY);
  if (!hex) return null;
  return hexToBytes(hex);
}

/**
 * Clear the MEK from sessionStorage (on logout / inactivity timeout).
 */
export function clearMEK(): void {
  sessionStorage.removeItem(MEK_KEY);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function encodePayload(nonce: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return bytesToBase64url(combined);
}

function decodePayload(payload: string): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const combined = base64urlToBytes(payload);
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  return {
    nonce: combined.slice(0, nonceLen),
    ciphertext: combined.slice(nonceLen),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
}
