import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { catchError, of } from 'rxjs';

interface Allocation {
  rebalanceThreshold: number;
  symbol: string;
  targetWeight: number;
}

interface DcaSchedule {
  deadlineDay: number;
  endDate?: string;
  id?: string;
  signalType: string;
  startDate: string;
  symbol: string;
  totalBudget?: number;
  type: string;
  weeklyBudget: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule
  ],
  selector: 'gf-investment-plan-page',
  templateUrl: './investment-plan-page.component.html'
})
export class GfInvestmentPlanPageComponent implements OnInit {
  public allocations: Allocation[] = [];
  public dcaSchedules: DcaSchedule[] = [];
  public emailEnabled = false;
  public isLoading = true;
  public newAllocation: Allocation = { rebalanceThreshold: 5, symbol: '', targetWeight: 0 };
  public newDca: DcaSchedule = {
    deadlineDay: 5,
    signalType: 'MA5',
    startDate: new Date().toISOString().split('T')[0],
    symbol: '',
    type: 'ADD_POSITION',
    weeklyBudget: 200
  };
  public plan: { capitalPool: number; deployedCapital: number; notifyEmail: string; notifyLanguage: string } = {
    capitalPool: 0,
    deployedCapital: 0,
    notifyEmail: '',
    notifyLanguage: 'zh'
  };
  public rebalancingResult: { actions: any[]; hasTriggered: boolean; totalValue: number } | null = null;
  public signals: any[] = [];
  public totalAllocationWeight = 0;

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService,
    private readonly destroyRef: DestroyRef
  ) {}

  public ngOnInit() {
    this.loadPlan();
    this.loadSignals();
    this.loadRebalancing();
  }

  public onSavePlan() {
    this.dataService
      .putInvestmentPlan({ ...this.plan, emailEnabled: this.emailEnabled })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPlan());
  }

  public onAddAllocation() {
    if (!this.newAllocation.symbol || this.newAllocation.targetWeight <= 0) return;
    this.dataService
      .putInvestmentPlanAllocation(this.newAllocation.symbol, {
        rebalanceThreshold: this.newAllocation.rebalanceThreshold,
        targetWeight: this.newAllocation.targetWeight
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.newAllocation = { rebalanceThreshold: 5, symbol: '', targetWeight: 0 };
        this.loadPlan();
        this.loadRebalancing();
      });
  }

  public onDeleteAllocation(symbol: string) {
    this.dataService
      .deleteInvestmentPlanAllocation(symbol)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadPlan();
        this.loadRebalancing();
      });
  }

  public onAddDca() {
    if (!this.newDca.symbol || this.newDca.weeklyBudget <= 0) return;
    this.dataService
      .postInvestmentPlanDca(this.newDca)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.newDca = {
          deadlineDay: 5,
          signalType: 'MA5',
          startDate: new Date().toISOString().split('T')[0],
          symbol: '',
          type: 'ADD_POSITION',
          weeklyBudget: 200
        };
        this.loadPlan();
      });
  }

  public onDeleteDca(id: string) {
    this.dataService
      .deleteInvestmentPlanDca(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPlan());
  }

  public onDismissSignal(id: string) {
    this.dataService
      .putInvestmentSignalStatus(id, 'DISMISSED')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSignals());
  }

  public onExecuteSignal(id: string) {
    this.dataService
      .putInvestmentSignalStatus(id, 'EXECUTED')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSignals());
  }

  public signalTypeLabel(type: string): string {
    const map: Record<string, string> = {
      DCA_BUY: '📈 DCA 买入',
      DCA_WAIT: '⏳ DCA 等待',
      REBALANCE_BUY: '🟢 再平衡买入',
      REBALANCE_SELL: '🔴 再平衡卖出'
    };
    return map[type] ?? type;
  }

  private loadPlan() {
    this.isLoading = true;
    this.dataService
      .fetchInvestmentPlan()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((plan) => {
        if (plan) {
          this.plan = {
            capitalPool: plan.capitalPool,
            deployedCapital: plan.deployedCapital,
            notifyEmail: plan.notifyEmail ?? '',
            notifyLanguage: plan.notifyLanguage
          };
          this.emailEnabled = plan.emailEnabled;
          this.allocations = plan.allocations ?? [];
          this.dcaSchedules = plan.dcaSchedules ?? [];
          this.totalAllocationWeight = this.allocations.reduce(
            (s: number, a: Allocation) => s + a.targetWeight,
            0
          );
        }
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }

  private loadSignals() {
    this.dataService
      .fetchInvestmentSignals()
      .pipe(
        catchError(() => of({ signals: [] })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ signals }) => {
        this.signals = signals;
        this.changeDetectorRef.markForCheck();
      });
  }

  private loadRebalancing() {
    this.dataService
      .fetchRebalancing()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        this.rebalancingResult = result;
        this.changeDetectorRef.markForCheck();
      });
  }
}
