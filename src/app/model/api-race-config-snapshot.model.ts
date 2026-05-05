export type RaceConfigMode = 'live' | 'history';
export type RaceConfigSource = 'snapshot' | 'global' | 'global_fallback';

export interface AfrConfig {
  afr_penalty_low: number;
  afr_warning_high: number;
  afr_warning_seconds: number;
  afr_penalty_seconds: number;
  afr_warnings_per_penalty: number;
  afr_penalty_also_increments_warning: boolean;
  max_count: number;
  graphs_afr_min: number;
  graphs_afr_max: number;
  afr_alert_on_off: boolean;
}

export interface RaceConfigSnapshotMeta {
  captured_at?: string;
  captured_from?: string;
}

export interface RaceConfigSnapshotApiResponse {
  success: boolean;
  race_id: number;
  mode: RaceConfigMode;
  source: RaceConfigSource;
  schema_version: number;
  config: AfrConfig;
  meta?: RaceConfigSnapshotMeta;
}
