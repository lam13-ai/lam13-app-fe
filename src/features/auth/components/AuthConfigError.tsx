import type { ConfigProblem } from '../config';
import { AuthLayout, Eyebrow } from './AuthLayout';

/**
 * Shown when Kinde is not configured. Lists variable NAMES (never values), and only in
 * development builds; production shows a generic message.
 */
export function AuthConfigError({ problems, showDetails }: { problems: ConfigProblem[]; showDetails: boolean }) {
  return (
    <AuthLayout>
      <div role="alert" className="flex flex-col gap-4">
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">Sign-in isn&apos;t available.</h1>
        <p className="font-sans text-sm leading-relaxed text-fg-muted">
          {showDetails
            ? 'Authentication is not configured for this environment. Set the following in your local env file (see .env.example):'
            : 'Authentication is not configured for this environment. Please contact your administrator.'}
        </p>
        {showDetails && (
          <ul className="flex flex-col gap-1.5 border border-hairline bg-muted px-4 py-3 text-xs">
            {problems.map((p) => (
              <li key={p.variable} className="flex justify-between gap-4">
                <code>{p.variable}</code>
                <span className="text-danger">{p.reason === 'missing' ? 'missing' : 'invalid URL'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthLayout>
  );
}
