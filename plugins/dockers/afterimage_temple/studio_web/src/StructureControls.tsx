import {useState,type ReactNode} from 'react';
import {structureNames,structureControls,structureDefaults} from './formStructure';
export function StructureControls({values,onChange,playing,onPlay,placement}:{values:Record<string,number>;onChange:(p:Record<string,number>)=>void;playing:boolean;onPlay:()=>void;placement?:ReactNode}){
 const [tab,setTab]=useState('Layout'),p={...structureDefaults,...values};
 const numbers=(ids:string[])=><div className="figure-numbers">{ids.map(id=>{const c=structureControls.find(c=>c.id===id)!;return <label key={id}><span>{c.label}</span><input type="number" aria-label={`Structure ${c.label}`} min={c.min} max={c.max} step={c.step} value={p[id]} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onChange({...values,[id]:Math.max(c.min,Math.min(c.max,n))});}}/></label>;})}</div>;
 return <section className="shared-structure"><span className="eyebrow">STRUCTURE</span><div className="figure-choices">{structureNames.map((name,i)=><button key={name} aria-pressed={p.structureMode===i} onClick={()=>onChange({...values,structureMode:i})}>{name}</button>)}</div>
 {p.structureMode>0&&<><div className="figure-tabs">{['Layout','Motion'].map(name=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div>
 {tab==='Layout'?<>{numbers(['structureCount','structureSize','structureWidth','structureDepth','structureVariation','structureTurn','structureX','structureY',...([4,5,6].includes(p.structureMode)?['structureBend']:[])])}<button aria-pressed={p.structureFollow>=.5} onClick={()=>onChange({...values,structureFollow:p.structureFollow>=.5?0:1})}>Follow path</button></>:<>{numbers(['structureMotion','structureTogether'])}<button onClick={onPlay}>{playing?'Pause':'Play'}</button></>}
 </> }{placement}</section>;
}
