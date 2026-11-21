// Line icons drawn for the interface, so the window chrome, the navigation and the empty
// equipment slots look the same on every system instead of depending on its emoji font.
import type { ReactNode } from 'react';
import type { SlotId } from '../../../shared/types';

function Svg({ children, size = 20, fill }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const PATHS = {
  character: <><circle cx="12" cy="7.5" r="3.6" /><path d="M4.5 20.5c.6-4.4 3.6-6.8 7.5-6.8s6.9 2.4 7.5 6.8" /></>,
  inventory: <><path d="M6 9.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V11A1.500 1.500 0 0 1 6 9.500Z" /><path d="M8.500 9.500V7a3.500 3.500 0 0 1 7 0v2.500" /><path d="M4.500 13.500h15" /><path d="M10.500 13.500v2h3v-2" /></>,
  journal: <><path d="M6.500 3.500h10a2 2 0 0 1 2 2v15h-12a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M4.500 18.500a2 2 0 0 1 2-2h12" /><path d="M9 7.500h6M9 10.500h4" /></>,
  map: <><path d="m3.500 6.500 5.500-2 6 2 5.500-2v13l-5.500 2-6-2-5.500 2Z" /><path d="M9 4.500v13M15 6.500v13" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.800v2.400M12 18.800v2.400M2.800 12h2.400M18.800 12h2.400M5.500 5.500l1.700 1.700M16.800 16.800l1.700 1.700M5.500 18.500l1.700-1.700M16.800 7.200l1.700-1.700" /></>,
  close: <path d="m6.500 6.500 11 11M17.500 6.500l-11 11" />,
  table: <><circle cx="8.500" cy="8" r="2.800" /><circle cx="16.500" cy="9" r="2.300" /><path d="M3 19c.4-3.300 2.600-5.200 5.500-5.200s5.100 1.900 5.500 5.200M15 14.200c2.800-.3 5.200 1.300 5.800 4.800" /></>,
  weight: <><path d="M8 8.500h8l3 11H5Z" /><circle cx="12" cy="6" r="2.300" /></>,
  coin: <><ellipse cx="12" cy="8" rx="7" ry="3.500" /><path d="M5 8v4c0 1.900 3.100 3.500 7 3.500s7-1.600 7-3.500V8M5 12v4c0 1.900 3.100 3.500 7 3.500s7-1.600 7-3.500v-4" /></>,
  sound: <><path d="M4 9.500v5h3.500l4.500 4v-13l-4.500 4Z" /><path d="M15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11" /></>,
  mute: <><path d="M4 9.500v5h3.500l4.500 4v-13l-4.500 4Z" /><path d="m16 9.500 5 5M21 9.500l-5 5" /></>,
  quest: <><path d="M12 3.500 14.600 9l6 .700-4.500 4.100 1.300 5.900L12 16.700l-5.400 3 1.300-5.900L3.400 9.700l6-.700Z" /></>,
  people: <><circle cx="12" cy="8" r="3.500" /><path d="M5 20c.6-4 3.400-6.200 7-6.200s6.400 2.200 7 6.200" /></>,
  places: <><path d="M12 21s6.500-6.200 6.500-11A6.500 6.500 0 0 0 5.500 10c0 4.800 6.500 11 6.500 11Z" /><circle cx="12" cy="10" r="2.300" /></>,
  lore: <><path d="M7 4.500h11.500v12.500a2.500 2.500 0 0 1-2.500 2.500H6a2.500 2.500 0 0 1-2.500-2.500V16H14v1a2 2 0 0 0 2 2" /><path d="M7 4.500V16M10 8.500h5.500M10 11.500h5.500" /></>,
  sword: <><path d="m14.500 3.500 6-.0 0 6-9.500 9.500-2.800-2.800Z" transform="translate(-1 0)" /><path d="m6.500 13.500 4 4M5 19l2.500-2.500M3.800 16.200l4 4" /></>,
  shield: <path d="M12 3.200 19.500 6v5.500c0 4.600-3.100 7.900-7.500 9.300-4.400-1.400-7.500-4.700-7.500-9.300V6Z" />,
  heart: <path d="M12 20s-7.500-4.600-7.500-10A4.200 4.200 0 0 1 12 7.400 4.200 4.200 0 0 1 19.500 10c0 5.400-7.500 10-7.500 10Z" />,
  boot: <path d="M8 3.500h5.500v8.500l5 2.500a2.500 2.500 0 0 1 1.400 2.200v2.800H5.500V15L8 12Z" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  pin: <><path d="M9 3.500h6l-1 6 3.500 3.500h-11L10 9.500Z" /><path d="M12 13v7.500" /></>,
  innkeeper: <><circle cx="8" cy="15.500" r="4.200" /><path d="m11 12.500 8.500-8.500M16.500 7l2.800 2.800M13.800 9.700l2.200 2.200" /></>,
  search: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 5.500 5.500" /></>,
  menu: <path d="M4.500 7h15M4.500 12h15M4.500 17h15" />,
  resume: <path d="M8 5.500v13l10-6.500Z" />,
  leave: <><path d="M13.500 4.500h-7a1.500 1.500 0 0 0-1.500 1.500v12a1.500 1.500 0 0 0 1.500 1.500h7" /><path d="M10 12h10M16.500 8.500 20 12l-3.500 3.500" /></>,
  fullscreen: <path d="M4.500 9V4.500H9M15 4.500h4.500V9M19.500 15v4.500H15M9 19.500H4.500V15" />,
  restart: <><path d="M19.500 12a7.500 7.500 0 1 1-2.200-5.300" /><path d="M19.500 4.500v4h-4" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return <Svg size={size}>{PATHS[name]}</Svg>;
}

/** Silhouettes for empty equipment slots. */
const SLOT_PATHS: Record<SlotId, ReactNode> = {
  head: <><path d="M4.500 14.500a7.500 7.500 0 0 1 15 0v2.500h-4.200v-3.200h-1.800v5.700h-3v-5.700H8.700V17H4.500Z" /><path d="M12 7V3.500" /></>,
  amulet: <><path d="M6.500 3.500c0 5.500 2.200 8.500 5.500 10 3.300-1.500 5.500-4.500 5.500-10" /><path d="m12 13.500 3 3.500-3 3.500-3-3.500Z" /></>,
  armor: <><path d="M8.500 3.500 4 6l1.500 4.500L7.500 10v10.500h9V10l2 .500L20 6l-4.500-2.500a3.500 3.500 0 0 1-7 0Z" /><path d="M7.500 14.500h9" /></>,
  cloak: <><path d="M9 4.500a3 3 0 0 0 6 0c3.500 1.200 5 4.500 5 9.500v6.500H4V14c0-5 1.500-8.300 5-9.500Z" /><path d="M12 7.500v13" /></>,
  mainHand: <><path d="M19.500 3.500 20.500 4.500 20 9l-9 9-3-3 9-9Z" /><path d="m6.500 13.500 4 4M7.500 16.500 4 20M3.500 17l3.500 3.500" /></>,
  offHand: <><path d="M12 3.200 19.500 6v5.500c0 4.600-3.100 7.900-7.500 9.300-4.400-1.400-7.500-4.700-7.500-9.300V6Z" /><path d="M12 7v9.500M8 11.500h8" /></>,
  ring: <><circle cx="12" cy="14.500" r="5.500" /><path d="m12 9-2.500-3L12 3.500 14.500 6Z" /></>,
  hands: <><path d="M7 20.500V11l-1.500-3a1.200 1.200 0 0 1 2.100-1.100L9 9V4.500a1.200 1.200 0 0 1 2.400 0V9V3.500a1.200 1.200 0 0 1 2.400 0V9V4.500a1.200 1.200 0 0 1 2.400 0V10V6.500a1.200 1.200 0 0 1 2.400 0v7c0 3.500-1.500 5.500-3.500 7Z" /></>,
  waist: <><path d="M3.500 9.500h17v5h-17Z" /><path d="M9.500 8h5v8h-5Z" /><path d="M12 12h2.500" /></>,
  boots: <path d="M8 3.500h5.500v8.500l5 2.500a2.500 2.500 0 0 1 1.400 2.200v2.800H5.500V15L8 12Z" />,
};

export function SlotIcon({ slot, size = 30 }: { slot: SlotId; size?: number }) {
  return <Svg size={size}>{SLOT_PATHS[slot]}</Svg>;
}
