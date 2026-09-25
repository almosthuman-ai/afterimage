// The authored recipe is immutable. Each frame receives its own evaluated copy.
boolean temporalFrame() { return totalFrames > 1 || recipe.hasKey("scorePosition") || (recipe.hasKey("timeScore") && recipe.getJSONArray("timeScore").size()>0); }
JSONObject scoredRecipe(JSONObject authored, float time) {
  if (!authored.hasKey("timeScore") || authored.getJSONArray("timeScore").size()==0) return authored;
  JSONObject result=parseJSONObject(authored.toString());
  JSONArray tracks=result.getJSONArray("timeScore");
  for (int i=0;i<tracks.size();i++) {
    JSONObject track=tracks.getJSONObject(i);
    if (!track.getBoolean("enabled",true)) continue;
    JSONArray points=track.getJSONArray("points");
    if (points.size()==0) continue;
    float value=scoreValue(points,time);
    String target=track.getString("target"), owner=track.getString("owner");
    if (target.equals("form")) result.getJSONObject("koneForm").getJSONObject("parameters").setFloat(track.getString("parameter"),value);
    else {
      JSONArray entries=result.getJSONArray(target.equals("effect")?"effects":"layers");
      for(int j=0;j<entries.size();j++) {
        JSONObject entry=entries.getJSONObject(j);
        if(!entry.getString("id").equals(owner)) continue;
        if(target.equals("effect")) {
          String[] path=split(track.getString("parameter"), '.');
          if(path.length==2 && path[0].equals("wizprocess") && entry.hasKey("wizprocess")) entry.getJSONObject("wizprocess").setFloat(path[1],value);
          else if(path.length==3 && path[0].equals("ultimateSort") && entry.hasKey("ultimateSort")) {
            JSONArray rows=entry.getJSONObject("ultimateSort").getJSONArray("recipes");
            for(int k=0;k<rows.size();k++) if(rows.getJSONObject(k).getString("id").equals(path[1])) rows.getJSONObject(k).setFloat(path[2],value);
          } else if(path.length==1) entry.getJSONObject("parameters").setFloat(path[0],value);
        }
        else entry.setFloat("opacity",constrain(value,0,1));
      }
    }
  }
  return result;
}
float scoreValue(JSONArray points,float time) {
  if(points.size()==1) return points.getJSONObject(0).getFloat("value");
  float t=((time%1)+1)%1;
  int next=-1;
  for(int i=0;i<points.size();i++) if(points.getJSONObject(i).getFloat("time")>t) {next=i;break;}
  JSONObject b=points.getJSONObject(next<0?0:next);
  JSONObject a=points.getJSONObject(next<=0?points.size()-1:next-1);
  float start=a.getFloat("time"), end=b.getFloat("time");
  if(start>t) start-=1;
  if(end<=start) end+=1;
  float mix=(t-start)/(end-start);
  String ease=a.getString("ease","smooth");
  if(ease.equals("hold")) mix=0;
  if(ease.equals("smooth")) mix=mix*mix*(3-2*mix);
  return lerp(a.getFloat("value"),b.getFloat("value"),mix);
}
