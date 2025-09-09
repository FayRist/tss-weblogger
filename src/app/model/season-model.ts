export interface Race {
  raceMatchId: number;
  eventId: number;
  seasonId: number;
  raceName: string;
  raceSegment: string;  // เช่น 'Pickup'
  raceSession: string;  // เช่น 'Race 5'
  raceClass: string;    // เช่น 'Class C'
  raceStart: Date;
  raceEnd: Date;
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

