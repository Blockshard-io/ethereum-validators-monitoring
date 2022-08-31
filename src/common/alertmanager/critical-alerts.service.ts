import got from 'got';
import { AlertRequestBody, PreparedToSendAlert } from './alerts/BasicAlert';
import { CriticalNegativeDelta } from './alerts/CriticalNegativeDelta';
import { CriticalMissedProposes } from './alerts/CriticalMissedProposes';
import { CriticalMissedAttestations } from './alerts/CriticalMissedAttestations';
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_PROVIDER, LoggerService } from '@lido-nestjs/logger';
import { ConfigService } from '../config';
import { ClickhouseStorageService } from '../../storage/clickhouse-storage.service';
import { PrometheusService } from '../prometheus';

type SentAlerts = { [alertname: string]: PreparedToSendAlert };

export const sentAlerts: SentAlerts = {};

@Injectable()
export class CriticalAlertsService {
  private readonly baseUrl;

  public constructor(
    @Inject(LOGGER_PROVIDER) protected readonly logger: LoggerService,
    protected readonly config: ConfigService,
    protected readonly storage: ClickhouseStorageService,
    protected readonly prometheus: PrometheusService,
  ) {
    this.baseUrl = this.config.get('CRITICAL_ALERTS_ALERTMANAGER_URL') ?? '';
  }

  private get alerts() {
    return [
      new CriticalNegativeDelta(this.config, this.storage),
      new CriticalMissedProposes(this.config, this.storage),
      new CriticalMissedAttestations(this.config, this.storage),
    ];
  }

  public async sendCriticalAlerts(bySlot: bigint) {
    if (this.prometheus.getSlotTimeDiffWithNow() > 3600000) {
      this.logger.warn(`Data actuality greater then 1 hour. Сritical alerts are suppresed`);
      return;
    }
    if (!this.baseUrl) {
      this.logger.warn(`Env var 'CRITICAL_ALERTS_ALERTMANAGER_URL' is not set. Unable to send critical alerts`);
      return;
    }
    this.logger.log('Send critical alerts if exist');
    try {
      for (const alert of this.alerts) {
        const toSend = await alert.toSend(bySlot);
        if (toSend) await this.fire(toSend.body).then(() => (sentAlerts[alert.alertname] = toSend));
      }
    } catch (e) {
      this.logger.error(`Error when trying to processing critical alerts`);
      this.logger.error(e as Error);
    }
  }

  async fire(alert: AlertRequestBody) {
    got
      .post(`${this.baseUrl}/api/v1/alerts`, { json: [alert] })
      .then((r) => r.statusCode)
      .catch((error) => {
        this.logger.error(`Error when trying to send alert`);
        this.logger.error(error as Error);
      });
  }
}
