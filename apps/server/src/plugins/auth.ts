import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: TelegramUser;
  }
}

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600
): { valid: boolean; user?: TelegramUser; reason?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
      return { valid: false, reason: 'Tampered or invalid hash' };
    }

    params.delete('hash');
    const sortedEntries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sortedEntries.map(([k, v]) => `${k}=${v}`).join('\n');

    // S2a: secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const bufCalculated = Buffer.from(calculatedHash, 'hex');
    const bufGiven = Buffer.from(hash, 'hex');

    if (bufCalculated.length !== bufGiven.length || !crypto.timingSafeEqual(bufCalculated, bufGiven)) {
      return { valid: false, reason: 'Tampered or invalid hash' };
    }

    // S2b: auth_date not older than 3600 s
    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, reason: 'Missing auth_date' };
    }
    const authDate = parseInt(authDateStr, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > maxAgeSeconds) {
      return { valid: false, reason: 'Init data expired (>3600s)' };
    }

    // Parse user object
    const userStr = params.get('user');
    if (!userStr) {
      return { valid: false, reason: 'Missing user payload' };
    }
    const user = JSON.parse(userStr) as TelegramUser;

    return { valid: true, user };
  } catch (err) {
    return { valid: false, reason: `Validation error: ${err}` };
  }
}

export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Only /api/* routes require TMA authorization (Rule S1)
  if (!request.url.startsWith('/api/')) {
    return;
  }

  // GET /api/health is public (Rule S1)
  if (request.url === '/api/health' || request.url.startsWith('/api/health?')) {
    return;
  }

  let authHeader = request.headers.authorization;
  if (!authHeader && request.query && typeof (request.query as Record<string, unknown>).auth === 'string') {
    const queryAuth = (request.query as Record<string, string>).auth.trim();
    if (queryAuth) {
      authHeader = queryAuth.startsWith('tma ') ? queryAuth : `tma ${queryAuth}`;
    }
  }

  // Rule S3: DEV_AUTH_BYPASS only in non-production
  if (config.DEV_AUTH_BYPASS && config.NODE_ENV !== 'production') {
    if (!authHeader || authHeader === 'tma dev' || authHeader === 'tma dev_bypass') {
      request.user = {
        id: config.ownerIdsList[0] || 123456789,
        first_name: 'OwnerDev',
        username: 'ceo_virtual',
      };
      return;
    }
  }

  if (!authHeader || !authHeader.startsWith('tma ')) {
    // Cloudflare Zero Trust (Access) web authentication
    const cfEmail = request.headers['cf-access-authenticated-user-email'];
    if (cfEmail && typeof cfEmail === 'string' && cfEmail.trim().length > 0) {
      const email = cfEmail.trim().toLowerCase();
      const isAllowedEmail =
        config.ownerEmailsList.length === 0 || config.ownerEmailsList.includes(email);
      if (isAllowedEmail) {
        request.user = {
          id: config.ownerIdsList[0] || 5549476959,
          first_name: email.split('@')[0],
          username: email.split('@')[0],
        };
        return;
      }
      reply.code(403).send({ error: 'forbidden', message: 'Email is not an authorized office owner' });
      return;
    }

    reply.code(401).send({ error: 'unauthorized', message: 'Missing Authorization: tma <initData> header' });
    return;
  }

  const initData = authHeader.substring(4).trim();
  const result = validateInitData(initData, config.TELEGRAM_BOT_TOKEN);

  if (!result.valid || !result.user) {
    reply.code(401).send({ error: 'unauthorized', message: result.reason || 'Invalid Telegram credentials' });
    return;
  }

  // S2c: user.id must be in OWNER_TELEGRAM_IDS
  if (!config.ownerIdsList.includes(result.user.id)) {
    reply.code(403).send({ error: 'forbidden', message: 'User is not an authorized office owner' });
    return;
  }

  request.user = result.user;
}
