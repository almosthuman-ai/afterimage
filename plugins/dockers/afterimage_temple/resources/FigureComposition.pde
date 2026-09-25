
// Articulated actions, mirrored in figureSkeleton.ts. Phase is the shared recipe timeline.
void actionPut(double[] q,int j,double x,double y){q[j*2]=x;q[j*2+1]=y;}
void actionLimb(double[] q,int root,int middle,int end,double x,double y,double length,double side){
  double dx=x-q[root*2],dy=y-q[root*2+1],raw=Math.max(.000001,Math.hypot(dx,dy)),d=Math.min(raw,length*2-.000001);
  double ux=dx/raw,uy=dy/raw,h=Math.sqrt(Math.max(0,length*length-d*d/4));
  actionPut(q,middle,q[root*2]+ux*d/2-uy*h*side,q[root*2+1]+uy*d/2+ux*h*side);
  actionPut(q,end,q[root*2]+ux*d,q[root*2+1]+uy*d);
}
double[] actionSkeleton(JSONObject p,double phase){
  double[] q=new double[26];double weight=fv(p,"figureWeight",.5),legs=fv(p,"figureLegs",1),arms=fv(p,"figureArms",1);
  double t=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  if(Math.round(fv(p,"figureAction",0))==1){
    double stride=.14-.045*weight,hipY=.92-.38*legs+.012*legs*Math.cos(t*2);
    actionPut(q,8,.5,hipY);actionPut(q,1,.53+fv(p,"figureLean",0)*.15+weight*.025,hipY-.28);actionPut(q,0,q[2]+.018,q[3]-.105);
    for(int side=0;side<2;side++){
      double u=(t/(Math.PI*2)+side*.5)%1,s=(u-.5)*2;
      double x=u<.5?.5+stride*(1-4*u):.5-stride*Math.cos(Math.PI*s),y=u<.5?.92:.92-(.11-.035*weight)*Math.sin(Math.PI*s);
      actionLimb(q,8,side==0?9:11,side==0?10:12,x,y,.22*legs,-1);
      int shoulder=side==0?2:5,elbow=shoulder+1,wrist=shoulder+2;double a=-Math.cos(t+side*Math.PI)*(.65-.25*weight);
      actionPut(q,shoulder,q[2]+(side==0?-.035:.035),q[3]+.035);
      actionPut(q,elbow,q[shoulder*2]+Math.sin(a)*.16*arms,q[shoulder*2+1]+Math.cos(a)*.16*arms);
      actionPut(q,wrist,q[elbow*2]+Math.sin(a-.35)*.15*arms,q[elbow*2+1]+Math.cos(a-.35)*.15*arms);
    }
  }else{
    double rise=Math.pow(.5-.5*Math.cos(t),1+weight*1.4),bend=1-rise;
    actionPut(q,8,.5-.045*bend,.92-(.39-(.12+.07*weight)*bend)*legs);
    actionPut(q,1,q[16]+.075*bend+fv(p,"figureLean",0)*.12,q[17]-.28+.07*bend);actionPut(q,0,q[2]+.015+.02*bend,q[3]-.105);
    actionPut(q,2,q[2]-.08,q[3]+.035);actionPut(q,5,q[2]+.08,q[3]+.035);
    actionLimb(q,8,9,10,.34,.92,.215*legs,1);actionLimb(q,8,11,12,.66,.92,.215*legs,-1);
    actionLimb(q,2,3,4,.35,.70-.64*rise,.18*arms,-1);actionLimb(q,5,6,7,.65,.70-.64*rise,.18*arms,1);
  }return q;
}
double actionFit(JSONObject p){return Math.min(1,.46/(.45+.38*Math.abs(fv(p,"figureLegs",1)-1)+.30*Math.abs(fv(p,"figureArms",1)-1)+.15*Math.abs(fv(p,"figureLean",0))+.09*Math.max(0,Math.max(fv(p,"figureHead",1)-1,fv(p,"figureBuild",1)-1))));}
// Original figure studies; the same geometry and pixel composition as figureComposition.ts.
PImage[] symbolCache;
PImage symbolStudy(int index){
  if(symbolCache==null){
    JSONArray entries=loadJSONArray("symbol-atlas.json");symbolCache=new PImage[entries.size()];
    for(int n=0;n<entries.size();n++){JSONObject e=entries.getJSONObject(n);byte[] bytes=java.util.Base64.getDecoder().decode(e.getString("rgba"));PImage img=createImage(e.getInt("width"),e.getInt("height"),ARGB);img.loadPixels();
      for(int i=0;i<img.pixels.length;i++){int j=i*4;img.pixels[i]=((bytes[j+3]&255)<<24)|((bytes[j]&255)<<16)|((bytes[j+1]&255)<<8)|(bytes[j+2]&255);}img.updatePixels();symbolCache[n]=img;}
  }return symbolCache[constrain(index,0,symbolCache.length-1)];
}
double fieldHash(double a,double b,int seed){double n=Math.sin(a*127.1d+b*311.7d+seed*.013d)*43758.5453d;return n-Math.floor(n);}
double fieldNoise(double x,double y,int seed){double ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=fieldHash(ix,iy,seed),b=fieldHash(ix+1,iy,seed),c=fieldHash(ix,iy+1,seed),d=fieldHash(ix+1,iy+1,seed);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
double fv(JSONObject p,String key,double fallback){return p.hasKey(key)?p.getDouble(key):fallback;}
PImage[] emojiTiles(PImage source,int count){
  if(count<1||source.width!=source.height*count)throw new RuntimeException("Emoji mix image does not match its saved selection.");
  PImage[] tiles=new PImage[count];for(int i=0;i<count;i++)tiles[i]=source.get(i*source.height,0,source.height,source.height);return tiles;
}
int emojiMod(int n,int m){return ((n%m)+m)%m;}
int emojiPick(double value,int start,int[] weights){int total=0;for(int i=start;i<weights.length;i++)total+=weights[i];double t=value*total;for(int i=start;i<weights.length;i++){t-=weights[i];if(t<0)return i;}return weights.length-1;}
int emojiIndex(int col,int row,int count,JSONObject p,double random,double gather){
  if(fv(p,"fieldMix",0)<.5||count<2)return 0;
  int pattern=(int)fv(p,"emojiPattern",0),total=0;int[] weights=new int[count];for(int i=0;i<count;i++){weights[i]=Math.max(1,(int)Math.round(fv(p,"emojiWeight"+i,1)));total+=weights[i];}
  if(pattern==3)return col==0&&row==0?1:random<fv(p,"emojiRarity",.06)?emojiPick(gather,1,weights):0;
  if(pattern==4){int base=emojiMod((int)Math.floor(col/2.0)+row,count);return (base+emojiMod(col,2))%count;}
  return emojiPick(pattern==0?emojiMod(col+row,total)/(double)total:pattern==1?random:gather,0,weights);
}
PImage symbolField(PImage source,int w,int h,JSONObject p,int seed,float phase){
  PImage out=createImage(w,h,RGB);out.loadPixels();java.util.Arrays.fill(out.pixels,paletteColor(3));
  double shortEdge=Math.min(w,h),density=fv(p,"fieldDensity",14),step=shortEdge/density,motion=fv(p,"fieldMotion",.35d),tx=(Math.cos(phase)-1)*motion,ty=Math.sin(phase)*motion;
  double turn=fv(p,"figureTurn",0)*Math.PI/180,globalC=Math.cos(turn),globalS=Math.sin(turn),flow=fv(p,"fieldFlow",2),variation=fv(p,"fieldVariation",.7d),scatter=fv(p,"fieldScatter",.6d),presence=fv(p,"figurePresence",.9d);
  int extent=(int)Math.ceil(Math.hypot(w,h)/step/2)+3,material=(int)fv(p,"figureSource",0),style=(int)fv(p,"figureStyle",0);
  boolean mix=fv(p,"fieldMix",0)>=.5,inkMode=fv(p,"fieldInk",0)>=.5;
  PImage[] tiles=material==1&&fv(p,"emojiCount",0)>0?emojiTiles(source,(int)Math.round(fv(p,"emojiCount",0))):null;boolean pairs=tiles!=null&&mix&&fv(p,"emojiPattern",0)==4;
  for(int row=-extent;row<=extent;row++)for(int col=-extent*(pairs?2:1);col<=extent*(pairs?2:1);col++){
    double gridCol=pairs?Math.floor(col/2.0):col,pairOffset=pairs?(emojiMod(col,2)-.5)*step*.55:0;
    double x=gridCol/density,y=row/density,n1=fieldNoise(x*flow+tx,y*flow+ty,seed),n2=fieldNoise(x*flow*.5+17+tx,y*flow*.5+ty,seed+101),n3=fieldNoise(x*flow+31+tx,y*flow+ty,seed+211);
    double size=shortEdge*fv(p,"fieldSize",.13d)*((1-variation)+variation*(.12d+Math.pow(n2,3)*4)),lx=gridCol*step+pairOffset*(1-motion+Math.cos(phase)*motion)+(n3-.5)*step*scatter*4,ly=row*step+pairOffset*Math.sin(phase)*motion+(fieldNoise(x+ty,y+tx,seed+307)-.5)*step*scatter*4;
    double cx=w*fv(p,"figureX",.5d)+lx*globalC-ly*globalS,cy=h*fv(p,"figureY",.5d)+lx*globalS+ly*globalC;
    PImage src=tiles!=null?tiles[emojiIndex(col,row,tiles.length,p,fieldNoise(col*139+7,row*173+11,seed+881),n1)]:source;
    if(mix&&material!=1){int count=material==2||fv(p,"fieldCast",0)<.5?12:24,index=((int)fv(p,material==2?"symbolIndex":"figurePose",0)+(int)Math.floor(n1*count))%count;src=material==2?symbolStudy(index):figureStudy(index,style,p);}
    double scale=size/Math.max(src.width,src.height),angle=turn+(n3-.5)*Math.PI*4*fv(p,"fieldTurn",.35d),cs=Math.cos(angle),sn=Math.sin(angle),radius=size*.72d;
    if(cx+radius<0||cy+radius<0||cx-radius>=w||cy-radius>=h)continue;
    src.loadPixels();int ink=paletteColor(inkMode?Math.min(2,(int)Math.floor(n1*3)):0);
    for(int py=Math.max(0,(int)Math.floor(cy-radius));py<Math.min(h,(int)Math.ceil(cy+radius));py++)for(int px=Math.max(0,(int)Math.floor(cx-radius));px<Math.min(w,(int)Math.ceil(cx+radius));px++){
      double dx=px-cx,dy=py-cy;int sx=(int)Math.floor((dx*cs+dy*sn)/scale+src.width/2.0d),sy=(int)Math.floor((-dx*sn+dy*cs)/scale+src.height/2.0d);
      if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;int stampColor=src.pixels[sy*src.width+sx];double alpha=((stampColor>>>24)&255)/255.0d*presence;if(alpha==0)continue;
      if(inkMode||material==0)stampColor=ink;int i=py*w+px,old=out.pixels[i],r=(old>>16)&255,g=(old>>8)&255,b=old&255;
      out.pixels[i]=0xff000000|((int)Math.round(r+(((stampColor>>16)&255)-r)*alpha)<<16)|((int)Math.round(g+(((stampColor>>8)&255)-g)*alpha)<<8)|(int)Math.round(b+((stampColor&255)-b)*alpha);
    }
  }out.updatePixels();return out;
}
float[][] figurePosePoints = {
  {.52,.13, .51,.23, .4,.28,.26,.2,.22,.07, .61,.28,.72,.43,.55,.49, .48,.52, .37,.71,.28,.92, .61,.72,.77,.91},
  {.35,.27, .43,.35, .39,.4,.24,.49,.27,.29, .54,.37,.62,.25,.5,.16, .6,.59, .33,.66,.24,.91, .76,.69,.59,.91},
  {.6,.13, .55,.24, .43,.29,.27,.4,.14,.32, .63,.27,.77,.18,.85,.08, .48,.52, .49,.73,.38,.94, .66,.64,.81,.81},
  {.56,.14,.51,.26,.42,.29,.3,.39,.18,.3,.59,.28,.69,.39,.79,.28,.46,.54,.3,.7,.14,.83,.62,.67,.56,.9},
  {.72,.46,.59,.48,.57,.39,.39,.28,.23,.32,.58,.56,.45,.7,.27,.72,.38,.49,.25,.35,.1,.2,.25,.6,.08,.59},
  {.74,.27,.67,.38,.59,.41,.58,.59,.7,.7,.72,.42,.83,.55,.87,.7,.42,.5,.28,.62,.1,.66,.48,.72,.3,.81},
  {.54,.16,.52,.27,.43,.32,.37,.49,.5,.5,.6,.32,.7,.48,.55,.51,.51,.55,.35,.74,.58,.87,.67,.73,.82,.88},
  {.43,.15,.46,.26,.4,.31,.57,.39,.77,.37,.54,.31,.65,.32,.8,.29,.41,.56,.3,.74,.16,.91,.56,.74,.7,.91},
  {.5,.2,.5,.31,.4,.34,.3,.23,.31,.08,.6,.34,.7,.23,.69,.08,.5,.59,.38,.76,.32,.94,.62,.76,.68,.94},
  {.47,.23,.49,.34,.4,.37,.3,.26,.4,.18,.59,.37,.7,.25,.58,.18,.5,.61,.35,.78,.18,.88,.65,.77,.83,.86},
  {.55,.2,.54,.32,.44,.37,.35,.51,.44,.56,.63,.36,.7,.5,.62,.56,.53,.61,.33,.75,.49,.9,.72,.68,.85,.69},
  {.5,.16,.5,.28,.4,.33,.26,.27,.16,.16,.6,.33,.74,.27,.84,.16,.5,.58,.35,.76,.22,.95,.65,.76,.78,.95},
  {.67,.22,.6,.32,.51,.35,.49,.17,.6,.08,.68,.36,.77,.24,.79,.1,.46,.57,.28,.62,.18,.78,.57,.76,.48,.93},
  {.65,.17,.62,.29,.54,.33,.37,.42,.15,.38,.68,.33,.47,.5,.22,.48,.69,.56,.52,.74,.34,.9,.79,.74,.89,.91},
  {.5,.14,.5,.26,.4,.31,.28,.32,.1,.27,.6,.31,.75,.3,.89,.2,.5,.55,.48,.74,.46,.94,.68,.62,.86,.53},
  {0.47,0.15,0.48,0.27,0.38,0.33,0.23,0.32,0.19,0.12,0.58,0.33,0.74,0.32,0.81,0.12,0.48,0.56,0.36,0.76,0.3,0.94,0.63,0.76,0.69,0.94},
  {.35,.21,.43,.31,.38,.37,.55,.34,.65,.2,.51,.35,.65,.43,.77,.32,.63,.56,.49,.75,.31,.9,.76,.75,.86,.92},
  {0.6,0.33,0.54,0.43,0.48,0.43,0.34,0.43,0.38,0.58,0.57,0.48,0.52,0.62,0.39,0.6,0.58,0.64,0.37,0.65,0.4,0.8,0.38,0.54,0.53,0.44},
  {0.78,0.5,0.64,0.43,0.56,0.44,0.65,0.6,0.66,0.78,0.62,0.48,0.73,0.62,0.77,0.79,0.41,0.53,0.31,0.72,0.26,0.92,0.52,0.73,0.6,0.93},
  {.37,.14,.4,.26,.32,.31,.22,.41,.12,.39,.48,.31,.64,.31,.84,.29,.41,.56,.29,.75,.19,.93,.54,.74,.65,.93},
  {.5,.12,.5,.24,.4,.29,.28,.23,.17,.31,.6,.29,.74,.19,.82,.09,.5,.49,.34,.57,.26,.76,.69,.56,.78,.74},
  {.42,.18,.44,.3,.36,.34,.23,.48,.26,.62,.53,.33,.7,.4,.84,.37,.5,.58,.35,.74,.17,.84,.66,.7,.81,.6},
  {0.75,0.42,0.63,0.43,0.59,0.36,0.74,0.27,0.88,0.22,0.64,0.5,0.78,0.56,0.91,0.51,0.4,0.48,0.24,0.4,0.08,0.35,0.25,0.57,0.08,0.65},
  {.5,.17,.5,.29,.4,.33,.33,.46,.49,.43,.6,.33,.67,.46,.51,.43,.5,.58,.32,.72,.51,.86,.68,.72,.49,.86}
};
java.util.LinkedHashMap<String,PImage> figureStudyCache=new java.util.LinkedHashMap<String,PImage>();
PImage figureStudy(int pose){return figureStudy(pose,0);}
PImage figureStudy(int pose,int style){return figureStudy(pose,style,new JSONObject());}
PImage figureStudy(int pose,int style,JSONObject p) {
  String key=(fv(p,"figureAction",0)>0?0:pose)+":"+style+":"+p.getFloat("figureHead",1)+":"+p.getFloat("figureBuild",1)+":"+p.getFloat("figureArms",1)+":"+p.getFloat("figureLegs",1)+":"+p.getFloat("figureLean",0)+":"+p.getFloat("figureGesture",0)+":"+p.getInt("figureGestureSeed",0);key+=":"+fv(p,"figureAction",0)+":"+fv(p,"figureWeight",.5)+":"+(fv(p,"figureAction",0)>0?Math.round(((materialPhase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))*1000000):0);if(figureStudyCache.containsKey(key))return figureStudyCache.get(key);
  int w=320,h=480; PImage img=createImage(w,h,ARGB);img.loadPixels();float[] original=figurePosePoints[constrain(pose,0,23)];float[] q=new float[100];arrayCopy(original,q);int points=13;
  float head=p.getFloat("figureHead",1),build=p.getFloat("figureBuild",1),arms=p.getFloat("figureArms",1),legs=p.getFloat("figureLegs",1),lean=p.getFloat("figureLean",0),gesture=p.getFloat("figureGesture",0);int gestureSeed=p.getInt("figureGestureSeed",0);
  int[][] chains={{2,3,4},{5,6,7},{8,9,10},{8,11,12}};
  for(int c=0;c<4;c++){float length=c<2?arms:legs;if(length==1)continue;int root=chains[c][0];for(int j=1;j<3;j++)for(int axis=0;axis<2;axis++){int at=chains[c][j]*2+axis;q[at]=q[root*2+axis]+(q[at]-q[root*2+axis])*length;}}
  for(int j=0;j<13;j++){q[j*2]+=(q[17]-q[j*2+1])*lean;if(j!=8&&gesture>0){double weight=(j==3||j==4||j==6||j==7||j>=9)?1:.3d;q[j*2]+=(float)(Math.sin(j*2.17d+gestureSeed*.001d)*.12d*gesture*weight);q[j*2+1]+=(float)(Math.sin(j*3.31d+gestureSeed*.001d+7)*.1d*gesture*weight);}}

  if(fv(p,"figureAction",0)>0){double[] action=actionSkeleton(p,materialPhase);for(int j=0;j<26;j++)q[j]=(float)action[j];}
  float[][] bones={{1,2,.047,.045},{1,5,.047,.045},{2,3,.041,.029},{3,4,.029,.018},{5,6,.041,.029},{6,7,.029,.018},{1,8,.069,.082},{8,9,.061,.039},{9,10,.039,.022},{8,11,.061,.039},{11,12,.039,.022}};
  ArrayList<float[]> allBones=new ArrayList<float[]>();for(float[] bone:bones)allBones.add(bone);
  for(int hand=0;hand<2;hand++){int elbow=hand==0?3:6,wrist=hand==0?4:7;float angle=atan2(q[wrist*2+1]-q[elbow*2+1],q[wrist*2]-q[elbow*2]),cx=q[wrist*2]+cos(angle)*.028,cy=q[wrist*2+1]+sin(angle)*.028;int palm=points++;q[palm*2]=cx;q[palm*2+1]=cy;allBones.add(new float[]{wrist,palm,.02,.018});
    for(int f=0;f<(style==1?0:5);f++){float fan=angle+(f-2)*.3,len=f==0?.024:f==4?.032:.044;int root=points++,tip=points++;q[root*2]=cx+cos(angle+HALF_PI)*(f-2)*.007;q[root*2+1]=cy+sin(angle+HALF_PI)*(f-2)*.007;q[tip*2]=q[root*2]+cos(fan)*len;q[tip*2+1]=q[root*2+1]+sin(fan)*len;allBones.add(new float[]{root,tip,.0055,.003});}}
  for(int foot=0;foot<2;foot++){int knee=foot==0?9:11,ankle=foot==0?10:12,side=fv(p,"figureAction",0)==1?1:q[ankle*2]<q[knee*2]?-1:1,toe=points++;q[toe*2]=q[ankle*2]+side*.055;q[toe*2+1]=q[ankle*2+1]+.012;allBones.add(new float[]{ankle,toe,.025,.015});}
  float fit=1;
  if(fv(p,"figureAction",0)>0){fit=(float)actionFit(p);for(int j=0;j<points*2;j++)q[j]=.5+(q[j]-.5)*fit;}else if(head!=1||build!=1||arms!=1||legs!=1||lean!=0||gesture!=0){float reach=0;for(int j=0;j<points*2;j++)reach=max(reach,abs(q[j]-.5));fit=min(1,.46/(reach+.09*max(head,build)));for(int j=0;j<points*2;j++)q[j]=.5+(q[j]-.5)*fit;}
  for(float[] bone:allBones){bone[2]*=build*fit;bone[3]*=build*fit;}
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    float u=(x+.5)/w,v=(y+.5)/h,d=(sqrt(sq((u-q[0])/((style==1?.075:.068)*head*fit))+sq((v-q[1])/((style==1?.05:.085)*head*fit)))-1)*.068;
    for(float[] bone:allBones){int a=int(bone[0]),b=int(bone[1]);float ax=q[a*2],ay=q[a*2+1],dx=q[b*2]-ax,dy=q[b*2+1]-ay,t=constrain(((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy),0,1);d=min(d,sqrt(sq(u-ax-dx*t)+sq(v-ay-dy*t))-(bone[2]+(bone[3]-bone[2])*t));}
    int shade=style==1?255:round(155+75*u+20*sin(v*14)),alpha=round(constrain(.5-d*w,0,1)*255);img.pixels[y*w+x]=(alpha<<24)|(shade<<16)|(shade<<8)|shade;
  }img.updatePixels();if(figureStudyCache.size()>=64)figureStudyCache.remove(figureStudyCache.keySet().iterator().next());figureStudyCache.put(key,img);return img;
}
float figureAlpha(PImage img,int x,int y){return x<0||y<0||x>=img.width||y>=img.height?0:((img.pixels[y*img.width+x]>>>24)&255)/255.0;}
int figureAt(float x,float y,int w,int h,int sw,int sh,float px,float py,float scale,float cs,float sn){float dx=x-w*px,dy=y-h*py;int sx=floor((dx*cs+dy*sn)/scale+sw/2.0),sy=floor((-dx*sn+dy*cs)/scale+sh/2.0);return sx<0||sy<0||sx>=sw||sy>=sh?-1:sy*sw+sx;}
PImage figureComposition(JSONObject form){
  JSONObject p=form.getJSONObject("parameters");if(p.getFloat("symbolField",0)>=2)return figureGroupComposition(form);int w=targetWidth,h=targetHeight;float shortEdge=min(w,h);boolean imported=p.getFloat("figureSource",0)==1;
  if(imported&&sourceImage==null)throw new RuntimeException("Figure / Shapes needs an imported image. Choose material or select a built-in gesture.");
  PImage src=imported?sourceImage.get():p.getFloat("figureSource",0)==2?symbolStudy(round(p.getFloat("symbolIndex",0))):figureStudy(round(p.getFloat("figurePose",0)),round(p.getFloat("figureStyle",0)),p);
  if(imported&&p.getFloat("emojiCount",0)==0&&max(src.width,src.height)>max(900,max(w,h))){float ratio=float(max(900,max(w,h)))/max(src.width,src.height);src.resize(max(1,round(src.width*ratio)),max(1,round(src.height*ratio)));}
  if(p.getFloat("symbolField",0)>=.5)return symbolField(src,w,h,p,form.getInt("seed",1),materialPhase);
  if(imported&&p.getFloat("emojiCount",0)>0)src=emojiTiles(src,round(p.getFloat("emojiCount",0)))[0];
  src.loadPixels();int sw=src.width,sh=src.height;float[] edge=new float[sw*sh];float size=p.getFloat("figureScale",.88);int radius=max(1,round(p.getFloat("contourWidth",.002)*max(sw,sh)/size));
  for(int y=0;y<sh;y++)for(int x=0;x<sw;x++){float a=figureAlpha(src,x,y);edge[y*sw+x]=max(max(abs(a-figureAlpha(src,x+radius,y)),abs(a-figureAlpha(src,x-radius,y))),max(abs(a-figureAlpha(src,x,y+radius)),abs(a-figureAlpha(src,x,y-radius))));}
  float detail=p.getFloat("contourDetail",.35);
  if(detail>0)for(int y=0;y<sh;y++)for(int x=0;x<sw;x++){int i=y*sw+x,c=src.pixels[i];float a=((c>>>24)&255)/255.0;if(a<=.05)continue;float luma=(((c>>16)&255)*.2126+((c>>8)&255)*.7152+(c&255)*.0722)/255;
    for(int k=0;k<2;k++){int nx=x+(k==0?radius:0),ny=y+(k==1?radius:0);if(nx>=sw||ny>=sh)continue;int other=src.pixels[ny*sw+nx];float light=(((other>>16)&255)*.2126+((other>>8)&255)*.7152+(other&255)*.0722)/255;edge[i]=max(edge[i],constrain((abs(luma-light)-.32*(1-detail))*6,0,1)*min(a,figureAlpha(src,nx,ny)));}}
  float scale=shortEdge*size/max(sw,sh),angle=radians(p.getFloat("figureTurn",0)),cs=cos(angle),sn=sin(angle),px=p.getFloat("figureX",.5),py=p.getFloat("figureY",.5),presence=p.getFloat("figurePresence",.9),lineWidth=p.getFloat("contourWidth",.002);
  float[][] windows=new float[2][11];
  for(int k=0;k<2;k++){int n=k+1;String key="window"+n;float a=radians(p.getFloat(key+"Turn",n==1?-9:18));windows[k]=new float[]{p.getFloat(key+"On",1),p.getFloat(key+"Shape",n-1),p.getFloat(key+"X",n==1?.4:.64),p.getFloat(key+"Y",n==1?.4:.62),p.getFloat(key+"Width",n==1?.48:.44),p.getFloat(key+"Height",n==1?.46:.54),cos(a),sin(a),p.getFloat(key+"Material",n==1?1:0),p.getFloat(key+"Opacity",.8),n};}
  float oa=radians(p.getFloat("orbitTurn",-28)),oc=cos(oa),os=sin(oa),orbitX=p.getFloat("orbitX",.5),orbitY=p.getFloat("orbitY",.48),orbitW=p.getFloat("orbitWidth",.8),orbitH=p.getFloat("orbitHeight",.44),contourX=p.getFloat("contourX",.065),contourY=p.getFloat("contourY",-.035),wander=p.getFloat("contourWander",.025),phase=(form.getInt("seed",1)%1000)*.006283185;
  float orbitOpening=p.getFloat("orbitOpening",.84),orbitBend=p.getFloat("orbitBend",.1);
  boolean orbitOn=p.getFloat("orbitOn",1)>=.5,contourOn=p.getFloat("contourOn",1)>=.5;
  float[][] rgb=new float[4][3];for(int n=0;n<4;n++){int c=paletteColor(n);rgb[n]=new float[]{(c>>16)&255,(c>>8)&255,c&255};}
  PImage out=createImage(w,h,RGB);out.loadPixels();
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    float r=rgb[3][0],g=rgb[3][1],b=rgb[3][2],dx=(x-w*orbitX)/shortEdge,dy=(y-h*orbitY)/shortEdge,ox=dx*oc+dy*os,oy=-dx*os+dy*oc;
    float theta=atan2(oy/(orbitH*.5),ox/(orbitW*.5));
    float orbitDistance=abs(sqrt(sq(ox/(orbitW*.5))+sq(oy/(orbitH*.5)))-(1+orbitBend*sin(theta*3+phase)))*shortEdge*min(orbitW,orbitH)*.5;
    float orbit=orbitOn&&(theta+PI)/TWO_PI<=orbitOpening?constrain(max(.55,lineWidth*shortEdge*.5)+.5-orbitDistance,0,1):0;
    if(orbit>0&&oy<0){r=lerp(r,rgb[2][0],orbit);g=lerp(g,rgb[2][1],orbit);b=lerp(b,rgb[2][2],orbit);}
    int at=figureAt(x,y,w,h,sw,sh,px,py,scale,cs,sn),pixel=at<0?0:src.pixels[at];float alpha=((pixel>>>24)&255)/255.0;
    if(at>=0){float shade=((pixel>>16)&255)/255.0,a=alpha*presence;r=lerp(r,(imported||p.getFloat("figureSource",0)==2)?(pixel>>16)&255:rgb[0][0]*(.55+shade*.45),a);g=lerp(g,(imported||p.getFloat("figureSource",0)==2)?(pixel>>8)&255:rgb[0][1]*(.55+shade*.45),a);b=lerp(b,(imported||p.getFloat("figureSource",0)==2)?pixel&255:rgb[0][2]*(.55+shade*.45),a);}
    for(float[] win:windows){if(win[0]<.5)continue;dx=(x-w*win[2])/shortEdge;dy=(y-h*win[3])/shortEdge;float u=(dx*win[6]+dy*win[7])/(win[4]/2),v=(-dx*win[7]+dy*win[6])/(win[5]/2),distance=win[1]>=.5?sqrt(u*u+v*v):max(abs(u),abs(v));float boundary=(1-distance)*shortEdge*min(win[4],win[5])*.5,coverage=constrain(boundary+.5,0,1);if(boundary < -max(1,lineWidth*shortEdge))continue;
      float opacity=win[9]*coverage;float[] ink=rgb[int(win[10])];r=lerp(r,ink[0],opacity*.22);g=lerp(g,ink[1],opacity*.22);b=lerp(b,ink[2],opacity*.22);
      if(at>=0){float a=alpha*opacity;if(win[8]==1){r=lerp(r,rgb[3][0],a);g=lerp(g,rgb[3][1],a);b=lerp(b,rgb[3][2],a);a=edge[at]*opacity;r=lerp(r,ink[0],a);g=lerp(g,ink[1],a);b=lerp(b,ink[2],a);}else if(win[8]==2){r=lerp(r,255-((pixel>>16)&255),a);g=lerp(g,255-((pixel>>8)&255),a);b=lerp(b,255-(pixel&255),a);}else{r=lerp(r,ink[0],a);g=lerp(g,ink[1],a);b=lerp(b,ink[2],a);}}
      float border=constrain(max(.55,lineWidth*shortEdge*.5)+.5-abs(boundary),0,1)*win[9];if(border>0){r=lerp(r,ink[0],border);g=lerp(g,ink[1],border);b=lerp(b,ink[2],border);}
    }
    if(contourOn){int a=figureAt(x-w*contourX-shortEdge*wander*sin(y/shortEdge*9+phase),y-h*contourY,w,h,sw,sh,px,py,scale,cs,sn);if(a>=0){r=lerp(r,rgb[2][0],edge[a]);g=lerp(g,rgb[2][1],edge[a]);b=lerp(b,rgb[2][2],edge[a]);}}
    if(orbit>0&&oy>=0){r=lerp(r,rgb[2][0],orbit);g=lerp(g,rgb[2][1],orbit);b=lerp(b,rgb[2][2],orbit);}out.pixels[y*w+x]=0xff000000|(round(r)<<16)|(round(g)<<8)|round(b);
  }out.updatePixels();return out;
}
