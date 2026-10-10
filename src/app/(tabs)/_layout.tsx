import AppTabs from '@/components/app-tabs';
import { WalkBanner } from '@/components/walk-banner';
import { useComebackGift } from '@/hooks/use-comeback';
import { useDailyReminders } from '@/hooks/use-daily-reminders';

export default function TabLayout() {
  useDailyReminders();
  useComebackGift();
  return (
    <>
      <AppTabs />
      <WalkBanner />
    </>
  );
}
