import type {EmojiChoice} from './emojiMix';
import {EmojiLibrary} from './EmojiLibrary';
import {GroupControls} from './GroupControls';
import { useState } from "react";
import { figureControls, figureDefaults, figurePoses, figureSkeleton, figureBodyIds, figureNames, symbolNames } from "./figureComposition";

export function FigureControls({values,onChange,hasSource,onImport,onDragTarget,playing,onPlay,onPalette,onLibraryPick,emojiSelection,selectedSource,position,onSeek}:{position:number;onSeek:(position:number)=>void;values:Record<string,number>;onChange:(p:Record<string,number>)=>void;hasSource:boolean;onImport:()=>void;onDragTarget:(target:string)=>void;playing:boolean;onPlay:()=>void;onPalette:(colors:number[])=>void;onLibraryPick:(choices:EmojiChoice[],mix?:boolean)=>Promise<void>;emojiSelection?:EmojiChoice[];selectedSource?:string}) {
  const [library,setLibrary]=useState((values.figureSource??0)===2||((values.figureSource??0)===1&&Boolean(emojiSelection?.length)));
  const [part,setPart]=useState("figure"); const [bodyTab,setBodyTab]=useState("poses"); const p={...figureDefaults,...values};
  const legacyId=p.figureSource===1?selectedSource?.match(/([0-9a-f]{64})\.png$/i)?.[1]:undefined;
  const shared=(p.structureMode??0)>0;
  const selection=emojiSelection??(legacyId?[{id:legacyId,name:"Imported emoji"}]:undefined)??(p.figureSource===2?(p.fieldMix>=.5?symbolNames.map((name,i)=>({id:`builtin:${i}`,name})):[{id:`builtin:${p.symbolIndex}`,name:symbolNames[p.symbolIndex]}]):[]);
  const change=(id:string,value:number)=>onChange({...values,[id]:value});
  const choose=(next:string)=>{setPart(next);onDragTarget(next);};
  const numbers=(ids:string[])=> <div className="figure-numbers">{ids.map(id=>{const c=figureControls.find(c=>c.id===id)!;return <label key={id}><span>{c.label}</span><input aria-label={`${part} ${c.label}`} type="number" min={c.min} max={c.max} step={c.step} value={p[id]} onChange={e=>{const v=e.currentTarget.valueAsNumber;if(Number.isFinite(v))change(id,Math.min(c.max,Math.max(c.min,v)));}}/></label>;})}</div>;
  const choices=(id:string,labels:string[])=><div className="figure-choices">{labels.map((label,i)=><button key={label} aria-pressed={p[id]===i} onClick={()=>change(id,i)}>{label}</button>)}</div>;

  const modes=<div className="figure-choices">{["Single","Field","Dance","Figure rows","Figure ring","Figure cluster"].map((label,i)=><button key={label} aria-pressed={p.symbolField===i} onClick={()=>{change("symbolField",i);setPart("figure");onDragTarget(i>=2?"group":"figure");}}>{label}</button>)}</div>;
  if(!shared&&p.symbolField>=2)return <section className="figure-controls">{!shared&&modes}<GroupControls values={values} onChange={onChange} onDragTarget={onDragTarget} onPalette={onPalette} playing={playing} onPlay={onPlay}/></section>;
  return <section className="figure-controls">{!shared&&modes}
    {!shared&&p.symbolField<.5&&<div className="figure-decoration-switches" role="group" aria-label="Figure elements">{[["window1On","Window 1"],["window2On","Window 2"],["contourOn","Contour"],["orbitOn","Line"]].map(([id,label])=><button key={id} type="button" role="switch" aria-label={label} aria-checked={p[id]>=.5} onClick={()=>change(id,p[id]>=.5?0:1)}><span>{label}</span><strong>{p[id]>=.5?"On":"Off"}</strong></button>)}</div>}
    {!shared&&p.symbolField<.5&&<div className="figure-tabs">{[["figure","Figure"],["window1","Window 1"],["window2","Window 2"],["contour","Contour"],["orbit","Line"]].map(([id,label])=><button key={id} aria-pressed={part===id} onClick={()=>choose(id)}>{label}</button>)}</div>}
    {!shared&&(p.formMix??0)<.5&&<div className="figure-placement"><span>{p.symbolField>=.5?"Drag field on image":<>Drag {({figure:"figure",window1:"window 1",window2:"window 2",contour:"contour",orbit:"line"} as Record<string,string>)[part]} on image</>}</span></div>}
    {(shared||part==="figure")&&<>
      <div className="figure-choices"><button aria-pressed={p.figureSource===0} onClick={()=>{setLibrary(false);change("figureSource",0);}}>Human</button><button aria-pressed={library} onClick={()=>{setLibrary(true);change("figureSource",emojiSelection?.length?1:p.figureSource===1?1:2);}}>Emoji</button><button disabled={!hasSource} aria-pressed={!library&&p.figureSource===1} onClick={()=>{setLibrary(false);change("figureSource",1);}}>My PNG</button><button onClick={onImport}>Import PNG</button></div>
      {library&&<EmojiLibrary onPick={onLibraryPick} selection={selection} values={values} onParameters={onChange}/>}

      {!library&&p.figureSource===0&&<div className="figure-action-controls">
        <span>Action</span>{choices("figureAction",["Pose","Walk","Lift"])}
        {p.figureAction>0&&<>
          <div className="figure-placement"><button onClick={onPlay}>{playing?"Pause movement":"Play movement"}</button><span>{p.figureAction===1?"Walk in place":"Crouch, lift, lower"}</span></div>
          <label className="figure-action-slider"><span>Moment <small>{playing?"Playing":`${Math.round(position*100)}%`}</small></span><input aria-label="Movement moment" type="range" min="0" max="1" step=".005" value={position} onChange={e=>onSeek(Number(e.target.value))}/></label>
          <label className="figure-action-slider"><span>Weight <small>{p.figureWeight<.34?"Light":p.figureWeight>.66?"Heavy":"Steady"}</small></span><input aria-label="Movement weight" type="range" min="0" max="1" step=".01" value={p.figureWeight} onChange={e=>change("figureWeight",Number(e.target.value))}/></label>
          <small>Move Moment to hold a pose. More Frames or lower FPS below slows the action.</small>
          <details><summary>Body proportions</summary>{numbers(figureBodyIds.filter(id=>id!=="figureGesture"))}</details>
        </>}
      </div>}
      {!library&&p.figureSource===0&&p.figureAction===0&&<><div className="figure-choices"><button aria-pressed={bodyTab==="poses"} onClick={()=>setBodyTab("poses")}>Poses</button><button aria-pressed={bodyTab==="body"} onClick={()=>setBodyTab("body")}>Body</button></div>{bodyTab==="poses"?<div className="figure-poses">{figurePoses.map((_,i)=>{const q=figureSkeleton(i,{...p,figureAction:0});return <button key={i} aria-label={figureNames[i]} aria-pressed={p.figurePose===i} onClick={()=>onChange({...values,figurePose:i,figureAction:0,...(i>=12?{fieldCast:1}:{})})}><svg viewBox="0 0 100 110"><ellipse cx={q[0]*100} cy={q[1]*110} rx="6" ry="8"/>{[[1,2,3,4],[1,5,6,7],[1,8,9,10],[8,11,12]].map((ids,n)=><polyline key={n} points={ids.map(j=>`${q[j*2]*100},${q[j*2+1]*110}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={n===2?9:5} strokeLinecap="round" strokeLinejoin="round"/>)}</svg><span>{figureNames[i]}</span></button>;})}</div>:<>{numbers(figureBodyIds)}<div className="figure-choices"><button onClick={()=>onChange({...values,figureGesture:p.figureGesture||.4,figureGestureSeed:Math.floor(Math.random()*2000000000)})}>New gesture</button><button onClick={()=>onChange({...values,...Object.fromEntries(figureBodyIds.map(id=>[id,figureDefaults[id]])),figureGestureSeed:0})}>Reset body</button></div></>}</>}
      {!library&&p.figureSource===0&&choices("figureStyle",["Sculpted","Pictogram"])}
      {shared?<>{p.figureSource===0?<>{choices("fieldMix",["One pose","Mixed poses"])}{p.fieldMix>=.5&&choices("fieldCast",["Original 12","All 24"])}</>:choices("fieldInk",["Original color","Palette"])}</>:p.symbolField>=.5?<>
        {!library&&p.figureSource!==1&&choices("fieldMix",["One symbol","Mixed"])}
        {!library&&p.figureSource===0&&p.fieldMix>=.5&&choices("fieldCast",["Original 12","All 24"])}
        {choices("fieldInk",["Original color","Palette"])}
        {numbers(["fieldDensity","fieldSize","fieldVariation","fieldScatter","fieldTurn","fieldFlow","figurePresence","fieldMotion"])}
        <button onClick={onPlay}>{playing?"Pause":"Play"}</button>
      </>:numbers(["figureX","figureY","figureScale","figureTurn","figurePresence"])}
    </>}
    {!shared&&part.startsWith("window")&&<>
      {choices(`${part}Shape`,["Rectangle","Ellipse"])}{choices(`${part}Material`,["Color","Outline","Negative"])}
      {numbers([`${part}X`,`${part}Y`,`${part}Width`,`${part}Height`,`${part}Turn`,`${part}Opacity`])}
      <button onClick={()=>{const next={...values};for(const suffix of ["On","Shape","X","Y","Width","Height","Turn","Material","Opacity"]){next[`window1${suffix}`]=p[`window2${suffix}`];next[`window2${suffix}`]=p[`window1${suffix}`];}onChange(next);}}>Swap front / back</button>
    </>}
    {!shared&&part==="contour"&&<>{numbers(["contourX","contourY","contourWander","contourWidth","contourDetail"])}</>}
    {!shared&&part==="orbit"&&<>{numbers(["orbitX","orbitY","orbitWidth","orbitHeight","orbitTurn","orbitOpening","orbitBend"])}</>}
  </section>;
}
