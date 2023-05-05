import {
  AfterViewInit,
  APP_ID,
  ChangeDetectorRef,
  Directive,
  ElementRef,
  Injector,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  ViewContainerRef
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AriaDescriber, FocusMonitor } from '@angular/cdk/a11y';
import { Directionality } from '@angular/cdk/bidi';
import { coerceBooleanProperty, coerceNumberProperty } from '@angular/cdk/coercion';
import { SelectionModel } from '@angular/cdk/collections';
import { FlexibleConnectedPositionStrategy, Overlay, ScrollDispatcher } from '@angular/cdk/overlay';
import { Platform } from '@angular/cdk/platform';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  MatTooltip,
  MAT_TOOLTIP_DEFAULT_OPTIONS,
  MAT_TOOLTIP_SCROLL_STRATEGY,
  _MatTooltipBase,
  _TooltipComponentBase
} from '@angular/material/tooltip';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, map } from 'rxjs/operators';
import { merge } from 'lodash';
import { filter as d3Filter, map as d3Map, max, range, ticks } from 'd3-array';
import { axisBottom, axisLeft, axisRight, axisTop } from 'd3-axis';
import { quantize } from 'd3-interpolate';
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { interpolateSinebow } from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import { zoom, ZoomTransform } from 'd3-zoom';

import {
  Dimension,
  ChartPalette,
  BaseValue,
  ChartOptionsBase,
  AxisOptions,
  ZoomScale,
  Style,
  Styles,
  DEFAULT_CHART_OPTIONS,
  TimePrecision,
  DISABLED_IDENTIFICATION
} from './chart-options';
import { axisTimeTickCount, axisTimeTickInterval } from './time-tick-interval';

declare const ngDevMode;
let chart_count = 0;

const ZOOM_CONSTRAIN = (
  transform: d3.ZoomTransform,
  extent: Array<[number, number]>,
  translateExtent: Array<[number, number]>
) => {
  const dx0 = transform.invertX(extent[0][0]) - translateExtent[0][0],
    dx1 = transform.invertX(extent[1][0]) - translateExtent[1][0],
    dy0 = transform.invertY(extent[0][1]) - translateExtent[0][1],
    dy1 = transform.invertY(extent[1][1]) - translateExtent[1][1];

  return transform.translate(
    dx1 > dx0 ? dx0 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? dy0 : Math.min(0, dy0) || Math.max(0, dy1)
  );
};

@Directive()
export abstract class ChartBase<D, O extends ChartOptionsBase>
  implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() data: Array<D> | Array<Array<D>>;
  @Input() selection: SelectionModel<D> | undefined;

  @Input() set options(value: O) {
    this.chartOptions = merge({}, this.injector.get(DEFAULT_CHART_OPTIONS), value);
  }
  get options(): O {
    return this.chartOptions;
  }

  tooltip: _MatTooltipBase<_TooltipComponentBase>;

  protected set xTransform(value: d3.ZoomTransform) {
    const xZoom = this.xZoom;

    value &&
      ((value = new ZoomTransform(
        Math.min(xZoom.scaleExtent()[1], Math.max(xZoom.scaleExtent()[0], value.k)),
        value.x,
        value.y
      )),
      (value = ZOOM_CONSTRAIN(value, (xZoom.extent() as any)(), xZoom.translateExtent())));

    this._xTransform = value;
  }
  protected get xTransform(): d3.ZoomTransform {
    return this._xTransform;
  }
  protected set yTransform(value: d3.ZoomTransform) {
    const yZoom = this.yZoom;

    value &&
      ((value = new ZoomTransform(
        Math.min(yZoom.scaleExtent()[1], Math.max(yZoom.scaleExtent()[0], value.k)),
        value.x,
        value.y
      )),
      (value = ZOOM_CONSTRAIN(value, (yZoom.extent() as any)(), yZoom.translateExtent())));
    this._yTransform = value;
  }
  protected get yTransform(): d3.ZoomTransform {
    return this._yTransform;
  }
  protected chartOptions: O;
  protected dimension = new DOMRect(0, 0, 0, 0);
  protected palette: ChartPalette<any, any, any>;
  protected xAxisScale: ZoomScale;
  protected xAxis: d3.Axis<BaseValue>;
  protected yAxisScale: ZoomScale;
  protected yAxis: d3.Axis<BaseValue>;
  protected readonly content: d3.Selection<SVGElement, any, any, any>;
  protected readonly zoom: d3.ZoomBehavior<Element, any>;
  protected readonly xZoom: d3.ZoomBehavior<Element, any>;
  protected readonly yZoom: d3.ZoomBehavior<Element, any>;
  protected readonly resizeObservable: Observable<DOMRect>;
  protected readonly subscription = new Subscription();
  protected readonly tooltipPositionStrategy: FlexibleConnectedPositionStrategy;
  protected readonly _container: HTMLElement;
  protected readonly _isDev: boolean = !!ngDevMode;
  protected readonly CONTENT_CLASS_NAME = 'drawing';
  protected readonly X_AXIS_CLASS_NAME = 'x-axis';
  protected readonly Y_AXIS_CLASS_NAME = 'y-axis';
  private readonly renderingObs: Subject<void>;
  private _xTransform: d3.ZoomTransform;
  private _yTransform: d3.ZoomTransform;
  private id_count: number;

  constructor(
    container: HTMLElement,
    protected renderer: Renderer2,
    protected changeDetectorRef: ChangeDetectorRef,
    protected overlay: Overlay,
    protected injector: Injector
  ) {
    const svgContent = this.createSVGElement('svg');
    const xAxisG = this.createSVGElement('g');
    const yAxisG = this.createSVGElement('g');
    const drawingGroup = this.createSVGElement('g');
    const canvasAreaRect = this.createSVGElement('rect');

    renderer.addClass(xAxisG, this.X_AXIS_CLASS_NAME);
    renderer.addClass(yAxisG, this.Y_AXIS_CLASS_NAME);
    renderer.addClass(drawingGroup, this.CONTENT_CLASS_NAME);
    renderer.addClass(canvasAreaRect, 'canvas-area');
    renderer.appendChild(svgContent, this.createSVGElement('defs'));
    renderer.appendChild(drawingGroup, canvasAreaRect);
    renderer.appendChild(svgContent, xAxisG);
    renderer.appendChild(svgContent, yAxisG);
    renderer.appendChild(svgContent, drawingGroup);
    renderer.appendChild(container, svgContent);

    this.id_count = ++chart_count;
    this.chartOptions = merge({}, injector.get(DEFAULT_CHART_OPTIONS)) as O;
    this._container = container;
    this.content = select(svgContent);
    this.resizeObservable = new Observable<DOMRect>((subscriber) => {
      const resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;

        subscriber.next(
          new DOMRect(
            Math.floor(rect.left),
            Math.floor(rect.top),
            Math.floor(rect.width),
            Math.floor(rect.height)
          )
        );
      });

      resizeObserver.observe(container);
      return function unsubscribe() {
        resizeObserver.disconnect();
      };
    });
    this.renderingObs = new Subject();

    this.zoom = zoom().constrain(ZOOM_CONSTRAIN);
    this.xZoom = zoom().constrain(ZOOM_CONSTRAIN);
    this.yZoom = zoom().constrain(ZOOM_CONSTRAIN);
    this.tooltipPositionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(svgContent)
      .withPositions([
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom'
        }
      ]);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.options) {
      const oldOptions: ChartOptionsBase = changes.options?.previousValue;
      const newOptions: ChartOptionsBase = changes.options?.currentValue;
      const ultraOptions: ChartOptionsBase = this.options;

      this.zoom.scaleExtent([
        this.getScaleBoundary(ultraOptions.minZoom),
        this.getScaleBoundary(ultraOptions.maxZoom)
      ]);
      this.xZoom.scaleExtent([
        this.getScaleBoundary(
          typeof ultraOptions.xAxis?.minZoom !== 'undefined'
            ? ultraOptions.xAxis.minZoom
            : ultraOptions.minZoom
        ),
        this.getScaleBoundary(
          typeof ultraOptions.xAxis?.maxZoom !== 'undefined'
            ? ultraOptions.xAxis.maxZoom
            : ultraOptions.maxZoom
        )
      ]);
      this.yZoom.scaleExtent([
        this.getScaleBoundary(
          typeof ultraOptions.yAxis?.minZoom !== 'undefined'
            ? ultraOptions.yAxis.minZoom
            : ultraOptions.minZoom
        ),
        this.getScaleBoundary(
          typeof ultraOptions.yAxis?.maxZoom !== 'undefined'
            ? ultraOptions.yAxis.maxZoom
            : ultraOptions.maxZoom
        )
      ]);

      if (
        newOptions?.xAxis?.position !== oldOptions?.xAxis?.position ||
        newOptions?.xAxis?.type !== oldOptions?.xAxis?.type
      ) {
        this.createAxisScale('x', ultraOptions.xAxis);
      } else if (typeof newOptions?.xAxis?.format !== 'undefined') {
        this.xAxis.tickFormat(newOptions.xAxis.format as any);
      }
      if (newOptions?.yAxis?.position !== oldOptions?.yAxis?.position) {
        this.createAxisScale('y', ultraOptions.yAxis);
      } else if (typeof newOptions?.yAxis?.format !== 'undefined') {
        this.yAxis.tickFormat(newOptions.yAxis.format as any);
      }
      this.tooltip.disabled = coerceBooleanProperty(ultraOptions.tooltip?.disabled);
    }
    if (changes.data || changes.options) {
      this.tooltip && this.tooltip.hide();
    }
  }

  ngOnInit(): void {
    this.subscription.add(
      this.resizeObservable
        .pipe(
          filter((newDimension) => {
            const oldDimension = this.dimension;

            return (
              newDimension.width !== oldDimension.width ||
              newDimension.height !== oldDimension.height
            );
          }),
          map((newDimension) => {
            this.dimension = newDimension;
            return newDimension;
          }),
          debounceTime(100)
        )
        .subscribe(() => {
          this.resize();
          this.identifyZoom();
          this.prepareToRender();
        })
    );

    this.renderingObs.pipe(debounceTime(5)).subscribe(() => {
      this.render();
    });

    this.content
      .on('contextmenu', (event: PointerEvent) => {
        event.preventDefault();
      });
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.renderingObs.complete();
    this.subscription.unsubscribe();
    this.tooltip && this.tooltip.hide();
  }

  zoomIn(): void {
    this.content.call(this.zoom.scaleBy, 2);
  }

  zoomOut(): void {
    this.content.call(this.zoom.scaleBy, 0.5);
  }

  getValue(...args): BaseValue | typeof DISABLED_IDENTIFICATION {
    const d = this.invertViewData.call(this, ...args);

    return this.options.valueFun(d, ...args);
  }

  getXValue(value: D): d3.NumberValue {
    const valueFun = this.options.xAxis?.valueFun;

    return coerceNumberProperty(typeof valueFun === 'function' ? valueFun(value) : value);
  }

  getYValue(value: D): d3.NumberValue {
    const valueFun = this.options.yAxis?.valueFun;

    return coerceNumberProperty(typeof valueFun === 'function' ? valueFun(value) : value);
  }

  getPalette(): ChartPalette<any, any, any> {
    return this.palette;
  }

  getCanvasArea(): Dimension {
    const dimension = this.dimension;
    const padding = this.options.padding;

    return {
      ...padding,
      width: Math.max(0, dimension.width - padding.left - padding.right),
      height: Math.max(0, dimension.height - padding.top - padding.bottom)
    };
  }

  getContainer(): HTMLElement {
    return this._container;
  }

  resize(): void {
    const dimension = this.dimension;
    const width = dimension.width;
    const height = dimension.height;

    this.content.attr('viewBox', [0, 0, width, height]).attr('width', width).attr('height', height);
    this.setViewportExtent();
  }

  abstract render(): void;

  abstract renderContent(): void;

  abstract renderAxes(): void;

  abstract viewData(value: D): any;

  abstract invertViewData(...args): Array<D> | D;

  setPalette(): void {
    const options = this.options;
    const defaultOptions = this.injector.get(DEFAULT_CHART_OPTIONS);
    let palette = options.palette;

    if (palette) {
      palette.unknown(defaultOptions.palette.unknown());
    }
    palette = this.palette = palette || defaultOptions.palette.copy();
    if (options.domain !== 'static' || !options.palette) {
      const data = this.data || [];
      const dataLength = data.length;
      let colorRange = options.colors;

      if (!colorRange || !colorRange.length) {
        colorRange = quantize(interpolateSinebow, dataLength + 2);
        colorRange.shift();
        colorRange.pop();
      }
      palette.domain(range(0, dataLength + 1)).range(colorRange);
    }
  }

  setViewportExtent(): void {
    const options = this.options;
    const canvasArea = this.getCanvasArea();
    const svgContent = this.content;
    const bounds = [
      {
        className: this.X_AXIS_CLASS_NAME,
        viewBox: this.getAxisViewBox(options.xAxis, canvasArea)
      },
      {
        className: this.Y_AXIS_CLASS_NAME,
        viewBox: this.getAxisViewBox(options.yAxis, canvasArea)
      },
      {
        className: this.CONTENT_CLASS_NAME,
        viewBox: [canvasArea.left, canvasArea.top, canvasArea.width, canvasArea.height]
      }
    ];

    [
      {
        axis: this.xAxis,
        scale: this.xAxisScale,
        zoom: this.xZoom,
        options: options.xAxis
      },
      {
        axis: this.yAxis,
        scale: this.yAxisScale,
        zoom: this.yZoom,
        options: options.yAxis
      }
    ].forEach((item) => {
      const { axis, scale, zoom, options } = item;

      if (typeof options?.minZoom === 'string' || typeof options?.maxZoom === 'string') {
        const scaleExtent = zoom.scaleExtent();
        const countBased = this.calcAppropriateNumberOfTicks(axis, scale, options, canvasArea);

        if (typeof options?.minZoom === 'string') {
          const min = axisTimeTickCount(
            scale.domain()[0] as number,
            scale.domain().slice(-1)[0] as number,
            options.minZoom
          );

          scaleExtent[0] = min / countBased;
        }
        if (typeof options?.maxZoom === 'string') {
          const max = axisTimeTickCount(
            scale.domain()[0] as number,
            scale.domain().slice(-1)[0] as number,
            options.maxZoom
          );

          scaleExtent[1] = max / countBased;
        }
        zoom.scaleExtent(scaleExtent);
      }
    });

    svgContent
      .selectAll('defs')
      .data([null])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('defs'));
      })
      .selectAll('clipPath')
      .data(bounds)
      .join((enter) => {
        return enter.append(() => this.createSVGElement('clipPath'));
      })
      .attr('clipPathUnits', 'userSpaceOnUse')
      .attr('id', (d, i, elements) => {
        const clipPath = select(elements[i]);
        let zoom: d3.ZoomBehavior<Element, any>;

        switch (d.className) {
          case this.X_AXIS_CLASS_NAME:
            zoom = this.xZoom.translateExtent([
              [d.viewBox[0], d.viewBox[1]],
              [d.viewBox[0] + d.viewBox[2], d.viewBox[1]]
            ]);
            break;
          case this.Y_AXIS_CLASS_NAME:
            zoom = this.yZoom.translateExtent([
              [d.viewBox[0], d.viewBox[1]],
              [d.viewBox[0], d.viewBox[1] + d.viewBox[3]]
            ]);
            break;
          default:
            zoom = this.zoom.translateExtent([
              [d.viewBox[0], d.viewBox[1]],
              [d.viewBox[0] + d.viewBox[2], d.viewBox[1] + d.viewBox[3]]
            ]);
        }

        zoom.extent([
          [d.viewBox[0], d.viewBox[1]],
          [d.viewBox[0] + d.viewBox[2], d.viewBox[1] + d.viewBox[3]]
        ]);
        clipPath.selectAll('rect')
          .data([null])
          .join((enter) => {
            return enter.append(() => this.createSVGElement('rect'));
          })
          .attr('x', d.viewBox[0])
          .attr('y', d.viewBox[1])
          .attr('width', d.viewBox[2])
          .attr('height', d.viewBox[3]);
        return this.getClipID(d.className);
      });
    svgContent
      .select(`.${this.CONTENT_CLASS_NAME}`)
      .attr('clip-path', `url(#${this.getClipID(this.CONTENT_CLASS_NAME)})`)
      .select('rect.canvas-area')
      .attr('fill', 'transparent')
      .attr('x', canvasArea.left)
      .attr('y', canvasArea.top)
      .attr('width', canvasArea.width)
      .attr('height', canvasArea.height);
  }

  protected abstract identifyZoom(): void;

  protected abstract showTooltip(event: MouseEvent): void;

  protected prepareToRender(): void {
    this.renderingObs.next();
  }

  protected createAxisScale(orientation: 'x' | 'y', options: AxisOptions): ZoomScale {
    let scale: ZoomScale;
    let axis: d3.Axis<BaseValue>;

    switch (options?.type) {
      case 'date':
        scale = scaleTime() as any;
        break;
      case 'string':
        scale = scaleBand() as any;
        break;
      default:
        scale = scaleLinear() as any;
    }

    switch (options?.position) {
      case 'top':
        if (orientation === 'y') {
          throw new Error('yAxis cannot be placed on horizontal.');
        }
        axis = axisTop(scale);
        break;
      case 'left':
        if (orientation === 'x') {
          throw new Error('xAxis cannot be placed on vertical.');
        }
        axis = axisLeft(scale);
        break;
      case 'right':
        if (orientation === 'x') {
          throw new Error('xAxis cannot be placed on vertical.');
        }
        axis = axisRight(scale);
        break;
      default:
        if (orientation === 'y') {
          throw new Error('yAxis cannot be placed on horizontal.');
        }
        axis = axisBottom(scale);
    }
    axis.tickSize(5).tickPadding(10);

    if (typeof options?.format !== 'undefined') {
      axis.tickFormat(options.format as any);
    }
    if (orientation === 'x') {
      this.xAxisScale = scale;
      this.xAxis = axis;
    } else {
      this.yAxisScale = scale;
      this.yAxis = axis;
    }
    return scale;
  }

  protected createAxis(
    axis: d3.Axis<BaseValue>,
    options: AxisOptions,
    className: string,
    transform?: d3.ZoomTransform
  ): void {
    const axisScale = axis.scale() as ZoomScale;
    const canvasArea = this.getCanvasArea();
    const viewBox = this.getAxisViewBox(options, canvasArea);
    const svgContent = this.content;
    const tickCount = this.calcAppropriateNumberOfTicks(axis, axisScale, options, canvasArea);
    let position: [number, number];

    if (typeof axisScale.invert === 'function') {
      options.type === 'date'
        ? axis.ticks(
            axisTimeTickInterval(
              axisScale.invert(0).valueOf(),
              axisScale.invert(canvasArea.width).valueOf(),
              tickCount - 2,
              typeof options.minZoom === 'string' ? options.minZoom : undefined
            )
          )
        : axis.ticks(tickCount);
    } else {
      const dataLength = Math.max(1, coerceNumberProperty(this.data?.length));

      axis.tickValues(
        d3Filter(axisScale.domain(), (d, i) => {
          return (
            i %
              Math.max(
                1,
                Math.floor(dataLength / tickCount / coerceNumberProperty(transform.k))
              ) ===
            0
          );
        })
      );
    }

    switch (options?.position) {
      case 'left':
        position = [canvasArea.left, 0];
        break;
      case 'right':
        position = [canvasArea.left + canvasArea.width, 0];
        break;
      case 'top':
        position = [0, canvasArea.top];
        break;
      default:
        position = [0, canvasArea.top + canvasArea.height];
    }

    const axisG = svgContent
      .select(`.${className}`)
      .attr('clip-path', coerceBooleanProperty(options?.clipped) ? `url(#${this.getClipID(className)})` : '')
      .on('wheel', (event: MouseEvent) => {
        event.preventDefault();
      });

    axisG
      .selectAll(`rect`)
      .data((d) => [d])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('rect'));
      })
      .attr('x', viewBox[0])
      .attr('y', viewBox[1])
      .attr('width', viewBox[2])
      .attr('height', viewBox[3])
      .attr('fill', 'transparent');

    axisG
      .selectAll('g')
      .data((d) => [d])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('transform', `translate(${position})`)
      .style('user-select', 'none')
      .call(axis as any)
      .call((axisG: d3.Selection<SVGGElement, any, SVGGElement, any>) => {
        this.setStyle(axisG, options.font);
        this.setStyle(axisG.selectAll('.domain'), options.baseline?.style);
        this.setStyle(axisG.selectAll('.tick line'), options.ticks?.style);
      });
  }

  protected getAxisViewBox(
    options: AxisOptions,
    area: Dimension
  ): [number, number, number, number] {
    let viewBox: [number, number, number, number];

    switch (options?.position) {
      case 'top':
        viewBox = [area.left, 0, area.width, area.top];
        break;
      case 'left':
        viewBox = [0, area.top, area.left, area.height];
        break;
      case 'right':
        viewBox = [area.left + area.width, area.top, area.right, area.height];
        break;
      default:
        viewBox = [area.left, area.top + area.height, area.width, area.bottom];
    }

    return viewBox;
  }

  protected calcAppropriateNumberOfTicks(
    axis: d3.Axis<BaseValue>,
    axisScale: ZoomScale,
    options: AxisOptions,
    canvasArea: Dimension
  ): number {
    const fontSize = coerceNumberProperty(options?.font['font-size']) || 14;
    const gap = coerceNumberProperty(options?.padding);
    let format = axis.tickFormat();
    let rangeStart: number;
    let range: number;
    let tickSize: number;
    let tickCount: number;

    format =
      format === null
        ? axisScale.tickFormat
          ? axisScale.tickFormat.apply(axisScale, axis.tickArguments())
          : (d) => d
        : format;
    switch (options?.position) {
      case 'left':
      case 'right':
        rangeStart = canvasArea.top + canvasArea.height;
        range = canvasArea.height;
        tickSize = fontSize;
        break;
      default:
        const canvas = this.renderer.createElement('canvas') as HTMLCanvasElement;
        const context = canvas.getContext('2d');
        const measureTextWidth = (value): number => {
          return typeof value?.toString === 'function'
            ? context.measureText(value.toString()).width
            : 0;
        };

        context.font = `${fontSize}px "${options.font['font-family']}"`;
        rangeStart = canvasArea.left;
        range = canvasArea.width;
        tickSize = max(
          (axisScale.invert
            ? d3Map(ticks(rangeStart, rangeStart + range, range), (d) => {
                return measureTextWidth(format(axisScale.invert(d) as any, -1));
              })
            : d3Map(axisScale.domain(), (d) => {
                return measureTextWidth(format(d, -1));
              })
          ).concat([gap])
        );
    }
    tickSize = Math.ceil(tickSize) + gap;
    tickCount = Math.max(1, Math.floor(range / tickSize));

    return tickCount;
  }

  protected getTransformXAxisScale(): ZoomScale {
    const scale = this.xAxisScale;
    const tTransform = this.xTransform;

    try {
      return tTransform.rescaleX(scale as any);
    } catch (e) {
      return (typeof scale.rangeRound === 'function' ? scale.copy().rangeRound : scale.copy().range)(scale.range().map((d) => tTransform.applyX(d)));
    }
  }

  protected getTransformYAxisScale(): ZoomScale {
    const scale = this.yAxisScale;
    const tTransform = this.yTransform;

    try {
      return tTransform.rescaleY(scale as any);
    } catch (e) {
      return (typeof scale.rangeRound === 'function' ? scale.copy().rangeRound : scale.copy().range)(scale.range().map((d) => tTransform.applyY(d)));
    }
  }

  protected getScaleBoundary(
    value: boolean | number | TimePrecision,
    scale?: d3.ScaleTime<number, number>
  ): number {
    let zoomValue: number;

    switch (typeof value) {
      case 'boolean':
        zoomValue = value ? Infinity : 1;
        break;
      case 'number':
        zoomValue = value;
        break;
      default:
        zoomValue = 1;
    }

    return zoomValue;
  }

  protected createSVGElement(tagName: string): SVGElement {
    return this.renderer.createElement(tagName, 'svg');
  }

  protected setStyle(element: d3.Selection<SVGElement, any, SVGElement, any>, style: Style): void {
    let styles: Styles;

    styles = typeof style === 'function' ? style(element.data()) : style || {};
    for (const key in styles) {
      element.attr(key, styles[key]);
    }
  }

  protected createTooltip(): _MatTooltipBase<_TooltipComponentBase> {
    const injector = this.injector;
    const tooltip = new MatTooltip(
      this.overlay,
      new ElementRef(this.getContainer()),
      injector.get(ScrollDispatcher),
      injector.get(ViewContainerRef),
      injector.get(NgZone),
      injector.get(Platform),
      injector.get(AriaDescriber),
      injector.get(FocusMonitor),
      injector.get(MAT_TOOLTIP_SCROLL_STRATEGY),
      injector.get(Directionality),
      injector.get(MAT_TOOLTIP_DEFAULT_OPTIONS),
      injector.get(DOCUMENT)
    );
    const tooltipComponent = this.options?.tooltip?.component;

    if (tooltipComponent) {
      tooltip['_portal'] = new ComponentPortal(tooltipComponent, injector.get(ViewContainerRef));
    }
    // Init tooltip._overlayRef
    tooltip.message = '_';
    tooltip.show();
    tooltip.hide();
    tooltip._overlayRef.updatePositionStrategy(this.tooltipPositionStrategy);
    // this.changeDetectorRef.detectChanges();

    return tooltip;
  }

  protected updateTooltip(event: MouseEvent, message: string): void {
    const tooltip = this.tooltip;
    const ngZone = this.injector.get(NgZone);
    const offsetX = event.offsetX;
    const offsetY = event.offsetY;

    ngZone.run(() => {
      this.tooltipPositionStrategy.withPositions([
        {
          offsetX: offsetX,
          offsetY: offsetY,
          originX: 'start',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom'
        }
      ]);
      tooltip.message = `${message}`;
      tooltip.show();
    });
  }

  protected enableMultipleSelection(event: PointerEvent): boolean {
    return navigator.platform?.toLowerCase().indexOf('mac') > -1 ? event.metaKey : event.ctrlKey;
  }

  private getClipID(name: string): string {
    return `boundsClip-${this.injector.get(APP_ID)}-${this.id_count}-${name}`;
  }
}
