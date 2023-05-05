import { NgModule } from '@angular/core';
import { CommonModule, PercentPipe } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BarChartComponent } from './bar-chart/bar-chart.component';
import { SunburstChartComponent } from './sunburst-chart/sunburst-chart.component';
import { PlotHeatmapChartComponent } from './plot-heatmap-chart/plot-heatmap-chart.component';
import { StepLineChartComponent } from './step-line-chart/step-line-chart.component';

@NgModule({
  declarations: [
    BarChartComponent,
    PlotHeatmapChartComponent,
    StepLineChartComponent,
    SunburstChartComponent
  ],
  exports: [
    BarChartComponent,
    PlotHeatmapChartComponent,
    StepLineChartComponent,
    SunburstChartComponent
  ],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    OverlayModule,
    PortalModule
  ],
  providers: [
    PercentPipe
  ]
})
export class ChartModule {}
