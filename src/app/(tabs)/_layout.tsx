import AppTabs from '@/components/app-tabs';
import { WalkBanner } from '@/components/walk-banner';
import { useComebackGift } from '@/hooks/use-comeback';
import { useDailyReminders } from '@/hooks/use-daily-reminders';
import { usePassiveConquest } from '@/hooks/use-passive-conquest';

export default function TabLayout() {
  useDailyReminders();
  useComebackGift();
  usePassiveConquest();
  return (
    <>
      <AppTabs />
      <WalkBanner />
    </>
  );
}
