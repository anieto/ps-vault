#!/usr/bin/env node
/**
 * P.S. Vault — App Store reviewer account seed script
 *
 * Creates a pre-populated reviewer account with realistic dummy data
 * for App Store review submission.
 *
 * Prerequisites:
 *   cd scripts && npm install
 *
 * Usage:
 *   ADMIN_TOKEN=<bearer_token> BASE_URL=https://your-server.com node seed-reviewer.mjs
 *
 * ADMIN_TOKEN: Copy from browser devtools after logging in as admin (Authorization header value, without "Bearer ")
 * BASE_URL: Your server URL (no trailing slash)
 * REVIEWER_PASSWORD: Optional override (default shown at runtime)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const _sodium = require('libsodium-wrappers-sumo');
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL       = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_TOKEN    = process.env.ADMIN_TOKEN || '';
const REVIEWER_EMAIL = 'reviewer@psvault.app';
const REVIEWER_NAME  = 'App Reviewer';
const REVIEWER_PASS  = process.env.REVIEWER_PASSWORD || 'ReviewerVault2024!';

// ─── Crypto helpers (mirrors web/src/lib/crypto.ts) ───────────────────────

let sodium;

async function initSodium() {
  await _sodium.ready;
  sodium = _sodium;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function bytesToBase64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodePayload(nonce, ciphertext) {
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return bytesToBase64url(combined);
}

function decryptRaw(payload, key) {
  const combined = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  const nonce = combined.slice(0, nonceLen);
  const ciphertext = combined.slice(nonceLen);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, key);
}

function encryptRaw(plaintext, key) {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, key);
  return encodePayload(nonce, ct);
}

function encrypt(plaintext, key) {
  return encryptRaw(new TextEncoder().encode(plaintext), key);
}

function encryptObject(obj, key) {
  return encrypt(JSON.stringify(obj), key);
}

function generateMEKSalt() {
  return bytesToHex(sodium.randombytes_buf(16));
}

function generateMEK() {
  return sodium.randombytes_buf(32);
}

function generateCEK() {
  return sodium.randombytes_buf(32);
}

function deriveKEK(password, mekSaltHex) {
  const salt = hexToBytes(mekSaltHex);
  return sodium.crypto_pwhash(
    32,
    new TextEncoder().encode(password),
    salt,
    3,
    65536 * 1024,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

async function deriveBeneficiaryKey(sharedSecret) {
  const saltInput = sodium.crypto_generichash(
    16,
    new TextEncoder().encode('psvault-bak-' + sharedSecret),
    null
  );
  return sodium.crypto_pwhash(
    32,
    new TextEncoder().encode(sharedSecret.toLowerCase().trim()),
    saltInput,
    3,
    65536 * 1024,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

// ─── API helpers ───────────────────────────────────────────────────────────

async function api(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json', 'X-Client': 'mobile' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.data !== undefined ? json.data : json;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input, output });

function log(msg) { console.log(`\n${msg}`); }
function step(msg) { console.log(`\n  ▶ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ! ${msg}`); }

async function main() {
  log('═══════════════════════════════════════════════');
  log('  P.S. Vault — Reviewer Account Seed Script');
  log('═══════════════════════════════════════════════');
  console.log(`  Server  : ${BASE_URL}`);
  console.log(`  Email   : ${REVIEWER_EMAIL}`);
  console.log(`  Password: ${REVIEWER_PASS}`);

  step('Initializing crypto...');
  await initSodium();
  ok('libsodium ready');

  // ── 1. Create invite code (if registration mode requires it) ─────────────
  let inviteCode = '';

  if (!ADMIN_TOKEN) {
    warn('No ADMIN_TOKEN set — assuming registration mode is "open". If it fails, re-run with ADMIN_TOKEN.');
  } else {
    step('Creating invite code via admin API...');
    try {
      const invite = await api('/admin/invites', 'POST', {}, ADMIN_TOKEN);
      inviteCode = invite.code;
      ok(`Invite code: ${inviteCode}`);
    } catch (e) {
      warn(`Could not create invite (${e.message}) — proceeding without one.`);
    }
  }

  // ── 2. Generate crypto material ──────────────────────────────────────────
  step('Generating E2EE key material...');
  const mekSalt    = generateMEKSalt();
  const mek        = generateMEK();
  const kek        = deriveKEK(REVIEWER_PASS, mekSalt);
  const mekEnvelope = encryptRaw(mek, kek);
  ok(`MEK salt: ${mekSalt.slice(0, 8)}...`);
  ok('KEK derived, MEK wrapped');

  // ── 3. Register account ──────────────────────────────────────────────────
  step('Registering reviewer account...');
  let registerResp;
  try {
    registerResp = await api('/auth/register', 'POST', {
      email:        REVIEWER_EMAIL,
      display_name: REVIEWER_NAME,
      password:     REVIEWER_PASS,
      invite_code:  inviteCode,
      mek_salt:     mekSalt,
      mek_envelope: mekEnvelope,
    });
    ok(`Account created (user ID: ${registerResp.user.id})`);
  } catch (e) {
    if (e.message.includes('email_taken')) {
      warn('Account already exists — attempting login instead...');
    } else {
      throw e;
    }
  }

  // ── 4. Verify email ──────────────────────────────────────────────────────
  if (registerResp) {
    log('─────────────────────────────────────────────────');
    console.log('  Email verification is required before login.');
    console.log('  Run this SQL against your database, then press Enter:\n');
    console.log(`    -- PostgreSQL:`);
    console.log(`    UPDATE users SET email_verified = TRUE, email_verify_token = NULL,`);
    console.log(`      email_verify_expires = NULL WHERE email = '${REVIEWER_EMAIL}';\n`);
    console.log(`    -- SQLite (if using SQLite backend):`);
    console.log(`    UPDATE users SET email_verified = 1, email_verify_token = NULL,`);
    console.log(`      email_verify_expires = NULL WHERE email = '${REVIEWER_EMAIL}';\n`);
    console.log('  Docker example:');
    console.log(`    docker exec -it psvault-db psql -U psvault -c "UPDATE users SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL WHERE email = '${REVIEWER_EMAIL}';"`);
    log('─────────────────────────────────────────────────');
    await rl.question('  Press Enter once email is verified...');
  }

  // ── 5. Login ─────────────────────────────────────────────────────────────
  step('Logging in...');
  const loginResp = await api('/auth/login', 'POST', {
    email:    REVIEWER_EMAIL,
    password: REVIEWER_PASS,
  });
  const token = loginResp.access_token;
  ok(`Logged in (access token obtained)`);

  // Recover the real MEK from the server's stored envelope so vault CEKs
  // are always wrapped with the key the account was originally registered with.
  const realKEK = deriveKEK(REVIEWER_PASS, loginResp.mek_salt);
  const realMEK = decryptRaw(loginResp.mek_envelope, realKEK);
  // Override the ephemeral mek with the real one
  mek.set(realMEK);
  ok(`MEK recovered from server envelope`);

  // ── 6. Clean up any data from previous runs ───────────────────────────────
  step('Cleaning up any existing seed data...');

  const existingVaultsRaw = await api('/vaults', 'GET', null, token);
  const existingVaults = Array.isArray(existingVaultsRaw) ? existingVaultsRaw : (existingVaultsRaw?.vaults ?? []);
  for (const v of existingVaults) {
    if (v.name === 'Family Records' || v.name === 'Personal Archive') {
      await api(`/vaults/${v.id}`, 'DELETE', null, token);
      ok(`Deleted existing vault: ${v.name}`);
    }
  }

  const existingBensRaw = await api('/beneficiaries', 'GET', null, token);
  const existingBens = Array.isArray(existingBensRaw) ? existingBensRaw : (existingBensRaw?.beneficiaries ?? []);
  for (const b of existingBens) {
    if (b.email === 'sarah.reviewer.test@example.com' || b.email === 'michael.reviewer.test@example.com') {
      await api(`/beneficiaries/${b.id}`, 'DELETE', null, token);
      ok(`Deleted existing beneficiary: ${b.name}`);
    }
  }

  const existingContactsRaw = await api('/trusted-contacts', 'GET', null, token);
  const existingContacts = Array.isArray(existingContactsRaw) ? existingContactsRaw : (existingContactsRaw?.contacts ?? []);
  for (const c of existingContacts) {
    if (c.email === 'dr.wells.trusted@example.com') {
      await api(`/trusted-contacts/${c.id}`, 'DELETE', null, token);
      ok(`Deleted existing trusted contact: ${c.name}`);
    }
  }

  // ── 7. Create vaults ─────────────────────────────────────────────────────
  step('Creating vaults...');

  const cek1    = generateCEK();
  const cek1Env = encryptRaw(cek1, mek);
  const vault1  = await api('/vaults', 'POST', {
    name:               'Family Records',
    description:        'Important documents for the whole family',
    icon:               '🏠',
    color:              '#6366f1',
    cek_envelope:       cek1Env,
    delivery_message_enc: encrypt(
      'If you are reading this, please know I love you all. Inside this vault you will find everything you need to take care of things going forward. Please reach out to our attorney if you have any questions.',
      cek1
    ),
  }, token);
  ok(`Vault 1: "${vault1.name}" (${vault1.id})`);

  const cek2    = generateCEK();
  const cek2Env = encryptRaw(cek2, mek);
  const vault2  = await api('/vaults', 'POST', {
    name:         'Personal Archive',
    description:  'Personal accounts and identity documents',
    icon:         '📋',
    color:        '#10b981',
    cek_envelope: cek2Env,
  }, token);
  ok(`Vault 2: "${vault2.name}" (${vault2.id})`);

  // ── 8. Enable Emergency Switch on both vaults ────────────────────────────
  step('Enabling Emergency Switch on vaults...');
  await api(`/vaults/${vault1.id}`, 'PATCH', { switch_enabled: true }, token);
  await api(`/vaults/${vault2.id}`, 'PATCH', { switch_enabled: true }, token);
  ok('Both vaults linked to Emergency Switch');

  // ── 8. Create entries ────────────────────────────────────────────────────
  step('Creating entries in Vault 1 (Family Records)...');

  await api(`/vaults/${vault1.id}/entries`, 'POST', {
    entry_type:     'login',
    title:          'Online Banking',
    encrypted_data: encryptObject({
      title: 'Online Banking',
      fields: [
        { label: 'Website',  value: 'https://firstnational.example.com', sensitive: false },
        { label: 'Username', value: 'john.reviewer@email.com',           sensitive: false },
        { label: 'Password', value: 'Secure$ank9821!',                   sensitive: true  },
      ],
      notes:      'Primary checking and savings. Safe deposit box #2847.',
      is_favorite: true,
    }, cek1),
  }, token);
  ok('Entry: Online Banking');

  await api(`/vaults/${vault1.id}/entries`, 'POST', {
    entry_type:     'note',
    title:          'Emergency Instructions',
    encrypted_data: encryptObject({
      title: 'Emergency Instructions',
      fields: [
        { label: 'Attorney',      value: 'James Mitchell — (555) 234-5678', sensitive: false },
        { label: 'Accountant',    value: 'Diane Cho — (555) 876-5432',      sensitive: false },
        { label: 'Safe Location', value: 'Master bedroom closet, top shelf', sensitive: false },
        { label: 'Safe Code',     value: '48-21-07',                        sensitive: true  },
      ],
      notes: 'Will is filed with Mitchell & Associates. Life insurance policy number: LF-88827461.',
      is_favorite: false,
    }, cek1),
  }, token);
  ok('Entry: Emergency Instructions');

  await api(`/vaults/${vault1.id}/entries`, 'POST', {
    entry_type:     'card',
    title:          'Visa Credit Card',
    encrypted_data: encryptObject({
      title: 'Visa Credit Card',
      fields: [
        { label: 'Card Number', value: '4111 1111 1111 1111', sensitive: true  },
        { label: 'Cardholder',  value: 'John Reviewer',       sensitive: false },
        { label: 'Expiry',      value: '12/27',               sensitive: false },
        { label: 'CVV',         value: '123',                 sensitive: true  },
        { label: 'PIN',         value: '7842',                sensitive: true  },
      ],
      notes: 'Primary rewards card. Contact issuer to report loss.',
      is_favorite: false,
    }, cek1),
  }, token);
  ok('Entry: Visa Credit Card');

  step('Creating entries in Vault 2 (Personal Archive)...');

  await api(`/vaults/${vault2.id}/entries`, 'POST', {
    entry_type:     'login',
    title:          'Email Account',
    encrypted_data: encryptObject({
      title: 'Email Account',
      fields: [
        { label: 'Provider',  value: 'Gmail',                          sensitive: false },
        { label: 'Email',     value: 'john.reviewer@gmail.com',        sensitive: false },
        { label: 'Password',  value: 'GmailPass#2024',                 sensitive: true  },
        { label: 'Recovery',  value: 'backup@email.com',               sensitive: false },
      ],
      notes: 'Two-factor backup codes are in the safe.',
      is_favorite: true,
    }, cek2),
  }, token);
  ok('Entry: Email Account');

  await api(`/vaults/${vault2.id}/entries`, 'POST', {
    entry_type:     'identity',
    title:          'Passport',
    encrypted_data: encryptObject({
      title: 'Passport',
      fields: [
        { label: 'Full Name',   value: 'John A. Reviewer',  sensitive: false },
        { label: 'Passport No', value: 'P12345678',         sensitive: true  },
        { label: 'Issued',      value: '2020-03-15',        sensitive: false },
        { label: 'Expires',     value: '2030-03-14',        sensitive: false },
        { label: 'Country',     value: 'United States',     sensitive: false },
      ],
      notes: 'Stored in the fireproof box in the home office.',
      is_favorite: false,
    }, cek2),
  }, token);
  ok('Entry: Passport');

  await api(`/vaults/${vault2.id}/entries`, 'POST', {
    entry_type:     'financial',
    title:          'Investment Account',
    encrypted_data: encryptObject({
      title: 'Investment Account',
      fields: [
        { label: 'Broker',    value: 'Fidelity Investments',      sensitive: false },
        { label: 'Account #', value: 'X83-291847',                sensitive: true  },
        { label: 'Username',  value: 'jreviewer_fidelity',        sensitive: false },
        { label: 'Password',  value: 'Fid3lity$2024!',            sensitive: true  },
      ],
      notes: 'Rollover IRA and taxable brokerage. Contact Fidelity at 800-343-3548.',
      is_favorite: false,
    }, cek2),
  }, token);
  ok('Entry: Investment Account');

  // ── 9. Create beneficiaries ───────────────────────────────────────────────
  step('Creating beneficiaries...');

  const ben1 = await api('/beneficiaries', 'POST', {
    name:                'Sarah Reviewer',
    email:               'sarah.reviewer.test@example.com',
    phone:               '+15550100',
    relationship:        'Spouse',
    verification_method: 'secret',
    secret_question:     'What is the name of the street you grew up on?',
  }, token);
  ok(`Beneficiary 1: ${ben1.name} (${ben1.id})`);

  const ben2 = await api('/beneficiaries', 'POST', {
    name:                'Michael Reviewer',
    email:               'michael.reviewer.test@example.com',
    phone:               '+15550101',
    relationship:        'Child',
    verification_method: 'otp',
  }, token);
  ok(`Beneficiary 2: ${ben2.name} (${ben2.id})`);

  // ── 10. Assign beneficiaries to vaults ────────────────────────────────────
  step('Assigning beneficiaries to vaults...');

  const bak1 = await deriveBeneficiaryKey('sarah-reviewer-access-2024');
  const bak2 = await deriveBeneficiaryKey('michael-reviewer-access-2024');

  // Sarah → Vault 1 (tier 1)
  await api(`/vaults/${vault1.id}/beneficiaries`, 'POST', {
    beneficiary_id:           ben1.id,
    beneficiary_cek_envelope: encryptRaw(cek1, bak1),
  }, token);
  await api(`/vaults/${vault1.id}/beneficiaries/${ben1.id}/tier`, 'PATCH', { tier: 'primary' }, token);
  ok(`Sarah assigned to Vault 1 (primary)`);

  // Sarah → Vault 2 (primary)
  await api(`/vaults/${vault2.id}/beneficiaries`, 'POST', {
    beneficiary_id:           ben1.id,
    beneficiary_cek_envelope: encryptRaw(cek2, bak1),
  }, token);
  await api(`/vaults/${vault2.id}/beneficiaries/${ben1.id}/tier`, 'PATCH', { tier: 'primary' }, token);
  ok(`Sarah assigned to Vault 2 (primary)`);

  // Michael → Vault 1 (secondary)
  await api(`/vaults/${vault1.id}/beneficiaries`, 'POST', {
    beneficiary_id:           ben2.id,
    beneficiary_cek_envelope: encryptRaw(cek1, bak2),
  }, token);
  await api(`/vaults/${vault1.id}/beneficiaries/${ben2.id}/tier`, 'PATCH', { tier: 'secondary' }, token);
  ok(`Michael assigned to Vault 1 (secondary)`);

  // ── 11. Add a trusted contact ─────────────────────────────────────────────
  step('Creating trusted contact...');
  await api('/trusted-contacts', 'POST', {
    name:                 'Dr. Patricia Wells',
    email:                'dr.wells.trusted@example.com',
    phone:                '+15550200',
    notify_on_final_warning: true,
    can_abort:            true,
    can_verify_life:      false,
    can_corroborate_death: false,
  }, token);
  ok('Trusted contact: Dr. Patricia Wells');

  // ── 12. Configure Emergency Switch ───────────────────────────────────────
  step('Configuring Emergency Switch (inactive, 30-day interval)...');
  await api('/switch', 'PATCH', {
    check_in_interval_days:       30,
    reminder1_days_before:        3,
    reminder2_hours_before:       24,
    final_warning_hours_before:   2,
    abort_window_hours:           12,
    death_report_response_hours:  24,
    max_pause_days:               180,
  }, token);
  ok('Emergency Switch configured (inactive — safe for review)');

  // ── Done ──────────────────────────────────────────────────────────────────
  log('═══════════════════════════════════════════════');
  log('  Reviewer account seeded successfully!');
  log('═══════════════════════════════════════════════');
  console.log('');
  console.log('  App Store Connect Review Notes:');
  console.log('  ───────────────────────────────');
  console.log(`  Test Account Email   : ${REVIEWER_EMAIL}`);
  console.log(`  Test Account Password: ${REVIEWER_PASS}`);
  console.log('');
  console.log('  This account includes:');
  console.log('  • 2 vaults (Family Records, Personal Archive)');
  console.log('  • 6 entries across both vaults (login, note, card, identity, financial)');
  console.log('  • 2 beneficiaries (Sarah Reviewer — spouse, Michael Reviewer — child)');
  console.log('  • 1 trusted contact (Dr. Patricia Wells)');
  console.log('  • Emergency Switch configured but inactive (will not trigger)');
  console.log('  • MFA is not enabled on this account');
  console.log('');
  console.log('  The app connects to: ' + BASE_URL);
  console.log('  All vault data is end-to-end encrypted.');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('\n  ERROR:', err.message);
  process.exit(1);
});
