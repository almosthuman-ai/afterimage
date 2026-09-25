import { ASCII_FONT_FAMILY } from "./asciiTransmission";
export const surfaceDefaults:Record<string,number>={behavior:0,material:1,motion:.25,scale:6,angle:90,speed:1,cycles:1,cellSize:8,gap:.12,materialMix:.7,keepShape:1,cutoff:.025,colorMode:0,inkColor:0xf3e8ce,groundColor:0x08090d,amount:1};
export function surfaceSample(x:number,y:number,width:number,height:number,p:Record<string,number>,phase:number,seed:number):[number,number,boolean]{
 const d=Math.min(width,height), t=phase*Math.round((p.speed??1)*8)/8*Math.round(p.cycles??1), angle=p.angle*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),v=(-x*sn+y*cs)/d;
 const distance=d*.22*p.motion,frequency=p.scale*Math.PI*2;
 let dx=0,dy=0,valid=true;
 if(p.behavior===0){const w=Math.sin(v*frequency-t);dx=cs*distance*w;dy=sn*distance*w;}
 else if(p.behavior===1){const rx=x-width/2,ry=y-height/2,len=Math.hypot(rx,ry),w=Math.sin(len/d*frequency-t)*distance;dx=rx/Math.max(1,len)*w;dy=ry/Math.max(1,len)*w;}
 else {const size=d/Math.max(1,p.scale),cx=Math.floor(x/size),cy=Math.floor(y/size),a=((cx*37+cy*73+seed%997)%127)/127*Math.PI*2;
   dx=distance*(Math.cos(t)-1)*Math.cos(a);dy=distance*Math.sin(t)*Math.sin(a);
   valid=Math.floor((x-dx)/size)===cx&&Math.floor((y-dy)/size)===cy;
 }
 return [Math.max(0,Math.min(width-1,Math.round(x-dx))),Math.max(0,Math.min(height-1,Math.round(y-dy))),valid];
}
export function warpSurface(data:Uint8ClampedArray,width:number,height:number,params:Record<string,number>,phase:number,seed:number){
 const p={...surfaceDefaults,...params},out=new Uint8ClampedArray(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,[sx,sy,valid]=surfaceSample(x,y,width,height,p,phase,seed),j=(sy*width+sx)*4;
  if(valid){out.set(data.subarray(j,j+4),i);}else out.set([(p.groundColor>>16)&255,(p.groundColor>>8)&255,p.groundColor&255,data[i+3]],i);
 }return out;
}
export function finishSurface(original:Uint8ClampedArray,changed:Uint8ClampedArray,params:Record<string,number>){
 const p={...surfaceDefaults,...params},out=new Uint8ClampedArray(original);
 for(let i=0;i<out.length;i+=4){const light=Math.max(original[i],original[i+1],original[i+2])/255;
 const shape=p.keepShape>=.5?Math.max(0,Math.min(1,(light-p.cutoff)/.04))*(original[i+3]/255):1;
 const mix=p.amount*shape;for(let c=0;c<4;c++)out[i+c]=Math.round(original[i+c]*(1-mix)+changed[i+c]*mix);
 }return out;
}
export function renderSurfaceMotion(input:HTMLCanvasElement,params:Record<string,number>,glyphs:string[],phase:number,seed:number){
 const p={...surfaceDefaults,...params},w=input.width,h=input.height,out=document.createElement("canvas");out.width=w;out.height=h;
 const ctx=out.getContext("2d")!,original=input.getContext("2d")!.getImageData(0,0,w,h),warped=warpSurface(original.data,w,h,p,phase,seed);
 const raster=ctx.createImageData(w,h);raster.data.set(warped);ctx.putImageData(raster,0,0);
 if(p.material>0 && p.materialMix>0){const material=document.createElement("canvas");material.width=w;material.height=h;const g=material.getContext("2d")!;
 const rgb=(c:number)=>`rgb(${(c>>16)&255},${(c>>8)&255},${c&255})`;g.fillStyle=rgb(p.groundColor);g.fillRect(0,0,w,h);
 const cell=Math.max(1,p.cellSize*Math.min(w,h)/600),size=cell*(1-p.gap),alphabet=glyphs.flatMap(c=>Array.from(c)).filter(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)<=126);
 g.font=`600 ${cell*1.3}px "${ASCII_FONT_FAMILY}", monospace`;g.textAlign="center";g.textBaseline="middle";
 for(let y=0;y<h;y+=cell)for(let x=0;x<w;x+=cell){const px=Math.min(w-1,Math.floor(x+cell/2)),py=Math.min(h-1,Math.floor(y+cell/2)),i=(py*w+px)*4,r=warped[i],green=warped[i+1],b=warped[i+2],light=(.2126*r+.7152*green+.0722*b)/255;
  g.fillStyle=p.colorMode>=.5?rgb(p.inkColor):`rgb(${r},${green},${b})`;g.globalAlpha=warped[i+3]/255;
  if(p.material===1){if(p.colorMode>=.5)g.globalAlpha*=light;g.fillRect(x+(cell-size)/2,y+(cell-size)/2,size,size);}
  else if(alphabet.length && light>p.cutoff){const glyph=alphabet[Math.min(alphabet.length-1,Math.floor(light*alphabet.length))];g.save();g.translate(x+cell/2,y+cell/2);g.scale(1-p.gap,1-p.gap);g.fillText(glyph,0,0);g.restore();}
 }
 ctx.globalAlpha=p.materialMix;ctx.drawImage(material,0,0);ctx.globalAlpha=1;
 }
 const changed=ctx.getImageData(0,0,w,h);changed.data.set(finishSurface(original.data,changed.data,p));ctx.putImageData(changed,0,0);return out;
}
