import { NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
  };
});

import { existsSync } from 'fs';
import type { FccConfigService } from '../config/fcc-config.service';
import type { PathsService } from '../config/paths.service';
import { FallbackController } from './fallback.controller';

interface MockResponse {
  sendFile: jest.Mock;
}

function createMockResponse(): MockResponse & Response {
  const res: Partial<MockResponse & Response> = {};
  res.sendFile = jest.fn().mockReturnValue(res);
  return res as MockResponse & Response;
}

function createMockRequest(path: string): Request {
  return {
    path,
  } as unknown as Request;
}

describe('FallbackController', () => {
  let controller: FallbackController;
  const mockClientDistDir = '/mock/client/dist';
  const expectedIndexPath = join(mockClientDistDir, 'index.html');
  const mockExistsSync = existsSync as unknown as jest.Mock;

  let mockConfig: {
    webPanel: {
      public_page_route?: string;
      public_page_enabled?: boolean;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);

    mockConfig = {
      webPanel: {
        public_page_route: '/servers',
        public_page_enabled: true,
      },
    };

    const mockPathsService = {
      clientDistDir: mockClientDistDir,
    } as unknown as PathsService;

    controller = new FallbackController(
      mockConfig as unknown as FccConfigService,
      mockPathsService,
    );
  });

  it('should serve index.html when path matches public route and public page is enabled', () => {
    const req = createMockRequest('/servers');
    const res = createMockResponse();
    const next = jest.fn() as unknown as NextFunction;

    controller.fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when path matches public route but public page is disabled', () => {
    mockConfig.webPanel.public_page_enabled = false;

    const req = createMockRequest('/servers');
    const res = createMockResponse();
    const next = jest.fn() as unknown as NextFunction;

    expect(() => controller.fallback(req, res, next)).toThrow(
      NotFoundException,
    );
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when public page is enabled but index.html does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const req = createMockRequest('/servers');
    const res = createMockResponse();
    const next = jest.fn() as unknown as NextFunction;

    expect(() => controller.fallback(req, res, next)).toThrow(
      NotFoundException,
    );
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() for non-matching routes', () => {
    const nonMatchingRoutes = [
      '/api/v1/servers',
      '/login',
      '/panel',
      '/other-page',
    ];

    for (const route of nonMatchingRoutes) {
      const req = createMockRequest(route);
      const res = createMockResponse();
      const next = jest.fn() as unknown as NextFunction;

      controller.fallback(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.sendFile).not.toHaveBeenCalled();
    }
  });

  it('should normalize paths with trailing slash or mixed casing', () => {
    const variations = ['/servers/', '/SERVERS', ' /servers ', '/SERVERS/'];

    for (const path of variations) {
      const req = createMockRequest(path);
      const res = createMockResponse();
      const next = jest.fn() as unknown as NextFunction;

      controller.fallback(req, res, next);

      expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('should fallback to default /servers when public_page_route is empty or undefined', () => {
    mockConfig.webPanel.public_page_route = '';

    const req1 = createMockRequest('/servers');
    const res1 = createMockResponse();
    const next1 = jest.fn() as unknown as NextFunction;

    controller.fallback(req1, res1, next1);
    expect(res1.sendFile).toHaveBeenCalledWith(expectedIndexPath);

    delete mockConfig.webPanel.public_page_route;
    const req2 = createMockRequest('/servers');
    const res2 = createMockResponse();
    const next2 = jest.fn() as unknown as NextFunction;

    controller.fallback(req2, res2, next2);
    expect(res2.sendFile).toHaveBeenCalledWith(expectedIndexPath);
  });

  it('should handle custom public_page_route and req.path without leading slash', () => {
    mockConfig.webPanel.public_page_route = 'public-list/';

    const req = createMockRequest('public-list');
    const res = createMockResponse();
    const next = jest.fn() as unknown as NextFunction;

    controller.fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle root path correctly without removing slash', () => {
    mockConfig.webPanel.public_page_route = '/';

    const req = createMockRequest('/');
    const res = createMockResponse();
    const next = jest.fn() as unknown as NextFunction;

    controller.fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(expectedIndexPath);
    expect(next).not.toHaveBeenCalled();
  });
});
