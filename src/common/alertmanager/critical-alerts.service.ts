import { LOGGER_PROVIDER, LoggerService } from '@lido-nestjs/logger';
import { Inject, Injectable } from '@nestjs/common';
import got from 'got';

import { ConfigService } from 'common/config';
import { PrometheusService } from 'common/prometheus';
import { ClickhouseService } from 'storage';

import { AlertRequestBody, PreparedToSendAlert } from './alerts/BasicAlert';
import { CriticalMissedAttestations } from './alerts/CriticalMissedAttestations';
import { CriticalMissedProposes } from './alerts/CriticalMissedProposes';
import { CriticalNegativeDelta } from './alerts/CriticalNegativeDelta';
import { CriticalSlashing } from './alerts/CriticalSlashing';

interface SentAlerts {
  [alertname: string]: PreparedToSendAlert;
}

export const sentAlerts: SentAlerts = {};

@Injectable()
export class CriticalAlertsService {
  private readonly baseUrl;

  public constructor(
    @Inject(LOGGER_PROVIDER) protected readonly logger: LoggerService,
    protected readonly config: ConfigService,
    protected readonly storage: ClickhouseService,
    protected readonly prometheus: PrometheusService,
  ) {
    this.baseUrl = this.config.get('CRITICAL_ALERTS_ALERTMANAGER_URL') ?? '';
  }

  public async send(epoch: bigint) {
    if (this.prometheus.getSlotTimeDiffWithNow() > 3600000) {
      this.logger.warn(`Data actuality greater than 1 hour. Critical alerts are suppressed`);
      return;
    }
    if (!this.baseUrl) {
      this.logger.warn(`Env var 'CRITICAL_ALERTS_ALERTMANAGER_URL' is not set. Unable to send critical alerts`);
      return;
    }
    try {
      let count = 0;
      for (const alert of this.alerts) {
        const toSend = await alert.toSend(epoch);
        if (!toSend) continue;
        count++;
        await this.fire(toSend.body).then(() => (sentAlerts[alert.alertname] = toSend));
      }
      this.logger.log(`Sent critical alerts: ${count}`);
    } catch (e) {
      this.logger.error(`Error when trying to processing critical alerts`);
      this.logger.error(e as Error);
    }
  }

  private get alerts() {
    return [
      new CriticalNegativeDelta(this.config, this.storage),
      new CriticalMissedProposes(this.config, this.storage),
      new CriticalMissedAttestations(this.config, this.storage),
      new CriticalSlashing(this.config, this.storage),
    ];
  }

  private async fire(alert: AlertRequestBody) {
    got
      .post(`${this.baseUrl}/api/v1/alerts`, { json: [alert] })
      .then((r) => r.statusCode)
      .catch((error) => {
        this.logger.error(`Error when trying to send alert`);
        this.logger.error(error as Error);
      });
  }
}
