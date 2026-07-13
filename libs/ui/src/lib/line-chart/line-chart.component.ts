import { getTooltipOptions, getVerticalHoverLinePlugin } from '@ghostfolio/common/chart-helper';
import { primaryColorRgb, secondaryColorRgb } from '@ghostfolio/common/config';
import { getBackgroundColor, getDateFormatString, getLocale, getTextColor } from '@ghostfolio/common/helper';
import { LineChartItem } from '@ghostfolio/common/interfaces';
import { ColorScheme } from '@ghostfolio/common/types';



import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, type ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { type AnimationsSpec, Chart, Filler, LinearScale, LineController, LineElement, PointElement, type ScriptableTooltipContext, TimeScale, Tooltip, type TooltipItem, type TooltipOptions } from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin, { type AnnotationOptions } from 'chartjs-plugin-annotation';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';



import { registerChartConfiguration } from '../chart';



















@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxSkeletonLoaderModule],
  selector: 'gf-line-chart',
  styleUrls: ['./line-chart.component.scss'],
  templateUrl: './line-chart.component.html'
})
export class GfLineChartComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() benchmarkDataItems: LineChartItem[] = [];
  @Input() benchmarkLabel = '';
  @Input() buyDateMarkers: LineChartItem[] = [];
  @Input() colorScheme: ColorScheme;
  @Input() sellDateMarkers: LineChartItem[] = [];
  @Input() currency: string;
  @Input() historicalDataItems: LineChartItem[];
  @Input() isAnimated = false;
  @Input() label: string;
  @Input() locale = getLocale();
  @Input() showGradient = false;
  @Input() showLegend = false;
  @Input() showLoader = true;
  @Input() showXAxis = false;
  @Input() showYAxis = false;
  @Input() unit: string;
  @Input() yMax: number;
  @Input() yMaxLabel: string;
  @Input() yMin: number;
  @Input() yMinLabel: string;

  @ViewChild('chartCanvas') chartCanvas: ElementRef<HTMLCanvasElement>;

  public chart: Chart<'line'>;
  public isLoading = true;

  private annotationRevealTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly ANIMATION_DURATION = 800;
  private readonly marketChangeLabel = $localize`Market Change`;
  private readonly sharesLabel = $localize`Shares`;

  public constructor(private changeDetectorRef: ChangeDetectorRef) {
    Chart.register(
      annotationPlugin,
      Filler,
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      TimeScale,
      Tooltip
    );

    registerChartConfiguration();
  }

  public ngAfterViewInit() {
    if (this.historicalDataItems) {
      setTimeout(() => {
        // Wait for the chartCanvas
        this.initialize();

        this.changeDetectorRef.markForCheck();
      });
    }
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes['historicalDataItems']) {
      setTimeout(() => {
        // Wait for the chartCanvas
        this.initialize();

        this.changeDetectorRef.markForCheck();
      });
    } else if (
      (changes['buyDateMarkers'] || changes['sellDateMarkers']) &&
      this.chart
    ) {
      this.chart.options.plugins ??= {};
      this.chart.options.plugins.annotation = {
        annotations: {
          ...this.buildBuyDateMarkerAnnotations(),
          ...this.buildSellDateMarkerAnnotations()
        }
      };
      this.chart.update();
      this.changeDetectorRef.markForCheck();
    }
  }

  public ngOnDestroy() {
    if (this.annotationRevealTimer) {
      clearTimeout(this.annotationRevealTimer);
    }
    this.chart?.destroy();
  }

  private initialize() {
    this.isLoading = true;
    const benchmarkPrices: number[] = [];
    const labels: string[] = [];
    const marketPrices: number[] = [];

    this.historicalDataItems?.forEach((historicalDataItem, index) => {
      benchmarkPrices.push(this.benchmarkDataItems?.[index]?.value);
      labels.push(historicalDataItem.date);
      marketPrices.push(historicalDataItem.value);
    });

    const gradient = this.chartCanvas?.nativeElement
      ?.getContext('2d')
      ?.createLinearGradient(
        0,
        0,
        0,
        ((this.chartCanvas.nativeElement.parentNode as HTMLElement)
          .offsetHeight *
          4) /
          5
      );

    if (gradient && this.showGradient) {
      gradient.addColorStop(
        0,
        `rgba(${primaryColorRgb.r}, ${primaryColorRgb.g}, ${primaryColorRgb.b}, 0.01)`
      );
      gradient.addColorStop(1, getBackgroundColor(this.colorScheme));
    }

    const data = {
      labels,
      datasets: [
        {
          borderColor: `rgb(${secondaryColorRgb.r}, ${secondaryColorRgb.g}, ${secondaryColorRgb.b})`,
          borderWidth: 1,
          data: benchmarkPrices,
          fill: false,
          label: this.benchmarkLabel,
          pointRadius: 0,
          spanGaps: false
        },
        {
          backgroundColor: gradient,
          borderColor: `rgb(${primaryColorRgb.r}, ${primaryColorRgb.g}, ${primaryColorRgb.b})`,
          borderWidth: 2,
          data: marketPrices,
          fill: true,
          label: this.label,
          pointRadius: 0
        }
      ]
    };

    const buyDateMarkerAnnotations = this.buildBuyDateMarkerAnnotations({
      display: !this.isAnimated
    });

    const sellDateMarkerAnnotations = this.buildSellDateMarkerAnnotations({
      display: !this.isAnimated
    });

    const dateMarkerAnnotations = {
      ...buyDateMarkerAnnotations,
      ...sellDateMarkerAnnotations
    };

    if (this.chartCanvas) {
      const animations = {
        x: this.getAnimationConfigurationForAxis({ labels, axis: 'x' }),
        y: this.getAnimationConfigurationForAxis({ labels, axis: 'y' })
      };

      if (this.chart) {
        this.chart.data = data;
        this.chart.options.plugins ??= {};
        this.chart.options.plugins.annotation = {
          annotations: dateMarkerAnnotations
        };
        this.chart.options.plugins.tooltip =
          this.getTooltipPluginConfiguration();
        this.chart.options.animations = this.isAnimated
          ? animations
          : undefined;

        this.chart.update();

        if (this.isAnimated) {
          this.scheduleAnnotationReveal();
        }
      } else {
        this.chart = new Chart(this.chartCanvas.nativeElement, {
          data,
          options: {
            animations: this.isAnimated ? animations : undefined,
            aspectRatio: 16 / 9,
            elements: {
              point: {
                hoverBackgroundColor: getBackgroundColor(this.colorScheme),
                hoverRadius: 2
              }
            },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              annotation: {
                annotations: dateMarkerAnnotations
              },
              legend: {
                align: 'start',
                display: this.showLegend,
                position: 'bottom'
              },
              tooltip: this.getTooltipPluginConfiguration(),
              verticalHoverLine: {
                color: `rgba(${getTextColor(this.colorScheme)}, 0.1)`
              }
            },
            scales: {
              x: {
                border: {
                  color: `rgba(${getTextColor(this.colorScheme)}, 0.1)`
                },
                display: this.showXAxis,
                grid: {
                  display: false
                },
                time: {
                  tooltipFormat: getDateFormatString(this.locale),
                  unit: 'year'
                },
                type: 'time'
              },
              y: {
                border: {
                  width: 0
                },
                display: this.showYAxis,
                grid: {
                  color: ({ scale, tick }) => {
                    if (
                      tick.value === 0 ||
                      tick.value === scale.max ||
                      tick.value === scale.min ||
                      tick.value === this.yMax ||
                      tick.value === this.yMin
                    ) {
                      return `rgba(${getTextColor(this.colorScheme)}, 0.1)`;
                    }

                    return 'transparent';
                  }
                },
                max: this.yMax,
                min: this.yMin,
                position: 'right',
                ticks: {
                  callback: (tickValue, index, ticks) => {
                    if (index === 0 || index === ticks.length - 1) {
                      // Only print last and first legend entry

                      if (index === 0 && this.yMinLabel) {
                        return this.yMinLabel;
                      }

                      if (index === ticks.length - 1 && this.yMaxLabel) {
                        return this.yMaxLabel;
                      }

                      if (typeof tickValue === 'number') {
                        return tickValue.toLocaleString(this.locale, {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2
                        });
                      }

                      return tickValue;
                    }

                    return '';
                  },
                  display: this.showYAxis,
                  mirror: true,
                  z: 1
                },
                type: 'linear'
              }
            },
            spanGaps: true
          },
          plugins: [
            getVerticalHoverLinePlugin(this.chartCanvas, this.colorScheme)
          ],
          type: 'line'
        });

        if (this.isAnimated) {
          this.scheduleAnnotationReveal();
        }
      }
    }

    this.isLoading = false;
  }

  private getAnimationConfigurationForAxis({
    axis,
    labels
  }: {
    axis: 'x' | 'y';
    labels: string[];
  }): Partial<AnimationsSpec<'line'>[string]> {
    const delayBetweenPoints = this.ANIMATION_DURATION / labels.length;

    return {
      delay(context) {
        if (context.type !== 'data' || context[`${axis}Started`]) {
          return 0;
        }

        context[`${axis}Started`] = true;
        return context.dataIndex * delayBetweenPoints;
      },
      duration: delayBetweenPoints,
      easing: 'linear',
      from: NaN,
      type: 'number'
    };
  }

  private buildBuyDateMarkerAnnotations({
    display
  }: { display: boolean } = { display: true }): Record<string, AnnotationOptions> {
    return this.buildDateMarkerAnnotations({
      backgroundColor: 'rgba(0,177,0,0.4)',
      display,
      keyPrefix: 'buyDateMarker',
      markers: this.buyDateMarkers
    });
  }

  private buildSellDateMarkerAnnotations({
    display
  }: { display: boolean } = { display: true }): Record<string, AnnotationOptions> {
    return this.buildDateMarkerAnnotations({
      backgroundColor: 'rgba(177,0,0,0.4)',
      display,
      keyPrefix: 'sellDateMarker',
      markers: this.sellDateMarkers
    });
  }

  private buildDateMarkerAnnotations({
    backgroundColor,
    display,
    keyPrefix,
    markers
  }: {
    backgroundColor: string;
    display: boolean;
    keyPrefix: string;
    markers: LineChartItem[];
  }): Record<string, AnnotationOptions> {
    if (!markers?.length || !this.historicalDataItems?.length) {
      return {};
    }

    const priceByDate = new Map<string, number>();
    for (const { date, value } of this.historicalDataItems) {
      if (date != null && value != null) {
        priceByDate.set(date, value);
      }
    }

    return markers.reduce<Record<string, AnnotationOptions>>(
      (acc, { date }, index) => {
        const yValue = priceByDate.get(date);

        if (yValue == null) {
          return acc;
        }

        acc[`${keyPrefix}${index}`] = {
          backgroundColor,
          borderColor: 'rgb(255, 255, 255)',
          borderWidth: 1,
          display,
          pointStyle: 'circle',
          radius: 4,
          type: 'point',
          xScaleID: 'x',
          xValue: date,
          yScaleID: 'y',
          yValue
        };

        return acc;
      },
      {}
    );
  }

  private scheduleAnnotationReveal() {
    if (this.annotationRevealTimer) {
      clearTimeout(this.annotationRevealTimer);
    }

    this.annotationRevealTimer = setTimeout(() => {
      this.annotationRevealTimer = undefined;

      if (!this.chart) {
        return;
      }

      this.chart.options.plugins ??= {};
      this.chart.options.plugins.annotation = {
        annotations: {
          ...this.buildBuyDateMarkerAnnotations({ display: true }),
          ...this.buildSellDateMarkerAnnotations({ display: true })
        }
      };
      this.chart.update('none');
    }, this.ANIMATION_DURATION);
  }

  private getTooltipPluginConfiguration(): Partial<TooltipOptions<'line'>> {
    const tooltipOptions = getTooltipOptions<'line'>({
      colorScheme: this.colorScheme,
      currency: this.currency,
      locale: this.locale,
      unit: this.unit
    });

    return {
      ...tooltipOptions,
      // @ts-ignore: no need to set all attributes in callbacks
      callbacks: {
        ...tooltipOptions.callbacks,
        afterBody: (tooltipItems) => {
          return this.getMarketChangeTooltipLines(tooltipItems);
        },
        footer: (tooltipItems) => {
          return this.getTransactionQuantityTooltipLines(tooltipItems);
        }
      },
      footerColor: (context: ScriptableTooltipContext<'line'>) => {
        return this.getTransactionQuantityTooltipColor(context.tooltipItems);
      },
      mode: 'index',
      position: 'top',
      xAlign: 'center',
      yAlign: 'bottom'
    };
  }

  private getDateForTooltipItems(tooltipItems: TooltipItem<'line'>[]) {
    const dataIndex = tooltipItems?.[0]?.dataIndex;

    return dataIndex != null
      ? this.historicalDataItems?.[dataIndex]?.date
      : undefined;
  }

  private getMarketChangeTooltipLines(tooltipItems: TooltipItem<'line'>[]) {
    const dataIndex = tooltipItems?.[0]?.dataIndex;

    if (dataIndex == null) {
      return [];
    }

    const marketPrice = this.historicalDataItems?.[dataIndex]?.value;
    const quantity = this.historicalDataItems?.[dataIndex]?.quantity;
    const averagePrice = this.benchmarkDataItems?.[dataIndex]?.value;

    if (marketPrice == null || averagePrice == null || quantity == null) {
      return [];
    }

    const marketChange = (marketPrice - averagePrice) * quantity;

    return [`${this.marketChangeLabel}: ${this.formatAmount(marketChange)}`];
  }

  private getTransactionQuantityTooltipLines(
    tooltipItems: TooltipItem<'line'>[]
  ) {
    const date = this.getDateForTooltipItems(tooltipItems);

    if (!date) {
      return [];
    }

    const buyMarker = this.buyDateMarkers?.find((marker) => {
      return marker.date === date;
    });

    if (buyMarker?.quantity) {
      const amount = buyMarker.quantity * buyMarker.value;

      return [
        `${this.sharesLabel}: +${buyMarker.quantity} (${this.formatAmount(amount)})`
      ];
    }

    const sellMarker = this.sellDateMarkers?.find((marker) => {
      return marker.date === date;
    });

    if (sellMarker?.quantity) {
      const amount = -(sellMarker.quantity * sellMarker.value);

      return [
        `${this.sharesLabel}: -${sellMarker.quantity} (${this.formatAmount(amount)})`
      ];
    }

    return [];
  }

  private formatAmount(amount: number) {
    const sign = amount >= 0 ? '+' : '';
    const formattedAmount = amount.toLocaleString(this.locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });

    return `${sign}${formattedAmount}${this.currency ? ` ${this.currency}` : ''}`;
  }

  private getTransactionQuantityTooltipColor(
    tooltipItems: TooltipItem<'line'>[]
  ) {
    const date = this.getDateForTooltipItems(tooltipItems);

    if (date) {
      if (
        this.buyDateMarkers?.some((marker) => {
          return marker.date === date;
        })
      ) {
        return 'rgb(0, 177, 0)';
      }

      if (
        this.sellDateMarkers?.some((marker) => {
          return marker.date === date;
        })
      ) {
        return 'rgb(177, 0, 0)';
      }
    }

    return `rgb(${getTextColor(this.colorScheme)})`;
  }
}
