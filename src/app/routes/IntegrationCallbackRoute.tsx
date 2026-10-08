import { IntegrationCallback } from '@/features/integrations';

/** `/integrations/:provider/callback` — a provider (Google, Microsoft, Zoom, Webex) returns here after sign-in. */
export default function IntegrationCallbackRoute() {
  return <IntegrationCallback />;
}
