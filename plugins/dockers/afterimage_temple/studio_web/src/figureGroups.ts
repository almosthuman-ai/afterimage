import {figureSkeleton} from './figureSkeleton';

export const groupControls = [
  ['danceCount','People',3,9,1,5],['rowsCount','People',3,80,1,35],['ringCount','People',3,30,1,9],['clusterCount','People',3,80,1,27],
  ['groupX','Across',0,1,.01,.5],['groupY','Down',0,1,.01,.52],
  ['groupSpread','Width',.25,1.5,.01,.9],['groupDepth','Depth',.15,1.2,.01,.5],
  ['groupPresence','Presence',0,1,.05,1],['groupSize','Body size',.4,1.7,.05,1],['groupVariation','Variation',0,1,.05,.18],
  ['groupPose','Shared pose',0,23,1,18],['danceLean','Lean',-.7,.7,.05,.2],
  ['danceContact','Hand contact',0,1,.05,1],['danceOpening','Opening',0,1,.05,0],
  ['groupGround','Ground',0,1,1,1],['groupHorizon','Ground height',0,1,.01,.6],['groupGroundCurve','Ground curve',-.5,.5,.02,.12],
  ['groupHole','Hole size',0,1,.05,0],['groupPull','Inward pull',0,1,.05,0],
  ['groupMotion','Motion',0,1,.05,.3],['groupTogether','Together',0,1,.05,.85],
  ['groupException','One different',0,1,1,0],['groupSelected','Selected figure',-1,79,1,-1],
  ['groupAccent','Different color',0,1,1,1],['groupPoseDifferent','Different pose',0,1,1,0],['groupSoloPose','Individual pose',0,23,1,2],
  ['groupMirror','Mirror',0,1,1,0],['groupSoloTurn','Turn',-180,180,1,0],['groupSoloScale','Size',.3,2,.05,1],
  ['groupStill','Stay still',0,1,1,0],['groupMissing','Missing',0,1,1,0],
].map(([id,label,min,max,step,value])=>({id:String(id),label:String(label),description:String(label),min:Number(min),max:Number(max),step:Number(step),default:Number(value)}));
export const groupDefaults=Object.fromEntries(groupControls.map(c=>[c.id,c.default]));
type Segment=[number,number,number,number,number,number];
export type GroupPerson={id:number;x:number;y:number;size:number;q:number[];segments:Segment[];head:[number,number,number,number];accent:boolean;missing:boolean;still:boolean;different:boolean};
export const groupCountKey=(mode:number)=>['','','danceCount','rowsCount','ringCount','clusterCount'][mode]??'danceCount';
const tau=Math.PI*2;
export function groupHash(seed:number,n:number){const v=Math.sin(seed*.013+n*127.1)*43758.5453;return v-Math.floor(v);}

export function groupScene(width:number,height:number,values:Record<string,number>,seed:number,phase=0):GroupPerson[]{
  const p={...groupDefaults,...values},mode=p.symbolField,short=Math.min(width,height),aspect=width/short,vertical=height/short;
  const count=Math.round(p[groupCountKey(mode)]),spread=p.groupSpread*aspect,depth=p.groupDepth*vertical,cx=aspect*p.groupX,cy=vertical*p.groupY;
  const nodes:{x:number;y:number;size:number;id:number}[]=[];
  const cols=Math.ceil(Math.sqrt(count*aspect/vertical*1.15)),rows=Math.ceil(count/cols);
  for(let i=0;i<count;i++){
    let x=0,y=0,size=0;
    if(mode===2||mode===4){const gap=mode===2?p.danceOpening*Math.PI*.9:0,angle=Math.PI/2+gap/2+(mode===4?Math.max(0,i-1):i)*(tau-gap)/(mode===4?count-1:count);
      x=mode===4&&i===0?0:Math.cos(angle)*spread*.43;y=mode===4&&i===0?0:Math.sin(angle)*depth*.43;
      size=(mode===2?.54*Math.sqrt(5/count):.4*Math.sqrt(9/count))*(1+.12*Math.sin(angle));
    }else if(mode===3){const row=Math.floor(i/cols),col=i%cols;const inRow=Math.min(cols,count-row*cols);x=(col+.5-inRow/2+(row%2)*.25)*spread/cols;y=((row+.5)/rows-.5)*depth;size=Math.min(spread/cols*1.55,depth/rows*1.65);
    }else{const angle=i*2.399963229728653,radius=Math.sqrt((i+.5)/count);x=Math.cos(angle)*radius*spread*.47;y=Math.sin(angle)*radius*depth*.47;size=.28*Math.sqrt(27/count);}
    x+=(groupHash(seed,i*3)-.5)*.08*p.groupVariation;y+=(groupHash(seed,i*3+1)-.5)*.07*p.groupVariation;
    nodes.push({id:i,x:cx+x*(1-p.groupPull*.55),y:cy+y*(1-p.groupPull*.55),size:size*p.groupSize*(1+(groupHash(seed,i*3+2)-.5)*p.groupVariation*.35)});
  }
  const focus=p.groupSelected<0?nodes.reduce((best,node)=>Math.hypot(node.x-cx,node.y-cy)<Math.hypot(best.x-cx,best.y-cy)?node:best).id:Math.min(count-1,Math.round(p.groupSelected));
  const people:GroupPerson[]=nodes.map(node=>{
    const i=node.id,selected=p.groupException>=.5&&i===focus,still=selected&&p.groupStill>=.5,different=selected&&p.groupPoseDifferent>=.5;
    const time=still?0:phase,offset=i*1.73*(1-p.groupTogether),sway=(Math.sin(time+offset)-Math.sin(offset))*p.groupMotion;
    const pose=different?p.groupSoloPose:mode===2?[2,21,0,20,14,11,3,2,21][i%9]:p.groupPose;
    const skeleton=figureSkeleton(pose,{...p,figureGesture:0}),size=node.size*(selected?p.groupSoloScale:1),q:number[]=[];
    const angle=(mode===2?p.danceLean*Math.sin(i*1.7):0)+(groupHash(seed,i+701)-.5)*p.groupVariation*.35+sway*.12+(selected?p.groupSoloTurn*Math.PI/180:0);
    const cs=Math.cos(angle),sn=Math.sin(angle),mirror=selected&&p.groupMirror>=.5?-1:1;
    const x=node.x+sway*.025,y=node.y+sway*.012;
    for(let j=0;j<13;j++){const dx=(skeleton[j*2]-skeleton[16])*size*.75*mirror,dy=(skeleton[j*2+1]-skeleton[17])*size;q.push(x+dx*cs-dy*sn,y+dx*sn+dy*cs);}
    return {id:i,x,y,size,q,segments:[],head:[0,0,0,0],accent:selected&&p.groupAccent>=.5,missing:selected&&p.groupMissing>=.5,still,different};
  });
  if(mode===2){
    // Each edge has one shared hand point. Moving bodies reach the same point rather than being joined by a line.
    const joints=people.map((a,i)=>{const b=people[(i+1)%count];return a.still?[a.q[14],a.q[15]]:b.still?[b.q[8],b.q[9]]:[(a.x+b.x)/2,(a.y+b.y)/2-Math.min(a.size,b.size)*.25];});
    for(let i=0;i<count;i++){
      const person=people[i];if(person.still||person.different)continue;
      for(const [shoulder,elbow,wrist,edge] of [[2,3,4,(i+count-1)%count],[5,6,7,i]]){
        const contact=p.danceContact*(edge===count-1?1-p.danceOpening:1),target=joints[edge];
        person.q[wrist*2]+=(target[0]-person.q[wrist*2])*contact;person.q[wrist*2+1]+=(target[1]-person.q[wrist*2+1])*contact;
        const ax=person.q[shoulder*2],ay=person.q[shoulder*2+1],bx=person.q[wrist*2],by=person.q[wrist*2+1];
        person.q[elbow*2]=(ax+bx)/2;person.q[elbow*2+1]=(ay+by)/2+person.size*.06*Math.sin(i*2.3+edge);
      }
    }
  }
  for(const person of people){
    const {q,size}=person,build=(p.figureBuild??1),r=size*build;
    const segment=(a:number,b:number,ra:number,rb:number)=>person.segments.push([q[a*2],q[a*2+1],q[b*2],q[b*2+1],r*ra,r*rb]);
    const curve=(a:number,m:number,b:number,ra:number,rb:number)=>{let px=q[a*2],py=q[a*2+1];for(let k=1;k<=10;k++){const t=k/10,u=1-t,x=u*u*q[a*2]+2*u*t*q[m*2]+t*t*q[b*2],y=u*u*q[a*2+1]+2*u*t*q[m*2+1]+t*t*q[b*2+1];person.segments.push([px,py,x,y,r*(ra+(rb-ra)*(k-1)/10),r*(ra+(rb-ra)*t)]);px=x;py=y;}};
    segment(0,1,.018,.024);segment(1,8,.033,.048);segment(2,5,.025,.025);
    curve(2,3,4,.022,.012);curve(5,6,7,.022,.012);curve(8,9,10,.035,.015);curve(8,11,12,.035,.015);
    for(const ankle of [10,12])person.segments.push([q[ankle*2],q[ankle*2+1],q[ankle*2]+size*.04*(q[ankle*2]<person.x?-1:1),q[ankle*2+1]+size*.007,r*.017,r*.01]);
    const head=(p.figureHead??1);person.head=[q[0],q[1],size*.047*head,size*.061*head];
  }
  return people;
}

export function groupPick(width:number,height:number,p:Record<string,number>,seed:number,x:number,y:number,phase=0){
  const short=Math.min(width,height),px=x*width/short,py=y*height/short,people=groupScene(width,height,p,seed,phase);
  return people.reduce((best,person)=>Math.hypot(person.x-px,person.y-person.size*.17-py)<Math.hypot(best.x-px,best.y-best.size*.17-py)?person:best).id;
}

export function renderGroup(width:number,height:number,values:Record<string,number>,palette:readonly number[],seed:number,phase=0):Uint8ClampedArray{
  const p={...groupDefaults,...values},short=Math.min(width,height),out=new Uint8ClampedArray(width*height*4),rgb=palette.map(c=>[(c>>16)&255,(c>>8)&255,c&255]);
  const holeX=width*p.groupX,holeY=height*p.groupY,rx=width*p.groupSpread*p.groupHole*.36,ry=height*p.groupDepth*p.groupHole*.36;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const horizon=height*(p.groupHorizon+p.groupGroundCurve*((x/width-.5)**2*4-.5)),ground=p.groupGround>=.5&&y>=horizon;
    const ink=ground?rgb[1]:rgb[3],i=(y*width+x)*4;out.set([...ink,255],i);
    if(rx>0&&ry>0){const d=Math.hypot((x-holeX)/rx,(y-holeY)/ry);if(d<1)for(let k=0;k<3;k++)out[i+k]=Math.round(rgb[3][k]*.16);}
  }
  const people=groupScene(width,height,p,seed,phase).sort((a,b)=>a.y-b.y||a.id-b.id);
  for(const person of people){if(person.missing)continue;
    const hx=person.head[0]*short,hy=person.head[1]*short,hrx=person.head[2]*short,hry=person.head[3]*short;
    const segments=person.segments.map(s=>s.map(v=>v*short));
    let left=hx-hrx-1,right=hx+hrx+1,top=hy-hry-1,bottom=hy+hry+1;
    for(const [ax,ay,bx,by,ra,rb]of segments){const r=Math.max(ra,rb)+1;left=Math.min(left,ax-r,bx-r);right=Math.max(right,ax+r,bx+r);top=Math.min(top,ay-r,by-r);bottom=Math.max(bottom,ay+r,by+r);}
    const x0=Math.max(0,Math.floor(left)),x1=Math.min(width,Math.ceil(right)),y0=Math.max(0,Math.floor(top)),y1=Math.min(height,Math.ceil(bottom)),bw=x1-x0,bh=y1-y0;if(bw<=0||bh<=0)continue;
    const distance=new Float64Array(bw*bh);distance.fill(1e9);
    for(let y=Math.max(y0,Math.floor(hy-hry-1));y<Math.min(y1,Math.ceil(hy+hry+1));y++)for(let x=Math.max(x0,Math.floor(hx-hrx-1));x<Math.min(x1,Math.ceil(hx+hrx+1));x++)distance[(y-y0)*bw+x-x0]=(Math.hypot((x+.5-hx)/hrx,(y+.5-hy)/hry)-1)*Math.min(hrx,hry);
    for(const [ax,ay,bx,by,ra,rb]of segments){const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,r=Math.max(ra,rb)+1;
      for(let y=Math.max(y0,Math.floor(Math.min(ay,by)-r));y<Math.min(y1,Math.ceil(Math.max(ay,by)+r));y++)for(let x=Math.max(x0,Math.floor(Math.min(ax,bx)-r));x<Math.min(x1,Math.ceil(Math.max(ax,bx)+r));x++){
        const t=len>1e-16?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/len)):0,d=Math.hypot(x+.5-ax-dx*t,y+.5-ay-dy*t)-(ra+(rb-ra)*t),i=(y-y0)*bw+x-x0;distance[i]=Math.min(distance[i],d);
      }
    }
    const ink=rgb[person.accent?2:0],sinking=p.groupPull>0&&rx>0&&ry>0&&Math.hypot((person.x*short-holeX)/rx,(person.y*short-holeY)/ry)<1;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){let alpha=Math.max(0,Math.min(1,.5-distance[(y-y0)*bw+x-x0]))*p.groupPresence;
      if(sinking&&y>=holeY)alpha=0;
      if(alpha===0)continue;const i=(y*width+x)*4;for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]+(ink[k]-out[i+k])*alpha);
    }
  }return out;
}
