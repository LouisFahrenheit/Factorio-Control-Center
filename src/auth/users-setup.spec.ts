import { UsersService } from './users.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('UsersService - Initial Admin Setup', () => {
  let service: UsersService;
  let mockUserRepo: any;
  let savedUsers: any[];

  beforeEach(() => {
    savedUsers = [];
    mockUserRepo = {
      find: jest.fn().mockImplementation(async () => [...savedUsers]),
      count: jest.fn().mockImplementation(async () => savedUsers.length),
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: savedUsers.length + 1 })),
      save: jest.fn().mockImplementation(async (entity) => {
        savedUsers.push(entity);
        return entity;
      }),
    };
    service = new UsersService(mockUserRepo);
  });

  it('reports hasAnyUser as false when database is empty and no env var provided', async () => {
    delete process.env.FCC_ADMIN_PASSWORD;
    delete process.env.FCC_ADMIN_PASS;
    await service.load();
    expect(await service.hasAnyUser()).toBe(false);
  });

  it('creates initial administrator from env vars if FCC_ADMIN_PASSWORD is set', async () => {
    process.env.FCC_ADMIN_PASSWORD = 'superSecretPassword1';
    process.env.FCC_ADMIN_USER = 'rootadmin';
    await service.load();
    expect(await service.hasAnyUser()).toBe(true);
    const u = await service.findUser('rootadmin');
    expect(u).toBeDefined();
    expect(u?.role).toBe('administrator');

    delete process.env.FCC_ADMIN_PASSWORD;
    delete process.env.FCC_ADMIN_USER;
  });

  it('successfully creates initial admin via createInitialAdmin', async () => {
    delete process.env.FCC_ADMIN_PASSWORD;
    delete process.env.FCC_ADMIN_PASS;
    await service.load();

    const created = await service.createInitialAdmin(
      'masteradmin',
      'securePass123',
    );
    expect(created.username).toBe('masteradmin');
    expect(created.role).toBe('administrator');
    expect(created.enabled).toBe(true);
    expect(await service.hasAnyUser()).toBe(true);

    const found = await service.findUser('masteradmin');
    expect(found).toBeDefined();
  });

  it('rejects createInitialAdmin if users already exist', async () => {
    delete process.env.FCC_ADMIN_PASSWORD;
    await service.load();
    await service.createInitialAdmin('firstadmin', 'securePass123');

    await expect(
      service.createInitialAdmin('secondadmin', 'anotherPass123'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('validates username and password length', async () => {
    delete process.env.FCC_ADMIN_PASSWORD;
    await service.load();

    await expect(
      service.createInitialAdmin('a', 'validPassword'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createInitialAdmin('validAdmin', '12'),
    ).rejects.toThrow(BadRequestException);
  });
});
