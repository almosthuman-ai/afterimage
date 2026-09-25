import type {StudioRecipe} from './studio';
import {formParts,selectFormPart,removeFormPart,moveFormPart,addFormPart,formPartControls} from './formStack';
export function FormStackControls({recipe,onChange}:{recipe:StudioRecipe;onChange:(r:StudioRecipe)=>void}){
 const parts=formParts(recipe),selected=recipe.formSelected??parts[0]?.id;
 const active=parts.find(part=>part.id===selected),index=parts.findIndex(part=>part.id===selected);
 return <section className="form-stack-controls"><header><strong>Forms</strong><small>Add from the library. Later entries sit in front.</small></header>
 <div className="chain-track form-chain-track" aria-label="Form order">{parts.map((part,i)=><button key={part.id} className={`chain-node ${part.id===selected?'selected':''} ${part.enabled?'':'bypassed'}`} aria-pressed={part.id===selected} title={`${i+1}. ${part.label}${part.enabled?'':' (bypassed)'}`} onClick={()=>onChange(selectFormPart(recipe,part.id))}><small>{i+1}</small><span>{part.label}</span></button>)}</div>
 {active&&<div className="effect-head form-effect-head"><div><strong>{active.label}</strong><small>{active.enabled?'Enabled':'Bypassed'}</small></div><div className="effect-actions">
 <button aria-label="Move form left" title="Move earlier / behind" disabled={index===0} onClick={()=>onChange(moveFormPart(recipe,active.id,-1))}>←</button>
 <button aria-label="Move form right" title="Move later / in front" disabled={index===parts.length-1} onClick={()=>onChange(moveFormPart(recipe,active.id,1))}>→</button>
 <button onClick={()=>onChange({...recipe,revision:recipe.revision+1,formSelected:selected,formStack:parts.map(part=>part.id===active.id?{...part,enabled:!part.enabled}:part)})}>{active.enabled?'Bypass':'Enable'}</button>
 <button className="remove-effect" onClick={()=>onChange(removeFormPart(recipe,active.id))}>Delete form</button>
 </div></div>}
 {parts.length===0?<small>No forms yet. Choose one from the library.</small>:<>
 <div className="form-stack-actions"><button onClick={()=>onChange(addFormPart(recipe,structuredClone(recipe.koneForm),parts.find(v=>v.id===selected)?.label??'Form'))}>Duplicate selected</button><span>Drag the selected form on the image.</span></div>

 </>}
 </section>;
}

export function FormPlacementControls({recipe,onChange}:{recipe:StudioRecipe;onChange:(r:StudioRecipe)=>void}){
 const p=recipe.koneForm.parameters;
 if(formParts(recipe).length===0)return null;
 return (<details><summary>Placement</summary><div className="figure-numbers">{formPartControls.map(c=><label key={c.id}><span>{c.label}</span><input type="number" aria-label={`Selected form ${c.label}`} value={p[c.id]??c.default} min={c.min} max={c.max} step={c.step} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onChange({...recipe,revision:recipe.revision+1,koneForm:{...recipe.koneForm,parameters:{...p,[c.id]:Math.max(c.min,Math.min(c.max,n))}}});}}/></label>)}</div></details>);
}
