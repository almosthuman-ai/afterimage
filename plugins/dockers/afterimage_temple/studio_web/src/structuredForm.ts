import {composeStructure,structureScene,trimStructureTile,type StructureTile} from './formStructure';
import {figureStudy,symbolStudy} from './figureComposition';
import {emojiTiles,emojiIndex} from './emojiPattern';
import {structureHash} from './formStructure';
export function renderStructuredForm(w:number,h:number,p:Record<string,number>,palette:readonly number[],seed:number,image:HTMLImageElement|null,phase:number,body:(size:number)=>HTMLCanvasElement){
 const nodes=structureScene(w,h,p,seed,phase);let tiles:StructureTile[];
 if((p.figureActive??0)>=.5){
  const material=p.figureSource??0;
  if(material===1){if(!image)throw new Error('The selected FORM image is unavailable.');const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const source={width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};tiles=(p.emojiCount??0)>0?emojiTiles(source,Math.round(p.emojiCount)):[source];}
  else{const count=(p.fieldMix??0)>=.5?(material===2?12:(p.fieldCast??0)>=.5?24:12):1;tiles=Array.from({length:count},(_,i)=>material===2?symbolStudy(((p.symbolIndex??0)+i)%12):figureStudy(((p.figurePose??0)+i)%24,p.figureStyle??0,p,phase));}
  tiles=tiles.map((src,n)=>{const data=src.data.slice(),color=palette[(p.fieldInk??0)>=.5?n%3:0];for(let i=0;i<data.length;i+=4){if(material===0||(p.fieldInk??0)>=.5){const shade=material===0?.55+data[i]/255*.45:1;data[i]=Math.round(((color>>16)&255)*shade);data[i+1]=Math.round(((color>>8)&255)*shade);data[i+2]=Math.round((color&255)*shade);}data[i+3]=Math.round(data[i+3]*(p.figurePresence??.9));}return {...src,data};});
 }else{const size=Math.max(128,Math.min(Math.max(w,h),Math.ceil(Math.max(...nodes.map(n=>n.size))))),canvas=body(size);tiles=[{width:canvas.width,height:canvas.height,data:canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data}];}
 tiles=tiles.map(trimStructureTile);
 const count=nodes.length,indices=Array.from({length:count},(_,i)=>emojiIndex(i,0,tiles.length,{...p,fieldMix:(p.fieldMix??0)},structureHash(seed,i+819),structureHash(seed,Math.floor(i/3)+701)));
 const output=document.createElement('canvas');output.width=w;output.height=h;output.getContext('2d')!.putImageData(new ImageData(composeStructure(w,h,tiles,nodes,palette[3],indices),w,h),0,0);return output;
}
