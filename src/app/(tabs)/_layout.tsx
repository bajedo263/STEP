import AppTabs from '@/components/app-tabs';
import { useDailyReminders } from '@/hooks/use-daily-reminders';

export default function TabLayout() {
  useDailyReminders();
  return <AppTabs />;
}
