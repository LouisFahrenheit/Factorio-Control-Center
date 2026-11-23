import { cleanupE2eEnv } from './e2e-env';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BackupSchedulerService } from '../src/backup/backup-scheduler.service';
import { APP_VERSION } from '../src/constants/fcc.constants';

describe('Factorio Control Center (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BackupSchedulerService)
      .useValue({
        onModuleInit: () => Promise.resolve(),
        onModuleDestroy: () => {},
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    cleanupE2eEnv();
  });

  describe('Static & SPA Routes', () => {
    it('GET / serves either built SPA or client_not_built status', async () => {
      const res = await request(app.getHttpServer()).get('/');
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.text).toContain('Factorio Control Center');
      } else {
        const body = res.body as Record<string, unknown>;
        expect(body.error).toBe('client_not_built');
      }
    });

    it('GET /login serves SPA or 503', async () => {
      const res = await request(app.getHttpServer()).get('/login');
      expect([200, 503]).toContain(res.status);
    });
  });

  describe('Public API Endpoints', () => {
    it('GET /api/health returns system runtime health and version', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.version).toBe(APP_VERSION);
      expect(typeof body.host_os).toBe('string');
      expect(typeof body.is_docker).toBe('boolean');
      expect(Array.isArray(body.docker_volumes)).toBe(true);
    });

    it('GET /api/locale-bootstrap returns localization strings and theme config', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/locale-bootstrap')
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(typeof body.lang).toBe('string');
      expect(typeof body.theme).toBe('string');
      expect(typeof body.needs_setup).toBe('boolean');
      expect(Array.isArray(body.available_languages)).toBe(true);
      expect(typeof body.strings).toBe('object');
    });

    it('GET /api/auth/setup-status returns wizard status without credentials', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/setup-status')
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.needsSetup).toBe(true);
    });

    it('GET /api/public-servers handles public servers endpoint cleanly', async () => {
      const res = await request(app.getHttpServer()).get('/api/public-servers');
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        const body = res.body as Record<string, unknown>;
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.items)).toBe(true);
      }
    });
  });

  describe('Authentication & Guard Protection', () => {
    it('GET /api/status returns 401 Unauthorized without bearer token', async () => {
      await request(app.getHttpServer()).get('/api/status').expect(401);
    });

    it('GET /api/auth/me returns 401 Unauthorized without bearer token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/config/server returns 401 Unauthorized without bearer token', async () => {
      await request(app.getHttpServer()).get('/api/config/server').expect(401);
    });

    it('GET /api/config/program returns 401 Unauthorized without bearer token', async () => {
      await request(app.getHttpServer()).get('/api/config/program').expect(401);
    });

    it('POST /api/auth/login returns { ok: false, error: "invalid_credentials" } for bad credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: 'non_existent_user_xyz',
          password: 'wrong_password_123',
        });

      expect([200, 201]).toContain(res.status);
      const body = res.body as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_credentials');
    });
  });

  describe('Setup Wizard, Session Auth & RBAC Flow', () => {
    it('completes initial admin setup, enforces DTO validation and AdminGuard, and revokes session on logout', async () => {
      // 1. ValidationPipe rejects short password (< 8 chars)
      await request(app.getHttpServer())
        .post('/api/auth/setup-admin')
        .send({ username: 'rootadmin', password: 'short' })
        .expect(400);

      // 2. Create initial administrator on fresh SQLite DB
      const setupRes = await request(app.getHttpServer())
        .post('/api/auth/setup-admin')
        .send({ username: 'rootadmin', password: 'StrongPassword123!' });
      expect([200, 201]).toContain(setupRes.status);

      const setupBody = setupRes.body as {
        ok: boolean;
        token: string;
        user: { username: string; role: string };
      };
      expect(setupBody.ok).toBe(true);
      expect(typeof setupBody.token).toBe('string');
      expect(setupBody.user.role).toBe('administrator');

      const adminToken = setupBody.token;

      // Setup wizard is now locked against re-initialization
      const statusAfter = await request(app.getHttpServer())
        .get('/api/auth/setup-status')
        .expect(200);
      expect((statusAfter.body as { needsSetup: boolean }).needsSetup).toBe(
        false,
      );

      const secondSetup = await request(app.getHttpServer())
        .post('/api/auth/setup-admin')
        .send({ username: 'attacker', password: 'StrongPassword123!' });
      expect((secondSetup.body as { ok: boolean }).ok).toBe(false);

      // 3. Admin accesses protected endpoints and creates a moderator account
      const meAdmin = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (meAdmin.body as { user: { username: string } }).user.username,
      ).toBe('rootadmin');

      const instancesRes = await request(app.getHttpServer())
        .get('/api/instances')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((instancesRes.body as { ok: boolean }).ok).toBe(true);

      const createMod = await request(app.getHttpServer())
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'moduser',
          password: 'ModeratorPassword123!',
          role: 'moderator',
          enabled: true,
          tabs: ['control', 'players'],
          instance_ids: ['*'],
        });
      expect([200, 201]).toContain(createMod.status);
      expect((createMod.body as { ok: boolean }).ok).toBe(true);

      // 4. Moderator logs in: allowed on /api/auth/me, blocked by AdminGuard on /api/auth/users
      const modLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'moduser', password: 'ModeratorPassword123!' });
      expect([200, 201]).toContain(modLogin.status);

      const modToken = (modLogin.body as { token: string }).token;
      expect(typeof modToken).toBe('string');

      const meMod = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${modToken}`)
        .expect(200);
      expect((meMod.body as { user: { role: string } }).user.role).toBe(
        'moderator',
      );

      await request(app.getHttpServer())
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${modToken}`)
        .expect(403);

      // 5. Logout revokes session token immediately
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${modToken}`)
        .expect((r) => expect([200, 201]).toContain(r.status));

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${modToken}`)
        .expect(403);
    });
  });
});
