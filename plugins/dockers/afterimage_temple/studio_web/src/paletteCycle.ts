import type { StudioRecipe } from "./studio";
export type CycleColor = [number, number, number];
export type CycleParameters = Record<string, number>;
export const cycleDefaults: CycleParameters = { speed: 1, colors: 16, paletteSource: 0, mapping: 0, blend: 1, cycles: 1, offset: 0, bands: 3, angle: 0, centerX: .5, centerY: .5, firstColor: 1, lastColor: 32, amount: 1 };
const mod = (n: number, d: number) => ((n % d) + d) % d;
const distance = (a: CycleColor, b: CycleColor) => (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
const luma = (c: CycleColor) => .2126*c[0]+.7152*c[1]+.0722*c[2];

export function imageCyclePalette(data: Uint8ClampedArray, width: number, height: number, count: number): CycleColor[] {
  const weights = new Float64Array(512), sums = new Float64Array(1536);
  for (let sy=0;sy<48;sy++) for(let sx=0;sx<48;sx++) {
    const x=Math.min(width-1,Math.floor((sx+.5)*width/48)),y=Math.min(height-1,Math.floor((sy+.5)*height/48)),i=(y*width+x)*4;
    if (!data[i+3]) continue;
    const bin=(data[i]>>5)*64+(data[i+1]>>5)*8+(data[i+2]>>5);
    weights[bin]++;for(let c=0;c<3;c++)sums[bin*3+c]+=data[i+c];
  }
  const bins: {color:CycleColor;weight:number}[]=[];
  for(let i=0;i<512;i++)if(weights[i])bins.push({color:[sums[i*3]/weights[i],sums[i*3+1]/weights[i],sums[i*3+2]/weights[i]],weight:weights[i]});
  if(!bins.length)return Array.from({length:count},()=>[0,0,0]);
  let first=0;for(let i=1;i<bins.length;i++)if(bins[i].weight>bins[first].weight)first=i;
  const centers:CycleColor[]=[[...bins[first].color]];
  while(centers.length<count){let best=0,score=-1;for(let i=0;i<bins.length;i++){const d=Math.min(...centers.map(c=>distance(c,bins[i].color)))*Math.sqrt(bins[i].weight);if(d>score){score=d;best=i;}}centers.push([...bins[best].color]);}
  for(let pass=0;pass<4;pass++){
    const sums=Array.from({length:count},()=>[0,0,0,0]);
    for(const bin of bins){let best=0,d=Infinity;for(let j=0;j<count;j++){const next=distance(bin.color,centers[j]);if(next<d){best=j;d=next;}}for(let c=0;c<3;c++)sums[best][c]+=bin.color[c]*bin.weight;sums[best][3]+=bin.weight;}
    for(let j=0;j<count;j++)if(sums[j][3])centers[j]=[sums[j][0]/sums[j][3],sums[j][1]/sums[j][3],sums[j][2]/sums[j][3]];
  }
  return centers.map(c=>c.map(Math.round) as CycleColor).sort((a,b)=>luma(a)-luma(b)||a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
}

export function studioCyclePalette(colors: number[], count: number): CycleColor[] {
  const source=colors.length?colors:[0,0xffffff];
  return Array.from({length:count},(_,i)=>{
    const t=i*source.length/count,k=Math.floor(t),f=t-k,a=source[k%source.length],b=source[(k+1)%source.length];
    return [16,8,0].map(shift=>Math.round(((a>>shift)&255)*(1-f)+((b>>shift)&255)*f)) as CycleColor;
  });
}

export function applyPaletteCycle(data: Uint8ClampedArray,width:number,height:number,parameters:CycleParameters,studio:number[],phase:number) {
  const p={...cycleDefaults,...parameters}, count=Math.max(2,Math.min(32,Math.round(p.colors)));
  const palette=p.paletteSource>=1.5?Array.from({length:count},(_,i)=>{const c=p[`regionColor${i}`]??0;return [(c>>16)&255,(c>>8)&255,c&255] as CycleColor;}):p.paletteSource>=.5?studioCyclePalette(studio,count):imageCyclePalette(data,width,height,count);
  const output=new Uint8ClampedArray(data);
  if(p.amount<=0)return {data:output,palette};
  const first=Math.max(0,Math.min(count-1,Math.round(p.firstColor)-1)),last=Math.max(first,Math.min(count-1,Math.round(p.lastColor)-1)),span=last-first+1;
  const cycle=mod(phase/(Math.PI*2)*Math.round(p.cycles)*(Math.round(p.speed*8)/8)+p.offset,1)*span;
  const lookup=new Int16Array(32768).fill(-1),map=Math.round(p.mapping),angle=p.angle*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const paletteAt=(index:number)=>{
    const t=mod(index-first+cycle,span),a=Math.floor(t+1e-9)%span,b=(a+1)%span,f=p.blend>=.5?Math.max(0,t-Math.floor(t+1e-9)):0;
    return palette[first+a].map((v,c)=>v*(1-f)+palette[first+b][c]*f) as CycleColor;
  };
  const moving=palette.map((_,i)=>paletteAt(i));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;if(!data[at+3])continue;
    let index:number;
    if(map===0){const bin=(data[at]>>3)*1024+(data[at+1]>>3)*32+(data[at+2]>>3);index=lookup[bin];if(index<0){const rgb:CycleColor=[(data[at]&248)+3.5,(data[at+1]&248)+3.5,(data[at+2]&248)+3.5];let best=Infinity;index=0;for(let j=0;j<count;j++){const d=distance(rgb,palette[j]);if(d<best){best=d;index=j;}}lookup[bin]=index;}}
    else {let t=0;if(map===1)t=(.2126*data[at]+.7152*data[at+1]+.0722*data[at+2])/255*p.bands;
      else if(map===2)t=((x+.5)/width*cos+(y+.5)/height*sin)*p.bands;
      else t=(Math.atan2(((y+.5)/height-p.centerY)*height,((x+.5)/width-p.centerX)*width)/(Math.PI*2)+.5)*Math.round(p.bands);
      index=Math.min(count-1,Math.floor(mod(t,1)*count+1e-9));}
    if(index<first||index>last)continue;
    for(let c=0;c<3;c++)output[at+c]=Math.round(data[at+c]*(1-p.amount)+moving[index][c]*p.amount);
  }
  return {data:output,palette};
}

// Derived UI swatches, never authored recipe state.
const palettes=new Map<string,CycleColor[]>(),listeners=new Map<string,Set<(p:CycleColor[])=>void>>();
export function publishCyclePalette(id:string,palette:CycleColor[]){const old=palettes.get(id);if(JSON.stringify(old)===JSON.stringify(palette))return;palettes.set(id,palette);if(palettes.size>24)palettes.delete(palettes.keys().next().value!);listeners.get(id)?.forEach(fn=>fn(palette));}
export function watchCyclePalette(id:string,fn:(p:CycleColor[])=>void){const set=listeners.get(id)??new Set();set.add(fn);listeners.set(id,set);const existing=palettes.get(id);if(existing)fn(existing);return()=>{set.delete(fn);if(!set.size)listeners.delete(id);};}

export function paletteLoopRepeats(recipe:Pick<StudioRecipe,"effects"|"processStage">){
  if(recipe.processStage==="form")return 1;
  let repeats=1;
  for(const e of recipe.effects)if(e.enabled&&(e.type==="palette-cycle"||e.type==="surface-motion")){
    const n=Math.round(Math.max(0,Math.min(4,e.parameters.speed??1))*8);
    const denominator=n===0?1:n%8===0?1:n%4===0?2:n%2===0?4:8;
    repeats=Math.max(repeats,denominator);
  }
  return repeats;
}
export function paletteLoopFrames(recipe:Pick<StudioRecipe,"effects"|"processStage"|"loopFrames">){return recipe.loopFrames*paletteLoopRepeats(recipe);}
