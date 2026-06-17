import { IcsService } from '@ghostfolio/client/services/ics/ics.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  Activity,
  AssetProfileIdentifier,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { DateRange } from '@ghostfolio/common/types';
import { GfActivitiesTableComponent } from '@ghostfolio/ui/activities-table';
import { GfFabComponent } from '@ghostfolio/ui/fab';
import { DataService } from '@ghostfolio/ui/services';

import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { PageEvent } from '@angular/material/paginator';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Sort, SortDirection } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Type as ActivityType } from '@prisma/client';
import { format, parseISO } from 'date-fns';
import { DeviceDetectorService } from 'ngx-device-detector';
import { CreateOrderDto, UpdateOrderDto } from '@ghostfolio/common/dtos';
import { downloadAsFile } from '@ghostfolio/common/helper';
import { Subscription } from 'rxjs';
import { translate } from '@ghostfolio/ui/i18n';

import { GfCreateOrUpdateActivityDialogComponent } from './create-or-update-activity-dialog/create-or-update-activity-dialog.component';
import { CreateOrUpdateActivityDialogParams } from './create-or-update-activity-dialog/interfaces/interfaces';
import { GfImportActivitiesDialogComponent } from './import-activities-dialog/import-activities-dialog.component';
import { ImportActivitiesDialogParams } from './import-activities-dialog/interfaces/interfaces';

@Component({
  imports: [
    GfActivitiesTableComponent,
    GfFabComponent,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatSelectModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    RouterModule
  ],
  selector: 'gf-activities-page',
  styleUrls: ['./activities-page.scss'],
  templateUrl: './activities-page.html'
})
export class GfActivitiesPageComponent implements OnInit {
  public activityTypesFilter: string[] = [];
  public activityTypeOptions: { key: ActivityType; label: string }[] = [];
  public accountOptions: { id: string; name: string }[] = [];
  public dataSource: MatTableDataSource<Activity>;
  public deviceType: string;
  public filterForm: FormGroup;
  public hasImpersonationId: boolean;
  public hasPermissionToCreateActivity: boolean;
  public hasPermissionToDeleteActivity: boolean;
  public holdingOptions: { symbol: string; name: string }[] = [];
  public pageIndex = 0;
  public pageSize = 20;
  public routeQueryParams: Subscription;
  public sortColumn = 'date';
  public sortDirection: SortDirection = 'desc';
  public totalItems: number | undefined;
  public user: User;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef,
    private deviceDetectorService: DeviceDetectorService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private icsService: IcsService,
    private impersonationStorageService: ImpersonationStorageService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    this.routeQueryParams = route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params['createDialog']) {
          if (params['activityId']) {
            this.dataService
              .fetchActivity(params['activityId'])
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((activity) => {
                this.openCreateActivityDialog(activity);
              });
          } else {
            this.openCreateActivityDialog();
          }
        } else if (params['editDialog']) {
          if (params['activityId']) {
            this.dataService
              .fetchActivity(params['activityId'])
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((activity) => {
                this.openUpdateActivityDialog(activity);
              });
          } else {
            this.router.navigate(['.'], { relativeTo: this.route });
          }
        }
      });
  }

  public ngOnInit() {
    this.deviceType = this.deviceDetectorService.getDeviceInfo().deviceType;

    this.filterForm = this.fb.group({
      symbols: [[]],
      type: [null],
      startDate: [null],
      endDate: [null],
      accountId: [null]
    });

    for (const type of Object.keys(ActivityType) as ActivityType[]) {
      this.activityTypeOptions.push({ key: type, label: translate(type) });
    }
    this.activityTypeOptions.sort((a, b) => a.label.localeCompare(b.label));

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
      });

    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.updateUser(state.user);

          this.accountOptions = (this.user.accounts ?? []).map((a) => ({
            id: a.id,
            name: a.name
          }));

          this.dataService
            .fetchPortfolioHoldings()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((response) => {
              this.holdingOptions = (response.holdings ?? [])
                .map((h) => ({
                  symbol: h.assetProfile.symbol,
                  name: h.assetProfile.name ?? h.assetProfile.symbol
                }))
                .sort((a, b) => a.symbol.localeCompare(b.symbol));
              this.changeDetectorRef.markForCheck();
            });

          this.fetchActivities();

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public fetchActivities() {
    // Reset dataSource and totalItems to show loading state
    this.dataSource = undefined;
    this.totalItems = undefined;

    const dateRange = this.user?.settings?.dateRange;
    const range = this.isCalendarYear(dateRange) ? dateRange : undefined;

    const filterValues = this.filterForm?.value ?? {};
    const selectedSymbols: string[] = filterValues.symbols ?? [];
    const selectedType: string = filterValues.type ?? null;
    const startDate: Date = filterValues.startDate ?? null;
    const endDate: Date = filterValues.endDate ?? null;
    const selectedAccountId: string = filterValues.accountId ?? null;

    const extraFilters = this.userService.getFilters();
    if (selectedAccountId) {
      extraFilters.push({ id: selectedAccountId, type: 'ACCOUNT' });
    }

    this.dataService
      .fetchActivities({
        range,
        activityTypes:
          selectedType
            ? [selectedType]
            : this.activityTypesFilter.length
              ? this.activityTypesFilter
              : undefined,
        endDate: endDate ?? undefined,
        filters: extraFilters,
        skip: this.pageIndex * this.pageSize,
        sortColumn: this.sortColumn,
        sortDirection: this.sortDirection,
        startDate: startDate ?? undefined,
        symbols: selectedSymbols.length ? selectedSymbols : undefined,
        take: this.pageSize
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ activities, count }) => {
        this.dataSource = new MatTableDataSource(activities);
        this.totalItems = count;

        if (
          this.hasPermissionToCreateActivity &&
          this.user?.activitiesCount === 0
        ) {
          this.router.navigate([], { queryParams: { createDialog: true } });
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  public onChangePage(page: PageEvent) {
    this.pageIndex = page.pageIndex;

    this.fetchActivities();
  }

  public onClickActivity({ dataSource, symbol }: AssetProfileIdentifier) {
    this.router.navigate([], {
      queryParams: {
        dataSource,
        symbol,
        holdingDetailDialog: true
      }
    });
  }

  public onCloneActivity(aActivity: Activity) {
    this.openCreateActivityDialog(aActivity);
  }

  public onDeleteActivities() {
    this.dataService
      .deleteActivities({
        filters: this.userService.getFilters()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  public onDeleteActivity(aId: string) {
    this.dataService
      .deleteActivity(aId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  public onExport(activityIds?: string[]) {
    let fetchExportParams: any = { activityIds };

    if (!activityIds) {
      fetchExportParams = {
        activityTypes: this.activityTypesFilter.length
          ? this.activityTypesFilter
          : undefined,
        filters: this.userService.getFilters()
      };
    }

    this.dataService
      .fetchExport(fetchExportParams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        for (const activity of data.activities) {
          delete activity.id;
        }

        downloadAsFile({
          content: data,
          fileName: `ghostfolio-export-${format(
            parseISO(data.meta.date),
            'yyyyMMddHHmm'
          )}.json`,
          format: 'json'
        });
      });
  }

  public onExportDrafts(activityIds?: string[]) {
    this.dataService
      .fetchExport({ activityIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        downloadAsFile({
          content: this.icsService.transformActivitiesToIcsContent(
            data.activities
          ),
          contentType: 'text/calendar',
          fileName: `ghostfolio-draft${
            data.activities.length > 1 ? 's' : ''
          }-${format(parseISO(data.meta.date), 'yyyyMMddHHmmss')}.ics`,
          format: 'string'
        });
      });
  }

  public onImport() {
    const dialogRef = this.dialog.open<
      GfImportActivitiesDialogComponent,
      ImportActivitiesDialogParams
    >(GfImportActivitiesDialogComponent, {
      data: {
        deviceType: this.deviceType,
        user: this.user
      },
      height: this.deviceType === 'mobile' ? '98vh' : undefined,
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  public onImportDividends() {
    const dialogRef = this.dialog.open<
      GfImportActivitiesDialogComponent,
      ImportActivitiesDialogParams
    >(GfImportActivitiesDialogComponent, {
      data: {
        activityTypes: ['DIVIDEND'],
        deviceType: this.deviceType,
        user: this.user
      },
      height: this.deviceType === 'mobile' ? '98vh' : undefined,
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  public onSortChanged({ active, direction }: Sort) {
    this.pageIndex = 0;
    this.sortColumn = active;
    this.sortDirection = direction;

    this.fetchActivities();
  }

  public onFilterChanged() {
    this.pageIndex = 0;
    this.fetchActivities();
  }

  public onClearFilters() {
    this.filterForm.reset({ symbols: [], type: null, startDate: null, endDate: null, accountId: null });
    this.pageIndex = 0;
    this.fetchActivities();
  }

  public onTypesFilterChanged(aTypes: string[]) {
    this.activityTypesFilter = aTypes;
    this.pageIndex = 0;

    this.fetchActivities();
  }

  public onUpdateActivity(aActivity: Activity) {
    this.router.navigate([], {
      queryParams: { activityId: aActivity.id, editDialog: true }
    });
  }

  public openUpdateActivityDialog(aActivity: Activity) {
    const dialogRef = this.dialog.open<
      GfCreateOrUpdateActivityDialogComponent,
      CreateOrUpdateActivityDialogParams
    >(GfCreateOrUpdateActivityDialogComponent, {
      data: {
        activity: aActivity,
        accounts: this.user?.accounts,
        user: this.user
      },
      height: this.deviceType === 'mobile' ? '98vh' : '80vh',
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((activity: UpdateOrderDto) => {
        if (activity) {
          this.dataService
            .putActivity(activity)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.fetchActivities();

                this.changeDetectorRef.markForCheck();
              }
            });
        }

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }

  private isCalendarYear(dateRange: DateRange) {
    if (!dateRange) {
      return false;
    }

    return /^\d{4}$/.test(dateRange);
  }

  private openCreateActivityDialog(aActivity?: Activity) {
    this.userService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.updateUser(user);

        const dialogRef = this.dialog.open<
          GfCreateOrUpdateActivityDialogComponent,
          CreateOrUpdateActivityDialogParams
        >(GfCreateOrUpdateActivityDialogComponent, {
          data: {
            accounts: this.user?.accounts,
            activity: {
              ...aActivity,
              accountId: aActivity?.accountId,
              date: new Date(),
              id: null,
              fee: 0,
              type: aActivity?.type ?? 'BUY',
              unitPrice: null
            },
            user: this.user
          },
          height: this.deviceType === 'mobile' ? '98vh' : '80vh',
          width: this.deviceType === 'mobile' ? '100vw' : '50rem'
        });

        dialogRef
          .afterClosed()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((transaction: CreateOrderDto | null) => {
            if (transaction) {
              this.dataService.postActivity(transaction).subscribe({
                next: () => {
                  this.userService
                    .get(true)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe();

                  this.fetchActivities();

                  this.changeDetectorRef.markForCheck();
                }
              });
            }

            this.router.navigate(['.'], { relativeTo: this.route });
          });
      });
  }

  private updateUser(aUser: User) {
    this.user = aUser;

    this.hasPermissionToCreateActivity =
      !this.hasImpersonationId &&
      hasPermission(this.user.permissions, permissions.createActivity);
    this.hasPermissionToDeleteActivity =
      !this.hasImpersonationId &&
      hasPermission(this.user.permissions, permissions.deleteActivity);
  }
}
