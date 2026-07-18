import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { InstancePropagateService } from '../instance-propagate.service';
import {
  ModSettings,
  buildDefaultModSettingsJson,
  isValidModSettingsBuffer,
  modSettingsFromJson,
  modSettingsToJsonText,
} from '../factorio-data-codec';
import {
  OpResult,
  ensureServerSettingsFile,
  ensureServerSettingsOptionsFromWebPanel,
  gameVersion,
  isErrorResult,
  readJsonPath,
  selectedInstance,
  writeJsonPath,
} from '../ops-utils';
import { diffJsonObjects } from '../../common/json-diff.util';
import { ensureBanlistFile } from '../../common/banlist.util';
import { ModSettingsSchemaService } from './mod-settings-schema.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';

const MOD_SETTINGS_MAX_BYTES = 32 * 1024 * 1024;

@Injectable()
export class FilesOpsService {
  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly propagate: InstancePropagateService,
    private readonly modSettingsSchema: ModSettingsSchemaService,
    private readonly config: FccConfigService,
    private readonly portal: ModPortalService,
  ) {}

  readServerSettings(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return readJsonPath(sel.pm.serverSettings);
  }

  writeServerSettings(data: unknown): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return { ok: false, error: 'invalid_data' };
    const beforeRes = readJsonPath(sel.pm.serverSettings);
    const before =
      beforeRes.ok &&
      beforeRes.data &&
      typeof beforeRes.data === 'object' &&
      !Array.isArray(beforeRes.data)
        ? (beforeRes.data as Record<string, unknown>)
        : {};
    const normalized = { ...(data as Record<string, unknown>) };
    normalized.game_password =
      normalized.game_password == null ||
      typeof normalized.game_password === 'boolean'
        ? ''
        : String(normalized.game_password);
    const token = String(normalized.token || '').trim();
    const password = String(normalized.password || '').trim();
    const vis = normalized.visibility as Record<string, unknown> | undefined;
    if (token && password)
      return {
        ok: false,
        error: 'server_settings_error_token_password_exclusive',
      };
    if (vis?.public && !token && !password)
      return { ok: false, error: 'server_settings_error_public_needs_auth' };
    const changes = diffJsonObjects(before, normalized);
    const written = writeJsonPath(sel.pm.serverSettings, normalized);
    if (written.ok === false) return written;
    this.portal.clearVerifyCache();
    return { ...written, settings_changes: changes };
  }

  createServerSettingsFromExample(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const ensured = ensureServerSettingsFile(
      sel.item.serverPath,
      ensureServerSettingsOptionsFromWebPanel(this.config.webPanel),
      true,
    );
    if (!ensured.ok) return { ok: false, error: 'missing_server_settings' };
    return {
      ok: true,
      path: ensured.path,
      existed: !ensured.created,
    };
  }

  readModList(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return readJsonPath(sel.pm.modList);
  }

  writeModList(data: unknown): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return writeJsonPath(sel.pm.modList, data);
  }

  readAdminList(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return readJsonPath(sel.pm.adminList);
  }

  async writeAdminList(data: unknown): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!Array.isArray(data)) return { ok: false, error: 'invalid_data' };
    const names = Array.from(
      new Set(data.map((x) => String(x || '').trim()).filter(Boolean)),
    );

    const running = this.runtime.isRunning(sel.item.id);
    if (running) {
      const oldList = existsSync(sel.pm.adminList)
        ? (readJsonPath(sel.pm.adminList).data as string[])
        : [];
      const safeOld = Array.isArray(oldList)
        ? oldList.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const oldSet = new Set(safeOld);
      const newSet = new Set(names);
      const toPromote = names.filter((n) => !oldSet.has(n));
      const toDemote = safeOld.filter((n) => !newSet.has(n));
      for (const name of toPromote) {
        const res = await this.runtime.rconExec(
          sel.item.id,
          `/promote ${name}`,
        );
        if (!res.ok)
          return { ok: false, error: String(res.error || 'rcon_failed') };
      }
      for (const name of toDemote) {
        const res = await this.runtime.rconExec(sel.item.id, `/demote ${name}`);
        if (!res.ok)
          return { ok: false, error: String(res.error || 'rcon_failed') };
      }
      const written = writeJsonPath(sel.pm.adminList, names);
      if (written.ok === false) return written;
      await this.propagate.propagateAdminList(sel.item.id, names);
      return {
        ok: true,
        runtime: true,
        promoted: toPromote,
        demoted: toDemote,
      };
    }

    const res = writeJsonPath(sel.pm.adminList, names);
    if (res.ok === false) return res;
    await this.propagate.propagateAdminList(sel.item.id, names);
    return { ok: true };
  }

  readBanList(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    ensureBanlistFile(sel.pm.banList);
    return readJsonPath(sel.pm.banList);
  }

  uploadModSettingsDat(tmpPath: string, confirmReplace: boolean): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    let size = 0;
    try {
      size = statSync(tmpPath).size;
    } catch {
      return { ok: false, error: 'tmp_not_found' };
    }
    if (size <= 0 || size > MOD_SETTINGS_MAX_BYTES)
      return { ok: false, error: 'invalid_mod_settings' };
    const raw = readFileSync(tmpPath);
    if (!isValidModSettingsBuffer(raw))
      return { ok: false, error: 'invalid_mod_settings' };
    const dst = sel.pm.modSettingsDat;
    if (existsSync(dst) && !confirmReplace)
      return { ok: false, error: 'mod_settings_exists' };
    mkdirSync(sel.pm.modsDir, { recursive: true });
    try {
      renameSync(tmpPath, dst);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    this.modSettingsSchema.invalidateInstance(sel.item.id);
    return { ok: true, name: 'mod-settings.dat', kind: 'mod_settings' };
  }

  modSettingsReadJson(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const p = sel.pm.modSettingsDat;
    if (!existsSync(p)) {
      const ver = gameVersion(sel.item.serverPath);
      const hasQuality = existsSync(
        join(sel.item.serverPath, 'data', 'quality'),
      );
      const doc = buildDefaultModSettingsJson(ver, hasQuality);
      return {
        ok: true,
        json_text: JSON.stringify(doc, null, 2),
        missing_file: true,
      };
    }
    try {
      const ms = ModSettings.load(readFileSync(p));
      return {
        ok: true,
        json_text: modSettingsToJsonText(ms),
        missing_file: false,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  modSettingsWriteJson(data: unknown): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const p = sel.pm.modSettingsDat;
    try {
      const ms = modSettingsFromJson(data);
      mkdirSync(sel.pm.modsDir, { recursive: true });
      writeFileSync(p, ms.save());
      this.modSettingsSchema.invalidateInstance(sel.item.id);
      return { ok: true, path: p };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'expected_mod_settings_root')
        return { ok: false, error: msg };
      return { ok: false, error: msg };
    }
  }
}
