export interface Env {
  // Secrets (wrangler secret put)
  APNS_KEY: string;        // full .p8 PEM content
  APNS_KEY_ID: string;     // 10-char key ID
  APNS_TEAM_ID: string;    // 10-char team ID
  RELAY_SECRET: string;    // token backend sends in Authorization header
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
  const pem = env.APNS_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
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

    if (body.platform !== 'apns') {
      return new Response(`Unsupported platform: ${body.platform}`, { status: 400 });
    }

    const jwt = await buildAPNsJWT(env);
    const host = env.APNS_SANDBOX === 'true'
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';

    const apnsPayload = {
      aps: {
        alert: { title: body.title, body: body.body },
        sound: 'default',
      },
      ...(body.data ?? {}),
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
      return new Response('OK', { status: 200 });
    }

    if (apnsResp.status === 410) {
      // Token unregistered — caller should delete it
      return new Response('Token unregistered', { status: 410 });
    }

    const errText = await apnsResp.text();
    return new Response(`APNs error: ${errText}`, { status: 502 });
  },
};
