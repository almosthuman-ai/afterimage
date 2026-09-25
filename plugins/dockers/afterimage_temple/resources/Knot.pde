// Matching geometry for src/knot.ts. Coordinates are fractions of the shorter edge.
float knotSmooth(float n){float t=constrain(n,0,1);return t*t*(3-2*t);}
float petalProfile(PVector v,JSONObject p){
  int count=round(kv(p,"knotTurns"));float turn=((atan2(v.y,v.x)/TWO_PI)%1+1)%1*count;
  float selected=constrain(kv(p,"knotPetalAmount")*count-floor(turn),0,1);
  return selected*sq(sin(PI*(turn-floor(turn))));
}
PVector petalPoint(PVector v,JSONObject p){
  if(kv(p,"knotPetalAmount")<=0)return v;
  float f=petalProfile(v,p),scale=1+f*kv(p,"knotPetalLength")*.55,angle=f*kv(p,"knotPetalTwist")*.5,cs=cos(angle),sn=sin(angle);
  return new PVector((v.x*cs-v.y*sn)*scale,(v.x*sn+v.y*cs)*scale+kv(p,"knotPetalFold")*.08*f,v.z);
}
float petalWidth(PVector v,JSONObject p,float base){return base+kv(p,"knotPetalWidth")*petalProfile(v,p)*(.05+.95*kv(p,"knotPetalOpening"));}
void knotPetalSurface(PGraphics g,ArrayList<PVector> path,JSONObject p,float base,float factor,int ink){
  if(kv(p,"knotPetalAmount")<=0){knotStrokePath(g,path,base*factor,ink);return;}
  ArrayList<PVector> left=new ArrayList<PVector>(),right=new ArrayList<PVector>();
  for(int i=0;i<path.size();i++){
    PVector v=path.get(i),a=path.get(max(0,i-1)),b=path.get(min(path.size()-1,i+1));float len=max(.000001,dist(a.x,a.y,b.x,b.y)),nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len,w=petalWidth(v,p,base)*.5*factor,fold=kv(p,"knotPetalFold")*.6*petalProfile(v,p);
    left.add(new PVector(v.x+nx*w*(1+fold),v.y+ny*w*(1+fold)));right.add(new PVector(v.x-nx*w*(1-fold),v.y-ny*w*(1-fold)));
  }
  g.noStroke();g.fill(0xff000000|ink);g.beginShape();for(PVector v:left)g.vertex(v.x,v.y);for(int i=right.size()-1;i>=0;i--)g.vertex(right.get(i).x,right.get(i).y);g.endShape(CLOSE);
}
PVector knotBranchPoint(PVector root,float nx,float ny,float tx,float ty,float reach,float curl,float u,float w){
  return new PVector(root.x+nx*reach*u+tx*reach*(.45*u+curl*sin(PI*u)*u)+tx*w,root.y+ny*reach*u+ty*reach*(.45*u+curl*sin(PI*u)*u)+ty*w,root.z);
}
ArrayList<ArrayList<PVector>> knotGrowthPaths(ArrayList<ArrayList<PVector>> paths,JSONObject p,int seed,float phase){
  ArrayList<ArrayList<PVector>> out=new ArrayList<ArrayList<PVector>>();
  if(kv(p,"knotGrowth")<.5||kv(p,"knotBranchAmount")<=0)return out;
  float[] lengths=new float[paths.size()];float total=0;
  for(int k=0;k<paths.size();k++){ArrayList<PVector> path=paths.get(k);for(int i=1;i<path.size();i++){PVector a=path.get(i-1),b=path.get(i);lengths[k]+=dist(a.x,a.y,b.x,b.y);}total+=lengths[k];}
  int budget=round(100*kv(p,"knotBranchAmount")),behavior=round(kv(p,"knotGrowthBehavior")),identity=round(kv(p,"knotGrowthIdentity"));
  float wave=sin(phase)*kv(p,"knotMotion"),animation=behavior==1?.5+.5*wave:1;
  for(int k=0;k<paths.size();k++){
    ArrayList<PVector> path=paths.get(k);int count=round(budget*lengths[k]/max(.00001,total));
    for(int j=0;j<count;j++){
      float t=(j+.5)/count;int i=max(0,min(path.size()-1,round(t*(path.size()-1))));
      PVector root=path.get(i),a=path.get(max(0,i-1)),b=path.get(min(path.size()-1,i+1));float len=max(.000001,dist(a.x,a.y,b.x,b.y)),tx=(b.x-a.x)/len,ty=(b.y-a.y)/len;
      float growth=knotSmooth((t-kv(p,"knotChangePosition"))/kv(p,"knotTransitionLength"))*animation;
      if(behavior==2){
        float nearest=1;
        for(int q=0;q<paths.size();q++)for(int n=1;n<paths.get(q).size();n+=6){
          if(q==k&&(abs(n-i)<18||abs(n-i)>path.size()-18))continue;
          PVector c=paths.get(q).get(n-1),d=paths.get(q).get(min(paths.get(q).size()-1,n+5));float dx=d.x-c.x,dy=d.y-c.y,dl=max(.000001,sqrt(dx*dx+dy*dy));
          if(abs(tx*dy-ty*dx)/dl<.3)continue;nearest=min(nearest,knotDistance(root.x,root.y,c,d));
        }
        growth=knotSmooth(1-nearest/kv(p,"knotContactReach"));
      }
      if(growth<.025)continue;
      float noise=.5+.5*sin((seed%997)*.001+k*7.13+j*2.399),feather=identity==0?0:identity==1?1:identity==2?knotSmooth(growth):.2+.6*noise;
      for(int side:new int[]{-1,1}){
        float balance=side==1?1:kv(p,"knotGrowthSymmetry")+(1-kv(p,"knotGrowthSymmetry"))*noise*.3;
        float reach=kv(p,"knotBranchLength")*growth*balance*(identity==3?.65+.7*noise:1);if(reach<.001)continue;
        float nx=-ty*side,ny=tx*side,curl=kv(p,"knotBranchCurl");
        ArrayList<PVector> stem=new ArrayList<PVector>(),leaf=new ArrayList<PVector>();
        for(int n=0;n<=16;n++){float u=n/16.0;stem.add(knotBranchPoint(root,nx,ny,tx,ty,reach,curl,u,0));leaf.add(knotBranchPoint(root,nx,ny,tx,ty,reach,curl,u,reach*.24*(1-feather)*sin(PI*u)));}
        for(int n=16;n>=0;n--){float u=n/16.0;leaf.add(knotBranchPoint(root,nx,ny,tx,ty,reach,curl,u,-reach*.24*(1-feather)*sin(PI*u)));}
        out.add(stem);if(feather<.98)out.add(leaf);
        if(feather>.02)for(int n=1;n<=7;n++){
          float u=n/8.0,spread=reach*.25*feather*sin(PI*u);PVector base=knotBranchPoint(root,nx,ny,tx,ty,reach,curl,u,0);
          for(int sign:new int[]{-1,1}){PVector tip=knotBranchPoint(root,nx,ny,tx,ty,reach,curl,min(1,u+.15),spread*sign);ArrayList<PVector> barb=new ArrayList<PVector>();barb.add(base);barb.add(new PVector((base.x+tip.x)*.5+nx*spread*.12,(base.y+tip.y)*.5+ny*spread*.12,root.z));barb.add(tip);out.add(barb);}
        }
      }
    }
  }return out;
}
PFont knotGrowthAsciiFont,knotGrowthTextFont;
void drawKnotGrowth(PGraphics g,ArrayList<ArrayList<PVector>> paths,JSONObject p,int seed,float phase,int[] colors,JSONObject language){
  ArrayList<ArrayList<PVector>> grown=knotGrowthPaths(paths,p,seed,phase);if(grown.size()==0)return;
  int material=round(kv(p,"knotGrowthMaterial"));String voice=knotVoice(language,0);
  if(material==2)voice="/\\|+:.o*-";
  else if(language!=null&&!language.hasKey("knotText")&&!language.getString("kind","").equals("kone-form"))for(int i=1;i<languagePhraseCount(language);i++)voice+=" "+knotVoice(language,i);
  int[] glyphs=voice.codePoints().toArray();float font=kv(p,"knotGrowthTextSize");
  g.pushStyle();g.strokeCap(ROUND);g.strokeJoin(ROUND);
  if(material>0){if(knotGrowthAsciiFont==null)knotGrowthAsciiFont=createFont("Courier New",48,true);if(knotGrowthTextFont==null)knotGrowthTextFont=createFont("Microsoft JhengHei",48,true);g.textFont(material==2?knotGrowthAsciiFont:knotGrowthTextFont);g.textSize(font);g.textAlign(CENTER,CENTER);}
  for(int k=0;k<grown.size();k++){
    ArrayList<PVector> path=grown.get(k);int ink=colors[path.get(0).z>90?1:0];
    if(material==0)knotStrokePath(g,path,kv(p,"knotBranchWidth"),ink);
    else if(glyphs.length>0){
      float travel=0;int slot=0;
      for(int i=1;i<path.size();i++){
        PVector a=path.get(i-1),b=path.get(i);float dx=b.x-a.x,dy=b.y-a.y,len=sqrt(dx*dx+dy*dy);if(len<.000001)continue;float next=font*.8-travel;
        while(next<=len){float t=next/len;g.pushMatrix();g.translate(a.x+dx*t,a.y+dy*t);g.rotate(atan2(dy,dx));g.noStroke();g.fill(0xff000000|ink);g.text(new String(Character.toChars(glyphs[(slot++ +k)%glyphs.length])),0,0);g.popMatrix();next+=font*.8;}
        travel=(travel+len)%(font*.8);
      }
    }
  }g.popStyle();
}
float kv(JSONObject p, String id) {
  float fallback = 0;
  if(id.equals("knotBranchWidth")) fallback=.003;
  if(id.equals("knotWeaveTightness")) fallback=1;
  if(id.equals("knotPetalOpening")) fallback=0.7;
  if(id.equals("knotPetalLength")) fallback=0.35;
  if(id.equals("knotPetalWidth")) fallback=0.09;
  if(id.equals("knotGrowthTextSize")) fallback=0.018;
  if(id.equals("knotContactReach")) fallback=0.06;
  if(id.equals("knotGrowthSymmetry")) fallback=1;
  if(id.equals("knotBranchCurl")) fallback=0.2;
  if(id.equals("knotBranchLength")) fallback=0.1;
  if(id.equals("knotBranchAmount")) fallback=0.4;
  if(id.equals("knotTransitionLength")) fallback=0.6;
  if(id.equals("knotChangePosition")) fallback=0.2;
  if(id.equals("knotGrowthIdentity")) fallback=2;
  if(id.equals("knotTailLength")) fallback=1;
  if(id.equals("knotCurl")) fallback=.85;
  if(id.equals("knotBodySpacing")) fallback=.38;
  if(id.equals("knotCenterSize")) fallback=.035;
  if(id.equals("knotCenterY")) fallback=0;
  if(id.equals("knotCenterX")) fallback=0;
  if(id.equals("knotThreadTextSize")) fallback=.026;
  if(id.equals("knotThreadMode")) fallback=0;
  if(id.equals("knotThreadSway")) fallback=.45;
  if(id.equals("knotThreadWidth")) fallback=.003;
  if(id.equals("knotThreadSpread")) fallback=.22;
  if(id.equals("knotThreadLength")) fallback=.5;
  if(id.equals("knotThreadCount")) fallback=12;
  if(id.equals("knotAttachment")) fallback=0;
  if(id.equals("knotConnectionLength")) fallback=.12;
  if(id.equals("knotSecondShape")) fallback=7;
  if(id.equals("knotRelativeSize")) fallback=1;
  if(id.equals("knotCrossingOrder")) fallback=2;
  if(id.equals("knotContactLength")) fallback=.12;
  if(id.equals("knotWeaveSpread") || id.equals("knotFillSize")) fallback = 1;
  if(id.equals("knotFillShape") || id.equals("knotTraceColor")) fallback = -1;
  if (id.equals("knotTrace")) fallback = 1;
  if (id.equals("knotScale")) fallback = .85;
  if (id.equals("knotWidth")) fallback = .045;
  if (id.equals("knotTurns")) fallback = 3;
  if (id.equals("knotSpacing")) fallback = .055;
  return p.getFloat(id, fallback);
}

ArrayList<ArrayList<PVector>> joyPaths() {
  ArrayList<ArrayList<PVector>> result = new ArrayList<ArrayList<PVector>>();
  float[][][] base = {
    {{-.16,-.32},{.16,-.32}}, {{0,-.43},{0,-.23}},
    {{-.13,-.14},{.13,-.14},{.13,-.035},{-.13,-.035},{-.13,-.14}},
    {{-.09,.015},{-.065,.085}}, {{.09,.015},{.065,.085}},
    {{-.135,.2},{.135,.2},{.135,.39},{-.135,.39},{-.135,.2}}
  };
  for (int half = 0; half < 2; half++) for (float[][] points : base) {
    ArrayList<PVector> path = new ArrayList<PVector>();
    for (float[] v : points) path.add(new PVector(v[0] + (half == 0 ? -.225 : .225), v[1], 0));
    result.add(path);
  }
  for(float y:new float[]{-.22,.11}){ArrayList<PVector> path=new ArrayList<PVector>();path.add(new PVector(-.415,y));path.add(new PVector(.415,y));result.add(path);}
  return result;
}

ArrayList<ArrayList<PVector>> knotSingleStrands(JSONObject p, int seed, float phase) {
  int shape = round(kv(p,"knotShape")), turns = round(kv(p,"knotTurns"));
  float life = kv(p,"knotLife"), clock = sin(phase) * kv(p,"knotMotion") * TWO_PI, address = (seed % 997) / 997.0 * TWO_PI;
  ArrayList<ArrayList<PVector>> paths = new ArrayList<ArrayList<PVector>>();
  if (shape == 0) {
    int components=turns%2==0?2:1,samples=480/components;
    for(int component=0;component<components;component++){
      ArrayList<PVector> strand=new ArrayList<PVector>();
      for(int i=0;i<=samples;i++){
        float t=i/float(samples)*TWO_PI/components,twist=turns*t+component*PI,r=.30+.105*cos(twist);
        strand.add(new PVector(r*cos(2*t),r*sin(2*t),sin(twist)));
      }
      paths.add(strand);
    }
  } else if(shape>=2){
    int count=shape==4?2:1;
    for(int k=0;k<count;k++){
      ArrayList<PVector> strand=new ArrayList<PVector>();
      for(int i=0;i<=480;i++){
        float t=i/480.0*TWO_PI,x=0,y=0,z=0;
        if(shape==7){x=.38*cos(t);y=.38*sin(t);z=0;}
        else if(shape==2){x=.135*(sin(t)+2*sin(2*t));y=.135*(cos(t)-2*cos(2*t));z=-sin(3*t);}
        else if(shape==3){float r=.29+.115*cos(4*t);x=r*cos(3*t);y=r*sin(3*t);z=sin(4*t);}
        else if(shape==4){x=(k==0?-.12:.12)+.26*cos(t);y=.33*sin(t);z=(k==0?1:-1)*sin(t);}
        else if(shape==5){int n=max(2,min(5,turns));float a=sin((n+1)*t),b=sin(n*t+.24);x=.39*2/PI*asin(a);y=.39*2/PI*asin(b);z=cos((2*n+1)*t);}
        else{int n=max(3,turns+2);float r=.26+.15*cos(n*t);x=r*cos(2*t);y=r*sin(2*t);z=sin(n*t);}
        strand.add(new PVector(x,y,z));
      }
      paths.add(strand);
    }
  } else for (ArrayList<PVector> path : joyPaths()) {
    ArrayList<PVector> strand = new ArrayList<PVector>();
    for (int j = 0; j < path.size()-1; j++) {
      PVector a=path.get(j), b=path.get(j+1);
      int count=max(4,ceil(dist(a.x,a.y,b.x,b.y)*140));
      for (int i=0;i<count;i++) strand.add(new PVector(lerp(a.x,b.x,i/float(count)),lerp(a.y,b.y,i/float(count)),0));
    }
    strand.add(path.get(path.size()-1).copy()); paths.add(strand);
  }
  boolean woven=round(kv(p,"knotMaterial"))==5;
  ArrayList<ArrayList<PVector>> result=new ArrayList<ArrayList<PVector>>();
  for (int k=0;k<paths.size();k++) for(int side=0;side<(woven?2:1);side++) {
    ArrayList<PVector> path=paths.get(k), strand=new ArrayList<PVector>();
    for (int i=0;i<path.size();i++) {
      PVector v=path.get(i),prev=path.get(max(0,i-1)),next=path.get(min(path.size()-1,i+1));
      float dx=next.x-prev.x,dy=next.y-prev.y,len=max(.00001,sqrt(dx*dx+dy*dy));
      float t=i/float(path.size()-1)*TWO_PI,weave=t*turns+side*PI+clock;
      float offset=woven?sin(weave)*kv(p,"knotWidth")*.65*kv(p,"knotWeaveSpread")/(kv(p,"knotPetalAmount")>0?kv(p,"knotWeaveTightness"):1):0;
      float swell=1+life*.14*sin(t*3+address+clock*(1+k%2));
      float x=v.x*swell-dy/len*offset+life*.015*sin(t*7+clock),y=v.y*swell+dx/len*offset;
      float stretch=exp(kv(p,"knotStretch")*.7);
      x*=stretch;y/=stretch;
      x+=kv(p,"knotBend")*.8*y*y;
      float angle=kv(p,"knotTwist")*PI*4*(x*x+y*y),cs=cos(angle),sn=sin(angle);
      float rx=x*cs-y*sn,ry=x*sn+y*cs;
      x=rx+kv(p,"knotRipple")*.035*sin(ry*18+clock);
      y=ry+kv(p,"knotRipple")*.035*sin(rx*18-clock);
      strand.add(petalPoint(new PVector(x,y,woven?cos(weave):v.z),p));
    }
    result.add(strand);
  }
  return result;
}

ArrayList<ArrayList<PVector>> relatedKnotStrands(ArrayList<ArrayList<PVector>> first,ArrayList<ArrayList<PVector>> second,JSONObject p,float phase){
 int mode=round(kv(p,"knotConnected"));float a=kv(p,"knotContactPosition")*TWO_PI,nx=cos(a),ny=sin(a),scale=kv(p,"knotRelativeSize"),contact=kv(p,"knotContactLength"),gap=kv(p,"knotSeparation"),motion=kv(p,"knotMotion");
 ArrayList<ArrayList<PVector>> other=new ArrayList<ArrayList<PVector>>();
 for(ArrayList<PVector> path:second){ArrayList<PVector> copy=new ArrayList<PVector>();for(PVector v:path)copy.add(new PVector(v.x*scale,v.y*scale,v.z+100));other.add(copy);}
 if(mode==3){PVector anchor=first.get(0).get(0),tip=other.get(0).get(0);for(ArrayList<PVector> path:first)for(PVector v:path)if(v.x*nx+v.y*ny>anchor.x*nx+anchor.y*ny)anchor=v;for(ArrayList<PVector> path:other)for(PVector v:path)if(v.x*nx+v.y*ny<tip.x*nx+tip.y*ny)tip=v;
  float pull=gap*.35-contact*.45,dx=anchor.x-tip.x+nx*pull,dy=anchor.y-tip.y+ny*pull;for(ArrayList<PVector> path:other)for(PVector v:path){v.x+=dx;v.y+=dy;}
 }else{other.clear();float squash=.15+contact*1.5,travel=.16+gap*.45+sin(phase)*motion*.16;for(ArrayList<PVector> path:second){ArrayList<PVector> copy=new ArrayList<PVector>();for(PVector v:path){float x=v.x*scale,y=v.y*scale;copy.add(new PVector(x*nx-y*squash*ny+nx*travel,x*ny+y*squash*nx+ny*travel,100+constrain(y*12,-8,8)));}other.add(copy);}}
 ArrayList<ArrayList<PVector>> combined=new ArrayList<ArrayList<PVector>>();combined.addAll(first);combined.addAll(other);float minX=Float.MAX_VALUE,minY=Float.MAX_VALUE,maxX=-Float.MAX_VALUE,maxY=-Float.MAX_VALUE;for(ArrayList<PVector> path:combined)for(PVector v:path){minX=min(minX,v.x);maxX=max(maxX,v.x);minY=min(minY,v.y);maxY=max(maxY,v.y);}
 float fit=.86/max(1,max(maxX-minX,maxY-minY)),cx=(minX+maxX)/2,cy=(minY+maxY)/2;for(ArrayList<PVector> path:combined)for(PVector v:path){v.x=(v.x-cx)*fit;v.y=(v.y-cy)*fit;}return combined;
}
ArrayList<ArrayList<PVector>> knotStrands(JSONObject p,int seed,float phase){
  if(kv(p,"knotMix")>=.5&&round(kv(p,"knotConnected"))==2)return centerKnotStrands(p,phase);
  ArrayList<ArrayList<PVector>> first=knotSingleStrands(p,seed,phase);
  if(kv(p,"knotMix")<.5)return first;
  float separation=kv(p,"knotSeparation"),scale=kv(p,"knotRelativeSize");
  JSONObject secondParams=JSONObject.parse(p.toString());secondParams.setInt("knotShape",round(kv(p,"knotSecondShape")));
  ArrayList<ArrayList<PVector>> second=knotSingleStrands(secondParams,seed,phase);
  if(kv(p,"knotConnected")>=3)return relatedKnotStrands(first,second,p,phase);
  for(ArrayList<PVector> path:first)for(PVector v:path)v.x-=separation*.5;
  for(ArrayList<PVector> path:second)for(PVector v:path){v.x=v.x*scale+separation*.5;v.y*=scale;v.z+=100;}
  first.addAll(second);return first;
}
int knotPathInk(ArrayList<PVector> path,int index,boolean mixed,int[] colors){return colors[mixed?(path.get(0).z>90?1:0):index%2];}

float knotDistance(float x,float y,PVector a,PVector b) {
  float dx=b.x-a.x,dy=b.y-a.y,t=constrain(((x-a.x)*dx+(y-a.y)*dy)/max(.000000000001,dx*dx+dy*dy),0,1);
  return dist(x,y,a.x+t*dx,a.y+t*dy);
}

void knotLine(PGraphics g,PVector a,PVector b,float weight,int ink) {
  g.stroke(0xff000000 | ink);g.strokeWeight(weight);g.line(a.x,a.y,b.x,b.y);
}

class KnotSegment {
  PVector a,b; int k,i; ArrayList<PVector> path;
  KnotSegment(PVector a,PVector b,int k,int i,ArrayList<PVector> path){this.a=a;this.b=b;this.k=k;this.i=i;this.path=path;}
}
class KnotCrossing {
  ArrayList<PVector> over,under;int at,other;
  KnotCrossing(KnotSegment a,KnotSegment b){over=a.path;at=a.i;under=b.path;other=b.i;}
}
java.util.IdentityHashMap<ArrayList<ArrayList<PVector>>,ArrayList<KnotCrossing>> knotCrossingCache=new java.util.IdentityHashMap<ArrayList<ArrayList<PVector>>,ArrayList<KnotCrossing>>();
void knotStrokePath(PGraphics g,ArrayList<PVector> path,float weight,int ink){
  if(path.size()<2)return;g.noFill();g.stroke(0xff000000|ink);g.strokeWeight(weight);g.beginShape();for(PVector v:path)g.vertex(v.x,v.y);g.endShape();
}
ArrayList<PVector> knotPatch(ArrayList<PVector> path,int at,float reach){
  int first=at,last=at+1;float d=0;
  while(first>0&&d<reach){d+=dist(path.get(first).x,path.get(first).y,path.get(first-1).x,path.get(first-1).y);first--;}
  d=0;while(last<path.size()-1&&d<reach){d+=dist(path.get(last+1).x,path.get(last+1).y,path.get(last).x,path.get(last).y);last++;}
  return new ArrayList<PVector>(path.subList(first,last+1));
}
void knotRibbon(PGraphics g,ArrayList<ArrayList<PVector>> strands,float weight,boolean ghost,int[] colors,JSONObject p,float phase){
  boolean mixed=false;for(ArrayList<PVector> path:strands)if(path.get(0).z>90)mixed=true;
  for(int k=0;k<strands.size();k++){knotPetalSurface(g,strands.get(k),p,weight,1.32,colors[3]);knotPetalSurface(g,strands.get(k),p,weight,1,ghost?colors[1]:knotPathInk(strands.get(k),k,mixed,colors));}
  if(ghost)return;
  ArrayList<KnotCrossing> crossings=knotCrossingCache.get(strands);
  if(crossings==null){
    int between=0;crossings=new ArrayList<KnotCrossing>();ArrayList<KnotSegment> segments=new ArrayList<KnotSegment>();
    for(int k=0;k<strands.size();k++){ArrayList<PVector> path=strands.get(k);for(int i=0;i<path.size()-1;i++)segments.add(new KnotSegment(path.get(i),path.get(i+1),k,i,path));}
    for(int i=0;i<segments.size();i++)for(int j=i+1;j<segments.size();j++){
      KnotSegment a=segments.get(i),b=segments.get(j);
      if(a.k==b.k&&(abs(a.i-b.i)<5||abs(a.i-b.i)>a.path.size()-6))continue;
      if(max(a.a.x,a.b.x)<min(b.a.x,b.b.x)||max(b.a.x,b.b.x)<min(a.a.x,a.b.x)||max(a.a.y,a.b.y)<min(b.a.y,b.b.y)||max(b.a.y,b.b.y)<min(a.a.y,a.b.y))continue;
      float dx=a.b.x-a.a.x,dy=a.b.y-a.a.y,ex=b.b.x-b.a.x,ey=b.b.y-b.a.y,den=dx*ey-dy*ex;
      if(abs(den)<.000000000001)continue;
      float rx=b.a.x-a.a.x,ry=b.a.y-a.a.y,t=(rx*ey-ry*ex)/den,u=(rx*dy-ry*dx)/den;
      if(t<0||t>=1||u<0||u>=1)continue;
      float az=lerp(a.a.z,a.b.z,t),bz=lerp(b.a.z,b.b.z,u);boolean different=(az>90)!=(bz>90);if(!different&&abs(az-bz)<.05)continue;
      int order=round(kv(p,"knotCrossingOrder"));boolean firstOver=order==0?true:order==1?false:kv(p,"knotConnected")==4?(az>90?az-100:bz-100)<0:between++%2==0;
      boolean aOver=different?((az<90)==firstOver):az>bz;
      crossings.add(aOver?new KnotCrossing(a,b):new KnotCrossing(b,a));
    }
    knotCrossingCache.put(strands,crossings);
  }
  if(mixed)g.strokeCap(SQUARE);
  for(KnotCrossing crossing:crossings){ArrayList<PVector> path=knotPatch(crossing.over,crossing.at,petalWidth(crossing.over.get(crossing.at),p,weight)*1.25);knotPetalSurface(g,path,p,weight,1.32,colors[3]);knotPetalSurface(g,path,p,weight,1,knotPathInk(crossing.over,strands.indexOf(crossing.over),mixed,colors));}
  if(mixed)g.strokeCap(ROUND);
  float impossible=kv(p,"knotImpossible");
  if(kv(p,"knotTrace")>=.5&&impossible>0&&crossings.size()>0){
    KnotCrossing crossing=crossings.get(floor((((kv(p,"knotMotion")>0?phase:0)/TWO_PI)%1+1)%1*crossings.size()));
    ArrayList<PVector> path=knotPatch(crossing.under,crossing.other,weight*1.25);
    ArrayList<PVector> half=new ArrayList<PVector>(path.subList(0,min(path.size(),ceil(path.size()/2.0)+1)));
    knotStrokePath(g,half,weight*1.32,colors[3]);knotStrokePath(g,half,weight,colors[2]);PVector point=half.get(half.size()-1);
    knotLine(g,point,new PVector(point.x+weight*.6*impossible,point.y-weight*.6*impossible),weight*.3,colors[2]);
  }
}

void knotText(PGraphics g,String text,float fontSize,int ink){
  if(text.equals(str((char)0x56cd))){g.pushMatrix();g.scale(fontSize);for(ArrayList<PVector> path:joyPaths())for(int i=1;i<path.size();i++)knotLine(g,path.get(i-1),path.get(i),.055,ink);g.popMatrix();}
  else {g.fill(0xff000000|ink);g.noStroke();g.textSize(fontSize);g.text(text,0,0);}
}

String knotVoice(JSONObject language,int slot){
  if(language==null)return "JOY";
  if(language.hasKey("knotText"))return language.getString("knotText", "JOY");
  if(language.getString("kind", "").equals("kone-form"))return "JOY";
  return languagePhraseAt(language,slot%languagePhraseCount(language));
}

void drawKnot(PGraphics g,int width,int height,JSONObject p,int seed,float phase,int[] colors,JSONObject language) {
  if(kv(p,"knotMix")>=.5&&round(kv(p,"knotConnected"))==1){drawConnectedKnot(g,width,height,p,seed,phase,colors,language);return;}
  if(kv(p,"knotTraceColor")>=0){colors=colors.clone();colors[2]=round(kv(p,"knotTraceColor"));}
  knotCrossingCache.clear();
  float size=min(width,height)*kv(p,"knotScale"),band=kv(p,"knotWidth"),abundance=kv(p,"knotAbundance"),motion=kv(p,"knotMotion");
  int material=round(kv(p,"knotMaterial"));
  ArrayList<ArrayList<PVector>> paths=knotStrands(p,seed,phase);
  g.pushMatrix();g.translate(width*.5,height*.5);g.rotate(radians(kv(p,"knotRotation")));g.scale(size);g.strokeCap(ROUND);g.strokeJoin(ROUND);
  for(int m=round(kv(p,"knotMemory"));m>0;m--) {g.pushMatrix();g.rotate(m*.055);g.scale(1+m*.035);knotRibbon(g,knotStrands(p,seed,phase-m*.18),band*.22,true,colors,p,phase);g.popMatrix();}
  if(material==0||material==5) knotRibbon(g,paths,material==5?band*.48:band,false,colors,p,phase);
  else if(material==4) {
    for(int k=0;k<paths.size();k++) {
      ArrayList<PVector> path=paths.get(k);float travel=motion>0?phase/TWO_PI*kv(p,"knotSpacing"):0;int slot=0;
      for(int i=1;i<path.size();i++) {
        PVector a=path.get(i-1),b=path.get(i);travel+=dist(a.x,a.y,b.x,b.y);
        if(travel<kv(p,"knotSpacing"))continue;travel=0;
        g.pushMatrix();g.translate(b.x,b.y);g.rotate(atan2(b.y-a.y,b.x-a.x));g.fill(0xff000000|colors[k%2]);g.noStroke();
        g.textAlign(CENTER,CENTER);g.textSize(kv(p,"knotSpacing")*.7);
        knotText(g,knotVoice(language,slot++),kv(p,"knotSpacing")*.7,colors[k%2]);g.popMatrix();
      }
    }
  } else {
    float spacing=kv(p,"knotSpacing")/(1+abundance),radius=(band+kv(p,"knotPetalWidth")*kv(p,"knotPetalAmount"))*.5+abundance*.025;
    int fillShape=kv(p,"knotFillShape")<0?(material==2?1:0):round(kv(p,"knotFillShape"));
    JSONObject miniParams=new JSONObject();miniParams.setFloat("knotTurns",3);miniParams.setInt("knotShape",fillShape);
    ArrayList<ArrayList<PVector>> mini=knotStrands(miniParams,0,0);
    ArrayList<ArrayList<PVector>> joy=joyPaths();
    float minX=-.52,maxX=.52,minY=-.52,maxY=.52;
    if(kv(p,"knotMix")>=.5||kv(p,"knotPetalAmount")>0){minX=Float.MAX_VALUE;minY=Float.MAX_VALUE;maxX=-Float.MAX_VALUE;maxY=-Float.MAX_VALUE;for(ArrayList<PVector> path:paths)for(PVector v:path){minX=min(minX,v.x-radius);maxX=max(maxX,v.x+radius);minY=min(minY,v.y-radius);maxY=max(maxY,v.y+radius);}}
    for(float y=minY;y<=maxY;y+=spacing)for(float x=minX;x<=maxX;x+=spacing) {
      boolean inside=false;
      for(ArrayList<PVector> path:paths) {for(int i=1;i<path.size();i++)if(knotDistance(x,y,path.get(i-1),path.get(i))<=petalWidth(path.get(i),p,band)*.5+abundance*.025){inside=true;break;}if(inside)break;}
      if(!inside)continue;
      g.pushMatrix();g.translate(x,y);g.scale(spacing*.83*kv(p,"knotFillSize"));
      if((material==1||material==2)&&fillShape==1) {for(ArrayList<PVector> path:joy)for(int i=1;i<path.size();i++)knotLine(g,path.get(i-1),path.get(i),.055,colors[0]);}
      else if(material==1||material==2) knotRibbon(g,mini,.08,false,colors,p,phase);
      else {
        String[] glyphs={"/","\\","+","o"};int slot=abs(round((x+.6)/spacing)+round((y+.6)/spacing)*7);
        g.noStroke();g.fill(0xff000000|colors[0]);g.textAlign(CENTER,CENTER);g.textSize(.85);
        knotText(g,material==6?(knotVoice(language,slot)):glyphs[slot%glyphs.length],.85,colors[0]);
      }
      g.popMatrix();
    }
  }
  drawKnotGrowth(g,paths,p,seed,phase,colors,language);
  if(kv(p,"knotTrace")>=.5&&motion>0) {ArrayList<PVector> path=paths.get(0);float t=((phase/TWO_PI)%1+1)%1;PVector dot=path.get(floor(t*(path.size()-1)));g.noStroke();g.fill(0xff000000|colors[2]);g.ellipse(dot.x,dot.y,band*.72,band*.72);}
  if(kv(p,"knotMix")>=.5&&round(kv(p,"knotConnected"))==2){g.noStroke();g.fill(0xff000000|colors[2]);g.ellipse(kv(p,"knotCenterX"),kv(p,"knotCenterY"),kv(p,"knotCenterSize")*2,kv(p,"knotCenterSize")*2);}
  g.popMatrix();
}

PImage knotForm(JSONObject form) {
  PGraphics g=createGraphics(targetWidth,targetHeight,P2D);g.beginDraw();g.smooth(4);
  int[] colors=new int[4];for(int i=0;i<4;i++)colors[i]=palette.getInt(i);
  if(form.getJSONObject("parameters").getFloat("_structureIsolated",0)>=.5)g.clear();else g.background(0xff000000|colors[3]);g.textFont(createFont("Microsoft JhengHei",48,true));
  drawKnot(g,targetWidth,targetHeight,form.getJSONObject("parameters"),form.getInt("seed",renderSeed),materialPhase,colors,form);
  g.endDraw();return g.get();
}

ArrayList<ArrayList<PVector>> centerKnotStrands(JSONObject p,float phase){
  ArrayList<ArrayList<PVector>> paths=new ArrayList<ArrayList<PVector>>();
  boolean woven=round(kv(p,"knotMaterial"))==5;
  float clock=sin(phase)*kv(p,"knotMotion");
  for(int k=0;k<2;k++)for(int side=0;side<(woven?2:1);side++){
    ArrayList<PVector> path=new ArrayList<PVector>();
    for(int i=0;i<=480;i++){
      float t=i/480.0,u=1-t,angle=k*PI+u*kv(p,"knotCurl")*TWO_PI+clock*u*.65;
      float weave=t*TWO_PI*kv(p,"knotTurns")+side*PI+clock;
      float offset=woven?sin(weave)*kv(p,"knotWidth")*.65*kv(p,"knotWeaveSpread")/(kv(p,"knotPetalAmount")>0?kv(p,"knotWeaveTightness"):1):0;
      float radius=.065+kv(p,"knotBodySpacing")*u+offset;
      path.add(petalPoint(new PVector(kv(p,"knotCenterX")*t*t+cos(angle)*radius,kv(p,"knotCenterY")*t*t+sin(angle)*radius*kv(p,"knotTailLength"),k*100+(woven?cos(weave):sin(t*TWO_PI*3))),p));
    }paths.add(path);
  }return paths;
}
PVector knotAnchor(ArrayList<ArrayList<PVector>> paths,float attachment,boolean bottom){
  float extent=0;for(ArrayList<PVector> path:paths)for(PVector v:path)extent=max(extent,abs(v.x));
  float targetX=attachment*extent,bestScore=-Float.MAX_VALUE;PVector best=paths.get(0).get(0);
  for(ArrayList<PVector> path:paths)for(PVector v:path){float score=(bottom?v.y:-v.y)-abs(v.x-targetX)*1.5;if(score>bestScore){bestScore=score;best=v;}}
  return best.copy();
}
void drawConnectedKnot(PGraphics g,int width,int height,JSONObject p,int seed,float phase,int[] colors,JSONObject language){
  JSONObject body=JSONObject.parse(p.toString());
  for(String key:new String[]{"knotMix","knotConnected","knotMotion","knotRotation","knotTrace"})body.setFloat(key,0);
  body.setFloat("knotScale",1);
  JSONObject upper=JSONObject.parse(body.toString());upper.setInt("knotShape",round(kv(p,"knotSecondShape")));
  ArrayList<ArrayList<PVector>> mainPaths=knotStrands(body,seed,0),upperPaths=knotStrands(upper,seed,0);
  float upperScale=kv(p,"knotRelativeSize")*.35;
  PVector top=knotAnchor(mainPaths,kv(p,"knotAttachment"),false),bottom=knotAnchor(mainPaths,kv(p,"knotAttachment"),true),join=knotAnchor(upperPaths,0,true);
  float upperX=top.x-join.x*upperScale,upperY=top.y-kv(p,"knotConnectionLength")-join.y*upperScale;
  ArrayList<PVector> connector=new ArrayList<PVector>();connector.add(new PVector(join.x*upperScale+upperX,join.y*upperScale+upperY));connector.add(top);
  ArrayList<ArrayList<PVector>> threads=new ArrayList<ArrayList<PVector>>();
  int count=round(kv(p,"knotThreadCount"));float sway=kv(p,"knotThreadSway")*kv(p,"knotMotion");
  for(int k=0;k<count;k++){
    float lane=count==1?0:k/float(count-1)-.5,length=kv(p,"knotThreadLength")*(.9+.1*cos(k*2.399));
    ArrayList<PVector> path=new ArrayList<PVector>();
    for(int i=0;i<=80;i++){
      float t=i/80.0,wind=sway*.22*(sin(phase)*(.6+.4*cos(k*.7))+sin(phase*2)*.25*sin(t*4+k*.3));
      path.add(new PVector(bottom.x+lane*kv(p,"knotThreadSpread")*t+wind*t*t,bottom.y+length*t));
    }threads.add(path);
  }
  float minX=bottom.x-kv(p,"knotThreadSpread")*.5-sway*.3,maxX=bottom.x+kv(p,"knotThreadSpread")*.5+sway*.3,minY=Float.MAX_VALUE,maxY=bottom.y+kv(p,"knotThreadLength");
  for(ArrayList<PVector> path:mainPaths)for(PVector v:path){minX=min(minX,v.x);maxX=max(maxX,v.x);minY=min(minY,v.y);maxY=max(maxY,v.y);}
  for(ArrayList<PVector> path:upperPaths)for(PVector v:path){float x=v.x*upperScale+upperX,y=v.y*upperScale+upperY;minX=min(minX,x);maxX=max(maxX,x);minY=min(minY,y);maxY=max(maxY,y);}
  float margin=.08+(kv(p,"knotGrowth")>=.5?kv(p,"knotBranchLength")*1.8:0)+kv(p,"knotPetalWidth")*kv(p,"knotPetalAmount");
  minX-=margin;maxX+=margin;minY-=margin;maxY+=margin;
  float scale=min(width/(maxX-minX),height/(maxY-minY))*kv(p,"knotScale");
  g.pushStyle();g.pushMatrix();g.translate(width*.5,height*.5);g.rotate(radians(kv(p,"knotRotation")));g.scale(scale);g.translate(-(minX+maxX)*.5,-(minY+maxY)*.5);g.strokeCap(ROUND);
  knotStrokePath(g,connector,kv(p,"knotThreadWidth")*1.5,colors[1]);
  String voice=knotVoice(language,0);
  if(language!=null&&!language.hasKey("knotText")&&!language.getString("kind","").equals("kone-form")){
    for(int i=1;i<languagePhraseCount(language);i++)voice+=" "+knotVoice(language,i);
  }
  if(round(kv(p,"knotThreadMode"))==2)voice="/\\|+:.o*-";
  int[] glyphs=voice.codePoints().toArray();float font=kv(p,"knotThreadTextSize");
  for(int k=0;k<threads.size();k++){
    ArrayList<PVector> path=threads.get(k);
    if(kv(p,"knotThreadMode")<.5)knotStrokePath(g,path,kv(p,"knotThreadWidth"),colors[k%2]);
    else if(glyphs.length>0){
      float travel=0;int slot=0;
      for(int i=1;i<path.size();i++){
        PVector a=path.get(i-1),b=path.get(i);travel+=dist(a.x,a.y,b.x,b.y);if(travel<font*.9)continue;travel=0;
        String glyph=new String(Character.toChars(glyphs[(slot++ +k)%glyphs.length]));
        g.pushMatrix();g.translate(b.x,b.y);g.rotate(atan2(b.y-a.y,b.x-a.x)-HALF_PI);g.textAlign(CENTER,CENTER);g.textSize(font);g.fill(0xff000000|colors[k%2]);g.noStroke();g.text(glyph,0,0);g.popMatrix();
      }
    }
  }
  drawKnotGrowth(g,threads,p,seed,phase,colors,language);
  g.pushMatrix();g.translate(-.5,-.5);drawKnot(g,1,1,body,seed,0,colors,language);g.popMatrix();
  g.pushMatrix();g.translate(upperX-upperScale*.5,upperY-upperScale*.5);g.scale(upperScale);drawKnot(g,1,1,upper,seed,0,colors,language);g.popMatrix();
  if(kv(p,"knotTrace")>=.5&&kv(p,"knotMotion")>0){ArrayList<PVector> path=threads.get(0);PVector v=path.get(floor((((phase/TWO_PI)%1+1)%1)*(path.size()-1)));g.noStroke();g.fill(0xff000000|(kv(p,"knotTraceColor")>=0?round(kv(p,"knotTraceColor")):colors[2]));g.ellipse(v.x,v.y,kv(p,"knotThreadWidth")*5,kv(p,"knotThreadWidth")*5);}
  g.popMatrix();g.popStyle();
}
