import type { Request, Response } from 'express';
import { join } from 'path';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
  };
});

import { existsSync } from 'fs';
import type { PathsService } from '../config/paths.service';
import { PagesController } from './pages.controller';

interface MockResponse {
  redirect: jest.Mock;
  sendFile: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
}

function createMockResponse(): MockResponse & Response {
  const res: Partial<MockResponse & Response> = {};
  res.redirect = jest.fn().mockReturnValue(res);
  res.sendFile = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as MockResponse & Response;
}

function createMockRequest(
  userAgent?: string,
  headers: Record<string, string> = {},
): Request {
  const mergedHeaders: Record<string, string> = { ...headers };
  if (userAgent !== undefined) {
    mergedHeaders['user-agent'] = userAgent;
  }
  return {
    headers: mergedHeaders,
  } as unknown as Request;
}

describe('PagesController', () => {
  let controller: PagesController;
  const mockClientDistDir = '/mock/client/dist';
  const expectedIndexPath = join(mockClientDistDir, 'index.html');
  const mockExistsSync = existsSync as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);

    const mockPathsService = {
      clientDistDir: mockClientDistDir,
    } as unknown as PathsService;

    controller = new PagesController(mockPathsService);
  });

  describe('index', () => {
    it('should serve React SPA on desktop user agent when client build is ready', () => {
      const req = createMockRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      );
      const res = createMockResponse();

      controller.index(req, res);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should redirect mobile user agents to /mobile when desktop override is not provided', () => {
      const mobileAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        'Mozilla/5.0 (iPod touch; iPhone OS 14_0 like Mac OS X)',
        'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0)',
        'Generic Mobile Device',
      ];

      for (const ua of mobileAgents) {
        const req = createMockRequest(ua);
        const res = createMockResponse();

        controller.index(req, res);

        expect(res.redirect).toHaveBeenCalledWith('/mobile');
        expect(res.sendFile).not.toHaveBeenCalled();
      }
    });

    it('should serve React SPA on mobile if desktop override is 1, true, or yes (case-insensitive)', () => {
      const overrides = ['1', 'true', 'yes', 'TRUE', 'Yes'];

      for (const override of overrides) {
        const req = createMockRequest(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        );
        const res = createMockResponse();

        controller.index(req, res, override);

        expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
        expect(res.redirect).not.toHaveBeenCalled();
      }
    });

    it('should redirect to /mobile if desktop override is not one of the allowed values', () => {
      const nonOverrides = ['0', 'false', 'no', 'random'];

      for (const val of nonOverrides) {
        const req = createMockRequest(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        );
        const res = createMockResponse();

        controller.index(req, res, val);

        expect(res.redirect).toHaveBeenCalledWith('/mobile');
        expect(res.sendFile).not.toHaveBeenCalled();
      }
    });

    it('should serve React SPA when user-agent header is missing', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      controller.index(req, res);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should return 503 error when React client is not built', () => {
      mockExistsSync.mockReturnValue(false);

      const req = createMockRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      );
      const res = createMockResponse();

      controller.index(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'client_not_built',
          path: expectedIndexPath,
        }),
      );
      expect(res.sendFile).not.toHaveBeenCalled();
    });
  });

  describe('loginSpa', () => {
    it('should serve React SPA when client is built', () => {
      const res = createMockResponse();
      controller.loginSpa(res);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    });

    it('should return 503 when client is not built', () => {
      mockExistsSync.mockReturnValue(false);
      const res = createMockResponse();

      controller.loginSpa(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'client_not_built' }),
      );
    });
  });

  describe('panelSpa', () => {
    it('should serve React SPA when client is built', () => {
      const res = createMockResponse();
      controller.panelSpa(res);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    });

    it('should return 503 when client is not built', () => {
      mockExistsSync.mockReturnValue(false);
      const res = createMockResponse();

      controller.panelSpa(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'client_not_built' }),
      );
    });
  });

  describe('mobileSpa', () => {
    it('should serve React SPA when client is built', () => {
      const res = createMockResponse();
      controller.mobileSpa(res);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    });

    it('should return 503 when client is not built', () => {
      mockExistsSync.mockReturnValue(false);
      const res = createMockResponse();

      controller.mobileSpa(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'client_not_built' }),
      );
    });
  });
});
