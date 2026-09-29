import { useEffect } from 'react';
import { IntegrationsView } from '@/features/integrations';

/** `/integrations` — connected services (Granola, WhatsApp). */
export default function IntegrationsRoute() {
  useEffect(() => {
    document.title = 'Integrations · Lam13';
  }, []);
  return <IntegrationsView />;
}
