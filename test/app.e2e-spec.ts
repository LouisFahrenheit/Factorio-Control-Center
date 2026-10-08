import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

import { BackupSchedulerService } from '../src/backup/backup-scheduler.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        if (!res.text.includes('Factorio Control Center')) {
          throw new Error(
            'Expected response to contain "Factorio Control Center"',
          );
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
