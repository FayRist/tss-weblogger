import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { AuthService, PermissionItem } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-season',
  imports: [],
  templateUrl: './season.component.html',
  styleUrl: './season.component.scss'
})
export class SeasonComponent implements OnInit {
  allSeason: any[] = [];
  private subscriptions: Subscription[] = [];
  permissionsListData: PermissionItem[] = [];

  constructor(private router: Router, private route: ActivatedRoute, private eventService: EventService, private auth: AuthService) {
  }

  ngOnInit() {
    this.permissionsListData = this.auth.getPermissionsByPath('pages/season');
    this.allSeason = [
      {
        seasonId: 1,
        seasonName: 'TSS The Super Series by B-Quik 2025',
      }
    ]
    this.loadSeason();
  }

  permissionsCheck(type: string): boolean {
    return this.permissionsListData.some(p => this.auth.normalizePermissionType(p.type) === this.auth.normalizePermissionType(type));
  }

  navigateToEvent(){
    this.router.navigate(['/pages', 'event']);
  }


  private loadSeason(): void {
    const MatchSub = this.eventService.getSeason().subscribe(
      season => {
        this.allSeason = [];
        this.allSeason = season;
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }
}
