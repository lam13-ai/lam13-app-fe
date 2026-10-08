import { useId, type ReactNode } from 'react';
import { BrandLogo, brandName, type Brand } from '@/components/BrandLogo';

/**
 * One integration on the Integrations page: name and purpose, its state or action, then any flow below.
 * `brand` gives the logo and the name; `title` names it differently, and `icon` stands in where there is no logo.
 */
export function IntegrationRow({
  brand,
  title,
  icon,
  description,
  action,
  children,
}: {
  brand?: Brand;
  title?: string;
  icon?: ReactNode;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-b border-hairline py-6 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-start gap-3.5">
          {brand ? (
            <BrandLogo brand={brand} size={36} />
          ) : (
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-card bg-fg/10 text-fg">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 id={id} className="text-sm font-bold">
              {title ?? (brand ? brandName(brand) : '')}
            </h3>
            <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-fg-muted">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="max-w-md sm:pl-[3.125rem]">{children}</div>}
    </section>
  );
}

/** "● Connected", in the product's accent (as Granola's status). */
export function ConnectedDot() {
  return (
    <p className="flex items-center gap-2 text-xs text-fg">
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      Connected
    </p>
  );
}
