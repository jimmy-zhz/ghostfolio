import { PortfolioChangedEvent } from '@ghostfolio/api/events/portfolio-changed.event';
import type { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';

import { ActivityTagsService } from './activity-tags.service';

describe('ActivityTagsService.updateTags', () => {
  function setup({
    ownActivities = 2,
    ownTag = true
  }: { ownActivities?: number; ownTag?: boolean } = {}) {
    const prisma = {
      $transaction: jest.fn((operations: Promise<unknown>[]) => {
        return Promise.all(operations);
      }),
      order: {
        count: jest.fn().mockResolvedValue(ownActivities),
        update: jest.fn().mockResolvedValue({})
      },
      tag: {
        create: jest.fn().mockResolvedValue({ id: 'tag-new', name: 'New' }),
        findFirst: jest.fn().mockResolvedValue(ownTag ? { id: 'tag-1' } : null)
      }
    };
    const eventEmitter = { emit: jest.fn() };
    const service = new ActivityTagsService(
      eventEmitter as unknown as EventEmitter2,
      prisma as unknown as PrismaService
    );

    return { eventEmitter, prisma, service };
  }

  it('adds the tag to every activity of the user', async () => {
    const { eventEmitter, prisma, service } = setup();

    await expect(
      service.updateTags({
        action: 'ADD',
        activityIds: ['a1', 'a2', 'a1'],
        tagId: 'tag-1',
        userId: 'user-1'
      })
    ).resolves.toEqual({ action: 'ADD', count: 2, tagId: 'tag-1' });

    expect(prisma.tag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tag-1', userId: 'user-1' } })
    );
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] }, userId: 'user-1' }
    });
    expect(prisma.order.update).toHaveBeenCalledTimes(2);
    expect(prisma.order.update).toHaveBeenCalledWith({
      data: { tags: { connect: { id: 'tag-1' } } },
      select: { id: true },
      where: { id: 'a1', userId: 'user-1' }
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PortfolioChangedEvent.getName(),
      expect.any(PortfolioChangedEvent)
    );
  });

  it('only changes the tags', async () => {
    const { prisma, service } = setup();

    await service.updateTags({
      action: 'REMOVE',
      activityIds: ['a1', 'a2'],
      tagId: 'tag-1',
      userId: 'user-1'
    });

    for (const [{ data }] of prisma.order.update.mock.calls) {
      expect(data).toEqual({ tags: { disconnect: { id: 'tag-1' } } });
    }
  });

  it('rejects a system tag or the tag of someone else', async () => {
    const { prisma, service } = setup({ ownTag: false });

    await expect(
      service.updateTags({
        action: 'ADD',
        activityIds: ['a1'],
        tagId: 'EXCLUDE_FROM_ANALYSIS',
        userId: 'user-1'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects the whole batch when one activity is not of the user', async () => {
    const { eventEmitter, prisma, service } = setup({ ownActivities: 1 });

    await expect(
      service.updateTags({
        action: 'ADD',
        activityIds: ['a1', 'foreign'],
        tagId: 'tag-1',
        userId: 'user-1'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'SET', activityIds: ['a1'], tagId: 'tag-1' },
    { action: 'ADD', activityIds: [], tagId: 'tag-1' },
    { action: 'ADD', activityIds: 'a1', tagId: 'tag-1' },
    { action: 'ADD', activityIds: [''], tagId: 'tag-1' },
    { action: 'ADD', activityIds: ['a1'], tagId: '' },
    {
      action: 'ADD',
      activityIds: Array.from({ length: 101 }, (_, index) => `a${index}`),
      tagId: 'tag-1'
    }
  ])('rejects an invalid request ($action)', async (request) => {
    const { prisma, service } = setup();

    await expect(
      service.updateTags({ ...request, userId: 'user-1' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  describe('createOwnTag', () => {
    it('creates a tag of the user', async () => {
      const { prisma, service } = setup({ ownTag: false });

      await expect(
        service.createOwnTag({ name: ' Source · Mother ', userId: 'user-1' })
      ).resolves.toEqual({ id: 'tag-new', name: 'New' });
      expect(prisma.tag.create).toHaveBeenCalledWith({
        data: { name: 'Source · Mother', user: { connect: { id: 'user-1' } } },
        select: { id: true, name: true }
      });
    });

    it('returns the existing tag of the same name', async () => {
      const { prisma, service } = setup();

      await expect(
        service.createOwnTag({ name: 'Source · Mother', userId: 'user-1' })
      ).resolves.toEqual({ id: 'tag-1' });
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });

    it.each(['', ' ', 'x'.repeat(101), 42])(
      'rejects the name %p',
      async (name) => {
        const { service } = setup();

        await expect(
          service.createOwnTag({ name, userId: 'user-1' })
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    );
  });
});
