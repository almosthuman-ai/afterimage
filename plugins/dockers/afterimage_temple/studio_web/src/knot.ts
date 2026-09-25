// Original geometric Double Happiness and interlace studies, shared with Knot.pde.
export type KnotValues = Record<string, number>;
export const knotControls = [
  { id: "knotTrace", label: "Trace", min: 0, max: 1, step: 1, default: 1, choices: ["Off", "On"] },
  { id: "knotShape", label: "Silhouette", min: 0, max: 7, step: 1, default: 0, choices: ["Looped interlace", "Double Happiness", "Trinity study", "Fourfold study", "Double Coin study", "Pan Chang lattice study", "Flower-loop study", "Single loop"] },
  { id: "knotMaterial", label: "Construction", min: 0, max: 6, step: 1, default: 0, choices: ["Ribbons", "Fill with knots", "Fill with Double Happiness", "Fill with ASCII", "Text along strands", "Woven strokes", "Fill with text"] },
  { id: "knotRotation", label: "Rotation (degrees)", min: -180, max: 180, step: 1, default: 0 },
  { id: "knotScale", label: "Body size", min: .3, max: 1.2, step: .01, default: .85 },
  { id: "knotWidth", label: "Ribbon width", min: .002, max: .12, step: .0005, default: .045 },
  { id: "knotWeaveSpread", label: "Weave spread", min: 0, max: 2, step: .005, default: 1 },
  { id: "knotFillSize", label: "Fill size", min: .1, max: 1.5, step: .005, default: 1 },
  { id: "knotTurns", label: "Interweaving", min: 2, max: 9, step: 1, default: 3 },
  { id: "knotSpacing", label: "Fill spacing", min: .01, max: .14, step: .0005, default: .055 },
  { id: "knotLife", label: "Deformation", min: 0, max: 1, step: .01, default: 0 },
  { id: "knotStretch", label: "Stretch", min: -1, max: 1, step: .005, default: 0 },
  { id: "knotBend", label: "Bend", min: -1, max: 1, step: .005, default: 0 },
  { id: "knotTwist", label: "Twist", min: -1, max: 1, step: .005, default: 0 },
  { id: "knotRipple", label: "Ripple", min: 0, max: 1, step: .005, default: 0 },
  { id: "knotMemory", label: "Echo copies", min: 0, max: 6, step: 1, default: 0 },
  { id: "knotAbundance", label: "Fill density / spread", min: 0, max: 1, step: .01, default: 0 },
  { id: "knotImpossible", label: "Crossing accent", min: 0, max: 1, step: .01, default: 0 },
  { id: "knotMotion", label: "Motion amount", min: 0, max: 1, step: .01, default: 0 },
  { id: "knotFillShape", label: "Fill shape", min: -1, max: 7, step: 1, default: -1 },
  { id: "knotMix", label: "Two shapes", min: 0, max: 1, step: 1, default: 0 },
  { id: "knotSecondShape", label: "Second shape", min: 0, max: 7, step: 1, default: 7 },
  { id: "knotRelativeSize", label: "Relative size", min: .3, max: 1.5, step: .005, default: 1 },
  { id: "knotSeparation", label: "Separation", min: -.7, max: .7, step: .005, default: 0 },
  { id: "knotCrossingOrder", label: "Crossing order", min: 0, max: 2, step: 1, default: 2 },
  { id: "knotConnected", label: "Arrangement", min: 0, max: 4, step: 1, default: 0 },
  { id: "knotContactPosition", label: "Contact position", min: 0, max: 1, step: .005, default: 0 },
  { id: "knotContactLength", label: "Contact length", min: .02, max: .4, step: .005, default: .12 },
  { id: "knotConnectionLength", label: "Connection length", min: .02, max: .4, step: .005, default: .12 },
  { id: "knotAttachment", label: "Attachment position", min: -1, max: 1, step: .01, default: 0 },
  { id: "knotThreadCount", label: "Thread count", min: 1, max: 32, step: 1, default: 12 },
  { id: "knotThreadLength", label: "Thread length", min: .08, max: .9, step: .005, default: .5 },
  { id: "knotThreadSpread", label: "Thread spread", min: 0, max: .7, step: .005, default: .22 },
  { id: "knotThreadWidth", label: "Thread width", min: .001, max: .02, step: .0005, default: .003 },
  { id: "knotThreadSway", label: "Thread sway", min: 0, max: 1, step: .005, default: .45 },
  { id: "knotThreadMode", label: "Threads", min: 0, max: 2, step: 1, default: 0 },
  { id: "knotThreadTextSize", label: "Thread text size", min: .012, max: .065, step: .001, default: .026 },
  { id: "knotCenterX", label: "Center position X", min: -.5, max: .5, step: .005, default: 0 },
  { id: "knotCenterY", label: "Center position Y", min: -.5, max: .5, step: .005, default: 0 },
  { id: "knotCenterSize", label: "Center size", min: 0, max: .12, step: .001, default: .035 },
  { id: "knotBodySpacing", label: "Body spacing", min: .12, max: .65, step: .005, default: .38 },
  { id: "knotCurl", label: "Curl", min: .1, max: 2, step: .005, default: .85 },
  { id: "knotTailLength", label: "Tail length", min: .2, max: 1.5, step: .005, default: 1 },
  { id: "knotGrowth", label: "Strand growth", min: 0, max: 1, step: 1, default: 0 },
  { id: "knotGrowthBehavior", label: "Growth behavior", min: 0, max: 2, step: 1, default: 0 },
  { id: "knotGrowthIdentity", label: "Growth shape", min: 0, max: 3, step: 1, default: 2 },
  { id: "knotGrowthMaterial", label: "Growth material", min: 0, max: 2, step: 1, default: 0 },
  { id: "knotChangePosition", label: "Change position", min: 0, max: 0.9, step: 0.005, default: 0.2 },
  { id: "knotTransitionLength", label: "Transition length", min: 0.05, max: 1, step: 0.005, default: 0.6 },
  { id: "knotBranchAmount", label: "Branch amount", min: 0, max: 1, step: 0.005, default: 0.4 },
  { id: "knotBranchLength", label: "Branch length", min: 0.01, max: 0.3, step: 0.005, default: 0.1 },
  { id: "knotBranchWidth", label: "Branch width", min: .001, max: .02, step: .0005, default: .003 },
  { id: "knotBranchCurl", label: "Branch curl", min: -1, max: 1, step: 0.005, default: 0.2 },
  { id: "knotGrowthSymmetry", label: "Symmetry", min: 0, max: 1, step: 0.005, default: 1 },
  { id: "knotContactReach", label: "Contact reach", min: 0.01, max: 0.2, step: 0.005, default: 0.06 },
  { id: "knotGrowthTextSize", label: "Growth text size", min: 0.008, max: 0.04, step: 0.001, default: 0.018 },
  { id: "knotPetalAmount", label: "Petal amount", min: 0, max: 1, step: 0.005, default: 0 },
  { id: "knotPetalWidth", label: "Petal width", min: 0.01, max: 0.25, step: 0.005, default: 0.09 },
  { id: "knotPetalLength", label: "Petal length", min: 0, max: 1, step: 0.005, default: 0.35 },
  { id: "knotPetalOpening", label: "Petal opening", min: 0, max: 1, step: 0.005, default: 0.7 },
  { id: "knotPetalFold", label: "Petal fold", min: -1, max: 1, step: 0.005, default: 0 },
  { id: "knotPetalTwist", label: "Petal twist", min: -1, max: 1, step: 0.005, default: 0 },
  { id: "knotWeaveTightness", label: "Weave tightness", min: 0.3, max: 2, step: 0.005, default: 1 },
  { id: "knotTraceColor", label: "Trace color", min: -1, max: 16777215, step: 1, default: -1 },
] as const;
export const knotDefaults: KnotValues = Object.fromEntries(knotControls.map(p => [p.id, p.default]));
export const knotStudies = [
  { name: "Woven Double Happiness", description: "Double Happiness with woven strokes and moderate motion.", values: { knotShape: 1, knotMaterial: 5, knotMotion: .45 } },
  { name: "Knot with 4 echoes", description: "Looped knot with four echo copies, slight deformation, and motion.", values: { knotMemory: 4, knotLife: .2, knotMotion: .25 } },
  { name: "Dense character fill", description: "Looped knot filled with tightly spaced Double Happiness characters.", values: { knotMaterial: 2, knotWidth: .105, knotSpacing: .035, knotAbundance: .8 } },
  { name: "Accented crossing", description: "Looped knot with a moving crossing accent; visible when Trace is on.", values: { knotImpossible: 1, knotMotion: .3 } },
  { name: "Deformed woven character", description: "Double Happiness with woven strokes, strong deformation, and motion.", values: { knotShape: 1, knotMaterial: 5, knotLife: .85, knotMotion: .65 } },
  { name: "Character filled with knots", description: "Double Happiness silhouette filled with small knots.", values: { knotShape: 1, knotMaterial: 1, knotWidth: .09 } },
  { name: "Knot filled with characters", description: "Looped knot filled with Double Happiness characters.", values: { knotMaterial: 2, knotWidth: .1 } },
] as const;
type Point = { x: number; y: number; z: number };
type Strand = Point[];
const TAU = Math.PI * 2;
const value = (p: KnotValues, id: string) => p[id] ?? knotDefaults[id];
const clamp01=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp01(n);return t*t*(3-2*t);};
export function petalProfile(v:Point,p:KnotValues):number {
  const count=Math.round(value(p,"knotTurns")),turn=((Math.atan2(v.y,v.x)/TAU)%1+1)%1*count;
  const selected=clamp01(value(p,"knotPetalAmount")*count-Math.floor(turn));
  return selected*Math.pow(Math.sin(Math.PI*(turn-Math.floor(turn))),2);
}
function petalPoint(v:Point,p:KnotValues):Point {
  if(value(p,"knotPetalAmount")<=0)return v;
  const f=petalProfile(v,p),scale=1+f*value(p,"knotPetalLength")*.55;
  const angle=f*value(p,"knotPetalTwist")*.5,cs=Math.cos(angle),sn=Math.sin(angle);
  return {x:(v.x*cs-v.y*sn)*scale,y:(v.x*sn+v.y*cs)*scale+value(p,"knotPetalFold")*.08*f,z:v.z};
}
export function petalWidth(v:Point,p:KnotValues,base:number):number {
  return base+value(p,"knotPetalWidth")*petalProfile(v,p)*(.05+.95*value(p,"knotPetalOpening"));
}
export function petalOutline(path:Strand,p:KnotValues,base:number,factor=1):Strand {
  const left:Strand=[],right:Strand=[];
  for(let i=0;i<path.length;i++){
    const v=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],len=Math.max(.000001,Math.hypot(b.x-a.x,b.y-a.y));
    const nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len,w=petalWidth(v,p,base)*.5*factor,fold=value(p,"knotPetalFold")*.6*petalProfile(v,p);
    left.push({x:v.x+nx*w*(1+fold),y:v.y+ny*w*(1+fold),z:v.z});right.push({x:v.x-nx*w*(1-fold),y:v.y-ny*w*(1-fold),z:v.z});
  }return [...left,...right.reverse()];
}
// ASCII is a separate material; selecting it never edits the saved Unicode voice.
export function knotGlyphs(phrases:string[]|undefined,ascii:boolean):string[] {
  if(ascii)return Array.from("/\\|+:.o*-");
  return Array.from(phrases?.length?phrases.join(" "):"JOY");
}
export function knotGrowthPaths(paths:Strand[],p:KnotValues,seed:number,phase:number):Strand[] {
  if(value(p,"knotGrowth")<.5||value(p,"knotBranchAmount")<=0)return [];
  const out:Strand[]=[],lengths=paths.map(path=>path.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-path[i].x,b.y-path[i].y),0));
  const total=lengths.reduce((a,b)=>a+b,0),budget=Math.round(100*value(p,"knotBranchAmount"));
  const behavior=Math.round(value(p,"knotGrowthBehavior")),identity=Math.round(value(p,"knotGrowthIdentity"));
  const wave=Math.sin(phase)*value(p,"knotMotion"),animation=behavior===1?.5+.5*wave:1;
  for(let k=0;k<paths.length;k++){
    const path=paths[k],count=Math.round(budget*lengths[k]/Math.max(.00001,total));
    for(let j=0;j<count;j++){
      const t=(j+.5)/count,i=Math.max(0,Math.min(path.length-1,Math.round(t*(path.length-1))));
      const root=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],len=Math.max(.000001,Math.hypot(b.x-a.x,b.y-a.y)),tx=(b.x-a.x)/len,ty=(b.y-a.y)/len;
      let growth=smooth((t-value(p,"knotChangePosition"))/value(p,"knotTransitionLength"))*animation;
      if(behavior===2){
        let nearest=1;
        for(let q=0;q<paths.length;q++)for(let n=1;n<paths[q].length;n+=6){
          if(q===k&&(Math.abs(n-i)<18||Math.abs(n-i)>path.length-18))continue;
          const c=paths[q][n-1],d=paths[q][Math.min(paths[q].length-1,n+5)],dx=d.x-c.x,dy=d.y-c.y,dl=Math.max(.000001,Math.hypot(dx,dy));
          if(Math.abs(tx*dy-ty*dx)/dl<.3)continue;
          nearest=Math.min(nearest,distance(root.x,root.y,c,d));
        }
        growth=smooth(1-nearest/value(p,"knotContactReach"));
      }
      if(growth<.025)continue;
      const noise=.5+.5*Math.sin((seed%997)*.001+k*7.13+j*2.399);
      const feather=identity===0?0:identity===1?1:identity===2?smooth(growth):.2+.6*noise;
      for(const side of [-1,1]){
        const balance=side===1?1:value(p,"knotGrowthSymmetry")+(1-value(p,"knotGrowthSymmetry"))*noise*.3;
        const reach=value(p,"knotBranchLength")*growth*balance*(identity===3?.65+.7*noise:1);
        if(reach<.001)continue;
        const nx=-ty*side,ny=tx*side,curl=value(p,"knotBranchCurl");
        const at=(u:number,w=0):Point=>({x:root.x+nx*reach*u+tx*reach*(.45*u+curl*Math.sin(Math.PI*u)*u)+tx*w,y:root.y+ny*reach*u+ty*reach*(.45*u+curl*Math.sin(Math.PI*u)*u)+ty*w,z:root.z});
        const stem:Strand=[],leaf:Strand=[];
        for(let n=0;n<=16;n++){const u=n/16;stem.push(at(u));leaf.push(at(u,reach*.24*(1-feather)*Math.sin(Math.PI*u)));}
        for(let n=16;n>=0;n--){const u=n/16;leaf.push(at(u,-reach*.24*(1-feather)*Math.sin(Math.PI*u)));}
        out.push(stem);if(feather<.98)out.push(leaf);
        if(feather>.02)for(let n=1;n<=7;n++){
          const u=n/8,spread=reach*.25*feather*Math.sin(Math.PI*u),base=at(u);
          for(const sign of [-1,1]){const tip=at(Math.min(1,u+.15),spread*sign);out.push([base,{x:(base.x+tip.x)*.5+nx*spread*.12,y:(base.y+tip.y)*.5+ny*spread*.12,z:root.z},tip]);}
        }
      }
    }
  }return out;
}
function drawKnotGrowth(context:CanvasRenderingContext2D,paths:Strand[],p:KnotValues,seed:number,phase:number,colors:number[],phrases?:string[]) {
  const grown=knotGrowthPaths(paths,p,seed,phase),material=Math.round(value(p,"knotGrowthMaterial")),glyphs=knotGlyphs(phrases,material===2),font=value(p,"knotGrowthTextSize");
  context.save();context.lineCap="round";context.lineJoin="round";
  for(let k=0;k<grown.length;k++){
    const path=grown[k],ink=colors[path[0].z>90?1:0];
    if(material===0){context.beginPath();context.moveTo(path[0].x,path[0].y);for(const v of path.slice(1))context.lineTo(v.x,v.y);context.strokeStyle=css(ink);context.lineWidth=value(p,"knotBranchWidth");context.stroke();}
    else if(glyphs.length){
      let travel=0,slot=0;
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.000001)continue;
        let next=font*.8-travel;
        while(next<=len){const t=next/len;context.save();context.translate(a.x+dx*t,a.y+dy*t);context.rotate(Math.atan2(dy,dx));context.fillStyle=css(ink);context.font=`${font}px ${material===2?'"Courier New"':'"Microsoft JhengHei", Arial'}`;context.textAlign="center";context.textBaseline="middle";context.fillText(glyphs[(slot++ +k)%glyphs.length],0,0);context.restore();next+=font*.8;}
        travel=(travel+len)%(font*.8);
      }
    }
  }context.restore();
}
// Each half is shi, kou, two opening strokes, a joining bar, and a lower kou.
const joyPaths = (): number[][][] => {
  const result: number[][][] = [];
  for (const cx of [-.225, .225]) {
    for (const path of [
      [[-.16,-.32],[.16,-.32]], [[0,-.43],[0,-.23]],
      [[-.13,-.14],[.13,-.14],[.13,-.035],[-.13,-.035],[-.13,-.14]],
      [[-.09,.015],[-.065,.085]], [[.09,.015],[.065,.085]],
      [[-.135,.2],[.135,.2],[.135,.39],[-.135,.39],[-.135,.2]],
    ]) result.push(path.map(([x,y]) => [x + cx,y]));
  }
  result.push([[-.415,-.22],[.415,-.22]],[[-.415,.11],[.415,.11]]);
  return result;
};
function knotSingleStrands(p: KnotValues, seed: number, phase: number): Strand[] {
  const shape = Math.round(value(p,"knotShape")), turns = Math.round(value(p,"knotTurns"));
  const life = value(p,"knotLife"), motion = value(p,"knotMotion"), clock = Math.sin(phase) * motion * TAU;
  const address = (seed % 997) / 997 * TAU;
  const paths: Strand[] = [];
  if (shape === 0) {
    const components=turns%2===0?2:1, samples=480/components;
    for(let component=0;component<components;component++){
      const strand:Strand=[];
      for(let i=0;i<=samples;i++){
        const t=i/samples*TAU/components, twist=turns*t+component*Math.PI,r=.30+.105*Math.cos(twist);
        strand.push({x:r*Math.cos(2*t),y:r*Math.sin(2*t),z:Math.sin(twist)});
      }
      paths.push(strand);
    }
  } else if(shape>=2) {
    const count=shape===4?2:1;
    for(let k=0;k<count;k++){
      const strand:Strand=[];
      for(let i=0;i<=480;i++){
        const t=i/480*TAU;let x=0,y=0,z=0;
        if(shape===7){x=.38*Math.cos(t);y=.38*Math.sin(t);z=0;}
        else if(shape===2){x=.135*(Math.sin(t)+2*Math.sin(2*t));y=.135*(Math.cos(t)-2*Math.cos(2*t));z=-Math.sin(3*t);}
        else if(shape===3){const r=.29+.115*Math.cos(4*t);x=r*Math.cos(3*t);y=r*Math.sin(3*t);z=Math.sin(4*t);}
        else if(shape===4){x=(k===0?-.12:.12)+.26*Math.cos(t);y=.33*Math.sin(t);z=(k===0?1:-1)*Math.sin(t);}
        else if(shape===5){const n=Math.max(2,Math.min(5,turns));const a=Math.sin((n+1)*t),b=Math.sin(n*t+.24);x=.39*2/Math.PI*Math.asin(a);y=.39*2/Math.PI*Math.asin(b);z=Math.cos((2*n+1)*t);}
        else {const n=Math.max(3,turns+2),r=.26+.15*Math.cos(n*t);x=r*Math.cos(2*t);y=r*Math.sin(2*t);z=Math.sin(n*t);}
        strand.push({x,y,z});
      }
      paths.push(strand);
    }
  } else {
    for (const path of joyPaths()) {
      const strand: Strand = [];
      for(let j=0;j<path.length-1;j++) {
        const [ax,ay]=path[j], [bx,by]=path[j+1];
        const count=Math.max(4,Math.ceil(Math.hypot(bx-ax,by-ay)*140));
        for(let i=0;i<count;i++) strand.push({x:ax+(bx-ax)*i/count,y:ay+(by-ay)*i/count,z:0});
      }
      const last=path[path.length-1]; strand.push({x:last[0],y:last[1],z:0}); paths.push(strand);
    }
  }
  const woven=Math.round(value(p,"knotMaterial"))===5;
  const out: Strand[]=[];
  for(let k=0;k<paths.length;k++) for(let side=0;side<(woven?2:1);side++) {
    const path=paths[k];
    out.push(path.map((v,i)=>{
      const prev=path[Math.max(0,i-1)], next=path[Math.min(path.length-1,i+1)];
      const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.max(.00001,Math.hypot(dx,dy));
      const t=i/(path.length-1)*TAU;
      const weave=t*turns+side*Math.PI+clock;
      const offset=woven?Math.sin(weave)*value(p,"knotWidth")*.65*value(p,"knotWeaveSpread")/(value(p,"knotPetalAmount")>0?value(p,"knotWeaveTightness"):1):0;
      const swell=1+life*.14*Math.sin(t*3+address+clock*(1+k%2));
      let x=v.x*swell-dy/len*offset+life*.015*Math.sin(t*7+clock),y=v.y*swell+dx/len*offset;
      const stretch=Math.exp(value(p,"knotStretch")*.7);
      x*=stretch;y/=stretch;
      x+=value(p,"knotBend")*.8*y*y;
      const angle=value(p,"knotTwist")*Math.PI*4*(x*x+y*y),cs=Math.cos(angle),sn=Math.sin(angle);
      const rx=x*cs-y*sn,ry=x*sn+y*cs;
      x=rx+value(p,"knotRipple")*.035*Math.sin(ry*18+clock);
      y=ry+value(p,"knotRipple")*.035*Math.sin(rx*18-clock);
      return petalPoint({x,y,z:woven?Math.cos(weave):v.z},p);
    }));
  }
  return out;
}
export function relatedKnotStrands(first:Strand[],second:Strand[],p:KnotValues,phase:number):Strand[]{
  const mode=Math.round(value(p,"knotConnected")),a=value(p,"knotContactPosition")*TAU,nx=Math.cos(a),ny=Math.sin(a),scale=value(p,"knotRelativeSize"),contact=value(p,"knotContactLength"),gap=value(p,"knotSeparation"),motion=value(p,"knotMotion");
  let other=second.map(path=>path.map(v=>({x:v.x*scale,y:v.y*scale,z:v.z+100})));
  if(mode===3){const anchor=first.flat().reduce((best,v)=>v.x*nx+v.y*ny>best.x*nx+best.y*ny?v:best),tip=other.flat().reduce((best,v)=>v.x*nx+v.y*ny<best.x*nx+best.y*ny?v:best);const pull=gap*.35-contact*.45;other=other.map(path=>path.map(v=>({...v,x:v.x+anchor.x-tip.x+nx*pull,y:v.y+anchor.y-tip.y+ny*pull})));}
  else {const squash=.15+contact*1.5,travel=.16+gap*.45+Math.sin(phase)*motion*.16;other=second.map(path=>path.map(v=>{const x=v.x*scale,y=v.y*scale;return {x:x*nx-y*squash*ny+nx*travel,y:x*ny+y*squash*nx+ny*travel,z:100+Math.max(-8,Math.min(8,y*12))};}));}
  const combined=[...first.map(path=>path.map(v=>({...v}))),...other],points=combined.flat(),minX=Math.min(...points.map(v=>v.x)),maxX=Math.max(...points.map(v=>v.x)),minY=Math.min(...points.map(v=>v.y)),maxY=Math.max(...points.map(v=>v.y)),fit=.86/Math.max(1,maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return combined.map(path=>path.map(v=>({x:(v.x-cx)*fit,y:(v.y-cy)*fit,z:v.z})));
}
// The second body's depth occupies a separate band; local depth still controls its own crossings.
export function knotStrands(p:KnotValues,seed:number,phase:number):Strand[] {
  if(value(p,"knotMix")>=.5&&Math.round(value(p,"knotConnected"))===2)return centerKnotStrands(p,phase);
  const first=knotSingleStrands(p,seed,phase);
  if(value(p,"knotMix")<.5)return first;
  const separation=value(p,"knotSeparation"),scale=value(p,"knotRelativeSize");
  const second=knotSingleStrands({...p,knotShape:value(p,"knotSecondShape")},seed,phase);
  if(value(p,"knotConnected")>=3)return relatedKnotStrands(first,second,p,phase);
  return [...first.map(path=>path.map(v=>({...v,x:v.x-separation*.5}))),...second.map(path=>path.map(v=>({x:v.x*scale+separation*.5,y:v.y*scale,z:v.z+100})))];
}
function distance(x:number,y:number,a:Point,b:Point) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/Math.max(1e-12,dx*dx+dy*dy)));
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
}
const css=(c:number)=>`#${(c&0xffffff).toString(16).padStart(6,"0")}`;
export function drawKnot(context:CanvasRenderingContext2D,width:number,height:number,p:KnotValues,seed:number,phase:number,colors:number[],phrases?:string[]) {
  if(value(p,"knotMix")>=.5&&Math.round(value(p,"knotConnected"))===1){drawConnectedKnot(context,width,height,p,seed,phase,colors,phrases);return;}
  if(value(p,"knotTraceColor")>=0) colors=[...colors.slice(0,2),value(p,"knotTraceColor"),colors[3]];
  const size=Math.min(width,height)*value(p,"knotScale"), material=Math.round(value(p,"knotMaterial"));
  const band=value(p,"knotWidth"), abundance=value(p,"knotAbundance"), motion=value(p,"knotMotion");
  const paths=knotStrands(p,seed,phase);
  context.save();context.translate(width/2,height/2);context.rotate(value(p,"knotRotation")*Math.PI/180);context.scale(size,size);
  context.lineCap="round";context.lineJoin="round";
  const line=(a:Point,b:Point,w:number,c:number)=>{context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.lineWidth=w;context.strokeStyle=css(c);context.stroke();};
  const joy=joyPaths();
  const textMark=(text:string,fontSize:number,ink:number)=>{
    if(text === "\u56cd") {context.save();context.scale(fontSize,fontSize);for(const path of joy)for(let i=1;i<path.length;i++)line({x:path[i-1][0],y:path[i-1][1],z:0},{x:path[i][0],y:path[i][1],z:0},.055,ink);context.restore();}
    else {context.font=`bold ${fontSize}px "Microsoft JhengHei", Arial`;context.fillStyle=css(ink);context.fillText(text,0,0);}
  };
  const crossingCache=new Map<Strand[],{over:Strand;at:number;under:Strand;other:number}[]>();
  const strokePath=(path:Strand,w:number,c:number)=>{if(path.length<2)return;context.beginPath();context.moveTo(path[0].x,path[0].y);for(const point of path.slice(1))context.lineTo(point.x,point.y);context.lineWidth=w;context.strokeStyle=css(c);context.stroke();};
  const surface=(path:Strand,w:number,factor:number,ink:number)=>{
    if(value(p,"knotPetalAmount")<=0){strokePath(path,w*factor,ink);return;}
    const polygon=petalOutline(path,p,w,factor);context.beginPath();context.moveTo(polygon[0].x,polygon[0].y);for(const v of polygon.slice(1))context.lineTo(v.x,v.y);context.closePath();context.fillStyle=css(ink);context.fill();
  };
  const patch=(path:Strand,at:number,reach:number)=>{
    let first=at,last=at+1,d=0;
    while(first>0&&d<reach){d+=Math.hypot(path[first].x-path[first-1].x,path[first].y-path[first-1].y);first--;}
    d=0;while(last<path.length-1&&d<reach){d+=Math.hypot(path[last+1].x-path[last].x,path[last+1].y-path[last].y);last++;}
    return path.slice(first,last+1);
  };
  const ribbon=(strands:Strand[],w:number,ghost=false)=>{
    const mixed=strands.some(path=>path[0].z>90);
    const ink=(path:Strand,k:number)=>colors[mixed?(path[0].z>90?1:0):k%2];
    for(let k=0;k<strands.length;k++){surface(strands[k],w,1.32,colors[3]);surface(strands[k],w,1,ghost?colors[1]:ink(strands[k],k));}
    if(ghost)return;
    let crossings=crossingCache.get(strands);
    if(!crossings){
      crossings=[];let between=0;
      const segments=strands.flatMap((path,k)=>path.slice(1).map((b,i)=>({a:path[i],b,k,i,path})));
      for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
        const a=segments[i],b=segments[j];if(a.k===b.k&&(Math.abs(a.i-b.i)<5||Math.abs(a.i-b.i)>a.path.length-6))continue;
        if(Math.max(a.a.x,a.b.x)<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)<Math.min(a.a.x,a.b.x)||Math.max(a.a.y,a.b.y)<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)<Math.min(a.a.y,a.b.y))continue;
        const dx=a.b.x-a.a.x,dy=a.b.y-a.a.y,ex=b.b.x-b.a.x,ey=b.b.y-b.a.y,den=dx*ey-dy*ex;
        if(Math.abs(den)<1e-12)continue;
        const rx=b.a.x-a.a.x,ry=b.a.y-a.a.y,t=(rx*ey-ry*ex)/den,u=(rx*dy-ry*dx)/den;
        if(t<0||t>=1||u<0||u>=1)continue;
        const az=a.a.z+(a.b.z-a.a.z)*t,bz=b.a.z+(b.b.z-b.a.z)*u;
        const different=(az>90)!==(bz>90);
        if(!different&&Math.abs(az-bz)<.05)continue;
        const order=Math.round(value(p,"knotCrossingOrder"));
        const firstOver=order===0?true:order===1?false:value(p,"knotConnected")===4?(az>90?az-100:bz-100)<0:between++%2===0;
        const aOver=different?((az<90)===firstOver):az>bz;
        crossings.push(aOver?{over:a.path,at:a.i,under:b.path,other:b.i}:{over:b.path,at:b.i,under:a.path,other:a.i});
      }
      crossingCache.set(strands,crossings);
    }
    if(mixed)context.lineCap="butt";
    for(const crossing of crossings){const reach=petalWidth(crossing.over[crossing.at],p,w)*1.25,path=patch(crossing.over,crossing.at,reach);surface(path,w,1.32,colors[3]);surface(path,w,1,ink(crossing.over,strands.indexOf(crossing.over)));}
    if(mixed)context.lineCap="round";
    const impossible=value(p,"knotImpossible");
    if(value(p,"knotTrace")>=.5&&impossible>0&&crossings.length){
      const crossing=crossings[Math.floor((((motion>0?phase:0)/TAU)%1+1)%1*crossings.length)];
      const path=patch(crossing.under,crossing.other,w*1.25),half=path.slice(0,Math.ceil(path.length/2)+1);
      strokePath(half,w*1.32,colors[3]);strokePath(half,w,colors[2]);
      const point=half[half.length-1];line(point,{x:point.x+w*.6*impossible,y:point.y-w*.6*impossible,z:0},w*.3,colors[2]);
    }
  };
  for(let m=Math.round(value(p,"knotMemory"));m>0;m--) {
    context.save();context.rotate(m*.055);context.scale(1+m*.035,1+m*.035);
    ribbon(knotStrands(p,seed,phase-m*.18),band*.22,true);context.restore();
  }
  if(material===0||material===5) ribbon(paths,material===5?band*.48:band);
  else if(material===4) {
    for(let k=0;k<paths.length;k++) {
      const path=paths[k]; let travel=motion>0?phase/TAU*value(p,"knotSpacing"):0,slot=0;
      for(let i=1;i<path.length;i++) {
        travel+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
        if(travel<value(p,"knotSpacing"))continue;travel=0;
        const a=path[i-1],b=path[i]; context.save();context.translate(b.x,b.y);context.rotate(Math.atan2(b.y-a.y,b.x-a.x));
        context.fillStyle=css(colors[k%2]);context.textAlign="center";context.textBaseline="middle";
        context.font=`bold ${value(p,"knotSpacing")*.7}px "Microsoft JhengHei", Arial`;
        textMark(phrases?.length?phrases[slot++%phrases.length]:"JOY",value(p,"knotSpacing")*.7,colors[k%2]);context.restore();
      }
    }
  } else {
    const spacing=value(p,"knotSpacing")/(1+abundance), radius=(band+value(p,"knotPetalWidth")*value(p,"knotPetalAmount"))*.5+abundance*.025;
    const fillShape=value(p,"knotFillShape")<0?(material===2?1:0):Math.round(value(p,"knotFillShape"));
    const mini=knotStrands({...knotDefaults,knotShape:fillShape,knotTurns:3},0,0);
    const points=paths.flat();
    const minX=(value(p,"knotMix")>=.5||value(p,"knotPetalAmount")>0)?Math.min(...points.map(v=>v.x))-radius:-.52,maxX=(value(p,"knotMix")>=.5||value(p,"knotPetalAmount")>0)?Math.max(...points.map(v=>v.x))+radius:.52;
    const minY=(value(p,"knotMix")>=.5||value(p,"knotPetalAmount")>0)?Math.min(...points.map(v=>v.y))-radius:-.52,maxY=(value(p,"knotMix")>=.5||value(p,"knotPetalAmount")>0)?Math.max(...points.map(v=>v.y))+radius:.52;
    for(let y=minY;y<=maxY;y+=spacing)for(let x=minX;x<=maxX;x+=spacing) {
      if(!paths.some(path=>path.some((b,i)=>i>0&&distance(x,y,path[i-1],b)<=petalWidth(b,p,band)*.5+abundance*.025)))continue;
      context.save();context.translate(x,y);context.scale(spacing*.83*value(p,"knotFillSize"),spacing*.83*value(p,"knotFillSize"));
      if((material===1||material===2)&&fillShape===1) {
        for(const path of joyPaths())for(let i=1;i<path.length;i++)line({x:path[i-1][0],y:path[i-1][1],z:0},{x:path[i][0],y:path[i][1],z:0},.055,colors[0]);
      } else if(material===1||material===2) {
        ribbon(mini,.08);
      } else {
        const glyphs=material===6 && phrases?.length?phrases:material===6?["JOY"]:["/","\\","+","o"];
        const slot=Math.abs(Math.round((x+.6)/spacing)+Math.round((y+.6)/spacing)*7);
        context.fillStyle=css(colors[0]);context.font='bold .85px "Courier New"';context.textAlign="center";context.textBaseline="middle";textMark(glyphs[slot%glyphs.length],.85,colors[0]);
      }
      context.restore();
    }
  }
  drawKnotGrowth(context,paths,p,seed,phase,colors,phrases);
  if(value(p,"knotTrace")>=.5&&motion>0) {const path=paths[0];const t=((phase/TAU)%1+1)%1;const dot=path[Math.floor(t*(path.length-1))];context.beginPath();context.arc(dot.x,dot.y,band*.36,0,TAU);context.fillStyle=css(colors[2]);context.fill();}
  if(value(p,"knotMix")>=.5&&Math.round(value(p,"knotConnected"))===2){context.beginPath();context.arc(value(p,"knotCenterX"),value(p,"knotCenterY"),value(p,"knotCenterSize"),0,TAU);context.fillStyle=css(colors[2]);context.fill();}
  context.restore();
}

function knotAnchor(paths:Strand[],attachment:number,bottom:boolean):Point {
  const points=paths.flat(),targetX=attachment*Math.max(...points.map(v=>Math.abs(v.x)));
  return points.reduce((best,v)=>((bottom?v.y:-v.y)-Math.abs(v.x-targetX)*1.5)>((bottom?best.y:-best.y)-Math.abs(best.x-targetX)*1.5)?v:best);
}
export function connectedKnotGeometry(p:KnotValues,seed:number,phase:number) {
  const body={...p,knotMix:0,knotConnected:0,knotMotion:0,knotScale:1,knotRotation:0,knotTrace:0};
  const upper={...body,knotShape:value(p,"knotSecondShape")};
  const mainPaths=knotStrands(body,seed,0),upperPaths=knotStrands(upper,seed,0);
  const upperScale=value(p,"knotRelativeSize")*.35;
  const top=knotAnchor(mainPaths,value(p,"knotAttachment"),false),bottom=knotAnchor(mainPaths,value(p,"knotAttachment"),true),join=knotAnchor(upperPaths,0,true);
  const upperX=top.x-join.x*upperScale,upperY=top.y-value(p,"knotConnectionLength")-join.y*upperScale;
  const from={x:join.x*upperScale+upperX,y:join.y*upperScale+upperY,z:0};
  const connector=[from,{...top}];
  const threads:Strand[]=[],count=Math.round(value(p,"knotThreadCount"));
  const motion=value(p,"knotMotion"),sway=value(p,"knotThreadSway")*motion;
  for(let k=0;k<count;k++){
    const lane=count===1?0:k/(count-1)-.5,length=value(p,"knotThreadLength")*(.9+.1*Math.cos(k*2.399));
    const path:Strand=[];
    for(let i=0;i<=80;i++){
      const t=i/80,wind=sway*.22*(Math.sin(phase)*(.6+.4*Math.cos(k*.7))+Math.sin(phase*2)*.25*Math.sin(t*4+k*.3));
      path.push({x:bottom.x+lane*value(p,"knotThreadSpread")*t+wind*t*t,y:bottom.y+length*t,z:0});
    }threads.push(path);
  }
  // Fixed bounds keep the central body still while threads sway.
  const points=[...mainPaths.flat(),...upperPaths.flat().map(v=>({x:v.x*upperScale+upperX,y:v.y*upperScale+upperY,z:0}))];
  const margin=.08+(value(p,"knotGrowth")>=.5?value(p,"knotBranchLength")*1.8:0)+value(p,"knotPetalWidth")*value(p,"knotPetalAmount");
  const minX=Math.min(...points.map(v=>v.x),bottom.x-value(p,"knotThreadSpread")*.5-sway*.3)-margin;
  const maxX=Math.max(...points.map(v=>v.x),bottom.x+value(p,"knotThreadSpread")*.5+sway*.3)+margin;
  const minY=Math.min(...points.map(v=>v.y))-margin,maxY=Math.max(...points.map(v=>v.y),bottom.y+value(p,"knotThreadLength"))+margin;
  return {body,upper,upperScale,upperX,upperY,connector,threads,minX,maxX,minY,maxY};
}
function drawConnectedKnot(context:CanvasRenderingContext2D,width:number,height:number,p:KnotValues,seed:number,phase:number,colors:number[],phrases?:string[]) {
  const g=connectedKnotGeometry(p,seed,phase),scale=Math.min(width/(g.maxX-g.minX),height/(g.maxY-g.minY))*value(p,"knotScale");
  context.save();context.translate(width/2,height/2);context.rotate(value(p,"knotRotation")*Math.PI/180);context.scale(scale,scale);context.translate(-(g.minX+g.maxX)/2,-(g.minY+g.maxY)/2);
  const stroke=(path:Strand,w:number,ink:number)=>{context.beginPath();context.moveTo(path[0].x,path[0].y);for(const v of path.slice(1))context.lineTo(v.x,v.y);context.strokeStyle=css(ink);context.lineWidth=w;context.lineCap="round";context.stroke();};
  stroke(g.connector,value(p,"knotThreadWidth")*1.5,colors[1]);
  const glyphs=knotGlyphs(phrases,value(p,"knotThreadMode")===2),font=value(p,"knotThreadTextSize");
  for(let k=0;k<g.threads.length;k++){
    const path=g.threads[k];
    if(value(p,"knotThreadMode")<.5)stroke(path,value(p,"knotThreadWidth"),colors[k%2]);
    else if(glyphs.length){
      let travel=0,slot=0;
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i];travel+=Math.hypot(b.x-a.x,b.y-a.y);if(travel<font*.9)continue;travel=0;
        const glyph=glyphs[(slot++ +k)%glyphs.length];context.save();context.translate(b.x,b.y);context.rotate(Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2);context.textAlign="center";context.textBaseline="middle";context.fillStyle=css(colors[k%2]);context.font=`bold ${font}px "Microsoft JhengHei", Arial`;context.fillText(glyph,0,0);context.restore();
      }
    }
  }
  drawKnotGrowth(context,g.threads,p,seed,phase,colors,phrases);
  const drawBody=(params:KnotValues,x:number,y:number,s:number)=>{context.save();context.translate(x-s*.5,y-s*.5);context.scale(s,s);drawKnot(context,1,1,params,seed,0,colors,phrases);context.restore();};
  drawBody(g.body,0,0,1);drawBody(g.upper,g.upperX,g.upperY,g.upperScale);
  if(value(p,"knotTrace")>=.5&&value(p,"knotMotion")>0){const path=g.threads[0],v=path[Math.floor((((phase/TAU)%1+1)%1)*(path.length-1))];context.beginPath();context.arc(v.x,v.y,value(p,"knotThreadWidth")*2.5,0,TAU);context.fillStyle=css(value(p,"knotTraceColor")>=0?value(p,"knotTraceColor"):colors[2]);context.fill();}
  context.restore();
}

// Open bodies: their tips follow the center while their tails retain an outer orbit.
export function centerKnotStrands(p:KnotValues,phase:number):Strand[] {
  const paths:Strand[]=[],woven=Math.round(value(p,"knotMaterial"))===5;
  const clock=Math.sin(phase)*value(p,"knotMotion");
  for(let k=0;k<2;k++)for(let side=0;side<(woven?2:1);side++){
    const path:Strand=[];
    for(let i=0;i<=480;i++){
      const t=i/480,u=1-t,angle=k*Math.PI+u*value(p,"knotCurl")*TAU+clock*u*.65;
      const weave=t*TAU*value(p,"knotTurns")+side*Math.PI+clock;
      const offset=woven?Math.sin(weave)*value(p,"knotWidth")*.65*value(p,"knotWeaveSpread")/(value(p,"knotPetalAmount")>0?value(p,"knotWeaveTightness"):1):0;
      const radius=.065+value(p,"knotBodySpacing")*u+offset;
      path.push(petalPoint({x:value(p,"knotCenterX")*t*t+Math.cos(angle)*radius,y:value(p,"knotCenterY")*t*t+Math.sin(angle)*radius*value(p,"knotTailLength"),z:k*100+(woven?Math.cos(weave):Math.sin(t*TAU*3))},p));
    }paths.push(path);
  }return paths;
}
