import fireflies from '@/assets/brands/fireflies.png';
import gmail from '@/assets/brands/gmail.svg';
import granola from '@/assets/brands/granola.png';
import meet from '@/assets/brands/meet.svg';
import otter from '@/assets/brands/otter.png';
import outlook from '@/assets/brands/outlook.svg';
import slack from '@/assets/brands/slack.png';
import teams from '@/assets/brands/teams.png';
import whatsapp from '@/assets/brands/whatsapp.svg';
import zoom from '@/assets/brands/zoom.svg';
import anthropic from '@/assets/providers/anthropic.svg';
import google from '@/assets/providers/google.svg';
import moonshot from '@/assets/providers/moonshot.svg';
import openai from '@/assets/providers/openai.svg';
import qwen from '@/assets/providers/qwen.svg';
import zai from '@/assets/providers/zai.svg';
import { cn } from '@/lib/cn';

export type Brand = 'granola' | 'otter' | 'fireflies' | 'whatsapp' | 'teams' | 'meet' | 'zoom' | 'slack' | 'gmail' | 'outlook' | 'openai' | 'anthropic' | 'google' | 'moonshot' | 'qwen' | 'zai';

/** Each vendor's own mark (src/assets/brands, src/assets/providers). `bleed`: the icon is a full square that fills the tile. */
const BRANDS: Record<Brand, { name: string; src: string; bleed?: boolean }> = {
  granola: { name: 'Granola', src: granola, bleed: true },
  otter: { name: 'Otter', src: otter },
  fireflies: { name: 'Fireflies', src: fireflies },
  whatsapp: { name: 'WhatsApp', src: whatsapp },
  teams: { name: 'Microsoft Teams', src: teams },
  meet: { name: 'Google Meet', src: meet },
  zoom: { name: 'Zoom', src: zoom, bleed: true },
  slack: { name: 'Slack', src: slack },
  gmail: { name: 'Gmail', src: gmail },
  outlook: { name: 'Outlook', src: outlook },
  openai: { name: 'OpenAI', src: openai },
  anthropic: { name: 'Anthropic', src: anthropic },
  google: { name: 'Google', src: google },
  moonshot: { name: 'Moonshot AI', src: moonshot },
  qwen: { name: 'Qwen', src: qwen },
  zai: { name: 'Z.ai', src: zai },
};

export const brandName = (brand: Brand) => BRANDS[brand].name;

/**
 * A third-party app's logo on a white tile, so every mark keeps its own colours and reads the same in
 * the light and dark themes. Decorative by default: the name is always written next to it.
 */
export function BrandLogo({ brand, size = 40, className }: { brand: Brand; size?: number; className?: string }) {
  const { src, bleed } = BRANDS[brand];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
        // Small marks (in menus) are a plain rounded chip; larger ones get the card's edge.
        size < 24 ? 'rounded-[5px]' : 'rounded-card border border-hairline',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img src={src} alt="" draggable={false} className={bleed ? 'size-full object-cover' : size < 24 ? 'size-[78%] object-contain' : 'size-[72%] object-contain'} />
    </span>
  );
}
