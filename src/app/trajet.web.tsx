import { PlaceholderScreen } from '@/components/placeholder-screen';

/** Le suivi GPS et la carte ne fonctionnent que sur téléphone. */
export default function WalkScreen() {
  return (
    <PlaceholderScreen
      title="Trajet"
      description="Le suivi du trajet est disponible dans l’app sur votre téléphone."
    />
  );
}
