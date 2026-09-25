import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/85',
  secondary: 'border border-fg/30 bg-bg/70 text-fg backdrop-blur-sm hover:border-fg/60 hover:bg-bg',
  outline: 'border border-outline text-fg hover:bg-fg hover:text-bg',
  ghost: 'text-fg-muted hover:bg-fg/5 hover:text-fg',
  danger: 'bg-danger text-bg hover:bg-danger/85',
};

// Mobile sizes keep a 44px touch target; desktop tightens to the reference sizes.
const sizes: Record<Size, string> = {
  sm: 'h-11 px-3 text-nav md:h-9',
  md: 'h-11 px-4 text-sm md:h-10',
  lg: 'min-h-[52px] px-8 py-4 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'relative inline-flex select-none items-center gap-2.5 whitespace-nowrap font-mono',
        'transition-colors duration-150 ease-standard',
        'disabled:pointer-events-none disabled:opacity-40',
        fullWidth ? 'w-full justify-start' : 'justify-center',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
