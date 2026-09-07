// Sparse wiki maps omit tiles outside the mapped interior. Those failures must
// not discard usable terrain, regardless of which image request finishes first.
export function trackMapTiles(urls,onEmpty){
  const expected=new Set(urls),settled=new Map();let reported=false;
  return (url,loaded)=>{
    if(!expected.has(url)||settled.has(url))return;
    settled.set(url,loaded);
    if(!reported&&settled.size===expected.size&&![...settled.values()].some(Boolean)){
      reported=true;onEmpty();
    }
  };
}
