import { NUMERICAL_PRECISION_THRESHOLD_6_FIGURES } from '@ghostfolio/common/config';
import { getDateFnsLocale, getLocale } from '@ghostfolio/common/helper';
import { PortfolioSummary, User } from '@ghostfolio/common/interfaces';
import { translate } from '@ghostfolio/ui/i18n';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { GfValueComponent } from '@ghostfolio/ui/value';

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  output,
  signal
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IonIcon } from '@ionic/angular/standalone';
import { formatDistanceToNow } from 'date-fns';
import { addIcons } from 'ionicons';
import {
  ellipsisHorizontalCircleOutline,
  informationCircleOutline
} from 'ionicons/icons';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GfValueComponent, IonIcon, MatTooltipModule],
  selector: 'gf-portfolio-summary',
  styleUrls: ['./portfolio-summary.component.scss'],
  templateUrl: './portfolio-summary.component.html'
})
export class GfPortfolioSummaryComponent implements OnChanges, OnDestroy {
  @Input() baseCurrency: string;
  @Input() deviceType: string;
  @Input() hasImpersonationId: boolean;
  @Input() hasPermissionToUpdateUserSettings: boolean;
  @Input() isLoading: boolean;
  @Input() language: string;
  @Input() locale = getLocale();
  @Input() investmentPlan: {
    cashBuffer: number;
    cashReserve: number;
    longTermGrowthTarget: number;
    preservationBucket: number;
    sipMonthlyBudget: number;
  } | null = null;
  @Input() summary: PortfolioSummary;
  @Input() user: User;

  public emergencyFundChanged = output<number>();

  protected readonly buyAndSellActivitiesTooltip = translate(
    'BUY_AND_SELL_ACTIVITIES_TOOLTIP'
  );

  protected precision = 2;
  protected showSimpleReturn = signal(false);
  protected timeInMarket: string | undefined;

  private readonly notificationService = inject(NotificationService);
  private simpleReturnToggleIntervalId: ReturnType<typeof setInterval>;

  public constructor() {
    addIcons({ ellipsisHorizontalCircleOutline, informationCircleOutline });

    this.simpleReturnToggleIntervalId = setInterval(() => {
      this.showSimpleReturn.update((value) => !value);
    }, 60000);
  }

  public ngOnDestroy() {
    clearInterval(this.simpleReturnToggleIntervalId);
  }

  protected get buyingPowerPercentage() {
    return this.summary?.totalValueInBaseCurrency
      ? this.summary.cash / this.summary.totalValueInBaseCurrency
      : 0;
  }

  protected get emergencyFundPercentage() {
    return this.summary?.totalValueInBaseCurrency
      ? (this.summary.emergencyFund?.total || 0) /
          this.summary.totalValueInBaseCurrency
      : 0;
  }

  protected get excludedFromAnalysisPercentage() {
    return this.summary?.totalValueInBaseCurrency
      ? this.summary.excludedAccountsAndActivities /
          this.summary.totalValueInBaseCurrency
      : 0;
  }

  protected get simpleReturnPercentage() {
    return this.summary?.totalInvestmentValueWithCurrencyEffect
      ? this.summary.netPerformanceWithCurrencyEffect /
          this.summary.totalInvestmentValueWithCurrencyEffect
      : undefined;
  }

  public ngOnChanges() {
    if (this.summary) {
      if (
        this.deviceType === 'mobile' &&
        (this.summary.totalValueInBaseCurrency ?? 0) >=
          NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
      ) {
        this.precision = 0;
      }

      if (this.summary.dateOfFirstActivity) {
        this.timeInMarket = formatDistanceToNow(
          this.summary.dateOfFirstActivity,
          {
            locale: getDateFnsLocale(this.language)
          }
        );
      } else {
        this.timeInMarket = '-';
      }
    } else {
      this.timeInMarket = undefined;
    }
  }

  protected onEditEmergencyFund() {
    this.notificationService.prompt({
      confirmFn: (value) => {
        const emergencyFund = parseFloat(value.trim()) || 0;

        this.emergencyFundChanged.emit(emergencyFund);
      },
      confirmLabel: $localize`Save`,
      defaultValue: this.summary.emergencyFund?.total?.toString() ?? '0',
      title: $localize`Please set the amount of your emergency fund.`
    });
  }
}
