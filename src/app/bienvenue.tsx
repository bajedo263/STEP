import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { onboardedKey, setLocalFlag } from '@/hooks/use-local-flag';
import { useTheme } from '@/hooks/use-theme';
import { feedback } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const GOALS = ['6000', '8000', '10000', '12000'] as const;
type Goal = (typeof GOALS)[number];
const GOAL_OPTIONS = GOALS.map((value) => ({
  value,
  label: Number(value).toLocaleString('fr-FR'),
}));

const PROMISES = [
  { title: 'Une boucle sur mesure', text: 'Les pas qu’il vous reste deviennent un trajet prêt à partir, autour de vous.' },
  { title: 'Des lieux à découvrir', text: 'Monuments et curiosités jalonnent le chemin, avec leur histoire.' },
  { title: 'Un territoire à conquérir', text: 'Vos trajets colorent la carte. Vos amis peuvent vous la reprendre.' },
];

/** Premier lancement : la promesse, l'objectif quotidien, puis les autorisations expliquées. */
export default function WelcomeScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>('10000');
  const [asking, setAsking] = useState(false);

  const finish = () => {
    if (userId) setLocalFlag(onboardedKey(userId), '1');
  };

  const saveGoal = () => {
    // Au mieux : l'objectif reste modifiable dans le Profil si l'enregistrement échoue.
    if (supabase && userId) {
      supabase.from('profiles').update({ daily_goal: Number(goal) }).eq('id', userId).then(
        () => {},
        () => {}
      );
    }
    setStep(2);
  };

  const askPermissions = async () => {
    setAsking(true);
    if (Platform.OS !== 'web') {
      await Pedometer.requestPermissionsAsync().catch(() => null);
      await Location.requestForegroundPermissionsAsync().catch(() => null);
    }
    setAsking(false);
    feedback.success();
    finish();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Dots current={step} />
          {step === 0 ? (
            <>
              <ThemedText type="title" themeColor="tint">
                STEP
              </ThemedText>
              <ThemedText type="subtitle" style={styles.centered}>
                Vos 10 000 pas, sans y penser
              </ThemedText>
              <View style={styles.list}>
                {PROMISES.map((item, index) => (
                  <Point key={item.title} index={index + 1} title={item.title} text={item.text} />
                ))}
              </View>
              <Button title="Commencer" onPress={() => setStep(1)} />
            </>
          ) : step === 1 ? (
            <>
              <ThemedText type="subtitle" style={styles.centered}>
                Votre objectif quotidien
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centered}>
                Les boucles proposées s’ajustent aux pas qu’il vous reste pour l’atteindre. Vous pourrez
                le changer à tout moment dans le Profil.
              </ThemedText>
              <SegmentedChoice options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {`${Number(goal).toLocaleString('fr-FR')} pas, c’est environ ${((Number(goal) * 0.75) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km de marche.`}
              </ThemedText>
              <Button title="Continuer" onPress={saveGoal} />
            </>
          ) : (
            <>
              <ThemedText type="subtitle" style={styles.centered}>
                Deux autorisations
              </ThemedText>
              <View style={styles.list}>
                <Point
                  index={1}
                  title="Mouvements et forme"
                  text="Pour compter vos pas de la journée, même sans ouvrir l’app."
                />
                <Point
                  index={2}
                  title="Position"
                  text="Pour tracer des boucles autour de vous et suivre le trajet, seulement quand STEP est ouvert."
                />
              </View>
              <Button title="Autoriser" loading={asking} onPress={askPermissions} />
              <Button title="Plus tard" variant="secondary" onPress={finish} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Dots({ current }: { current: number }) {
  const theme = useTheme();
  return (
    <View style={styles.dots} accessibilityLabel={`Étape ${current + 1} sur 3`}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: index === current ? theme.tint : theme.backgroundSelected },
            index === current && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

function Point({ index, title, text }: { index: number; title: string; text: string }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.item}>
      <View style={[styles.badge, { backgroundColor: theme.tint }]}>
        <ThemedText type="smallBold" style={{ color: theme.onTint }}>
          {index}
        </ThemedText>
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {text}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  list: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.tile,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
});
