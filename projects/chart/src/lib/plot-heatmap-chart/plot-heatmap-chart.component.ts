import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges
} from '@angular/core';
import { coerceBooleanProperty, coerceElement } from '@angular/cdk/coercion';
import { Overlay } from '@angular/cdk/overlay';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { isEqual, uniq } from 'lodash';
import { extent, map as d3Map, merge as d3Merge, range } from 'd3-array';
import { brush } from 'd3-brush';
import { rgb } from 'd3-color';
import { quantize } from 'd3-interpolate';
import { interpolateSinebow } from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import { zoomIdentity } from 'd3-zoom';

import {
  PlotHeatmapPalette,
  DEFAULT_PLOT_HEATMAP_OPTIONS,
  PlotHeatmapOptions,
  BaseValue,
  DEFAULT_CHART_OPTIONS,
  DISABLED_IDENTIFICATION,
  AxisOptions
} from '../chart-options';
import { ChartBase } from '../chart-base';

const SELECTED_COLOR = rgb('#009CA6');
const SELECTION_COLOR = rgb(26, 115, 232);

/**
 *   col 2
 *     ^
 *     |
 *  col 1
 *   ^
 *   |
 * |
 * |
 * |              -> row n + 1
 * |              -> row n
 * |_____________
 * origin
 */
@Component({
  selector: 'app-plot-heatmap-chart',
  templateUrl: './plot-heatmap-chart.component.html',
  styleUrls: ['./plot-heatmap-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chart chart-heatmap'
  },
  providers: [
    {
      provide: DEFAULT_CHART_OPTIONS,
      useValue: DEFAULT_PLOT_HEATMAP_OPTIONS
    }
  ]
})
export class PlotHeatmapChartComponent<T>
  extends ChartBase<T, PlotHeatmapOptions>
  implements OnInit, AfterContentInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() data: Array<T>;

  protected palette: PlotHeatmapPalette;
  private readonly brush: d3.BrushBehavior<any>;
  private selectionChangedSubs: Subscription | undefined;

  constructor(
    public elementRef: ElementRef<HTMLElement>,
    protected renderer: Renderer2,
    protected changeDetectorRef: ChangeDetectorRef,
    protected overlay: Overlay,
    protected injector: Injector
  ) {
    super(renderer.createElement('div'), renderer, changeDetectorRef, overlay, injector);

    const startDiv = super.getContainer();
    const drawingGroup = this.content.select(`.${this.CONTENT_CLASS_NAME}`).node();
    const foreignObject = this.createSVGElement('foreignObject');
    const canvas = renderer.createElement('canvas');

    renderer.appendChild(foreignObject, canvas);
    renderer.appendChild(drawingGroup, foreignObject);
    renderer.appendChild(coerceElement(elementRef), startDiv);

    this.brush = brush()
      .keyModifiers(false)
      .filter((event: PointerEvent) => {
        return this.selection && event.altKey;
      });
    this.zoom.filter((event: PointerEvent) => {
      return !event.altKey;
    });
    this.createAxisScale('x', this.options.xAxis);
    this.createAxisScale('y', this.options.yAxis);
    this.tooltip = this.createTooltip();
  }

  @Input() compareWith = (row: number, col: number, plot: T): boolean => {
    return !!plot && this.getYValue(plot) === row && this.getXValue(plot) === col;
  };

  ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);

    const paletteProperties = ['data', 'options'];
    const oldOptions: PlotHeatmapOptions = changes.options?.previousValue;
    const newOptions: PlotHeatmapOptions = changes.options?.currentValue;

    if (
      paletteProperties.some((property) => {
        return (
          changes[property] &&
          (changes[property].firstChange ||
            changes[property].currentValue !== changes[property].previousValue)
        );
      })
    ) {
      this.setPalette();
    }
    if (
      changes.options &&
      (changes.options.firstChange ||
        !isEqual(newOptions?.padding, oldOptions?.padding) ||
        !isEqual(newOptions?.xAxis?.position, oldOptions?.xAxis?.position) ||
        !isEqual(newOptions?.yAxis?.position, oldOptions?.yAxis?.position) ||
        !isEqual(newOptions?.xAxis?.type, oldOptions?.xAxis?.type) ||
        !isEqual(newOptions?.yAxis?.type, oldOptions?.yAxis?.type) ||
        !isEqual(newOptions?.xAxis?.domain, oldOptions?.xAxis?.domain) ||
        !isEqual(newOptions?.yAxis?.domain, oldOptions?.yAxis?.domain) ||
        newOptions?.gridSpacing !== oldOptions?.gridSpacing ||
        newOptions?.gridSize !== oldOptions?.gridSize)
    ) {
      this.setViewportExtent();
      this.identifyZoom();
    }
    if (changes.selection) {
      this.selectionChangedSubs?.unsubscribe();
      this.selection &&
        (this.selectionChangedSubs = this.selection.changed
          .pipe(debounceTime(100))
          .subscribe(() => {
            this.prepareToRender();
          }));
    }

    this.xTransform && this.yTransform && this.prepareToRender();
  }

  ngOnInit(): void {
    super.ngOnInit();

    this.brush.on('start brush end', (event: d3.D3BrushEvent<number>) => {
      const selectionRect = event.selection;

      if (selectionRect) {
        const selection = this.selection;
        const gridSpacing = this.options.gridSpacing;
        let inRange = this.isInGridRange(selectionRect[0][0], selectionRect[0][1]);

        !inRange.x && (selectionRect[0][0] = selectionRect[0][0] + gridSpacing);
        !inRange.y && (selectionRect[0][1] = selectionRect[0][1] + gridSpacing);

        inRange = this.isInGridRange(selectionRect[1][0], selectionRect[1][1]);
        !inRange.x && (selectionRect[1][0] = selectionRect[1][0] - gridSpacing);
        !inRange.y && (selectionRect[1][1] = selectionRect[1][1] - gridSpacing);

        if (!this.enableMultipleSelection(event.sourceEvent)) {
          selection.clear();
        }
        selection.select(
          ...this.invertGrid(selectionRect, (row, col) => {
            return this.invertViewData(row, col);
          })
        );
      }

      if (selectionRect && event.type === 'end') {
        this.brush.clear(this.content.select(`.${this.CONTENT_CLASS_NAME}`), event.sourceEvent);
      } else {
        this.content
          .select('.selection')
          .attr('fill', SELECTION_COLOR.toString())
          .attr('stroke', SELECTION_COLOR.toString())
          .attr('stroke-width', 4);
      }
      this.content
        .select('rect.overlay')
        .attr('cursor', event.type === 'end' ? 'default' : 'crosshair');
    });

    this.zoom
      .on('zoom', (event: d3.D3ZoomEvent<Element, any>) => {
        const transform = this.xTransform;

        this.xTransform = this.yTransform = event.transform;
        if (
          transform.k !== event.transform.k ||
          transform.x !== event.transform.x ||
          transform.y !== event.transform.y
        ) {
          this.render();
          event.sourceEvent && this.showTooltip(event.sourceEvent);
        }
      })
      .on('end', (event: d3.D3ZoomEvent<Element, any>) => {
        event.sourceEvent && this.showTooltip(event.sourceEvent);
      });

    this.content
      .call(this.zoom)
      .select(`.${this.CONTENT_CLASS_NAME}`)
      .on('click', (event: PointerEvent) => {
        const selection = this.selection;

        if (!event.altKey && selection) {
          const offsetX = event.offsetX;
          const offsetY = event.offsetY;
          const areaRange = this.isInGridRange(offsetX, offsetY);
          const row = this.invertRow(offsetY);
          const col = this.invertCol(offsetX);
          const { xDomain, yDomain } = this.getDomains();

          if (
            row >= xDomain.shift() &&
            row <= xDomain.pop() &&
            col >= yDomain.shift() &&
            col <= yDomain.pop()
          ) {
            if (areaRange.x && areaRange.y) {
              const target = this.invertViewData(row, col);

              if (this.enableMultipleSelection(event)) {
                selection.toggle(target);
              } else if (selection.selected.length !== 1 || !selection.isSelected(target)) {
                this.selection.clear();
                this.selection.select(target);
              }
            }
          } else {
            this.selection.clear();
          }
        }
      })
      .on('mousemove', (event: MouseEvent) => {
        this.tooltip && this.showTooltip(event);
      })
      .on('mouseenter', () => {
        this.tooltip &&
          (this.tooltip.disabled = coerceBooleanProperty(this.options.tooltip?.disabled));
      })
      .on('mouseleave', () => {
        if (this.tooltip) {
          this.tooltip.disabled = true;
          this.tooltip.hide();
        }
      });
  }

  ngAfterContentInit(): void {
    this.changeDetectorRef.markForCheck();
  }

  ngAfterViewInit(): void {
    super.ngAfterViewInit();

    this.tooltip && (this.tooltip.disabled = true);
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.selectionChangedSubs?.unsubscribe();
  }

  render(): void {
    this.renderAxes();
    this.renderContent();
  }

  renderContent(): void {
    const palette = this.getPalette();
    const selection = this.selection;
    const data = this.data;
    const xAxisScale = this.getTransformXAxisScale();
    const yAxisScale = this.getTransformYAxisScale();

    const options = this.options;
    const zoomedUnitSize = Math.abs(xAxisScale(2) - xAxisScale(1));
    const zoomedGridSize = zoomedUnitSize - options.gridSpacing;
    const zoomedOffset = zoomedGridSize / 2;

    const canvasEl = this.content.select('canvas').node() as HTMLCanvasElement;
    const context = canvasEl.getContext('2d');
    const canvasArea = this.getCanvasArea();
    const strokeColor = SELECTION_COLOR.copy({ opacity: 0.75 }).toString();
    const _isDev = this._isDev;
    let x: number, y: number;
    let fillColor: string, itemValue: d3.NumberValue | string | typeof DISABLED_IDENTIFICATION;

    context.clearRect(0, 0, canvasArea.width, canvasArea.height);
    this.invertGrid(
      [
        [canvasArea.left, canvasArea.top],
        [canvasArea.left + canvasArea.width, canvasArea.top + canvasArea.height]
      ],
      (row, col) => {
        itemValue = options.valueFun(
          data.find((item: T) => {
            return this.compareWith(row, col, item);
          }),
          row,
          col
        );
        if (typeof itemValue === 'string') {
          itemValue = itemValue.toLowerCase();
        }
        fillColor =
          itemValue === DISABLED_IDENTIFICATION ? options.disabled?.fillStyle : palette(itemValue);

        x = xAxisScale(col) - canvasArea.left;
        y = yAxisScale(row) - canvasArea.top;
        context.beginPath();
        context.rect(x - zoomedOffset, y - zoomedOffset, zoomedGridSize, zoomedGridSize);
        context.fillStyle = fillColor;
        context.fill();

        if (selection?.isSelected(this.invertViewData(row, col, data))) {
          context.lineWidth = 6;
          context.strokeStyle = strokeColor;
          context.strokeRect(
            x - zoomedOffset + 3,
            y - zoomedOffset + 3,
            zoomedGridSize - 6,
            zoomedGridSize - 6
          );
        }
        if (_isDev) {
          context.fillStyle = '#000000';
          context.font = '12px Google Sans';
          if (fillColor) {
            context.fillText(
              `@${fillColor}`,
              x - zoomedOffset,
              y - zoomedOffset + 16,
              zoomedGridSize
            );
          }
          context.fillText(
            `row: ${row}, col: ${col}`,
            x - zoomedOffset,
            y - zoomedOffset + 32,
            zoomedGridSize
          );
        }
      }
    );
  }

  renderAxes(): void {
    const options = this.options;

    this.createAxis(
      this.xAxis.scale(this.getTransformXAxisScale()),
      options.xAxis,
      this.X_AXIS_CLASS_NAME
    );
    this.createAxis(
      this.yAxis.scale(this.getTransformYAxisScale()),
      options.yAxis,
      this.Y_AXIS_CLASS_NAME
    );
  }

  viewData(value: T): { row: number; col: number } {
    return { row: this.getYValue(value) as number, col: this.getXValue(value) as number };
  }

  invertViewData(row: number, col: number, data: T[] = this.data): T {
    return (
      data.find((item: T) => {
        return this.compareWith(row, col, item);
      }) ||
      this.selection?.selected.find((item: T) => {
        return this.compareWith(row, col, item);
      }) ||
      (({
        row: row,
        plot: col
      } as unknown) as T)
    );
  }

  setPalette(): void {
    const options = this.options;
    let palette = options.palette;

    if (palette && !palette.unknown()) {
      palette.unknown(DEFAULT_PLOT_HEATMAP_OPTIONS.palette.unknown());
    }
    palette = this.palette = (palette || DEFAULT_PLOT_HEATMAP_OPTIONS.palette).copy();
    if (options.domain !== 'static' || !options.palette) {
      const data = this.data;

      if (data && data.length) {
        const valueFun = this.options.valueFun;
        let formatedValue: d3.NumberValue | string | typeof DISABLED_IDENTIFICATION;
        let domain = uniq(
          d3Map(data, (d) => {
            formatedValue = valueFun(d);
            return typeof formatedValue === 'string' ? formatedValue.toLowerCase() : formatedValue;
          })
        ).filter((d) => {
          return (
            typeof d !== 'undefined' && d !== null && d !== '' && d !== DISABLED_IDENTIFICATION
          );
        });

        if (typeof domain[0] === 'number') {
          palette.domain(extent(domain as number[])).range(['blue', 'red']);
        } else {
          const colorRange = quantize(interpolateSinebow, domain.length + 2);

          colorRange.shift();
          colorRange.pop();
          palette.domain(domain as BaseValue[]).range(colorRange);
        }
      } else {
        palette.domain([]).range([]);
      }
    }
  }

  setViewportExtent(): void {
    super.setViewportExtent();

    const options = this.options;
    const unitSize = options.gridSize + options.gridSpacing;
    const canvasArea = this.getCanvasArea();
    const svgContent = this.content;
    const apptNumX = Math.round(canvasArea.width / unitSize);
    const apptNumY = Math.round(canvasArea.height / unitSize);
    let dataViewWidth = 0;
    let dataViewHeight = 0;
    const xyz = [
      {
        scale: this.xAxisScale,
        options: options.xAxis,
        domain: [],
        offset: canvasArea.left,
        apptNumForScale: apptNumX
      },
      {
        scale: this.yAxisScale,
        options: options.yAxis,
        domain: [],
        offset: canvasArea.top,
        apptNumForScale: apptNumY
      }
    ].map((item, i) => {
      if (item.options?.domain && item.options.domain.length > 1) {
        item.domain = item.options.domain = item.options.domain.map((d) => Math.round(d)) as [
          number,
          number
        ];
      }
      const startD = item.domain[0] - 0.5;

      if (i === 0) {
        // x
        dataViewWidth = (item.domain[1] - item.domain[0] + 1) * unitSize;
      } else {
        // y
        dataViewHeight = (item.domain[1] - item.domain[0] + 1) * unitSize;
      }
      item.scale
        .domain([startD, startD + item.apptNumForScale])
        .range([item.offset, item.offset + item.apptNumForScale * unitSize]);
      return item;
    });
    const scaleExtent: [number, number] = [
      Math.max(
        this.getScaleBoundary(options.minZoom),
        Math.min(1, canvasArea.width / dataViewWidth, canvasArea.height / dataViewHeight)
      ),
      this.getScaleBoundary(options.maxZoom)
    ];
    const translateExtent: [[number, number], [number, number]] = [
      [canvasArea.left, canvasArea.top],
      [canvasArea.left + dataViewWidth, canvasArea.top + dataViewHeight]
    ];

    svgContent
      .select('foreignObject')
      .attr('x', canvasArea.left)
      .attr('y', canvasArea.top)
      .attr('width', canvasArea.width)
      .attr('height', canvasArea.height)
      .select('canvas')
      .attr('width', canvasArea.width)
      .attr('height', canvasArea.height);

    this.zoom.scaleExtent(scaleExtent).translateExtent(translateExtent);
    this.xZoom.scaleExtent(scaleExtent).translateExtent(translateExtent);
    this.yZoom.scaleExtent(scaleExtent).translateExtent(translateExtent);
    this.brush.extent([
      [canvasArea.left, canvasArea.top],
      [canvasArea.left + canvasArea.width, canvasArea.top + canvasArea.height]
    ]);
    svgContent
      .select(`.${this.CONTENT_CLASS_NAME}`)
      .call(this.brush)
      .select('.overlay')
      .attr('cursor', 'default');
  }

  protected identifyZoom(): void {
    const minZoom = this.zoom.scaleExtent()[0];
    const translate = this.zoom.translateExtent()[0];
    let transform = zoomIdentity
      .translate(translate[0] * (1 - minZoom), translate[1] * (1 - minZoom))
      .scale(minZoom);

    this.xTransform = this.yTransform = transform;
    this.content.call(this.zoom.transform, transform);
  }

  protected showTooltip(event: MouseEvent): void {
    const offsetX = event.offsetX;
    const offsetY = event.offsetY;
    const areaRange = this.isInGridRange(offsetX, offsetY);
    const row = this.invertRow(offsetY);
    const col = this.invertCol(offsetX);
    const { xDomain, yDomain } = this.getDomains();

    if (
      areaRange.x &&
      areaRange.y &&
      col >= xDomain[0] &&
      col <= xDomain[1] &&
      row >= yDomain[0] &&
      row <= yDomain[1]
    ) {
      const msgFun = this.options.tooltip?.content;
      const value = this.getValue(row, col);
      let msg: string;

      if (typeof msgFun === 'function') {
        msg = msgFun(value);
      } else {
        (value === null || typeof value === 'undefined' || value === DISABLED_IDENTIFICATION) &&
          (msg = '');
      }
      this.updateTooltip(event, `${msg}`);
    } else {
      this.tooltip?.hide();
    }
  }

  protected createAxis(
    axis: d3.Axis<BaseValue>,
    options: AxisOptions,
    className: string
  ): void {
    super.createAxis(axis, options, className);

    const selection = this.selection;

    this.content
      .selectAll(`.${className} g`)
      .call((g) => {
        const isRow = axis === this.xAxis;

        selection &&
          g.selectAll('.tick').attr('color', (domain: number) => {
            return selection.selected.some((item) => {
              return (isRow ? this.getXValue(item) : this.getYValue(item)) === domain;
            })
              ? SELECTED_COLOR.toString()
              : '';
          });
      })
      .on(
        'click',
        selection
          ? (event: PointerEvent) => {
              const isRow = axis === this.xAxis;
              const { xDomain, yDomain } = this.getDomains();
              const selection = this.selection;
              const data = this.data;
              const tick = select(event.target as SVGGElement);
              const selectedDomain = tick.data()[0] as number;
              const rangeValue: T[] = isRow
                ? d3Map(range(yDomain[0], yDomain[1] + 1), (d) => {
                    return this.invertViewData(d, selectedDomain, data);
                  })
                : d3Map(range(xDomain[0], xDomain[1] + 1), (d) => {
                    return this.invertViewData(selectedDomain, d, data);
                  });

              if (!this.enableMultipleSelection(event)) {
                selection.clear();
              }
              selection.isSelected(rangeValue[0])
                ? selection.deselect(...rangeValue)
                : selection.select(...rangeValue);
              event.stopPropagation();
            }
          : null
      );
  }

  private invertGrid<F>(rect: d3.BrushSelection): Array<[number, number]>;
  private invertGrid<F>(
    rect: d3.BrushSelection,
    callback: (row: number, col: number) => F
  ): Array<F>;
  private invertGrid<F>(
    rect: d3.BrushSelection,
    callback?: (row: number, col: number) => F
  ): Array<[number, number] | F> {
    const { xDomain, yDomain } = this.getDomains();
    const startRow = Math.max(yDomain[0], Math.min(yDomain[1], this.invertRow(rect[0][1])));
    const endRow = Math.max(yDomain[0], Math.min(yDomain[1], this.invertRow(rect[1][1])));
    const startCol = Math.max(xDomain[0], Math.min(xDomain[1], this.invertCol(rect[0][0])));
    const endCol = Math.max(xDomain[0], Math.min(xDomain[1], this.invertCol(rect[1][0])));

    return d3Merge(
      d3Map(range(startRow, endRow + 1, 1), (row) => {
        return d3Map(range(startCol, endCol + 1, 1), (col) => {
          return typeof callback === 'function' ? callback(row, col) : [row, col];
        });
      })
    );
  }

  private getDomains(): { xDomain: [number, number]; yDomain: [number, number] } {
    return {
      xDomain: extent(this.chartOptions.xAxis?.domain || [0]),
      yDomain: extent(this.chartOptions.yAxis?.domain || [0])
    };
  }

  /**
   * @param pixel offset at vertical position
   * @returns number of row
   */
  private invertRow(pixel: number): number {
    return Math.round(this.getTransformYAxisScale().invert(pixel).valueOf());
  }

  /**
   * @param pixel offset at horizontal position
   * @returns number of col
   */
  private invertCol(pixel: number): number {
    return Math.round(this.getTransformXAxisScale().invert(pixel).valueOf());
  }

  /**
   * @param offsetX relative the this.content.
   * @param offsetY relative the this.content.
   * @returns { x: boolean; y: boolean; }
   */
  private isInGridRange(
    offsetX: number,
    offsetY: number
  ): {
    x: boolean;
    y: boolean;
  } {
    const xAxisScale = this.getTransformXAxisScale();
    const xTransform = this.xTransform;
    const yTransform = this.yTransform;
    const options = this.options as PlotHeatmapOptions;
    const gridMargin = options.gridSpacing / 2;
    const zoomedUnitSize = Math.abs(xAxisScale(2) - xAxisScale(1));
    const zoomedGridSize = zoomedUnitSize - options.gridSpacing;
    const canvasArea = this.getCanvasArea();
    const areaXRange = (offsetX - canvasArea.left * xTransform.k - xTransform.x) % zoomedUnitSize;
    const areaYRange = (offsetY - canvasArea.top * yTransform.k - yTransform.y) % zoomedUnitSize;

    return {
      x: areaXRange > gridMargin && areaXRange < zoomedGridSize + gridMargin,
      y: areaYRange > gridMargin && areaYRange < zoomedGridSize + gridMargin
    };
  }
}
