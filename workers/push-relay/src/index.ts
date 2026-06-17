export interface Env {
  // Secrets (wrangler secret put)
  APNS_KEY: string;                 // full .p8 PEM content
  APNS_KEY_ID: string;              // 10-char key ID
  APNS_TEAM_ID: string;             // 10-char team ID
  RELAY_SECRET: string;             // token backend sends in Authorization header
  FCM_SERVICE_ACCOUNT_KEY: string;  // full Google service account JSON
  // Vars (wrangler.jsonc)
  APNS_BUNDLE_ID: string;  // com.psvault.app
  APNS_SANDBOX: string;    // "true" | "false"
}

interface PushRequest {
  token: string;
  platform: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// base64url-encode a plain string (ASCII/binary safe)
function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// base64url-encode an ArrayBuffer
function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return b64url(s);
}

async function buildAPNsJWT(env: Env): Promise<string> {
  // Strip PEM armor and decode DER bytes
  // Strip PEM headers and any non-base64 characters (handles \r\n, spaces, etc.)
  const pem = env.APNS_KEY
    .replace(/-----[^-]+-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }));
  const payload = b64url(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const message = `${header}.${payload}`;

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(message),
  );

  return `${message}.${bufToB64url(sig)}`;
}

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

async function buildFCMAccessToken(sa: ServiceAccountKey): Promise<string> {
  const pem = sa.private_key
    .replace(/-----[^-]+-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const message = `${header}.${payload}`;

  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(message),
  );

  const jwt = `${message}.${bufToB64url(sig)}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    throw new Error(`FCM token exchange failed: ${err}`);
  }

  const tokenData = await tokenResp.json<{ access_token: string }>();
  return tokenData.access_token;
}

async function sendFCM(env: Env, body: PushRequest): Promise<Response> {
  const sa: ServiceAccountKey = JSON.parse(env.FCM_SERVICE_ACCOUNT_KEY);
  const accessToken = await buildFCMAccessToken(sa);

  const fcmPayload = {
    message: {
      token: body.token,
      notification: {
        title: body.title,
        body: body.body,
      },
      data: body.data
        ? Object.fromEntries(
            Object.entries(body.data).map(([k, v]) => [k, String(v)])
          )
        : undefined,
      android: {
        priority: 'high',
      },
    },
  };

  const fcmResp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    },
  );

  if (fcmResp.status === 200) return new Response('OK', { status: 200 });

  // Token no longer valid — caller should delete it
  if (fcmResp.status === 404) return new Response('Token unregistered', { status: 410 });

  const errText = await fcmResp.text();
  return new Response(`FCM error: ${errText}`, { status: 502 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST' || url.pathname !== '/send') {
      return new Response('Not found', { status: 404 });
    }

    // Authenticate the backend
    const auth = request.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${env.RELAY_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body: PushRequest;
    try {
      body = await request.json<PushRequest>();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!body.token || !body.platform || !body.title || !body.body) {
      return new Response('Missing required fields: token, platform, title, body', { status: 400 });
    }

    if (body.platform === 'fcm') {
      return sendFCM(env, body);
    }

    if (body.platform !== 'apns') {
      return new Response(`Unsupported platform: ${body.platform}`, { status: 400 });
    }

    const jwt = await buildAPNsJWT(env);
    const host = env.APNS_SANDBOX === 'true'
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';

    const { aps: _aps, ...safeData } = (body.data ?? {}) as Record<string, unknown>;
    const apnsPayload = {
      aps: {
        alert: { title: body.title, body: body.body },
        sound: 'default',
      },
      ...safeData,
    };

    const apnsResp = await fetch(`https://${host}/3/device/${body.token}`, {
      method: 'POST',
      headers: {
        Authorization: `bearer ${jwt}`,
        'apns-topic': env.APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apnsPayload),
    });

    if (apnsResp.status === 200) {
      console.log(`APNs ok: token=${body.token.slice(-8)}`);
      return new Response('OK', { status: 200 });
    }

    if (apnsResp.status === 410) {
      console.log(`APNs stale token: token=${body.token.slice(-8)}`);
      return new Response('Token unregistered', { status: 410 });
    }

    const errText = await apnsResp.text();
    console.error(`APNs error ${apnsResp.status}: ${errText} token=${body.token.slice(-8)}`);
    return new Response(`APNs error: ${errText}`, { status: 502 });
  },
};
