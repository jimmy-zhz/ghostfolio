import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import {
  GfPageTabsComponent,
  TabConfiguration
} from '@ghostfolio/ui/page-tabs';

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addIcons } from 'ionicons';
import {
  albumsOutline,
  analyticsOutline,
  bookmarkOutline,
  calendarOutline,
  swapVerticalOutline
} from 'ionicons/icons';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [GfPageTabsComponent],
  selector: 'gf-home-page',
  styleUrls: ['./home-page.scss'],
  templateUrl: './home-page.html'
})
export class GfHomePageComponent implements OnInit {
  public hasImpersonationId: boolean;
  public tabs: TabConfiguration[] = [];
  public user: User;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private destroyRef: DestroyRef,
    private impersonationStorageService: ImpersonationStorageService,
    private userService: UserService
  ) {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.tabs = [
            {
              iconName: 'analytics-outline',
              label: internalRoutes.home.title,
              routerLink: internalRoutes.home.routerLink
            },
            {
              iconName: 'albums-outline',
              label: internalRoutes.home.subRoutes.holdings.title,
              routerLink: internalRoutes.home.subRoutes.holdings.routerLink
            },
            // Fork: activities and the investment plan instead of summary and
            // markets, which moved to the portfolio
            {
              iconName: 'swap-vertical-outline',
              label: internalRoutes.portfolio.subRoutes.activities.title,
              routerLink:
                internalRoutes.portfolio.subRoutes.activities.routerLink
            },
            {
              iconName: 'calendar-outline',
              label: internalRoutes.portfolio.subRoutes.investmentPlan.title,
              routerLink:
                internalRoutes.portfolio.subRoutes.investmentPlan.routerLink
            },
            {
              iconName: 'bookmark-outline',
              label: internalRoutes.home.subRoutes.watchlist.title,
              routerLink: internalRoutes.home.subRoutes.watchlist.routerLink
            }
          ];
        }

        this.changeDetectorRef.markForCheck();
      });

    addIcons({
      albumsOutline,
      analyticsOutline,
      bookmarkOutline,
      calendarOutline,
      swapVerticalOutline
    });
  }

  public ngOnInit() {
    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
      });
  }
}
