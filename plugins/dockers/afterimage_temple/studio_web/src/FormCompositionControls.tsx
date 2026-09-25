import {formKinds,formMixDefaults,formMixControls,selectedFormKind,selectFormKind,type FormKind} from './formComposition';
const names={Kone:'KONE & plants',Knot:'Knot',Figure:'Figures'};
export function FormCompositionControls({values,seed,onChange}:{values:Record<string,number>;seed:number;onChange:(p:Record<string,number>)=>void}){
 const p={...formMixDefaults,...values},selected=selectedFormKind(p),active=formKinds.filter(k=>p[`formMix${k}`]>=.5).sort((a,b)=>p[`formMix${a}Order`]-p[`formMix${b}Order`]);
 const change=(id:string,v:number)=>onChange({...values,[id]:v});
 const enable=()=>onChange({...values,formMix:1,[`formMix${selected}`]:1,...Object.fromEntries(formKinds.filter(k=>p[`formMix${k}Seed`]<0).map(k=>[`formMix${k}Seed`,seed])),[`formMix${selected}Seed`]:seed});
 const remove=(kind:FormKind)=>{const remaining=active.filter(k=>k!==kind),next={...values,[`formMix${kind}`]:0};onChange(selected===kind&&remaining.length?selectFormKind(next,remaining[remaining.length-1]):next);};
 const move=(direction:number)=>{const index=active.indexOf(selected),other=active[index+direction];if(!other)return;onChange({...values,[`formMix${selected}Order`]:p[`formMix${other}Order`],[`formMix${other}Order`]:p[`formMix${selected}Order`]});};
 return <section className="form-composition-controls">
 <header><strong>Composition</strong><button aria-pressed={p.formMix>=.5} onClick={()=>p.formMix>=.5?change('formMix',0):enable()}>{p.formMix>=.5?'Combine forms: On':'Combine forms'}</button></header>
 {p.formMix>=.5&&<>
 <small>Choose a library material to add it. Select a part here, then drag it on the image.</small>
 <div className="form-composition-parts">{active.map(kind=><div key={kind} className={selected===kind?'selected':''}><button aria-pressed={selected===kind} onClick={()=>onChange(selectFormKind(values,kind))}>{names[kind]}</button><button aria-label={`${p[`formMix${kind}Visible`]>=.5?'Hide':'Show'} ${names[kind]}`} onClick={()=>change(`formMix${kind}Visible`,p[`formMix${kind}Visible`]>=.5?0:1)}>{p[`formMix${kind}Visible`]>=.5?'Visible':'Hidden'}</button><button aria-label={`Remove ${names[kind]}`} onClick={()=>remove(kind)}>×</button></div>)}</div>
 {!active.length?<small>The composition is empty. Add a material from the library.</small>:p[`formMix${selected}`]>=.5&&<>
 <details><summary>Place {names[selected]}</summary><div className="figure-numbers">{['X','Y','Scale','Turn','Opacity'].map(suffix=>{const id=`formMix${selected}${suffix}`,c=formMixControls.find(c=>c.id===id)!;return <label key={id}><span>{c.label}</span><input type="number" aria-label={`${names[selected]} layer ${c.label}`} min={c.min} max={c.max} step={c.step} value={p[id]} onChange={e=>{const v=e.currentTarget.valueAsNumber;if(Number.isFinite(v))change(id,Math.max(c.min,Math.min(c.max,v)));}}/></label>;})}</div><div className="figure-choices"><button disabled={active.indexOf(selected)===0} onClick={()=>move(-1)}>Move behind</button><button disabled={active.indexOf(selected)===active.length-1} onClick={()=>move(1)}>Move in front</button><button onClick={()=>onChange({...values,...Object.fromEntries(['X','Y','Scale','Turn','Opacity'].map(suffix=>{const id=`formMix${selected}${suffix}`;return [id,formMixDefaults[id]];}))})}>Reset placement</button></div></details>
 </>}
 </>}
 </section>;
}
