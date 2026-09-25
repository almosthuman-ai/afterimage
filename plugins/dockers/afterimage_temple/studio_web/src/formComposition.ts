export const formKinds=['Kone','Knot','Figure'] as const;
export type FormKind=typeof formKinds[number];
export const formMixControls=[
 ['formMix','Combine forms',0,1,1,0],
 ...formKinds.flatMap((kind,i)=>[
  [`formMix${kind}`,'In composition',0,1,1,0],[`formMix${kind}Seed`,'Seed',-1,2000000000,1,-1],[`formMix${kind}Visible`,'Visible',0,1,1,1],
  [`formMix${kind}X`,'Across',-.5,1.5,.01,.5],[`formMix${kind}Y`,'Down',-.5,1.5,.01,.5],
  [`formMix${kind}Scale`,'Size',.1,2,.01,1],[`formMix${kind}Turn`,'Turn',-180,180,1,0],
  [`formMix${kind}Opacity`,'Presence',0,1,.01,1],[`formMix${kind}Order`,'Order',0,2,1,i],
 ])
].map(([id,label,min,max,step,value])=>({id:String(id),label:String(label),description:String(label),min:Number(min),max:Number(max),step:Number(step),default:Number(value)}));
export const formMixDefaults=Object.fromEntries(formMixControls.map(c=>[c.id,c.default]));
export function selectedFormKind(p:Record<string,number>):FormKind{return (p.figureActive??0)>=.5?'Figure':(p.knotActive??0)>=.5?'Knot':'Kone';}
export function selectFormKind(p:Record<string,number>,kind:FormKind):Record<string,number>{return {...p,figureActive:kind==='Figure'?1:0,knotActive:kind==='Knot'?1:0,...((p.formMix??0)>=.5?{[`formMix${kind}`]:1}:{})};}
export type FormTile={width:number;height:number;data:Uint8ClampedArray};
// Recover coverage, including dark foreground, without chroma-keying artwork colors.
export function formMatte(dark:FormTile,light:FormTile):FormTile{
 const data=new Uint8ClampedArray(dark.data.length);
 for(let i=0;i<data.length;i+=4){const a=Math.max(0,Math.min(1,1-((light.data[i]-dark.data[i])+(light.data[i+1]-dark.data[i+1])+(light.data[i+2]-dark.data[i+2]))/765));
  if(a<1/255)continue;for(let k=0;k<3;k++)data[i+k]=Math.round(Math.max(0,Math.min(255,dark.data[i+k]/a)));data[i+3]=Math.round(a*255);
 }return {width:dark.width,height:dark.height,data};
}
export function composeFormTiles(w:number,h:number,tiles:Partial<Record<FormKind,FormTile>>,values:Record<string,number>,ground:number):Uint8ClampedArray{
 const p={...formMixDefaults,...values},out=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<out.length;i+=4)out.set([(ground>>16)&255,(ground>>8)&255,ground&255,255],i);
 for(const kind of [...formKinds].sort((a,b)=>p[`formMix${a}Order`]-p[`formMix${b}Order`])){
  const src=tiles[kind];if(!src||p[`formMix${kind}`]<.5||p[`formMix${kind}Visible`]<.5)continue;
  const scale=p[`formMix${kind}Scale`],theta=p[`formMix${kind}Turn`]*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),cx=w*p[`formMix${kind}X`],cy=h*p[`formMix${kind}Y`],opacity=p[`formMix${kind}Opacity`];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const dx=(x+.5-cx)/scale,dy=(y+.5-cy)/scale,sx=Math.floor((dx*c+dy*s)/w*src.width+src.width/2),sy=Math.floor((-dx*s+dy*c)/h*src.height+src.height/2);
   if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;const j=(sy*src.width+sx)*4,i=(y*w+x)*4,a=src.data[j+3]/255*opacity;
   for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]+(src.data[j+k]-out[i+k])*a);
  }
 }return out;
}
export function renderMixedForm(w:number,h:number,p:Record<string,number>,ground:number,render:(kind:FormKind,ground:number)=>HTMLCanvasElement):HTMLCanvasElement{
 const tiles:Partial<Record<FormKind,FormTile>>={};
 const tile=(canvas:HTMLCanvasElement):FormTile=>({width:canvas.width,height:canvas.height,data:canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data});
 for(const kind of formKinds)if((p[`formMix${kind}`]??0)>=.5&&(p[`formMix${kind}Visible`]??1)>=.5)tiles[kind]=formMatte(tile(render(kind,0)),tile(render(kind,0xffffff)));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d')!.putImageData(new ImageData(composeFormTiles(w,h,tiles,p,ground),w,h),0,0);return canvas;
}

export function blendFormTile(out:Uint8ClampedArray,w:number,h:number,src:FormTile,x:number,y:number,scale:number,turn:number,opacity:number):void {
 const theta=turn*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),cx=w*x,cy=h*y;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=(x+.5-cx)/scale,dy=(y+.5-cy)/scale,sx=Math.floor((dx*c+dy*s)/w*src.width+src.width/2),sy=Math.floor((-dx*s+dy*c)/h*src.height+src.height/2);
  if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;const j=(sy*src.width+sx)*4,i=(y*w+x)*4,a=src.data[j+3]/255*opacity;
  for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]+(src.data[j+k]-out[i+k])*a);
 }
}
