import type {
  HelpSection,
  SectionHelpContent,
} from '../components/SectionHelpModal';
import type { AppIconName } from './appIcons';

function section(
  prefix: string,
  key: string,
  icon: AppIconName,
  bulletCount: number = 0,
  withTip = false,
): HelpSection {
  return {
    titleKey: `${prefix}_help_${key}_title`,
    textKey: `${prefix}_help_${key}_text`,
    icon,
    bulletKeys:
      bulletCount > 0
        ? Array.from(
            { length: bulletCount },
            (_, i) => `${prefix}_help_${key}_b${i + 1}`,
          )
        : undefined,
    tipKey: withTip ? `${prefix}_help_${key}_tip` : undefined,
  };
}

function content(prefix: string, sections: HelpSection[]): SectionHelpContent {
  return {
    titleKey: `${prefix}_help_title`,
    introKey: `${prefix}_help_intro`,
    sections,
  };
}

export const INSTANCES_HELP = content('instances', [
  section('instances', 'add', 'add', 3),
  section('instances', 'manage', 'server', 3, true),
  section('instances', 'view', 'search', 4),
  section('instances', 'maintenance', 'maintenance', 3),
]);

export const MAINTENANCE_HELP = content('maintenance', [
  section('maintenance', 'tasks', 'schedule', 3),
  section('maintenance', 'schedule', 'autostart', 2),
  section('maintenance', 'modes', 'engineering', 3),
  section('maintenance', 'reports', 'history', 2),
]);

export const WEB_ACCESS_HELP = content('web_access', [
  section('web_access', 'users', 'person_add', 3, true),
  section('web_access', 'roles', 'person_shield', 4),
  section('web_access', 'servers', 'server', 2),
  section('web_access', '2fa', 'settings_account', 3),
]);

export const MONITORING_HELP = content('monitoring', [
  section('monitoring', 'metrics', 'monitoring', 3, true),
  section('monitoring', 'analysis', 'schedule', 3),
]);

export const PUBLIC_HELP = content('public', [
  section('public', 'setup', 'public_page', 3),
  section('public', 'visibility', 'server', 3),
  section('public', 'customization', 'settings', 3),
]);

export const BACKUP_HELP = content('backup', [
  section('backup', 'create', 'backup', 3),
  section('backup', 'auto', 'schedule', 2),
  section('backup', 'restore', 'restore', 2, true),
]);
