import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import { eventModel, LoggerModel, optionModel, RaceModel, SeasonalModel } from '../model/season-model';
import { ExcelRowPayLoad } from '../pages/full-main/setting-logger/add-logger/add-logger.component';
import { eventPayLoad, seasonalPayLoad } from '../pages/full-main/add-event/add-event.component';
import { ApiDropDownResponse, ApiEventResponse, ApiLoggerResponse, ApiRaceResponse, ApiSeasonResponse } from '../model/api-response-model';

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private loggerList: LoggerModel[] = [];
  private seasonalList: SeasonalModel[] = [];
  private raceList: RaceModel[] = [];
  private eventList: eventModel[] = [];
  public eventOption: optionModel[] = [];
  constructor(private http: HttpClient) {  }

  // --------- Event -------------------------------------------------------
  getEvent(): Observable<eventModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_EVENT);
      return this.http.get<ApiEventResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.eventList = response.data.map((apiData) => ({
              event_id: apiData.event_id,
              season_id: apiData.season_id,
              event_name: apiData.event_name,
              circuit_name: apiData.circuit_name,
              event_start: new Date(apiData.event_start),
              event_end: new Date(apiData.event_end),
          }));
          return this.eventList;
        })
      );
  }

  getDropDownEvent(): Observable<optionModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.EVENT_DROPDOWN);
      return this.http.get<ApiDropDownResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.eventOption = response.data.map((apiData) => ({
              name: apiData.name,
              value: apiData.value,
          }));
          return this.eventOption;
        })
      );
  }

  addNewEvent(addEvent: eventPayLoad): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_EVENT);
    return this.http.post(eventUrl, addEvent).pipe(
      map(response => {
        console.log('Event added successfully:', response);
        return response;
      }),
      catchError(error => {
        console.error('Error adding Event:', error);
        throw error;
      })
    );
  }

  updateEditEvent(editEvent: any): Observable<unknown> {
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_EVENT);
      return this.http.post(eventUrl, editEvent).pipe(
        map(response => {
          console.log('Event added/updated successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Error adding/updating Event:', error);
          throw error;
        })
      );
    }

  deleteEvent(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_EVENT);
    return this.http.post(eventUrl, eventID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => {
        console.error('Error Delete Event:', error);
        throw error;
      })
    );
  }

  // ------------Race-----------------------------

  getRace(eventId: any): Observable<RaceModel[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_RACE);
    let params = new HttpParams();
    if (eventId != null) {
      params = params.set('eventId', eventId.toString());
    }

    return this.http.get<ApiRaceResponse>(url, { params }).pipe(
          map(response => {
          // Map API data to Match interface

          this.raceList = response.data.map((apiData) => ({
              id_list: apiData.id_list,
              event_id: apiData.event_id,
              season_id: apiData.season_id,
              category_name: apiData.category_name,
              class_value: apiData.class_value,
              segment_value: apiData.segment_value,
              session_value: apiData.session_value,
              session_start: apiData.session_start,
              session_end: apiData.session_end,
          }));
          return this.raceList;
        })
      );
  }

  addNewRace(addEvent: RaceModel[]): Observable<unknown> {
    const raceUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_RACE);
    return this.http.post(raceUrl, addEvent).pipe(
      map(response => {
        console.log('Event added successfully:', response);
        return response;
      }),
      catchError(error => {
        console.error('Error adding Event:', error);
        throw error;
      })
    );
  }

  updateRace(editRace: any): Observable<unknown> {
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_RACE);
      return this.http.post(eventUrl, editRace).pipe(
        map(response => {
          console.log('Race added/updated successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Race adding/updating Event:', error);
          throw error;
        })
      );
    }

  deleteRace(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_RACE);
    return this.http.post(eventUrl, eventID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => {
        console.error('Error Delete Event:', error);
        throw error;
      })
    );
  }
// --------- Season -------------------------------
  getSeason(): Observable<SeasonalModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_SEASON);
      return this.http.get<ApiSeasonResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.seasonalList = response.data.map((apiData) => ({
            id: apiData.season_id,
            seasonName: apiData.season_name,
            creatDate: new Date(),
          }));
          return this.seasonalList;
        })
      );
  }

  addNewSeason(addSeason: seasonalPayLoad): Observable<unknown> {
    const seasonUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_SEASON);
    return this.http.post(seasonUrl, addSeason).pipe(
      map(response => {
        console.log('Season added successfully:', response);
        return response;
      }),
      catchError(error => {
        console.error('Error adding Season:', error);
        throw error;
      })
    );
  }
// --------- Logger -------------------------------
    getLogger(classType?: string | string[]): Observable<LoggerModel[]> {

      let params = new HttpParams();
      if (Array.isArray(classType)) {
        // ส่งหลายค่า: /loggers?class_type=a&class_type=b
        classType.forEach(v => params = params.append('class_type', v));
      } else if (classType) {
        // ส่งค่าเดียว: /loggers?class_type=a
        params = params.set('class_type', classType);
      }
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_LOGGERS);
      return this.http.get<ApiLoggerResponse>(loggersUrl, { params }).pipe(
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

