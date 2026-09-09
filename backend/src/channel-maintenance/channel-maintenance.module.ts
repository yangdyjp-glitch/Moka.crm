import { Module } from '@nestjs/common';
import { ChannelMaintenanceController } from './channel-maintenance.controller';
import { ChannelMaintenanceService } from './channel-maintenance.service';

@Module({
  controllers: [ChannelMaintenanceController],
  providers: [ChannelMaintenanceService],
})
export class ChannelMaintenanceModule {}
