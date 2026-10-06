import { useEffect } from 'react';
import { CalendarView } from '@/features/calendar';

/** `/calendar` */
export default function CalendarRoute() {
  useEffect(() => {
    document.title = 'Calendar · Lam13';
  }, []);
  return <CalendarView />;
}
