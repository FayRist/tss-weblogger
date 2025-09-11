export interface SeasonalModel {
  id: number;
  seasonName: string;
  creatDate: Date;
}

export interface RaceModel {
  IDList: number;
  EventID: number;
  CategoryName: string;
  ClassName: string;
  SessionName: string;
  StartDate: Date;
  EndDate: Date;
}
export interface eventModel {
  eventId: number;
  seasonId: number;
  eventName: string;
  circuitName: string;
  eventStart: Date;
  eventEnd: Date;
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

