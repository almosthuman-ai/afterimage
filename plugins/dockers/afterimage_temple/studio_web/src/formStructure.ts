export const structureNames=['Original','Rows','Ring','Cluster','Procession','Nested','Opening'];
export const structureControls=[
 ['structureMode','Structure',0,6,1,0],['structureCount','Bodies',1,96,1,12],
 ['structureX','Across',0,1,.01,.5],['structureY','Down',0,1,.01,.5],
 ['structureWidth','Width',.1,1.6,.01,.85],['structureDepth','Depth',.1,1.6,.01,.75],
 ['structureSize','Body size',.2,2,.05,1],['structureVariation','Variation',0,1,.05,.12],
 ['structureTurn','Rotation',-180,180,1,0],['structureFollow','Follow path',0,1,1,0],
 ['structureBend','Bend / roundness',0,1,.05,.5],['structureMotion','Motion',0,1,.05,0],
 ['structureTogether','Together',0,1,.05,.8],
].map(([id,label,min,max,step,value])=>({id:String(id),label:String(label),description:String(label),min:Number(min),max:Number(max),step:Number(step),default:Number(value)}));
export const structureDefaults=Object.fromEntries(structureControls.map(c=>[c.id,c.default]));
export type StructureTile={width:number;height:number;data:Uint8ClampedArray};
export type StructureNode={id:number;x:number;y:number;size:number;angle:number};
export function structureHash(seed:number,n:number){const v=Math.sin(seed*.013+n*127.1)*43758.5453;return v-Math.floor(v);}
export function structureScene(w:number,h:number,values:Record<string,number>,seed:number,phase=0):StructureNode[]{
 phase=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);if(Math.min(phase,Math.PI*2-phase)<1e-6)phase=0;
 const p={...structureDefaults,...values},mode=p.structureMode,count=Math.round(p.structureCount),short=Math.min(w,h),width=p.structureWidth*w,depth=p.structureDepth*h,rotation=p.structureTurn*Math.PI/180,cs=Math.cos(rotation),sn=Math.sin(rotation),nodes:StructureNode[]=[];
 const cols=Math.ceil(Math.sqrt(count*w/h)),rows=Math.ceil(count/cols);
 for(let i=0;i<count;i++){
  const t=count===1?.5:i/(count-1),a=i*Math.PI*2/count,delay=i*1.71*(1-p.structureTogether),sway=(Math.sin(phase+delay)-Math.sin(delay))*p.structureMotion;
  let x=0,y=0,size=short*.85/Math.sqrt(count),angle=0;
  if(mode===1){const row=Math.floor(i/cols),col=i%cols,n=Math.min(cols,count-row*cols);x=(col+.5-n/2)*width/cols;y=(row+.5-rows/2)*depth/rows;size=Math.min(width/cols,depth/rows)*1.1;}
  if(mode===2){x=Math.cos(a)*width*.42;y=Math.sin(a)*depth*.42;size=short*.68/Math.sqrt(count);angle=a+Math.PI;}
  if(mode===3){const r=Math.sqrt((i+.5)/count),q=i*2.399963229728653;x=Math.cos(q)*r*width*.45;y=Math.sin(q)*r*depth*.45;size=short*.8/Math.sqrt(count);angle=q;}
  if(mode===4){const u=t+sway*.08;x=(u-.5)*width;y=Math.sin(u*Math.PI*2)*depth*p.structureBend*.4;size=Math.min(short*.4,width/Math.max(2,count)*1.65);angle=Math.atan2(Math.cos(u*Math.PI*2)*depth*p.structureBend*.4*Math.PI*2,width)+Math.PI/2;}
  if(mode===5){size=Math.min(width,depth)*(.95-.8*t);x=Math.sin(t*Math.PI*2)*width*.12*p.structureBend;y=Math.cos(t*Math.PI*2)*depth*.12*p.structureBend;angle=t*Math.PI*2*p.structureBend;}
  if(mode===6){const exponent=.2+.8*p.structureBend,point=(u:number)=>[Math.sign(Math.cos(u))*Math.pow(Math.abs(Math.cos(u)),exponent)*width*.4,Math.sign(Math.sin(u))*Math.pow(Math.abs(Math.sin(u)),exponent)*depth*.4];[x,y]=point(a);const next=point(a+.001);angle=Math.atan2(next[1]-y,next[0]-x)+Math.PI/2;size=short*.62/Math.sqrt(count);}
  x+=(structureHash(seed,i*3)-.5)*short*.16*p.structureVariation;y+=(structureHash(seed,i*3+1)-.5)*short*.16*p.structureVariation;
  const pulse=1+sway*.12;x*=pulse;y*=pulse;
  nodes.push({id:i,x:w*p.structureX+x*cs-y*sn,y:h*p.structureY+x*sn+y*cs,size:size*p.structureSize*(1+(structureHash(seed,i*3+2)-.5)*p.structureVariation*.6),angle:rotation+(p.structureFollow>=.5?angle:0)+sway*.3});
 }
 return nodes.sort((a,b)=>mode===5?b.size-a.size||a.id-b.id:a.y-b.y||a.id-b.id);
}
export function composeStructure(w:number,h:number,tiles:StructureTile[],nodes:StructureNode[],ground:number,indices?:number[]):Uint8ClampedArray{
 const out=new Uint8ClampedArray(w*h*4);for(let i=0;i<out.length;i+=4)out.set([(ground>>16)&255,(ground>>8)&255,ground&255,255],i);
 for(const node of nodes){const src=tiles[(indices?.[node.id]??node.id)%tiles.length],scale=node.size/Math.max(src.width,src.height),cs=Math.cos(node.angle),sn=Math.sin(node.angle),radius=node.size*.72;
  for(let y=Math.max(0,Math.floor(node.y-radius));y<Math.min(h,Math.ceil(node.y+radius));y++)for(let x=Math.max(0,Math.floor(node.x-radius));x<Math.min(w,Math.ceil(node.x+radius));x++){
   const dx=x-node.x,dy=y-node.y,sx=Math.floor((dx*cs+dy*sn)/scale+src.width/2),sy=Math.floor((-dx*sn+dy*cs)/scale+src.height/2);if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;
   const at=(sy*src.width+sx)*4,alpha=src.data[at+3]/255,to=(y*w+x)*4;for(let c=0;c<3;c++)out[to+c]=Math.round(out[to+c]+(src.data[at+c]-out[to+c])*alpha);
  }
 }return out;
}

export function trimStructureTile(src:StructureTile):StructureTile{
 let left=src.width,top=src.height,right=-1,bottom=-1;for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++)if(src.data[(y*src.width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)return {width:1,height:1,data:new Uint8ClampedArray(4)};
 left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(src.width-1,right+2);bottom=Math.min(src.height-1,bottom+2);const width=right-left+1,height=bottom-top+1,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)data.set(src.data.subarray(((y+top)*src.width+left)*4,((y+top)*src.width+left+width)*4),y*width*4);return {width,height,data};
}
