import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import { handleHttpError } from '../utility/http-error-handler.util';
import { eventModel, LoggerDetailPayload, LoggerModel, optionEventModel, optionModel, RaceModel, SeasonalModel } from '../model/season-model';
import { ExcelRowPayLoad } from '../pages/full-main/setting-logger/add-logger/add-logger.component';
import { eventPayLoad, seasonalPayLoad } from '../pages/full-main/add-event/add-event.component';
import { ApiConfigResponse, ApiDropDownoptionEventResponse, ApiDropDownResponse, ApiEventResponse, ApiExportDataLoggerInRaceResponse, ApiLoggerAFR, ApiLoggerAFRResponse, ApiLoggerRaceResponse, ApiLoggerResponse, ApiRaceResponse, ApiSeasonResponse, ApiUsersResponse, ExportDataLoggerInRaceModel, LoggerItem, LoggerRaceDetailModel } from '../model/api-response-model';
import { ApiGetLoggerDateResponse, LoggerByDateItem } from '../model/api-response-Logger-model';
import { configAFRModel } from '../pages/full-main/config-afr-modal/config-afr-modal.component';
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
  public eventOption: optionEventModel[] = [];
  public option: optionModel[] = [];
  public dataLoggerInRace: ExportDataLoggerInRaceModel[] = [];
  constructor(private http: HttpClient) {  }

  // ------GET Deatil Logger----------

  // service method
  getDetailLoggerInRace(
    parameterRaceId: any,
    parameterSegment: any,
    parameterClass: any,
    parameterLoggerID: any
  ): Observable<LoggerRaceDetailModel> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_DETAIL_LOGGERS_IN_RACE);
    const payload = {
      race_id: toIntOrDefault(parameterRaceId ?? 3, 3),
      segment_type: toStrDefault(parameterSegment ?? 'pickup', 'pickup'),
      class_type: toStrDefault(parameterClass ?? 'a', 'a'),
      logger_id: parameterLoggerID,
    };

    return this.http.post<ApiLoggerRaceResponse>(url, payload).pipe(
      map(({ data }) => ({
        loggerId: data.LoggerID,
        carNumber: data.CarNumber,
        firstName: data.FirstName,
        lastName: data.LastName,
        classType: data.ClassType,
        segmentValue: data.SegmentValue,
        seasonId: data.SeasonID,
        categoryName: data.CategoryName,       // <- เดิมคุณเผลอใส่ segmentValue
        sessionValue: data.SessionValue,
        circuitName: data.Circuitname,

        // ป้องกัน null/undefined → ให้เป็น number/string เสมอ
        countDetect: Number(data.countDetect ?? 0),
        afr: Number(data.afr ?? 0),
        afrAverage: Number(data.afrAverage ?? 0),
        status: String(data.status ?? ''),
        onlineTime: data.onlineTime,
        disconnectTime: data.disconnectTime,
      }))
    );
  }

    // service method
  getDataLoggerInRace(
    parameterRaceId: any,
    parameterLoggerID: any
  ): Observable<ExportDataLoggerInRaceModel[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.EXPORT_RACE_DATA_LOGGER);
    const payload = {
      raceId: toIntOrDefault(parameterRaceId ?? 3, 3),
      loggerId: parameterLoggerID,
    };

    return this.http.post<ApiExportDataLoggerInRaceResponse>(url, payload).pipe(
        map(response => {
          // Map API data to Match interface
          if(!response.data){
            return [];
          }

          this.dataLoggerInRace = response.data.map((data) => ({
              velocity: data.velocity || 0,
              height: data.height || 0,
              heading: data.heading || 0,
              lat: data.lat || 0,
              long: data.long || 0,
              sats: data.sats || 0,
              fixtype: data.fixtype || 0,
              accelx: data.accelx || 0,
              accely: data.accely || 0,
              accelz: data.accelz || 0,
              accelsqrt: data.accelsqrt || 0,
              gyrox: data.gyrox || 0,
              gyroy: data.gyroy || 0,
              gyroz: data.gyroz || 0,
              magx: data.magx || 0,
              magy: data.magy || 0,
              magz: data.magz || 0,
              mdirection: data.mdirection || 0,
              time_ms: data.time_ms || 0,
              car_id: data.car_id || 0,
              afr: data.afr || 0,
              rpm: data.rpm || 0,
          }));
          return this.dataLoggerInRace;
      })
    );
  }


  // --------- Event -------------------------------------------------------
  getEvent(): Observable<eventModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_EVENT);
      return this.http.get<ApiEventResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.eventList = response.data.map((apiData) => ({
              event_id: apiData.eventid,
              season_id: apiData.seasonid,
              event_name: apiData.eventname,
              circuit_name: apiData.circuitname,
              event_start: new Date(apiData.eventstart),
              event_end: new Date(apiData.eventend),
              active: apiData.active
          }));
          return this.eventList;
        })
      );
  }

  getDropDownEvent(): Observable<optionEventModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.EVENT_DROPDOWN);
      return this.http.get<ApiDropDownoptionEventResponse>(seasonURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.eventOption = response.data.map((apiData) => ({
              name: apiData.name,
              value: apiData.value,
              c_name: apiData.c_name,
              active: apiData.active,
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
          if(!response.data){
            return [];
          }

          this.option = response.data.map((apiData) => ({
              name: apiData.name,
              value: apiData.value,
          }));
          return this.option;
        })
      );
  }

  getDropDownSession(eventId: any, raceId:any): Observable<optionModel[]> {
    const seasonURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.EVENT_SESSION_DROPDOWN);
      const payload = {
        eventid: eventId,
        seasonid: raceId
      }
      return this.http.post<ApiDropDownResponse>(seasonURL, payload).pipe(
        map(response => {
          // Map API data to Match interface
          if(!response.data){
            return [];
          }
          this.option = response.data.map((apiData) => ({
              name: apiData.name,
              value: apiData.value,
          }));
          return this.option;
        })
      );
  }

  addNewEvent(addEvent: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_EVENT);
    return this.http.post(eventUrl, addEvent).pipe(
      map(response => {
        console.log('Event added successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('adding Event', error))
    );
  }

  updateEditEvent(editEvent: any): Observable<unknown> {
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_EVENT);
      return this.http.post(eventUrl, editEvent).pipe(
        map(response => {
          console.log('Event added/updated successfully:', response);
          return response;
        }),
      catchError(error => handleHttpError('adding/updating Event', error))
      );
    }

    updateActiveEvent(editEvent: any): Observable<unknown> {
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ACTIVE_EVENT);
      return this.http.post(eventUrl, editEvent).pipe(
        map(response => {
          console.log('Event added/updated successfully:', response);
          return response;
        }),
      catchError(error => handleHttpError('adding/updating Event', error))
      );
    }


  deleteEvent(configID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_CONFIG);
    return this.http.post(eventUrl, configID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('deleting Event', error))
    );
  }

  endEvent(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.END_EVENT);
    return this.http.post(eventUrl, eventID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('deleting Event', error))
    );
  }
  // ------------Race-----------------------------

  getRace(eventId: any, statusRace: string): Observable<RaceModel[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_RACE);
    let httpParams = new HttpParams();

    if (eventId != null) {
      httpParams = httpParams.set('eventId', eventId.toString());
    }

    if (statusRace != null && statusRace !== '') {
      httpParams = httpParams.set('statusRace', statusRace);
    }

    return this.http.get<ApiRaceResponse>(url, { params: httpParams }).pipe(
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
              active: apiData.active,
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
      catchError(error => handleHttpError('adding Event', error))
    );
  }

  updateRace(editRace: any): Observable<unknown> {
      const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_RACE);
      return this.http.post(eventUrl, editRace).pipe(
        map(response => {
          console.log('Race added/updated successfully:', response);
          return response;
        }),
      catchError(error => handleHttpError('adding/updating Race', error))
      );
    }

  deleteRace(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_RACE);
    return this.http.post(eventUrl, eventID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('deleting Event', error))
    );
  }

  endRace(eventID: any): Observable<unknown> {
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.END_RACE);
    return this.http.post(eventUrl, eventID).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('deleting Event', error))
    );
  }
  // --------- Config -------------------------------
  getConfigAdmin(formCode: any): Observable<unknown> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_CONFIG);
    let params = new HttpParams();
    if (formCode != null) {
      params = params.set('form_code', formCode.toString());
    }

    return this.http.get<ApiConfigResponse>(url, { params }).pipe(
      map(response => {
        console.log('Event Delete successfully:', response);
        return response?.data;
      }),
      catchError(error => handleHttpError('deleting Event', error))
    );
  }

  addNewConfig(configList: any): Observable<unknown> {
    const addConfigUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_CONFIG);
    return this.http.post(addConfigUrl, configList).pipe(
      map(response => {
        console.log('Config added successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('adding Config', error))
    );
  }

  updateConfig(configList: any[]): Observable<unknown> {
    const updateConfigUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_CONFIG);
    return this.http.post(updateConfigUrl, configList).pipe(
      map(response => {
        console.log('UPDATE CONFIG  successfully:', response);
        return response;
      }),
      catchError(error => handleHttpError('updating Config', error))
    );
  }

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
        teamName  : api.team_name,
        loggerStatus: 'offline',
        afrAverage: 15.6,
      })))
    );
  }

  getLoggerSetting(params: { circuitName?: string; eventId?: number }) {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_SETTING_LOGGERS);
    let httpParams = new HttpParams();

    if (params.circuitName) {
      httpParams = httpParams.set('circuit_name', params.circuitName);
    }

    if (params.eventId !== undefined && params.eventId !== null) {
      httpParams = httpParams.set('event_id', params.eventId.toString());
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
        teamName  : api.team_name,
        loggerStatus: 'offline',
        afrAverage: 15.6,
      })))
    );
  }

  getLoggersWithAfr(params: { raceId?: number; eventId?: number; circuitName?: string; limit?: number; offset?: number }) {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_LOGGERS); // endpoint เดิม ถ้าเปลี่ยน path ใส่ใหม่
    let httpParams = new HttpParams();

    // race_id=...
    if (params.raceId !== undefined && params.raceId !== null) {
      httpParams = httpParams.set('race_id', String(params.raceId));
    }

    // event_id=...
    if (params.eventId !== undefined && params.eventId !== null) {
      httpParams = httpParams.set('event_id', String(params.eventId));
    }

    // circuit_name=...
    if (params.circuitName) {
      httpParams = httpParams.set('circuit_name', params.circuitName);
    }

    if (params.limit)  httpParams = httpParams.set('limit',  String(params.limit));
    if (params.offset) httpParams = httpParams.set('offset', String(params.offset));

    return this.http.get<ApiLoggerAFRResponse>(url, { params: httpParams }).pipe(
      map((response) => {
        const rows = response.data ?? [];
        const items: LoggerItem[] = rows.map((api: ApiLoggerAFR) => ({
          id: api.id,
          idList: api.id_list ?? '',
          loggerId: api.logger_id,
          carNumber: api.car_number,
          firstName: api.first_name,
          lastName: api.last_name,
          createdDate: api.created_date ? new Date(api.created_date) : new Date(), // fallback
          classType: api.class_type,

          // ค่าจาก countdetect_afr (อาจเป็น null)
          countDetect: api.count_detect ?? null,
          currentCountDetect: api.current_count_detect ?? 0,
          afr: api.afr ?? null,
          afrAverage: api.afr_average ?? null,
          status: api.status ?? null,

          // ของเดิม
          numberLimit: 0,
          warningDetector: false,
          loggerStatus: 'offline',
          onlineTime: (api.online_time)? new Date(api.online_time) : null ,
          disconnectTime: (api.disconnect_time)? new Date(api.disconnect_time) : null

        }));
        return items;
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
        catchError(error => handleHttpError('adding/updating loggers', error))
      );
    }

    updateEditLogger(editLogger: any): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_LOGGER);
      return this.http.post(loggersUrl, editLogger).pipe(
        map(response => {
          console.log('Loggers added/updated successfully:', response);
          return response;
        }),
        catchError(error => handleHttpError('adding/updating loggers', error))
      );
    }

    deleteLogger(loggerID: any): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_LOGGER);
      return this.http.post(loggersUrl, loggerID).pipe(
        map(response => {
          console.log('Loggers Delete successfully:', response);
          return response;
        }),
        catchError(error => handleHttpError('deleting loggers', error))
      );
    }

    getLoggerByDate(
      date: Date | string | { date: Date | string },
      opts?: { limit?: number; offset?: number }
    ): Observable<{ items: LoggerByDateItem[]; count: number; limit: number; offset: number }> {
      const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_ALL_LOGGERS_DATE);

      // สร้าง ISO 8601 ให้ชัวร์ ไม่ว่าผู้ใช้จะส่งรูปแบบไหนมา
      const raw =
        typeof date === 'object' && 'date' in date ? (date as any).date : date;
      const iso =
        raw instanceof Date
          ? raw.toISOString()
          : new Date(raw ?? new Date()).toISOString();

      const payload = { date: iso };

      // เพิ่ม query params สำหรับ pagination
      let params = new HttpParams();
      if (opts?.limit != null)  params = params.set('limit',  String(opts.limit));
      if (opts?.offset != null) params = params.set('offset', String(opts.offset));

      return this.http.post<ApiGetLoggerDateResponse>(url, payload, { params }).pipe(
        map((res) => {
          const items: LoggerByDateItem[] = (res.data ?? []).map((r) => ({
            id: r.ID,
            loggerId: r.LoggerID,
            carNumber: r.CarNumber,
            firstName: r.FirstName,
            lastName: r.LastName,
            createdDate: r.CreatedDate ? new Date(r.CreatedDate) : new Date(),
            classType: r.ClassType,
            teamName: r.TeamName,

            eventId: r.EventID,
            eventName: r.EventName,
            sessionValue: r.SessionValue,
            idList: r.IDList,
            segmentValue: r.SegmentValue,
            classValue: r.ClassValue,
            circuitName: r.CircuitName
          }));

          return {
            items,
            count: res.count ?? items.length,
            limit: res.limit ?? opts?.limit ?? 50,
            offset: res.offset ?? opts?.offset ?? 0,
          };
        }),
        catchError(error => handleHttpError('getting Logger by date', error))
      );
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
        catchError(error => handleHttpError('adding/updating Logger', error))
      );
      // return this.http.post<unknown>(url, { key });
    }

    resetLoggerById(loggerID: any): Observable<unknown> {
      const loggersUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.RESET_LOGGER);
      return this.http.post(loggersUrl, loggerID).pipe(
        map(response => {
          console.log('Loggers Delete successfully:', response);
          return response;
        }),
        catchError(error => handleHttpError('deleting loggers', error))
      );
    }


    getUser(user: string, PassHash:string): Observable<unknown> {
      const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USERS); // endpoint เดิม ถ้าเปลี่ยน path ใส่ใหม่
      let httpParams = new HttpParams();

      if (user) {
        httpParams = httpParams.set('username', user);
      }

      if (PassHash) {
        httpParams = httpParams.set('password_hash', PassHash);
      }

        return this.http.get<ApiUsersResponse>(url, { params: httpParams }).pipe(
        map(response => response.data.map(api => ({
          eMail: api.email,
          passwordHash: api.password_hash,
          roleId: api.role_id,
          username: api.username,
        })))
      );


    }

}


