# P.S. Vault

**Your final message, safely delivered.**

P.S. Vault is a self-hostable dead man's switch. Create encrypted vaults containing passwords, accounts, documents, and anything else your loved ones may need. If you stop checking in, your vaults are automatically delivered to the people you trust.

> P.S. Vault is a personal tool for sharing information with loved ones. It is not a substitute for a legal will or estate plan.

P.S. Vault was built as a personal project for my own use. After running it privately for a while, I decided to release it publicly in case others find it useful. It's fully functional and actively used on my own self-hosted setup.

---

## Privacy First

P.S. Vault is built on a zero-knowledge encryption model — **your data is encrypted on your device before it is ever sent to the server.** The server stores only ciphertext. Even the person running the server cannot read your vault contents.

- No cloud accounts required — you host it yourself
- No telemetry, no analytics, no third-party services
- All encryption happens in your browser using the WebCrypto API
- Files are encrypted client-side before upload
- The server never sees your password, your keys, or your vault contents

---

## How Encryption Works

P.S. Vault uses a layered key hierarchy to ensure zero-knowledge storage:

```
Your Password
  └─ Argon2id key derivation → Master Encryption Key (MEK)
       └─ Never leaves your device

Per vault:
  └─ Random 256-bit Content Encryption Key (CEK)
       └─ CEK encrypted with your MEK → stored on server
       └─ Vault entries encrypted with CEK via XChaCha20-Poly1305

Per beneficiary:
  └─ Beneficiary Access Key derived from shared secret via Argon2id
       └─ CEK encrypted with Beneficiary Access Key → stored on server
       └─ On delivery: beneficiary enters shared secret → derives key → reads vault
```

**What the server stores:** encrypted ciphertext, encrypted key envelopes, and metadata (vault names, timestamps).

**What the server never has:** your Master Encryption Key, any Content Encryption Keys in plaintext, your password, or any vault entry content.

When you change your password, all key envelopes are re-encrypted client-side in a single atomic operation — your vault contents are never re-encrypted or touched by the server.

### Encryption Primitives

| Purpose | Algorithm |
|---|---|
| Key derivation | Argon2id |
| Content encryption | XChaCha20-Poly1305 |
| Key size | 256-bit |

---

## Features

### Vaults
- 9 entry types: Logins, Secure Notes, Files, Contacts, Financial Accounts, Credit/Debit Cards, Identity Documents, Crypto Wallets, Custom
- Emoji icons, color labels, draft/archived status
- Version history (last 10 versions per entry, viewable and restorable)
- Tags and favorites
- Export vault as an encrypted archive
- Preview as Beneficiary mode: see exactly what your beneficiary will see before trigger
- Import from 1Password, Bitwarden, LastPass, KeePass, CSV

### Dead Man's Switch
- Configurable check-in interval (1–365 days)
- Escalating reminders: 3-level notification sequence before trigger
- Multiple check-in methods: email link, web login
- Pause with optional resume date
- Abort window after trigger fires — check in during the window to cancel delivery
- Server downtime grace: if the server was offline and comes back up, affected timers are reset and users are notified rather than triggered

### Beneficiaries
- Named beneficiaries with email verification
- Access key verification — vault contents are end-to-end encrypted with a key only the beneficiary knows; wrong key = decryption fails
- Optional hint question shown on the portal to help the beneficiary recall the access key
- Per-vault beneficiary assignments
- Secure, time-limited beneficiary portal — no account required

### Security
- TOTP multi-factor authentication (Google Authenticator, Authy, 1Password, etc.)
- 8 single-use backup codes
- Recovery key: 24-word BIP39 mnemonic that can restore your MEK if you forget your password
- Session management: view and revoke active sessions
- Configurable web inactivity timeout (clears encryption keys from memory)
- Account lockout after repeated failed login attempts
- All sensitive operations are audit logged

### Self-Hosting
- Single `docker-compose.yml` — PostgreSQL included
- All configuration via environment variables
- PUID/PGID support for Unraid and NAS deployments
- Unraid Community Applications template included
- Backup and restore scripts included
- Migrations run automatically on startup

### Admin Panel
- User management (disable, force logout, delete, promote)
- System configuration: registration mode, file size limits, downtime grace threshold
- SMTP configuration with override support and test button
- Storage backend configuration and connection test
- Branding: app name override, accent color
- Invite code management for invite-only registration
- Email queue: view pending/sent/failed, retry failed emails
- Audit log: filterable, paginated, exportable CSV

---

## Quick Start

### Requirements

- Docker and Docker Compose
- An SMTP provider (Gmail, Mailgun, Resend, AWS SES, etc.)

### 1. Clone the repository

```bash
git clone https://github.com/anieto/ps-vault.git
cd ps-vault
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set:

| Variable | Description |
|---|---|
| `PSVAULT_BASE_URL` | URL where P.S. Vault will be accessed |
| `PSVAULT_JWT_SECRET` | Long random string — `openssl rand -hex 32` |
| `PSVAULT_ENCRYPTION_PEPPER` | Long random string — `openssl rand -hex 32` |
| `PSVAULT_SMTP_HOST` | SMTP server hostname |
| `PSVAULT_SMTP_PORT` | SMTP port (587 for STARTTLS, 465 for TLS) |
| `PSVAULT_SMTP_USER` | SMTP username |
| `PSVAULT_SMTP_PASS` | SMTP password |
| `PSVAULT_SMTP_FROM` | From address for outgoing emails |

### 3. Start

```bash
docker compose up -d
```

P.S. Vault will be available at `http://localhost:3000` (or your configured `PSVAULT_BASE_URL`).

The first account you register becomes the admin.

---

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example) for the full reference.

### Reverse Proxy

P.S. Vault is designed to run behind a reverse proxy for HTTPS. Example configurations for Nginx Proxy Manager, Caddy, and Traefik are in [`/docker`](/docker).

### Unraid

- Set `PUID` and `PGID` to match your Unraid user (typically `99`/`100`)
- Mount `/config` → `/mnt/user/appdata/psvault/config`
- Mount `/data` → `/mnt/user/appdata/psvault/data`
- Community Applications template: [`/docker/unraid-template.xml`](/docker/unraid-template.xml)

### Storage Backends

| Backend | Variable |
|---|---|
| Local disk (default) | `PSVAULT_STORAGE_BACKEND=local` |
| S3-compatible (AWS S3, MinIO, Backblaze B2, Cloudflare R2) | `PSVAULT_STORAGE_BACKEND=s3` + S3 vars |

All storage backends store encrypted blobs only — file contents are encrypted client-side before upload.

---

## Updating

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup.

---

## Backup & Restore

```bash
# Backup (outputs a timestamped .tar.gz archive)
./docker/backup.sh [output_dir]

# Restore
./docker/restore.sh <backup_file.tar.gz>
```

The backup script captures the PostgreSQL database and file storage. Backups older than 30 days are pruned automatically. Both scripts support local `psql`/`pg_dump` or fall back to the Docker container automatically.

---

## Browser Support

P.S. Vault requires the [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) for client-side encryption.

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Internet Explorer is not supported.

---

## Security

If you discover a security vulnerability, please open a private advisory rather than a public issue.

A few deployment recommendations:

- Always run behind HTTPS — never expose P.S. Vault over plain HTTP
- Back up your database and `PSVAULT_ENCRYPTION_PEPPER` securely — losing the pepper makes recovery impossible
- Set `PSVAULT_REGISTRATION_MODE=invite` or `closed` if this is a private instance
- Enable TOTP MFA on your account and encourage all users to do the same

### Emergency Admin Recovery

If you are locked out of the admin account:

```bash
docker exec psvault-api ./ps-vault-api reset-admin --email admin@example.com
```

This resets admin credentials without touching any vault data.

---

## License

[GNU Affero General Public License v3.0](LICENSE)

If you modify P.S. Vault and run it as a service, you must make your modified source code available under the same license.
