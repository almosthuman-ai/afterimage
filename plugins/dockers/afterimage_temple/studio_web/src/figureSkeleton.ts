// Head, neck, shoulders, elbows, wrists, pelvis, knees and ankles (original geometry).
export const figurePoses = [
  [.52,.13, .51,.23, .4,.28,.26,.2,.22,.07, .61,.28,.72,.43,.55,.49, .48,.52, .37,.71,.28,.92, .61,.72,.77,.91],
  [.35,.27, .43,.35, .39,.4,.24,.49,.27,.29, .54,.37,.62,.25,.5,.16, .6,.59, .33,.66,.24,.91, .76,.69,.59,.91],
  [.6,.13, .55,.24, .43,.29,.27,.4,.14,.32, .63,.27,.77,.18,.85,.08, .48,.52, .49,.73,.38,.94, .66,.64,.81,.81],
  [.56,.14,.51,.26,.42,.29,.3,.39,.18,.3,.59,.28,.69,.39,.79,.28,.46,.54,.3,.7,.14,.83,.62,.67,.56,.9],
  [.72,.46,.59,.48,.57,.39,.39,.28,.23,.32,.58,.56,.45,.7,.27,.72,.38,.49,.25,.35,.1,.2,.25,.6,.08,.59],
  [.74,.27,.67,.38,.59,.41,.58,.59,.7,.7,.72,.42,.83,.55,.87,.7,.42,.5,.28,.62,.1,.66,.48,.72,.3,.81],
  [.54,.16,.52,.27,.43,.32,.37,.49,.5,.5,.6,.32,.7,.48,.55,.51,.51,.55,.35,.74,.58,.87,.67,.73,.82,.88],
  [.43,.15,.46,.26,.4,.31,.57,.39,.77,.37,.54,.31,.65,.32,.8,.29,.41,.56,.3,.74,.16,.91,.56,.74,.7,.91],
  [.5,.2,.5,.31,.4,.34,.3,.23,.31,.08,.6,.34,.7,.23,.69,.08,.5,.59,.38,.76,.32,.94,.62,.76,.68,.94],
  [.47,.23,.49,.34,.4,.37,.3,.26,.4,.18,.59,.37,.7,.25,.58,.18,.5,.61,.35,.78,.18,.88,.65,.77,.83,.86],
  [.55,.2,.54,.32,.44,.37,.35,.51,.44,.56,.63,.36,.7,.5,.62,.56,.53,.61,.33,.75,.49,.9,.72,.68,.85,.69],
  [.5,.16,.5,.28,.4,.33,.26,.27,.16,.16,.6,.33,.74,.27,.84,.16,.5,.58,.35,.76,.22,.95,.65,.76,.78,.95],
  [.67,.22,.6,.32,.51,.35,.49,.17,.6,.08,.68,.36,.77,.24,.79,.1,.46,.57,.28,.62,.18,.78,.57,.76,.48,.93],
  [.65,.17,.62,.29,.54,.33,.37,.42,.15,.38,.68,.33,.47,.5,.22,.48,.69,.56,.52,.74,.34,.9,.79,.74,.89,.91],
  [.5,.14,.5,.26,.4,.31,.28,.32,.1,.27,.6,.31,.75,.3,.89,.2,.5,.55,.48,.74,.46,.94,.68,.62,.86,.53],
  [0.47,0.15,0.48,0.27,0.38,0.33,0.23,0.32,0.19,0.12,0.58,0.33,0.74,0.32,0.81,0.12,0.48,0.56,0.36,0.76,0.3,0.94,0.63,0.76,0.69,0.94],
  [.35,.21,.43,.31,.38,.37,.55,.34,.65,.2,.51,.35,.65,.43,.77,.32,.63,.56,.49,.75,.31,.9,.76,.75,.86,.92],
  [0.6,0.33,0.54,0.43,0.48,0.43,0.34,0.43,0.38,0.58,0.57,0.48,0.52,0.62,0.39,0.6,0.58,0.64,0.37,0.65,0.4,0.8,0.38,0.54,0.53,0.44],
  [0.78,0.5,0.64,0.43,0.56,0.44,0.65,0.6,0.66,0.78,0.62,0.48,0.73,0.62,0.77,0.79,0.41,0.53,0.31,0.72,0.26,0.92,0.52,0.73,0.6,0.93],
  [.37,.14,.4,.26,.32,.31,.22,.41,.12,.39,.48,.31,.64,.31,.84,.29,.41,.56,.29,.75,.19,.93,.54,.74,.65,.93],
  [.5,.12,.5,.24,.4,.29,.28,.23,.17,.31,.6,.29,.74,.19,.82,.09,.5,.49,.34,.57,.26,.76,.69,.56,.78,.74],
  [.42,.18,.44,.3,.36,.34,.23,.48,.26,.62,.53,.33,.7,.4,.84,.37,.5,.58,.35,.74,.17,.84,.66,.7,.81,.6],
  [0.75,0.42,0.63,0.43,0.59,0.36,0.74,0.27,0.88,0.22,0.64,0.5,0.78,0.56,0.91,0.51,0.4,0.48,0.24,0.4,0.08,0.35,0.25,0.57,0.08,0.65],
  [.5,.17,.5,.29,.4,.33,.33,.46,.49,.43,.6,.33,.67,.46,.51,.43,.5,.58,.32,.72,.51,.86,.68,.72,.49,.86],
];
export const figureNames=['Reach','Fold','Open','Run','Fall','Crawl','Kneel','Push','Carry','Shield','Sit','Float','Climb','Pull','Balance','Surrender','Recoil','Curl','Bow','Point','Leap','Dance','Swim','Pray'];
export const figureBodyIds=['figureHead','figureBuild','figureArms','figureLegs','figureLean','figureGesture'];
export function figureSkeleton(pose:number,values:Record<string,number>={},phase=0) {
  if((values.figureAction??0)>0)return actionSkeleton(values,phase);
  const p={figureHead:1,figureBuild:1,figureArms:1,figureLegs:1,figureLean:0,figureGesture:0,figureGestureSeed:0,...values},q=[...(figurePoses[Math.round(pose)]??figurePoses[0])];
  for(const [root,middle,end,length] of [[2,3,4,p.figureArms],[5,6,7,p.figureArms],[8,9,10,p.figureLegs],[8,11,12,p.figureLegs]]){
    if(length===1)continue;
    for(const j of [middle,end])for(let axis=0;axis<2;axis++)q[j*2+axis]=q[root*2+axis]+(q[j*2+axis]-q[root*2+axis])*length;
  }
  for(let j=0;j<13;j++){
    q[j*2]+=(q[17]-q[j*2+1])*p.figureLean;
    if(j!==8&&p.figureGesture>0){const weight=[3,4,6,7,9,10,11,12].includes(j)?1:.3;
      q[j*2]+=Math.sin(j*2.17+p.figureGestureSeed*.001)*.12*p.figureGesture*weight;
      q[j*2+1]+=Math.sin(j*3.31+p.figureGestureSeed*.001+7)*.1*p.figureGesture*weight;
    }
  }return q;
}

// Joint motion is periodic; the old authored poses are untouched when Action is Pose.
export function actionSkeleton(p:Record<string,number>,phase:number):number[] {
  const q=new Array<number>(26).fill(0),weight=p.figureWeight??.5,legs=p.figureLegs??1,arms=p.figureArms??1;
  const t=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  const put=(j:number,x:number,y:number)=>{q[j*2]=x;q[j*2+1]=y;};
  const limb=(root:number,middle:number,end:number,x:number,y:number,length:number,side:number)=>{
    const dx=x-q[root*2],dy=y-q[root*2+1],raw=Math.max(.000001,Math.hypot(dx,dy)),d=Math.min(raw,length*2-.000001);
    const ux=dx/raw,uy=dy/raw,h=Math.sqrt(Math.max(0,length*length-d*d/4));
    put(middle,q[root*2]+ux*d/2-uy*h*side,q[root*2+1]+uy*d/2+ux*h*side);
    put(end,q[root*2]+ux*d,q[root*2+1]+uy*d);
  };
  if(Math.round(p.figureAction)===1){
    const stride=.14-.045*weight,hipY=.92-.38*legs+.012*legs*Math.cos(t*2);
    put(8,.5,hipY);put(1,.53+(p.figureLean??0)*.15+weight*.025,hipY-.28);
    put(0,q[2]+.018,q[3]-.105);
    for(let side=0;side<2;side++){
      const u=((t/(Math.PI*2)+side*.5)%1),s=(u-.5)*2;
      const x=u<.5?.5+stride*(1-4*u):.5-stride*Math.cos(Math.PI*s);
      const y=u<.5?.92:.92-(.11-.035*weight)*Math.sin(Math.PI*s);
      limb(8,side===0?9:11,side===0?10:12,x,y,.22*legs,-1);
      const shoulder=side===0?2:5,elbow=shoulder+1,wrist=shoulder+2,a=-Math.cos(t+side*Math.PI)*(.65-.25*weight);
      put(shoulder,q[2]+(side===0?-.035:.035),q[3]+.035);
      put(elbow,q[shoulder*2]+Math.sin(a)*.16*arms,q[shoulder*2+1]+Math.cos(a)*.16*arms);
      put(wrist,q[elbow*2]+Math.sin(a-.35)*.15*arms,q[elbow*2+1]+Math.cos(a-.35)*.15*arms);
    }
  }else{
    const rise=Math.pow(.5-.5*Math.cos(t),1+weight*1.4),bend=1-rise;
    put(8,.5-.045*bend,.92-(.39-(.12+.07*weight)*bend)*legs);
    put(1,q[16]+.075*bend+(p.figureLean??0)*.12,q[17]-.28+.07*bend);
    put(0,q[2]+.015+.02*bend,q[3]-.105);
    put(2,q[2]-.08,q[3]+.035);put(5,q[2]+.08,q[3]+.035);
    limb(8,9,10,.34,.92,.215*legs,1);limb(8,11,12,.66,.92,.215*legs,-1);
    limb(2,3,4,.35,.70-.64*rise,.18*arms,-1);limb(5,6,7,.65,.70-.64*rise,.18*arms,1);
  }
  return q;
}
// Constant framing over the whole cycle prevents the figure pumping in size.
export function actionFit(p:Record<string,number>):number {
  return Math.min(1,.46/(.45+.38*Math.abs((p.figureLegs??1)-1)+.30*Math.abs((p.figureArms??1)-1)+.15*Math.abs(p.figureLean??0)+.09*Math.max(0,(p.figureHead??1)-1,(p.figureBuild??1)-1)));
}
