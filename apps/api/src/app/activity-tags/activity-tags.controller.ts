import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import { Body, Controller, Inject, Put, UseGuards } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { ActivityTagsService } from './activity-tags.service';

/**
 * Its own path instead of `PUT /activities/tags`, which `PUT /activities/:id`
 * of the activities controller would match first
 */
@Controller('activity-tags')
export class ActivityTagsController {
  public constructor(
    private readonly activityTagsService: ActivityTagsService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @HasPermission(permissions.updateActivity)
  @Put()
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async updateTags(
    @Body()
    body: {
      action: 'ADD' | 'REMOVE';
      activityIds: string[];
      tagId: string;
    }
  ) {
    return this.activityTagsService.updateTags({
      action: body?.action,
      activityIds: body?.activityIds,
      tagId: body?.tagId,
      userId: this.request.user.id
    });
  }
}
