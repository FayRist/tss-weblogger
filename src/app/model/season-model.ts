export interface SeasonalModel {
  id: number;
  seasonName: string;
  creatDate: Date;
}

export interface RaceModel {
  id_list: number;
  season_id: number;
  event_id: number
  category_name: string;
  class_value: string;
  segment_value: string;
  session_value: string;
  session_start: Date | null;
  session_end: Date | null;
}
export interface eventModel {
  event_id: number;
  season_id: number;
  event_name: string;
  circuit_name: string;
  event_start: Date;
  event_end: Date;
}


export interface LoggerModel {
  id: number;
  loggerId: string;
  carNumber: string;
  firstName: string;
  lastName: string;
  createdDate: Date;
  numberWarning: number;
  warningDetector: boolean;
}

