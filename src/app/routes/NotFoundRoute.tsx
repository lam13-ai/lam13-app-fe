import { useNavigate } from 'react-router';
import { RoutePanel } from './RoutePanel';

export default function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <RoutePanel
      eyebrow="404"
      title="Not found."
      description="This conversation doesn't exist or is no longer available."
      action={{ label: 'Start a new chat', onClick: () => navigate('/') }}
    />
  );
}
