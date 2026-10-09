import AppTabs from '@/components/app-tabs';
import { WalkBanner } from '@/components/walk-banner';
import { useDailyReminders } from '@/hooks/use-daily-reminders';

export default function TabLayout() {
  useDailyReminders();
  return (
    <>
      <AppTabs />
      <WalkBanner />
    </>
  );
}
