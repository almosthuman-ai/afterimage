import {useEffect,useMemo,useState} from 'react';
import {convertFileSrc,invoke} from '@tauri-apps/api/core';
import {symbolNames} from './figureComposition';
import {builtinEmojiUrl,type EmojiChoice} from './emojiMix';
type Entry=EmojiChoice&{aliases:string[];animated:boolean;thumbnail:string};
export function EmojiLibrary({selection,values,onPick,onParameters}:{selection:EmojiChoice[];values:Record<string,number>;onPick:(choices:EmojiChoice[],mix?:boolean)=>Promise<void>;onParameters:(values:Record<string,number>)=>void}){
  const builtins=useMemo(()=>symbolNames.map((name,i)=>({id:`builtin:${i}`,name,aliases:['built in'],animated:false,thumbnail:builtinEmojiUrl(i)})),[]);
  const [entries,setEntries]=useState<Entry[]>(builtins),[query,setQuery]=useState(''),[page,setPage]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mixed=(values.symbolField??0)===1&&(values.fieldMix??0)>=.5;
  useEffect(()=>{let alive=true;invoke<{entries:Entry[]}>('list_emoji_library').then(value=>{if(alive)setEntries([...builtins,...value.entries]);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[builtins]);
  async function importFolder(){
    setError('');
    try {
      const folder=await invoke<string|null>('dialog_open',{options:{directory:true}});
      if(!folder)return;
      setBusy(true);
      const outcome=await invoke<{filesChecked:number;imported:number;duplicates:number;failed:number;total:number}>('import_emoji_library',{folder});
      const refreshed=await invoke<{entries:Entry[]}>('list_emoji_library');
      setEntries([...builtins,...refreshed.entries]);setPage(0);
      setNotice(`Imported ${outcome.imported} images; ${outcome.duplicates} duplicates shared an original.${outcome.failed?` ${outcome.failed} files could not be read.`:''}`);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  const [notice,setNotice]=useState('');
  const found=useMemo(()=>{const words=query.toLowerCase().trim().split(/\s+/);return entries.filter(entry=>words.every(word=>`${entry.name} ${entry.aliases.join(' ')}`.toLowerCase().includes(word)));},[entries,query]);
  const pages=Math.max(1,Math.ceil(found.length/72)),thumb=(entry:Entry)=>entry.id.startsWith('builtin:')?entry.thumbnail:convertFileSrc(entry.thumbnail);
  async function choose(next:EmojiChoice[],mix?:boolean){if(!next.length)return;setBusy(true);setError('');try{await onPick(next.map(item=>({id:item.id,name:entries.find(entry=>entry.id===item.id)?.name??item.name})),mix);}catch(e){setError(String(e));}finally{setBusy(false);}}
  function pick(entry:EmojiChoice){const exists=selection.some(item=>item.id===entry.id);const next=mixed?(exists?selection.filter(item=>item.id!==entry.id):[...selection,{id:entry.id,name:entry.name}]):[{id:entry.id,name:entry.name}];void choose(next);}
  return <div className="emoji-library" aria-label="Emoji library">
    <div className="figure-choices"><button disabled={busy} aria-pressed={!mixed} onClick={()=>onParameters({...values,fieldMix:0})}>One</button><button disabled={busy} aria-pressed={mixed} onClick={()=>void choose(selection.length?selection:[builtins[0]],true)}>Mix</button></div>
    {selection.length>0&&<div className="emoji-mix-tray" aria-label="Selected emoji">{selection.map((item,i)=>{const entry=entries.find(e=>e.id===item.id);return <div key={item.id}>
      <button disabled={busy||selection.length===1} title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} onClick={()=>void choose(selection.filter(s=>s.id!==item.id))}>{entry?<img src={thumb(entry)} alt={item.name}/>:<span>{i+1}</span>}</button>
      {mixed&&(values.emojiPattern??0)!==4&&((values.emojiPattern??0)!==3||(selection.length>2&&i>0))&&<input aria-label={`Proportion ${item.name}`} title={`Proportion: ${item.name}`} type="number" min="1" max="10" step="1" value={values[`emojiWeight${i}`]??1} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onParameters({...values,[`emojiWeight${i}`]:Math.max(1,Math.min(10,Math.round(n)))});}}/>}
    </div>;})}</div>}
    {mixed&&<><div className="figure-choices">{['Alternate','Scatter','Gather','Intruder','Pairs'].map((name,i)=><button key={name} aria-pressed={(values.emojiPattern??0)===i} onClick={()=>onParameters({...values,emojiPattern:i})}>{name}</button>)}</div>{values.emojiPattern===3&&<label>Intruders <input aria-label="Intruder amount" type="range" min="0" max=".5" step=".01" value={values.emojiRarity??.06} onChange={e=>onParameters({...values,emojiRarity:Number(e.target.value)})}/></label>}</>}
    <input type="search" aria-label="Search emoji" placeholder="Search name, code or folder" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
    <div className="emoji-library-nav"><span>{loading?'Loading…':`${found.length.toLocaleString()} images`}</span><button disabled={busy} onClick={()=>void importFolder()}>Import folder</button><button disabled={page===0||busy} onClick={()=>setPage(page-1)}>Previous</button><span>{page+1} / {pages}</span><button disabled={page+1>=pages||busy} onClick={()=>setPage(page+1)}>Next</button></div>
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}{busy&&<span role="status">Importing or preparing emoji…</span>}
    {!loading&&!found.length&&<p>No matching images.</p>}
    <div className="emoji-library-grid">{found.slice(page*72,(page+1)*72).map(entry=><button key={entry.id} aria-pressed={selection.some(item=>item.id===entry.id)} disabled={busy} title={`${entry.name}\n${entry.aliases.join('\n')}${entry.animated?'\nGIF: first frame':''}`} onClick={()=>pick(entry)}><img loading="lazy" src={thumb(entry)} alt={entry.name}/>{entry.animated&&<small title="GIF: first frame">GIF</small>}</button>)}</div>
    <a className="symbol-credit" href="https://openmoji.org/" target="_blank" rel="noreferrer">Built-in emoji: OpenMoji / CC BY-SA 4.0</a>
  </div>;
}
