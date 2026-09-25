import {emojiTiles} from './emojiPattern';
import {figureSkeleton,figureBodyIds,actionFit} from './figureSkeleton';
export {figurePoses,figureNames,figureSkeleton,figureBodyIds,actionFit} from './figureSkeleton';
import {groupControls,renderGroup} from './figureGroups';
import {symbolField} from './symbolField';
import symbolAtlas from './symbol-atlas.json';
// Original pose studies and a source-preserving figure/shape compositor.
export const figureControls = [
  ["figureActive", "Figure / Shapes", 0, 1, 1, 0],
  ["figureSource", "Figure material", 0, 2, 1, 0],
  ["figurePose", "Gesture", 0, 23, 1, 0],
  ["figureStyle", "Body", 0, 1, 1, 0],
  ["figureAction", "Action", 0, 2, 1, 0],
  ["figureWeight", "Weight", 0, 1, .01, .5],
  ["figureHead", "Head size", .5, 1.8, .05, 1],
  ["figureBuild", "Body width", .5, 1.8, .05, 1],
  ["figureArms", "Arm length", .5, 1.7, .05, 1],
  ["figureLegs", "Leg length", .5, 1.7, .05, 1],
  ["figureLean", "Lean", -.5, .5, .05, 0],
  ["figureGesture", "Restlessness", 0, 1, .05, 0],
  ["figureGestureSeed", "Gesture seed", 0, 2000000000, 1, 0],
  ["fieldCast", "Cast", 0, 1, 1, 0],
  ["symbolIndex", "Symbol", 0, 11, 1, 0],
  ["symbolField", "Arrangement", 0, 5, 1, 0],
  ["fieldDensity", "Across", 3, 48, 1, 14],
  ["fieldSize", "Mark size", .015, .5, .005, .13],
  ["fieldVariation", "Size variety", 0, 1, .05, .7],
  ["fieldScatter", "Scatter", 0, 2, .05, .6],
  ["fieldTurn", "Spin", 0, 1, .05, .35],
  ["fieldFlow", "Flow scale", .3, 8, .1, 2],
  ["fieldMix", "Mix symbols", 0, 1, 1, 0],
  ["emojiCount", "Selected emoji", 0, 64, 1, 0], ["emojiPattern", "Pattern", 0, 4, 1, 0], ["emojiRarity", "Intruders", 0, .5, .01, .06],
  ...Array.from({length:64},(_,i)=>[`emojiWeight${i}`,"Proportion",1,10,1,1]),
  ["fieldInk", "Color", 0, 1, 1, 0],
  ["fieldMotion", "Motion", 0, 1, .05, .35],
  ["figureX", "Across", 0, 1, .01, .5], ["figureY", "Down", 0, 1, .01, .5],
  ["figureScale", "Size", .15, 1.6, .01, .88], ["figureTurn", "Turn", -180, 180, 1, 0],
  ["figurePresence", "Body presence", 0, 1, .01, .9],
  ...[1, 2].flatMap(n => [
    [`window${n}On`, "Visible", 0, 1, 1, 1], [`window${n}Shape`, "Shape", 0, 1, 1, n - 1],
    [`window${n}X`, "Across", 0, 1, .01, n === 1 ? .4 : .64], [`window${n}Y`, "Down", 0, 1, .01, n === 1 ? .4 : .62],
    [`window${n}Width`, "Width", .05, 1.2, .01, n === 1 ? .48 : .44], [`window${n}Height`, "Height", .05, 1.2, .01, n === 1 ? .46 : .54],
    [`window${n}Turn`, "Turn", -180, 180, 1, n === 1 ? -9 : 18],
    [`window${n}Material`, "Inside", 0, 2, 1, n === 1 ? 1 : 0], [`window${n}Opacity`, "Presence", 0, 1, .01, .8],
  ]),
  ["contourOn", "Contour", 0, 1, 1, 1], ["contourX", "Across", -.5, .5, .01, .065],
  ["contourY", "Down", -.5, .5, .01, -.035], ["contourWander", "Wander", 0, .25, .005, .025],
  ["contourWidth", "Line width", .001, .016, .001, .002],
  ["contourDetail", "Inner detail", 0, 1, .01, .35],
  ["orbitOn", "Travelling line", 0, 1, 1, 1], ["orbitX", "Across", 0, 1, .01, .5],
  ["orbitY", "Down", 0, 1, .01, .48], ["orbitWidth", "Reach", .1, 1.4, .01, .8],
  ["orbitHeight", "Height", .05, 1.2, .01, .44], ["orbitTurn", "Turn", -180, 180, 1, -28],
  ["orbitOpening", "Opening", .1, 1, .01, .84], ["orbitBend", "Bend", 0, .4, .01, .1],
].map(([id,label,min,max,step,value]) => ({id:String(id),label:String(label),description:String(label),min:Number(min),max:Number(max),step:Number(step),default:Number(value)})).concat(groupControls);
export const figureDefaults = Object.fromEntries(figureControls.map(p => [p.id,p.default]));
export type FigureRaster = {width:number;height:number;data:Uint8ClampedArray};
export const symbolNames=symbolAtlas.map(s=>s.name);
const symbolCache=new Map<number,FigureRaster>();
export function symbolStudy(index:number):FigureRaster {
  index=Math.max(0,Math.min(symbolAtlas.length-1,Math.round(index)));
  const cached=symbolCache.get(index);if(cached)return cached;
  const entry=symbolAtlas[index],raw=atob(entry.rgba),data=Uint8ClampedArray.from(raw,c=>c.charCodeAt(0));
  const raster={width:entry.width,height:entry.height,data};symbolCache.set(index,raster);return raster;
}
const poseCache=new Map<string,FigureRaster>();
export function figureStudy(pose:number,style=0,values:Record<string,number>={},phase=0):FigureRaster {
  const p={...figureDefaults,...values},key=[p.figureAction>0?0:pose,style,...figureBodyIds.map(id=>p[id]),p.figureGestureSeed,p.figureAction,p.figureWeight,p.figureAction>0?Math.round(((phase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))*1000000):0].join(':'),cached=poseCache.get(key);if(cached)return cached;
  const width=320,height=480,data=new Uint8ClampedArray(width*height*4),q=figureSkeleton(pose,p,phase);
  const bones=[[1,2,.047,.045],[1,5,.047,.045],[2,3,.041,.029],[3,4,.029,.018],[5,6,.041,.029],[6,7,.029,.018],[1,8,.069,.082],[8,9,.061,.039],[9,10,.039,.022],[8,11,.061,.039],[11,12,.039,.022]];
  const point=(x:number,y:number)=>{q.push(x,y);return q.length/2-1;};
  for(const [elbow,wrist] of [[3,4],[6,7]]){
    const angle=Math.atan2(q[wrist*2+1]-q[elbow*2+1],q[wrist*2]-q[elbow*2]),cx=q[wrist*2]+Math.cos(angle)*.028,cy=q[wrist*2+1]+Math.sin(angle)*.028,palm=point(cx,cy);
    bones.push([wrist,palm,.02,.018]);
    for(let f=0;f<(style>=.5?0:5);f++){const fan=angle+(f-2)*.3,length=f===0?.024:f===4?.032:.044,root=point(cx+Math.cos(angle+Math.PI/2)*(f-2)*.007,cy+Math.sin(angle+Math.PI/2)*(f-2)*.007),tip=point(q[root*2]+Math.cos(fan)*length,q[root*2+1]+Math.sin(fan)*length);bones.push([root,tip,.0055,.003]);}
  }
  for(const [knee,ankle] of [[9,10],[11,12]]){const side=p.figureAction===1?1:q[ankle*2]<q[knee*2]?-1:1,toe=point(q[ankle*2]+side*.055,q[ankle*2+1]+.012);bones.push([ankle,toe,.025,.015]);}
  let fit=1;
  if(p.figureAction>0){
    fit=actionFit(p);for(let j=0;j<q.length;j++)q[j]=.5+(q[j]-.5)*fit;
  }else if(figureBodyIds.some(id=>p[id]!==figureDefaults[id])){
    let reach=0;for(const value of q)reach=Math.max(reach,Math.abs(value-.5));
    fit=Math.min(1,.46/(reach+.09*Math.max(p.figureHead,p.figureBuild)));
    for(let j=0;j<q.length;j++)q[j]=.5+(q[j]-.5)*fit;
  }
  for(const bone of bones){bone[2]*=p.figureBuild*fit;bone[3]*=p.figureBuild*fit;}
  const distance=new Float64Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)distance[y*width+x]=(Math.hypot(((x+.5)/width-q[0])/((style>=.5?.075:.068)*p.figureHead*fit),((y+.5)/height-q[1])/((style>=.5?.05:.085)*p.figureHead*fit))-1)*.068;
  // Only pixels inside a bone's possible coverage need its distance calculation.
  for(const [a,b,ra,rb] of bones){
    const ax=q[a*2],ay=q[a*2+1],bx=q[b*2],by=q[b*2+1],dx=bx-ax,dy=by-ay,radius=Math.max(ra,rb)+1/width;
    const x0=Math.max(0,Math.floor((Math.min(ax,bx)-radius)*width)),x1=Math.min(width,Math.ceil((Math.max(ax,bx)+radius)*width));
    const y0=Math.max(0,Math.floor((Math.min(ay,by)-radius)*height)),y1=Math.min(height,Math.ceil((Math.max(ay,by)+radius)*height));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const u=(x+.5)/width,v=(y+.5)/height,t=Math.max(0,Math.min(1,((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy)));distance[y*width+x]=Math.min(distance[y*width+x],Math.hypot(u-ax-dx*t,v-ay-dy*t)-(ra+(rb-ra)*t));}
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height,d=distance[y*width+x];
    const i=(y*width+x)*4,shade=style>=.5?255:Math.round(155+75*u+20*Math.sin(v*14));data.set([shade,shade,shade,Math.round(Math.max(0,Math.min(1,.5-d*width))*255)],i);
  }const result={width,height,data};if(poseCache.size>=64)poseCache.delete(poseCache.keys().next().value!);poseCache.set(key,result);return result;
}
export function composeFigure(source:FigureRaster,width:number,height:number,values:Record<string,number>,palette:readonly number[],seed:number):Uint8ClampedArray {
  const p={...figureDefaults,...values},short=Math.min(width,height), sw=source.width,sh=source.height;
  const result=new Uint8ClampedArray(width*height*4), edge=new Float32Array(sw*sh), rgb=palette.map(c=>[(c>>16)&255,(c>>8)&255,c&255]);
  const pix=(x:number,y:number)=>x<0||y<0||x>=sw||y>=sh?0:source.data[(Math.floor(y)*sw+Math.floor(x))*4+3]/255;
  const radius=Math.max(1,Math.round(p.contourWidth*Math.max(sw,sh)/p.figureScale));
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
    const a=pix(x,y);let contrast=0;
    for(const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius]])contrast=Math.max(contrast,Math.abs(a-pix(x+dx,y+dy)));
    if(a>.05 && p.contourDetail>0) {
      const i=(y*sw+x)*4,luma=(source.data[i]*.2126+source.data[i+1]*.7152+source.data[i+2]*.0722)/255;
      for(const [dx,dy] of [[radius,0],[0,radius]]){const nx=x+dx,ny=y+dy;if(nx>=sw||ny>=sh)continue;const j=(ny*sw+nx)*4,other=(source.data[j]*.2126+source.data[j+1]*.7152+source.data[j+2]*.0722)/255;contrast=Math.max(contrast,Math.max(0,Math.min(1,(Math.abs(luma-other)-(.32*(1-p.contourDetail)))*6))*Math.min(a,pix(nx,ny)));}
    }
    edge[y*sw+x]=contrast;
  }
  const scale=short*p.figureScale/Math.max(sw,sh),angle=p.figureTurn*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  const at=(x:number,y:number)=>{const dx=x-width*p.figureX,dy=y-height*p.figureY;const sx=Math.floor((dx*cs+dy*sn)/scale+sw/2),sy=Math.floor((-dx*sn+dy*cs)/scale+sh/2);return sx<0||sy<0||sx>=sw||sy>=sh?-1:sy*sw+sx;};
  const windows=[1,2].map(n=>{const a=p[`window${n}Turn`]*Math.PI/180;return {n,c:Math.cos(a),s:Math.sin(a)};});
  const oa=p.orbitTurn*Math.PI/180,oc=Math.cos(oa),os=Math.sin(oa),phase=(seed%1000)*.006283185;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;let r=rgb[3][0],g=rgb[3][1],b=rgb[3][2];
    const blend=(color:ArrayLike<number>,a:number)=>{r+=(color[0]-r)*a;g+=(color[1]-g)*a;b+=(color[2]-b)*a;};
    const dx=(x-width*p.orbitX)/short,dy=(y-height*p.orbitY)/short,ox=dx*oc+dy*os,oy=-dx*os+dy*oc;
    const theta=Math.atan2(oy/(p.orbitHeight*.5),ox/(p.orbitWidth*.5));
    const orbitDistance=Math.abs(Math.hypot(ox/(p.orbitWidth*.5),oy/(p.orbitHeight*.5))-(1+p.orbitBend*Math.sin(theta*3+phase)))*short*Math.min(p.orbitWidth,p.orbitHeight)*.5;
    const orbit=p.orbitOn>=.5&&(theta+Math.PI)/(Math.PI*2)<=p.orbitOpening?Math.max(0,Math.min(1,Math.max(.55,p.contourWidth*short*.5)+.5-orbitDistance)):0;
    if(orbit>0&&oy<0)blend(rgb[2],orbit);
    const a=at(x,y),alpha=a<0?0:source.data[a*4+3]/255;
    if(a>=0){const shade=source.data[a*4]/255;blend(p.figureSource>=.5?source.data.subarray(a*4,a*4+3):rgb[0].map(c=>c*(.55+shade*.45)),alpha*p.figurePresence);}
    for(const {n,c,s} of windows){if(p[`window${n}On`]<.5)continue;
      const dx=(x-width*p[`window${n}X`])/short,dy=(y-height*p[`window${n}Y`])/short,u=(dx*c+dy*s)/(p[`window${n}Width`]/2),v=(-dx*s+dy*c)/(p[`window${n}Height`]/2);
      const distance=p[`window${n}Shape`]>=.5?Math.hypot(u,v):Math.max(Math.abs(u),Math.abs(v));
      const boundary=(1-distance)*short*Math.min(p[`window${n}Width`],p[`window${n}Height`])*.5,coverage=Math.max(0,Math.min(1,boundary+.5));
      if(boundary < -Math.max(1,p.contourWidth*short))continue;
      const opacity=p[`window${n}Opacity`]*coverage,ink=rgb[n===1?1:2];blend(ink,opacity*.22);
      if(a>=0){const material=p[`window${n}Material`];if(material===1){blend(rgb[3],alpha*opacity);blend(ink,edge[a]*opacity);}else if(material===2)blend([255-source.data[a*4],255-source.data[a*4+1],255-source.data[a*4+2]],alpha*opacity);else blend(ink,alpha*opacity);}
      const border=Math.max(0,Math.min(1,Math.max(.55,p.contourWidth*short*.5)+.5-Math.abs(boundary)));
      if(border>0)blend(ink,p[`window${n}Opacity`]*border);
    }
    if(p.contourOn>=.5){const a=at(x-width*p.contourX-short*p.contourWander*Math.sin(y/short*9+phase),y-height*p.contourY);if(a>=0)blend(rgb[2],edge[a]);}
    if(orbit>0&&oy>=0)blend(rgb[2],orbit);
    result[i]=Math.round(r);result[i+1]=Math.round(g);result[i+2]=Math.round(b);result[i+3]=255;
  }return result;
}
export function renderFigure(width:number,height:number,p:Record<string,number>,palette:readonly number[],seed:number,image:HTMLImageElement|null,phase=0){
  if((p.symbolField??0)>=2){const out=document.createElement('canvas');out.width=width;out.height=height;out.getContext('2d')!.putImageData(new ImageData(renderGroup(width,height,p,palette,seed,phase),width,height),0,0);return out;}
  let source=p.figureSource===2?symbolStudy(p.symbolIndex??0):figureStudy(p.figurePose??0,p.figureStyle??0,p,phase);
  if(p.figureSource===1){
    if(!image){const out=document.createElement('canvas');out.width=width;out.height=height;const c=out.getContext('2d')!;c.fillStyle='#f2eee5';c.fillRect(0,0,width,height);c.fillStyle='#302b29';c.font='16px sans-serif';c.fillText('Figure image unavailable. Import a figure or choose Pose.',20,height/2,width-40);return out;}
    const s=document.createElement('canvas'),scale=(p.emojiCount??0)>0?1:Math.min(1,Math.max(900,width,height)/Math.max(image.naturalWidth,image.naturalHeight));s.width=Math.max(1,Math.round(image.naturalWidth*scale));s.height=Math.max(1,Math.round(image.naturalHeight*scale));const c=s.getContext('2d')!;c.drawImage(image,0,0,s.width,s.height);source={width:s.width,height:s.height,data:c.getImageData(0,0,s.width,s.height).data};
  }
  if(p.figureSource===1&&(p.emojiCount??0)>0&&(p.symbolField??0)<.5)source=emojiTiles(source,Math.round(p.emojiCount))[0];
  const out=document.createElement('canvas');out.width=width;out.height=height;out.getContext('2d')!.putImageData(new ImageData((p.symbolField??0)>=.5?symbolField(source,width,height,p,palette,seed,phase):composeFigure(source,width,height,p,palette,seed),width,height),0,0);return out;
}
