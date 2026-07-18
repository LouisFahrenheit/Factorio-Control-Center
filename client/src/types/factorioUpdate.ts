import type { ModJobLogEntry } from '../types/modJob';

export interface FactorioUpdateStatus {
  running?: boolean;
  phase?: string;
  current_step?: number;
  total_steps?: number;
  from?: string;
  to?: string;
  final_to?: string;
  partial?: boolean;
  download_cur?: number;
  download_tot?: number;
  error?: string;
  error_key?: string;
  error_args?: (string | number)[];
  log?: ModJobLogEntry[];
}

export interface FactorioUpdateCheck {
  ok?: boolean;
  error?: string;
  current?: string;
  latest_stable?: string;
  updates?: { to?: string }[];
}

export interface FactorioPickState {
  current: string;
  stableTargets: string[];
  releases: { stable: string[]; experimental: string[] };
}
