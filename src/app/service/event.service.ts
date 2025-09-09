import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import { LoggerModel } from '../model/season-model';
import { ExcelRowPayLoad } from '../pages/full-main/setting-logger/add-logger/add-logger.component';


// API Response interface for loggers
export interface ApiLoggerResponse {
  count: number;
  data: LoggerModel[];
  success: boolean;
}

export interface Match {
  id: number;
  name: string;
  tier: string;
  raceCount: string;
  event: string;
  statusName: string;
  startDate: Date;
  endDate: Date;
  trackImage?: string; // รูปภาพ track (optional)
}

export interface ApiMatchResponse {
  count: number;
  data: ApiMatchData[];
  success: boolean;
}

export interface ApiMatchData {
  id: number;
  name: string;
  tier: string;
  event: string;
  race_count: number;
  start_date: string;
  end_date: string;
  created_by: number;
}


@Injectable({
  providedIn: 'root'
})
export class EventService {
  private matchList: Match[] = [];
  private loggerList: LoggerModel[] = [];
  constructor(private http: HttpClient) {  }

    getMatch(): Observable<Match[]> {
      const matchesUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_MATCHES);
      return this.http.get<ApiMatchResponse>(matchesUrl).pipe(
        map(response => {
          // Map API data to Match interface
          this.matchList = response.data.map((apiData) => ({
            id: apiData.id,
            name: apiData.name,
            statusName: "",
            tier: apiData.tier,
            raceCount: apiData.race_count.toString(),
            event: apiData.event,
            startDate: new Date(apiData.start_date),
            endDate: new Date(apiData.end_date),
            trackImage: "assets/map-race/map-pangsan.png"
          }));
          return this.matchList;
        })
      );
    }

    getLogger(): Observable<LoggerModel[]> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_LOGGERS);
      return this.http.get<ApiLoggerResponse>(loggersUrl).pipe(
        map(response => {
          // Map API data to Match interface
          this.loggerList = response.data.map((apiData) => ({
            id: apiData.id,
            loggerId: apiData.loggerId,
            carNumber: apiData.carNumber,
            firstName: apiData.firstName,
            lastName: apiData.lastName,
            createdDate: new Date(apiData.createdDate),
            numberWarning: 0,
            warningDetector: false,

          }));
          return this.loggerList;
        })
      );
    }

    addAllNewLogger(addLoggers: ExcelRowPayLoad[]): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_LOGGER);
      return this.http.post(loggersUrl, addLoggers).pipe(
        map(response => {
          console.log('Loggers added/updated successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Error adding/updating loggers:', error);
          throw error;
        })
      );
    }
}

