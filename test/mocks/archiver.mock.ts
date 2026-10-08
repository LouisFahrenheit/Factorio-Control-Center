import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

export interface ArchiverMockInstance extends EventEmitter {
  pipe(stream: fs.WriteStream): this;
  file(sourcePath: string, data: { name: string }): this;
  directory(sourceDir: string, destPrefix: string): this;
  append(content: string | Buffer, data: { name: string }): this;
  finalize(): Promise<void>;
}

export function createMockArchiver(): ArchiverMockInstance {
  const emitter = new EventEmitter() as ArchiverMockInstance;
  const zip = new AdmZip();
  let targetStream: fs.WriteStream | null = null;

  emitter.pipe = (stream: fs.WriteStream) => {
    targetStream = stream;
    return emitter;
  };

  emitter.file = (sourcePath: string, data: { name: string }) => {
    zip.addLocalFile(
      sourcePath,
      path.dirname(data.name),
      path.basename(data.name),
    );
    return emitter;
  };

  emitter.directory = (sourceDir: string, destPrefix: string) => {
    zip.addLocalFolder(sourceDir, destPrefix);
    return emitter;
  };

  emitter.append = (content: string | Buffer, data: { name: string }) => {
    zip.addFile(
      data.name,
      Buffer.isBuffer(content) ? content : Buffer.from(content),
    );
    return emitter;
  };

  emitter.finalize = () => {
    const buffer = zip.toBuffer();
    if (targetStream) {
      targetStream.write(buffer);
      targetStream.end();
    }
    return Promise.resolve();
  };

  return emitter;
}

const archiverFn = (
  _format = 'zip',
  _options?: Record<string, unknown>,
): ArchiverMockInstance => {
  return createMockArchiver();
};

const mockModule = Object.assign(archiverFn, {
  default: archiverFn,
  create: archiverFn,
  createMockArchiver,
  ZipArchive: class {
    constructor(_options?: Record<string, unknown>) {
      return createMockArchiver();
    }
  },
});

export default mockModule;
module.exports = mockModule;
