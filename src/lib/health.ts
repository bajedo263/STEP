import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/native-build';
import { stepsWithoutManualEntries } from '@/lib/step-sources';

type HealthKit = typeof import('@kingstinct/react-native-healthkit');
type HealthConnect = typeof import('react-native-health-connect');

/**
 * Pas lus dans Apple Santé (iPhone) ou Health Connect (Android), hors saisies manuelles.
 * Indisponible dans Expo Go, qui n'embarque pas ces modules natifs : on reste alors sur le
 * podomètre seul. Les modules ne sont chargés qu'ici, à la demande, pour la même raison.
 */
export const healthAvailable = !isExpoGo && (Platform.OS === 'ios' || Platform.OS === 'android');

let access: Promise<boolean> | null = null;

/** Demande l'accès aux pas une seule fois par lancement ; faux si refusé ou indisponible. */
export function requestHealthAccess(): Promise<boolean> {
  if (!healthAvailable) return Promise.resolve(false);
  access ??= (Platform.OS === 'ios' ? requestHealthKit() : requestHealthConnect()).catch(
    () => false
  );
  return access;
}

/** Pas entre deux dates, ou null si Santé n'est pas accessible. */
export async function healthStepsBetween(start: Date, end: Date): Promise<number | null> {
  if (!(await requestHealthAccess())) return null;
  try {
    return Platform.OS === 'ios'
      ? await healthKitSteps(start, end)
      : await healthConnectSteps(start, end);
  } catch {
    return null;
  }
}

// Chargement à la demande : un import en tête ferait planter Expo Go, qui n'a pas ces modules.
function healthKit(): HealthKit {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@kingstinct/react-native-healthkit') as HealthKit;
}

function healthConnect(): HealthConnect {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-health-connect') as HealthConnect;
}

async function requestHealthKit(): Promise<boolean> {
  const kit = healthKit();
  if (!kit.isHealthDataAvailable()) return false;
  // iOS ne dit jamais si la lecture est refusée : on obtient alors simplement 0 pas.
  await kit.requestAuthorization({ toRead: ['HKQuantityTypeIdentifierStepCount'] });
  return true;
}

/**
 * Requête de statistiques : Santé y fusionne iPhone et montre sans compter deux fois les mêmes
 * pas. Les pas saisis à la main dans Santé (HKWasUserEntered) sont exclus.
 */
async function healthKitSteps(start: Date, end: Date): Promise<number> {
  const kit = healthKit();
  const result = await kit.queryStatisticsForQuantity(
    'HKQuantityTypeIdentifierStepCount',
    ['cumulativeSum'],
    {
      unit: 'count',
      filter: {
        date: { startDate: start, endDate: end },
        NOT: [
          {
            metadata: {
              withMetadataKey: 'HKWasUserEntered',
              operatorType: kit.ComparisonPredicateOperator.equalTo,
              value: true,
            },
          },
        ],
      },
    }
  );
  return Math.round(result.sumQuantity?.quantity ?? 0);
}

async function requestHealthConnect(): Promise<boolean> {
  const hc = healthConnect();
  if ((await hc.getSdkStatus()) !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
  if (!(await hc.initialize())) return false;
  const isSteps = (permission: { accessType: string; recordType?: string }) =>
    permission.accessType === 'read' && permission.recordType === 'Steps';
  if ((await hc.getGrantedPermissions()).some(isSteps)) return true;
  const granted = await hc.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
  return granted.some(isSteps);
}

/**
 * L'agrégat Health Connect déduplique les sources ; on en retire les pas saisis à la main
 * (méthode d'enregistrement « saisie manuelle »).
 */
async function healthConnectSteps(start: Date, end: Date): Promise<number> {
  const hc = healthConnect();
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
  const aggregate = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter });
  const records: { count: number; manual: boolean }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await hc.readRecords('Steps', { timeRangeFilter, pageToken });
    for (const record of page.records) {
      records.push({
        count: record.count,
        manual: record.metadata?.recordingMethod === 3, // RECORDING_METHOD_MANUAL_ENTRY
      });
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return stepsWithoutManualEntries(aggregate.COUNT_TOTAL, records);
}
