export type PaletteColors = [number, number, number, number];
export type PaletteSet = { id: string; name: string; family: string; colors: PaletteColors };
export type PaletteLibraryData = { version: 1; sets: PaletteSet[]; favorites: string[] };
export const emptyPaletteLibrary = (): PaletteLibraryData => ({version: 1, sets: [], favorites: []});
export const paletteHex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const linear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const encoded = (v: number) => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
// Ottosson's published 2021 matrices; see docs/color-theory-and-palette-library.md.
export function toOklch(color: number): [number, number, number] {
  const [r,g,b] = [color >> 16, color >> 8 & 255, color & 255].map(v => linear(v / 255));
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  const L = .2104542553*l + .793617785*m - .0040720468*s;
  const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
  const bb = .0259040371*l + .7827717662*m - .808675766*s;
  return [L, Math.hypot(a,bb), (Math.atan2(bb,a)*180/Math.PI+360)%360];
}
function linearRgb(L: number, C: number, hue: number) {
  const a=C*Math.cos(hue*Math.PI/180), b=C*Math.sin(hue*Math.PI/180);
  const l=(L+.3963377774*a+.2158037573*b)**3;
  const m=(L-.1055613458*a-.0638541728*b)**3;
  const s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s, -1.2684380046*l+2.6097574011*m-.3413193965*s, -.0041960863*l-.7034186147*m+1.707614701*s];
}
export function fromOklch(L: number, C: number, hue: number): number {
  L=clamp(L); C=clamp(C,0,.5);
  const inside=(rgb: number[])=>rgb.every(v=>v>=-1e-7&&v<=1.0000001);
  let rgb=linearRgb(L,C,hue);
  if(!inside(rgb)) { let low=0,high=C; for(let i=0;i<24;i++){const mid=(low+high)/2;if(inside(linearRgb(L,mid,hue)))low=mid;else high=mid;}rgb=linearRgb(L,low,hue); }
  const [r,g,b]=rgb.map(v=>Math.round(clamp(encoded(clamp(v)))*255));
  return r*65536+g*256+b;
}
export const relationships = [
  ['mono','One hue','Lightness carries the differences.'],
  ['analogous','Neighbors','Nearby hues, with a separate light accent.'],
  ['complementary','Opposites','Two opposing hue families.'],
  ['split','Split opposites','One anchor and two flanking opponents.'],
  ['triadic','Three-way','Three evenly spaced hue directions.'],
  ['tension','Friction','Close lightness with opposing hues; edges can vibrate.'],
] as const;
export type Relationship = typeof relationships[number][0];
export type GeneratorSettings = { relationship: Relationship; hue: number; chroma: number; contrast: number; ground: 'dark' | 'light' };
export function generatePalette(s: GeneratorSettings): PaletteColors {
  const offsets: Record<Relationship, number[]> = {mono:[0,0,0],analogous:[-28,0,28],complementary:[0,180,10],split:[0,150,210],triadic:[0,120,240],tension:[0,180,155]};
  const contrast=clamp(s.contrast), C=clamp(s.chroma,0,.3);
  const levels=s.relationship==='tension'?[.61,.62,.65]:[.38+.08*(1-contrast),.60,.72+.20*contrast];
  const colors=offsets[s.relationship].map((h,i)=>fromOklch(levels[i],C*(i===2?.65:1),s.hue+h));
  colors.push(fromOklch(s.ground==='dark'?.12+.14*(1-contrast):.97-.09*(1-contrast),C*.12,s.hue+15));
  return colors as PaletteColors;
}
export function lockedPalette(candidate: PaletteColors, current: PaletteColors, locks: boolean[]): PaletteColors {
  return candidate.map((c,i)=>locks[i]?current[i]:c) as PaletteColors;
}
export function rotatePalette(colors: PaletteColors, locks: boolean[]): PaletteColors {
  const slots=[0,1,2,3].filter(i=>!locks[i]),next=[...colors] as PaletteColors;
  slots.forEach((slot,i)=>next[slot]=colors[slots[(i+1)%slots.length]]); return next;
}
export function parsePaletteLibrary(value: unknown): PaletteLibraryData {
  if(!value || typeof value!=='object')throw Error('This is not a palette library.');
  const data=value as PaletteLibraryData;
  if(data.version!==1||!Array.isArray(data.sets)||data.sets.length>5000||!Array.isArray(data.favorites)||data.favorites.length>10000)throw Error('Unsupported palette library format.');
  const ids=new Set<string>();
  for(const set of data.sets){
    if(!set||typeof set.id!=='string'||!set.id.length||set.id.length>160||ids.has(set.id)||typeof set.name!=='string'||!set.name.trim()||set.name.length>100||typeof set.family!=='string'||set.family.length>80||!Array.isArray(set.colors)||set.colors.length!==4||set.colors.some(c=>!Number.isInteger(c)||c<0||c>0xffffff))throw Error('A palette has invalid names, colors, or duplicate IDs.');
    ids.add(set.id);
  }
  if(data.favorites.some(id=>typeof id!=='string'||id.length>160))throw Error('Invalid favorite palette IDs.');
  return {version:1,sets:data.sets.map(s=>({...s,colors:[...s.colors] as PaletteColors})),favorites:[...new Set(data.favorites)]};
}
export function mergePaletteLibraries(current: PaletteLibraryData, incoming: PaletteLibraryData): PaletteLibraryData {
  const sets=[...current.sets], used=new Set(sets.map(s=>s.id)), mapped=new Map<string,string>();
  for(const set of incoming.sets){
    const existing=sets.find(s=>s.name===set.name&&s.colors.every((c,i)=>c===set.colors[i]));
    if(existing){mapped.set(set.id,existing.id);continue;}
    let id=set.id, suffix=1;while(used.has(id))id=`${set.id.slice(0,140)}-${suffix++}`;
    sets.push({...set,id});used.add(id);mapped.set(set.id,id);
  }
  return parsePaletteLibrary({version:1,sets,favorites:[...new Set([...current.favorites,...incoming.favorites.map(id=>mapped.get(id)??id)])]});
}
// Original authored sets: Body, Ghost, Trace, Background. Names describe proposals, not universal meanings.
const families: Record<string, [string,string][]> = {
  "Three colors": [["Red / White / Black","e9232e ffffff 000000 ffffff"],["Yellow / Blue / White","ffdb00 1454eb ffffff ffffff"],["Pink / White / Black","ff4f9a ffffff 000000 ffffff"]],
  Electric: [ ['Voltage garden','c4ff23 833dff ff58ad 111525'],['Arc flash','05d9e8 f706cf ffee32 160b30'],['Signal fever','fa4e27 5328eb ebfc54 171716'],['Laser moss','27df9b f56df3 e8ffbd 142524'],['Blue siren','1778f2 ff6b38 fefb83 111a32'],['Ultraviolet milk','894bfc 35e4c0 f7d7ff 20142f'] ],
  Nocturne: [ ['Night orchard','56735c 975c90 d3b17c 101c23'],['Velvet antenna','614b84 2d7882 f2989f 151323'],['After closing','8b4e40 4d6475 e4be87 211c23'],['Deep water bell','247c91 564d9b c4d6d3 0b1625'],['Bruised moon','896c8d 55767d e7cfd5 211e30'],['Low red room','913d4d 5a4669 c48a79 190f17'] ],
  Earth: [ ['Oxide and rain','ac573b 537779 e1c398 292c28'],['Clay signal','ca6e4b 707d45 f0d9b4 3b2927'],['Mineral prayer','568384 c48b55 d7d5b0 243936'],['Ochre root','b18b35 6d503f d8c5a5 28332a'],['Dust archive','9c705f 71868b cec3ac 363139'],['Cinder leaf','687947 b96d58 e5d7aa 242b27'] ],
  Faded: [ ['Washed postcard','a86572 83a0a1 d7b684 f3e6d6'],['Soft interference','a695c4 8bc0b2 d699af eceaf1'],['Chalk tide','689caa c99279 b9b47d e8e5d9'],['Old fluorescent','a1b89c cba6bb e5c689 f2eddf'],['Pale machinery','80909e bba8a4 c6bc80 e7ebea'],['Quiet apricot','c28d77 9cabc1 d8bb96 f6eee0'] ],
  Heat: [ ['Ember choir','d64f35 96324b f8ca5c 2a1922'],['Copper noon','ae4d27 e58a35 f9dfa0 39251c'],['Red weather','da3747 a24480 ffab69 351629'],['Sunburn velvet','e36953 74405f efc086 261824'],['Hot paper','c8432f e29a3a 513d49 f3dfb0'],['Molten pink','ef567b af3258 f8b474 3b1727'] ],
  Cold: [ ['Glacier wire','267f9b 7183c0 b9e2d7 102b3b'],['Winter television','4775b9 49a4a2 dbe6e8 202d46'],['Silver reservoir','668f98 9ba8bb d6dce0 21353b'],['Ice bruise','6e79b2 5596a0 cdc5e6 242d45'],['Cobalt breath','285db4 80b5bd e0ebd0 172644'],['Mint static','519285 7b8fb3 bfe8d1 19352e'] ],
  Ink: [ ['Carbon and vermilion','27292c b43d32 b4aa93 f0e7d0'],['Indigo newsprint','293e62 7e8582 c08748 e8dfc6'],['Plum typesetter','50384f 897582 c7a17b f0e6d7'],['Green ledger','304c42 8a9675 b16847 e7dfc7'],['Almost black','282a31 565b64 a2a5a8 e9e8e3'],['Black tea rose','493b36 967c6e bb7784 efe5d7'] ],
  Tension: [ ['Wrong spring','c5cf41 c65ca0 5279c4 e9d9b3'],['Rust and candy','a2472d f299ce 82b748 291e30'],['Sour ceremonial','d5e537 a74672 327d78 392441'],['Violet traffic','895dc4 b49635 c86b60 dfe4be'],['Hostile pastel','f5b0cb a4d640 6398d0 493959'],['Unreliable peach','efae86 717dcc 96b355 4d354b'] ],
};
export const builtInPalettes: PaletteSet[] = Object.entries(families).flatMap(([family, rows])=>rows.map(([name,hex],i)=>({id:`builtin-${family.toLowerCase()}-${i}`,name,family,colors:hex.split(' ').map(c=>parseInt(c,16)) as PaletteColors})));
