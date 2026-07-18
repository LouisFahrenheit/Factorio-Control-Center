import type { MapGenUiState } from './types';

export type MapGenUserPreset = {
  id: string;
  name: string;
  createdAt: number;
  state: Omit<MapGenUiState, 'seed'>;
};

export type MapGenUserPresetApiRecord = {
  id: string;
  name: string;
  created_at?: string;
  state: Omit<MapGenUiState, 'seed'>;
};

export function userPresetPickerValue(id: string): string {
  return `user:${id}`;
}

export function parseUserPresetPickerValue(value: string): string | null {
  return value.startsWith('user:') ? value.slice(5) : null;
}

export function mapPresetRecordFromApi(record: MapGenUserPresetApiRecord): MapGenUserPreset {
  const createdAt = Date.parse(String(record.created_at || ''));
  return {
    id: record.id,
    name: record.name,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    state: record.state,
  };
}

export function mapGenUiStateWithoutSeed(state: MapGenUiState): Omit<MapGenUiState, 'seed'> {
  const { seed: _seed, ...rest } = state;
  return rest;
}
