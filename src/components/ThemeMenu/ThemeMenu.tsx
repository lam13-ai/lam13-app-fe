import { Monitor, Moon, Sun } from 'lucide-react';
import { IconButton, Menu, MenuItem, Popover, iconProps, smallIconProps } from '@/components/ui';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Appearance picker (Light / Dark / System) for the sidebar's account area. The button shows the
 * current choice; the menu is a radio group, so the selection is announced and marked.
 */
export function ThemeMenu({ align = 'end' }: { align?: 'start' | 'end' }) {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]!;

  return (
    <Popover
      placement={align === 'end' ? 'top-end' : 'top-start'}
      trigger={(props) => (
        <IconButton {...props} label={`Appearance: ${current.label}`} size="md" icon={<current.Icon {...iconProps} />} />
      )}
    >
      <p aria-hidden="true" className="eyebrow px-2.5 pb-1 pt-1.5">
        Appearance
      </p>
      <Menu label="Appearance">
        {OPTIONS.map(({ value, label, Icon }) => (
          <MenuItem key={value} checked={value === preference} onSelect={() => setPreference(value)} leading={<Icon {...smallIconProps} />}>
            {label}
          </MenuItem>
        ))}
      </Menu>
    </Popover>
  );
}
