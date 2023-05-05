import { coerceElement, coerceNumberProperty } from '@angular/cdk/coercion';
import {
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
import { Overlay } from '@angular/cdk/overlay';
import { isEqual } from 'lodash';
import { Subscription } from 'rxjs';
import { extent, map as d3Map, max, merge as d3Merge, min } from 'd3-array';
import { rgb } from 'd3-color';
import { easeCubic } from 'd3-ease';
import { curveStepAfter, line } from 'd3-shape';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

import {
  DEFAULT_CHART_OPTIONS,
  DEFAULT_STEP_LINE_CHART_OPTIONS,
  ChartOptionsBase
} from '../chart-options';
import { ChartBase } from '../chart-base';

@Component({
  selector: 'app-step-line-chart',
  template: '',
  styles: [`:host { display: block; overflow: hidden; }`, `svg { display: block; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chart chart-step-line'
  },
  providers: [
    {
      provide: DEFAULT_CHART_OPTIONS,
      useValue: DEFAULT_STEP_LINE_CHART_OPTIONS
    }
  ]
})
export class StepLineChartComponent<D>
  extends ChartBase<D, ChartOptionsBase>
  implements OnChanges, OnInit, OnDestroy {
  @Input() data: Array<Array<D>>;

  protected readonly xZoom: d3.ZoomBehavior<SVGElement, any>;
  protected readonly yZoom: d3.ZoomBehavior<SVGElement, any>;
  private selectionChanged = false;
  private selectionChangedSubs: Subscription | undefined;

  constructor(
    public elementRef: ElementRef<HTMLElement>,
    protected renderer: Renderer2,
    protected changeDetectorRef: ChangeDetectorRef,
    protected overlay: Overlay,
    protected injector: Injector
  ) {
    super(coerceElement(elementRef), renderer, changeDetectorRef, overlay, injector);

    this.xZoom = zoom();
    this.yZoom = zoom();
    this.createAxisScale('x', this.options.xAxis);
    this.createAxisScale('y', this.options.yAxis);
    this.tooltip = this.createTooltip();
  }

  ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);

    const domainProperties = ['data', 'options'];
    const oldOptions: ChartOptionsBase = changes.options?.previousValue;
    const newOptions: ChartOptionsBase = changes.options?.currentValue;

    if (
      domainProperties.some((property) => {
        return (
          changes[property] &&
          (changes[property].firstChange ||
            changes[property].currentValue !== changes[property].previousValue)
        );
      })
    ) {
      const options = this.options;
      const data = this.data || [];

      const scales = [
        {
          scale: this.xAxisScale,
          options: options.xAxis,
          domain: extent(
            d3Merge(
              d3Map(data, (dataItem) => {
                return d3Map(dataItem, (d) => this.getXValue(d));
              }) as any
            )
          ) as Array<d3.NumberValue>
        },
        {
          scale: this.yAxisScale,
          options: options.yAxis,
          domain: extent(
            d3Merge(
              d3Map(data, (dataItem) => {
                return d3Map(dataItem, (d) => this.getYValue(d));
              }) as any
            )
          ) as Array<d3.NumberValue>
        }
      ].forEach((item) => {
        const hasMin = typeof item.options?.min !== 'undefined';
        const hasMax = typeof item.options?.max !== 'undefined';

        if (hasMin) {
          item.domain[0] = min([item.domain[0], item.options.min]);
        }
        if (hasMax) {
          item.domain[1] = max([item.domain[1], item.options.max]);
        }
        item.scale.domain(item.domain);
        typeof item.scale.nice === 'function' && item.scale.nice();
      });

      this.setPalette();
      this.setViewportExtent();
      this.identifyZoom();
    }
    if (
      changes.options &&
      (changes.options.firstChange ||
        !isEqual(newOptions?.padding, oldOptions?.padding) ||
        !isEqual(newOptions?.xAxis?.position, oldOptions?.xAxis?.position) ||
        !isEqual(newOptions?.yAxis?.position, oldOptions?.yAxis?.position) ||
        !isEqual(newOptions?.xAxis?.type, oldOptions?.xAxis?.type) ||
        !isEqual(newOptions?.yAxis?.type, oldOptions?.yAxis?.type))
    ) {
      this.setViewportExtent();
      this.identifyZoom();
    } else if (changes.data) {
      this.identifyZoom();
    }
    if (changes.selection) {
      this.selectionChangedSubs?.unsubscribe();
      this.selectionChangedSubs =
        this.selection &&
        this.selection.changed.subscribe(() => {
          this.selectionChanged = true;
          this.prepareToRender();
        });
    }

    this.xTransform && this.yTransform && this.prepareToRender();
  }

  ngOnInit(): void {
    super.ngOnInit();

    this.xZoom.on('zoom', (event: d3.D3ZoomEvent<SVGElement, any>) => {
      const transform = this.xTransform;

      this.xTransform = event.transform;
      if (transform.k !== event.transform.k || transform.x !== event.transform.x) {
        this.prepareToRender();
      }
    });
    this.yZoom.on('zoom', (event: d3.D3ZoomEvent<SVGElement, any>) => {
      const transform = this.yTransform;

      this.yTransform = event.transform;
      if (transform.k !== event.transform.k || transform.y !== event.transform.y) {
        this.prepareToRender();
      }
    });
    this.zoom.on('zoom', (event: d3.D3ZoomEvent<SVGElement, any>) => {
      const transform = event.transform;
      const svgContent = this.content;
      const xClassName = this.X_AXIS_CLASS_NAME;
      const yClassName = this.Y_AXIS_CLASS_NAME;
      const xAxisG = svgContent.select(`.${xClassName}`) as d3.Selection<
        SVGElement,
        any,
        SVGElement,
        any
      >;
      const yAxisG = svgContent.select(`.${yClassName}`) as d3.Selection<
        SVGElement,
        any,
        SVGElement,
        any
      >;
      const eventPath = event.sourceEvent.path;

      if (eventPath && eventPath.find((item: SVGElement) => item.classList?.contains(xClassName))) {
        this.xTransform = transform;
        this.prepareToRender();
      } else if (
        eventPath &&
        eventPath.find((item: SVGElement) => item.classList?.contains(yClassName))
      ) {
        this.xTransform = transform;
        this.prepareToRender();
      } else {
        this.xZoom.transform(xAxisG, transform);
        this.yZoom.transform(yAxisG, transform);
      }
    });
  }

  ngAfterContentInit(): void {
    this.changeDetectorRef.markForCheck();
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
    const options = this.options;
    const palette = this.getPalette();
    const selection = this.selection;
    const data = this.data || [];
    const xAxisScale = this.getTransformXAxisScale();
    const yAxisScale = this.getTransformYAxisScale();
    const content = this.content.select(`.${this.CONTENT_CLASS_NAME}`);
    const lineString: d3.Line<D> = (line() as any)
      .x((d) => xAxisScale(this.getXValue(d)))
      .y((d) => yAxisScale(this.getYValue(d)))
      .curve(curveStepAfter);
    const extent = this.zoom.extent().apply(content);

    typeof xAxisScale.clamp === 'function' && xAxisScale.clamp(false);
    typeof yAxisScale.clamp === 'function' && yAxisScale.clamp(false);

    if (selection) {
      const markerLines = content
        .selectAll('line.marker-line')
        .data(selection.selected)
        .join((enter) => {
          return enter.append(() => this.createSVGElement('line'));
        })
        .attr('class', 'marker-line')
        .attr('stroke', rgb('#009CA6').toString())
        .attr('stroke-dasharray', '2 2')
        .attr('x1', (d) => xAxisScale(this.getXValue(d)))
        .attr('x2', (d) => xAxisScale(this.getXValue(d)));

      if (this.selectionChanged) {
        markerLines
          .attr('y1', (d) => yAxisScale(this.getYValue(d)))
          .attr('y2', (d) => yAxisScale(this.getYValue(d)))
          .transition()
          .duration(425)
          .ease(easeCubic)
          .attr('y1', extent[0][1])
          .attr('y2', extent[1][1]);
      } else {
        markerLines.attr('y1', extent[0][1]).attr('y2', extent[1][1]);
      }
    }
    this.selectionChanged = false;

    content
      .selectAll('g.line')
      .data(data)
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('class', 'line')
      .call((seriesG) => {
        seriesG
          .selectAll('path')
          .data((d) => [d])
          .join((enter) => {
            return enter.append(() => this.createSVGElement('path'));
          })
          .attr('d', lineString)
          .attr('fill', 'none')
          .attr('stroke', (d, i, elements) => {
            const line = select(elements[i]) as d3.Selection<SVGElement, any, SVGElement, any>;

            this.setStyle(line, options.lineStyle);
            return palette(i);
          });
      })
      .call((seriesG) => {
        const yValueFun = options.yAxis?.valueFun || ((d): D => d);
        let point: d3.Selection<SVGCircleElement, D, SVGGElement, D>;

        seriesG
          .selectAll('g.points')
          .data((d) => [d])
          .join((enter) => {
            return enter.append(() => this.createSVGElement('g'));
          })
          .attr('class', 'points')
          .selectAll('circle')
          .data((d) => d)
          .join((enter) => {
            return enter.append(() => this.createSVGElement('circle') as SVGCircleElement);
          })
          .attr('cx', (d, i, elements) => {
            const isHovering = (content.node() as SVGGElement).matches(':hover');
            const isSelected = selection ? selection.isSelected(d) : false;
            let fillOpacity = isHovering || isSelected ? 1 : 0;

            point = select(elements[i]) as d3.Selection<SVGCircleElement, D, SVGGElement, D>;
            point.attr('fill', palette(i));
            this.setStyle(point, options.pointStyle);
            fillOpacity = Math.max(fillOpacity, coerceNumberProperty(point.attr('fill-opacity')));
            point.attr('fill-opacity', fillOpacity);
            isSelected && this.setStyle(point, options.selectedPointStyle);
            point.style('visibility', yValueFun(d) === null ? 'hidden' : '');
            point.attr('cy', yAxisScale(this.getYValue(d)));
            return xAxisScale(this.getXValue(d));
          })
          .on('mousemove', (event: MouseEvent) => {
            this.tooltip && this.showTooltip(event);
          })
          .on('mouseenter', (event: MouseEvent) => {
            this.tooltip && this.showTooltip(event);
          })
          .on('mouseleave', (event: MouseEvent) => {
            this.tooltip && this.tooltip.hide();
          })
          .on(
            'click',
            selection
              ? (event: PointerEvent) => {
                  const point = select(event.target as SVGCircleElement) as d3.Selection<
                    SVGCircleElement,
                    D,
                    SVGGElement,
                    D
                  >;
                  const selection = this.selection;

                  selection.clear();
                  selection.select(point.data()[0]);
                  this.tooltip && this.showTooltip(event);
                }
              : null
          );
      });

    content
      .on('mouseenter', (event: MouseEvent) => {
        const pointSelection = select(event.target as SVGGElement).selectAll('g.points circle');
        const size = Math.min(1, pointSelection.size());

        pointSelection
          .transition('fill-opacity')
          .duration(300)
          .delay((d, i) => i / Math.pow(2, Math.log10(size)))
          .attr('fill-opacity', 1);
      })
      .on('mouseleave', (event: MouseEvent) => {
        const pointSelection = select(event.target as SVGGElement).selectAll('g.points circle');
        let point: d3.Selection<SVGCircleElement, D, SVGGElement, D>;

        pointSelection.each((d: D, i: number, list: SVGCircleElement[]) => {
          point = select(list[i]);
          point.attr('fill-opacity', 0).interrupt('fill-opacity');
          this.setStyle(point, options.pointStyle);
          if (this.selection && this.selection.isSelected(point.data()[0])) {
            this.setStyle(point, options.selectedPointStyle);
          }
        });
      });
  }

  renderAxes(): void {
    const options = this.options;
    const svgContent = this.content;
    const xClassName = this.X_AXIS_CLASS_NAME;
    const yClassName = this.Y_AXIS_CLASS_NAME;

    this.createAxis(
      this.xAxis.scale(this.getTransformXAxisScale()),
      options.xAxis,
      xClassName,
      this.xTransform
    );
    this.createAxis(
      this.yAxis.scale(this.getTransformYAxisScale()),
      options.yAxis,
      yClassName,
      this.yTransform
    );
    svgContent.select(`.${xClassName}`).call(this.xZoom);
    svgContent.select(`.${yClassName}`).call(this.yZoom);
  }

  viewData(value: D): number {
    return this.getTransformXAxisScale()(this.getXValue(value));
  }

  invertViewData(x: number, datas: Array<Array<D>> = this.data): Array<D> {
    const xAxisScale = this.getTransformXAxisScale();
    let results: Array<D> = [];

    results = d3Merge(
      datas?.map((data) => {
        return data.filter((item) => {
          return this.getXValue(item) === xAxisScale.invert(x).valueOf();
        });
      })
    );
    return results;
  }

  setViewportExtent(): void {
    super.setViewportExtent();

    const options = this.options;
    const canvasArea = this.getCanvasArea();
    const scales = [
      {
        scale: this.xAxisScale,
        options: options.xAxis
      },
      {
        scale: this.yAxisScale,
        options: options.yAxis
      }
    ].forEach((item) => {
      switch (item.options?.position) {
        case 'left':
        case 'right':
          item.scale.rangeRound([canvasArea.top + canvasArea.height, canvasArea.top]);
          break;
        default:
          item.scale.rangeRound([canvasArea.left, canvasArea.left + canvasArea.width]);
      }
    });
  }

  protected identifyZoom(): void {
    this.xTransform = this.yTransform = zoomIdentity;
  }

  protected showTooltip(event: MouseEvent): void {
    const point = select(event.target as SVGCircleElement);
    const value = point.size() ? (point.data()[0] as D) : null;
    const contentFun = this.options.tooltip?.content;
    const message = value
      ? typeof contentFun === 'function'
        ? contentFun(value)
        : `${this.getXValue(value)}: ${this.getYValue(value)}`
      : '';

    this.updateTooltip(event, message);
  }
}
