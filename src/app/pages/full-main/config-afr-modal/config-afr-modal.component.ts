import { filter } from 'rxjs/operators';
import { Component, inject, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ThemePalette } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { EventService } from '../../../service/event.service';
import { AuthService } from '../../../core/auth/auth.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
// import { ColorPickerModule } from "ngx-color-picker";
// import { InputFieldColorComponent } from "./app/color-input.component/color-input.

export interface configAFRModel {
  idConfig: number;
  formCode: string;
  value: string;
  configName: string;
}

@Component({
  selector: 'app-config-afr-modal',
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule, MatTabsModule,   MatDialogActions,
    MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    // BrowserModule,
    // BrowserAnimationsModule,
    // HttpClientModule,
    // DemoMaterialModule,
    // MatNativeDateModule,
    // ColorPickerModule,
    MatCardModule,
    MatCheckboxModule,
    MatSliderModule,
  ],
  templateUrl: './config-afr-modal.component.html',
  styleUrl: './config-afr-modal.component.scss',
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'fill' } },
  ]
})
export class ConfigAfrModalComponent  implements OnInit {

  color: ThemePalette = 'primary';
  touchUi = false;
  colorCtr: AbstractControl = new FormControl(null);

  readonly dialogRef = inject(MatDialogRef<ConfigAfrModalComponent>);
  readonly data:any = inject<configAFRModel>(MAT_DIALOG_DATA);
  formCode: string = '';
  configName: string = '';
  value: string = '';
  idConfig: number = 0;
  countMax: number = 0;
  countMin: number = 0;
  afrLimit: number = 0;

  CountMaxSlider = 30;
  CountMinSlider = 0;
  CountStepSlider = 1;
  CountThumbLabelSlider = true;
  CountShowTicksSlider = true;

  LimitMaxSlider = 30;
  LimitMinSlider = 0;
  LimitStepSlider = 1;
  LimitThumbLabelSlider = true;
  LimitShowTicksSlider = true;

  configAFR: any;
  private subscriptions: Subscription[] = [];


  constructor(private eventService: EventService, private authService: AuthService,private toastr: ToastrService) {}

  ngOnInit() {
    this.getAllConfig();
  }

  getAllConfig(){

    const form_code = `max_count, limit_afr`
    const MatchSub = this.eventService.getConfigAdmin(form_code).subscribe(
      config => {
        this.configAFR = [];
        this.configAFR = config;
        this.afrLimit = this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'limit_afr')[0].value;
        this.countMax = this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'max_count')[0].value;
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);

  }

  submitUpdateConfig(){
    this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'limit_afr')[0].value =this.afrLimit.toString();
    this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'max_count')[0].value =this.countMax.toString();

    this.eventService.updateConfig(this.configAFR).subscribe(
        response => {
          console.log('Update Config successfully:', response);
          // this.toastr.success(`Reset Count Logger ${this.loggerId} สำเร็จ`);
          this.toastr.success('Update Config สำเร็จ');
          this.dialogRef.close('success');
        },
        error => {
          console.error('Error Update Config:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ Update Config');
        }
    );
  }

}
