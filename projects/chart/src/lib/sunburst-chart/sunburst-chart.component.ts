import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges
} from '@angular/core';
import { PercentPipe } from '@angular/common';
import { coerceElement, coerceNumberProperty } from '@angular/cdk/coercion';
import { Overlay } from '@angular/cdk/overlay';
import * as d3 from 'd3';

import { DEFAULT_CHART_OPTIONS, DEFAULT_SUNBURST_CHART_OPTIONS, SunburstChartOptions, PRIMARY_COLOR } from '../chart-options';
import { SunburstData } from '../chart-data';
import { ChartBase } from '../chart-base';

@Component({
  selector: 'app-sunburst-chart',
  template: '',
  styles: [`:host { display: block; overflow: hidden; }`, `svg { display: block; }`],
  host: {
    class: 'chart chart-sunburst'
  },
  providers: [
    {
      provide: DEFAULT_CHART_OPTIONS,
      useValue: DEFAULT_SUNBURST_CHART_OPTIONS
    }
  ]
})
export class SunburstChartComponent<D extends SunburstData>
  extends ChartBase<D, SunburstChartOptions>
  implements OnChanges, OnInit, OnDestroy {

  private root: d3.HierarchyRectangularNode<D>;
  private arc: d3.Arc<D, d3.DefaultArcObject>;
  private totalDepth: number;

  constructor(
    elementRef: ElementRef<HTMLElement>,
    protected renderer: Renderer2,
    protected changeDetectorRef: ChangeDetectorRef,
    protected overlay: Overlay,
    protected injector: Injector,
    private percentPipe: PercentPipe
  ) {
    super(coerceElement(elementRef), renderer, changeDetectorRef, overlay, injector);
    this.arc = d3
      .arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .padAngle((d: any) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .innerRadius((d: any) => d.y0)
      .outerRadius((d: any) => d.y1 - 1);
    this.totalDepth = 0;
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
      this.setPalette();
    }

    this.prepareToRender();
  }

  ngOnInit(): void {
    super.ngOnInit();
  }

  render(): void {
    this.renderContent();
  }

  renderContent(): void {
    const data: SunburstData = (this.data ? (this.data[0] as D) : null) || { id: '', name: '', children: [] };
    const options = this.options;
    const fontSize = (coerceNumberProperty(options?.font['font-size']) || 14);
    const delayValue = options.delay;
    const palette = this.getPalette();
    const canvasArea = this.getCanvasArea();
    const radius = Math.min(canvasArea.width, canvasArea.height) / 2;
    const content = this.content.select(`.${this.CONTENT_CLASS_NAME}`);

    const arc = this.arc.padRadius(radius / 2);
    const root = this.root = d3.partition().size([2 * Math.PI, radius])(
      d3.hierarchy(data)
        .sum((d) => d.children && d.children.length ? 0 : d.value)
        .sort((a, b) => {
          return b.value - a.value;
        })
      ) as d3.HierarchyRectangularNode<D>;
    const totalDepth = this.totalDepth = d3.max(root.descendants(), (d) => d.depth);
    const factor = 1 / this.totalDepth;
    const opacityInterpolator = d3.interpolate(Math.min(Math.max(factor, 0.4), 0.9), Math.max(Math.min(1 - factor, 0.9), 0.9));

    palette.domain(d3.map(data.children, (d) => d.id));

    content.selectAll('text.main')
      .data([data])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('text'));
      })
      .attr('class', 'main')
      .attr('transform', `translate(${[canvasArea.left + canvasArea.width / 2, canvasArea.top + canvasArea.height / 2]})`)
      .attr('text-anchor', 'middle')
      .call((label: d3.Selection<SVGElement, any, SVGElement, any>) => {
        this.setTitle(label, label.data()[0]);
        this.setStyle(label, options.title?.font);
      });

    content.selectAll('g.part')
      .data(
        root.descendants().filter((d) => {
          // Don't draw the root node, and for efficiency, filter out nodes that would be too small to see
          return d.depth && d.x1 - d.x0 > 0.001;
        })
      )
      .join((enter) => {
        return enter.append(() => this.createSVGElement('g'));
      })
      .attr('class', 'part')
      .attr('transform', `translate(${[canvasArea.left + canvasArea.width / 2, canvasArea.top + canvasArea.height / 2]})`)
      .call((partG) => {
        partG
          .selectAll('path')
          .data((d) => d)
          .join((enter) => {
            return enter.append(() => this.createSVGElement('path'));
          })
          .attr('fill', (d, i) => {
            return this.getColorByData(d, i).toString();
          })
          .attr('fill-opacity', (d) => opacityInterpolator((d.depth + 1) / totalDepth))
          .attr('d', arc as any);

        partG
          .selectAll('text')
          .data((d) => d)
          .join((enter) => {
            return enter.append(() => this.createSVGElement('text'));
          })
          .attr('transform', (d) => {
            const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
            const y = (d.y0 + d.y1) / 2;

            return `rotate(${x - 90}) translate(${y}, 0) rotate(${x < 180 ? 0 : 180})`;
          })
          .text((d: d3.HierarchyRectangularNode<{name: string}>) => {
            if (d.depth && ((d.y0 + d.y1) / 2) * (d.x1 - d.x0) > fontSize) {
              return d.data.name;
            }
            return '';
          })
          .call((label: d3.Selection<SVGElement, any, SVGElement, any>) => {
            label.attr('dy', '0.35em');
            this.setStyle(label, options.font);
          });
      })
      .on('mousemove', (event: MouseEvent) => {
        this.tooltip && this.showTooltip(event);
      })
      .on('mouseenter', (event: MouseEvent) => {
        const gEl = d3.select(event.target as SVGGElement);
        const d = gEl.data()[0] as d3.HierarchyRectangularNode<D>;

        gEl.select('path').attr('fill-opacity', 1);
        this.setTitle(content.select('text.main'), d.data);
        this.tooltip && this.showTooltip(event);
        event.stopPropagation();
      })
      .on('mouseleave', (event: MouseEvent) => {
        const gEl = d3.select(event.target as SVGGElement);
        const d = gEl.data()[0] as d3.HierarchyRectangularNode<D>;

        gEl.select('path').attr('fill-opacity', opacityInterpolator((d.depth + 1) / totalDepth));
        this.setTitle(content.select('text.main'), this.data ? (this.data[0] as D ): null);
        this.tooltip && this.tooltip.hide();
        event.stopPropagation();
      });
  }

  renderAxes(): void {
    throw new Error('Method not implemented.');
  }

  viewData(value: D) {
    throw new Error('Method not implemented.');
  }

  invertViewData(value: D): D | D[] {
    return value;
  }

  setPalette(): void {
    const options = this.options;
    const defaultOptions = this.injector.get(DEFAULT_CHART_OPTIONS);
    const data: SunburstData = (this.data ? (this.data[0] as D) : null) || { id: '', name: '', children: [] };
    const dataLength = data.children.length;
    let palette = options.palette;
    let colorRange = options.colors;

    if (palette) {
      palette.unknown(defaultOptions.palette.unknown());
    }
    palette = this.palette = (palette || defaultOptions.palette.copy());

    if (!colorRange || !colorRange.length) {
      colorRange = d3.quantize(d3.interpolateRainbow, dataLength + 1).reverse();
      colorRange.pop();
    }
    palette.range(colorRange);
  }

  protected identifyZoom(): void {
    this.xTransform = this.yTransform = d3.zoomIdentity;
  }

  protected showTooltip(event: MouseEvent): void {
    const contentFun = this.options.tooltip?.content;
    const point = d3.select(event.target as SVGCircleElement);
    const value = point.size() ? (point.data()[0] as d3.HierarchyRectangularNode<D>) : null;
    const message = value ? (
      typeof contentFun === 'function'
        ? contentFun(value.data)
        : (`${value
          .ancestors()
          .map((d: d3.HierarchyRectangularNode<{name: string}>) => d.data.name)
          .reverse()
          .join('/')}\n${this.percentPipe.transform(value.value / this.root.value, '0.0-2')}`)
    ) : '';

    this.updateTooltip(event, message);
  }

  private setTitle(label: d3.Selection<d3.BaseType, any, d3.BaseType, any>, data: SunburstData): void {
    let name: string = '';
    let value: number = 0;

    if (data) {
      if (data.name) {
        name = data.name;
      } else if (data.data) {
        name = data.data.name;
      }
      if (typeof data.value === 'number') {
        value = data.value;
      }
    }
    label.selectAll('.percentage')
      .data([name, this.getValue(value).toString()])
      .join((enter) => {
        return enter.append(() => this.createSVGElement('tspan'));
      })
      .attr('class', 'percentage')
      .attr('x', 0)
      .attr('y', 0)
      .attr('dy', (d, i) => `${-0.1 + i * 1.2}em`)
      .text((d) => d);
  }

  private getColorByData(d, i: number): d3.Color {
    const level = d.depth;
    let length = 1;
    let index = i % length;

    if (d.parent) {
      length = d.parent.data.children.length;
      index = i % length;
      d.parent.data.children.some((sibling, sIndex) => {
        if (d.data.name === sibling.name) {
          index = sIndex;
          return true;
        }
        return false;
      });
    }
    while (d.depth > 1) {
      d = d.parent;
    }

    const primaryColor = d3.hsl(this.getPalette()(d.data.id));
    const hue = d3.hsl(primaryColor).h;
    const factor = 1 / this.totalDepth;
    let topLevelColor = primaryColor;

    if (level > 1) {
      const startColor = d3.hsl(hue, Math.max(1 - factor, 0.3), Math.max(1 - factor, 0.8));
      const endColor = d3.hsl(hue, 1, Math.min(factor, 0.2));

      topLevelColor = d3.hsl((d3.interpolateHsl(startColor, endColor)(index / length)));
    }
    return topLevelColor;
  }
}
