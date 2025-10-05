import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';

@Injectable({
  providedIn: 'root'
})
export class ConfigAfrService {

  constructor(private http: HttpClient) {  }

  getConfigWeb(){

  }
}
