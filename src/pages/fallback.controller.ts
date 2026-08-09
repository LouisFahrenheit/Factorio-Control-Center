import { Controller, Get, Req, Res, Next, NotFoundException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { FccConfigService } from '../config/fcc-config.service';
import { PathsService } from '../config/paths.service';

@Controller()
export class FallbackController {
  constructor(
    private readonly config: FccConfigService,
    private readonly paths: PathsService,
  ) {}

  @Get('*')
  fallback(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    const publicRoute = this.config.webPanel.public_page_route || '/servers';
    const path = req.path;

    const normalize = (p: string) => {
      let val = p.trim().toLowerCase();
      if (!val.startsWith('/')) val = '/' + val;
      if (val.length > 1 && val.endsWith('/')) val = val.slice(0, -1);
      return val;
    };

    if (normalize(path) === normalize(publicRoute)) {
      if (this.config.webPanel.public_page_enabled) {
        const p = join(this.paths.clientDistDir, 'index.html');
        if (existsSync(p)) {
          return res.sendFile(p);
        }
      }
      throw new NotFoundException();
    }

    return next();
  }
}
