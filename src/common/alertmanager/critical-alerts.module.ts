import { Module } from '@nestjs/common';
import { CriticalAlertsService } from './critical-alerts.service';
import { StorageModule } from '../../storage/storage.module';
import { PrometheusModule } from '../prometheus';

@Module({
  imports: [StorageModule, PrometheusModule],
  providers: [CriticalAlertsService],
  exports: [CriticalAlertsService],
})
export class CriticalAlertsModule {}
