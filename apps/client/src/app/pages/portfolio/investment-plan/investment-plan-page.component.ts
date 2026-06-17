import { LookupItem } from '@ghostfolio/common/interfaces';
import { GfSymbolAutocompleteComponent } from '@ghostfolio/ui/symbol-autocomplete';
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
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, of, timeout } from 'rxjs';

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

export type InvestmentPlanTab = 'settings' | 'rebalancing' | 'dca' | 'signals';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    GfSymbolAutocompleteComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    ReactiveFormsModule
  ],
  selector: 'gf-investment-plan-page',
  styleUrls: ['./investment-plan-page.component.scss'],
  templateUrl: './investment-plan-page.component.html'
})
export class GfInvestmentPlanPageComponent implements OnInit {
  public activeTab: InvestmentPlanTab = 'settings';
  public allocationSymbolControl = new FormControl<LookupItem | null>(null);
  public allocations: Allocation[] = [];
  public dcaSchedules: DcaSchedule[] = [];
  public dcaSymbolControl = new FormControl<LookupItem | null>(null);
  public emailEnabled = false;
  public isLoading = true;
  public newAllocation: Omit<Allocation, 'symbol'> = {
    rebalanceThreshold: 5,
    targetWeight: 0
  };
  public newDca: Omit<DcaSchedule, 'symbol'> = {
    deadlineDay: 5,
    signalType: 'MA5',
    startDate: new Date().toISOString().split('T')[0],
    type: 'ADD_POSITION',
    weeklyBudget: 200
  };
  public plan: {
    capitalPool: number;
    deployedCapital: number;
    notifyEmail: string;
    notifyLanguage: string;
  } = {
    capitalPool: 0,
    deployedCapital: 0,
    notifyEmail: '',
    notifyLanguage: 'en'
  };
  public aiReport = '';
  public isCopyingPrompt = false;
  public isGeneratingReport = false;
  public rebalancingResult: {
    actions: any[];
    hasTriggered: boolean;
    totalValue: number;
  } | null = null;
  public signals: any[] = [];
  public totalAllocationWeight = 0;

  public isSaving = false;

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService,
    private readonly destroyRef: DestroyRef,
    private readonly snackBar: MatSnackBar
  ) {}

  public ngOnInit() {
    this.loadPlan();
    this.loadSignals();
    this.loadRebalancing();
  }

  public setTab(tab: InvestmentPlanTab) {
    this.activeTab = tab;
    this.changeDetectorRef.markForCheck();
  }

  public onSavePlan() {
    this.isSaving = true;
    this.changeDetectorRef.markForCheck();
    this.dataService
      .putInvestmentPlan({ ...this.plan, emailEnabled: this.emailEnabled })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.loadPlan();
          this.snackBar.open('Settings saved', undefined, { duration: 3000 });
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.isSaving = false;
          this.snackBar.open('Failed to save settings', undefined, { duration: 3000 });
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public onAddAllocation() {
    const symbol = this.allocationSymbolControl.value?.symbol;
    if (!symbol || this.newAllocation.targetWeight <= 0) return;
    this.dataService
      .putInvestmentPlanAllocation(symbol, {
        rebalanceThreshold: this.newAllocation.rebalanceThreshold,
        targetWeight: this.newAllocation.targetWeight
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.allocationSymbolControl.reset();
        this.newAllocation = { rebalanceThreshold: 5, targetWeight: 0 };
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
    const symbol = this.dcaSymbolControl.value?.symbol;
    if (!symbol || this.newDca.weeklyBudget <= 0) return;
    this.dataService
      .postInvestmentPlanDca({ ...this.newDca, symbol })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.dcaSymbolControl.reset();
        this.newDca = {
          deadlineDay: 5,
          signalType: 'MA5',
          startDate: new Date().toISOString().split('T')[0],
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

  public prefillDcaFromRebalance(action: any) {
    const total = Math.round(action.amount);
    const weekly = Math.max(50, Math.round(total / 7 / 50) * 50);
    this.newDca = { ...this.newDca, totalBudget: total, weeklyBudget: weekly };
    this.setTab('dca');
  }

  public onCopyPrompt() {
    this.isCopyingPrompt = true;
    this.changeDetectorRef.markForCheck();

    this.dataService
      .fetchInvestmentAiPrompt()
      .pipe(
        catchError(() => of({ prompt: '' })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ prompt }) => {
        if (prompt) {
          navigator.clipboard.writeText(prompt).catch(() => {});
        }
        this.isCopyingPrompt = false;
        this.changeDetectorRef.markForCheck();
      });
  }

  public onGenerateReport() {
    this.isGeneratingReport = true;
    this.aiReport = '';
    this.changeDetectorRef.markForCheck();

    this.dataService
      .generateInvestmentAiReport()
      .pipe(
        timeout(60000),
        catchError(() =>
          of({ report: 'Failed to generate report. Please check your AI provider configuration in Admin → Model Provider.' })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ report }) => {
        this.aiReport = report;
        this.isGeneratingReport = false;
        this.changeDetectorRef.markForCheck();
      });
  }

  public signalTypeLabel(type: string): string {
    const map: Record<string, string> = {
      DCA_BUY: 'DCA Buy',
      DCA_WAIT: 'DCA Wait',
      REBALANCE_BUY: 'Rebalance Buy',
      REBALANCE_SELL: 'Rebalance Sell'
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
