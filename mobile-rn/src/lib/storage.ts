/**
 * Secure storage helpers — thin wrappers around expo-secure-store.
 * All sensitive values (server URL, tokens, MEK, crypto session) live here.
 */

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  SERVER_URL: 'psvault_server_url',
  REFRESH_TOKEN: 'psvault_refresh_token',
  MEK: 'psvault_mek',
  MEK_ENVELOPE: 'psvault_mek_envelope',
  MEK_SALT: 'psvault_mek_salt',
  ARGON2_PARAMS: 'psvault_argon2_params',
} as const;

// ─── Server URL ───────────────────────────────────────────────────────────────

export async function getServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  // Normalise: strip trailing slash
  const normalised = url.replace(/\/+$/, '');
  await SecureStore.setItemAsync(KEYS.SERVER_URL, normalised);
}

export async function deleteServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.SERVER_URL);
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
}

export async function deleteRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
}

// ─── MEK (in-memory, but backed to secure store for biometric unlock) ─────────

export async function getMEKHex(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.MEK);
}

export async function setMEKHex(mekHex: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.MEK, mekHex);
}

export async function deleteMEKHex(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.MEK);
}

// ─── Crypto session (needed to re-derive MEK from password on re-auth) ────────

export async function getCryptoSession(): Promise<{
  mekEnvelope: string;
  mekSalt: string;
  argon2Params: string;
} | null> {
  const [mekEnvelope, mekSalt, argon2Params] = await Promise.all([
    SecureStore.getItemAsync(KEYS.MEK_ENVELOPE),
    SecureStore.getItemAsync(KEYS.MEK_SALT),
    SecureStore.getItemAsync(KEYS.ARGON2_PARAMS),
  ]);
  if (!mekEnvelope || !mekSalt || !argon2Params) return null;
  return { mekEnvelope, mekSalt, argon2Params };
}

export async function setCryptoSession(
  mekEnvelope: string,
  mekSalt: string,
  argon2Params: string
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.MEK_ENVELOPE, mekEnvelope),
    SecureStore.setItemAsync(KEYS.MEK_SALT, mekSalt),
    SecureStore.setItemAsync(KEYS.ARGON2_PARAMS, argon2Params),
  ]);
}

// ─── Full clear (on logout or account deletion) ───────────────────────────────

export async function clearAll(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key))
  );
}
