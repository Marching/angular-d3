import { OverlayModule } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PlotHeatmapChartComponent } from './plot-heatmap-chart.component';

/**
 * Host Test Component
 */
@Component({
  selector: 'app-host',
  template: '<app-plot-heatmap-chart [rows]="2" [cols]="2" [data]="[]"></app-plot-heatmap-chart>'
})
class HostTestComponent {}

describe('PlotHeatmapChartComponent', () => {
  let hostComponent: HostTestComponent;
  let component: PlotHeatmapChartComponent<any>;
  let fixture: ComponentFixture<HostTestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostTestComponent, PlotHeatmapChartComponent],
      imports: [
        NoopAnimationsModule,
        OverlayModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HostTestComponent);
    hostComponent = fixture.componentInstance;
    component = fixture.debugElement.query(By.directive(PlotHeatmapChartComponent))
      .componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
