import { UserService } from '@ghostfolio/client/services/user/user.service';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { GfFundGroupsComponent } from './fund-groups.component';
import { FundGroupsResponse } from './fund-groups.util';

// Only used as an injection token; the real service pulls in dialogs which
// import Ionic, and Ionic ships ES modules only, which Jest does not transform
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));
jest.mock('@ionic/angular/standalone', () => ({}));
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));
jest.mock('ionicons/icons', () => ({}));

const figures = {
  accounts: [{ id: 'tfsa', name: 'TFSA', valueInBaseCurrency: 14600 }],
  holdings: [
    {
      name: 'iShares Core S&P 500',
      symbol: 'XUS.TO',
      valueInBaseCurrency: 14600
    }
  ],
  investment: 15000,
  netPerformance: -400,
  netPerformancePercent: -0.027,
  valueInBaseCurrency: 14600
};

const emptyList = { activities: [], count: 0 };

const report: FundGroupsResponse = {
  checks: {
    activitiesWithMultiplePurposes: emptyList,
    activitiesWithMultipleSources: emptyList,
    activitiesWithoutSource: {
      activities: [
        {
          accountName: 'DI',
          date: '2026-10-01T12:00:00.000Z',
          id: 'a1',
          quantity: 3,
          symbol: 'XIC.TO',
          type: 'BUY'
        }
      ],
      count: 1
    },
    partialPurposes: [],
    unassignedValueInBaseCurrency: 0
  },
  purposes: [
    {
      ...figures,
      id: 'car',
      isRemainder: false,
      kind: 'PURPOSE',
      monthsLeft: 7,
      name: 'Car',
      note: null,
      principal: null,
      progress: 0.4,
      sortOrder: 0,
      tag: { id: 'tag-car', name: 'Purpose · Car' },
      tagId: 'tag-car',
      targetAmount: 30000,
      targetDate: '2027-06-30T00:00:00.000Z'
    }
  ],
  sources: [
    {
      ...figures,
      gap: 0,
      id: 'mother',
      isRemainder: false,
      kind: 'SOURCE',
      name: 'Mother',
      note: null,
      principal: 15000,
      sortOrder: 0,
      tag: { id: 'tag-mother', name: 'Source · Mother' },
      tagId: 'tag-mother',
      targetAmount: null,
      targetDate: null
    }
  ],
  total: { investment: 15000, netPerformance: -400, valueInBaseCurrency: 14600 }
};

describe('GfFundGroupsComponent', () => {
  let fixture: ComponentFixture<GfFundGroupsComponent>;
  let dataService: {
    deleteFundGroup: jest.Mock;
    fetchFundGroups: jest.Mock;
    putFundGroup: jest.Mock;
  };

  beforeEach(async () => {
    dataService = {
      deleteFundGroup: jest.fn().mockReturnValue(of({})),
      fetchFundGroups: jest.fn().mockReturnValue(of(report)),
      putFundGroup: jest.fn().mockReturnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [GfFundGroupsComponent, NoopAnimationsModule],
      providers: [
        { provide: DataService, useValue: dataService },
        { provide: NotificationService, useValue: { alert: jest.fn() } },
        {
          provide: UserService,
          useValue: {
            stateChanged: of({
              user: {
                id: 'user-1',
                settings: { baseCurrency: 'CAD', locale: 'en-US' },
                tags: [
                  {
                    id: 'tag-mother',
                    name: 'Source · Mother',
                    userId: 'user-1'
                  },
                  { id: 'DRAFT', name: 'Draft', userId: null }
                ]
              }
            })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfFundGroupsComponent);
    fixture.detectChanges();
  });

  it('shows the sources, the purposes and the checks', () => {
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Mother');
    expect(text).toContain('14,600');
    expect(text).toContain('-2.7%');
    expect(text).toContain('Car');
    expect(text).toContain('40%');
    expect(text).toContain('1 activities have no source');
  });

  it('lists the activities of a check on click', () => {
    const check: HTMLElement = [
      ...fixture.nativeElement.querySelectorAll('.fund-check')
    ].find((element: HTMLElement) => {
      return element.textContent.includes('no source');
    });

    check.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('XIC.TO');
  });

  it('offers only own tags and saves a source', () => {
    const component = fixture.componentInstance as any;

    expect(
      component.ownTags().map(({ id }) => {
        return id;
      })
    ).toEqual(['tag-mother']);

    component.onAdd('SOURCE');
    component.updateForm({
      name: 'Savings',
      principal: 123,
      tagId: 'tag-mother'
    });
    component.updateForm({ isRemainder: true });
    fixture.detectChanges();
    component.onSave();

    expect(dataService.putFundGroup).toHaveBeenCalledWith({
      id: undefined,
      isRemainder: true,
      kind: 'SOURCE',
      name: 'Savings',
      note: null,
      principal: null,
      tagId: 'tag-mother'
    });
    expect(dataService.fetchFundGroups).toHaveBeenCalledTimes(2);
  });
});
