import { Injectable } from '@nestjs/common';
import * as net from 'net';

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;

@Injectable()
export class RconService {
  async run(
    host: string,
    port: number,
    password: string,
    command: string,
    timeoutMs = 20000,
    forceSlashPrefix = true,
  ): Promise<string> {
    let cmd = String(command || '').trim();
    if (!cmd) return '';
    if (forceSlashPrefix && !cmd.startsWith('/')) cmd = '/' + cmd;

    const h = String(host || '127.0.0.1').trim() || '127.0.0.1';
    const p = Number(port);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      throw new Error('rcon_invalid_port');
    }

    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      let buf = Buffer.alloc(0);
      let settled = false;
      let authed = false;
      const authId = 1;
      const cmdId = 2;
      let responseText = '';

      const finish = (err: Error | null, text = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        if (err) {
          if (
            (cmd === '/quit' || cmd === 'quit') &&
            err.message === 'rcon_connection_closed'
          ) {
            resolve('');
            return;
          }
          reject(err);
        } else {
          resolve(text);
        }
      };

      const timer = setTimeout(
        () => finish(new Error('rcon_timeout')),
        timeoutMs,
      );

      const send = (reqId: number, type: number, body: string) => {
        const payload = Buffer.from(body, 'utf-8');
        const packet = Buffer.alloc(12 + payload.length + 2);
        const size = 4 + 4 + payload.length + 2;
        packet.writeInt32LE(size, 0);
        packet.writeInt32LE(reqId, 4);
        packet.writeInt32LE(type, 8);
        payload.copy(packet, 12);
        packet.writeInt16LE(0, 12 + payload.length);
        sock.write(packet);
      };

      const drain = () => {
        while (buf.length >= 4) {
          const size = buf.readInt32LE(0);
          if (size < 10) {
            finish(new Error('rcon_bad_packet'));
            return;
          }
          const total = 4 + size;
          if (buf.length < total) return;

          const body = buf.subarray(4, total);
          buf = buf.subarray(total);

          const reqId = body.readInt32LE(0);
          const type = body.readInt32LE(4);
          const text = body.subarray(8, body.length - 2).toString('utf-8');

          if (!authed) {
            if (reqId === -1) {
              finish(new Error('rcon_auth_failed'));
              return;
            }
            if (type === SERVERDATA_AUTH_RESPONSE && reqId === authId) {
              authed = true;
              send(cmdId, SERVERDATA_EXECCOMMAND, cmd);
            }
            continue;
          }

          if (type === SERVERDATA_RESPONSE_VALUE && reqId === cmdId) {
            if (text.length === 0) {
              finish(null, responseText);
              return;
            }
            responseText += text;
            finish(null, responseText);
            return;
          }
        }
      };

      sock.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        drain();
      });

      sock.on('error', (e: Error) => {
        if (cmd === '/quit' || cmd === 'quit') finish(null, '');
        else finish(e);
      });

      sock.on('close', () => {
        if (cmd === '/quit' || cmd === 'quit') finish(null, responseText);
      });

      sock.connect(p, h, () => {
        send(authId, SERVERDATA_AUTH, password);
      });
    });
  }
}
