import { useEffect, useRef } from "react";
import { drawKnot, knotControls, knotDefaults, type KnotValues } from "./knot";

function KnotThumbnail({shape}:{shape:number}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const c=ref.current;if(!c)return;const ctx=c.getContext("2d")!;ctx.clearRect(0,0,120,100);drawKnot(ctx,120,100,{...knotDefaults,knotShape:shape},886405,0,[0xe98472,0xe98472,0xf2e6ce,0x171318]);},[shape]);
  return <canvas ref={ref} width={120} height={100}/>;
}

type Props = {values:KnotValues;onChange:(values:KnotValues)=>void;text?:string;onTextChange?:(text:string)=>void;playing:boolean;onTogglePlay:()=>void};
export function KnotControls({values,onChange,text,onTextChange,playing,onTogglePlay}:Props) {
  const material=Math.round(values.knotMaterial ?? 0),shape=Math.round(values.knotShape ?? 0);
  const shapes=knotControls[1].choices;
  const mixing=(values.knotMix ?? 0)>=.5;
  const arrangement=mixing?Math.round(values.knotConnected??0):0,connected=arrangement===1,center=arrangement===2,related=arrangement>=3;
  const growth=(values.knotGrowth??0)>=.5;
  const secondShape=Math.round(values.knotSecondShape ?? 7);
  const trace=(values.knotTrace ?? 1)>=.5;
  const fillShape=(values.knotFillShape ?? -1)<0?(material===2?1:0):values.knotFillShape;
  const mode=[1,2].includes(material)?"shapes":[4,6].includes(material)?"text":material===3?"ascii":material===5?"woven":"ribbons";
  const change=(id:string,value:number)=>onChange({...values,[id]:value});
  const controls=(ids:string[])=> <div className="knot-parameters">{knotControls.filter(c=>ids.includes(c.id)).map(c=><label key={c.id}><span>{c.label}</span><input aria-label={c.label} type="range" min={c.min} max={c.max} step={c.step} value={values[c.id]??c.default} onChange={e=>change(c.id,Number(e.target.value))}/><input aria-label={`${c.label} exact value`} type="number" min={c.min} max={c.max} step={c.step} value={values[c.id]??c.default} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))change(c.id,Math.min(c.max,Math.max(c.min,n)));}}/></label>)}</div>;
  return <section className="knot-controls">
    <div className="knot-trace-row knot-top-controls" role="group" aria-label="Playback and trace"><button className="knot-trace-switch" role="switch" aria-label="Trace" aria-checked={trace} onClick={()=>change("knotTrace",trace?0:1)}>Trace {trace?"on":"off"}</button><button className="knot-motion" onClick={onTogglePlay}>{playing?"Pause":"Play"}</button>{controls(["knotMotion"])}</div>
    <section className="knot-group" aria-label="Shape"><div className="knot-shape-heading"><h3>{connected?"Central shape":center?"Bodies":mixing?"First shape":"Shape"}</h3></div><div className="knot-constructions" role="group" aria-label="Arrangement">{[{name:"Single shape",id:-1},{name:"Overlap",id:0},{name:"Catch",id:3},{name:"Thread through",id:4},{name:"Around center",id:2},{name:"Pendant",id:1}].map(({name,id})=><button key={name} aria-pressed={id<0?!mixing:mixing&&arrangement===id} onClick={()=>onChange({...values,knotMix:id<0?0:1,knotConnected:id<0?(values.knotConnected??0):id})}>{name}</button>)}</div>{!center&&<div className="knot-shapes" aria-label="Main shape">{shapes.map((name,index)=><button key={name} title={name} aria-label={name} aria-pressed={shape===index} className={shape===index?"selected":""} onClick={()=>change("knotShape",index)}><KnotThumbnail shape={index}/></button>)}</div>}
      {mixing&&!center&&<><span className="knot-control-caption">{connected?"Upper shape":"Second shape"}</span><div className="knot-shapes" role="group" aria-label="Second shape">{shapes.map((name,index)=><button key={name} title={name} aria-label={name} aria-pressed={secondShape===index} className={secondShape===index?"selected":""} onClick={()=>change("knotSecondShape",index)}><KnotThumbnail shape={index}/></button>)}</div>
      {controls(["knotRelativeSize",...(connected?["knotConnectionLength","knotAttachment"]:related?["knotContactPosition","knotContactLength","knotSeparation"]:["knotSeparation"])])}
      {!connected&&([0,5].includes(material)?<><span className="knot-control-caption">Crossing order</span><div className="knot-constructions" role="group" aria-label="Crossing order">{[{label:"Alternate",value:2},{label:"First over",value:0},{label:"Second over",value:1}].map(item=><button key={item.value} aria-pressed={(values.knotCrossingOrder ?? 2)===item.value} onClick={()=>change("knotCrossingOrder",item.value)}>{item.label}</button>)}</div></>:<small>Use Ribbons or Woven strokes for over-and-under crossings.</small>)}</>}
      {center&&<><small>Two open ribbon bodies bend toward a shared center. Zero motion holds the composition.</small>{controls(["knotCenterX","knotCenterY","knotCenterSize","knotBodySpacing","knotCurl","knotTailLength"])}<span className="knot-control-caption">Crossing order</span><div className="knot-constructions" role="group" aria-label="Crossing order">{["First over","Second over","Alternate"].map((name,index)=><button key={name} aria-pressed={(values.knotCrossingOrder??2)===index} onClick={()=>change("knotCrossingOrder",index)}>{name}</button>)}</div></>}
    </section>
    {connected&&<section className="knot-group" aria-label="Threads"><h3>Threads</h3><div className="knot-constructions" role="group" aria-label="Thread material">{["Lines","Text","ASCII"].map((name,index)=><button key={name} aria-pressed={(values.knotThreadMode??0)===index} onClick={()=>change("knotThreadMode",index)}>{name}</button>)}</div>{controls(["knotThreadCount","knotThreadLength","knotThreadSpread","knotThreadSway",(values.knotThreadMode??0)===0?"knotThreadWidth":"knotThreadTextSize"])}</section>}
    <section className="knot-group" aria-label="Construction"><h3>Construction</h3>
      <div className="knot-constructions" role="group" aria-label="Construction choices">{([{label:"Ribbons",value:0},{label:"Woven strokes",value:5},{label:"Fill with text",value:6},{label:"Text along strands",value:4},{label:"Fill with shapes",value:1},{label:"Fill with ASCII",value:3}]).map(item=><button key={item.value} aria-pressed={item.value===1?[1,2].includes(material):material===item.value} onClick={()=>{if(item.value===1&&material===2)return;change("knotMaterial",item.value);}}>{item.label}</button>)}</div>
      {mode==="shapes"&&<><span className="knot-control-caption">Fill shape</span><div className="knot-shapes" role="group" aria-label="Fill shape">{shapes.map((name,i)=><button key={name} title={name} aria-label={name} className={fillShape===i?"selected":""} aria-pressed={fillShape===i} onClick={()=>change("knotFillShape",i)}><KnotThumbnail shape={i}/></button>)}</div></>}
      {(mode==="text"||(connected&&(values.knotThreadMode??0)===1)||(growth&&(values.knotGrowthMaterial??0)===1))&&<>
      {onTextChange?<div className="knot-text-editor"><label><span>{connected?"Body / thread text":"Fill text"}</span><textarea aria-label="Fill text" rows={2} value={text??"JOY"} placeholder="Type a character, word, or phrase" onChange={e=>onTextChange(Array.from(e.target.value.replace(/\s/gu," ")).filter(g=>{const c=g.codePointAt(0)!;return c>=32&&(c<127||c>159);}).slice(0,280).join(""))}/></label><button onClick={()=>onTextChange("\u56cd")}>Double Happiness</button></div>:<small>Uses the text entries above.</small>}</>}


      {controls(["knotScale","knotRotation",...(material===5?["knotWeaveSpread"]:[]),...([1,2,3,6].includes(material)?["knotFillSize"]:[]),...(material!==4?["knotWidth"]:[]),...(![0,5].includes(material)?["knotSpacing"]:[]),...(![0,4,5].includes(material)?["knotAbundance"]:[]),...(![2,3,4].includes(shape)||material===5?["knotTurns"]:[]),"knotMemory",...(trace&&[0,1,2,5].includes(material)?["knotImpossible"]:[])])}
    </section>
    <section className="knot-group" aria-label="Petals"><h3>Petals</h3><small>Broaden the knot itself. Zero amount restores its original width and shape.</small>{controls(["knotPetalAmount","knotPetalWidth","knotPetalLength","knotPetalOpening","knotPetalFold","knotPetalTwist",...(material===5?["knotWeaveTightness"]:[])])}</section>
    <section className="knot-group" aria-label="Strand growth"><div className="knot-shape-heading"><h3>Strand growth</h3><button role="switch" aria-label="Strand growth" aria-checked={growth} onClick={()=>change("knotGrowth",growth?0:1)}>{growth?"On":"Off"}</button></div>
    {growth&&<><div className="knot-constructions" role="group" aria-label="Growth behavior">{["Along strand","Over time","At crossings"].map((name,index)=><button key={name} aria-pressed={(values.knotGrowthBehavior??0)===index} onClick={()=>change("knotGrowthBehavior",index)}>{name}</button>)}</div>
    <div className="knot-constructions" role="group" aria-label="Growth shape">{["Leaves","Feather","Leaf to feather","Hybrid"].map((name,index)=><button key={name} aria-pressed={(values.knotGrowthIdentity??2)===index} onClick={()=>change("knotGrowthIdentity",index)}>{name}</button>)}</div>
    <div className="knot-constructions" role="group" aria-label="Growth material">{["Lines","Text","ASCII"].map((name,index)=><button key={name} aria-pressed={(values.knotGrowthMaterial??0)===index} onClick={()=>change("knotGrowthMaterial",index)}>{name}</button>)}</div>
    <small>{(values.knotGrowthBehavior??0)===1?"Play with Motion amount above zero to unfold and gather the growth.":(values.knotGrowthBehavior??0)===2?"Growth appears near nonparallel strands. Contact reach sets how close they need to be.":"Growth changes from the beginning to the end of each strand."}{(values.knotGrowthMaterial??0)===1?" Text uses the editor in Construction.":""}</small>
    {controls(["knotBranchAmount","knotBranchLength",...((values.knotGrowthMaterial??0)===0?["knotBranchWidth"]:[]),"knotBranchCurl","knotGrowthSymmetry",...((values.knotGrowthBehavior??0)===2?["knotContactReach"]:["knotChangePosition","knotTransitionLength"]),...((values.knotGrowthMaterial??0)>0?["knotGrowthTextSize"]:[])])}</>}
    </section>
    {!center&&<section className="knot-group" aria-label="Deformation"><h3>Deformation</h3>{controls(["knotLife","knotStretch","knotBend","knotTwist","knotRipple"])}</section>}
  </section>;
}
