import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import { eventModel, LoggerDetailPayload, LoggerModel, optionModel, RaceModel, SeasonalModel } from '../model/season-model';
import { ExcelRowPayLoad } from '../pages/full-main/setting-logger/add-logger/add-logger.component';
import { eventPayLoad, seasonalPayLoad } from '../pages/full-main/add-event/add-event.component';
import { ApiDropDownResponse, ApiEventResponse, ApiLoggerRaceResponse, ApiLoggerResponse, ApiRaceResponse, ApiSeasonResponse, LoggerRaceDetailModel } from '../model/api-response-model';
// helper เล็ก ๆ
const toIntOrDefault = (v: any, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toStrDefault = (v: any, d: string) => {
  const s = String(v ?? d).trim();
  return s ? s.toLowerCase() : d;
};
const toOptionalInt = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
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

  // ------GET Deatil Logger----------

  // service method
  getDetailLoggerInRace(parameterRaceId:any, parameterSegment:any, parameterClass:any, parameterLoggerID:any): Observable<LoggerRaceDetailModel> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_DETAIL_LOGGERS_IN_RACE);
    const payload = {
      race_id: toIntOrDefault(parameterRaceId ?? 3, 3),         // ถ้าไม่ส่งมา -> 6
      segment_type: toStrDefault(parameterSegment ?? 'pickup', 'pickup'),
      class_type: toStrDefault(parameterClass ?? 'a', 'a'),
      logger_id  : parameterLoggerID,
    }
    return this.http.post<ApiLoggerRaceResponse>(url, payload).pipe(
      map(({ data }) => ({
        loggerId: data.LoggerID,
        carNumber: data.CarNumber,
        firstName: data.FirstName,
        lastName: data.LastName,
        classType: data.ClassType,
        segmentValue: data.SegmentValue,
        seasonId: data.SeasonID,
        categoryName: data.CategoryName,
        sessionValue: data.SessionValue,
      }))
    );
  }

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

  getDropDownSegment(eventId: any, raceId: any): Observable<optionModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.EVENT_SEGMENT_DROPDOWN);
      const payload = {
        event_id: eventId,
        race_id: raceId
      }
      return this.http.post<ApiDropDownResponse>(seasonURL, payload).pipe(
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

  getDropDownSession(eventId: any, raceId:any): Observable<optionModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.EVENT_SESSION_DROPDOWN);
      const payload = {
        event_id: eventId,
        race_id: raceId
      }
      return this.http.post<ApiDropDownResponse>(seasonURL, payload).pipe(
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

  endEvent(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.END_EVENT);
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

  endRace(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.END_RACE);
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
  getLogger(params: { classTypes?: string[] }) {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_LOGGERS);
    let httpParams = new HttpParams();

    if (params.classTypes?.length) {
      params.classTypes.forEach(ct => httpParams = httpParams.append('class_type', ct)); // class_type=pickupa&class_type=pickupb
    }

    return this.http.get<ApiLoggerResponse>(url, { params: httpParams }).pipe(
      map(response => response.data.map(api => ({
        id: api.id,
        loggerId: api.logger_id,
        carNumber: api.car_number,
        firstName: api.first_name,
        lastName: api.last_name,
        createdDate: new Date(),
        numberLimit: 0,
        warningDetector: false,
        classType  : api.class_type,
        loggerStatus: 'offline',
        afrAverage: 15.6,
      })))
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

    getLoggerByDate(date:any): Observable<unknown> {
      const addLoggerUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_ALL_LOGGERS_DATE);
      // Map Racer interface to API request format
      // const requestData = {
      //   date: date
      // };

      const iso =
        date instanceof Date
          ? date.toISOString()
          : typeof date === 'string'
          ? new Date(date).toISOString()
          : date?.date instanceof Date
          ? date.date.toISOString()
          : new Date(date?.date ?? date).toISOString();

      const requestData = { date: date };

      // ดีบั๊กให้ชัวร์ว่ารูปแบบถูกต้อง
      console.log('payload:', requestData);
      return this.http.post(addLoggerUrl, requestData).pipe(
        map(response => {
          console.log('Get Logger successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Error Get Logger:', error);
          throw error;
        })
      );
      // return this.http.post<unknown>(url, { key });
    }


    getLoggerDataByKey(key: string, date:string): Observable<unknown> {
      const addLoggerUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LIST_LOGGER_FOREXCEL);
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_RACE);
      // Map Racer interface to API request format
      const requestData = {
        key: key,
        date: date
      };
      return this.http.post(addLoggerUrl, requestData).pipe(
        map(response => {
          console.log('Logger added/updated successfully:', response);
          return response;
        }),
        catchError(error => {
          console.error('Error adding/updating Logger:', error);
          throw error;
        })
      );
      // return this.http.post<unknown>(url, { key });
    }
}

