/**
 * P.S. Vault client-side cryptography — v0.2.0
 *
 * Key hierarchy:
 *   random mek_salt (server-generated, returned on login/register)
 *   + User Password
 *   → Argon2id (libsodium crypto_pwhash) → KEK (Key Encryption Key)
 *
 *   random MEK (generated at registration)
 *   → XChaCha20-Poly1305(MEK, KEK) → mek_envelope (stored on server in users table)
 *
 *   On login: unwrap mek_envelope with KEK → MEK
 *
 *   random CEK (per vault)
 *   → XChaCha20-Poly1305(CEK, MEK) → cek_envelope (stored on server in vaults table)
 *
 *   vault entry data
 *   → XChaCha20-Poly1305(plaintext, CEK) → encrypted_data
 *
 *   Recovery key (optional):
 *   24-word BIP39 mnemonic → 32-byte REK
 *   → XChaCha20-Poly1305(MEK, REK) → recovery_key_envelope (stored on server)
 *
 * The server never receives the MEK, KEK, REK, CEK, or any plaintext.
 * Password changes only require re-wrapping the MEK (CEK envelopes are unchanged).
 */

import sodium from "libsodium-wrappers-sumo";
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

let ready = false;

async function ensureReady() {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

// ─── Argon2id parameters ─────────────────────────────────────────────────────

export interface Argon2Params {
  memory: number;      // kibibytes
  iterations: number;
  parallelism: number;
  key_length: number;
}

// Defaults matching the server's defaultArgon2ParamsJSON()
const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memory: 65536,
  iterations: 3,
  parallelism: 4,
  key_length: 32,
};

// ─── MEK Salt ────────────────────────────────────────────────────────────────

/**
 * Generate a random 16-byte salt for Argon2id KEK derivation.
 * Called client-side at registration and sent to the server.
 */
export async function generateMEKSalt(): Promise<string> {
  await ensureReady();
  return bytesToHex(sodium.randombytes_buf(16));
}

// ─── Key Derivation (Argon2id) ───────────────────────────────────────────────

/**
 * Derive the Key Encryption Key (KEK) from the user's password using Argon2id.
 * The KEK is used to wrap/unwrap the MEK. It never leaves the client.
 */
export async function deriveKEK(
  password: string,
  mekSaltHex: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS
): Promise<Uint8Array> {
  await ensureReady();
  const salt = hexToBytes(mekSaltHex);
  return sodium.crypto_pwhash(
    params.key_length,
    new TextEncoder().encode(password),
    salt,
    params.iterations,
    params.memory * 1024, // libsodium expects bytes
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

/**
 * Derive the Key Verification Hash from the user's password.
 * Sent to the server on registration/login to verify the password
 * without revealing the KEK or MEK.
 */
export async function deriveKVH(password: string, pepper: string): Promise<string> {
  await ensureReady();
  const combined = new TextEncoder().encode(password + pepper + "kvh");
  const hash = sodium.crypto_generichash(32, combined);
  return bytesToHex(hash);
}

// ─── MEK Management ─────────────────────────────────────────────────────────

/**
 * Generate a random 256-bit Master Encryption Key.
 * Called once at registration. The MEK never changes.
 */
export async function generateMEK(): Promise<Uint8Array> {
  await ensureReady();
  return sodium.randombytes_buf(32);
}

/**
 * Wrap (encrypt) the MEK with the KEK → mek_envelope.
 * Stored on the server; returned on every login.
 */
export async function wrapMEK(mek: Uint8Array, kek: Uint8Array): Promise<string> {
  return encryptRaw(mek, kek);
}

/**
 * Unwrap (decrypt) the mek_envelope with the KEK to recover the MEK.
 */
export async function unwrapMEK(envelope: string, kek: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(envelope, kek);
}

// ─── Content Encryption Key (CEK) Management ────────────────────────────────

/**
 * Generate a random 256-bit Content Encryption Key for a new vault.
 */
export async function generateCEK(): Promise<Uint8Array> {
  await ensureReady();
  return sodium.randombytes_buf(32);
}

/**
 * Wrap a CEK with the MEK → cek_envelope (stored on vault row).
 */
export async function wrapCEK(cek: Uint8Array, mek: Uint8Array): Promise<string> {
  return encryptRaw(cek, mek);
}

/**
 * Unwrap a cek_envelope with the MEK to recover the CEK.
 */
export async function unwrapCEK(envelope: string, mek: Uint8Array): Promise<Uint8Array> {
  return decryptRaw(envelope, mek);
}

// ─── Data Encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string with a CEK (XChaCha20-Poly1305).
 * Returns a base64url-encoded payload safe for storage.
 */
export async function encrypt(plaintext: string, cek: Uint8Array): Promise<string> {
  return encryptRaw(new TextEncoder().encode(plaintext), cek);
}

/**
 * Decrypt a base64url-encoded payload with a CEK.
 */
export async function decrypt(payload: string, cek: Uint8Array): Promise<string> {
  const plainbytes = await decryptRaw(payload, cek);
  return new TextDecoder().decode(plainbytes);
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
 * Derive a Beneficiary Access Key (BAK) from a shared secret using Argon2id.
 * Produces a stable key from the shared secret that wraps the vault CEK.
 */
export async function deriveBeneficiaryKey(sharedSecret: string): Promise<Uint8Array> {
  await ensureReady();
  // Deterministic salt from the shared secret so derivation is always reproducible
  const saltInput = sodium.crypto_generichash(16, new TextEncoder().encode("psvault-bak-" + sharedSecret));
  return sodium.crypto_pwhash(
    32,
    new TextEncoder().encode(sharedSecret.toLowerCase().trim()),
    saltInput,
    DEFAULT_ARGON2_PARAMS.iterations,
    DEFAULT_ARGON2_PARAMS.memory * 1024,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
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

// ─── Recovery Key (BIP39) ────────────────────────────────────────────────────

/**
 * Generate a new 24-word BIP39 mnemonic recovery key.
 * Returns the mnemonic string; the user must write this down.
 */
export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, 256); // 256 bits → 24 words
}

/**
 * Validate a BIP39 mnemonic.
 */
export function validateRecoveryMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}

/**
 * Derive a 32-byte Recovery Encryption Key (REK) from a BIP39 mnemonic.
 * Uses the raw entropy bytes from the mnemonic as the key directly.
 */
export function deriveREKFromMnemonic(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic.trim(), wordlist);
  return entropy.slice(0, 32); // 256-bit mnemonic → 32 bytes of entropy
}

/**
 * Wrap the MEK with the REK → recovery_key_envelope.
 * Stored on the server. Used to recover MEK access when password is forgotten.
 */
export async function wrapMEKWithRecoveryKey(
  mek: Uint8Array,
  mnemonic: string
): Promise<string> {
  const rek = deriveREKFromMnemonic(mnemonic);
  return encryptRaw(mek, rek);
}

/**
 * Unwrap a recovery_key_envelope using the BIP39 mnemonic to recover the MEK.
 */
export async function unwrapMEKWithRecoveryKey(
  envelope: string,
  mnemonic: string
): Promise<Uint8Array> {
  const rek = deriveREKFromMnemonic(mnemonic);
  return decryptRaw(envelope, rek);
}

// ─── Session Key Storage ─────────────────────────────────────────────────────

const MEK_KEY = "psvault_mek";
const MEK_ENVELOPE_KEY = "psvault_mek_envelope";
const MEK_SALT_KEY = "psvault_mek_salt";
const ARGON2_PARAMS_KEY = "psvault_argon2_params";

export function storeMEK(mek: Uint8Array): void {
  sessionStorage.setItem(MEK_KEY, bytesToHex(mek));
}

export function getMEK(): Uint8Array | null {
  const hex = sessionStorage.getItem(MEK_KEY);
  if (!hex) return null;
  return hexToBytes(hex);
}

export function clearMEK(): void {
  sessionStorage.removeItem(MEK_KEY);
}

/** Store the encrypted MEK envelope so it can be re-unwrapped on re-auth without a server round-trip. */
export function storeCryptoSession(mekEnvelope: string, mekSalt: string, argon2Params: string): void {
  sessionStorage.setItem(MEK_ENVELOPE_KEY, mekEnvelope);
  sessionStorage.setItem(MEK_SALT_KEY, mekSalt);
  sessionStorage.setItem(ARGON2_PARAMS_KEY, argon2Params);
}

export function getCryptoSession(): { mekEnvelope: string; mekSalt: string; argon2Params: string } | null {
  const mekEnvelope = sessionStorage.getItem(MEK_ENVELOPE_KEY);
  const mekSalt = sessionStorage.getItem(MEK_SALT_KEY);
  const argon2Params = sessionStorage.getItem(ARGON2_PARAMS_KEY);
  if (!mekEnvelope || !mekSalt || !argon2Params) return null;
  return { mekEnvelope, mekSalt, argon2Params };
}

export function clearCryptoSession(): void {
  sessionStorage.removeItem(MEK_KEY);
  sessionStorage.removeItem(MEK_ENVELOPE_KEY);
  sessionStorage.removeItem(MEK_SALT_KEY);
  sessionStorage.removeItem(ARGON2_PARAMS_KEY);
}

// ─── Low-level encryption primitives (XChaCha20-Poly1305) ───────────────────

/**
 * Encrypt raw bytes with a 32-byte key using XChaCha20-Poly1305.
 * Returns base64url(nonce || ciphertext).
 */
async function encryptRaw(plaintext: Uint8Array, key: Uint8Array): Promise<string> {
  await ensureReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,   // no additional data
    null,   // no secret nonce
    nonce,
    key
  );
  return encodePayload(nonce, ciphertext);
}

/**
 * Decrypt a base64url(nonce || ciphertext) payload with a 32-byte key.
 */
async function decryptRaw(payload: string, key: Uint8Array): Promise<Uint8Array> {
  await ensureReady();
  const { nonce, ciphertext } = decodePayload(payload);
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,   // no secret nonce
    ciphertext,
    null,   // no additional data
    nonce,
    key
  );
  if (!plaintext) throw new Error("Decryption failed — wrong key or corrupted data");
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
  const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  return {
    nonce: combined.slice(0, nonceLen),
    ciphertext: combined.slice(nonceLen),
  };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
