export type MaintenanceModsGameVersionPolicy = 'cancel' | 'skip' | 'force';

export interface MaintenanceTaskOptions {
  update_mods?: boolean;
  update_factorio?: boolean;
  maintenance?: boolean;
  mods_game_version_policy?: MaintenanceModsGameVersionPolicy;
}

export interface MaintenanceTask {
  id?: string;
  active?: boolean;
  manual_only?: boolean;
  time_hhmm?: string;
  weekdays?: number[];
  repeat_weekly?: boolean;
  timezone?: string;
  instance_ids?: string[];
  next_fire_iso?: string;
  options?: MaintenanceTaskOptions;
}

export interface MaintenanceResponse {
  tasks?: MaintenanceTask[];
  scheduler_tz?: string;
  ok?: boolean;
  error?: string;
}

export interface MaintenanceReportStep {
  kind?: string;
  t?: string;
  ok?: boolean;
  error?: string;
  detail?: unknown;
  instance_id?: string;
  web_actor?: string;
  after_error?: string;
  diff?: Record<string, unknown>;
  sub_steps?: MaintenanceReportStep[];
  task_id?: string;
  run_trigger?: string;
  [key: string]: unknown;
}

export interface MaintenanceReport {
  started_at?: string;
  finished_at?: string;
  run_id?: string;
  task_id?: string;
  instance_id?: string;
  instance_name?: string;
  success?: boolean;
  error?: string;
  run_trigger?: string;
  event_kind?: string;
  report_kind?: string;
  period_label?: string;
  open?: boolean;
  web_actor?: string;
  task_options?: MaintenanceTaskOptions;
  steps?: MaintenanceReportStep[];
}

export interface MaintenanceReportsResponse {
  reports?: MaintenanceReport[];
}
