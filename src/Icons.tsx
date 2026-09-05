import type { CSSProperties } from 'react';
export type IconName = 'compass' | 'map' | 'layers' | 'file' | 'search' | 'plus' | 'arrow' | 'external' | 'sync' | 'check' | 'shield' | 'book' | 'grid' | 'list' | 'swords' | 'spark' | 'feather' | 'close';
const paths: Record<IconName, string> = {
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  layers: 'm3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  file: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
  plus: 'M12 5v14M5 12h14', arrow: 'M4 12h16m-6-6 6 6-6 6', external: 'M8 5H4v15h15v-5M12 4h8v8M10 14 20 4',
  sync: 'M20 8a8.5 8.5 0 0 0-14-3L3 8m0-5v5h5m-4 8a8.5 8.5 0 0 0 14 3l3-3m0 5v-5h-5',
  check: 'm5 12 4 4L19 6', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  book: 'M12 6C8 3 4 4 2 5v15c3-2 6-2 10 0 4-2 7-2 10 0V5c-2-1-6-2-10 1Zm0 0v14',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  list: 'M9 5h12M9 12h12M9 19h12M3 5h1m-1 7h1m-1 7h1',
  swords: 'm3 3 5 1 12 12-4 4L4 8 3 3Zm12 12-3 3m6-6-3 3m-3-7 4-4 5-1-1 5-4 4M4 16l4 4m-5 1 4-4m10 0 4 4',
  spark: 'm12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z',
  feather: 'M4 21 17 8M8 17c-4-9 5-16 13-14 2 8-5 17-13 14Zm3-3h6m-3-3V6', close: 'm6 6 12 12M6 18 18 6',
};
export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Crystal({ className = '' }: { className?: string }) {
  return <svg className={`crystal-mark ${className}`} viewBox="0 0 100 150" fill="none" aria-hidden="true"><path d="M50 3 85 40 92 101 50 147 8 101 15 40Z" fill="#9478e7"/><path d="m50 3-19 48 19 96L8 101l7-61Z" fill="#7055b5"/><path d="m50 3 19 48-19 96 42-46-7-61Z" fill="#ad95f5"/><path d="m50 3 19 48-19 25-19-25Z" fill="#e0d3ff"/><path d="m31 51 19 25 19-25-19 96Z" fill="#b89cf5"/><path d="m8 101 23-50-16-11m77 61L69 51l16-11M50 3v73m0 71V76" stroke="#f0e7ff" strokeOpacity=".45" strokeWidth=".8"/></svg>;
}
export function BossSigil({ category = '', large = false }: { category?: string; large?: boolean }) {
  const name: IconName = /slayer/i.test(category) ? 'feather' : /quest/i.test(category) ? 'book' : /wilderness/i.test(category) ? 'swords' : /raid|xeric|amascut|blood/i.test(category) ? 'layers' : /skill/i.test(category) ? 'spark' : /instance/i.test(category) ? 'shield' : 'compass';
  const hue = /slayer/i.test(category) ? 269 : /quest/i.test(category) ? 38 : /wilderness/i.test(category) ? 12 : /instance/i.test(category) ? 185 : 221;
  return <span className={`boss-sigil ${large ? 'large' : ''}`} style={{ '--sigil-hue': hue } as CSSProperties}><Icon name={name} size={large ? 54 : 25} /></span>;
}
