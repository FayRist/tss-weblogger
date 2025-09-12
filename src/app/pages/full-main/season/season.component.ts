import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-season',
  imports: [],
  templateUrl: './season.component.html',
  styleUrl: './season.component.scss'
})
export class SeasonComponent implements OnInit {
  allSeason: any[] = [];
  private subscriptions: Subscription[] = [];

  constructor(private router: Router, private route: ActivatedRoute, private eventService: EventService) {
  }

  ngOnInit() {
    this.allSeason = [
    //   {
    //     seasonId: 1,
    //     seasonName: 'TSS The Super Series by B-Quik 2025',
    //   }
    ]
    this.loadSeason();
  }

  navigateToEvent(){
    this.router.navigate(['/pages', 'event']);
  }


  private loadSeason(): void {
    const MatchSub = this.eventService.getSeason().subscribe(
      season => {
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
