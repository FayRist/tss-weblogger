export interface MapPointConfig {
  id?: number;
  map_code: string;
  map_name: string;
  lat: number;
  lon: number;
  zoom: number;
  rotation: number;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MapViewConfig {
  lat: number;
  lng: number;
  zoom: number;
  rotation: number;
}

export interface MapPointConfigApiResponse {
  success: boolean;
  count?: number;
  data?: MapPointConfig[];
}
