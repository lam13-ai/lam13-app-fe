import { CalendarDays, Paperclip, Plus } from 'lucide-react';
import { useState } from 'react';
import { Chip, IconButton, Menu, MenuItem, Popover, Tooltip, iconProps, smallIconProps } from '@/components/ui';
import { MeetingPicker } from '@/features/meetings';
import { useUiStore } from '@/stores/uiStore';
import type { Effort, MeetingSummary } from '@/types/api';
import { EFFORT_LABELS } from '../../constants';
import { useModels } from '../../hooks/useModels';

const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high'];

/** Three signal bars; filled bars encode the effort level (reference §6). */
function EffortIcon({ effort }: { effort: Effort }) {
  const level = EFFORT_ORDER.indexOf(effort) + 1;
  const bars = [
    { x: 1.5, y: 8, h: 4.5 },
    { x: 5.75, y: 5, h: 7.5 },
    { x: 10, y: 2, h: 10.5 },
  ];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={b.x} x={b.x} y={b.y} width="2.5" height={b.h} rx="1" fill="currentColor" opacity={i < level ? 1 : 0.3} />
      ))}
    </svg>
  );
}

/** Label that re-animates when its value changes. */
function SwapLabel({ value }: { value: string }) {
  return (
    <span key={value} className="inline-block animate-enter-sm px-0.5">
      {value}
    </span>
  );
}

/**
 * "+": add files, or add context — a meeting, picked in a second step of the same menu (like the
 * conversation actions' confirm step). Without `onAddMeeting` it is the plain attach button. Same 32px
 * round button as the composer's other controls.
 */
export function AddControl({ onAttach, onAddMeeting }: { onAttach: () => void; onAddMeeting?: (meeting: MeetingSummary) => void }) {
  const [view, setView] = useState<'menu' | 'meetings'>('menu');
  if (!onAddMeeting) {
    return (
      <Tooltip content="Add images" align="end">
        <IconButton label="Add attachment" size="md" icon={<Plus {...iconProps} />} onClick={onAttach} />
      </Tooltip>
    );
  }
  return (
    <Popover
      placement="top-end"
      anchor="container"
      className="w-[min(24rem,calc(100vw-2rem))]"
      onOpenChange={(open) => {
        if (!open) setView('menu');
      }}
      trigger={(props) => <IconButton {...props} label="Add files or context" size="md" icon={<Plus {...iconProps} />} />}
    >
      {view === 'menu' ? (
        <Menu label="Add to message">
          <MenuItem leading={<Paperclip {...smallIconProps} />} onSelect={onAttach}>
            Files and images
          </MenuItem>
          <MenuItem leading={<CalendarDays {...smallIconProps} />} keepOpen onSelect={() => setView('meetings')}>
            Meeting
          </MenuItem>
        </Menu>
      ) : (
        <MeetingPicker onBack={() => setView('menu')} onSelect={onAddMeeting} />
      )}
    </Popover>
  );
}

/** The reasoning-effort choices the backend offers; `show` is false when there is nothing to choose. */
export function useModelChips() {
  const modelId = useUiStore((s) => s.model);
  const models = useModels().data ?? [];
  const efforts = (models.find((m) => m.id === modelId) ?? models[0])?.efforts ?? [];
  return { efforts, show: efforts.length > 0 };
}

/** Reasoning-effort chips (nothing when the backend offers no choice). The model has its own selector. */
export function ModelChips() {
  const effort = useUiStore((s) => s.effort);
  const setEffort = useUiStore((s) => s.setEffort);
  const { efforts } = useModelChips();

  return (
    <>
      {efforts.length > 0 && (
        <Popover
          placement="top-start"
          anchor="container"
          trigger={(props) => (
            <Chip {...props} aria-label={`Select reasoning effort. Current: ${EFFORT_LABELS[effort]}`} leading={<EffortIcon effort={effort} />}>
              <SwapLabel value={EFFORT_LABELS[effort]} />
            </Chip>
          )}
        >
          <Menu label="Reasoning effort">
            {efforts.map((e) => (
              <MenuItem key={e} checked={e === effort} onSelect={() => setEffort(e)} leading={<EffortIcon effort={e} />}>
                {EFFORT_LABELS[e]}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      )}
    </>
  );
}
