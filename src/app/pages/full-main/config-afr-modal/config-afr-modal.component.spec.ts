import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigAfrModalComponent } from './config-afr-modal.component';

describe('ConfigAfrModalComponent', () => {
  let component: ConfigAfrModalComponent;
  let fixture: ComponentFixture<ConfigAfrModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfigAfrModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfigAfrModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
