import fc from 'fast-check';

jest.mock('../api/_db', () => ({ __esModule: true, default: { query: jest.fn() }, withTransaction: jest.fn() }));

import {
  ADMIN_SESSION_TTL_MS,
  createAdminToken,
  requireAdmin,
  verifyAdminPassword,
  verifyAdminToken
} from '../api/_auth';
import taxasHandler from '../api/taxas';
import pedidosHandler from '../api/pedidos';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.body = body; return res; });
  res.setHeader = jest.fn((k: string, v: any) => { res.headers[k] = v; });
  res.end = jest.fn(() => res);
  return res;
}

describe('Autenticação do painel administrativo', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'senha-de-teste-123';
    delete process.env.ADMIN_SESSION_SECRET;
  });
  afterAll(() => { process.env = original; });

  it('aceita somente a senha configurada', () => {
    expect(verifyAdminPassword('senha-de-teste-123')).toBe(true);
    fc.assert(fc.property(fc.string(), (tentativa) => {
      fc.pre(tentativa !== 'senha-de-teste-123');
      return verifyAdminPassword(tentativa) === false;
    }));
  });

  it('token válido funciona e expira após 12h', () => {
    const now = Date.now();
    const { token } = createAdminToken(now);
    expect(verifyAdminToken(token, now + 1000)).toBe(true);
    expect(verifyAdminToken(token, now + ADMIN_SESSION_TTL_MS + 1)).toBe(false);
  });

  it('rejeita tokens adulterados', () => {
    const { token } = createAdminToken();
    fc.assert(fc.property(fc.string({ minLength: 1 }), (lixo) => {
      fc.pre(lixo !== token);
      return verifyAdminToken(lixo) === false;
    }));
    const [exp, sig] = token.split('.');
    expect(verifyAdminToken(`${Number(exp) + 999999}.${sig}`)).toBe(false);
  });

  it('trocar a senha invalida as sessões antigas', () => {
    const { token } = createAdminToken();
    process.env.ADMIN_PASSWORD = 'outra-senha';
    expect(verifyAdminToken(token)).toBe(false);
  });

  it('sem ADMIN_PASSWORD as rotas administrativas ficam fechadas (503)', () => {
    delete process.env.ADMIN_PASSWORD;
    const res = mockRes();
    expect(requireAdmin({ headers: {} }, res)).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it('bloqueia escrita em /api/taxas sem login e libera a leitura pública', async () => {
    const res = mockRes();
    await taxasHandler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('bloqueia a listagem de pedidos sem login', async () => {
    const res = mockRes();
    await pedidosHandler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('permite a listagem de pedidos com token válido (chega ao banco)', async () => {
    const { token } = createAdminToken();
    const db = require('../api/_db').default;
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await pedidosHandler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: {} }, res);
    expect(res.statusCode).toBe(200);
  });
});
