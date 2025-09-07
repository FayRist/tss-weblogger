import { Racer } from "../racer.model";

export const RACERS: Racer[] = [
  {
    id: 1,
    matchId: '1',
    loggerId: 'LG-001',
    carNumber: '23',
    carType: 'PickUp01',
    racerName: 'Test01',
    onlineStatus: true,
    warningCode: 0
  },
  {
    id: 2,
    matchId: '1',
    loggerId: 'LG-002',
    carNumber: '45',
    carType: 'F1',
    racerName: 'Test02',
    onlineStatus: false,
    warningCode: 2
  },
  {
    id: 3,
    matchId: '1',
    loggerId: 'LG-003',
    carNumber: '77',
    carType: 'Civic FK',
    racerName: 'Test03',
    onlineStatus: true,
    warningCode: 1
  }
];
