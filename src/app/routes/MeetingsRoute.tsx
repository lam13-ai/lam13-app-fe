import { useEffect } from 'react';
import { useParams } from 'react-router';
import { MeetingDetailView, MeetingsView } from '@/features/meetings';

/** `/meetings` — the list; `/meetings/:meetingId` — one meeting. */
export default function MeetingsRoute() {
  const { meetingId } = useParams();
  useEffect(() => {
    document.title = 'Meetings · Lam13';
  }, []);
  return meetingId ? <MeetingDetailView key={meetingId} meetingId={meetingId} /> : <MeetingsView />;
}
