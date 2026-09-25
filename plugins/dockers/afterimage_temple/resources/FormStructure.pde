class StructureNode { int id; double x,y,size,angle; StructureNode(int i,double px,double py,double s,double a){id=i;x=px;y=py;size=s;angle=a;} }
double structureHash(int seed,int n){double v=Math.sin(seed*.013d+n*127.1d)*43758.5453d;return v-Math.floor(v);}
ArrayList<StructureNode> structureScene(int w,int h,JSONObject p,int seed,double phase){
  phase=((phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);if(Math.min(phase,Math.PI*2-phase)<1e-6)phase=0;
  int mode=(int)fv(p,"structureMode",0),count=(int)Math.round(fv(p,"structureCount",12));double shortEdge=Math.min(w,h),width=fv(p,"structureWidth",.85)*w,depth=fv(p,"structureDepth",.75)*h,rotation=fv(p,"structureTurn",0)*Math.PI/180,cs=Math.cos(rotation),sn=Math.sin(rotation),variation=fv(p,"structureVariation",.12),bend=fv(p,"structureBend",.5);
  int cols=(int)Math.ceil(Math.sqrt(count*w/(double)h)),rows=(int)Math.ceil(count/(double)cols);ArrayList<StructureNode> nodes=new ArrayList<StructureNode>();
  for(int i=0;i<count;i++){
    double t=count==1?.5:i/(double)(count-1),a=i*Math.PI*2/count,delay=i*1.71*(1-fv(p,"structureTogether",.8)),sway=(Math.sin(phase+delay)-Math.sin(delay))*fv(p,"structureMotion",0),x=0,y=0,size=shortEdge*.85/Math.sqrt(count),angle=0;
    if(mode==1){int row=i/cols,col=i%cols,n=Math.min(cols,count-row*cols);x=(col+.5-n/2.0)*width/cols;y=(row+.5-rows/2.0)*depth/rows;size=Math.min(width/cols,depth/rows)*1.1;}
    if(mode==2){x=Math.cos(a)*width*.42;y=Math.sin(a)*depth*.42;size=shortEdge*.68/Math.sqrt(count);angle=a+Math.PI;}
    if(mode==3){double r=Math.sqrt((i+.5)/count),q=i*2.399963229728653;x=Math.cos(q)*r*width*.45;y=Math.sin(q)*r*depth*.45;size=shortEdge*.8/Math.sqrt(count);angle=q;}
    if(mode==4){double u=t+sway*.08;x=(u-.5)*width;y=Math.sin(u*Math.PI*2)*depth*bend*.4;size=Math.min(shortEdge*.4,width/Math.max(2,count)*1.65);angle=Math.atan2(Math.cos(u*Math.PI*2)*depth*bend*.4*Math.PI*2,width)+Math.PI/2;}
    if(mode==5){size=Math.min(width,depth)*(.95-.8*t);x=Math.sin(t*Math.PI*2)*width*.12*bend;y=Math.cos(t*Math.PI*2)*depth*.12*bend;angle=t*Math.PI*2*bend;}
    if(mode==6){double exponent=.2+.8*bend;x=Math.signum(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),exponent)*width*.4;y=Math.signum(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),exponent)*depth*.4;double nx=Math.signum(Math.cos(a+.001))*Math.pow(Math.abs(Math.cos(a+.001)),exponent)*width*.4,ny=Math.signum(Math.sin(a+.001))*Math.pow(Math.abs(Math.sin(a+.001)),exponent)*depth*.4;angle=Math.atan2(ny-y,nx-x)+Math.PI/2;size=shortEdge*.62/Math.sqrt(count);}
    x+=(structureHash(seed,i*3)-.5)*shortEdge*.16*variation;y+=(structureHash(seed,i*3+1)-.5)*shortEdge*.16*variation;double pulse=1+sway*.12;x*=pulse;y*=pulse;
    nodes.add(new StructureNode(i,w*fv(p,"structureX",.5)+x*cs-y*sn,h*fv(p,"structureY",.5)+x*sn+y*cs,size*fv(p,"structureSize",1)*(1+(structureHash(seed,i*3+2)-.5)*variation*.6),rotation+(fv(p,"structureFollow",0)>=.5?angle:0)+sway*.3));
  }
  final int arrangement=mode;java.util.Collections.sort(nodes,new java.util.Comparator<StructureNode>(){public int compare(StructureNode a,StructureNode b){int c=arrangement==5?Double.compare(b.size,a.size):Double.compare(a.y,b.y);return c==0?Integer.compare(a.id,b.id):c;}});return nodes;
}
PImage trimStructureTile(PImage src){
 src.loadPixels();int left=src.width,top=src.height,right=-1,bottom=-1;for(int y=0;y<src.height;y++)for(int x=0;x<src.width;x++)if(((src.pixels[y*src.width+x]>>>24)&255)>0){left=min(left,x);right=max(right,x);top=min(top,y);bottom=max(bottom,y);}
 if(right<0)return createImage(1,1,ARGB);left=max(0,left-2);top=max(0,top-2);right=min(src.width-1,right+2);bottom=min(src.height-1,bottom+2);return src.get(left,top,right-left+1,bottom-top+1);
}
PImage composeStructure(int w,int h,PImage[] tiles,ArrayList<StructureNode> nodes,int ground,JSONObject p,int seed){
 PImage out=createImage(w,h,RGB);out.loadPixels();java.util.Arrays.fill(out.pixels,0xff000000|ground);
 for(PImage tile:tiles)tile.loadPixels();
 for(StructureNode node:nodes){int index=emojiIndex(node.id,0,tiles.length,p,structureHash(seed,node.id+819),structureHash(seed,node.id/3+701));PImage src=tiles[index];double scale=node.size/Math.max(src.width,src.height),cs=Math.cos(node.angle),sn=Math.sin(node.angle),radius=node.size*.72;
  for(int y=Math.max(0,(int)Math.floor(node.y-radius));y<Math.min(h,(int)Math.ceil(node.y+radius));y++)for(int x=Math.max(0,(int)Math.floor(node.x-radius));x<Math.min(w,(int)Math.ceil(node.x+radius));x++){
   double dx=x-node.x,dy=y-node.y;int sx=(int)Math.floor((dx*cs+dy*sn)/scale+src.width/2.0),sy=(int)Math.floor((-dx*sn+dy*cs)/scale+src.height/2.0);if(sx<0||sy<0||sx>=src.width||sy>=src.height)continue;
   int pixel=src.pixels[sy*src.width+sx],old=out.pixels[y*w+x];double alpha=((pixel>>>24)&255)/255.0;int r=(old>>16)&255,g=(old>>8)&255,b=old&255;
   out.pixels[y*w+x]=0xff000000|((int)Math.round(r+(((pixel>>16)&255)-r)*alpha)<<16)|((int)Math.round(g+(((pixel>>8)&255)-g)*alpha)<<8)|(int)Math.round(b+((pixel&255)-b)*alpha);
  }
 }out.updatePixels();return out;
}
PImage structuredForm(JSONObject form){
 JSONObject p=form.getJSONObject("parameters");int w=targetWidth,h=targetHeight,seed=form.getInt("seed",1);ArrayList<StructureNode> nodes=structureScene(w,h,p,seed,materialPhase);PImage[] tiles;
 if(fv(p,"figureActive",0)>=.5){
  int material=(int)fv(p,"figureSource",0);
  if(material==1){if(sourceImage==null)throw new RuntimeException("The selected FORM image is unavailable.");tiles=fv(p,"emojiCount",0)>0?emojiTiles(sourceImage,(int)Math.round(fv(p,"emojiCount",0))):new PImage[]{sourceImage.get()};}
  else{int count=fv(p,"fieldMix",0)>=.5?(material==2?12:fv(p,"fieldCast",0)>=.5?24:12):1;tiles=new PImage[count];for(int i=0;i<count;i++)tiles[i]=(material==2?symbolStudy(((int)fv(p,"symbolIndex",0)+i)%12):figureStudy(((int)fv(p,"figurePose",0)+i)%24,(int)fv(p,"figureStyle",0),p)).get();}
  for(int n=0;n<tiles.length;n++){PImage src=tiles[n];src.loadPixels();int inkColor=paletteColor(fv(p,"fieldInk",0)>=.5?n%3:0);for(int i=0;i<src.pixels.length;i++){int c=src.pixels[i],r=(c>>16)&255,g=(c>>8)&255,b=c&255;if(material==0||fv(p,"fieldInk",0)>=.5){double shade=material==0?.55+r/255.0*.45:1;r=(int)Math.round(((inkColor>>16)&255)*shade);g=(int)Math.round(((inkColor>>8)&255)*shade);b=(int)Math.round((inkColor&255)*shade);}int a=(int)Math.round(((c>>>24)&255)*fv(p,"figurePresence",.9));src.pixels[i]=(a<<24)|(r<<16)|(g<<8)|b;}src.updatePixels();}
 }else{
  double largest=0;for(StructureNode node:nodes)largest=Math.max(largest,node.size);int size=Math.max(128,Math.min(Math.max(w,h),(int)Math.ceil(largest)));
  JSONObject body=JSONObject.parse(form.toString());body.getJSONObject("parameters").setInt("structureMode",0);body.getJSONObject("parameters").setInt("_structureIsolated",1);
  try{targetWidth=size;targetHeight=size;tiles=new PImage[]{koneForm(body)};}finally{targetWidth=w;targetHeight=h;}
 }
 for(int i=0;i<tiles.length;i++)tiles[i]=trimStructureTile(tiles[i]);
 return composeStructure(w,h,tiles,nodes,paletteColor(3),p,seed);
}

// Independent FORM materials share one ground. Paired grounds recover exact coverage
// without mistaking black or white artwork for empty background.
PImage mixedForm(JSONObject form){
 JSONObject p=form.getJSONObject("parameters");int w=targetWidth,h=targetHeight;PImage out=createImage(w,h,ARGB);out.loadPixels();java.util.Arrays.fill(out.pixels,paletteColor(3));
 String[] kinds={"Kone","Knot","Figure"};int[] order={0,1,2};
 for(int a=0;a<3;a++)for(int b=a+1;b<3;b++)if(fv(p,"formMix"+kinds[order[a]]+"Order",order[a])>fv(p,"formMix"+kinds[order[b]]+"Order",order[b])){int swap=order[a];order[a]=order[b];order[b]=swap;}
 for(int index:order){String kind=kinds[index],key="formMix"+kind;
  if(fv(p,key,0)<.5||fv(p,key+"Visible",1)<.5)continue;
  JSONObject part=JSONObject.parse(form.toString()),params=part.getJSONObject("parameters");params.setInt("formMix",0);params.setInt("figureActive",index==2?1:0);params.setInt("knotActive",index==1?1:0);
  if(fv(p,key+"Seed",-1)>=0)part.setInt("seed",(int)fv(p,key+"Seed",0));
  JSONArray saved=palette;PImage dark,light;
  try{palette=JSONArray.parse(saved.toString());palette.setInt(3,0);dark=koneForm(part);palette.setInt(3,0xffffff);light=koneForm(part);}finally{palette=saved;}
  dark.loadPixels();light.loadPixels();int[] pixels=new int[dark.pixels.length];
  for(int i=0;i<pixels.length;i++){int d=dark.pixels[i],l=light.pixels[i];double alpha=Math.max(0,Math.min(1,1-((((l>>16)&255)-((d>>16)&255))+(((l>>8)&255)-((d>>8)&255))+((l&255)-(d&255)))/765.0));
   if(alpha<1.0/255)continue;int rr=(int)Math.round(Math.max(0,Math.min(255,((d>>16)&255)/alpha))),gg=(int)Math.round(Math.max(0,Math.min(255,((d>>8)&255)/alpha))),bb=(int)Math.round(Math.max(0,Math.min(255,(d&255)/alpha)));pixels[i]=((int)Math.round(alpha*255)<<24)|(rr<<16)|(gg<<8)|bb;
  }
  double scale=fv(p,key+"Scale",1),angle=fv(p,key+"Turn",0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=w*fv(p,key+"X",.5),cy=h*fv(p,key+"Y",.5),opacity=fv(p,key+"Opacity",1);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   double dx=(x+.5-cx)/scale,dy=(y+.5-cy)/scale;int sx=(int)Math.floor((dx*c+dy*s)/w*dark.width+dark.width/2.0),sy=(int)Math.floor((-dx*s+dy*c)/h*dark.height+dark.height/2.0);
   if(sx<0||sy<0||sx>=dark.width||sy>=dark.height)continue;int source=pixels[sy*dark.width+sx],at=y*w+x,dest=out.pixels[at];double a=((source>>>24)&255)/255.0*opacity;
   int rr=(int)Math.round(((dest>>16)&255)+(((source>>16)&255)-((dest>>16)&255))*a),gg=(int)Math.round(((dest>>8)&255)+(((source>>8)&255)-((dest>>8)&255))*a),bb=(int)Math.round((dest&255)+((source&255)-(dest&255))*a);out.pixels[at]=0xff000000|(rr<<16)|(gg<<8)|bb;
  }
 }
 out.updatePixels();return out;
}

HashMap<String,PImage> formStackSources=new HashMap<String,PImage>();
PImage stackedForm(){
 int w=targetWidth,h=targetHeight;JSONArray parts=recipe.getJSONArray("formStack");String selected=recipe.getString("formSelected","");
 PImage out=createImage(w,h,ARGB);out.loadPixels();java.util.Arrays.fill(out.pixels,paletteColor(3));
 for(int n=0;n<parts.size();n++){
  JSONObject entry=parts.getJSONObject(n);if(!entry.getBoolean("enabled",true))continue;
  boolean current=entry.getString("id","").equals(selected);JSONObject form=JSONObject.parse((current?recipe.getJSONObject("koneForm"):entry.getJSONObject("form")).toString()),p=form.getJSONObject("parameters");p.setInt("formMix",0);
  JSONArray saved=palette;PImage savedSource=sourceImage,dark,light;
  try{
   if(!current){String path=entry.getString("sourceImage","");if(path.length()>0){if(!formStackSources.containsKey(path)){PImage loaded=loadImage(path);if(loaded==null)throw new RuntimeException("FORM material could not be loaded: "+path);formStackSources.put(path,loaded);}sourceImage=formStackSources.get(path);}else sourceImage=null;}
   palette=JSONArray.parse(saved.toString());palette.setInt(3,0);dark=koneForm(form);palette.setInt(3,0xffffff);light=koneForm(form);
  }finally{palette=saved;sourceImage=savedSource;}
  dark.loadPixels();light.loadPixels();int[] pixels=new int[dark.pixels.length];
  for(int i=0;i<pixels.length;i++){int d=dark.pixels[i],l=light.pixels[i];double alpha=Math.max(0,Math.min(1,1-((((l>>16)&255)-((d>>16)&255))+(((l>>8)&255)-((d>>8)&255))+((l&255)-(d&255)))/765.0));
   if(alpha<1.0/255)continue;int rr=(int)Math.round(Math.max(0,Math.min(255,((d>>16)&255)/alpha))),gg=(int)Math.round(Math.max(0,Math.min(255,((d>>8)&255)/alpha))),bb=(int)Math.round(Math.max(0,Math.min(255,(d&255)/alpha)));pixels[i]=((int)Math.round(alpha*255)<<24)|(rr<<16)|(gg<<8)|bb;
  }
  double scale=fv(p,"formPartScale",1),angle=fv(p,"formPartTurn",0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=w*fv(p,"formPartX",.5),cy=h*fv(p,"formPartY",.5),opacity=fv(p,"formPartOpacity",1);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   double dx=(x+.5-cx)/scale,dy=(y+.5-cy)/scale;int sx=(int)Math.floor((dx*c+dy*s)/w*dark.width+dark.width/2.0),sy=(int)Math.floor((-dx*s+dy*c)/h*dark.height+dark.height/2.0);
   if(sx<0||sy<0||sx>=dark.width||sy>=dark.height)continue;int source=pixels[sy*dark.width+sx],at=y*w+x,dest=out.pixels[at];double a=((source>>>24)&255)/255.0*opacity;
   int rr=(int)Math.round(((dest>>16)&255)+(((source>>16)&255)-((dest>>16)&255))*a),gg=(int)Math.round(((dest>>8)&255)+(((source>>8)&255)-((dest>>8)&255))*a),bb=(int)Math.round((dest&255)+((source&255)-(dest&255))*a);out.pixels[at]=0xff000000|(rr<<16)|(gg<<8)|bb;
  }
 }out.updatePixels();return out;
}
