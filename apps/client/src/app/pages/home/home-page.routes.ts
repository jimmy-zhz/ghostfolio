import { GfHomeHoldingsComponent } from '@ghostfolio/client/components/home-holdings/home-holdings.component';
import { GfHomeOverviewComponent } from '@ghostfolio/client/components/home-overview/home-overview.component';
import { GfHomeWatchlistComponent } from '@ghostfolio/client/components/home-watchlist/home-watchlist.component';
import { GfWatchlistDialogHostComponent } from '@ghostfolio/client/components/home-watchlist/watchlist-dialog-host/watchlist-dialog-host.component';
import { AuthGuard } from '@ghostfolio/client/core/auth.guard';
import { redirectKeepingQueryParams } from '@ghostfolio/client/util/route.util';
import { internalRoutes } from '@ghostfolio/common/routes/routes';

import { Routes } from '@angular/router';

import { GfHomePageComponent } from './home-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        component: GfHomeOverviewComponent
      },
      {
        path: internalRoutes.home.subRoutes.holdings.path,
        component: GfHomeHoldingsComponent,
        title: internalRoutes.home.subRoutes.holdings.title
      },
      // Fork: activities and the investment plan moved here from the
      // portfolio, summary and markets moved there
      {
        path: internalRoutes.portfolio.subRoutes.activities.path,
        loadChildren: () =>
          import('../portfolio/activities/activities-page.routes').then(
            (m) => m.routes
          )
      },
      {
        path: internalRoutes.portfolio.subRoutes.investmentPlan.path,
        loadChildren: () =>
          import('../portfolio/investment-plan/investment-plan-page.routes').then(
            (m) => m.routes
          )
      },
      {
        path: internalRoutes.home.subRoutes.markets.path,
        pathMatch: 'full',
        redirectTo: redirectKeepingQueryParams(() => ['/portfolio', 'markets'])
      },
      {
        path: internalRoutes.home.subRoutes.summary.path,
        pathMatch: 'full',
        redirectTo: redirectKeepingQueryParams(() => ['/portfolio', 'summary'])
      },
      {
        children: [
          {
            component: GfWatchlistDialogHostComponent,
            path: internalRoutes.home.subRoutes.watchlist.subRoutes.create.path,
            title:
              internalRoutes.home.subRoutes.watchlist.subRoutes.create.title
          }
        ],
        path: internalRoutes.home.subRoutes.watchlist.path,
        component: GfHomeWatchlistComponent,
        title: internalRoutes.home.subRoutes.watchlist.title
      }
    ],
    component: GfHomePageComponent,
    path: '',
    title: internalRoutes.home.title
  }
];
