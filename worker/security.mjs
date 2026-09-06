export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function key(secret) {
  if (!secret || secret.length < 32) throw new HttpError(503, 'Backend encryption is not configured.');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function encrypt(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), data = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await key(secret), new TextEncoder().encode(JSON.stringify(value))));
  return JSON.stringify({ iv: [...iv], data: [...data] });
}
export async function decrypt(value, secret) {
  const {iv,data} = JSON.parse(value);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:new Uint8Array(iv) }, await key(secret), new Uint8Array(data))));
}
export async function readJSON(request, limit = 200000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request too large.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Missing request body.');
  const parts=[];let size=0;
  for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Request too large.');}parts.push(value); }
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'Invalid JSON.');}
}

// Parse all PNG chunks, verify CRCs and IHDR dimensions, and reject trailing data.
export function validatePNG(base64, expected) {
  if (typeof base64 !== 'string' || base64.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, 'Invalid or oversized screenshot.');
  let bytes;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{throw new HttpError(400,'Invalid screenshot encoding.');}
  const sig=[137,80,78,71,13,10,26,10];if(bytes.length<57||sig.some((n,i)=>bytes[i]!==n))throw new HttpError(400,'Screenshot must be a PNG.');
  const view=new DataView(bytes.buffer);let at=8,header=false,pixels=false,end=false;
  const crc = data => {let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  while(at+12<=bytes.length){
    const n=view.getUint32(at);if(n>bytes.length-at-12)throw new HttpError(400,'Truncated PNG.');
    const type=String.fromCharCode(...bytes.slice(at+4,at+8));
    if(crc(bytes.slice(at+4,at+8+n))!==view.getUint32(at+8+n))throw new HttpError(400,'Invalid PNG checksum.');
    if(!header&&type!=='IHDR')throw new HttpError(400,'Missing PNG header.');
    if(type==='IHDR'){
      if(header||n!==13||view.getUint32(at+8)!==expected.width||view.getUint32(at+12)!==expected.height)throw new HttpError(400,'Screenshot dimensions do not match the evidence plan.');
      if(bytes[at+16]!==8||![2,6].includes(bytes[at+17])||bytes[at+18]!==0||bytes[at+19]!==0||bytes[at+20]!==0)throw new HttpError(400,'Unsupported PNG encoding.');
      header=true;
    }
    if(type==='IDAT')pixels=true;
    at+=n+12;
    if(type==='IEND'){if(n||at!==bytes.length||!pixels)throw new HttpError(400,'Invalid PNG ending.');end=true;break;}
  }
  if(!end)throw new HttpError(400,'Incomplete PNG.');
  return bytes;
}

export async function validatePixels(bytes, expected) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];let at=8,channels=4;
  while(at+12<=bytes.length){const length=view.getUint32(at),type=String.fromCharCode(...bytes.slice(at+4,at+8));if(type==='IHDR')channels=bytes[at+17]===2?3:4;if(type==='IDAT')parts.push(bytes.slice(at+8,at+8+length));at+=length+12;}
  const limit=(expected.width*channels+1)*expected.height;
  const reader=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();let total=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;if(total+value.length>limit){await reader.cancel();throw Error('Too much pixel data');}
      const rowLength=expected.width*channels+1;
      for(let i=(rowLength-total%rowLength)%rowLength;i<value.length;i+=rowLength)if(value[i]>4)throw Error('Invalid scanline filter');
      total+=value.length;
    }
    if(total!==limit)throw Error('Incomplete pixel data');
  }catch{throw new HttpError(400,'Screenshot pixel data is invalid. Regenerate the screenshots.');}
}
