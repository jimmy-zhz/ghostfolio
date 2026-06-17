import { AuthGuard } from '@ghostfolio/client/core/auth.guard';
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
        redirectTo: internalRoutes.portfolio.subRoutes.investmentPlan.path
      },
      {
        path: internalRoutes.portfolio.subRoutes.analysis.path,
        loadChildren: () =>
          import('./analysis/analysis-page.routes').then((m) => m.routes)
      },
      {
        path: internalRoutes.portfolio.subRoutes.activities.path,
        loadChildren: () =>
          import('./activities/activities-page.routes').then((m) => m.routes)
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
        path: internalRoutes.portfolio.subRoutes.investmentPlan.path,
        loadChildren: () =>
          import('./investment-plan/investment-plan-page.routes').then((m) => m.routes)
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
