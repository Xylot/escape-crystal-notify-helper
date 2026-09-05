import {paintGrid} from './core/map-grid.mjs';
self.onmessage=({data})=>{try{const canvas=new OffscreenCanvas(256,256);paintGrid(canvas.getContext('2d'),data.state);const bitmap=canvas.transferToImageBitmap();self.postMessage({id:data.id,bitmap},[bitmap]);}catch{self.postMessage({id:data.id,error:true});}};
