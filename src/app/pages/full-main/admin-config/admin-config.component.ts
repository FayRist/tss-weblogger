import { Component, inject, OnInit } from '@angular/core';
import { DateRangePipe } from '../../../utility/date-range.pipe';
import { EventService } from '../../../service/event.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TimeService } from '../../../service/time.service';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { Subscription } from 'rxjs';
import { LiveAnnouncer } from '@angular/cdk/a11y';

@Component({
  selector: 'app-admin-config',
  imports: [MatCardModule, MatChipsModule, MatProgressBarModule, MatPaginatorModule, CommonModule
    , MatIconModule ,MatBadgeModule, MatButtonModule, MatToolbarModule, MatTableModule, MatSortModule
    , FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule
    , MatSlideToggleModule, MatMenuModule],
  templateUrl: './admin-config.component.html',
  styleUrl: './admin-config.component.scss'
})
export class AdminConfigComponent implements OnInit {

  private _liveAnnouncer = inject(LiveAnnouncer);
  private subscriptions: Subscription[] = [];

  configName:string = ''
  constructor(private router: Router, private route: ActivatedRoute,
      private eventService: EventService, private toastr: ToastrService, public time: TimeService) {
  }

  ngOnInit() {
  }
}
