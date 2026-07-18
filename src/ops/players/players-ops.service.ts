import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { InstancesService } from '../../instances/instances.service';
import {
  validateBanPlayer,
  sanitizeStdinLine,
} from '../../common/ban-sanitize';
import {
  normalizeBanlistEntries,
  ensureBanlistFile,
  type BanlistEntry,
} from '../../common/banlist.util';
import { panelTimestamp } from '../../common/datetime.util';
import { readJsonFile, writeJsonFile } from '../../common/json-store';
import { RuntimeService } from '../runtime.service';
import { FilesOpsService } from '../files/files-ops.service';
import { InstancePropagateService } from '../instance-propagate.service';
import { InstanceHistoryService } from '../instance-history.service';
import { OpResult, isErrorResult, selectedInstance } from '../ops-utils';

@Injectable()
export class PlayersOpsService {
  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly files: FilesOpsService,
    private readonly propagate: InstancePropagateService,
    private readonly instanceHistory: InstanceHistoryService,
  ) {}

  summary(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const rt = this.runtime.get(sel.item.id);
    const hist = readJsonFile<Record<string, unknown>>(
      join(sel.item.serverPath, 'server-history.json'),
      {},
    );
    ensureBanlistFile(sel.pm.banList);
    const bansRaw = readJsonFile<unknown>(sel.pm.banList, []);
    const bans = normalizeBanlistEntries(bansRaw);
    if (JSON.stringify(bansRaw) !== JSON.stringify(bans)) {
      this.writeBanlist(sel.pm.banList, bans);
    }
    const admins = existsSync(sel.pm.adminList)
      ? readJsonFile<string[]>(sel.pm.adminList, [])
      : [];
    const whitelist = existsSync(
      join(sel.item.serverPath, 'server-whitelist.json'),
    )
      ? readJsonFile<string[]>(
          join(sel.item.serverPath, 'server-whitelist.json'),
          [],
        )
      : [];
    const online = rt
      ? Object.entries(rt.onlinePlayers).map(([name, since]) => ({
          name,
          since,
        }))
      : [];
    return {
      ok: true,
      online,
      history: Array.isArray(hist.history)
        ? hist.history.slice(-200).reverse()
        : [],
      stats: hist.stats || {},
      player_stats_rows: [],
      active_bans: Array.isArray(bans) ? bans : [],
      active_bans_available: true,
      ban_history_tail: Array.isArray(hist.ban_history)
        ? hist.ban_history.slice(-100)
        : [],
      mute_history_tail: Array.isArray(hist.mute_history)
        ? hist.mute_history.slice(-100)
        : [],
      kick_history_tail: Array.isArray(hist.kick_history)
        ? hist.kick_history.slice(-100)
        : [],
      whitelist_history_tail: Array.isArray(hist.whitelist_history)
        ? hist.whitelist_history.slice(-100)
        : [],
      server_history_tail: this.instanceHistory.tailServer(sel.item.serverPath),
      mods_history_tail: this.instanceHistory.tailMods(sel.item.serverPath),
      commands_history_tail: this.instanceHistory.tailCommands(
        sel.item.serverPath,
      ),
      whitelist_players: whitelist,
      whitelist_enabled: whitelist.length > 0,
      admins: Array.isArray(admins) ? admins : [],
    };
  }

  syncBans(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!existsSync(sel.pm.banList)) ensureBanlistFile(sel.pm.banList);
    const list = readJsonFile<unknown[]>(sel.pm.banList, []);
    return { ok: true, imported: Array.isArray(list) ? list.length : 0 };
  }

  async ban(player: string, reason = '', actor = 'Web'): Promise<OpResult> {
    const v = this.validPlayer(player);
    if (v.error)
      return v.error === 'empty'
        ? { ok: false, error: 'empty_player' }
        : { ok: false, error: v.error };
    const r = sanitizeStdinLine(reason);
    const cmd = r ? `/ban ${v.name} ${r}` : `/ban ${v.name}`;
    const res = await this.rconOrOffline(cmd);
    this.appendHistory('ban_history', {
      player: v.name,
      reason: r,
      banned_by: actor || 'Web',
      date: panelTimestamp(),
      active: true,
      action: 'BAN',
    });
    const sel = selectedInstance(this.instances);
    if (!isErrorResult(sel))
      this.propagate.propagateBanList(sel.item.serverPath);

    if (res.ok) {
      this.repairBanlistFile();
      return { ok: true };
    }
    if (res.error === 'not_running') {
      this.upsertBan(v.name!, r);
      return { ok: true, offline: true };
    }
    return res;
  }

  async unban(player: string, actor = 'Web'): Promise<OpResult> {
    const v = this.validPlayer(player);
    if (v.error)
      return v.error === 'empty'
        ? { ok: false, error: 'empty_player' }
        : { ok: false, error: v.error };
    const res = await this.rconOrOffline(`/unban ${v.name}`);
    this.appendHistory('ban_history', {
      player: v.name,
      unbanned_by: actor || 'Web',
      unban_date: panelTimestamp(),
      action: 'UNBAN',
    });
    const sel = selectedInstance(this.instances);
    if (!isErrorResult(sel))
      this.propagate.propagateBanList(sel.item.serverPath);

    if (res.ok) {
      this.repairBanlistFile();
      return { ok: true };
    }
    if (res.error === 'not_running') {
      this.removeBan(v.name!);
      return { ok: true, offline: true };
    }
    return res;
  }

  mute(player: string, actor = 'Web'): Promise<OpResult> {
    return this.simpleRcon(player, `/mute`, 'mute_history', 'MUTE', actor);
  }

  unmute(player: string, actor = 'Web'): Promise<OpResult> {
    return this.simpleRcon(player, `/unmute`, 'mute_history', 'UNMUTE', actor);
  }

  kick(player: string, reason = '', actor = 'Web'): Promise<OpResult> {
    return this.simpleRcon(
      player,
      `/kick`,
      'kick_history',
      'KICK',
      actor,
      sanitizeStdinLine(reason),
    );
  }

  purge(player: string, actor = 'Web'): Promise<OpResult> {
    return this.simpleRcon(player, `/purge`, 'mute_history', 'PURGE', actor);
  }

  whitelistAdd(player: string, actor = 'Web'): Promise<OpResult> {
    return this.whitelist(player, true, actor);
  }

  whitelistRemove(player: string, actor = 'Web'): Promise<OpResult> {
    return this.whitelist(player, false, actor);
  }

  async whitelistClear(actor = 'Web'): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const path = join(sel.item.serverPath, 'server-whitelist.json');
    writeJsonFile(path, []);
    await this.rconOrOffline('/whitelist clear');
    this.propagate.propagateWhitelist(sel.item.serverPath);
    this.appendHistory('whitelist_history', {
      action: 'CLEAR',
      actor,
      date: panelTimestamp(),
    });
    return { ok: true };
  }

  private validPlayer(player: string): { name?: string; error?: string } {
    return validateBanPlayer(player);
  }

  private async simpleRcon(
    player: string,
    prefix: string,
    histKey: string,
    action: string,
    actor: string,
    extra = '',
  ): Promise<OpResult> {
    const v = this.validPlayer(player);
    if (v.error)
      return v.error === 'empty'
        ? { ok: false, error: 'empty_player' }
        : { ok: false, error: v.error };
    const command = `${prefix} ${v.name}${extra ? ` ${extra}` : ''}`;
    const res = await this.rconOrOffline(command);
    if (!res.ok) return res;
    this.appendHistory(histKey, {
      player: v.name,
      action,
      actor: actor || 'Web',
      date: panelTimestamp(),
    });
    return { ok: true };
  }

  private async whitelist(
    player: string,
    add: boolean,
    actor: string,
  ): Promise<OpResult> {
    const v = this.validPlayer(player);
    if (v.error)
      return v.error === 'empty'
        ? { ok: false, error: 'empty_player' }
        : { ok: false, error: v.error };
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const path = join(sel.item.serverPath, 'server-whitelist.json');
    const list = existsSync(path) ? readJsonFile<string[]>(path, []) : [];
    const next = add
      ? Array.from(new Set([...list, v.name!]))
      : list.filter((x) => x.toLowerCase() !== v.name!.toLowerCase());
    writeJsonFile(path, next);
    await this.rconOrOffline(
      add ? `/whitelist add ${v.name}` : `/whitelist remove ${v.name}`,
    );
    this.propagate.propagateWhitelist(sel.item.serverPath);
    this.appendHistory('whitelist_history', {
      player: v.name,
      action: add ? 'ADD' : 'REMOVE',
      actor,
      date: panelTimestamp(),
    });
    return { ok: true };
  }

  private async rconOrOffline(command: string): Promise<OpResult> {
    const id = this.instances.getSelectedId();
    if (!id || !this.runtime.isRunning(id))
      return { ok: false, error: 'not_running' };
    return this.runtime.rconExec(id, command);
  }

  private upsertBan(player: string, reason: string): void {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;
    const list = normalizeBanlistEntries(readJsonFile(sel.pm.banList, []));
    const next = list.filter(
      (x) => x.username.toLowerCase() !== player.toLowerCase(),
    );
    next.push({ username: player, reason, address: '' });
    this.writeBanlist(sel.pm.banList, next);
  }

  private removeBan(player: string): void {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;
    ensureBanlistFile(sel.pm.banList);
    const list = normalizeBanlistEntries(readJsonFile(sel.pm.banList, []));
    this.writeBanlist(
      sel.pm.banList,
      list.filter((x) => x.username.toLowerCase() !== player.toLowerCase()),
    );
  }

  /** Dedupe string + object entries after Factorio RCON updated the file. */
  private repairBanlistFile(): void {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;
    ensureBanlistFile(sel.pm.banList);
    const raw = readJsonFile<unknown>(sel.pm.banList, []);
    const normalized = normalizeBanlistEntries(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      this.writeBanlist(sel.pm.banList, normalized);
    }
  }

  private writeBanlist(path: string, entries: BanlistEntry[]): void {
    writeJsonFile(path, entries);
  }

  private appendHistory(key: string, event: Record<string, unknown>): void {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;
    const path = join(sel.item.serverPath, 'server-history.json');
    const doc = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>)
      : {};
    const arr = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : [];
    arr.push(event);
    doc[key] = arr.slice(-2000);
    writeJsonFile(path, doc);
  }
}
