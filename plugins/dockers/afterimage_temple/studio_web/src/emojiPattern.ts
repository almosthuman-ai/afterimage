import type {FigureRaster} from './figureComposition';
export function emojiTiles(source:FigureRaster,count:number):FigureRaster[]{
  const side=source.height;if(count<1||source.width!==side*count)throw new Error('Emoji mix image does not match its saved selection.');
  return Array.from({length:count},(_,n)=>{const data=new Uint8ClampedArray(side*side*4);for(let y=0;y<side;y++)data.set(source.data.subarray((y*source.width+n*side)*4,(y*source.width+(n+1)*side)*4),y*side*4);return {width:side,height:side,data};});
}
export function emojiIndex(col:number,row:number,count:number,p:Record<string,number>,random:number,gather:number):number{
  if((p.fieldMix??0)<.5||count<2)return 0;
  const pattern=p.emojiPattern??0,weights=Array.from({length:count},(_,i)=>Math.max(1,Math.round(p[`emojiWeight${i}`]??1))),total=weights.reduce((a,b)=>a+b,0);
  const mod=(n:number,m:number)=>((n%m)+m)%m;
  const pick=(v:number,start=0)=>{let t=v*weights.slice(start).reduce((a,b)=>a+b,0);for(let i=start;i<count;i++){t-=weights[i];if(t<0)return i;}return count-1;};
  if(pattern===3)return col===0&&row===0?1:random<(p.emojiRarity??.06)?pick(gather,1):0;
  if(pattern===4){const base=mod(Math.floor(col/2)+row,count);return (base+mod(col,2))%count;}
  return pick(pattern===0?mod(col+row,total)/total:pattern===1?random:gather);
}
