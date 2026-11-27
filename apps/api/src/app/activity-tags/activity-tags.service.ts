import { PortfolioChangedEvent } from '@ghostfolio/api/events/portfolio-changed.event';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export const ACTIVITY_TAGS_MAX_ACTIVITIES = 100;

export type ActivityTagsAction = 'ADD' | 'REMOVE';

/**
 * Adds or removes one tag on a batch of activities, e.g. the tag of a fund
 * source. Only the tags change, never the values of an activity.
 */
@Injectable()
export class ActivityTagsService {
  public constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prismaService: PrismaService
  ) {}

  public async updateTags({
    action,
    activityIds,
    tagId,
    userId
  }: {
    action: unknown;
    activityIds: unknown;
    tagId: unknown;
    userId: string;
  }) {
    if (action !== 'ADD' && action !== 'REMOVE') {
      throw new BadRequestException('action must be ADD or REMOVE');
    }

    if (
      !Array.isArray(activityIds) ||
      activityIds.length === 0 ||
      !activityIds.every((id) => {
        return typeof id === 'string' && id.length > 0;
      })
    ) {
      throw new BadRequestException(
        'activityIds must be a non-empty list of activity ids'
      );
    }

    const uniqueActivityIds = [...new Set<string>(activityIds)];

    if (uniqueActivityIds.length > ACTIVITY_TAGS_MAX_ACTIVITIES) {
      throw new BadRequestException(
        `At most ${ACTIVITY_TAGS_MAX_ACTIVITIES} activities per request`
      );
    }

    if (typeof tagId !== 'string' || tagId.length === 0) {
      throw new BadRequestException('tagId is required');
    }

    // System tags (Draft, Emergency Fund, Exclude from Analysis) have no user
    // and change how an activity is treated, hence only own tags
    const tag = await this.prismaService.tag.findFirst({
      select: { id: true },
      where: { id: tagId, userId }
    });

    if (!tag) {
      throw new BadRequestException('tagId must be one of your own tags');
    }

    // All or nothing: one activity of someone else rejects the whole batch
    const count = await this.prismaService.order.count({
      where: { id: { in: uniqueActivityIds }, userId }
    });

    if (count !== uniqueActivityIds.length) {
      throw new NotFoundException('Activity not found');
    }

    await this.prismaService.$transaction(
      uniqueActivityIds.map((id) => {
        return this.prismaService.order.update({
          data: {
            tags:
              action === 'ADD'
                ? { connect: { id: tagId } }
                : { disconnect: { id: tagId } }
          },
          select: { id: true },
          where: { id, userId }
        });
      })
    );

    this.eventEmitter.emit(
      PortfolioChangedEvent.getName(),
      new PortfolioChangedEvent({ userId })
    );

    return { action, count: uniqueActivityIds.length, tagId };
  }
}
