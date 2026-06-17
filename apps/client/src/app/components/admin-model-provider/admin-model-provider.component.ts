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
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  selector: 'gf-admin-model-provider',
  styleUrls: ['./admin-model-provider.component.scss'],
  templateUrl: './admin-model-provider.component.html'
})
export class GfAdminModelProviderComponent implements OnInit {
  public aiConfig: {
    apiKey: string;
    apiUrl: string;
    hasApiKey: boolean;
    model: string;
    responseLanguage: string;
    testedModels: string[];
  } = {
    apiKey: '',
    apiUrl: '',
    hasApiKey: false,
    model: '',
    responseLanguage: 'auto',
    testedModels: []
  };

  public readonly languageOptions = [
    { label: 'Auto (same as prompt)', value: 'auto' },
    { label: '中文', value: 'zh' },
    { label: 'English', value: 'en' },
    { label: '日本語', value: 'ja' },
    { label: '한국어', value: 'ko' },
    { label: 'Français', value: 'fr' },
    { label: 'Deutsch', value: 'de' }
  ];

  public apiKeyInput = '';
  public apiUrlInput = '';
  public modelControl = new FormControl('');
  public responseLanguage = 'auto';
  public testStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  public testMessage = '';

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService,
    private readonly destroyRef: DestroyRef
  ) {}

  public ngOnInit() {
    this.loadAiConfig();
  }

  public get filteredModels(): string[] {
    const input = (this.modelControl.value ?? '').toLowerCase();
    return input
      ? this.aiConfig.testedModels.filter((m) =>
          m.toLowerCase().includes(input)
        )
      : this.aiConfig.testedModels;
  }

  public onTest() {
    const model = this.modelControl.value?.trim();
    if (!model) return;

    this.testStatus = 'testing';
    this.testMessage = '';
    this.changeDetectorRef.markForCheck();

    this.dataService
      .testAiConnection({
        apiKey: this.apiKeyInput || undefined,
        apiUrl: this.apiUrlInput || undefined,
        model,
        responseLanguage: this.responseLanguage
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.testStatus = 'success';
            this.testMessage = res.message ?? 'OK';
            // Update testedModels locally — don't reload to preserve unsaved inputs
            if (!this.aiConfig.testedModels.includes(model)) {
              this.aiConfig = {
                ...this.aiConfig,
                testedModels: [model, ...this.aiConfig.testedModels]
              };
            }
          } else {
            this.testStatus = 'error';
            this.testMessage = res.error ?? 'Unknown error';
          }
          this.changeDetectorRef.markForCheck();
        },
        error: (err) => {
          this.testStatus = 'error';
          this.testMessage = err?.error?.message ?? err?.message ?? 'Request failed';
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public onSave() {
    const model = this.modelControl.value ?? '';
    this.dataService
      .putAiConfig({
        apiKey: this.apiKeyInput || undefined,
        apiUrl: this.apiUrlInput,
        model,
        responseLanguage: this.responseLanguage
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadAiConfig();
      });
  }

  public resetTestStatus() {
    this.testStatus = 'idle';
    this.testMessage = '';
  }

  private loadAiConfig() {
    this.dataService
      .fetchAiConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((config) => {
        this.aiConfig = config;
        this.apiUrlInput = config.apiUrl ?? '';
        this.apiKeyInput = '';
        this.responseLanguage = config.responseLanguage ?? 'auto';
        if (!this.modelControl.value) {
          this.modelControl.setValue(config.model);
        }
        this.changeDetectorRef.markForCheck();
      });
  }
}
