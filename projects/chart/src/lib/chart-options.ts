import { InjectionToken, Type } from '@angular/core';
import { _TooltipComponentBase } from '@angular/material/tooltip';
import { interpolateHslLong } from 'd3-interpolate';
import { interpolateBlues } from 'd3-scale-chromatic';
import { scaleLinear, scaleOrdinal, scaleSequential } from 'd3-scale';

export const PRIMARY_COLOR = '#1da2db';

export const PRIMARY_COLORS: Array<string> = /*[
  // '#e1f4fa',
  '#b2e2f3',
  '#82cfec',
  '#55bee4',
  '#37b0e0',
  '#1da2db',
  '#1894cd',
  '#0f81ba',
  '#0e71a7',
  '#055285'
]; */
[
  '#a6aaad',
  '#11a3dc',
  '#5e92a8',
  '#10536d',
  '#012345'
];

export interface SeriesOptions {
  name?: string;
  color?: string;
  type?: string;
}

export type BaseValue = d3.NumberValue | string;

export type Styles = { [key: string]: string | number };

export type Style = Styles | ((...args) => Styles);

export const DISABLED_IDENTIFICATION = Symbol();

export type TimePrecision =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

const DEFAULT_FONT: Styles = {
  'font-family': 'Google Sans',
  'font-size': 14
};

export interface ZoomScale {
  (): this;
  (range: Array<number>): this;
  (domain: Array<BaseValue>, range: Array<number>): this;
  (x: BaseValue): number;

  copy(): ZoomScale;
  domain(): Array<BaseValue>;
  domain(domain: Array<BaseValue>): this;
  range(): Array<number>;
  range(range: Array<number>): this;
  rangeRound(): Array<number>;
  rangeRound(range: Array<number>): this;

  align?(): number;
  align?(value: number): this;
  bandwidth?(): number;
  clamp?(): boolean;
  clamp?(clamp: boolean): this;
  nice?(count?: number): this;
  invert?(value: number): d3.NumberValue;
  padding?(): number;
  padding?(padding: number): this;
  paddingInner?(): number;
  paddingInner?(padding: number): this;
  paddingOuter?(): number;
  paddingOuter?(padding: number): this;
  step?(): number;
  tickFormat?(): (domainValue: BaseValue, index: number) => BaseValue;
  tickFormat?(format): this;
}

/**
 * Implement d3.Scale series
 */
export interface ChartPalette<Range, Domain, Unknown = never | string | d3.Color> {
  (): this;
  (range: Range[]): this;
  (domain: Domain[], range: Range[]): this;
  (x: Domain): Range | Unknown;

  copy(): this;
  domain(): Domain[];
  domain(domain: Iterable<Domain>): this;
  range(): Range[];
  range(range: Iterable<Range>): this;
  unknown(): Unknown;
  unknown(value: Unknown): this;

  interpolate?(): d3.InterpolatorFactory<Range, Domain>;
  interpolate?(interpolate: d3.InterpolatorFactory<Range, Domain>): this;
}

export interface Dimension {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width: number;
  height: number;
}

export interface AxisOptions {
  type?: 'date' | 'number' | 'string';
  baseline?: {
    style?: Style;
  };
  clipped?: boolean;
  domain?: [number, number];
  font?: Style;
  format?: string | ((value, index: number) => string);
  padding?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  min?: d3.NumberValue;
  max?: d3.NumberValue;
  minZoom?: boolean | number | TimePrecision;
  maxZoom?: boolean | number | TimePrecision;
  step?: number;
  valueFun?(data): BaseValue;
  ticks?: {
    style?: Style;
  };
}

export interface ChartOptionsBase {
  padding?: {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
  valueFun?(...args): BaseValue | typeof DISABLED_IDENTIFICATION;
  domain?: 'auto' | 'static';
  colors?: Array<string | d3.Color>;
  palette?: ChartPalette<any, any, any>;
  lineStyle?: Style;
  selectedLineStyle?: Style;
  pointStyle?: Style;
  selectedPointStyle?: Style;
  tooltip?: {
    component?: Type<_TooltipComponentBase>;
    content?: (...args) => string;
    disabled?: boolean;
  };
  minZoom?: boolean | number;
  maxZoom?: boolean | number;
  xAxis?: AxisOptions;
  yAxis?: AxisOptions;
}

export const DEFAULT_CHART_OPTIONS = new InjectionToken<ChartOptionsBase>('Default chart options');

export interface BarChartOptions extends ChartOptionsBase {
  layout?: 'grouped' | 'stacked';
  delay?: number;
  maxBandWidth?: number;
}

export const DEFAULT_BAR_CHART_OPTIONS: BarChartOptions = {
  padding: {
    top: 10,
    right: 0,
    bottom: 30,
    left: 80
  },
  layout: 'grouped',
  delay: 20,
  maxBandWidth: 100,
  valueFun: (data) => data,
  colors: PRIMARY_COLORS,
  palette: (scaleSequential(interpolateBlues) as unknown) as ChartPalette<string, number, string>,
  xAxis: {
    type: 'string',
    clipped: true,
    font: DEFAULT_FONT,
    minZoom: 1,
    maxZoom: 10,
    padding: 10,
    position: 'bottom'
  },
  yAxis: {
    clipped: false,
    font: DEFAULT_FONT,
    minZoom: 1,
    maxZoom: 1,
    padding: 10,
    position: 'left'
  }
}

export type PlotHeatmapPalette = ChartPalette<
  string,
  d3.NumberValue | boolean | string,
  string | d3.Color
>;

export interface PlotHeatmapOptions extends ChartOptionsBase {
  valueFun?(data, col?: number, row?: number): BaseValue | typeof DISABLED_IDENTIFICATION;
  gridSpacing?: number;
  gridSize?: number;
  disabled?: {
    fillStyle?: string;
  };
  palette?: PlotHeatmapPalette;
}

export const DEFAULT_PLOT_HEATMAP_OPTIONS: PlotHeatmapOptions = {
  gridSpacing: 4,
  gridSize: 32,
  padding: {
    top: 40,
    right: 0,
    bottom: 0,
    left: 50
  },
  valueFun: (data) => data,
  disabled: {
    fillStyle: '#aaa'
  },
  palette: (scaleLinear([], []).interpolate(interpolateHslLong) as unknown) as PlotHeatmapPalette,
  minZoom: 0.5,
  maxZoom: 4,
  tooltip: {
    disabled: false
  },
  xAxis: {
    clipped: true,
    font: DEFAULT_FONT,
    padding: 10,
    position: 'top'
  },
  yAxis: {
    clipped: false,
    font: DEFAULT_FONT,
    padding: 10,
    position: 'left'
  }
};

export const DEFAULT_STEP_LINE_CHART_OPTIONS: ChartOptionsBase = {
  padding: {
    top: 0,
    right: 0,
    bottom: 40,
    left: 50
  },
  valueFun: (data) => data,
  colors: PRIMARY_COLORS,
  palette: (scaleOrdinal() as unknown) as ChartPalette<string, number, string>,
  lineStyle: {
    'stroke-width': 1
  },
  selectedLineStyle: {
    'stroke-width': 2
  },
  pointStyle: {
    r: 3,
    'fill-opacity': 0
  },
  selectedPointStyle: {
    r: 6,
    'fill-opacity': 1
  },
  minZoom: false,
  maxZoom: false,
  tooltip: {
    disabled: false
  },
  xAxis: {
    clipped: true,
    font: DEFAULT_FONT,
    padding: 10,
    position: 'bottom'
  },
  yAxis: {
    clipped: false,
    font: DEFAULT_FONT,
    padding: 10,
    position: 'left'
  }
};

export interface SunburstChartOptions extends ChartOptionsBase {
  delay?: number;
  font?: Style;
  title?: {
    font: Style
  };
}

export const DEFAULT_SUNBURST_CHART_OPTIONS: SunburstChartOptions = {
  padding: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10
  },
  delay: 20,
  font: {
    'pointer-events': 'none',
    'text-anchor': 'middle',
    'font-size': 10,
    'fill-opacity': 0.9
  },
  title: {
    font: {
      'dy': '0.35em'
    }
  },
  palette: (scaleOrdinal([], []) as unknown) as ChartPalette<string, number, string>
}
