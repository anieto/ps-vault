# P.S. Vault

**Your final message, safely delivered.**

P.S. Vault is a self-hostable Emergency Release Switch. Create encrypted Vaults containing passwords, accounts, documents, and anything else your loved ones may need. If you stop checking in, your Vaults are automatically delivered to the people you trust.

> P.S. Vault is a personal tool for sharing information with loved ones. It is not a substitute for a legal will or estate plan.

---

## Features

- **Encrypted Vaults** — Store logins, notes, financial info, documents, and more
- **Emergency Release Switch** — Configurable check-in system with escalating reminders
- **Beneficiary Delivery** — Secure, verified portal access for your chosen people
- **Zero-Knowledge Encryption** — Your data is encrypted before it ever leaves your device
- **Self-Hostable** — Runs entirely on your own infrastructure via Docker
- **Multi-User** — Host for your whole family, each with their own independent setup
- **Mobile Friendly** — Responsive web app with mobile apps coming soon

---

## Quick Start

### Requirements
- Docker and Docker Compose
- An SMTP provider (Gmail, Mailgun, Resend, AWS SES, etc.)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/ps-vault.git
cd ps-vault
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your settings — at minimum set:
- `PSVAULT_BASE_URL` — the URL where you'll access P.S. Vault
- `PSVAULT_JWT_SECRET` — a long random string (run `openssl rand -hex 32`)
- `PSVAULT_ENCRYPTION_PEPPER` — another long random string (run `openssl rand -hex 32`)
- SMTP settings so email delivery works

### 3. Start

```bash
docker compose up -d
```

P.S. Vault will be available at `http://localhost:3000` (or your configured `PSVAULT_BASE_URL`).

The first account you register becomes the admin.

---

## Configuration

All configuration is done via environment variables. See [`.env.example`](.env.example) for the full reference with descriptions.

### Reverse Proxy

P.S. Vault is designed to sit behind a reverse proxy for HTTPS. Example configs for Nginx, Caddy, and Traefik are in [`/docker`](/docker).

### Unraid

- Set `PUID` and `PGID` to match your Unraid user (usually `99`/`100`)
- Mount `/config` → `/mnt/user/appdata/psvault/config`
- Mount `/data` → `/mnt/user/appdata/psvault/data`
- A Community Applications template is available in [`/docker/unraid-template.xml`](/docker/unraid-template.xml)

### Storage Backends

| Backend | Config |
|---|---|
| Local (default) | `PSVAULT_STORAGE_BACKEND=local` |
| S3-compatible | `PSVAULT_STORAGE_BACKEND=s3` + S3 vars |
| Google Drive | `PSVAULT_STORAGE_BACKEND=gdrive` + OAuth vars |
| OneDrive | `PSVAULT_STORAGE_BACKEND=onedrive` + OAuth vars |

---

## Updating

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on startup.

---

## Backup & Restore

```bash
# Backup
./docker/scripts/backup.sh

# Restore
./docker/scripts/restore.sh <backup-file>
```

---

## Browser Support

P.S. Vault uses the WebCrypto API for client-side encryption. Supported browsers:
- Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## License

[GNU Affero General Public License v3.0](LICENSE)

If you modify P.S. Vault and run it as a service, you must make your source code available under the same license.
