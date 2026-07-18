import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { PathsService } from '../config/paths.service';

@Controller()
export class PagesController {
  private readonly clientDistDir: string;

  constructor(paths: PathsService) {
    this.clientDistDir = paths.clientDistDir;
  }

  @Get('/')
  index(
    @Req() req: Request,
    @Res() res: Response,
    @Query('desktop') desktop?: string,
  ) {
    const force = String(desktop || '').toLowerCase();
    if (!['1', 'true', 'yes'].includes(force) && this.looksMobile(req)) {
      return res.redirect('/mobile');
    }
    return this.serveReactSpa(res);
  }

  @Get('login')
  loginSpa(@Res() res: Response) {
    return this.serveReactSpa(res);
  }

  @Get(['panel', 'panel/*path'])
  panelSpa(@Res() res: Response) {
    return this.serveReactSpa(res);
  }

  @Get(['mobile', 'mobile/*path'])
  mobileSpa(@Res() res: Response) {
    return this.serveReactSpa(res);
  }

  private reactBuildReady(): boolean {
    return existsSync(join(this.clientDistDir, 'index.html'));
  }

  private serveReactSpa(res: Response) {
    const p = join(this.clientDistDir, 'index.html');
    if (!this.reactBuildReady()) {
      return res.status(503).json({
        error: 'client_not_built',
        message:
          'Run npm run client:build (or npm run build:all) in factorio-control-center',
        path: p,
      });
    }
    return res.sendFile(p);
  }

  private looksMobile(req: Request): boolean {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    return [
      'android',
      'iphone',
      'ipad',
      'ipod',
      'mobile',
      'windows phone',
    ].some((m) => ua.includes(m));
  }
}
