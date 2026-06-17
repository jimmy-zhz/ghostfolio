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
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule
  ],
  selector: 'gf-admin-model-provider',
  templateUrl: './admin-model-provider.component.html'
})
export class GfAdminModelProviderComponent implements OnInit {
  public aiConfig: { apiKey: string; hasApiKey: boolean; model: string } = {
    apiKey: '',
    hasApiKey: false,
    model: ''
  };
  public configuredPlaceholder = $localize`Configured (enter new value to replace)`;
  public emptyPlaceholder = $localize`Enter OpenRouter API Key`;
  public openRouterApiKey = '';
  public openRouterModel = '';

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService,
    private readonly destroyRef: DestroyRef
  ) {}

  public ngOnInit() {
    this.loadAiConfig();
  }

  public onSaveAiConfig() {
    this.dataService
      .putAiConfig({
        apiKey: this.openRouterApiKey || undefined,
        model: this.openRouterModel
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadAiConfig();
      });
  }

  private loadAiConfig() {
    this.dataService
      .fetchAiConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((config) => {
        this.aiConfig = config;
        this.openRouterModel = config.model;
        this.openRouterApiKey = '';
        this.changeDetectorRef.markForCheck();
      });
  }
}
