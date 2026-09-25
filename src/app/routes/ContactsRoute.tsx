import { useEffect } from 'react';
import { ContactsView } from '@/features/contacts';

/** `/contacts` — My Contacts. */
export default function ContactsRoute() {
  useEffect(() => {
    document.title = 'My Contacts · Lam13';
  }, []);
  return <ContactsView />;
}
