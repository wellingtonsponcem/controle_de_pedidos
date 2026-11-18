import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Autenticação do painel administrativo.
 *
 * - A senha fica SOMENTE na variável de ambiente ADMIN_PASSWORD (Vercel → Settings → Environment Variables).
 * - O login devolve um token assinado (HMAC-SHA256) com validade de 12h.
 * - Trocar ADMIN_PASSWORD (ou ADMIN_SESSION_SECRET) invalida todas as sessões abertas.
 * - Sem ADMIN_PASSWORD configurada, as rotas administrativas ficam FECHADAS (fail closed).
 */

export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || '';
}

function getSessionSecret() {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit) return explicit;
  const password = getAdminPassword();
  return password ? createHash('sha256').update(`bemavi-admin-session:${password}`).digest('hex') : '';
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isAdminAuthConfigured() {
  return Boolean(getAdminPassword());
}

export function verifyAdminPassword(candidate: unknown) {
  const password = getAdminPassword();
  if (!password || typeof candidate !== 'string' || !candidate) return false;
  return safeEqual(candidate, password);
}

export function createAdminToken(now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('ADMIN_PASSWORD não configurada.');
  const exp = String(now + ADMIN_SESSION_TTL_MS);
  return { token: `${exp}.${sign(exp, secret)}`, expiresAt: Number(exp) };
}

export function verifyAdminToken(token: unknown, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string') return false;
  const [exp, signature] = token.split('.');
  if (!exp || !signature || !/^\d+$/.test(exp)) return false;
  if (Number(exp) <= now) return false;
  return safeEqual(signature, sign(exp, secret));
}

function extractBearer(req: any) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match ? match[1].trim() : '';
}

export function isAdminRequest(req: any) {
  return verifyAdminToken(extractBearer(req));
}

/**
 * Garante que a requisição veio do painel administrativo autenticado.
 * Retorna true se pode seguir; caso contrário já respondeu 401/503.
 */
export function requireAdmin(req: any, res: any) {
  if (!isAdminAuthConfigured()) {
    res.status(503).json({ error: 'Acesso administrativo desativado: configure ADMIN_PASSWORD na Vercel.' });
    return false;
  }
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Sessão administrativa ausente ou expirada. Faça login novamente.' });
    return false;
  }
  return true;
}

/** Aceita o token do Vercel Cron (CRON_SECRET) ou uma sessão de administrador. */
export function requireCronOrAdmin(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && safeEqual(extractBearer(req), cronSecret)) return true;
  return requireAdmin(req, res);
}
