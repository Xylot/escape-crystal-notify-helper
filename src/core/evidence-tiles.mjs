import { regionTileUrl, wikiRegionTileUrl } from './coordinates.mjs';
import { mapContext } from './pr-evidence.mjs';

export async function evidenceTile(region, value, proxy, fetcher=fetch) {
  const context=mapContext(value);
  const url=context.tiles?wikiRegionTileUrl(region,context.tiles,context.plane):regionTileUrl(region,context.plane);
  async function image(response) {
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(!/^image\/(png|webp)(;|$)/i.test(response.headers.get('content-type')||''))throw new Error('Invalid map image type');
    if(Number(response.headers.get('content-length'))>2000000)throw new Error('Map image too large');
    const blob=await response.blob();
    if(!blob.size||blob.size>2000000)throw new Error('Invalid map image size');
    return blob;
  }
  try {
    // Public tiles explicitly permit CORS. Never send editor or GitHub credentials.
    return await image(await fetcher(url,{mode:'cors',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)}));
  } catch(directError) {
    try{return await image(await proxy(region,context));}
    catch(proxyError){throw new Error(`Map tile ${region} on plane ${context.plane} could not be downloaded. Browser: ${directError.message}. Backend: ${proxyError.message}. Retry before submitting.`);}
  }
}
