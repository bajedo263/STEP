import { PlaceholderScreen } from '@/components/placeholder-screen';
import { DEFAULT_DAILY_GOAL } from '@/lib/steps';

export default function HomeScreen() {
  return (
    <PlaceholderScreen
      title="STEP"
      description={`Objectif du jour : ${DEFAULT_DAILY_GOAL.toLocaleString('fr-FR')} pas. L'anneau de progression et le bouton « Partir » arrivent ici.`}
    />
  );
}
