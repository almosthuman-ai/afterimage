import {invoke} from '@tauri-apps/api/core';
import {symbolStudy} from './figureComposition';
export type EmojiChoice={id:string;name:string};
export type LibraryImage={filePath:string;previewDataUrl:string};
const images=new Map<string,string>();
export function builtinEmojiUrl(index:number){const key=`builtin:${index}`;if(images.has(key))return images.get(key)!;const raster=symbolStudy(index),canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;canvas.getContext('2d')!.putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);const url=canvas.toDataURL();images.set(key,url);return url;}
export async function makeEmojiAtlas(choices:EmojiChoice[]):Promise<string>{
  if(!choices.length||choices.length>64)throw new Error('Choose between 1 and 64 emoji.');
  const loaded:HTMLImageElement[]=[];
  for(let i=0;i<choices.length;i++){
    const {id}=choices[i];let url=images.get(id);
    if(!url){if(id.startsWith('builtin:'))url=builtinEmojiUrl(Number(id.slice(8)));else{const loaded=await invoke<LibraryImage>('select_emoji_library',{id});url=loaded.previewDataUrl;images.set(id,url);}}
    const image=new Image();image.src=url;await image.decode();loaded.push(image);
  }
  const side=Math.min(1024,Math.floor(16384/choices.length),Math.max(192,...loaded.map(image=>Math.max(image.naturalWidth,image.naturalHeight))));
  const canvas=document.createElement('canvas');canvas.width=choices.length*side;canvas.height=side;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  loaded.forEach((image,i)=>{const scale=side/Math.max(image.naturalWidth,image.naturalHeight),w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));ctx.drawImage(image,i*side+Math.floor((side-w)/2),Math.floor((side-h)/2),w,h);});
  return canvas.toDataURL('image/png');
}
