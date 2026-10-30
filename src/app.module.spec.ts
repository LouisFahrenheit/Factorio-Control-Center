jest.mock('archiver', () => jest.fn());

import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from './app.module';
import { InstanceContextInterceptor } from './api/instance-context.interceptor';
import { PagesController } from './pages/pages.controller';
import { FallbackController } from './pages/fallback.controller';
import { BackupModule } from './backup/backup.module';

interface DynamicModuleLike {
  module?: unknown;
  imports?: unknown[];
  providers?: unknown[];
  controllers?: unknown[];
}

interface ServeStaticEntry {
  serveRoot?: string;
  rootPath?: string;
  serveStaticOptions?: {
    index?: boolean;
    fallthrough?: boolean;
    setHeaders?: (
      res: { setHeader(name: string, value: string): void },
      filePath: string,
    ) => void;
  };
}

interface TypeOrmProvider {
  provide?: unknown;
  useValue?: {
    prepareDatabase?: (db: unknown) => void;
  };
}

describe('AppModule', () => {
  it('should be defined as a NestJS module', () => {
    expect(AppModule).toBeDefined();
  });

  describe('Module metadata', () => {
    it('should register all expected controllers', () => {
      const controllers = Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        AppModule,
      ) as unknown[];

      expect(Array.isArray(controllers)).toBe(true);
      expect(controllers).toContain(PagesController);
      expect(controllers).toContain(FallbackController);
      expect(controllers.length).toBe(16);
    });

    it('should register global InstanceContextInterceptor provider', () => {
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        AppModule,
      ) as Array<{ provide?: unknown; useClass?: unknown }>;

      expect(Array.isArray(providers)).toBe(true);
      const appInterceptor = providers.find(
        (p) =>
          typeof p === 'object' && p !== null && p.provide === APP_INTERCEPTOR,
      );

      expect(appInterceptor).toBeDefined();
      expect(appInterceptor?.useClass).toBe(InstanceContextInterceptor);
    });

    it('should import ConfigModule and BackupModule', async () => {
      const rawImports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        AppModule,
      ) as unknown[];

      expect(Array.isArray(rawImports)).toBe(true);
      expect(rawImports).toContain(BackupModule);

      const resolvedImports = await Promise.all(
        rawImports.map((item) => Promise.resolve(item)),
      );

      const hasConfigModule = resolvedImports.some(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          ((entry as DynamicModuleLike).module === ConfigModule ||
            (entry as { module?: { name?: string } }).module?.name ===
              'ConfigModule'),
      );
      expect(hasConfigModule).toBe(true);
    });
  });

  describe('ServeStaticModule configuration', () => {
    it('should configure site.webmanifest Content-Type in root static serve options', () => {
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        AppModule,
      ) as unknown[];

      const staticModules = imports.filter(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as DynamicModuleLike).module === ServeStaticModule,
      ) as unknown as DynamicModuleLike[];

      expect(staticModules.length).toBeGreaterThan(0);

      // Find root static serve entry (serveRoot: '/')
      let rootSetHeaders:
        | ((
            res: { setHeader(name: string, value: string): void },
            filePath: string,
          ) => void)
        | undefined;

      for (const sm of staticModules) {
        const providers = (sm.providers ?? []) as Array<{
          useValue?: ServeStaticEntry[];
        }>;
        for (const prov of providers) {
          if (Array.isArray(prov.useValue)) {
            for (const cfg of prov.useValue) {
              if (cfg.serveRoot === '/' && cfg.serveStaticOptions?.setHeaders) {
                rootSetHeaders = cfg.serveStaticOptions.setHeaders;
                break;
              }
            }
          }
        }
      }

      expect(rootSetHeaders).toBeDefined();

      if (rootSetHeaders) {
        const mockSetHeader = jest.fn();
        const mockRes = { setHeader: mockSetHeader };

        // Should set manifest content-type for site.webmanifest
        rootSetHeaders(mockRes, '/path/to/site.webmanifest');
        expect(mockSetHeader).toHaveBeenCalledWith(
          'Content-Type',
          'application/manifest+json; charset=UTF-8',
        );

        // Should not set header for other files
        mockSetHeader.mockClear();
        rootSetHeaders(mockRes, '/path/to/favicon.ico');
        expect(mockSetHeader).not.toHaveBeenCalled();
      }
    });
  });

  describe('SQLite pragmas configuration', () => {
    it('should configure WAL mode, busy timeout, and user_version patch', () => {
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        AppModule,
      ) as unknown[];

      const typeOrmModules = imports.filter(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as DynamicModuleLike).module === TypeOrmModule,
      ) as unknown as DynamicModuleLike[];

      expect(typeOrmModules.length).toBeGreaterThan(0);

      let prepareDatabaseFn: ((db: unknown) => void) | undefined;

      for (const tm of typeOrmModules) {
        const nestedImports = (tm.imports ?? []) as DynamicModuleLike[];
        for (const ni of nestedImports) {
          const providers = (ni.providers ?? []) as TypeOrmProvider[];
          for (const p of providers) {
            if (p.useValue?.prepareDatabase) {
              prepareDatabaseFn = p.useValue.prepareDatabase;
              break;
            }
          }
          if (prepareDatabaseFn) break;
        }
        if (prepareDatabaseFn) break;
      }

      expect(prepareDatabaseFn).toBeDefined();

      if (prepareDatabaseFn) {
        // Case 1: user_version is 0 (should update to 1)
        const mockPragma = jest
          .fn()
          .mockImplementation((cmd: string, opts?: { simple?: boolean }) => {
            if (cmd === 'user_version' && opts?.simple) {
              return 0;
            }
            return undefined;
          });

        const mockSqlite = { pragma: mockPragma };
        prepareDatabaseFn(mockSqlite);

        expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
        expect(mockPragma).toHaveBeenCalledWith('busy_timeout = 5000');
        expect(mockPragma).toHaveBeenCalledWith('user_version', {
          simple: true,
        });
        expect(mockPragma).toHaveBeenCalledWith('user_version = 1');

        // Case 2: user_version is already >= 1 (should NOT update)
        mockPragma.mockClear();
        mockPragma.mockImplementation(
          (cmd: string, opts?: { simple?: boolean }) => {
            if (cmd === 'user_version' && opts?.simple) {
              return 1;
            }
            return undefined;
          },
        );

        prepareDatabaseFn(mockSqlite);
        expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
        expect(mockPragma).toHaveBeenCalledWith('busy_timeout = 5000');
        expect(mockPragma).not.toHaveBeenCalledWith('user_version = 1');
      }
    });
  });
});
