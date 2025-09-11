import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import { LoggerModel, RaceModel, SeasonalModel } from '../model/season-model';
import { ExcelRowPayLoad } from '../pages/full-main/setting-logger/add-logger/add-logger.component';


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
  category_name: string;
  class_name: string;
  session_name: string;
  start_date: Date;
  end_date: Date;
}

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private loggerList: LoggerModel[] = [];
  private eventList: SeasonalModel[] = [];
  private raceList: RaceModel[] = [];
  constructor(private http: HttpClient) {  }


    getRace(): Observable<RaceModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_RACE);
      return this.http.get<ApiRaceResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.raceList = response.data.map((apiData) => ({
              IDList: apiData.id_list,
              EventID: apiData.event_id,
              CategoryName: apiData.category_name,
              ClassName: apiData.class_name,
              SessionName: apiData.session_name,
              StartDate: apiData.start_date,
              EndDate: apiData.end_date,
          }));
          return this.raceList;
        })
      );
  }
// --------- Season -------------------------------
  getSeason(): Observable<SeasonalModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_SEASON);
      return this.http.get<ApiSeasonResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.eventList = response.data.map((apiData) => ({
            id: apiData.season_id,
            seasonName: apiData.season_name,
            creatDate: new Date(),
          }));
          return this.eventList;
        })
      );
  }
// --------- Logger -------------------------------
    getLogger(): Observable<LoggerModel[]> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_LOGGERS);
      return this.http.get<ApiLoggerResponse>(loggersUrl).pipe(
        map(response => {
          // Map API data to Match interface
          this.loggerList = response.data.map((apiData) => ({
            id: apiData.id,
            loggerId: apiData.logger_id,
            carNumber: apiData.car_number,
            firstName: apiData.first_name,
            lastName: apiData.last_name,
            createdDate: new Date(),
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

    updateEditLogger(editLogger: any): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_LOGGER);
      return this.http.post(loggersUrl, editLogger).pipe(
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

    deleteLogger(loggerID: any): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_LOGGER);
      return this.http.post(loggersUrl, loggerID).pipe(
        map(response => {
          console.log('Loggers Delete successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Error Delete loggers:', error);
          throw error;
        })
      );
    }
}

