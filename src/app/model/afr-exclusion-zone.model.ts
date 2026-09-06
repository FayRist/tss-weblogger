export type AfrExclusionShapeType = 'circle' | 'polygon';

export interface AfrExclusionZonePoint {
  lat: number;
  lon: number;
}

export interface AfrExclusionZone {
  id: number;
  circuit_name: string;
  zone_name: string;
  shape_type: AfrExclusionShapeType;
  enabled: boolean;
  center_lat?: number | null;
  center_lon?: number | null;
  radius_m?: number | null;
  points: AfrExclusionZonePoint[];
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export type AfrExclusionZonePayload = Omit<AfrExclusionZone, 'id' | 'updated_by' | 'created_at' | 'updated_at'>;

export type AfrExclusionZoneConfigItemPayload = Omit<AfrExclusionZonePayload, 'circuit_name'> & {
  id?: number;
};

export interface AfrExclusionZoneConfigPayload {
  circuit_name: string;
  zones: AfrExclusionZoneConfigItemPayload[];
}

export interface AfrExclusionZoneApiResponse {
  success: boolean;
  count?: number;
  data: AfrExclusionZone[];
}
