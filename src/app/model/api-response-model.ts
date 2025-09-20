import { optionModel } from "./season-model";

// API Response interface for loggers
export interface ApiLoggerResponse {
  count: number;
  data: ApiLoggerData[];
  success: boolean;
}

export interface ApiLoggerData {
  id: number;
  logger_id: string;
  car_number: string;
  first_name: string;
  last_name: string;
  class_type: string;
}

export interface ApiEventResponse {
  count: number;
  data: ApiEventData[];
  success: boolean;
}

export interface ApiEventData {
  event_id: number;
  season_id: number;
  event_name: string;
  circuit_name: string;
  event_start: Date;
  event_end: Date;
}
export interface ApiDropDownResponse {
  count: number;
  data: optionModel[];
  success: boolean;
}


export interface ApiSeasonResponse {
  count: number;
  data: ApiSeasonData[];
  success: boolean;
}

export interface ApiSeasonData {
  season_id: number;
  season_name: string;
  created_at: Date;
}

export interface ApiRaceResponse {
  count: number;
  data: ApiRaceData[];
  success: boolean;
}

export interface ApiRaceData {
  id_list: number;
  event_id: number;
  season_id: number;
  category_name: string;
  class_value: string;
  segment_value: string;
  session_value: string;
  session_start: Date;
  session_end: Date;
}


