import { useEffect, useState } from 'react';
import { BossSigil } from './Icons';
import { loadParser } from './parser';
import { createImageCache, resolveBossImage } from './core/boss-images.mjs';
import type { Boss } from './types';

export type BossImage = { url: string; width: number; height: number; source: string; filePage: string; fetchedAt: number };
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Images can use memory caching. */ }
const images = createImageCache({ storage, resolve: async (title: string) => resolveBossImage(await loadParser(), title) });

function useBossImage(title: string) {
  const [image, setImage] = useState<BossImage | null>(() => images.peek(title));
  useEffect(() => {
    let alive = true;
    setImage(images.peek(title));
    images.get(title).then((value: BossImage | null) => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [title]);
  return image;
}

export default function BossPortrait({ boss, compact = false }: { boss: Boss; compact?: boolean }) {
  const image = useBossImage(boss.wikiTitle);
  const [failed, setFailed] = useState('');
  return <span className={`boss-portrait${compact ? ' compact' : ''}`} aria-hidden="true">
    {image && failed !== image.url ? <img src={image.url} width={image.width} height={image.height} alt="" loading="lazy" decoding="async" onError={() => setFailed(image.url)}/> : <BossSigil category={boss.categories?.[0]}/>}
  </span>;
}

export function BossImageSource({ title }: { title: string }) {
  const image = useBossImage(title);
  return image ? <p className="image-attribution">Boss portrait from <a href={image.source} target="_blank" rel="noreferrer">OSRS Wiki</a> · <a href={image.filePage} target="_blank" rel="noreferrer">Image details & attribution ↗</a></p> : null;
}
