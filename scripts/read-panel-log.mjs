#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: read-panel-log.mjs <log-file>');
  process.exit(1);
}
if (!existsSync(path)) {
  console.error(`File not found: ${path}`);
  process.exit(1);
}
process.stdout.write(readFileSync(path, 'utf8'));
