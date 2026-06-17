import { AiModule } from '@ghostfolio/api/app/endpoints/ai/ai.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';

import { Module } from '@nestjs/common';

import { MailService } from './mail.service';

@Module({
  exports: [MailService],
  imports: [AiModule, ConfigurationModule, PropertyModule],
  providers: [MailService]
})
export class MailModule {}
