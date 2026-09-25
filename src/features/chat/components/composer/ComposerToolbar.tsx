import { Plus } from 'lucide-react';
import { Chip, IconButton, Menu, MenuItem, Popover, Tooltip, iconProps } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import type { Effort } from '@/types/api';
import { EFFORT_LABELS } from '../../constants';
import { useModels } from '../../hooks/useModels';

const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high'];

function ModelSquare() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 [background:var(--gradient-accent)]"
    />
  );
}

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

export function ComposerToolbar({ onAttach }: { onAttach: () => void }) {
  const modelId = useUiStore((s) => s.model);
  const effort = useUiStore((s) => s.effort);
  const setModel = useUiStore((s) => s.setModel);
  const setEffort = useUiStore((s) => s.setEffort);

  const models = useModels().data ?? [];
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const efforts = model?.efforts ?? [];
  // Hide the chips until models load, and when there is nothing to choose (api-contract.md §4.6).
  const showModel = models.length > 1 || efforts.length > 0;

  return (
    <div className="flex h-10 animate-reveal items-center gap-0.5 pb-1 pl-3 pr-12">
      {showModel && model && (
        <Popover
          placement="top-start"
          anchor="container"
          trigger={(props) => (
            <Chip {...props} aria-label={`Select model. Current: ${model.label}`} leading={<ModelSquare />}>
              <SwapLabel value={model.label} />
            </Chip>
          )}
        >
          <Menu label="Model">
            {models.map((m) => (
              <MenuItem key={m.id} checked={m.id === model.id} onSelect={() => setModel(m.id)} leading={<ModelSquare />}>
                {m.label}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      )}

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

      <div className="ml-auto">
        <Tooltip content="Add images" align="end">
          <IconButton label="Add attachment" icon={<Plus {...iconProps} size={14} />} onClick={onAttach} />
        </Tooltip>
      </div>
    </div>
  );
}
