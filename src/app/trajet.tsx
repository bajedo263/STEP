import { Redirect } from 'expo-router';

/** Ancienne adresse de l'écran du trajet : le trajet se suit désormais dans l'onglet Carte. */
export default function WalkScreen() {
  return <Redirect href="/carte" />;
}
