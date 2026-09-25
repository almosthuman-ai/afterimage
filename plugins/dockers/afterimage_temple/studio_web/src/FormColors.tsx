import { useEffect, useState } from 'react';
import { printColorSets, swapColorRoles, formColorRoles, formPaletteColors, type ColorSet } from './printColors';
import type { StudioRecipe } from './studio';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const libraryKey = 'glitch-temple.form-color-sets.v1';
function readSets(): ColorSet[] {
  const raw = localStorage.getItem(libraryKey);
  if (!raw) return [];
  const sets: unknown = JSON.parse(raw);
  if (!Array.isArray(sets) || !sets.every(s => typeof s.name === 'string' && Array.isArray(s.colors) && s.colors.length === 4 && s.colors.every((c: unknown) => Number.isInteger(c) && Number(c) >= 0 && Number(c) <= 0xffffff))) throw new Error('Saved color sets could not be read.');
  return sets;
}
export function FormColors({ recipe, onChange, onOpenPalette }: { recipe: StudioRecipe; onChange: (recipe: StudioRecipe) => void; onOpenPalette: () => void }) {
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ColorSet[]>(() => { try { return readSets(); } catch { return []; } });
  const [name, setName] = useState('');
  const p = recipe.koneForm.parameters, colors = formPaletteColors(recipe), roles = formColorRoles(recipe);
  const locks = [0, 1, 2, 3].map(i => (p[`printLock${i}`] ?? 0) >= .5);
  const changeParameters = (patch: Record<string, number>) => onChange({ ...recipe, revision: recipe.revision + 1, koneForm: { ...recipe.koneForm, parameters: { ...p, ...patch } } });
  const changeColors = (colors: StudioRecipe['palette']) => onChange({ ...recipe, revision: recipe.revision + 1, paletteSettings: { ...recipe.paletteSettings, structure: 'custom' }, palette: colors, ...((p.knotActive ?? 0) >= .5 ? { koneForm: { ...recipe.koneForm, parameters: { ...p, knotTraceColor: -1 } } } : {}) });
  useEffect(() => { try { readSets(); } catch { setError('Saved color sets could not be read. Your stored library has been left intact.'); } }, []);
  return <section className="form-colors">
    <header><span className="eyebrow">FORM PALETTE</span><button onClick={onOpenPalette}>Palette settings</button></header>
    <div className="form-color-sets">{[...printColorSets, ...saved].map((set, i) => <button key={i} title={set.name} aria-label={set.name} className={set.colors.every((c, j) => c === colors[j]) ? 'selected' : ''} onClick={() => changeColors(set.colors.map((c, j) => locks[j] ? colors[j] : c) as StudioRecipe['palette'])}><span className="form-color-strip" aria-hidden="true">{set.colors.map((c, j) => <span key={j} style={{ backgroundColor: hex(locks[j] ? colors[j] : c) }} />)}</span></button>)}</div>
    <div className="form-color-roles">{roles.map((role, i) => <div key={role}><label><input aria-label={`${role} color`} type="color" value={hex(colors[i])} onChange={e => { const next = [...colors] as StudioRecipe['palette']; next[i] = parseInt(e.target.value.slice(1), 16); changeColors(next); }} /><span>{role}</span></label><button aria-label={`${locks[i] ? 'Unlock' : 'Lock'} ${role}`} aria-pressed={locks[i]} onClick={() => changeParameters({ [`printLock${i}`]: locks[i] ? 0 : 1 })}>{locks[i] ? 'Locked' : 'Lock'}</button></div>)}</div>
    <div className="form-color-actions"><button disabled={locks.filter(v => !v).length < 2} onClick={() => changeColors(swapColorRoles(colors, locks))}>Swap roles</button><input aria-label="Color set name" placeholder="Name your color set" maxLength={60} value={name} onChange={e => setName(e.target.value)} /><button disabled={!name.trim() || !!error} onClick={() => { try { const next = [...readSets(), { name: name.trim(), colors: [...colors] as StudioRecipe['palette'] }]; localStorage.setItem(libraryKey, JSON.stringify(next)); setSaved(next); setName(''); } catch { setError('Could not save this color set. Your current colors remain in the recipe.'); } }}>Save set</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function PrintedFoldControls({ values: p, onChange }: { values: Record<string, number>; onChange: (patch: Record<string, number>) => void }) {
  const printed = (p.printedFolds ?? 0) >= .5;
  const changeParameters = onChange;
  return <section className="kone-print-controls">
    <button onClick={() => onChange({ printedFolds: printed ? 0 : 1 })} aria-pressed={printed}>Printed folds {printed ? 'On' : 'Off'}</button>
    {printed ? <div className="form-print-controls"><label>Line spacing <input type="range" min="1" max="12" step="1" value={p.printSpacing ?? 3} onChange={e => changeParameters({ printSpacing: Number(e.target.value) })} /><output>{p.printSpacing ?? 3}</output></label><label>Line weight <input type="range" min="0.2" max="2" step="0.1" value={p.printWeight ?? .7} onChange={e => changeParameters({ printWeight: Number(e.target.value) })} /><output>{(p.printWeight ?? .7).toFixed(1)}</output></label></div> : <small>Flat body and fold colors with separate ink lines.</small>}
  </section>;
}
