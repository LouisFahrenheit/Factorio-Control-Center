import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const dbMainPath = join(rootDir, 'data', 'db', 'fcc_database.sqlite');
const dbMetricsPath = join(rootDir, 'data', 'db', 'fcc_metrics.sqlite');

const mainDb = new Database(dbMainPath);
const metricsDb = new Database(dbMetricsPath);

// Pragmas for fast bulk operations
metricsDb.pragma('journal_mode = WAL');
metricsDb.pragma('synchronous = NORMAL');

console.log('--- Step 1: Configuring 10 Game Instances ---');

const SERVERS = [
  // 3 Servers with good / healthy data
  {
    id: '6bab540a19ab1d8d',
    name: 'Space Exploration',
    profile: 'good_se',
    port: '34204',
    rconPort: 27022,
  },
  {
    id: 'd6d7d5044d93b499',
    name: 'Nauvis Megabase 10k',
    profile: 'good_megabase',
    port: '34197',
    rconPort: 27015,
  },
  {
    id: '849370ce48fb9d56',
    name: 'Vanilla Speedrun Community',
    profile: 'good_vanilla',
    port: '34198',
    rconPort: 27016,
  },

  // 7 Servers with distinct realistic problems
  {
    id: 'a5bb925303f37d35',
    name: 'Vulcanus Heavy Foundry',
    profile: 'problem_low_ups',
    port: '34199',
    rconPort: 27017,
  },
  {
    id: 'ed95b7f0404c82a2',
    name: 'Gleba Bio-Hazard',
    profile: 'problem_pollution_evo',
    port: '34205',
    rconPort: 27023,
  },
  {
    id: 'f1a0010101010001',
    name: 'Fulgora Storm Grid',
    profile: 'problem_cpu_spikes',
    port: '34206',
    rconPort: 27024,
  },
  {
    id: 'f1a0010101010002',
    name: 'Aquilo Cryo Lab',
    profile: 'problem_memory_leak',
    port: '34207',
    rconPort: 27025,
  },
  {
    id: 'f1a0010101010003',
    name: 'Krastorio 2 Production',
    profile: 'problem_spm_stalls',
    port: '34208',
    rconPort: 27026,
  },
  {
    id: 'f1a0010101010004',
    name: 'Deathworld 24/7',
    profile: 'problem_save_explosion',
    port: '34209',
    rconPort: 27027,
  },
  {
    id: 'f1a0010101010005',
    name: 'Bobs & Angels Chaos',
    profile: 'problem_compound_heavy',
    port: '34210',
    rconPort: 27028,
  },
];

// Ensure all 10 instances exist in game_instances
const upsertInstanceStmt = mainDb.prepare(`
  INSERT INTO game_instances (
    id, name, serverPath, ip, port, rconPort, rconPassword,
    autostartServer, autoEnterPanel, launchSave, maintenanceLock,
    blockUpdates, experimentalUpdates, isPublic, publicDescription,
    publicConnectionAddress, createdAt, updatedAt, collectGameMetrics
  ) VALUES (
    @id, @name, @serverPath, '0.0.0.0', @port, @rconPort, 'fccSecretPass123',
    1, 0, 'latest', 0, 0, 0, 1, @name, '',
    '2025-10-31 00:00:00', '2026-10-31 12:00:00', 1
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    collectGameMetrics = 1
`);

mainDb.transaction(() => {
  for (const s of SERVERS) {
    upsertInstanceStmt.run({
      id: s.id,
      name: s.name,
      serverPath: `C:\\Games\\Factorio-servers\\${s.id}`,
      port: s.port,
      rconPort: s.rconPort,
    });
  }
})();
console.log('10 instances configured in fcc_database.sqlite');

console.log('--- Step 2: Preparing Metrics Database ---');

// Clear existing metrics tables to provide clean, coherent 1-year data
metricsDb.exec(`
  DELETE FROM instance_hourly_metrics;
  DELETE FROM instance_raw_metrics;
`);

const insertHourlyStmt = metricsDb.prepare(`
  INSERT INTO instance_hourly_metrics (
    instanceId, timestamp, cpuAvg, cpuMax, memoryAvg, memoryMax,
    playersMax, upsAvg, upsMin, saveSizeAvg, saveSizeMax,
    spmAvg, spmMax, espmAvg, espmMax,
    evolutionAvg, evolutionMax, evolutionGlebaAvg, evolutionGlebaMax,
    pollutionAvg, pollutionMax, pollutionAbsorbedAvg, pollutionAbsorbedMax,
    pollutionGlebaAvg, pollutionGlebaMax, pollutionGlebaAbsorbedAvg, pollutionGlebaAbsorbedMax,
    pollutionTotalAvg, pollutionTotalMax, pollutionGlebaTotalAvg, pollutionGlebaTotalMax
  ) VALUES (
    @instanceId, @timestamp, @cpuAvg, @cpuMax, @memoryAvg, @memoryMax,
    @playersMax, @upsAvg, @upsMin, @saveSizeAvg, @saveSizeMax,
    @spmAvg, @spmMax, @espmAvg, @espmMax,
    @evolutionAvg, @evolutionMax, @evolutionGlebaAvg, @evolutionGlebaMax,
    @pollutionAvg, @pollutionMax, @pollutionAbsorbedAvg, @pollutionAbsorbedMax,
    @pollutionGlebaAvg, @pollutionGlebaMax, @pollutionGlebaAbsorbedAvg, @pollutionGlebaAbsorbedMax,
    @pollutionTotalAvg, @pollutionTotalMax, @pollutionGlebaTotalAvg, @pollutionGlebaTotalMax
  )
`);

const insertRawStmt = metricsDb.prepare(`
  INSERT INTO instance_raw_metrics (
    instanceId, timestamp, cpuPercent, memoryBytes, onlinePlayers,
    ups, saveSize, spm, espm, evolution, evolutionGleba,
    pollution, pollutionAbsorbed, pollutionGleba, pollutionGlebaAbsorbed,
    pollutionTotal, pollutionGlebaTotal
  ) VALUES (
    @instanceId, @timestamp, @cpuPercent, @memoryBytes, @onlinePlayers,
    @ups, @saveSize, @spm, @espm, @evolution, @evolutionGleba,
    @pollution, @pollutionAbsorbed, @pollutionGleba, @pollutionGlebaAbsorbed,
    @pollutionTotal, @pollutionGlebaTotal
  )
`);

function formatSqlDate(d) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const sec = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${year}-${month}-${day} ${hours}:${min}:${sec}.${ms}`;
}

const NOW = new Date('2026-10-31T12:00:00.000Z');
const TOTAL_HOURS = 365 * 24; // 8760 hours

console.log(`Generating 1 year (${TOTAL_HOURS} hours) of hourly data for 10 servers...`);

// Helper for seasonal / daily variation
function dailyCycle(hourOfDay) {
  // peak at 19:00 - 22:00, trough at 04:00 - 06:00
  const rad = ((hourOfDay - 6) / 24) * 2 * Math.PI;
  return Math.sin(rad) * 0.5 + 0.5; // 0 to 1
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Generate hourly data
metricsDb.transaction(() => {
  for (const s of SERVERS) {
    const p = s.profile;
    for (let h = TOTAL_HOURS; h >= 0; h--) {
      const pointTime = new Date(NOW.getTime() - h * 3600 * 1000);
      const yearProgress = 1 - h / TOTAL_HOURS; // 0.0 to 1.0 over the year
      const hod = pointTime.getUTCHours();
      const dayFactor = dailyCycle(hod);

      let cpuAvg = 20, cpuMax = 25;
      let memoryAvg = 4e9, memoryMax = 4.2e9;
      let playersMax = Math.round(2 + dayFactor * 4);
      let upsAvg = 60, upsMin = 60;
      let saveSizeAvg = 15e6, saveSizeMax = 15.2e6;
      let spmAvg = 1000, spmMax = 1100;
      let espmAvg = 12000, espmMax = 13000;
      let evolutionAvg = 10 + yearProgress * 60, evolutionMax = evolutionAvg + 1;
      let evolutionGlebaAvg = 0, evolutionGlebaMax = 0;
      let pollutionAvg = 2000, pollutionMax = 2200;
      let pollutionAbsorbedAvg = 1900, pollutionAbsorbedMax = 2100;
      let pollutionGlebaAvg = 0, pollutionGlebaMax = 0;
      let pollutionGlebaAbsorbedAvg = 0, pollutionGlebaAbsorbedMax = 0;
      let pollutionTotalAvg = 100000, pollutionTotalMax = 105000;
      let pollutionGlebaTotalAvg = 0, pollutionGlebaTotalMax = 0;

      // ── Profiles ────────────────────────────────────────────────────────
      if (p === 'good_se') {
        cpuAvg = rand(22, 30) + dayFactor * 8;
        cpuMax = cpuAvg + rand(4, 10);
        memoryAvg = 4.2e9 + yearProgress * 1.5e9 + rand(0, 2e8);
        memoryMax = memoryAvg + 1.5e8;
        playersMax = Math.round(rand(2, 4) + dayFactor * 4);
        upsAvg = rand(59.9, 60.0);
        upsMin = rand(59.6, 59.9);
        saveSizeAvg = 18e6 + yearProgress * 24e6;
        saveSizeMax = saveSizeAvg + 2e5;
        spmAvg = rand(1400, 1800);
        spmMax = spmAvg + 150;
        espmAvg = rand(15000, 19000);
        espmMax = espmAvg + 1200;
        evolutionAvg = 15 + yearProgress * 55;
        evolutionMax = evolutionAvg + 0.5;
        pollutionAvg = rand(2000, 3200);
        pollutionMax = pollutionAvg + 300;
        pollutionAbsorbedAvg = pollutionAvg * 0.94;
        pollutionAbsorbedMax = pollutionMax * 0.94;
      } else if (p === 'good_megabase') {
        cpuAvg = rand(30, 42) + dayFactor * 6;
        cpuMax = cpuAvg + rand(5, 12);
        memoryAvg = 6.2e9 + yearProgress * 1.8e9 + rand(0, 3e8);
        memoryMax = memoryAvg + 2e8;
        playersMax = Math.round(rand(3, 6) + dayFactor * 5);
        upsAvg = rand(59.8, 60.0);
        upsMin = rand(59.4, 59.8);
        saveSizeAvg = 35e6 + yearProgress * 52e6;
        saveSizeMax = saveSizeAvg + 5e5;
        spmAvg = rand(8800, 10400);
        spmMax = spmAvg + 500;
        espmAvg = rand(85000, 102000);
        espmMax = espmAvg + 4000;
        evolutionAvg = 88 + yearProgress * 9;
        evolutionMax = evolutionAvg + 0.2;
        pollutionAvg = rand(7500, 9200);
        pollutionMax = pollutionAvg + 800;
        pollutionAbsorbedAvg = pollutionAvg * 0.96;
        pollutionAbsorbedMax = pollutionMax * 0.96;
      } else if (p === 'good_vanilla') {
        cpuAvg = rand(14, 22) + dayFactor * 4;
        cpuMax = cpuAvg + rand(3, 7);
        memoryAvg = 2.2e9 + yearProgress * 8e8 + rand(0, 1e8);
        memoryMax = memoryAvg + 1e8;
        playersMax = Math.round(rand(1, 3) + dayFactor * 3);
        upsAvg = 60.0;
        upsMin = 59.95;
        saveSizeAvg = 6e6 + yearProgress * 10e6;
        saveSizeMax = saveSizeAvg + 1e5;
        spmAvg = rand(350, 650);
        spmMax = spmAvg + 80;
        espmAvg = rand(3500, 6800);
        espmMax = espmAvg + 600;
        evolutionAvg = 10 + yearProgress * 45;
        evolutionMax = evolutionAvg + 0.5;
        pollutionAvg = rand(1200, 2100);
        pollutionMax = pollutionAvg + 200;
        pollutionAbsorbedAvg = pollutionAvg * 0.95;
        pollutionAbsorbedMax = pollutionMax * 0.95;
      } else if (p === 'problem_low_ups') {
        // Severe UPS drop as megabase expanded over time
        const degradation = Math.min(1, Math.max(0, (yearProgress - 0.25) / 0.75));
        upsAvg = 60 - degradation * rand(22, 28); // drops to 32-38
        upsMin = upsAvg - rand(2, 5);
        cpuAvg = 40 + degradation * rand(45, 54); // climbs to 85-94%
        cpuMax = Math.min(100, cpuAvg + rand(3, 8));
        memoryAvg = 5e9 + yearProgress * 5e9;
        memoryMax = memoryAvg + 3e8;
        playersMax = Math.round(rand(2, 5));
        saveSizeAvg = 25e6 + yearProgress * 85e6;
        saveSizeMax = saveSizeAvg + 1e6;
        spmAvg = Math.max(300, 4200 - degradation * rand(1800, 3000));
        spmMax = spmAvg + 400;
        evolutionAvg = 95 + yearProgress * 4.9;
        evolutionMax = evolutionAvg + 0.1;
      } else if (p === 'problem_pollution_evo') {
        // Gleba bio hazard: rampant pollution and 99.9% evo
        evolutionAvg = 92 + yearProgress * 7.9;
        evolutionMax = 99.9;
        evolutionGlebaAvg = 80 + yearProgress * 19;
        evolutionGlebaMax = 99.5;
        pollutionAvg = rand(11000, 16000);
        pollutionMax = pollutionAvg + 2000;
        pollutionAbsorbedAvg = rand(800, 1800); // collapse in absorption
        pollutionAbsorbedMax = pollutionAbsorbedAvg + 300;
        pollutionGlebaAvg = rand(8000, 14000);
        pollutionGlebaMax = pollutionGlebaAvg + 1500;
        pollutionGlebaAbsorbedAvg = rand(600, 1200);
        pollutionGlebaAbsorbedMax = pollutionGlebaAbsorbedAvg + 200;
        cpuAvg = rand(55, 78);
        cpuMax = Math.min(100, cpuAvg + rand(8, 18));
        upsAvg = rand(52, 58);
        upsMin = rand(45, 52);
        memoryAvg = 6e9 + yearProgress * 3e9;
        memoryMax = memoryAvg + 2e8;
      } else if (p === 'problem_cpu_spikes') {
        // Fulgora lightning: periodic violent CPU spikes
        const isSpikeHour = (h % 31 === 0 || h % 57 === 0);
        cpuAvg = isSpikeHour ? rand(92, 98) : (rand(20, 32) + dayFactor * 6);
        cpuMax = isSpikeHour ? 100 : cpuAvg + rand(4, 10);
        upsAvg = isSpikeHour ? rand(24, 38) : rand(59.5, 60);
        upsMin = isSpikeHour ? rand(15, 25) : 58.5;
        playersMax = isSpikeHour ? 0 : Math.round(rand(3, 7)); // disconnects
        memoryAvg = 4.5e9 + yearProgress * 1.2e9;
        memoryMax = memoryAvg + (isSpikeHour ? 8e8 : 1e8);
        saveSizeAvg = 20e6 + yearProgress * 30e6;
        saveSizeMax = saveSizeAvg + 2e5;
        spmAvg = isSpikeHour ? rand(100, 300) : rand(2000, 2600);
        spmMax = spmAvg + 200;
      } else if (p === 'problem_memory_leak') {
        // Aquilo Cryo Lab: steady unmitigated memory leak
        const leakFactor = yearProgress; // 0 to 1
        memoryAvg = 3.5e9 + leakFactor * 1.15e10 + rand(0, 2e8); // 3.5 GB -> 15.0 GB!
        memoryMax = memoryAvg + 3e8;
        cpuAvg = rand(28, 42);
        cpuMax = cpuAvg + 8;
        upsAvg = memoryAvg > 1.3e10 ? rand(48, 55) : 59.9; // GC thrashing
        upsMin = upsAvg - 5;
        playersMax = Math.round(rand(2, 5));
        saveSizeAvg = 16e6 + yearProgress * 22e6;
        saveSizeMax = saveSizeAvg + 2e5;
      } else if (p === 'problem_spm_stalls') {
        // Krastorio 2: erratic production drops to 0
        const isBrownout = (h % 23 === 0 || h % 47 === 0 || h % 71 === 0);
        spmAvg = isBrownout ? 0 : rand(1900, 2500);
        spmMax = isBrownout ? 50 : spmAvg + 300;
        espmAvg = isBrownout ? 0 : rand(22000, 28000);
        espmMax = espmAvg + 2000;
        upsAvg = isBrownout ? rand(42, 49) : rand(58, 60);
        upsMin = upsAvg - 4;
        cpuAvg = isBrownout ? rand(70, 88) : rand(30, 45);
        cpuMax = cpuAvg + 8;
        playersMax = isBrownout ? Math.round(rand(0, 1)) : Math.round(rand(3, 8));
        memoryAvg = 5.2e9 + yearProgress * 2.5e9;
        memoryMax = memoryAvg + 2e8;
      } else if (p === 'problem_save_explosion') {
        // Deathworld: huge save file size explosion (up to 290 MB)
        saveSizeAvg = 15e6 + Math.pow(yearProgress, 1.4) * 275e6; // up to 290 MB!
        saveSizeMax = saveSizeAvg + 2e6;
        memoryAvg = 5.5e9 + yearProgress * 7.5e9; // 13 GB
        memoryMax = memoryAvg + 4e8;
        cpuAvg = rand(60, 75) + dayFactor * 8;
        cpuMax = cpuAvg + 12;
        upsAvg = rand(46, 54);
        upsMin = rand(40, 48);
        evolutionAvg = 99.9;
        evolutionMax = 99.9;
        pollutionAvg = rand(8500, 14000);
        pollutionMax = pollutionAvg + 1500;
        pollutionAbsorbedAvg = rand(5000, 9000);
        pollutionAbsorbedMax = pollutionAbsorbedAvg + 800;
        playersMax = Math.round(rand(2, 6));
      } else if (p === 'problem_compound_heavy') {
        // Bobs & Angels: constant heavy load (high CPU, degraded UPS, high RAM)
        cpuAvg = rand(78, 93);
        cpuMax = Math.min(100, cpuAvg + rand(4, 9));
        upsAvg = rand(36, 45);
        upsMin = rand(30, 38);
        memoryAvg = 8.5e9 + yearProgress * 3.8e9; // 12.3 GB
        memoryMax = memoryAvg + 3e8;
        playersMax = Math.round(rand(3, 7));
        saveSizeAvg = 40e6 + yearProgress * 95e6;
        saveSizeMax = saveSizeAvg + 1e6;
        spmAvg = rand(2800, 4800);
        spmMax = spmAvg + 600;
        evolutionAvg = 85 + yearProgress * 14.5;
        evolutionMax = evolutionAvg + 0.2;
      }

      insertHourlyStmt.run({
        instanceId: s.id,
        timestamp: formatSqlDate(pointTime),
        cpuAvg: Math.round(cpuAvg * 10) / 10,
        cpuMax: Math.round(cpuMax * 10) / 10,
        memoryAvg: Math.round(memoryAvg),
        memoryMax: Math.round(memoryMax),
        playersMax,
        upsAvg: Math.round(upsAvg * 10) / 10,
        upsMin: Math.round(upsMin * 10) / 10,
        saveSizeAvg: Math.round(saveSizeAvg),
        saveSizeMax: Math.round(saveSizeMax),
        spmAvg: Math.round(spmAvg * 10) / 10,
        spmMax: Math.round(spmMax * 10) / 10,
        espmAvg: Math.round(espmAvg * 10) / 10,
        espmMax: Math.round(espmMax * 10) / 10,
        evolutionAvg: Math.round(evolutionAvg * 10) / 10,
        evolutionMax: Math.round(evolutionMax * 10) / 10,
        evolutionGlebaAvg: Math.round(evolutionGlebaAvg * 10) / 10,
        evolutionGlebaMax: Math.round(evolutionGlebaMax * 10) / 10,
        pollutionAvg: Math.round(pollutionAvg * 10) / 10,
        pollutionMax: Math.round(pollutionMax * 10) / 10,
        pollutionAbsorbedAvg: Math.round(pollutionAbsorbedAvg * 10) / 10,
        pollutionAbsorbedMax: Math.round(pollutionAbsorbedMax * 10) / 10,
        pollutionGlebaAvg: Math.round(pollutionGlebaAvg * 10) / 10,
        pollutionGlebaMax: Math.round(pollutionGlebaMax * 10) / 10,
        pollutionGlebaAbsorbedAvg: Math.round(pollutionGlebaAbsorbedAvg * 10) / 10,
        pollutionGlebaAbsorbedMax: Math.round(pollutionGlebaAbsorbedMax * 10) / 10,
        pollutionTotalAvg: Math.round(pollutionTotalAvg),
        pollutionTotalMax: Math.round(pollutionTotalMax),
        pollutionGlebaTotalAvg: Math.round(pollutionGlebaTotalAvg),
        pollutionGlebaTotalMax: Math.round(pollutionGlebaTotalMax),
      });
    }
  }
})();
console.log('Hourly data generated successfully.');

console.log('Generating 48 hours of high-resolution raw data (every 2 min) for 10 servers...');
const RAW_POINTS = 48 * 30; // 1440 points per server

metricsDb.transaction(() => {
  for (const s of SERVERS) {
    const p = s.profile;
    for (let i = RAW_POINTS; i >= 0; i--) {
      const pointTime = new Date(NOW.getTime() - i * 2 * 60 * 1000);
      const hod = pointTime.getUTCHours();
      const dayFactor = dailyCycle(hod);

      let cpu = 20;
      let memory = 4e9;
      let players = Math.round(2 + dayFactor * 4);
      let ups = 60;
      let saveSize = 25e6;
      let spm = 1200;
      let espm = 14000;
      let evolution = 70;
      let evolutionGleba = 0;
      let pollution = 2500;
      let pollutionAbsorbed = 2400;
      let pollutionGleba = 0;
      let pollutionGlebaAbsorbed = 0;
      let pollutionTotal = 250000;
      let pollutionGlebaTotal = 0;

      if (p === 'good_se') {
        cpu = rand(20, 28) + dayFactor * 8 + rand(-2, 3);
        memory = 5.6e9 + rand(0, 1.5e8);
        players = Math.round(rand(2, 4) + dayFactor * 4);
        ups = rand(59.8, 60.0);
        saveSize = 41.5e6 + rand(0, 5e5);
        spm = rand(1500, 1850);
        espm = spm * 10.5;
        evolution = 68.4;
        pollution = rand(2400, 3100);
        pollutionAbsorbed = pollution * 0.95;
      } else if (p === 'good_megabase') {
        cpu = rand(32, 44) + dayFactor * 6;
        memory = 7.7e9 + rand(0, 2e8);
        players = Math.round(rand(3, 6) + dayFactor * 5);
        ups = rand(59.7, 60.0);
        saveSize = 86.8e6 + rand(0, 4e5);
        spm = rand(9200, 10400);
        espm = spm * 10;
        evolution = 96.8;
        pollution = rand(8200, 9500);
        pollutionAbsorbed = pollution * 0.96;
      } else if (p === 'good_vanilla') {
        cpu = rand(14, 21) + dayFactor * 4;
        memory = 2.95e9 + rand(0, 8e7);
        players = Math.round(rand(1, 3) + dayFactor * 3);
        ups = 60.0;
        saveSize = 15.8e6 + rand(0, 2e5);
        spm = rand(450, 620);
        espm = spm * 10;
        evolution = 54.2;
        pollution = rand(1400, 1900);
        pollutionAbsorbed = pollution * 0.95;
      } else if (p === 'problem_low_ups') {
        cpu = rand(86, 94); // pinned high
        ups = rand(35, 42); // degraded UPS
        memory = 9.8e9 + rand(0, 2e8);
        players = Math.round(rand(2, 5));
        saveSize = 108e6;
        spm = rand(1200, 2600); // bottleneck stalls
        evolution = 99.8;
      } else if (p === 'problem_pollution_evo') {
        evolution = 99.9;
        evolutionGleba = 98.4;
        pollution = rand(13000, 16500);
        pollutionAbsorbed = rand(1100, 1600); // 10% absorbed
        pollutionGleba = rand(11000, 15000);
        pollutionGlebaAbsorbed = rand(800, 1200);
        cpu = rand(65, 82);
        ups = rand(50, 56);
        memory = 8.9e9;
      } else if (p === 'problem_cpu_spikes') {
        const isSpike = (i >= 200 && i <= 240) || (i >= 700 && i <= 745) || (i >= 1200 && i <= 1235);
        cpu = isSpike ? rand(94, 99) : (rand(22, 34) + dayFactor * 5);
        ups = isSpike ? rand(22, 32) : rand(59.6, 60.0);
        players = isSpike ? 0 : Math.round(rand(3, 7));
        memory = 5.6e9 + (isSpike ? 6e8 : 0);
        saveSize = 49.5e6;
        spm = isSpike ? 120 : rand(2100, 2550);
      } else if (p === 'problem_memory_leak') {
        // Memory climbs continuously over last 48 hours: 14.2 GB -> 15.6 GB
        const leakProgress = 1 - (i / RAW_POINTS);
        memory = 14.2e9 + leakProgress * 1.4e9 + rand(0, 1e8);
        cpu = rand(32, 45);
        ups = rand(52, 58); // GC thrashing
        players = Math.round(rand(2, 5));
        saveSize = 37.8e6;
        spm = rand(1600, 2100);
      } else if (p === 'problem_spm_stalls') {
        const isStall = (i >= 150 && i <= 260) || (i >= 850 && i <= 980);
        spm = isStall ? 0 : rand(2000, 2600);
        espm = isStall ? 0 : spm * 11;
        ups = isStall ? rand(45, 52) : rand(58, 60);
        cpu = isStall ? rand(75, 88) : rand(32, 46);
        players = isStall ? 1 : Math.round(rand(3, 7));
        memory = 7.6e9;
      } else if (p === 'problem_save_explosion') {
        saveSize = 288e6 + rand(0, 2e6); // 290 MB!
        memory = 12.8e9 + rand(0, 3e8);
        cpu = rand(66, 78);
        ups = rand(47, 53);
        evolution = 99.9;
        pollution = rand(11000, 14500);
        pollutionAbsorbed = rand(6500, 8500);
        players = Math.round(rand(3, 6));
      } else if (p === 'problem_compound_heavy') {
        cpu = rand(82, 94);
        ups = rand(38, 44);
        memory = 12.1e9 + rand(0, 3e8);
        players = Math.round(rand(3, 7));
        saveSize = 132e6;
        spm = rand(3200, 4900);
        evolution = 99.4;
      }

      insertRawStmt.run({
        instanceId: s.id,
        timestamp: formatSqlDate(pointTime),
        cpuPercent: Math.round(cpu * 10) / 10,
        memoryBytes: Math.round(memory),
        onlinePlayers: players,
        ups: Math.round(ups * 10) / 10,
        saveSize: Math.round(saveSize),
        spm: Math.round(spm * 10) / 10,
        espm: Math.round(espm * 10) / 10,
        evolution: Math.round(evolution * 10) / 10,
        evolutionGleba: Math.round(evolutionGleba * 10) / 10,
        pollution: Math.round(pollution * 10) / 10,
        pollutionAbsorbed: Math.round(pollutionAbsorbed * 10) / 10,
        pollutionGleba: Math.round(pollutionGleba * 10) / 10,
        pollutionGlebaAbsorbed: Math.round(pollutionGlebaAbsorbed * 10) / 10,
        pollutionTotal: Math.round(pollutionTotal),
        pollutionGlebaTotal: Math.round(pollutionGlebaTotal),
      });
    }
  }
})();

console.log('Raw metrics generated successfully.');

const rawTotal = metricsDb.prepare('SELECT count(*) as c FROM instance_raw_metrics').get();
const hourlyTotal = metricsDb.prepare('SELECT count(*) as c FROM instance_hourly_metrics').get();
console.log(`Finished: ${rawTotal.c} raw records, ${hourlyTotal.c} hourly records across 10 servers.`);
