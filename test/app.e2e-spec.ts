import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
      expect(typeof body.needsSetup).toBe('boolean');
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
});
