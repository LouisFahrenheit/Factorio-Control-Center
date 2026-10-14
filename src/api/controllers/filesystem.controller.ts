import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { AuthGuard } from '../../auth/auth.guard';
import {
  getPrimaryDockerVolume,
  isDockerContainer,
} from '../../common/docker.util';
import { hasFactorioExecutable } from '../../ops/path-manager';

@ApiTags('FileSystem')
@ApiBearerAuth('bearer')
@Controller('api/fs')
@UseGuards(AuthGuard)
export class FileSystemController {
  @Get('dirs')
  @ApiOperation({ summary: 'Browse host directories for instance setup' })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Directory path to browse',
  })
  @ApiResponse({ status: 200, description: 'Directory contents and metadata' })
  dirs(@Query('path') path?: string): Record<string, unknown> {
    return this.fsBrowse(String(path || ''));
  }

  @Get('path-info')
  @ApiOperation({ summary: 'Inspect host path for Factorio server presence' })
  @ApiQuery({ name: 'path', required: true, description: 'Path to inspect' })
  @ApiResponse({ status: 200, description: 'Path inspection result' })
  pathInfo(@Query('path') path?: string): Record<string, unknown> {
    return this.fsPathInfoImpl(String(path || ''));
  }

  @Post('mkdir')
  @ApiOperation({ summary: 'Create new directory on host' })
  @ApiResponse({ status: 200, description: 'Directory created' })
  mkdir(
    @Body() body: { path?: string; name?: string },
  ): Record<string, unknown> {
    return this.fsMkdirImpl(String(body.path || ''), String(body.name || ''));
  }

  private fsBrowse(raw: string): Record<string, unknown> {
    if (!raw.trim()) {
      if (process.platform === 'win32') {
        const items = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .map((l) => `${l}:\\`)
          .filter((drive) => existsSync(drive))
          .map((drive) => ({ name: drive, path: drive, isDir: true }));
        return { ok: true, current: '', parent: '', items };
      }
      if (isDockerContainer()) {
        const primaryVolume = getPrimaryDockerVolume();
        if (primaryVolume && existsSync(primaryVolume)) {
          return this.fsBrowse(primaryVolume);
        }
      }
      return {
        ok: true,
        current: '',
        parent: '',
        items: [{ name: '/', path: '/', isDir: true }],
      };
    }
    let cur = resolve(raw);
    while (cur && !existsSync(cur)) {
      const p = dirname(cur);
      if (p === cur) break;
      cur = p;
    }
    if (!existsSync(cur)) {
      if (isDockerContainer()) {
        const primaryVolume = getPrimaryDockerVolume();
        if (primaryVolume && existsSync(primaryVolume)) {
          return this.fsBrowse(primaryVolume);
        }
      }
      return { ok: false, error: 'path_not_found' };
    }
    const st = statSync(cur);
    if (!st.isDirectory()) cur = dirname(cur);
    const parent = resolve(cur, '..') === cur ? '' : dirname(cur);
    const items = readdirSync(cur, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, path: join(cur, d.name), isDir: true }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
    return { ok: true, current: cur, parent, items };
  }

  private fsMkdirImpl(baseRaw: string, name: string): Record<string, unknown> {
    if (!name || name === '.' || name === '..') {
      return { ok: false, error: 'folder_name_invalid' };
    }
    if (/[/\\]/.test(name)) return { ok: false, error: 'folder_name_invalid' };
    let base = resolve(baseRaw || '.');
    if (!existsSync(base)) return { ok: false, error: 'path_not_found' };
    if (!statSync(base).isDirectory()) base = dirname(base);
    const created = join(base, name);
    if (existsSync(created)) return { ok: false, error: 'folder_exists' };
    mkdirSync(created);
    return { ok: true, path: created };
  }

  private fsPathInfoImpl(raw: string): Record<string, unknown> {
    const path = String(raw || '').trim();
    if (!path) return { ok: false, error: 'path_required' };
    const full = resolve(path);
    if (!existsSync(full)) {
      return {
        ok: true,
        path: full,
        exists: false,
        is_dir: false,
        is_empty: true,
        is_factorio_server: false,
        has_factorio_executable: false,
      };
    }
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      return { ok: false, error: 'path_invalid' };
    }
    if (!isDir) return { ok: false, error: 'path_invalid' };
    let entries: string[] = [];
    try {
      entries = readdirSync(full);
    } catch {
      return { ok: false, error: 'path_invalid' };
    }
    return {
      ok: true,
      path: full,
      exists: true,
      is_dir: true,
      is_empty: entries.length === 0,
      is_factorio_server: existsSync(join(full, 'data', 'base', 'info.json')),
      has_factorio_executable: hasFactorioExecutable(full),
    };
  }
}
