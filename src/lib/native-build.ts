import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Vrai dans Expo Go : seuls ses modules natifs intégrés sont disponibles (pas de Santé, pas de
 * suivi en arrière-plan, pas de connexion Apple). Faux dans la version installée (TestFlight).
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
