import { Activity } from '@ghostfolio/common/interfaces';
import { NotificationService } from '@ghostfolio/ui/notifications';

import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTableDataSource } from '@angular/material/table';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { EntityLogoImageSourceService } from '../entity-logo/entity-logo-image-source.service';
import { EntityLogoImageSourceServiceMock } from '../mocks/entity-logo-image-source.service.mock';
import { GfActivitiesTableComponent } from './activities-table.component';

// Ionic ships ES modules only, which Jest does not transform
jest.mock('@ionic/angular/standalone', () => {
  const { Component } = jest.requireActual('@angular/core');

  return {
    IonIcon: Component({
      inputs: ['name'],
      selector: 'ion-icon',
      template: ''
    })(class {})
  };
});
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));
jest.mock('ionicons/icons', () => ({}));

const activity = {
  account: { name: 'Broker' },
  assetProfile: {
    currency: 'USD',
    dataSource: 'YAHOO',
    name: 'Vanguard S&P 500 ETF',
    symbol: 'VOO'
  },
  comment: 'Monthly savings plan',
  currency: 'USD',
  date: new Date('2026-10-01T12:00:00Z'),
  fee: 1,
  id: '00000000-0000-0000-0000-000000000001',
  isDraft: false,
  quantity: 2,
  type: 'BUY',
  unitPrice: 500,
  value: 1000,
  valueInBaseCurrency: 1000
} as unknown as Activity;

describe('GfActivitiesTableComponent', () => {
  let component: GfActivitiesTableComponent;
  let fixture: ComponentFixture<GfActivitiesTableComponent>;

  async function setup({ isSmallScreen }: { isSmallScreen: boolean }) {
    await TestBed.configureTestingModule({
      imports: [GfActivitiesTableComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: BreakpointObserver,
          useValue: {
            observe: () => of({ breakpoints: {}, matches: isSmallScreen })
          }
        },
        {
          provide: EntityLogoImageSourceService,
          useValue: new EntityLogoImageSourceServiceMock()
        },
        { provide: NotificationService, useValue: { confirm: jest.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfActivitiesTableComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput(
      'dataSource',
      new MatTableDataSource<Activity>([activity])
    );
    component.baseCurrency = 'USD';
    component.hasPermissionToCreateActivity = true;
    component.hasPermissionToDeleteActivity = true;
    component.hasPermissionToUpdateActivity = true;
    component.locale = 'en-US';

    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('on a small screen', () => {
    beforeEach(async () => {
      await setup({ isSmallScreen: true });
    });

    it('shows the summary below the row', () => {
      const element: HTMLElement = fixture.nativeElement;

      expect(
        element.querySelector('td.mat-column-mobileSummary')?.textContent
      ).toContain('2 × 500.00 USD · Fee 1.00 · Broker');
    });

    it('expands the details instead of opening the holding', () => {
      const activityClicked = jest.spyOn(component.activityClicked, 'emit');

      component.onClickActivity(activity);
      fixture.detectChanges();

      expect(activityClicked).not.toHaveBeenCalled();
      expect(
        fixture.nativeElement.querySelector('.activity-details')
      ).not.toBeNull();

      component.onClickActivity(activity);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.activity-details')
      ).toBeNull();
    });

    it('opens the holding from the expanded details', () => {
      const activityClicked = jest.spyOn(component.activityClicked, 'emit');

      component.onViewHolding(activity);

      expect(activityClicked).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'VOO'
      });
    });
  });

  describe('on a large screen', () => {
    beforeEach(async () => {
      await setup({ isSmallScreen: false });
    });

    it('opens the holding', () => {
      const activityClicked = jest.spyOn(component.activityClicked, 'emit');

      component.onClickActivity(activity);

      expect(activityClicked).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'VOO'
      });
    });
  });
});
