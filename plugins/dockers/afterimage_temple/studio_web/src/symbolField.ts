import {emojiTiles,emojiIndex} from './emojiPattern';
import {figureDefaults,figureStudy,symbolStudy,figurePoses,type FigureRaster} from './figureComposition';

// Smooth seeded value noise; shared exactly with Processing, independent of either runtime's RNG.
function noise(x:number,y:number,seed:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const hash=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7+seed*.013)*43758.5453;return n-Math.floor(n);};
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
export function symbolField(source:FigureRaster,width:number,height:number,values:Record<string,number>,palette:readonly number[],seed:number,phase=0):Uint8ClampedArray {
  const p={...figureDefaults,...values},out=new Uint8ClampedArray(width*height*4),short=Math.min(width,height),step=short/p.fieldDensity;
  const rgb=palette.map(c=>[(c>>16)&255,(c>>8)&255,c&255]);
  for(let i=0;i<out.length;i+=4)out.set([...rgb[3],255],i);
  const tiles=p.figureSource===1&&p.emojiCount>0?emojiTiles(source,Math.round(p.emojiCount)):null,pairs=Boolean(tiles&&p.fieldMix>=.5&&p.emojiPattern===4);
  const motion=p.fieldMotion,tx=(Math.cos(phase)-1)*motion,ty=Math.sin(phase)*motion;
  const turn=p.figureTurn*Math.PI/180,globalC=Math.cos(turn),globalS=Math.sin(turn);
  const extent=Math.ceil(Math.hypot(width,height)/step/2)+3;
  for(let row=-extent;row<=extent;row++)for(let col=-extent*(pairs?2:1);col<=extent*(pairs?2:1);col++){
    const gridCol=pairs?Math.floor(col/2):col;
    const x=gridCol/p.fieldDensity,y=row/p.fieldDensity,n1=noise(x*p.fieldFlow+tx,y*p.fieldFlow+ty,seed),n2=noise(x*p.fieldFlow*.5+17+tx,y*p.fieldFlow*.5+ty,seed+101),n3=noise(x*p.fieldFlow+31+tx,y*p.fieldFlow+ty,seed+211);
    const size=short*p.fieldSize*((1-p.fieldVariation)+p.fieldVariation*(.12+Math.pow(n2,3)*4));
    const pairOffset=pairs?(((col%2)+2)%2-.5)*step*.55:0;
    const lx=gridCol*step+pairOffset*(1-motion+Math.cos(phase)*motion)+(n3-.5)*step*p.fieldScatter*4,ly=row*step+pairOffset*Math.sin(phase)*motion+(noise(x+ty,y+tx,seed+307)-.5)*step*p.fieldScatter*4;
    const cx=width*p.figureX+lx*globalC-ly*globalS,cy=height*p.figureY+lx*globalS+ly*globalC;
    let src=tiles?tiles[emojiIndex(col,row,tiles.length,p,noise(col*139+7,row*173+11,seed+881),n1)]:source;
    if(p.fieldMix>=.5&&p.figureSource!==1){const count=p.figureSource===2||p.fieldCast<.5?12:figurePoses.length,index=((p.figureSource===2?p.symbolIndex:p.figurePose)+Math.floor(n1*count))%count;src=p.figureSource===2?symbolStudy(index):figureStudy(index,p.figureStyle,p,phase);}
    const scale=size/Math.max(src.width,src.height),angle=turn+(n3-.5)*Math.PI*4*p.fieldTurn,cs=Math.cos(angle),sn=Math.sin(angle),radius=size*.72;
    if(cx+radius<0||cy+radius<0||cx-radius>=width||cy-radius>=height)continue;
    const ink=rgb[p.fieldInk>=.5?Math.min(2,Math.floor(n1*3)):0];
    for(let py=Math.max(0,Math.floor(cy-radius));py<Math.min(height,Math.ceil(cy+radius));py++)for(let px=Math.max(0,Math.floor(cx-radius));px<Math.min(width,Math.ceil(cx+radius));px++){
      const dx=px-cx,dy=py-cy,sx=Math.floor((dx*cs+dy*sn)/scale+src.width/2),sy=Math.floor((-dx*sn+dy*cs)/scale+src.height/2);
      if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;
      const si=(sy*src.width+sx)*4,alpha=src.data[si+3]/255*p.figurePresence;if(alpha===0)continue;
      const i=(py*width+px)*4;
      for(let k=0;k<3;k++){const color=p.fieldInk>=.5||p.figureSource===0?ink[k]:src.data[si+k];out[i+k]=Math.round(out[i+k]+(color-out[i+k])*alpha);}
    }
  }
  return out;
}
