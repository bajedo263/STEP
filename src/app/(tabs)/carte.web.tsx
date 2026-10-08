import { PlaceholderScreen } from '@/components/placeholder-screen';

/** react-native-maps ne fonctionne que sur iOS et Android. */
export default function MapScreen() {
  return (
    <PlaceholderScreen
      title="Carte"
      description="La carte et le mode Boucle sont disponibles dans l’app sur votre téléphone."
    />
  );
}
