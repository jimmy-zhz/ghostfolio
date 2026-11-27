import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes as homeRoutes } from '../home/home-page.routes';
import { routes as portfolioRoutes } from './portfolio-page.routes';

// The pages themselves are not under test, only where an address leads
jest.mock('@ghostfolio/client/core/auth.guard', () => ({
  AuthGuard: () => true
}));

function mockStubComponent(selector: string) {
  const { Component: component } = jest.requireActual('@angular/core');

  return component({ selector, template: '' })(class {});
}

jest.mock('./portfolio-page.component', () => ({
  PortfolioPageComponent: mockStubComponent('gf-portfolio-page')
}));
jest.mock('../home/home-page.component', () => ({
  GfHomePageComponent: mockStubComponent('gf-home-page')
}));
jest.mock(
  '@ghostfolio/client/components/home-holdings/home-holdings.component',
  () => ({ GfHomeHoldingsComponent: mockStubComponent('gf-home-holdings') })
);
jest.mock(
  '@ghostfolio/client/components/home-overview/home-overview.component',
  () => ({ GfHomeOverviewComponent: mockStubComponent('gf-home-overview') })
);
jest.mock(
  '@ghostfolio/client/components/home-summary/home-summary.component',
  () => ({ GfHomeSummaryComponent: mockStubComponent('gf-home-summary') })
);
jest.mock(
  '@ghostfolio/client/components/home-watchlist/home-watchlist.component',
  () => ({ GfHomeWatchlistComponent: mockStubComponent('gf-home-watchlist') })
);
jest.mock(
  '@ghostfolio/client/components/home-watchlist/watchlist-dialog-host/watchlist-dialog-host.component',
  () => ({
    GfWatchlistDialogHostComponent: mockStubComponent(
      'gf-watchlist-dialog-host'
    )
  })
);
jest.mock('@ghostfolio/client/components/markets/markets.component', () => ({
  GfMarketsComponent: mockStubComponent('gf-markets')
}));
jest.mock('./activities/activities-page.routes', () => ({
  routes: [{ component: mockStubComponent('gf-activities-page'), path: '**' }]
}));
jest.mock('./analysis/analysis-page.routes', () => ({
  routes: [{ component: mockStubComponent('gf-analysis-page'), path: '' }]
}));
jest.mock('./investment-plan/investment-plan-page.routes', () => ({
  routes: [
    { component: mockStubComponent('gf-investment-plan-page'), path: '' }
  ]
}));

@Component({ selector: 'gf-root-stub', template: '' })
class RootStubComponent {}

describe('the moved pages', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { children: homeRoutes, path: 'home' },
          { children: portfolioRoutes, path: 'portfolio' },
          { component: RootStubComponent, path: '**' }
        ])
      ]
    });

    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it.each([
    ['/portfolio', '/portfolio/analysis'],
    ['/portfolio/activities', '/home/activities'],
    ['/portfolio/activities/create', '/home/activities/create'],
    ['/portfolio/activities/abc/clone', '/home/activities/abc/clone'],
    ['/portfolio/activities/abc/update', '/home/activities/abc/update'],
    ['/portfolio/investment-plan', '/home/investment-plan'],
    ['/home/markets', '/portfolio/markets'],
    ['/home/summary', '/portfolio/summary']
  ])('leads %s to %s', async (from, to) => {
    await harness.navigateByUrl(from);

    expect(router.url).toBe(to);
  });

  it('keeps the query parameters, e.g. of the holding detail dialog', async () => {
    await harness.navigateByUrl(
      '/portfolio/activities?holdingDetailDialog=true&symbol=XEF.TO'
    );

    expect(router.url).toBe(
      '/home/activities?holdingDetailDialog=true&symbol=XEF.TO'
    );
  });
});
