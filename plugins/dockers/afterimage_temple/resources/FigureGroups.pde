// Original group geometry, matching figureGroups.ts. Coordinates use the short canvas edge.
double gv(JSONObject p,String id){
  if(p.hasKey(id))return p.getDouble(id);
  if(id.equals("danceCount"))return 5;if(id.equals("rowsCount"))return 35;if(id.equals("ringCount"))return 9;if(id.equals("clusterCount"))return 27;
  if(id.equals("groupX"))return .5d;if(id.equals("groupY"))return .52d;if(id.equals("groupSpread"))return .9d;if(id.equals("groupDepth"))return .5d;
  if(id.equals("groupSize")||id.equals("groupPresence")||id.equals("danceContact")||id.equals("groupGround")||id.equals("groupAccent")||id.equals("groupSoloScale")||id.equals("figureHead")||id.equals("figureBuild")||id.equals("figureArms")||id.equals("figureLegs"))return 1;
  if(id.equals("groupVariation"))return .18d;if(id.equals("groupPose"))return 18;if(id.equals("danceLean"))return .2d;
  if(id.equals("groupHorizon"))return .6d;if(id.equals("groupGroundCurve"))return .12d;if(id.equals("groupMotion"))return .3d;if(id.equals("groupTogether"))return .85d;
  if(id.equals("groupSelected"))return -1;if(id.equals("groupSoloPose"))return 2;return 0;
}
double gh(int seed,int n){double v=Math.sin(seed*.013d+n*127.1d)*43758.5453d;return v-Math.floor(v);}
double clampGroup(double v,double lo,double hi){return Math.max(lo,Math.min(hi,v));}
String groupCountKey(int mode){return mode==2?"danceCount":mode==3?"rowsCount":mode==4?"ringCount":"clusterCount";}
class GroupPerson {
  int id;double x,y,size;double[] q,head;ArrayList<double[]> segments=new ArrayList<double[]>();boolean accent,missing,still,different;
}
double[] groupSkeleton(int pose,JSONObject p){
  float[] src=figurePosePoints[constrain(pose,0,23)];double[] q=new double[26];for(int i=0;i<26;i++)q[i]=src[i];
  int[][] chains={{2,3,4},{5,6,7},{8,9,10},{8,11,12}};
  for(int c=0;c<4;c++){double length=gv(p,c<2?"figureArms":"figureLegs");if(length==1)continue;int root=chains[c][0];for(int j=1;j<3;j++)for(int axis=0;axis<2;axis++){int at=chains[c][j]*2+axis;q[at]=q[root*2+axis]+(q[at]-q[root*2+axis])*length;}}
  for(int j=0;j<13;j++)q[j*2]+=(q[17]-q[j*2+1])*gv(p,"figureLean");return q;
}
void groupSegment(GroupPerson a,int i,int j,double ra,double rb,double r){a.segments.add(new double[]{a.q[i*2],a.q[i*2+1],a.q[j*2],a.q[j*2+1],ra*r,rb*r});}
void groupCurve(GroupPerson a,int i,int m,int j,double ra,double rb,double r){double px=a.q[i*2],py=a.q[i*2+1];for(int k=1;k<=10;k++){double t=k/10.0d,u=1-t,x=u*u*a.q[i*2]+2*u*t*a.q[m*2]+t*t*a.q[j*2],y=u*u*a.q[i*2+1]+2*u*t*a.q[m*2+1]+t*t*a.q[j*2+1];a.segments.add(new double[]{px,py,x,y,r*(ra+(rb-ra)*(k-1)/10),r*(ra+(rb-ra)*t)});px=x;py=y;}}
ArrayList<GroupPerson> groupScene(int w,int h,JSONObject p,int seed,double phase){
  int mode=(int)gv(p,"symbolField"),count=(int)Math.round(gv(p,groupCountKey(mode)));double shortEdge=Math.min(w,h),aspect=w/shortEdge,vertical=h/shortEdge,spread=gv(p,"groupSpread")*aspect,depth=gv(p,"groupDepth")*vertical,cx=aspect*gv(p,"groupX"),cy=vertical*gv(p,"groupY");
  int cols=(int)Math.ceil(Math.sqrt(count*aspect/vertical*1.15d)),rows=(int)Math.ceil((double)count/cols);double[][] nodes=new double[count][3];
  int focus=0;double nearest=1e9;
  for(int i=0;i<count;i++){
    double x=0,y=0,size=0;
    if(mode==2||mode==4){double gap=mode==2?gv(p,"danceOpening")*Math.PI*.9d:0,angle=Math.PI/2+gap/2+(mode==4?Math.max(0,i-1):i)*(Math.PI*2-gap)/(mode==4?count-1:count);x=mode==4&&i==0?0:Math.cos(angle)*spread*.43d;y=mode==4&&i==0?0:Math.sin(angle)*depth*.43d;size=(mode==2?.54d*Math.sqrt(5.0d/count):.4d*Math.sqrt(9.0d/count))*(1+.12d*Math.sin(angle));}
    else if(mode==3){int row=i/cols,col=i%cols,inRow=Math.min(cols,count-row*cols);x=(col+.5d-inRow/2.0d+(row%2)*.25d)*spread/cols;y=((row+.5d)/rows-.5d)*depth;size=Math.min(spread/cols*1.55d,depth/rows*1.65d);}
    else {double angle=i*2.399963229728653d,radius=Math.sqrt((i+.5d)/count);x=Math.cos(angle)*radius*spread*.47d;y=Math.sin(angle)*radius*depth*.47d;size=.28d*Math.sqrt(27.0d/count);}
    x+=(gh(seed,i*3)-.5d)*.08d*gv(p,"groupVariation");y+=(gh(seed,i*3+1)-.5d)*.07d*gv(p,"groupVariation");
    nodes[i]=new double[]{cx+x*(1-gv(p,"groupPull")*.55d),cy+y*(1-gv(p,"groupPull")*.55d),size*gv(p,"groupSize")*(1+(gh(seed,i*3+2)-.5d)*gv(p,"groupVariation")*.35d)};
    double distance=Math.hypot(nodes[i][0]-cx,nodes[i][1]-cy);if(distance<nearest){nearest=distance;focus=i;}
  }
  if(gv(p,"groupSelected")>=0)focus=Math.min(count-1,(int)Math.round(gv(p,"groupSelected")));
  ArrayList<GroupPerson> people=new ArrayList<GroupPerson>();int[] dancePoses={2,21,0,20,14,11,3,2,21};
  for(int i=0;i<count;i++){
    GroupPerson a=new GroupPerson();a.id=i;boolean selected=gv(p,"groupException")>=.5&&i==focus;a.still=selected&&gv(p,"groupStill")>=.5;a.different=selected&&gv(p,"groupPoseDifferent")>=.5;
    double time=a.still?0:phase,offset=i*1.73d*(1-gv(p,"groupTogether")),sway=(Math.sin(time+offset)-Math.sin(offset))*gv(p,"groupMotion");
    int pose=a.different?(int)gv(p,"groupSoloPose"):mode==2?dancePoses[i%9]:(int)gv(p,"groupPose");double[] q=groupSkeleton(pose,p);
    a.size=nodes[i][2]*(selected?gv(p,"groupSoloScale"):1);a.q=new double[26];double angle=(mode==2?gv(p,"danceLean")*Math.sin(i*1.7d):0)+(gh(seed,i+701)-.5d)*gv(p,"groupVariation")*.35d+sway*.12d+(selected?gv(p,"groupSoloTurn")*Math.PI/180:0),cs=Math.cos(angle),sn=Math.sin(angle),mirror=selected&&gv(p,"groupMirror")>=.5?-1:1;
    a.x=nodes[i][0]+sway*.025d;a.y=nodes[i][1]+sway*.012d;
    for(int j=0;j<13;j++){double dx=(q[j*2]-q[16])*a.size*.75d*mirror,dy=(q[j*2+1]-q[17])*a.size;a.q[j*2]=a.x+dx*cs-dy*sn;a.q[j*2+1]=a.y+dx*sn+dy*cs;}
    a.accent=selected&&gv(p,"groupAccent")>=.5;a.missing=selected&&gv(p,"groupMissing")>=.5;people.add(a);
  }
  if(mode==2){double[][] joints=new double[count][2];
    for(int i=0;i<count;i++){GroupPerson a=people.get(i),b=people.get((i+1)%count);joints[i]=a.still?new double[]{a.q[14],a.q[15]}:b.still?new double[]{b.q[8],b.q[9]}:new double[]{(a.x+b.x)/2,(a.y+b.y)/2-Math.min(a.size,b.size)*.25d};}
    for(int i=0;i<count;i++){GroupPerson a=people.get(i);if(a.still||a.different)continue;
      for(int hand=0;hand<2;hand++){int shoulder=hand==0?2:5,elbow=hand==0?3:6,wrist=hand==0?4:7,edge=hand==0?(i+count-1)%count:i;double contact=gv(p,"danceContact")*(edge==count-1?1-gv(p,"danceOpening"):1);a.q[wrist*2]+=(joints[edge][0]-a.q[wrist*2])*contact;a.q[wrist*2+1]+=(joints[edge][1]-a.q[wrist*2+1])*contact;double ax=a.q[shoulder*2],ay=a.q[shoulder*2+1],bx=a.q[wrist*2],by=a.q[wrist*2+1];a.q[elbow*2]=(ax+bx)/2;a.q[elbow*2+1]=(ay+by)/2+a.size*.06d*Math.sin(i*2.3d+edge);}
    }
  }
  for(GroupPerson a:people){double r=a.size*gv(p,"figureBuild");groupSegment(a,0,1,.018d,.024d,r);groupSegment(a,1,8,.033d,.048d,r);groupSegment(a,2,5,.025d,.025d,r);groupCurve(a,2,3,4,.022d,.012d,r);groupCurve(a,5,6,7,.022d,.012d,r);groupCurve(a,8,9,10,.035d,.015d,r);groupCurve(a,8,11,12,.035d,.015d,r);
    for(int ankle:new int[]{10,12})a.segments.add(new double[]{a.q[ankle*2],a.q[ankle*2+1],a.q[ankle*2]+a.size*.04d*(a.q[ankle*2]<a.x?-1:1),a.q[ankle*2+1]+a.size*.007d,r*.017d,r*.01d});double head=gv(p,"figureHead");a.head=new double[]{a.q[0],a.q[1],a.size*.047d*head,a.size*.061d*head};
  }return people;
}
PImage figureGroupComposition(JSONObject form){
  JSONObject p=form.getJSONObject("parameters");int w=targetWidth,h=targetHeight;double shortEdge=Math.min(w,h),holeX=w*gv(p,"groupX"),holeY=h*gv(p,"groupY"),rx=w*gv(p,"groupSpread")*gv(p,"groupHole")*.36d,ry=h*gv(p,"groupDepth")*gv(p,"groupHole")*.36d;
  int[][] rgb=new int[4][3];for(int i=0;i<4;i++){int c=paletteColor(i);rgb[i]=new int[]{(c>>16)&255,(c>>8)&255,c&255};}
  PImage out=createImage(w,h,RGB);out.loadPixels();
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){double u=x/(double)w-.5d,horizon=h*(gv(p,"groupHorizon")+gv(p,"groupGroundCurve")*(u*u*4-.5d));int[] ink=rgb[gv(p,"groupGround")>=.5&&y>=horizon?1:3];int r=ink[0],g=ink[1],b=ink[2];if(rx>0&&ry>0&&Math.hypot((x-holeX)/rx,(y-holeY)/ry)<1){r=(int)Math.round(rgb[3][0]*.16d);g=(int)Math.round(rgb[3][1]*.16d);b=(int)Math.round(rgb[3][2]*.16d);}out.pixels[y*w+x]=0xff000000|(r<<16)|(g<<8)|b;}
  ArrayList<GroupPerson> people=groupScene(w,h,p,form.getInt("seed",1),materialPhase);
  java.util.Collections.sort(people,new java.util.Comparator<GroupPerson>(){public int compare(GroupPerson a,GroupPerson b){int d=Double.compare(a.y,b.y);return d==0?Integer.compare(a.id,b.id):d;}});
  for(GroupPerson a:people){if(a.missing)continue;double hx=a.head[0]*shortEdge,hy=a.head[1]*shortEdge,hrx=a.head[2]*shortEdge,hry=a.head[3]*shortEdge,left=hx-hrx-1,right=hx+hrx+1,top=hy-hry-1,bottom=hy+hry+1;ArrayList<double[]> segments=new ArrayList<double[]>();
    for(double[] raw:a.segments){double[] s=new double[6];for(int j=0;j<6;j++)s[j]=raw[j]*shortEdge;segments.add(s);double r=Math.max(s[4],s[5])+1;left=Math.min(left,Math.min(s[0],s[2])-r);right=Math.max(right,Math.max(s[0],s[2])+r);top=Math.min(top,Math.min(s[1],s[3])-r);bottom=Math.max(bottom,Math.max(s[1],s[3])+r);}
    int x0=Math.max(0,(int)Math.floor(left)),x1=Math.min(w,(int)Math.ceil(right)),y0=Math.max(0,(int)Math.floor(top)),y1=Math.min(h,(int)Math.ceil(bottom)),bw=x1-x0,bh=y1-y0;if(bw<=0||bh<=0)continue;double[] distance=new double[bw*bh];java.util.Arrays.fill(distance,1e9d);
    for(int y=Math.max(y0,(int)Math.floor(hy-hry-1));y<Math.min(y1,(int)Math.ceil(hy+hry+1));y++)for(int x=Math.max(x0,(int)Math.floor(hx-hrx-1));x<Math.min(x1,(int)Math.ceil(hx+hrx+1));x++)distance[(y-y0)*bw+x-x0]=(Math.hypot((x+.5d-hx)/hrx,(y+.5d-hy)/hry)-1)*Math.min(hrx,hry);
    for(double[] s:segments){double ax=s[0],ay=s[1],bx=s[2],by=s[3],ra=s[4],rb=s[5],dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,r=Math.max(ra,rb)+1;
      for(int y=Math.max(y0,(int)Math.floor(Math.min(ay,by)-r));y<Math.min(y1,(int)Math.ceil(Math.max(ay,by)+r));y++)for(int x=Math.max(x0,(int)Math.floor(Math.min(ax,bx)-r));x<Math.min(x1,(int)Math.ceil(Math.max(ax,bx)+r));x++){double t=len>1e-16d?clampGroup(((x+.5d-ax)*dx+(y+.5d-ay)*dy)/len,0,1):0,d=Math.hypot(x+.5d-ax-dx*t,y+.5d-ay-dy*t)-(ra+(rb-ra)*t);int i=(y-y0)*bw+x-x0;distance[i]=Math.min(distance[i],d);}
    }
    int[] ink=rgb[a.accent?2:0];boolean sinking=gv(p,"groupPull")>0&&rx>0&&ry>0&&Math.hypot((a.x*shortEdge-holeX)/rx,(a.y*shortEdge-holeY)/ry)<1;
    for(int y=y0;y<y1;y++)for(int x=x0;x<x1;x++){double alpha=clampGroup(.5d-distance[(y-y0)*bw+x-x0],0,1)*gv(p,"groupPresence");if(sinking&&y>=holeY)alpha=0;if(alpha==0)continue;int i=y*w+x,old=out.pixels[i],r=(old>>16)&255,g=(old>>8)&255,b=old&255;out.pixels[i]=0xff000000|((int)Math.round(r+(ink[0]-r)*alpha)<<16)|((int)Math.round(g+(ink[1]-g)*alpha)<<8)|(int)Math.round(b+(ink[2]-b)*alpha);}
  }out.updatePixels();return out;
}
