import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const cachePath = path.join(__dirname, '..', 'data', 'update-cache.json');

async function checkUpdate() {
  let currentVersion = '?';
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    currentVersion = pkg.version;
  } catch (e) {
    console.log(`v?`);
    return;
  }

  try {
    if (fs.existsSync(cachePath)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        // 4 hours cache (14400000 ms)
        if (Date.now() - cache.timestamp < 14400000) {
          if (cache.hasUpdate && cache.latestVersion !== currentVersion) {
            console.log(`v${currentVersion} (Update available: v${cache.latestVersion})`);
          } else {
            console.log(`v${currentVersion}`);
          }
          return;
        }
      } catch (e) {}
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    let repoPath = 'LouisFahrenheit/Factorio-Control-Center';
    if (pkg.repository && pkg.repository.url) {
        const match = pkg.repository.url.match(/github\.com\/([^\/]+\/[^\.]+)\.git/);
        if (match) repoPath = match[1];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://api.github.com/repos/${repoPath}/releases/latest`, {
      headers: { 'User-Agent': 'Factorio-Control-Center-Update-Check' },
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!res.ok) {
        console.log(`v${currentVersion}`);
        return;
    }
    
    const data = await res.json();
    let latestVersion = data.tag_name;
    if (latestVersion && latestVersion.startsWith('v')) {
      latestVersion = latestVersion.slice(1);
    }

    let hasUpdate = false;
    if (latestVersion && latestVersion !== currentVersion) {
        const currentParts = currentVersion.split('.').map(Number);
        const latestParts = latestVersion.split('.').map(Number);
        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const c = currentParts[i] || 0;
            const l = latestParts[i] || 0;
            if (l > c) {
                hasUpdate = true;
                break;
            } else if (l < c) {
                break;
            }
        }
    }

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify({
        timestamp: Date.now(),
        hasUpdate,
        latestVersion
    }), 'utf8');

    if (hasUpdate) {
      console.log(`v${currentVersion} (Update available: v${latestVersion})`);
    } else {
      console.log(`v${currentVersion}`);
    }

  } catch (err) {
    console.log(`v${currentVersion}`);
  }
}

checkUpdate();
