import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  Input,
  OnChanges,
  OnInit,
  Renderer2,
  SimpleChanges
} from '@angular/core';
import { coerceElement, coerceNumberProperty } from '@angular/cdk/coercion';
import { Overlay } from '@angular/cdk/overlay';
import * as d3 from 'd3';

import { DEFAULT_BAR_CHART_OPTIONS, DEFAULT_CHART_OPTIONS, BarChartOptions } from '../chart-options';
import { ChartBase } from '../chart-base';

@Component({
  selector: 'app-bar-chart',
  template: '',
  styles: [`:host { display: block; overflow: hidden; }`, `svg { display: block; }`],
  host: {
    class: 'chart chart-bar'
  },
  providers: [
    {
      provide: DEFAULT_CHART_OPTIONS,
      useValue: DEFAULT_BAR_CHART_OPTIONS
    }
  ]
})
export class BarChartComponent<D extends d3.NumberValue>
  extends ChartBase<D, BarChartOptions>
  implements OnChanges, OnInit {
  @Input() data: Array<Array<D>>;

  constructor(
    elementRef: ElementRef<HTMLElement>,
    protected renderer: Renderer2,
    protected changeDetectorRef: ChangeDetectorRef,
    protected overlay: Overlay,
    protected injector: Injector
  ) {
    super(coerceElement(elementRef), renderer, changeDetectorRef, overlay, injector);
    this.createAxisScale('x', this.options.xAxis);
    this.createAxisScale('y', this.options.yAxis);
    this.tooltip = this.createTooltip();
  }

  ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);

    const domainProperties = ['data', 'options'];

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
      const stacked = options.layout === 'stacked';
      const data = this.data || [];
      const scales = [
        {
          scale: this.xAxisScale,
          options: options.xAxis,
          domain: d3.map(data, (d) => d[0]) as Array<d3.NumberValue>
        },
        {
          scale: this.yAxisScale,
          options: options.yAxis,
          domain: d3.merge(d3.map(data, (d) => {
            return stacked ?
              d3.map(d.slice(1), (dd, i) => d3.fsum(d.slice(1, i + 2))) :
              d3.map(d.slice(1), (dd) => Math.abs(coerceNumberProperty(dd)));
          })).concat([0]) as Array<d3.NumberValue>
        }
      ]

      scales.forEach((item) => {
        if (item.options.type === 'string') {
          item.scale.domain(item.domain);
        } else {
          const hasMin = typeof item.options?.min !== 'undefined';
          const hasMax = typeof item.options?.max !== 'undefined';
          let domain = d3.extent(item.domain);
  
          if (hasMin) {
            domain[0] = d3.min([domain[0], item.options.min]);
          }
          if (hasMax) {
            domain[1] = d3.max([domain[1], item.options.max]);
          }
          item.scale.domain(domain);
          typeof item.scale.nice === 'function' && item.scale.nice();
        }
      });

      this.setPalette();
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
  }

  render(): void {
    this.renderAxes();
    this.renderContent();
  }

  renderContent(): void {
    const data: Array<Array<D>> = (this.data || []);
    const numOfSeries = this.getNumOfSeries(data);
    const options = this.options;
    const stacked = options.layout === 'stacked';
    const delayValue = options.delay;
    const palette = this.getPalette();

    const xAxisScale = this.getTransformXAxisScale();
    const yAxisScale = this.getTransformYAxisScale();
    const content = this.content.select(`.${this.CONTENT_CLASS_NAME}`);
    let bandWidth: number = 30;

    typeof xAxisScale.clamp === 'function' && xAxisScale.clamp(false);
    typeof yAxisScale.clamp === 'function' && yAxisScale.clamp(false);
    if (typeof xAxisScale.bandwidth === 'function') {
      bandWidth = xAxisScale.bandwidth();
    } else {
      bandWidth = Math.abs(Math.floor(xAxisScale(data[0][0]) - xAxisScale(data[1][0])));
    }

    content
      .selectAll('g.bars')
      .data([null])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('class', 'bars')
      .selectAll('g.bar')
      .data(data)
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('class', 'bar')
      .call((barG) => {
        barG.selectAll('rect')
          .data((d) => {
            return d3.map(d.slice(1), () => d);
          })
          .join((enter) => {
            return enter.append(() => this.createSVGElement('rect'));
          })
          .attr('fill', (d, i) => palette(i))
          .attr('x', (d, i) => {
            return xAxisScale(d[0]) + (stacked ? 0: (bandWidth / numOfSeries) * i);
          })
          .attr('width', stacked ? bandWidth : bandWidth / numOfSeries)
          // .transition()
          // .duration(500)
          // .delay((d, i) => i * delayValue)
          .attr('y', (d, i) => {
            return stacked ? yAxisScale(i < 1 ? d[i + 1] : d[i]) : yAxisScale(Math.abs(d[i + 1] as number));
          })
          .attr('height', (d, i) => {
            return (yAxisScale(0) - yAxisScale(Math.abs(d[i + 1] as number)));
          });
      })
      .on('mousemove', (event: MouseEvent) => {
        this.tooltip && this.showTooltip(event);
      })
      .on('mouseenter', (event: MouseEvent) => {
        this.tooltip && this.showTooltip(event);
        event.stopPropagation();
      })
      .on('mouseleave', (event: MouseEvent) => {
        this.tooltip && this.tooltip.hide();
        event.stopPropagation();
      });

    const lineData = new Array(Math.min(1, numOfSeries));
    const colorDomain = d3.quantize(d3.interpolateSinebow, numOfSeries + 2);
    colorDomain.unshift();
    colorDomain.pop();
    const linePalette = d3.scaleOrdinal(d3.range(0, numOfSeries, 1), colorDomain);

    if (lineData.length) {
      lineData[0] = (numOfSeries - 1);
    }
    content
      .selectAll('g.lines')
      .data(lineData)
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('class', 'lines')
      .call((lineG) => {
        lineG.selectAll('path')
        .data((d) => {
          return [d3.map(data, (s) => [s[0], stacked ? d3.fsum(s.slice(1)) : s[d]])];
        })
        .join((enter) => {
          return enter.append(() => this.createSVGElement('path'));
        })
        .attr('fill', 'none')
        .attr('stroke', (d, i) => linePalette(i))
        .attr('stroke-width', 1)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', d3.line()
          .curve(d3.curveMonotoneX)
          .x((d) => {
            return xAxisScale(d[0]) + bandWidth / 2;
          })
          .y((d) => {
            return yAxisScale(d[1]);
          }) as any
        )
        .call((curve: d3.Selection<SVGPathElement, Array<Array<D>>, SVGGElement, any>) => {
          this.setStyle(curve, options.lineStyle);
        });
      });
}

  renderAxes(): void {
    const options = this.options;
    const svgContent = this.content;
    const xClassName = this.X_AXIS_CLASS_NAME;
    const yClassName = this.Y_AXIS_CLASS_NAME;
    const canvasArea = this.getCanvasArea();
    const xAxisScale = this.xAxisScale;

    if (typeof xAxisScale.bandwidth === 'function') {
      const domainLength = xAxisScale.domain().length;
      const maxStep: number = coerceNumberProperty(options.maxBandWidth);
      const transform = this.xTransform;

      xAxisScale.paddingOuter(Math.max(0.01, 1 - domainLength / (canvasArea.width / maxStep)))
      xAxisScale.paddingInner(Math.max(0.38, xAxisScale.paddingOuter()));
      this.xZoom.scaleExtent([1, Math.max(1, maxStep / xAxisScale.step())]);
      this.xTransform = new d3.ZoomTransform(transform.k, transform.x, transform.y);
    }

    this.createAxis(this.xAxis.scale(this.getTransformXAxisScale()), options.xAxis, xClassName, this.xTransform);
    this.createAxis(this.yAxis.scale(this.getTransformYAxisScale()), options.yAxis, yClassName, this.yTransform);
    svgContent.select(`.${xClassName}`).call(this.xZoom).call(this.xZoom.transform as any, this.xTransform);
    svgContent.select(`.${yClassName}`)
      .call((axisG) => {
        axisG.selectAll('.tick line')
          .clone()
          .attr('x2', canvasArea.width)
          .attr('stroke', '#000000')
          .style('stroke-dasharray', (d) => {
            return d === 0 ? null : '3 3';
          })
          .attr('stroke-opacity', (d) => {
            return d === 0 ? 0.5 : 0.2;
          });
      })
      .call(this.yZoom);
  }

  viewData(value: D): number {
    return this.getTransformXAxisScale()(this.getXValue(value));
  }

  invertViewData(x: number, datas: Array<Array<D>> = this.data): Array<D> {
    return datas[x];
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
          (typeof item.scale.rangeRound === 'function' ? item.scale.rangeRound : item.scale.range)([canvasArea.top + canvasArea.height, canvasArea.top]);
          break;
        default:
          (typeof item.scale.rangeRound === 'function' ? item.scale.rangeRound : item.scale.range)([canvasArea.left, canvasArea.left + canvasArea.width]);
      }
    });
  }

  protected identifyZoom(): void {
    this.xTransform = this.yTransform = d3.zoomIdentity;
  }

  protected showTooltip(event: MouseEvent): void {
    const point = d3.select(event.target as SVGCircleElement);
    const value = point.size() ? (point.data()[0] as Array<D>) : null;
    const contentFun = this.options.tooltip?.content;
    const message = value ? (
      typeof contentFun === 'function'
        ? contentFun(value)
        : d3.reduce(value, (previousValue: string, currentValue: D) => previousValue + `${currentValue} \n`, '')
    ) : '';

    this.updateTooltip(event, message);
  }

  private getNumOfSeries(data: Array<Array<D>>): number {
    return data && data[0] ? data[0].length - 1 : 0;
  }
}
