import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
  RegistrySource,
  RegistrySourceKeysIndexed,
  RegistrySourceKeyWithOperatorName,
  RegistrySourceOperator,
} from '../registry-source.interface';
import { load } from 'js-yaml';
import { LOGGER_PROVIDER } from '@lido-nestjs/logger';
import { ConfigService } from 'common/config';
import { readFile } from 'fs/promises';

interface FileContent {
  operators: {
    name: string;
    keys: string[];
  }[];
}

const isValid = (data) => {
  let valid = false;
  data?.operators?.map((o) => {
    o.name && o.keys?.length ? (valid = true) : (valid = false);
  });
  return valid;
};

@Injectable()
export class FileSourceService implements RegistrySource {
  constructor(@Inject(LOGGER_PROVIDER) protected readonly logger: LoggerService, protected readonly configService: ConfigService) {}

  protected data: FileContent;
  protected lastSuccessDataReadTimestamp: number;

  public async update() {
    const fileContent = await readFile(this.configService.get('VALIDATOR_REGISTRY_FILE_SOURCE_PATH'), 'utf-8');
    const data = <FileContent>load(fileContent);
    if (!isValid(data)) throw new Error('Error when parsing validators registry file source');
    this.logger.log(
      `Successful reading validators registry file source. Keys count per operator - ${data.operators
        .map((o) => `${o.name}: [${o.keys.length}]`)
        .join(', ')}`,
    );
    this.lastSuccessDataReadTimestamp = Date.now();
    this.data = data;
  }

  public async getIndexedKeys() {
    const indexedKeys: any = new Map<string, RegistrySourceKeyWithOperatorName>();
    const allKeys = await this.getKeys();
    for (const k of allKeys ?? []) {
      indexedKeys.set(k.key, k);
    }
    return indexedKeys as RegistrySourceKeysIndexed;
  }

  public async getKeys() {
    const keys: RegistrySourceKeyWithOperatorName[] = [];
    this.data?.operators?.map((o, operatorIndex) =>
      keys.push(
        ...o.keys?.map((key, index) => {
          return { index, operatorIndex, key, operatorName: this.data.operators[operatorIndex].name };
        }),
      ),
    );
    return keys;
  }

  public async sourceTimestamp() {
    return this.lastSuccessDataReadTimestamp;
  }

  public async getOperators(): Promise<RegistrySourceOperator[]> {
    const operators: RegistrySourceOperator[] = [];
    this.data?.operators?.map((o, index) =>
      operators.push({
        index,
        name: o.name,
      }),
    );
    return operators;
  }
}
