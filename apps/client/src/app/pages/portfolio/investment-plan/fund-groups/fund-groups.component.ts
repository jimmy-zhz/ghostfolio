import { UserService } from '@ghostfolio/client/services/user/user.service';
import { ConfirmationDialogType } from '@ghostfolio/common/enums';
import { User } from '@ghostfolio/common/interfaces';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { DataService } from '@ghostfolio/ui/services';

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
  FundGroupFiguresResponse,
  FundGroupResponse,
  FundGroupsResponse,
  formatAmount,
  formatPercent,
  formatShare,
  getAccountColors,
  getDistribution,
  hasGap
} from './fund-groups.util';

interface FundGroupForm {
  id?: string;
  isRemainder: boolean;
  kind: 'PURPOSE' | 'SOURCE';
  name: string;
  note: string;
  principal: number | null;
  tagId: string;
  targetAmount: number | null;
  targetDate: string;
}

/**
 * Sources (whose money) and purposes (what the money is for) of the
 * investments, next to the accounts, see
 * docs/dev/requirements/iteration-2026-12.md
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  selector: 'gf-fund-groups',
  styleUrls: ['./fund-groups.component.scss'],
  templateUrl: './fund-groups.component.html'
})
export class GfFundGroupsComponent implements OnInit {
  protected readonly accountColors = computed(() => {
    const report = this.report();

    return getAccountColors([
      ...(report?.sources ?? []),
      ...(report?.purposes ?? [])
    ]);
  });

  protected readonly expandedId = signal<string | undefined>(undefined);
  protected readonly expandedCheck = signal<string | undefined>(undefined);
  protected readonly form = signal<FundGroupForm | undefined>(undefined);
  protected readonly formatPercent = formatPercent;
  protected readonly hasGap = hasGap;
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly report = signal<FundGroupsResponse | undefined>(undefined);
  protected readonly user = signal<User | undefined>(undefined);

  protected readonly multipleSourcesLabel = $localize`activities have more than one source`;
  protected readonly purposeLabel = $localize`Purpose`;
  protected readonly sourceLabel = $localize`Source`;
  protected readonly withoutSourceLabel = $localize`activities have no source`;

  protected readonly ownTags = computed(() => {
    const user = this.user();

    return (user?.tags ?? [])
      .filter(({ userId }) => {
        return userId === user?.id;
      })
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
  });

  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user.set(state.user);
        }
      });

    this.load();
  }

  protected formatAmount(value: number | null) {
    return formatAmount(value, this.user()?.settings?.locale);
  }

  protected getDistribution({ accounts }: FundGroupFiguresResponse) {
    return getDistribution({ accounts, colors: this.accountColors() });
  }

  protected formatProgress(progress: number) {
    return formatShare(progress, this.user()?.settings?.locale);
  }

  protected getFundGroupName(id: string) {
    return (
      this.report()?.purposes.find((purpose) => {
        return purpose.id === id;
      })?.name ?? ''
    );
  }

  protected getProgressWidth(progress: number) {
    return Math.min(Math.max(progress, 0), 1) * 100;
  }

  protected onAdd(kind: FundGroupForm['kind']) {
    this.form.set({
      kind,
      isRemainder: false,
      name: '',
      note: '',
      principal: null,
      tagId: '',
      targetAmount: null,
      targetDate: ''
    });
  }

  protected onCancel() {
    this.form.set(undefined);
  }

  protected onDelete(fundGroup: FundGroupResponse) {
    this.notificationService.confirm({
      confirmFn: () => {
        this.dataService
          .deleteFundGroup(fundGroup.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.load();
          });
      },
      confirmType: ConfirmationDialogType.Warn,
      title: $localize`Do you really want to delete ${fundGroup.name}:name:? Its activities and tag stay as they are.`
    });
  }

  protected onEdit(fundGroup: FundGroupResponse) {
    this.form.set({
      id: fundGroup.id,
      isRemainder: fundGroup.isRemainder,
      kind: fundGroup.kind,
      name: fundGroup.name,
      note: fundGroup.note ?? '',
      // The remainder shows its derived principal, which is not stored
      principal: fundGroup.isRemainder ? null : fundGroup.principal,
      tagId: fundGroup.tagId,
      targetAmount: fundGroup.targetAmount,
      targetDate: fundGroup.targetDate?.slice(0, 10) ?? ''
    });
  }

  protected onSave() {
    const form = this.form();

    if (!form) {
      return;
    }

    const body: Record<string, unknown> = {
      id: form.id,
      kind: form.kind,
      name: form.name,
      note: form.note || null,
      tagId: form.tagId
    };

    if (form.kind === 'SOURCE') {
      body.isRemainder = form.isRemainder;
      body.principal = form.isRemainder ? null : form.principal;
    } else {
      body.targetAmount = form.targetAmount;
      body.targetDate = form.targetDate || null;
    }

    this.isSaving.set(true);

    this.dataService
      .putFundGroup(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: ({ error }) => {
          this.isSaving.set(false);

          this.notificationService.alert({
            title:
              error?.message ?? $localize`The fund group could not be saved.`
          });
        },
        next: () => {
          this.isSaving.set(false);
          this.form.set(undefined);
          this.load();
        }
      });
  }

  protected onToggle(id: string) {
    this.expandedId.update((expandedId) => {
      return expandedId === id ? undefined : id;
    });
  }

  protected onToggleCheck(check: string) {
    this.expandedCheck.update((expandedCheck) => {
      return expandedCheck === check ? undefined : check;
    });
  }

  protected updateForm(changes: Partial<FundGroupForm>) {
    this.form.update((form) => {
      return form ? { ...form, ...changes } : form;
    });
  }

  private load() {
    this.dataService
      .fetchFundGroups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.isLoading.set(false);
        },
        next: (report: FundGroupsResponse) => {
          this.report.set(report);
          this.isLoading.set(false);
        }
      });
  }
}
