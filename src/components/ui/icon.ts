/**
 * Icon sizing convention (Lucide):
 * - `iconProps` (20px): an icon that stands on its own — navigation rows and icon buttons.
 * - `smallIconProps` (16px): an icon that sits inside a line of text — labelled buttons, menu items, chips, metadata.
 * One stroke weight throughout. Icon buttons are 36px (`IconButton` md) with a ≥44px hit area (`hit-area`).
 */
export const iconProps = { size: 20, strokeWidth: 1.8, 'aria-hidden': true } as const;
export const smallIconProps = { size: 16, strokeWidth: 1.8, 'aria-hidden': true } as const;
