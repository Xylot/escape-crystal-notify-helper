let pending: Promise<{ parse: (text: string) => any }> | null = null;
export function loadParser() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}vendor/wikiparser.js?v=1.31.0-lsp`;
    script.onload = () => {
      const globals = globalThis as any;
      const candidate = globals.Parser ?? globals.wikiparse;
      if (candidate?.parse) resolve(candidate);
      else if (typeof candidate === 'function') resolve({ parse:candidate });
      else { pending = null; reject(new Error('WikiParser did not expose its browser API. Run parser integration tests before deployment.')); }
    };
    script.onerror = () => { pending = null; script.remove(); reject(new Error('WikiParser is unavailable. Install dependencies and run npm run dev/build.')); };
    document.head.appendChild(script);
  });
  return pending;
}
