import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type { StudioRecipe } from './studio';
import { formColorRoles, formPaletteColors, printColorSets } from './printColors';
import { builtInPalettes, emptyPaletteLibrary, generatePalette, lockedPalette, mergePaletteLibraries, paletteHex, parsePaletteLibrary, relationships, rotatePalette, toOklch, type GeneratorSettings, type PaletteColors, type PaletteLibraryData, type PaletteSet } from './paletteScience';

function PaletteTile({ colors }: { colors: PaletteColors }) {
  return <span className="palette-swatch-strip" aria-hidden="true">
    {colors.map((color,i)=><span key={i} style={{backgroundColor:paletteHex(color)}}/>)}
  </span>;
}
function legacySets(): PaletteSet[] {
  const raw=localStorage.getItem('glitch-temple.form-color-sets.v1');if(!raw)return [];
  const data=JSON.parse(raw);
  if(!Array.isArray(data))throw Error('Existing FORM color sets could not be read. They have been left intact.');
  return parsePaletteLibrary({version:1,favorites:[],sets:data.map((s: {name: unknown; colors: unknown},i: number)=>({id:`legacy-${i}`,name:s.name,family:'FORM saved',colors:s.colors}))}).sets;
}
export function PaletteLibrary({recipe,onChange,onClose,settings}:{recipe:StudioRecipe;onChange:(recipe:StudioRecipe)=>void;onClose:()=>void;settings:ReactNode}) {
  const opening=useRef({palette:[...recipe.palette] as PaletteColors,settings:{...recipe.paletteSettings},mode:recipe.colorMode,trace:recipe.koneForm.parameters.knotTraceColor});
  const [tab,setTab]=useState<'Collections'|'Generate'|'My palettes'|'Settings'>('Collections');
  const [library,setLibrary]=useState<PaletteLibraryData>(emptyPaletteLibrary);
  const [legacy,setLegacy]=useState<PaletteSet[]>([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
  const writing=useRef(false),fileInput=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[family,setFamily]=useState('All'),[favoritesOnly,setFavoritesOnly]=useState(false),[name,setName]=useState('');
  const colors=recipe.baseMode==='kone'?formPaletteColors(recipe):recipe.palette;
  const roles=recipe.baseMode==='kone'?formColorRoles(recipe):['Body','Ghost','Trace','Background'];
  const locks=[0,1,2,3].map(i=>(recipe.koneForm.parameters[`printLock${i}`]??0)>=.5);
  const [generator,setGenerator]=useState<GeneratorSettings>({relationship:'complementary',hue:Math.round(toOklch(colors[0])[2]),chroma:.14,contrast:.75,ground:'dark'});
  useEffect(()=>{let active=true;void invoke<PaletteLibraryData>('load_palette_library').then(data=>{if(active){setLibrary(parsePaletteLibrary(data));setReady(true);}}).catch(e=>{if(active)setError(String(e));});try{setLegacy(legacySets());}catch(e){setError(String(e));}return()=>{active=false};},[]);
  async function persist(next:PaletteLibraryData){
    if(!ready||writing.current)return false;
    writing.current=true;setSaving(true);setError('');
    try{const checked=parsePaletteLibrary(next);await invoke('save_palette_library',{library:checked});setLibrary(checked);return true;}
    catch(e){setError(String(e));return false;}finally{writing.current=false;setSaving(false);}
  }
  function changeColors(next:PaletteColors,respectLocks=true){
    const palette=respectLocks?lockedPalette(next,colors,locks):next;
    onChange({...recipe,revision:recipe.revision+1,palette,paletteSettings:{...recipe.paletteSettings,structure:'custom'},koneForm:{...recipe.koneForm,parameters:{...recipe.koneForm.parameters,...(recipe.baseMode==='kone'&&(recipe.koneForm.parameters.knotActive??0)>=.5?{knotTraceColor:-1}:{})}}});
  }
  function choose(set:PaletteSet){changeColors(set.colors);setName(set.name);setNotice(`${set.name}${locks.some(Boolean)?' - locked colors kept':''}`);}
  async function saveCurrent(){
    if(!name.trim())return;
    const set:PaletteSet={id:crypto.randomUUID(),name:name.trim(),family:'Mine',colors:[...colors] as PaletteColors};
    if(await persist({...library,sets:[...library.sets,set]})){setNotice(`Saved ${set.name}`);setTab('My palettes');setQuery('');setFavoritesOnly(false);setFamily('All');}
  }
  const printSets=printColorSets.map((s,i)=>({...s,id:`print-${i}`,family:'Print'}));
  const all=[...builtInPalettes,...printSets,...library.sets,...legacy];
  const visible=(tab==='My palettes'?[...library.sets,...legacy]:all).filter(s=>(family==='All'||tab==='My palettes'||s.family===family)&&(!favoritesOnly||library.favorites.includes(s.id))&&`${s.name} ${s.family}`.toLowerCase().includes(query.toLowerCase()));
  const candidate=lockedPalette(generatePalette(generator),colors,locks);
  return <section className="palette-library" role="dialog" aria-label="Palette library">
    <header><div><h2>Palette</h2><small>Choose colors. Watch what they become in the image.</small></div><button onClick={onClose}>Close</button></header>
    <div className="palette-current">
      <div className="palette-role-editor">{roles.map((role,i)=><div key={i}>
        <label><span>{role}</span><input aria-label={`${role} palette color`} type="color" value={paletteHex(colors[i])} onChange={e=>{const next=[...colors] as PaletteColors;next[i]=parseInt(e.target.value.slice(1),16);changeColors(next,false);}}/></label>
        <input key={colors[i]} className="palette-hex" aria-label={`${role} hex`} defaultValue={paletteHex(colors[i])} maxLength={7} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const hex=e.target.value.trim();if(/^#?[0-9a-f]{6}$/i.test(hex)){const next=[...colors] as PaletteColors;next[i]=parseInt(hex.replace('#',''),16);if(next[i]!==colors[i])changeColors(next,false);}else{e.target.value=paletteHex(colors[i]);setNotice('Use a six-digit hex color, such as #C4FF23.');}}}/>
        <button aria-label={`${locks[i]?'Unlock':'Lock'} ${role}`} aria-pressed={locks[i]} onClick={()=>onChange({...recipe,revision:recipe.revision+1,koneForm:{...recipe.koneForm,parameters:{...recipe.koneForm.parameters,[`printLock${i}`]:locks[i]?0:1}}})}>{locks[i]?'Locked':'Lock'}</button>
      </div>)}</div>
      <div className="palette-action-row"><button disabled={locks.filter(v=>!v).length<2} onClick={()=>changeColors(rotatePalette(colors,locks))}>Swap roles</button><button onClick={()=>{onChange({...recipe,revision:recipe.revision+1,palette:opening.current.palette,paletteSettings:opening.current.settings,colorMode:opening.current.mode,koneForm:{...recipe.koneForm,parameters:{...recipe.koneForm.parameters,knotTraceColor:opening.current.trace}}});setName('');setNotice('Opening colors restored.');}}>Restore opening colors</button></div>
      {recipe.baseMode!=='kone'&&<div className="palette-color-behavior"><button aria-pressed={recipe.colorMode==='source'} onClick={()=>onChange({...recipe,revision:recipe.revision+1,colorMode:'source'})}>Source color</button><button aria-pressed={recipe.colorMode==='palette'} onClick={()=>onChange({...recipe,revision:recipe.revision+1,colorMode:'palette'})}>Palette color</button><small>Effects decide how these colors enter the image. This is not a global recoloring filter.</small></div>}
      <div className="palette-save-row"><input aria-label="Palette name" placeholder="Name this palette" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><button disabled={!ready||saving||!name.trim()} onClick={()=>void saveCurrent()}>{saving?'Saving...':'Save palette'}</button></div>
    </div>
    <nav className="palette-library-tabs" aria-label="Palette browsing">{(['Collections','Generate','My palettes','Settings'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    {error&&<p className="palette-library-error" role="alert">{error}</p>}
    <div className="palette-library-body">
      {(tab==='Collections'||tab==='My palettes')&&<>
        <div className="palette-search"><input aria-label="Search palettes" placeholder="Search colors and collections" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(v=>!v)}>Favorites</button><small>{visible.length} palettes</small></div>
        {tab==='Collections'&&<div className="palette-families">{['All',...new Set([...builtInPalettes,...printSets].map(s=>s.family))].map(f=><button key={f} aria-pressed={family===f} onClick={()=>setFamily(f)}>{f}</button>)}</div>}
        <div className="palette-tile-grid">{visible.map(set=><article key={set.id}>
          <button className="palette-tile" title={`${set.name} - ${set.family}`} aria-label={`Use ${set.name}`} aria-pressed={set.colors.every((c,i)=>c===colors[i])} onClick={()=>choose(set)}><PaletteTile colors={set.colors}/></button>
          <button className="palette-favorite" disabled={!ready||saving} aria-label={`${library.favorites.includes(set.id)?'Unfavorite':'Favorite'} ${set.name}`} aria-pressed={library.favorites.includes(set.id)} title="Favorite" onClick={()=>void persist({...library,favorites:library.favorites.includes(set.id)?library.favorites.filter(id=>id!==set.id):[...library.favorites,set.id]})}>{library.favorites.includes(set.id)?'★':'☆'}</button>
        </article>)}</div>
        {!visible.length&&<p>No palettes here yet. Save your current colors or choose another search.</p>}
        {tab==='My palettes'&&<p className="palette-help">Existing FORM sets are included. Select one and Save palette to copy it into the backed-up library.</p>}
      </>}
      {tab==='Generate'&&<section className="palette-generator">
        <div className="palette-relationships">{relationships.map(([id,label,description])=><button key={id} aria-pressed={generator.relationship===id} title={description} onClick={()=>setGenerator(s=>({...s,relationship:id}))}>{label}</button>)}</div>
        <p>{relationships.find(r=>r[0]===generator.relationship)?.[2]}</p>
        <div className="generated-palette"><PaletteTile colors={candidate}/><div><button onClick={()=>{changeColors(candidate);setName(`${relationships.find(r=>r[0]===generator.relationship)?.[1]} ${Math.round(generator.hue)}`);setNotice('Generated palette applied.');}}>Use generated palette</button><button onClick={()=>setGenerator(s=>({...s,hue:(s.hue+137.5)%360}))}>Another hue</button><button onClick={()=>setGenerator(s=>({...s,hue:Math.round(toOklch(colors[0])[2])}))}>Start from Body hue</button></div></div>
        {([{key:'hue',label:'Hue',min:0,max:360,step:1},{key:'chroma',label:'Color intensity',min:0,max:.3,step:.005},{key:'contrast',label:'Light / dark separation',min:0,max:1,step:.01}] as const).map(p=><label className="palette-generator-control" key={p.key}><span>{p.label}</span><input type="range" aria-label={p.label} min={p.min} max={p.max} step={p.step} value={generator[p.key]} onChange={e=>setGenerator(s=>({...s,[p.key]:Number(e.target.value)}))}/><output>{p.key==='hue'?Math.round(generator.hue):Math.round(generator[p.key]*100)}</output></label>)}
        <div className="palette-action-row"><span>Background</span>{(['dark','light'] as const).map(ground=><button key={ground} aria-pressed={generator.ground===ground} onClick={()=>setGenerator(s=>({...s,ground}))}>{ground==='dark'?'Dark':'Light'}</button>)}</div>
        <p className="palette-help">Colors stay inside the displayable range. Locks keep your chosen colors; harmony is a starting point, not a rule.</p>
      </section>}
      {tab==='Settings'&&<section className="palette-original-settings"><p>Original hue, saturation and lightness controls. These retain their existing behavior.</p>{settings}</section>}
    </div>
    <footer><span role="status">{notice||'Click a palette to try it. Hover for its name.'}</span><div>
      <button disabled={!ready||saving} onClick={()=>fileInput.current?.click()}>Import</button>
      <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>4_000_000)throw Error('Palette file is too large.');const incoming=parsePaletteLibrary(JSON.parse(await file.text()));if(await persist(mergePaletteLibraries(library,incoming))){setNotice('Palettes imported; existing sets kept.');setTab('My palettes');}}catch(cause){setError(String(cause));}}}/>
      <button disabled={!ready||saving} onClick={async()=>{try{const path=await save({defaultPath:'Glitch Temple palettes.json',filters:[{name:'Palette library',extensions:['json']}]});if(path){await invoke('export_palette_library',{path,library});setNotice('Palette library exported.');}}catch(e){setError(String(e));}}}>Export</button>
    </div></footer>
  </section>;
}

import './PaletteLibrary.css';
