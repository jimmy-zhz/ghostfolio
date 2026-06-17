import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_AI_API_URL,
  PROPERTY_AI_RESPONSE_LANGUAGE,
  PROPERTY_AI_TESTED_MODELS,
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';
import { AiPromptResponse } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { AiPromptMode, RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  public constructor(
    private readonly aiService: AiService,
    private readonly apiService: ApiService,
    private readonly propertyService: PropertyService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('config')
  @HasPermission(permissions.accessAdminControl)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getAiConfig() {
    const apiKey = await this.propertyService.getByKey<string>(PROPERTY_API_KEY_OPENROUTER);
    const apiUrl = await this.propertyService.getByKey<string>(PROPERTY_AI_API_URL);
    const model = await this.propertyService.getByKey<string>(PROPERTY_OPENROUTER_MODEL);
    const responseLanguage = await this.propertyService.getByKey<string>(PROPERTY_AI_RESPONSE_LANGUAGE);
    const testedModelsRaw = await this.propertyService.getByKey<string>(PROPERTY_AI_TESTED_MODELS);

    let testedModels: string[] = [];
    try {
      testedModels = testedModelsRaw ? JSON.parse(testedModelsRaw) : [];
    } catch {}

    return {
      apiKey: apiKey ? '***' + apiKey.slice(-4) : '',
      apiUrl: apiUrl ?? '',
      hasApiKey: !!apiKey,
      model: model ?? '',
      responseLanguage: responseLanguage ?? 'auto',
      testedModels
    };
  }

  @Put('config')
  @HasPermission(permissions.accessAdminControl)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async updateAiConfig(
    @Body() body: { apiKey?: string; apiUrl?: string; model?: string; responseLanguage?: string }
  ) {
    if (body.apiKey && !body.apiKey.startsWith('***')) {
      await this.propertyService.put({ key: PROPERTY_API_KEY_OPENROUTER, value: body.apiKey });
    }
    if (body.apiUrl !== undefined) {
      await this.propertyService.put({ key: PROPERTY_AI_API_URL, value: body.apiUrl });
    }
    if (body.responseLanguage !== undefined) {
      await this.propertyService.put({ key: PROPERTY_AI_RESPONSE_LANGUAGE, value: body.responseLanguage });
    }
    if (body.model !== undefined) {
      await this.propertyService.put({ key: PROPERTY_OPENROUTER_MODEL, value: body.model });
      if (body.model) {
        const raw = await this.propertyService.getByKey<string>(PROPERTY_AI_TESTED_MODELS);
        let models: string[] = [];
        try { models = raw ? JSON.parse(raw) : []; } catch {}
        if (!models.includes(body.model)) {
          models.unshift(body.model);
          await this.propertyService.put({
            key: PROPERTY_AI_TESTED_MODELS,
            value: JSON.stringify(models.slice(0, 20))
          });
        }
      }
    }
    return { success: true };
  }

  @Post('test')
  @HasPermission(permissions.accessAdminControl)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async testAiConnection(
    @Body() body: { apiKey?: string; apiUrl?: string; model: string; responseLanguage?: string }
  ) {
    const apiKey =
      body.apiKey && !body.apiKey.startsWith('***')
        ? body.apiKey
        : await this.propertyService.getByKey<string>(PROPERTY_API_KEY_OPENROUTER);

    const apiUrl =
      body.apiUrl ??
      (await this.propertyService.getByKey<string>(PROPERTY_AI_API_URL)) ??
      'https://openrouter.ai/api/v1';

    const responseLanguage =
      body.responseLanguage ??
      (await this.propertyService.getByKey<string>(PROPERTY_AI_RESPONSE_LANGUAGE)) ??
      'auto';

    const result = await this.aiService.testConnection({ apiKey, apiUrl, model: body.model, responseLanguage });

    if (result.success) {
      // Add model to tested history
      const raw = await this.propertyService.getByKey<string>(PROPERTY_AI_TESTED_MODELS);
      let models: string[] = [];
      try { models = raw ? JSON.parse(raw) : []; } catch {}
      if (!models.includes(body.model)) {
        models.unshift(body.model);
        await this.propertyService.put({
          key: PROPERTY_AI_TESTED_MODELS,
          value: JSON.stringify(models.slice(0, 20))
        });
      }
    }

    return result;
  }

  @Get('prompt/:mode')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getPrompt(
    @Param('mode') mode: AiPromptMode,
    @Query('accounts') filterByAccounts?: string,
    @Query('assetClasses') filterByAssetClasses?: string,
    @Query('dataSource') filterByDataSource?: string,
    @Query('symbol') filterBySymbol?: string,
    @Query('tags') filterByTags?: string
  ): Promise<AiPromptResponse> {
    const filters = this.apiService.buildFiltersFromQueryParams({
      filterByAccounts,
      filterByAssetClasses,
      filterByDataSource,
      filterBySymbol,
      filterByTags
    });

    const prompt = await this.aiService.getPrompt({
      filters,
      mode,
      impersonationId: undefined,
      languageCode: this.request.user.settings.settings.language,
      userCurrency: this.request.user.settings.settings.baseCurrency,
      userId: this.request.user.id
    });

    return { prompt };
  }
}
