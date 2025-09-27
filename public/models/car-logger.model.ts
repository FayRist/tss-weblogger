export interface CarLogger {
  sats: string;
  time: string;
  lat: string;
  long: string;
  velocity: number;
  heading: string;
  height: string;
  FixType: string;
  accelX: string;
  accelY: string;
  accelZ: string;
  accelSqrt: string;
  gyroX: string;
  gyroY: string;
  gyroZ: string;
  magX: string;
  magY: string;
  magZ: string;
  mDirection: string;
  Time_ms: string;
  averageHeight: number;
};


export interface CarLoggerMeta {
  loggerId: string;
  carNumber: string;
  firstName: string;
  lastName: string;
  createdDate: Date;
  numberLimit: number;
  warningDetector: boolean;
}
