import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatTooltipModule } from '@angular/material/tooltip';

import { StepLineChartComponent } from './step-line-chart.component';

describe('StepLineChartComponent', () => {
  let component: StepLineChartComponent<any>;
  let fixture: ComponentFixture<StepLineChartComponent<any>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StepLineChartComponent],
      imports: [NoopAnimationsModule, OverlayModule, MatTooltipModule]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StepLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
