import { GfHomeSummaryComponent } from '@ghostfolio/client/components/home-summary/home-summary.component';
import { GfMarketsComponent } from '@ghostfolio/client/components/markets/markets.component';
import { AuthGuard } from '@ghostfolio/client/core/auth.guard';
import { redirectKeepingQueryParams } from '@ghostfolio/client/util/route.util';
import { internalRoutes } from '@ghostfolio/common/routes/routes';

import { Routes } from '@angular/router';

import { PortfolioPageComponent } from './portfolio-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: internalRoutes.portfolio.subRoutes.analysis.path
      },
      {
        path: internalRoutes.portfolio.subRoutes.analysis.path,
        loadChildren: () =>
          import('./analysis/analysis-page.routes').then((m) => m.routes)
      },
      // Fork: activities and the investment plan moved to home (see
      // home-page.routes.ts), the old addresses keep working
      {
        path: 'activities',
        pathMatch: 'full',
        redirectTo: redirectKeepingQueryParams(() => ['/home', 'activities'])
      },
      {
        path: 'activities/create',
        redirectTo: redirectKeepingQueryParams(() => [
          '/home',
          'activities',
          'create'
        ])
      },
      {
        path: 'activities/:activityId/clone',
        redirectTo: redirectKeepingQueryParams(({ activityId }) => [
          '/home',
          'activities',
          activityId,
          'clone'
        ])
      },
      {
        path: 'activities/:activityId/update',
        redirectTo: redirectKeepingQueryParams(({ activityId }) => [
          '/home',
          'activities',
          activityId,
          'update'
        ])
      },
      {
        path: internalRoutes.portfolio.subRoutes.allocations.path,
        loadChildren: () =>
          import('./allocations/allocations-page.routes').then((m) => m.routes)
      },
      {
        path: internalRoutes.portfolio.subRoutes.fire.path,
        loadChildren: () =>
          import('./fire/fire-page.routes').then((m) => m.routes)
      },
      {
        path: 'investment-plan',
        pathMatch: 'full',
        redirectTo: redirectKeepingQueryParams(() => [
          '/home',
          'investment-plan'
        ])
      },
      {
        path: internalRoutes.home.subRoutes.markets.path,
        component: GfMarketsComponent,
        title: internalRoutes.home.subRoutes.markets.title
      },
      {
        path: internalRoutes.home.subRoutes.summary.path,
        component: GfHomeSummaryComponent,
        title: internalRoutes.home.subRoutes.summary.title
      },
      {
        path: internalRoutes.portfolio.subRoutes.xRay.path,
        loadChildren: () =>
          import('./x-ray/x-ray-page.routes').then((m) => m.routes)
      }
    ],
    component: PortfolioPageComponent,
    path: '',
    title: internalRoutes.portfolio.title
  }
];
