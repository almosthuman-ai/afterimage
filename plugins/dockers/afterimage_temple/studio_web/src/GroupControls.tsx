import {useState,useEffect} from 'react';
import {figureControls,figureDefaults,figureNames,figurePoses} from './figureComposition';
import {groupCountKey} from './figureGroups';

export function GroupControls({values,onChange,onDragTarget,onPalette,playing,onPlay}:{values:Record<string,number>;onChange:(p:Record<string,number>)=>void;onDragTarget:(s:string)=>void;onPalette:(colors:number[])=>void;playing:boolean;onPlay:()=>void}){
  useEffect(()=>onDragTarget('group'),[onDragTarget]);
  const [tab,setTab]=useState('Formation'),p={...figureDefaults,...values},dance=p.symbolField===2;
  const change=(id:string,v:number)=>onChange({...values,[id]:v});
  const numbers=(ids:string[])=><div className="figure-numbers">{ids.map(id=>{const c=figureControls.find(c=>c.id===id)!;return <label key={id}><span>{c.label}</span><input aria-label={`group ${c.label}`} type="number" min={c.min} max={c.max} step={c.step} value={p[id]} onChange={e=>{const v=e.currentTarget.valueAsNumber;if(Number.isFinite(v))change(id,Math.max(c.min,Math.min(c.max,v)));}}/></label>;})}</div>;
  const toggle=(id:string,label:string)=><button aria-pressed={p[id]>=.5} onClick={()=>change(id,p[id]>=.5?0:1)}>{label}</button>;
  const poses=(id:string)=><div className="figure-poses">{figurePoses.map((q,i)=><button key={i} aria-label={`group ${figureNames[i]}`} aria-pressed={p[id]===i} onClick={()=>change(id,i)}><svg viewBox="0 0 100 110"><ellipse cx={q[0]*100} cy={q[1]*110} rx="6" ry="7"/>{[[1,2,3,4],[1,5,6,7],[1,8,9,10],[8,11,12]].map((chain,k)=><polyline key={k} points={chain.map(j=>`${q[j*2]*100},${q[j*2+1]*110}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={k===2?8:5} strokeLinecap="round" strokeLinejoin="round"/>)}</svg><span>{figureNames[i]}</span></button>)}</div>;
  return <>
    <div className="figure-tabs">{['Formation','Bodies','One different','Ground'].map(name=><button key={name} aria-pressed={tab===name} onClick={()=>{setTab(name);onDragTarget(name==='One different'?'groupPick':'group');}}>{name}</button>)}</div>
    {tab==='Formation'&&<>
      <div className="figure-placement">Drag the group on the image</div>
      {numbers([groupCountKey(p.symbolField),'groupSpread','groupDepth','groupSize','groupVariation',...(dance?['danceLean','danceContact','danceOpening']:[])])}
      <div className="figure-choices"><button onClick={()=>onPalette([0xd83b26,0x28784a,0xeccc85,0x214a92])}>Dance colors</button><button onClick={()=>onPalette([0xd3291d,0xb41c15,0xc5ad79,0xb41c15])}>Red stage</button></div>
      {numbers(['groupMotion','groupTogether'])}<button onClick={onPlay}>{playing?'Pause':'Play'}</button>
    </>}
    {tab==='Bodies'&&<>{!dance&&poses('groupPose')}{numbers(['figureHead','figureBuild','figureArms','figureLegs','figureLean','groupPresence'])}</>}
    {tab==='One different'&&<>
      <div className="figure-placement">Click a figure on the image</div>
      <div className="figure-choices">{toggle('groupException','One different')}<button onClick={()=>change('groupSelected',-1)}>Center figure</button></div>
      {p.groupException>=.5&&<>
        <div className="figure-choices">{toggle('groupAccent','Color')}{toggle('groupPoseDifferent','Pose')}{toggle('groupMirror','Mirror')}{toggle('groupStill','Stay still')}{toggle('groupMissing','Missing')}</div>
        {p.groupPoseDifferent>=.5&&poses('groupSoloPose')}{numbers(['groupSoloScale','groupSoloTurn'])}
      </>}
    </>}
    {tab==='Ground'&&<><div className="figure-choices">{toggle('groupGround','Ground')}</div>{p.groupGround>=.5&&numbers(['groupHorizon','groupGroundCurve'])}{numbers(['groupHole','groupPull'])}</>}
  </>;
}
