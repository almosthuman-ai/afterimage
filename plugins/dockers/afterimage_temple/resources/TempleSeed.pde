import java.io.File;

JSONObject state, recipe, authoredRecipe;
float materialPhase, paletteCyclePhase;
JSONArray effects, palette, layers;
JSONObject asciiAtlas;
HashMap<String, JSONObject> asciiFeatures = new HashMap<String, JSONObject>();
PGraphics canvas;
PImage sourceImage;
int renderSeed, totalFrames, targetWidth, targetHeight, heldIteration;
String outputDir, outputFile, sourceFit, sourceBackground, colorMode, baseMode, processStage;
float sourcePresence;
boolean serving = false;

class HeldWhereField {
  int width, height;
  float[] weights;
  HeldWhereField(int width, int height, float[] weights) {
    this.width = width;
    this.height = height;
    this.weights = weights;
  }
}

HashMap<String, HeldWhereField> heldWhereFields = new HashMap<String, HeldWhereField>();

void setup() {
  size(640, 640, P2D);
  surface.setLocation(-10000, -10000);
  surface.setVisible(false);
  state = loadJSONObject("render-state.json");
  asciiAtlas = loadJSONObject("data/ascii-atlas.json");
  JSONArray atlasGlyphs = asciiAtlas.getJSONArray("glyphs");
  for (int i = 0; i < atlasGlyphs.size(); i++) {
    JSONObject feature = atlasGlyphs.getJSONObject(i);
    asciiFeatures.put(feature.getString("glyph"), feature);
  }
  if (state.getBoolean("serve", false)) {
    serving = true;
    return;
  }
  loadRenderState(state);
  frameRate(12);
  noSmooth();
}

void loadRenderState(JSONObject nextState) {
  state = nextState;
  heldWhereFields.clear();
  renderSeed = state.getInt("seed");
  totalFrames = state.getInt("frames");
  targetWidth = state.getInt("width");
  targetHeight = state.getInt("height");
  outputDir = state.getString("outputDir");
  outputFile = state.getString("outputFile");
  recipe = state.getJSONObject("recipe");
  authoredRecipe = recipe;
  heldIteration = recipe.getInt("iteration", 0);
  renderSeed += heldIteration * 104729;
  effects = recipe.getJSONArray("effects");
  palette = recipe.getJSONArray("palette");
  layers = recipe.hasKey("layers") ? recipe.getJSONArray("layers") : new JSONArray();
  sourceFit = recipe.getString("sourceFit", "contain");
  sourceBackground = recipe.getString("sourceBackground", "keep");
  colorMode = recipe.getString("colorMode", "palette");
  baseMode = recipe.getString("baseMode", "field");
  processStage = recipe.getString("processStage", "chain");
  sourcePresence = recipe.getFloat("sourcePresence", 0);
  sourceImage = null;
  String sourcePath = state.getString("sourceImage", null);
  if (sourcePath != null && sourcePath.length() > 0) sourceImage = loadImage(sourcePath);
  canvas = createGraphics(targetWidth, targetHeight, P2D);
  noSmooth();
}

void draw() {
  if (serving) {
   while (serving) {
    File request = new File(sketchPath("request.json"));
    if (!request.isFile()) { delay(40); continue; }
    JSONObject next = loadJSONObject(request.getAbsolutePath());
    request.delete();
    JSONObject response = new JSONObject();
    String requestId = next.getString("requestId", "");
    response.setString("requestId", requestId);
    try {
      loadRenderState(next);
      if (totalFrames == 1) renderFrame(1);
      else for (int frameIndex = 1; frameIndex <= totalFrames; frameIndex++) renderFrame(frameIndex);
      response.setString("outputFile", outputFile);
    } catch (Throwable failure) {
      response.setString("error", failure.toString());
      failure.printStackTrace();
    }
    saveJSONObject(response, sketchPath("response.json.part"));
    File responsePart = new File(sketchPath("response.json.part"));
    File responseFinal = new File(sketchPath("response.json"));
    if (!responsePart.renameTo(responseFinal)) throw new RuntimeException("Could not publish Temple response");
   }
    return;
  }
  noLoop();
  if (totalFrames == 1) renderFrame(1);
  else for (int frameIndex = 1; frameIndex <= totalFrames; frameIndex++) renderFrame(frameIndex);
  exit();
}

void renderFrame(int frameIndex) {
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE renderFrame start");
  float phase = totalFrames > 1 ? TWO_PI * (frameIndex - 1) / totalFrames : TWO_PI * authoredRecipe.getFloat("scorePosition", (heldIteration % 36) / 36.0);
  paletteCyclePhase=phase*state.getInt("paletteRepeats",1);
  if(state.getInt("paletteRepeats",1)>1) {
    if(totalFrames>1){int baseFrames=totalFrames/state.getInt("paletteRepeats",1);phase=TWO_PI*((frameIndex-1)%baseFrames)/baseFrames;paletteCyclePhase=TWO_PI*(frameIndex-1)/baseFrames;}
    else phase=paletteCyclePhase%TWO_PI;
  }
  recipe = scoredRecipe(authoredRecipe, phase / TWO_PI);
  effects = recipe.getJSONArray("effects");
  layers = recipe.hasKey("layers") ? recipe.getJSONArray("layers") : new JSONArray();
  materialPhase = phase;
  randomSeed(renderSeed);
  noiseSeed(renderSeed);
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE makeBase start");
  PImage current = makeBase(phase);
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE makeBase done");
  if (!processStage.equals("form")) current = renderChain(current, phase, "base");
  current = compositeLayersAt(current, "");
  if (!processStage.equals("form")) current = renderChain(current, phase, "");
  canvas.beginDraw();
  canvas.image(current, 0, 0, targetWidth, targetHeight);
  canvas.endDraw();
  if (totalFrames == 1) canvas.save(outputFile);
  else canvas.save(outputDir + File.separator + "frame-" + nf(frameIndex, 4) + ".png");
}

PImage renderChain(PImage current, float phase, String material) {
  PImage original = current.get();
  boolean sourceBlended = false;
  for (int i = 0; i < effects.size() && !processStage.equals("form"); i++) {
    JSONObject effect = effects.getJSONObject(i);
    if (!effect.getString("materialId", "").equals(material)) continue;
    if (!effect.getBoolean("enabled", true)) {
      if (material.equals("")) current = compositeLayersAt(current, effect.getString("id"));
      continue;
    }
    String type = effect.getString("type");
    JSONObject p = effect.getJSONObject("parameters");
    if (material.equals("") && (type.equals("language-body") || type.equals("ascii-field") || type.equals("zhuyin-weave") || type.equals("petscii-study")) && !sourceBlended && sourcePresence > 0) {
      current = blendSource(current, original, sourcePresence);
      sourceBlended = true;
    }
    PImage beforeEffect = current.get();
    PImage transformed = current;
    randomSeed(renderSeed + i * 10007 + type.hashCode());
    noiseSeed(renderSeed + i * 7919 + type.hashCode());
    if (type.equals("band-rupture")) transformed = bandRupture(current, p, phase);
    else if (type.equals("wrong-sort")) transformed = wrongSort(current, p);
    else if (type.equals("median-filter")) transformed = medianFilter(current, p);
    else if (type.equals("sorting-motion")) transformed = sortingMotion(current, effect, p, phase);
    else if (type.equals("ultimate-sort")) transformed = ultimateSort(current, effect, phase, original);
    else if (type.equals("wizprocess") || type.equals("wavelet-chamber")) transformed = wizprocess(current, effect, temporalFrame() ? phase : 0);
    else if (type.equals("wavelet-cartography")) transformed = waveletCartography(current, p, phase, temporalFrame());
    else if (type.equals("lz77-memory")) transformed = lz77Memory(current, effect, p, phase, temporalFrame());
    else if (type.equals("pixel-drift")) transformed = pixelDrift(current, p);
    else if (type.equals("signal-echo")) transformed = signalEcho(current, p, phase);
    else if (type.equals("silence-knife")) transformed = audioSilence(current, effect, p, phase);
    else if (type.equals("pcm-possession") || type.equals("tape-transport") || type.equals("phase-choir") || type.equals("spectral-surgery") || type.equals("echo-architecture") || type.equals("clip-furnace")) transformed = audioBending(current, effect, p, phase);
    else if (type.equals("dither-field")) transformed = ditherField(current, effect, p);
    else if (type.equals("parliament-of-pixels")) transformed = parliamentOfPixels(current, effect, p);
    else if (type.equals("tectonic-lens")) transformed = tectonicLens(current, p, effect, phase);
    else if (type.equals("lens-warp")) transformed = lensWarp(current, p, phase);
    else if (type.equals("mirror-cut")) transformed = mirrorCut(current, p);
    else if (type.equals("surface-motion")) transformed = surfaceMotion(current, effect, p, paletteCyclePhase);
    else if (type.equals("palette-cycle")) transformed = paletteCycle(current, p, paletteCyclePhase);
    else if (type.equals("motion-leak")) transformed = motionLeak(current, p, phase);
    else if (type.equals("signal-relief")) transformed = signalRelief(current, effect, p, phase);
    else if (type.equals("almost-alive")) transformed = almostAlive(current, effect, p, phase);
    else if (type.equals("resolution-quilt")) transformed = resolutionQuilt(current, p);
    else if (type.equals("shard-field")) transformed = shardField(current, p);
    else if (type.equals("cut-repeat")) transformed = cutRepeat(current, p);
    else if (type.equals("language-body")) transformed = languageBody(current, effect, p, phase);
    else if (type.equals("ascii-field")) transformed = asciiField(current, effect, p, phase);
    else if (type.equals("zhuyin-weave")) transformed = zhuyinWeave(current, effect, p, phase);
    else if (type.equals("petscii-study")) transformed = petsciiStudy(current, effect, p);
    current = (type.equals("language-body") || type.equals("ascii-field") || type.equals("zhuyin-weave") || type.equals("petscii-study")) ? transformed : applyWhere(beforeEffect, transformed, effect, original);
    if (material.equals("")) current = compositeLayersAt(current, effect.getString("id"));
  }
  if (material.equals("") && !sourceBlended && sourcePresence > 0) current = blendSource(current, original, sourcePresence);
  return current;
}

int paletteColor(int index) {
  int packed = palette.getInt(index);
  return color((packed >> 16) & 255, (packed >> 8) & 255, packed & 255);
}

PVector koneNormalize(PVector vector) {
  float length = vector.mag();
  return length <= 0.000001 ? new PVector(0, 0, 0) : vector.copy().div(length);
}

PVector koneProject(PVector point, int width, int height, float turn) {
  float mi = radians(turn);
  float rotationX = TWO_PI * cos(mi);
  float rotationZ = 2 * cos(mi);
  float cosX = cos(rotationX), sinX = sin(rotationX);
  float cosZ = cos(rotationZ), sinZ = sin(rotationZ);
  PVector afterX = new PVector(
    point.x,
    point.y * cosX - point.z * sinX,
    point.y * sinX + point.z * cosX
  );
  PVector afterZ = new PVector(
    afterX.x * cosZ - afterX.y * sinZ,
    afterX.x * sinZ + afterX.y * cosZ,
    afterX.z
  );
  float camera = max(width, height) * 0.9;
  float perspective = constrain(camera / max(camera * 0.2, camera - afterZ.z), 0.2, 5);
  return new PVector(width * 0.5 + afterZ.x * perspective, height * 0.5 + afterZ.y * perspective);
}

void koneCurvePatch(PGraphics target, PVector anchor, PVector first, PVector middle, PVector last) {
  target.beginShape();
  target.vertex(first.x, first.y);
  target.bezierVertex(
    first.x + (middle.x - anchor.x) / 6.0,
    first.y + (middle.y - anchor.y) / 6.0,
    middle.x - (last.x - first.x) / 6.0,
    middle.y - (last.y - first.y) / 6.0,
    middle.x,
    middle.y
  );
  target.bezierVertex(
    middle.x + (last.x - first.x) / 6.0,
    middle.y + (last.y - first.y) / 6.0,
    last.x - (anchor.x - middle.x) / 6.0,
    last.y - (anchor.y - middle.y) / 6.0,
    last.x,
    last.y
  );
  target.endShape(CLOSE);
}

void livingLimb(PGraphics target, float x1, float y1, float x2, float y2, float thickness, float scale, float phase, int fillColor, int strokeColor, float ribEscape, int ribCount, float unit) {
  target.stroke(fillColor);
  target.strokeWeight(max(2, thickness * scale));
  target.line(x1, y1, x2, y2);
  float length = max(1, dist(x1, y1, x2, y2));
  float nx = -(y2 - y1) / length, ny = (x2 - x1) / length;
  int ribTotal = max(4, min(36, round(ribCount / 14.0)));
  target.stroke(strokeColor);
  target.strokeWeight(max(0.55, unit * 0.8));
  for (int index = 0; index <= ribTotal; index++) {
    float t = index / (float)ribTotal;
    float x = lerp(x1, x2, t), y = lerp(y1, y2, t);
    float escape = (sin(index * 2.37 + phase) + 1) * 0.5 > 1 - ribEscape * 0.55 ? 1 + ribEscape * 3 : 1;
    float half = thickness * scale * 0.58 * sin(PI * (0.08 + t * 0.84)) * escape;
    target.line(x - nx * half, y - ny * half, x + nx * half, y + ny * half);
  }
}

void livingPetal(PGraphics target, float cx, float cy, float angle, float length, float breadth, int fillColor, int strokeColor, float ribEscape, float unit) {
  float dx = cos(angle), dy = sin(angle), nx = -dy, ny = dx;
  target.fill(fillColor);
  target.stroke(strokeColor);
  target.strokeWeight(max(0.6, unit));
  target.beginShape();
  target.vertex(cx, cy);
  target.bezierVertex(cx + dx * length * 0.38 + nx * breadth, cy + dy * length * 0.38 + ny * breadth, cx + dx * length * 0.8 + nx * breadth * 0.45, cy + dy * length * 0.8 + ny * breadth * 0.45, cx + dx * length, cy + dy * length);
  target.bezierVertex(cx + dx * length * 0.8 - nx * breadth * 0.45, cy + dy * length * 0.8 - ny * breadth * 0.45, cx + dx * length * 0.38 - nx * breadth, cy + dy * length * 0.38 - ny * breadth, cx, cy);
  target.endShape(CLOSE);
  target.line(cx, cy, cx + dx * length * (1 + ribEscape * 0.55), cy + dy * length * (1 + ribEscape * 0.55));
}

void livingCattleya(PGraphics target, JSONObject p, float cx, float cy, float angle, float size, float unit) {
  int pale = paletteColor(2), violet = paletteColor(1), deep = paletteColor(0);
  target.pushMatrix(); target.translate(cx, cy); target.rotate(angle + HALF_PI);
  if (p.getFloat("orchidBackPetals", 1) >= 0.5) {
    livingPetal(target, 0, size * 0.08, PI * 0.7, size * 1.28, size * 0.24, pale, deep, 0, unit);
    livingPetal(target, 0, size * 0.08, PI * 0.3, size * 1.28, size * 0.24, pale, deep, 0, unit);
  }
  if (p.getFloat("orchidSepals", 1) >= 0.5) {
    livingPetal(target, 0, 0, -HALF_PI, size * 1.34, size * 0.2, pale, violet, 0, unit);
    livingPetal(target, 0, 0, PI * 0.92, size * 1.18, size * 0.18, pale, violet, 0, unit);
    livingPetal(target, 0, 0, PI * 0.08, size * 1.18, size * 0.18, pale, violet, 0, unit);
  }
  if (p.getFloat("orchidWidePetals", 1) >= 0.5) {
    livingPetal(target, 0, 0, PI * 1.2, size * 1.16, size * 0.48, pale, violet, 0, unit);
    livingPetal(target, 0, 0, -PI * 0.2, size * 1.16, size * 0.48, pale, violet, 0, unit);
  }
  if (p.getFloat("orchidLip", 1) >= 0.5) {
    target.fill(violet); target.stroke(deep); target.strokeWeight(max(0.7, size * 0.045));
    target.beginShape(); target.vertex(-size * 0.13, size * 0.05);
    target.bezierVertex(-size * 0.2, size * 0.28, -size * 0.55, size * 0.34, -size * 0.5, size * 0.7);
    target.bezierVertex(-size * 0.48, size * 0.9, -size * 0.3, size * 1.05, -size * 0.12, size * 0.98);
    target.bezierVertex(-size * 0.06, size * 1.08, size * 0.06, size * 1.08, size * 0.12, size * 0.98);
    target.bezierVertex(size * 0.3, size * 1.05, size * 0.48, size * 0.9, size * 0.5, size * 0.7);
    target.bezierVertex(size * 0.55, size * 0.34, size * 0.2, size * 0.28, size * 0.13, size * 0.05);
    target.endShape(CLOSE);
  }
  if (p.getFloat("orchidThroat", 1) >= 0.5) { target.noStroke(); target.fill(pale); target.ellipse(0, size * 0.5, size * 0.32, size * 0.76); }
  if (p.getFloat("orchidVeins", 0) >= 0.5) {
    target.noFill(); target.stroke(deep); target.strokeWeight(max(0.55, size * 0.025));
    for (int vein = -1; vein <= 1; vein++) { target.beginShape(); target.vertex(0, size * 0.2); target.bezierVertex(vein * size * 0.04, size * 0.42, vein * size * 0.13, size * 0.62, vein * size * 0.2, size * 0.78); target.endShape(); }
  }
  if (p.getFloat("orchidColumn", 1) >= 0.5) { target.fill(pale); target.stroke(deep); target.ellipse(0, size * 0.08, size * 0.24, size * 0.4); }
  target.popMatrix();
}

void livingPouchHalf(PGraphics target, float side, float size, float pressure, float splitGap, int living, int deep, float pouchSplit) {
  float inner = side * splitGap, outer = side * size * pressure;
  target.fill(living); target.stroke(deep); target.strokeWeight(max(0.8, size * 0.045));
  target.beginShape(); target.vertex(inner + side * size * 0.06, 0);
  target.bezierVertex(outer * 0.52, size * 0.12, outer, size * 0.48, outer * 0.88, size * 0.92);
  target.bezierVertex(outer * 0.7, size * 1.28, inner + side * size * 0.12, size * 1.34, inner, size * (1.04 - pouchSplit * 0.22));
  target.vertex(inner, size * 0.18); target.endShape(CLOSE);
}

void livingPouch(PGraphics target, JSONObject p, float cx, float cy, float angle, float size, float unit) {
  int pale = paletteColor(2), living = paletteColor(1), deep = paletteColor(0), voidColor = paletteColor(3);
  float inflation = p.getFloat("pouchInflation", 0.72), opening = p.getFloat("pouchOpening", 0.28);
  float split = p.getFloat("pouchSplit", 0), inversion = p.getFloat("pouchInversion", 0);
  target.pushMatrix(); target.translate(cx, cy); target.rotate(angle + HALF_PI);
  if (p.getFloat("pouchLeaves", 1) >= 0.5) {
    livingPetal(target, 0, size * 0.72, PI * 0.8, size * 1.72, size * 0.48, pale, deep, 0, unit);
    livingPetal(target, 0, size * 0.72, PI * 0.2, size * 1.72, size * 0.48, pale, deep, 0, unit);
    target.stroke(deep); target.strokeWeight(max(0.5, size * 0.022));
    for (int side = -1; side <= 1; side += 2) for (int vein = 1; vein <= 3; vein++) {
      float leafAngle = side < 0 ? PI * 0.8 : PI * 0.2, reach = size * (0.38 + vein * 0.28);
      target.line(0, size * 0.72, cos(leafAngle) * reach, size * 0.72 + sin(leafAngle) * reach);
    }
  }
  target.noFill(); target.stroke(deep); target.strokeWeight(max(0.7, size * 0.05));
  target.beginShape(); target.vertex(0, size * 0.82); target.bezierVertex(size * 0.04, size * 0.58, size * 0.08, size * 0.22, 0, -size * 0.18); target.endShape();
  livingPetal(target, 0, -size * 0.12, -HALF_PI, size * 1.04, size * 0.34, pale, deep, 0, unit);
  if (p.getFloat("pouchBody", 1) >= 0.5) {
    target.pushMatrix(); target.translate(0, size * 0.02); target.rotate(PI * inversion);
    float pressure = 0.34 + inflation * 0.42, splitGap = size * split * 0.28;
    if (split > 0.01) {
      livingPouchHalf(target, -1, size, pressure, splitGap, living, deep, split);
      livingPouchHalf(target, 1, size, pressure, splitGap, living, deep, split);
    } else {
      target.fill(living); target.stroke(deep); target.strokeWeight(max(0.8, size * 0.045));
      target.beginShape(); target.vertex(-size * 0.1, 0);
      target.bezierVertex(-size * pressure, size * 0.24, -size * pressure, size * 0.92, 0, size * 1.18);
      target.bezierVertex(size * pressure, size * 0.92, size * pressure, size * 0.24, size * 0.1, 0);
      target.endShape(CLOSE);
    }
    float mouthWidth = size * (0.12 + opening * 0.5);
    target.fill(deep); target.stroke(voidColor); target.ellipse(0, size * 0.14, mouthWidth * 2, size * (0.05 + opening * 0.24));
    if (p.getFloat("pouchVeins", 1) >= 0.5) {
      target.noFill(); target.stroke(pale); target.strokeWeight(max(0.5, size * 0.022));
      for (int side = -1; side <= 1; side += 2) for (int vein = 1; vein <= 3; vein++) {
        target.beginShape(); target.vertex(side * mouthWidth * 0.42, size * 0.19);
        target.bezierVertex(side * size * pressure * 0.45, size * (0.25 + vein * 0.1), side * size * pressure * 0.72, size * (0.3 + vein * 0.15), side * size * (0.08 + vein * 0.035), size * 1.02);
        target.endShape();
      }
    }
    target.popMatrix();
  }
  target.popMatrix();
}

PVector livingSpiralPoint(float t, float height, float bend, float seedPhase) {
  return new PVector(
    sin(PI * t) * bend + sin(t * TWO_PI + seedPhase) * bend * 0.18,
    -height * t
  );
}

void livingSpiralStem(PGraphics target, JSONObject p, int formSeed, float cx, float cy, float angle, float size, float unit) {
  int pale = paletteColor(2), living = paletteColor(1), deep = paletteColor(0);
  float shortEdge = min(target.width, target.height);
  float height = shortEdge * (0.09 + p.getFloat("spiralHeight", 1) * 0.14);
  float bend = shortEdge * 0.035 * p.getFloat("spiralDrift", 0.16);
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  float bloomSize = p.getFloat("spiralBloomSize", 0.55);
  float turns = p.getFloat("spiralTurns", 3.2);
  float missingBeats = p.getFloat("spiralMissingBeats", 0);
  float growthActive = p.getFloat("growthElement", 1) >= 0.5 && p.getFloat("growthPresence", 1) >= 0.5 ? 1 : 0;
  float ribEscape = p.getFloat("ribEscape", 0) * growthActive;
  int bloomCount = max(3, round(p.getFloat("spiralBloomCount", 18)));
  target.pushMatrix(); target.translate(cx, cy); target.rotate(angle + HALF_PI);
  if (p.getFloat("spiralLeaves", 1) >= 0.5) {
    livingPetal(target, 0, 0, -HALF_PI - 0.6, height * 0.28, max(unit * 1.5, size * 0.13), pale, deep, ribEscape, unit);
    livingPetal(target, 0, 0, -HALF_PI + 0.54, height * 0.34, max(unit * 1.4, size * 0.12), pale, deep, ribEscape, unit);
    livingPetal(target, 0, 0, -HALF_PI - 0.08, height * 0.2, max(unit, size * 0.08), living, deep, ribEscape, unit);
  }
  if (p.getFloat("spiralStalk", 1) >= 0.5) {
    target.noFill(); target.stroke(deep); target.strokeWeight(max(0.65, unit * 0.9));
    target.beginShape();
    for (int step = 0; step <= 36; step++) {
      PVector point = livingSpiralPoint(step / 36.0, height, bend, seedPhase);
      target.vertex(point.x, point.y);
    }
    target.endShape();
  }
  if (p.getFloat("spiralBlooms", 1) >= 0.5) {
    for (int index = 0; index < bloomCount; index++) {
      float missingSignal = ((sin((index + 1) * 12.9898 + seedPhase * 78.233) * 43758.5453) % 1 + 1) % 1;
      if (missingSignal < missingBeats * 0.88) continue;
      float t = 0.38 + (index + 0.5) / bloomCount * 0.6;
      PVector point = livingSpiralPoint(t, height, bend, seedPhase);
      float phase = t * turns * TWO_PI + seedPhase;
      float depth = 0.55 + ((sin(phase) + 1) * 0.5) * 0.45;
      float outward = cos(phase) >= 0 ? 1 : -1;
      float bloom = size * (0.16 + bloomSize * 0.42) * depth;
      float bloomX = point.x + cos(phase) * size * (0.2 + bloomSize * 0.32);
      float bloomY = point.y + sin(phase) * size * 0.1;
      float bloomAngle = outward > 0 ? sin(phase) * 0.18 : PI - sin(phase) * 0.18;
      livingPetal(target, bloomX, bloomY, bloomAngle, bloom * 1.35, bloom * 0.48, sin(phase) >= 0 ? living : pale, deep, ribEscape, unit);
      float centerRadius = max(unit * 0.35, bloom * 0.13);
      target.noStroke(); target.fill(deep); target.ellipse(bloomX, bloomY, centerRadius * 2, centerRadius * 2);
    }
  }
  target.popMatrix();
}

float livingSignedNoise(float value) {
  float fraction = (sin(value) * 43758.5453) % 1;
  if (fraction < 0) fraction += 1;
  return fraction * 2 - 1;
}

boolean koneWoundAt(JSONObject p, int formSeed, float phi) {
  float amputation = p.getFloat("amputation", 0);
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  return amputation > 0 && (sin(phi * 1.31 + seedPhase * 1.9) + 1) * 0.5 > 1 - amputation * 0.52;
}

PVector koneGraftPoint(JSONObject p, int formSeed, int width, int height, float phi, float offsetX, float offsetY) {
  float shortEdge = min(width, height), unit = shortEdge / 600.0;
  float bodyRadius = p.getFloat("bodyRadius", 0.26) * shortEdge;
  float axisStretch = p.getFloat("axisStretch", 1), turn = p.getFloat("turn", 238), twist = p.getFloat("twist", 1.3);
  int lobes = max(1, round(p.getFloat("lobes", 5)));
  float breathDepth = p.getFloat("breathDepth", 0.32), wound = p.getFloat("wound", 0.18), foldDepth = p.getFloat("foldDepth", 0.08) * shortEdge;
  float asymmetry = p.getFloat("asymmetry", 0), possession = p.getFloat("possession", 0), gravity = p.getFloat("gravity", 0), spineBreak = p.getFloat("spineBreak", 0);
  float growthActive = p.getFloat("growthElement", 1) >= 0.5 && p.getFloat("growthPresence", 1) >= 0.5 ? 1 : 0;
  float ribEscape = p.getFloat("ribEscape", 0) * growthActive;
  float mi = radians(turn), psi = cos(mi) * twist;
  PVector position = new PVector(psi * unit, (100 - 2 * psi) * unit, 0);
  PVector tangent = koneNormalize(new PVector(-sin(psi) * 10 + 60 * sin(2 * psi), cos(psi) * 10 + 60 * cos(2 * psi), 60 * cos(3 * psi)));
  PVector ringY = koneNormalize(new PVector(0, 250 * unit, 250 * unit).cross(position));
  PVector ringZ = koneNormalize(tangent.cross(ringY));
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  float breath = 1 + breathDepth * sin(lobes * phi);
  float woundWave = (sin(phi * 2.17 + seedPhase) + 0.55 * sin(phi * 5.31 + seedPhase * 1.7) + 0.25 * sin(phi * 11.73 - seedPhase * 0.6)) / 1.8;
  float mutant = 1 + asymmetry * 0.62 * sin(phi + seedPhase * 0.7);
  float possessed = 1 + possession * 1.3 * pow(max(0, sin(phi * 3 + seedPhase)), 3);
  float pressure = breath * (1 + wound * woundWave) * mutant * possessed;
  float escapeSignal = (sin(phi * 7.13 + seedPhase * 2.2) + 1) * 0.5;
  if (escapeSignal > 1 - ribEscape * 0.55) pressure *= 1 + ribEscape * 1.8;
  float alongZ = bodyRadius * axisStretch * pressure * sin(phi), alongY = bodyRadius * pressure * cos(phi);
  float kink = spineBreak * shortEdge * 0.2 * sin(phi * 0.5 + seedPhase);
  float sag = gravity * shortEdge * 0.28 * pow(max(0, sin(phi + seedPhase)), 2);
  PVector vertex = new PVector(position.x + ringZ.x * alongZ + ringY.x * alongY + kink, position.y + ringZ.y * alongZ + ringY.y * alongY + sag, position.z + ringZ.z * alongZ + ringY.z * alongY);
  return koneProject(new PVector(12 * unit + vertex.x, foldDepth - vertex.z, -vertex.y), width, height, turn).add(offsetX, offsetY);
}

void drawKonePass(PGraphics target, JSONObject p, int formSeed, int width, int height, float scale, float offsetX, float offsetY, int fillColor, int strokeColor, boolean ghost) {
  float shortEdge = min(width, height), unit = shortEdge / 600.0;
  float bodyRadius = p.getFloat("bodyRadius", 0.26) * shortEdge;
  float axisStretch = p.getFloat("axisStretch", 1);
  int lobes = max(1, round(p.getFloat("lobes", 5)));
  float breathDepth = p.getFloat("breathDepth", 0.32), opening = p.getFloat("opening", 0.78);
  int ribCount = max(2, round(p.getFloat("ribCount", 170)));
  float twist = p.getFloat("twist", 1.3), turn = p.getFloat("turn", 238);
  float wound = p.getFloat("wound", 0.18), foldDepth = p.getFloat("foldDepth", 0.08) * shortEdge;
  float asymmetry = p.getFloat("asymmetry", 0), amputation = p.getFloat("amputation", 0);
  float growthActive = p.getFloat("growthElement", 1) >= 0.5 && p.getFloat("growthPresence", 1) >= 0.5 ? 1 : 0;
  float spineBreak = p.getFloat("spineBreak", 0), ribEscape = p.getFloat("ribEscape", 0) * growthActive;
  float gravity = p.getFloat("gravity", 0), possession = p.getFloat("possession", 0);
  float mi = radians(turn), psi = cos(mi) * twist;
  PVector position = new PVector(psi * unit, (100 - 2 * psi) * unit, 0);
  PVector tangent = koneNormalize(new PVector(-sin(psi) * 10 + 60 * sin(2 * psi), cos(psi) * 10 + 60 * cos(2 * psi), 60 * cos(3 * psi)));
  PVector ringY = koneNormalize(new PVector(0, 250 * unit, 250 * unit).cross(position));
  PVector ringZ = koneNormalize(tangent.cross(ringY));
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  PVector anchor = koneProject(new PVector(0, 0, 0), width, height, turn).add(offsetX, offsetY);
  target.fill(fillColor); target.stroke(strokeColor); target.strokeWeight(max(0.65, unit * (ghost ? 0.8 : 1)));
  for (int rib = 0; rib < ribCount; rib++) {
    float phi = rib / (float)max(1, ribCount - 1) * TWO_PI * opening;
    float cutSignal = (sin(phi * 1.31 + seedPhase * 1.9) + 1) * 0.5;
    if (!ghost && amputation > 0 && cutSignal > 1 - amputation * 0.52) continue;
    float breath = 1 + breathDepth * sin(lobes * phi);
    float woundWave = (sin(phi * 2.17 + seedPhase) + 0.55 * sin(phi * 5.31 + seedPhase * 1.7) + 0.25 * sin(phi * 11.73 - seedPhase * 0.6)) / 1.8;
    float mutant = 1 + asymmetry * 0.62 * sin(phi + seedPhase * 0.7);
    float possessed = 1 + possession * 1.3 * pow(max(0, sin(phi * 3 + seedPhase)), 3);
    float pressure = breath * (1 + wound * woundWave) * mutant * possessed * scale;
    float escapeSignal = (sin(phi * 7.13 + seedPhase * 2.2) + 1) * 0.5;
    if (!ghost && escapeSignal > 1 - ribEscape * 0.55) pressure *= 1 + ribEscape * 1.8;
    float alongZ = bodyRadius * axisStretch * pressure * sin(phi), alongY = bodyRadius * pressure * cos(phi);
    float kink = spineBreak * shortEdge * 0.2 * sin(phi * 0.5 + seedPhase);
    float sag = gravity * shortEdge * 0.28 * pow(max(0, sin(phi + seedPhase)), 2);
    PVector vertex = new PVector(position.x + ringZ.x * alongZ + ringY.x * alongY + kink, position.y + ringZ.y * alongZ + ringY.y * alongY + sag, position.z + ringZ.z * alongZ + ringY.z * alongY);
    PVector first = koneProject(new PVector(vertex.x, 15 * unit + vertex.y, 12 * unit + vertex.z), width, height, turn).add(offsetX, offsetY);
    PVector middle = koneProject(new PVector(-vertex.x, -vertex.z, 15 * unit + vertex.y), width, height, turn).add(offsetX, offsetY);
    PVector last = koneProject(new PVector(12 * unit + vertex.x, foldDepth - vertex.z, -vertex.y), width, height, turn).add(offsetX, offsetY);
    if (p.getFloat("printedFolds", 0) >= 0.5) {
      float facing = (first.x-anchor.x)*(last.y-anchor.y)-(first.y-anchor.y)*(last.x-anchor.x);
      int surface = paletteColor(facing < 0 ? 1 : 0);
      target.fill(surface);
      target.stroke(rib % max(1, round(p.getFloat("printSpacing", 3))) == 0 || rib == ribCount-1 ? paletteColor(2) : surface);
      target.strokeWeight(max(0.15, unit*p.getFloat("printWeight", 0.7)));
    }
    koneCurvePatch(target, anchor, first, middle, last);
  }
}

void drawLivingFamily(PGraphics target, String family, JSONObject p, int formSeed, int width, int height, float scale, float offsetX, float offsetY, int fillColor, int strokeColor, boolean inner) {
  if (family.equals("kone")) { drawKonePass(target, p, formSeed, width, height, scale, offsetX, offsetY, fillColor, strokeColor, inner); return; }
  float shortEdge = min(width, height), unit = shortEdge / 600.0;
  float radius = p.getFloat("bodyRadius", 0.26) * shortEdge * scale;
  float axisStretch = p.getFloat("axisStretch", 1), turn = p.getFloat("turn", 238), twist = p.getFloat("twist", 1.3);
  int lobes = max(1, round(p.getFloat("lobes", 5))), ribCount = max(2, round(p.getFloat("ribCount", 170)));
  float breathDepth = p.getFloat("breathDepth", 0.32), opening = p.getFloat("opening", 0.78), wound = p.getFloat("wound", 0.18), foldDepth = p.getFloat("foldDepth", 0.08) * shortEdge;
  float asymmetry = p.getFloat("asymmetry", 0), amputation = p.getFloat("amputation", 0), budding = p.getFloat("budding", 0);
  float growthActive = p.getFloat("growthElement", 1) >= 0.5 && p.getFloat("growthPresence", 1) >= 0.5 ? 1 : 0;
  float spineBreak = p.getFloat("spineBreak", 0), ribEscape = p.getFloat("ribEscape", 0) * growthActive, gravity = p.getFloat("gravity", 0), possession = p.getFloat("possession", 0);
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  float kink = spineBreak * radius * 0.8;
  target.pushMatrix();
  target.translate(width * 0.5 + offsetX, height * 0.5 + offsetY + gravity * shortEdge * 0.08);
  target.rotate(radians(turn - 238) * 0.32);
  if (family.equals("human")) {
    float h = min(shortEdge * 0.9, radius * 2.75 * axisStretch), shoulder = radius * (0.48 + opening * 0.24 + asymmetry * 0.18), hip = radius * (0.24 + opening * 0.09);
    float pose = (twist - 1.3) * radius * 0.1 + sin(lobes + seedPhase) * wound * radius * 0.12;
    float heartX = kink * 0.24 + foldDepth * 0.35, heartY = -h * 0.12;
    target.fill(fillColor); target.stroke(strokeColor); target.strokeWeight(max(0.7, unit));
    target.pushMatrix(); target.translate(kink * 0.55 + pose * 0.25, -h * 0.42); target.rotate(asymmetry * 0.3 + foldDepth / shortEdge); target.ellipse(0, 0, h * (0.156 + breathDepth * 0.044 + possession * 0.036), h * 0.2); target.popMatrix();
    livingLimb(target, heartX, heartY - h * 0.17, kink * 0.6 + pose * 0.25, h * 0.18, radius * (0.42 + breathDepth * 0.2 + possession * 0.22), scale, seedPhase, fillColor, strokeColor, ribEscape, ribCount, unit);
    if (amputation < 0.78) livingLimb(target, heartX, heartY, -shoulder * (1 + asymmetry * 0.75), h * (0.03 + spineBreak * 0.08) + pose, radius * (0.16 + breathDepth * 0.08), scale, seedPhase + 1, fillColor, strokeColor, ribEscape, ribCount, unit);
    if (amputation < 0.48) livingLimb(target, heartX, heartY, shoulder * (1 - asymmetry * 0.45), -h * (0.02 + spineBreak * 0.12) - pose, radius * (0.16 + breathDepth * 0.08), scale, seedPhase + 2, fillColor, strokeColor, ribEscape, ribCount, unit);
    if (amputation < 0.9) livingLimb(target, -hip * 0.45, h * 0.14, -radius * (0.42 + asymmetry * 0.25), h * 0.43, radius * 0.24, scale, seedPhase + 3, fillColor, strokeColor, ribEscape, ribCount, unit);
    if (amputation < 0.62) livingLimb(target, hip * 0.45, h * 0.14, radius * (0.42 - asymmetry * 0.15), h * (0.43 + gravity * 0.16), radius * 0.24, scale, seedPhase + 4, fillColor, strokeColor, ribEscape, ribCount, unit);
  } else if (family.equals("flower")) {
    float bloomY = -radius * 0.25;
    livingLimb(target, 0, radius * 1.35, kink * 0.45, bloomY, radius * 0.16, scale, seedPhase, fillColor, strokeColor, ribEscape, ribCount, unit);
    int petals = max(3, min(20, lobes));
    for (int index = 0; index < petals; index++) {
      if (amputation > 0 && (sin(index * 1.71 + seedPhase) + 1) * 0.5 > 1 - amputation * 0.58) continue;
      float angle = index / (float)petals * TWO_PI * constrain(opening, 0.45, 1.4) - HALF_PI + (twist - 1.3) * 0.08 * sin(index + seedPhase);
      float mutant = 1 + asymmetry * 0.7 * sin(angle + seedPhase);
      float possessed = 1 + possession * 0.7 * pow(max(0, sin(angle * 3 + seedPhase)), 2);
      livingPetal(target, kink * 0.45, bloomY, angle, radius * (0.62 + breathDepth * 0.58) * mutant * possessed, radius * (0.16 + wound * 0.2 + foldDepth / shortEdge * 0.22), fillColor, strokeColor, ribEscape, unit);
    }
    target.noStroke(); target.fill(strokeColor); target.ellipse(kink * 0.45, bloomY, radius * (0.28 + wound * 0.24), radius * (0.28 + wound * 0.24));
  } else {
    float bottomY = radius * 1.2, topY = -radius * 1.15 * axisStretch;
    livingLimb(target, 0, bottomY, kink, topY, radius * 0.14, scale, seedPhase, fillColor, strokeColor, ribEscape, ribCount, unit);
    int branches = max(3, min(11, lobes));
    for (int index = 0; index < branches; index++) {
      if (amputation > 0 && (sin(index * 2.13 + seedPhase) + 1) * 0.5 > 1 - amputation * 0.6) continue;
      float t = (index + 1) / (float)(branches + 1), side = index % 2 == 0 ? -1 : 1;
      float possessed = 1 + possession * 0.52 * pow(max(0, sin(index * 1.7 + seedPhase)), 2);
      float branchY = lerp(bottomY, topY, t), reach = radius * (0.34 + opening * 0.24 + 0.34 * sin(PI * t)) * (1 + asymmetry * side * 0.55) * possessed;
      float tipX = kink * t + side * reach + sin(index * twist + seedPhase) * radius * wound * 0.18;
      float tipY = branchY - radius * (0.12 + breathDepth * 0.22 + spineBreak * 0.2) + gravity * radius * t + foldDepth * (t - 0.5);
      livingLimb(target, kink * t, branchY, tipX, tipY, radius * 0.09, scale, seedPhase + index, fillColor, strokeColor, ribEscape, ribCount, unit);
      livingPetal(target, tipX, tipY, (side < 0 ? PI * 1.12 : -0.12) + (twist - 1.3) * 0.12, radius * (0.24 + budding * 0.2 + breathDepth * 0.12), radius * (0.07 + wound * 0.1), fillColor, strokeColor, ribEscape, unit);
    }
  }
  target.popMatrix();
}

PImage koneForm(JSONObject form) {
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE koneForm entry");
  if(form.getJSONObject("parameters").getFloat("formMix",0)>=.5)return mixedForm(form);
  if(form.getJSONObject("parameters").getFloat("structureMode",0)>0)return structuredForm(form);
  if(form.getJSONObject("parameters").getFloat("figureActive",0)>=.5) return figureComposition(form);
  if (form.getJSONObject("parameters").getFloat("knotActive",0)>=.5) return knotForm(form);
  JSONObject p = form.getJSONObject("parameters");
  int width = targetWidth, height = targetHeight, formSeed = form.getInt("seed", renderSeed);
  float shortEdge = min(width, height), unit = shortEdge / 600.0;
  String family = form.getString("family", "kone");
  float bodyRadius = p.getFloat("bodyRadius", 0.26) * shortEdge, axisStretch = p.getFloat("axisStretch", 1);
  float innerBody = p.getFloat("innerBody", 0), mouths = p.getFloat("mouths", 0), budding = p.getFloat("budding", 0), flowerSize = p.getFloat("flowerSize", 1), orchidPresence = p.getFloat("orchidPresence", 0);
  float molt = p.getFloat("molt", 0), seam = p.getFloat("seam", 0), gravity = p.getFloat("gravity", 0);
  float growthActive = p.getFloat("growthElement", 1) >= 0.5 && p.getFloat("growthPresence", 1) >= 0.5 ? 1 : 0;
  float flowerPositionScatter = p.getFloat("flowerPositionScatter", 0) * growthActive;
  float flowerClustering = p.getFloat("flowerClustering", 0) * growthActive;
  float surfaceAttraction = p.getFloat("surfaceAttraction", 0) * growthActive;
  float bridgeGrowth = p.getFloat("bridgeGrowth", 0) * growthActive;
  float growthReach = p.getFloat("growthReach", 0.72);
  int bloomSites = round(p.getFloat("bloomSites", 0));
  float graftDepth = p.getFloat("graftDepth", 0) * growthActive;
  float koneSizeDifference = p.getFloat("koneSizeDifference", 0);
  float koneSeparation = p.getFloat("koneSeparation", 0), konePositionScatter = p.getFloat("konePositionScatter", 0);
  float ritual = p.getFloat("ritual", 0) * growthActive;
  boolean koneElement = p.getFloat("koneElement", 1) >= 0.5;
  boolean flowerActive = p.getFloat("flowerElement", 1) >= 0.5 && p.getFloat("flowerPresence", 1) >= 0.5;
  boolean mouthsActive = p.getFloat("mouthsElement", 1) >= 0.5 && p.getFloat("mouthsPresence", 1) >= 0.5;
  float shellPresence = p.getFloat("shellPresence", 1);
  float seedPhase = (float)((long)formSeed % 100000L) / 100000.0 * TWO_PI;
  float primaryOffsetX = livingSignedNoise(seedPhase * 17.17 + 2.1) * shortEdge * 0.28 * konePositionScatter;
  float primaryOffsetY = livingSignedNoise(seedPhase * 29.31 + 5.7) * shortEdge * 0.28 * konePositionScatter;
  float legacyGhostOffset = molt * shortEdge * 0.16;
  float separationAngle = seedPhase * 1.73 + molt * PI, separationDistance = shortEdge * 0.32 * koneSeparation;
  float secondOffsetX = primaryOffsetX - legacyGhostOffset * 0.55 + cos(separationAngle) * separationDistance;
  float secondOffsetY = primaryOffsetY + legacyGhostOffset + sin(separationAngle) * separationDistance;
  float secondScale = max(0.2, 1 + molt * 0.08 + koneSizeDifference * 0.75);
  PGraphics generated = createGraphics(width, height, P2D);
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE graphics created");
  generated.smooth(4); generated.beginDraw(); if(p.getFloat("_structureIsolated",0)>=.5)generated.clear();else generated.background(paletteColor(3)); generated.strokeJoin(ROUND); generated.strokeCap(ROUND);
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE beginDraw done");
  if (koneElement && shellPresence >= 0.5) {
    if (molt > 0.01) drawLivingFamily(generated, family, p, formSeed, width, height, secondScale, secondOffsetX, secondOffsetY, paletteColor(1), paletteColor(2), true);
    drawLivingFamily(generated, family, p, formSeed, width, height, 1, primaryOffsetX, primaryOffsetY, paletteColor(0), paletteColor(1), false);
    if (innerBody > 0.01) drawLivingFamily(generated, family, p, formSeed, width, height, 0.18 + innerBody * 0.36, primaryOffsetX + shortEdge * innerBody * 0.08, primaryOffsetY - shortEdge * innerBody * 0.05, paletteColor(2), paletteColor(1), true);
  }
  if (flowerActive && budding > 0.01) {
    int count = growthActive >= 0.5 ? 1 + round(budding * (10 - orchidPresence * 5)) : 1;
    for (int index = 0; index < count; index++) {
      float angle = seedPhase + index * 2.39996;
      float distance = (p.getFloat("orchidSpecies", 0) >= 0.5 && count == 1 ? bodyRadius * 0.12 : bodyRadius * (0.42 + 1.08 * ((index + 1) / (float)count))) * growthReach;
      float bx = width * 0.5 + primaryOffsetX + cos(angle) * distance, by = height * 0.5 + primaryOffsetY + sin(angle) * distance + gravity * distance * 0.35;
      float surfaceDistance = bodyRadius * (0.72 + 0.22 * sin(round(p.getFloat("lobes", 5)) * angle + seedPhase)) * growthReach;
      float surfaceX = width * 0.5 + primaryOffsetX + cos(angle) * surfaceDistance, surfaceY = height * 0.5 + primaryOffsetY + sin(angle) * surfaceDistance;
      bx = lerp(bx, surfaceX, surfaceAttraction); by = lerp(by, surfaceY, surfaceAttraction);
      float colonyAngle = seedPhase + (index % 3) * TWO_PI / 3.0;
      float colonyDistance = bodyRadius * (0.34 + 0.2 * (livingSignedNoise(index * 4.17 + seedPhase) + 1) * 0.5) * growthReach;
      float colonyX = width * 0.5 + primaryOffsetX + cos(colonyAngle) * colonyDistance, colonyY = height * 0.5 + primaryOffsetY + sin(colonyAngle) * colonyDistance;
      bx = lerp(bx, colonyX, flowerClustering); by = lerp(by, colonyY, flowerClustering);
      bx += livingSignedNoise(index * 19.19 + seedPhase * 7.7) * shortEdge * 0.24 * flowerPositionScatter * growthReach;
      by += livingSignedNoise(index * 31.73 + seedPhase * 11.3) * shortEdge * 0.24 * flowerPositionScatter * growthReach;
      if (molt > 0.01 && bridgeGrowth > 0) {
        float bridgeT = (index + 1) / (float)(count + 1);
        float bridgeX = width * 0.5 + lerp(primaryOffsetX, secondOffsetX, bridgeT);
        float bridgeY = height * 0.5 + lerp(primaryOffsetY, secondOffsetY, bridgeT) + sin(bridgeT * PI) * livingSignedNoise(index + seedPhase) * bodyRadius * 0.24;
        bx = lerp(bx, bridgeX, bridgeGrowth); by = lerp(by, bridgeY, bridgeGrowth);
      }
      float size = shortEdge * (0.012 + min(1, budding) * 0.022) * flowerSize * (1 + orchidPresence * 0.48);
      float flowerAngle = angle;
      boolean canGraft = bloomSites > 0 && graftDepth > 0 && koneElement && shellPresence >= 0.5 && family.equals("kone");
      if (canGraft) {
        float span = TWO_PI * p.getFloat("opening", 0.78);
        float phi = (((index + 0.5) / count * span + seedPhase * 0.37) % span + span) % span;
        if (bloomSites == 1) {
          float searchStep = span / 29.0;
          for (int attempt = 0; attempt < 29 && !koneWoundAt(p, formSeed, phi); attempt++) phi = (phi + searchStep) % span;
        }
        PVector graft = koneGraftPoint(p, formSeed, width, height, phi, primaryOffsetX, primaryOffsetY);
        float nextPhi = phi + max(0.002, span / max(1200.0, p.getFloat("ribCount", 170) * 8.0));
        PVector next = koneGraftPoint(p, formSeed, width, height, nextPhi, primaryOffsetX, primaryOffsetY);
        float ribAngle = atan2(next.y - graft.y, next.x - graft.x);
        float awayX = graft.x - (width * 0.5 + primaryOffsetX), awayY = graft.y - (height * 0.5 + primaryOffsetY);
        float awayLength = max(0.0001, sqrt(awayX * awayX + awayY * awayY));
        float stemReach = max(unit * 3, size * (1.2 + orchidPresence * 0.9));
        float targetX = graft.x + awayX / awayLength * stemReach, targetY = graft.y + awayY / awayLength * stemReach;
        bx = lerp(bx, targetX, graftDepth); by = lerp(by, targetY, graftDepth);
        float angleDelta = atan2(sin(ribAngle - flowerAngle), cos(ribAngle - flowerAngle));
        flowerAngle += angleDelta * graftDepth;
        generated.noFill(); generated.stroke(paletteColor(1)); generated.strokeWeight(max(0.6, unit * (0.7 + graftDepth * 0.8)));
        generated.beginShape(); generated.vertex(graft.x, graft.y);
        generated.bezierVertex(graft.x + awayX / awayLength * stemReach * 0.35, graft.y + awayY / awayLength * stemReach * 0.35, graft.x + awayX / awayLength * stemReach * 0.65, graft.y + awayY / awayLength * stemReach * 0.65, bx, by);
        generated.endShape();
      }
      float orchidDecision = ((sin((index + 1) * 12.9898 + seedPhase * 78.233) * 43758.5453) % 1 + 1) % 1;
      if (orchidDecision < orchidPresence) {
        if (p.getFloat("orchidSpecies", 0) >= 1.5) livingSpiralStem(generated, p, formSeed, bx, by, flowerAngle, size, unit);
        else if (p.getFloat("orchidSpecies", 0) >= 0.5) livingPouch(generated, p, bx, by, flowerAngle, size * 4.2 * p.getFloat("pouchScale", 0.65), unit);
        else livingCattleya(generated, p, bx, by, flowerAngle, size * 2.35, unit);
      }
      else for (int petal = 0; petal < 4; petal++) livingPetal(generated, bx, by, flowerAngle + petal * HALF_PI, size * 2.2, size * 0.7, paletteColor(2), paletteColor(1), p.getFloat("ribEscape", 0), unit);
    }
  }
  if (mouthsActive && mouths > 0.01) {
    int count = 1 + round(mouths * 5);
    generated.fill(paletteColor(3)); generated.stroke(paletteColor(2)); generated.strokeWeight(max(1, unit * 1.4));
    for (int index = 0; index < count; index++) {
      float angle = seedPhase + index * 2.17, distance = bodyRadius * (0.08 + 0.58 * ((index + 1) / (float)count));
      float mx = width * 0.5 + cos(angle) * distance, my = height * 0.5 + sin(angle) * distance;
      generated.pushMatrix(); generated.translate(mx, my); generated.rotate(angle + seam); generated.ellipse(0, 0, shortEdge * (0.036 + mouths * 0.09), shortEdge * (0.008 + mouths * 0.024)); generated.popMatrix();
    }
  }
  if (seam > 0.01) {
    generated.noFill(); generated.stroke(paletteColor(3)); generated.strokeWeight(max(2, shortEdge * seam * 0.018)); generated.beginShape();
    for (int index = 0; index <= 42; index++) {
      float t = index / 42.0, angle = seedPhase + t * PI * (2 + seam * 4), radius = bodyRadius * t * (0.35 + seam * 0.85);
      generated.vertex(width * 0.5 + cos(angle) * radius, height * 0.5 + sin(angle) * radius + gravity * radius * t);
    }
    generated.endShape();
    generated.stroke(paletteColor(2)); generated.strokeWeight(max(0.7, unit)); generated.beginShape();
    for (int index = 0; index <= 42; index++) {
      float t = index / 42.0, angle = seedPhase + t * PI * (2 + seam * 4), radius = bodyRadius * t * (0.35 + seam * 0.85);
      generated.vertex(width * 0.5 + cos(angle) * radius + unit * 2, height * 0.5 + sin(angle) * radius + gravity * radius * t);
    }
    generated.endShape();
  }
  if (ritual > 0.01) {
    float cx = width * 0.5, top = height * 0.5 - bodyRadius * (1.05 + axisStretch * 0.35); int horns = 2 + round(ritual * 5);
    generated.noFill(); generated.stroke(paletteColor(2)); generated.strokeWeight(max(1, unit * 1.2));
    for (int index = 0; index < horns; index++) {
      float spread = index / (float)max(1, horns - 1) - 0.5;
      generated.beginShape(); generated.vertex(cx, top + bodyRadius * 0.28); generated.bezierVertex(cx + spread * bodyRadius * 0.45, top, cx + spread * bodyRadius * 1.15, top - bodyRadius * ritual * 0.65, cx + spread * bodyRadius * 1.45, top - bodyRadius * ritual * (0.45 + abs(spread))); generated.endShape();
    }
  }
  generated.endDraw();
  if(state.getBoolean("diagnostic",false))System.err.println("TEMPLE_TRACE endDraw done");
  return generated.get();
}

float whereSmooth(float low, float high, float value) {
  if (high <= low) return value >= high ? 1 : 0;
  float t = constrain((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

float pixelLight(int c) {
  return (red(c) * .2126 + green(c) * .7152 + blue(c) * .0722) / 255.0;
}

float pixelSaturation(int c) {
  float maximum = max(red(c), max(green(c), blue(c))) / 255.0;
  float minimum = min(red(c), min(green(c), blue(c))) / 255.0;
  return maximum == 0 ? 0 : (maximum - minimum) / maximum;
}

float pixelHue(int c) {
  float r = red(c) / 255.0, g = green(c) / 255.0, b = blue(c) / 255.0;
  float maximum = max(r, max(g, b)), minimum = min(r, min(g, b));
  float delta = maximum - minimum;
  if (delta == 0) return 0;
  float value;
  if (maximum == r) value = ((g - b) / delta) % 6;
  else if (maximum == g) value = (b - r) / delta + 2;
  else value = (r - g) / delta + 4;
  return (value * 60 + 360) % 360;
}

float blockWhereValue(int column, int row, int seed) {
  int hash = seed ^ column * 374761393 ^ row * 668265263;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  long unsigned = (hash ^ (hash >>> 16)) & 0xffffffffL;
  return unsigned / 4294967295.0;
}

float colorKinWeight(int c, JSONObject where) {
  float red = red(c) / 255.0, green = green(c) / 255.0, blue = blue(c) / 255.0;
  int sample = where.getInt("sampleColor", 0xc83d58);
  float sampleRed = ((sample >> 16) & 255) / 255.0;
  float sampleGreen = ((sample >> 8) & 255) / 255.0;
  float sampleBlue = (sample & 255) / 255.0;
  float mean = (red + green + blue) / 3.0;
  float sampleMean = (sampleRed + sampleGreen + sampleBlue) / 3.0;
  float chromaDistance = sqrt(
    sq((red - mean) - (sampleRed - sampleMean)) +
    sq((green - mean) - (sampleGreen - sampleMean)) +
    sq((blue - mean) - (sampleBlue - sampleMean))
  ) / sqrt(2.0);
  float light = red * .2126 + green * .7152 + blue * .0722;
  float sampleLight = sampleRed * .2126 + sampleGreen * .7152 + sampleBlue * .0722;
  float shadeLoyalty = constrain(where.getFloat("shadeLoyalty", .68), 0, 1);
  float distance = sqrt(sq(chromaDistance) + sq(abs(light - sampleLight) * shadeLoyalty));
  float reach = constrain(where.getFloat("colorReach", .16), .01, 1);
  float feather = max(.002, constrain(where.getFloat("softness", .12), 0, .5) * .45);
  return 1 - whereSmooth(reach, min(1.5, reach + feather), distance);
}

int[] bodyDistance(boolean[] mask, boolean target, int width, int height, int[] queue) {
  int[] distances = new int[mask.length];
  java.util.Arrays.fill(distances, 0x3fffffff);
  int head = 0, tail = 0;
  for (int index = 0; index < mask.length; index++) if (mask[index] == target) {
    distances[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    int index = queue[head++], nextDistance = distances[index] + 1;
    int x = index % width, y = index / width;
    if (x > 0 && nextDistance < distances[index - 1]) { distances[index - 1] = nextDistance; queue[tail++] = index - 1; }
    if (x + 1 < width && nextDistance < distances[index + 1]) { distances[index + 1] = nextDistance; queue[tail++] = index + 1; }
    if (y > 0 && nextDistance < distances[index - width]) { distances[index - width] = nextDistance; queue[tail++] = index - width; }
    if (y + 1 < height && nextDistance < distances[index + width]) { distances[index + width] = nextDistance; queue[tail++] = index + width; }
  }
  return distances;
}

float[] softenedBody(boolean[] mask, int width, int height, JSONObject where) {
  float[] weights = new float[mask.length];
  int insideCount = 0;
  for (boolean inside : mask) if (inside) insideCount++;
  if (insideCount == 0) return weights;
  if (insideCount == mask.length) { java.util.Arrays.fill(weights, 1); return weights; }
  int[] queue = new int[mask.length];
  int[] insideDistance = bodyDistance(mask, true, width, height, queue);
  int[] outsideDistance = bodyDistance(mask, false, width, height, queue);
  float shortEdge = min(width, height);
  float expansion = constrain(where.getFloat("bodyExpansion", 0), -.08, .18) * shortEdge;
  float feather = max(.5, constrain(where.getFloat("softness", .12), 0, .5) * shortEdge * .08);
  for (int index = 0; index < weights.length; index++) {
    float signedDistance = mask[index] ? outsideDistance[index] : -insideDistance[index];
    weights[index] = whereSmooth(-feather, feather, signedDistance + expansion);
  }
  return weights;
}

HeldWhereField buildFoundWhere(PImage recognition, JSONObject effect) {
  JSONObject where = effect.getJSONObject("where");
  String mode = where.getString("mode", "color-kin");
  float scale = min(1, 960.0 / max(recognition.width, recognition.height));
  int width = max(1, round(recognition.width * scale));
  int height = max(1, round(recognition.height * scale));
  PImage analysis = createImage(width, height, ARGB);
  analysis.copy(recognition, 0, 0, recognition.width, recognition.height, 0, 0, width, height);
  analysis.loadPixels();
  float[] kin = new float[width * height];
  for (int index = 0; index < kin.length; index++) kin[index] = colorKinWeight(analysis.pixels[index], where);
  if (mode.equals("color-kin")) return new HeldWhereField(width, height, kin);

  float[] light = new float[kin.length], edges = new float[kin.length];
  boolean[] candidate = new boolean[kin.length];
  for (int index = 0; index < kin.length; index++) {
    light[index] = pixelLight(analysis.pixels[index]);
    candidate[index] = kin[index] >= .5;
  }
  for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
    int index = y * width + x;
    float left = light[y * width + max(0, x - 1)], right = light[y * width + min(width - 1, x + 1)];
    float above = light[max(0, y - 1) * width + x], below = light[min(height - 1, y + 1) * width + x];
    edges[index] = min(1, sqrt(sq(right - left) + sq(below - above)) * 2.4);
  }
  int seedX = constrain(round(where.getFloat("sampleX", .5) * (width - 1)), 0, width - 1);
  int seedY = constrain(round(where.getFloat("sampleY", .5) * (height - 1)), 0, height - 1);
  int seedIndex = seedY * width + seedX;
  candidate[seedIndex] = true;
  float edgeLimit = 1.01 - constrain(where.getFloat("edgeLoyalty", .58), 0, 1) * .9;
  int[] labels = new int[kin.length], queue = new int[kin.length];
  java.util.Arrays.fill(labels, -1);
  int[] areas = new int[kin.length];
  float[] aspects = new float[kin.length], fills = new float[kin.length], roughness = new float[kin.length];
  int componentCount = 0, seedBody = -1;
  for (int start = 0; start < kin.length; start++) {
    if (!candidate[start] || labels[start] >= 0) continue;
    int head = 0, tail = 0, area = 0, perimeter = 0;
    int minX = width, minY = height, maxX = 0, maxY = 0;
    labels[start] = componentCount;
    queue[tail++] = start;
    while (head < tail) {
      int index = queue[head++], x = index % width, y = index / width;
      area++; minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y);
      if (index == seedIndex) seedBody = componentCount;
      for (int direction = 0; direction < 4; direction++) {
        int nx = x + (direction == 0 ? -1 : direction == 1 ? 1 : 0);
        int ny = y + (direction == 2 ? -1 : direction == 3 ? 1 : 0);
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { perimeter++; continue; }
        int neighbor = ny * width + nx;
        if (!candidate[neighbor]) { perimeter++; continue; }
        if (labels[neighbor] >= 0 || max(edges[index], edges[neighbor]) > edgeLimit) continue;
        labels[neighbor] = componentCount;
        queue[tail++] = neighbor;
      }
    }
    int boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    areas[componentCount] = area;
    aspects[componentCount] = boxWidth / float(boxHeight);
    fills[componentCount] = area / float(boxWidth * boxHeight);
    roughness[componentCount] = perimeter / max(1, sqrt(area));
    componentCount++;
  }
  boolean[] include = new boolean[componentCount];
  if (seedBody < 0) seedBody = 0;
  if (componentCount > 0) include[seedBody] = true;
  if (mode.equals("shape-relatives") && componentCount > 0) {
    float recognitionAmount = constrain(where.getFloat("recognition", .72), 0, 1);
    float tolerance = .08 + (1 - recognitionAmount) * 1.65;
    for (int body = 0; body < componentCount; body++) if (body != seedBody) {
      float areaDifference = abs(log((areas[body] + 1.0) / (areas[seedBody] + 1.0)));
      float aspectDifference = abs(log(max(.001, aspects[body]) / max(.001, aspects[seedBody])));
      float fillDifference = abs(fills[body] - fills[seedBody]) * 2;
      float roughnessDifference = abs(roughness[body] - roughness[seedBody]) / max(1, roughness[seedBody]);
      include[body] = areaDifference * .42 + aspectDifference * .26 + fillDifference * .2 + roughnessDifference * .12 <= tolerance;
    }
  }
  boolean[] mask = new boolean[kin.length];
  for (int index = 0; index < mask.length; index++) if (labels[index] >= 0 && include[labels[index]]) mask[index] = true;
  return new HeldWhereField(width, height, softenedBody(mask, width, height, where));
}

float sampleWhereField(HeldWhereField field, int x, int y, int width, int height) {
  float sampleX = width <= 1 ? 0 : x * (field.width - 1.0) / (width - 1.0);
  float sampleY = height <= 1 ? 0 : y * (field.height - 1.0) / (height - 1.0);
  int x0 = constrain(floor(sampleX), 0, field.width - 1), y0 = constrain(floor(sampleY), 0, field.height - 1);
  int x1 = min(field.width - 1, x0 + 1), y1 = min(field.height - 1, y0 + 1);
  float tx = sampleX - x0, ty = sampleY - y0;
  float top = lerp(field.weights[y0 * field.width + x0], field.weights[y0 * field.width + x1], tx);
  float bottom = lerp(field.weights[y1 * field.width + x0], field.weights[y1 * field.width + x1], tx);
  return lerp(top, bottom, ty);
}

PImage applyWhere(PImage input, PImage transformed, JSONObject effect, PImage sourceTarget) {
  if (!effect.hasKey("where")) return transformed;
  JSONObject where = effect.getJSONObject("where");
  String mode = where.getString("mode", "whole");
  boolean invert = where.getBoolean("invert", false);
  if (mode.equals("whole") && !invert) return transformed;
  String targetMemory = where.getString("targetMemory", "current");
  PImage recognition = targetMemory.equals("source") ? sourceTarget : input;
  boolean foundTarget = mode.equals("color-kin") || mode.equals("found-body") || mode.equals("shape-relatives");
  HeldWhereField foundField = null;
  if (foundTarget) {
    String effectId = effect.getString("id", "held-where-" + where.getInt("seed", renderSeed));
    if (targetMemory.equals("held")) foundField = heldWhereFields.get(effectId);
    if (foundField == null) {
      foundField = buildFoundWhere(recognition, effect);
      if (targetMemory.equals("held")) heldWhereFields.put(effectId, foundField);
    }
  }
  float threshold = where.getFloat("threshold", .5);
  float softness = max(.001, where.getFloat("softness", .12));
  float targetHue = where.getFloat("hue", 0);
  float hueWidth = where.getFloat("hueWidth", 36);
  int scale = max(2, where.getInt("scale", 48));
  int seed = where.getInt("seed", renderSeed);
  PImage out = input.get();
  input.loadPixels();
  recognition.loadPixels();
  transformed.loadPixels();
  out.loadPixels();
  for (int y=0;y<input.height;y++) for (int x=0;x<input.width;x++) {
    int index = y * input.width + x;
    int c = recognition.pixels[index];
    float weight = 1;
    float light = pixelLight(c);
    if (foundTarget) weight = sampleWhereField(foundField, x, y, input.width, input.height);
    else if (mode.equals("light")) weight = whereSmooth(threshold-softness, threshold+softness, light);
    else if (mode.equals("dark")) weight = 1-whereSmooth(threshold-softness, threshold+softness, light);
    else if (mode.equals("edges")) {
      float left = pixelLight(input.pixels[y*input.width+max(0,x-1)]);
      float right = pixelLight(input.pixels[y*input.width+min(input.width-1,x+1)]);
      float above = pixelLight(input.pixels[max(0,y-1)*input.width+x]);
      float below = pixelLight(input.pixels[min(input.height-1,y+1)*input.width+x]);
      float edge = min(1, sqrt(sq(right-left)+sq(below-above))*2.4);
      weight = whereSmooth(threshold-softness, threshold+softness, edge);
    } else if (mode.equals("saturated")) weight = whereSmooth(threshold-softness, threshold+softness, pixelSaturation(c));
    else if (mode.equals("muted")) weight = 1-whereSmooth(threshold-softness, threshold+softness, pixelSaturation(c));
    else if (mode.equals("hue")) {
      float distance = abs(((pixelHue(c)-targetHue+540)%360)-180);
      weight = (1-whereSmooth(hueWidth, min(180,hueWidth+softness*180), distance))*whereSmooth(.01,.08,pixelSaturation(c));
    } else if (mode.equals("checker")) weight = (floor(x/(float)scale)+floor(y/(float)scale))%2==0 ? 1 : 0;
    else if (mode.equals("stripes")) weight = floor(x/(float)scale)%2==0 ? 1 : 0;
    else if (mode.equals("blocks")) weight = blockWhereValue(floor(x/(float)scale),floor(y/(float)scale),seed)>=threshold ? 1 : 0;
    else if (mode.equals("random")) weight = blockWhereValue(floor(x/(float)scale),floor(y/(float)scale),seed)>=.5 ? 1 : 0;
    if (invert) weight = 1-weight;
    out.pixels[index] = lerpColor(input.pixels[index], transformed.pixels[index], constrain(weight,0,1));
  }
  out.updatePixels();
  return out;
}

PImage makeBase(float phase) {
  if (baseMode.equals("kone") && recipe.hasKey("koneForm")) {
    if(recipe.hasKey("formStack"))return stackedForm();
    return koneForm(recipe.getJSONObject("koneForm"));
  }
  PGraphics g = createGraphics(targetWidth, targetHeight, P2D);
  g.beginDraw();
  g.noSmooth();
  g.background(paletteColor(3));
  if (sourceImage != null) {
    float scale = sourceFit.equals("contain")
      ? min(targetWidth / float(sourceImage.width), targetHeight / float(sourceImage.height))
      : max(targetWidth / float(sourceImage.width), targetHeight / float(sourceImage.height));
    float dw = sourceImage.width * scale;
    float dh = sourceImage.height * scale;
    PImage preparedSource = sourceFit.equals("contain") && sourceBackground.equals("cutout") ? cutOutCoherentBackground(sourceImage) : sourceImage;
    g.image(preparedSource, (targetWidth - dw) * .5, (targetHeight - dh) * .5, dw, dh);
  } else {
    g.loadPixels();
    int c0 = paletteColor(3), c1 = paletteColor(0), c2 = paletteColor(1), c3 = paletteColor(2);
    for (int y = 0; y < targetHeight; y++) {
      for (int x = 0; x < targetWidth; x++) {
        float t = (x + y) / float(targetWidth + targetHeight);
        int c = t < .36 ? lerpColor(c0, c1, t / .36) : t < .7 ? lerpColor(c1, c2, (t - .36) / .34) : lerpColor(c2, c3, (t - .7) / .3);
        float n = noise(x * .006, y * .006, renderSeed * .0001) * 26 - 13;
        g.pixels[y * targetWidth + x] = color(constrain(red(c) + n, 0, 255), constrain(green(c) + n, 0, 255), constrain(blue(c) + n, 0, 255));
      }
    }
    g.updatePixels();
  }
  g.endDraw();
  return g.get();
}

PImage bandRupture(PImage input, JSONObject p, float phase) {
  float rupture = p.getFloat("rupture", .48);
  int bands = max(2, p.getInt("bands", 72));
  float scar = p.getFloat("scar", .24);
  float memory = p.getFloat("memory", .72);
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  g.background(colorMode.equals("palette") ? paletteColor(3) : color(0));
  g.tint(255, colorMode.equals("source") ? 255 : 45 + memory * 210);
  g.image(input, 0, 0);
  float bh = input.height / float(bands);
  for (int band = 0; band < bands; band++) {
    float y = band * bh;
    float slip = random(-input.width, input.width) * rupture + sin(band * .31 + phase) * input.width * rupture * .07;
    g.tint(255, 90 + memory * 165);
    g.image(input, slip, y, input.width, bh + 1, 0, int(y), input.width, min(input.height, ceil(y + bh + 1)));
    if (random(1) < scar) {
      float rx = random(input.width), rw = random(2, input.width * (.04 + rupture * .24)), rh = bh * random(.4, 3);
      if (colorMode.equals("palette")) {
        g.noStroke();
        g.fill(random(1) < .68 ? paletteColor(3) : paletteColor(2), random(115, 245));
        g.rect(rx, y, rw, rh);
      } else {
        int sx = int(random(max(1, input.width-rw))), sy = int(random(max(1, input.height-rh)));
        g.tint(255, random(115,245)); g.image(input, rx, y, rw, rh, sx, sy, min(input.width, sx+int(rw)), min(input.height, sy+int(rh)));
      }
    }
  }
  g.noTint();
  g.endDraw();
  return g.get();
}

PImage cutOutCoherentBackground(PImage input) {
  input.loadPixels();
  PImage out = createImage(input.width, input.height, ARGB);
  out.loadPixels();
  int patch = max(1, min(10, round(min(input.width, input.height) * .015)));
  float[] background = {0, 0, 0};
  int samples = 0;
  for (int corner = 0; corner < 4; corner++) {
    int originX = (corner % 2 == 0) ? 0 : input.width - patch;
    int originY = (corner < 2) ? 0 : input.height - patch;
    for (int y = originY; y < originY + patch; y++) for (int x = originX; x < originX + patch; x++) {
      int sample = input.pixels[y * input.width + x];
      background[0] += red(sample); background[1] += green(sample); background[2] += blue(sample);
      samples++;
    }
  }
  for (int channel = 0; channel < 3; channel++) background[channel] /= samples;
  boolean coherent = true;
  for (int corner = 0; corner < 4 && coherent; corner++) {
    int originX = (corner % 2 == 0) ? 0 : input.width - patch;
    int originY = (corner < 2) ? 0 : input.height - patch;
    for (int y = originY; y < originY + patch && coherent; y++) for (int x = originX; x < originX + patch; x++) {
      int sample = input.pixels[y * input.width + x];
      coherent = max(abs(red(sample) - background[0]), max(abs(green(sample) - background[1]), abs(blue(sample) - background[2]))) <= 24;
      if (!coherent) break;
    }
  }
  if (!coherent) return input;
  for (int i = 0; i < out.pixels.length; i++) {
    int sample = input.pixels[i];
    float distance = max(abs(red(sample) - background[0]), max(abs(green(sample) - background[1]), abs(blue(sample) - background[2])));
    float visibility = constrain((distance - 8) / 40.0, 0, 1);
    out.pixels[i] = color(red(sample), green(sample), blue(sample), alpha(sample) * visibility);
  }
  out.updatePixels();
  return out;
}

float channelKey(int c, int channel) {
  if (channel == 0) return red(c);
  if (channel == 1) return green(c);
  if (channel == 2) return blue(c);
  if (channel == 3) return hue(c);
  if (channel == 4) return saturation(c);
  float r = red(c), g = green(c), b = blue(c);
  if (channel == 6) return 255 - sqrt(sq(255-r) + sq(255-g) + sq(255-b)) / sqrt(3);
  if (channel == 7) return 255 - sqrt(r*r + g*g + b*b) / sqrt(3);
  if (channel == 8) return 255 - (max(r,g,b) - min(r,g,b));
  if (channel == 9) return .2126*r + .7152*g + .0722*b;
  if (channel == 10) return max(r,g,b) - min(r,g,b);
  return brightness(c);
}

void quickSortPixels(int[] pixels, int lo, int hi, int channel, boolean reverse) {
  int i = lo, j = hi;
  float pivot = channelKey(pixels[(lo + hi) >>> 1], channel);
  while (i <= j) {
    if (!reverse) {
      while (channelKey(pixels[i], channel) < pivot) i++;
      while (channelKey(pixels[j], channel) > pivot) j--;
    } else {
      while (channelKey(pixels[i], channel) > pivot) i++;
      while (channelKey(pixels[j], channel) < pivot) j--;
    }
    if (i <= j) { int temp = pixels[i]; pixels[i] = pixels[j]; pixels[j] = temp; i++; j--; }
  }
  if (lo < j) quickSortPixels(pixels, lo, j, channel, reverse);
  if (i < hi) quickSortPixels(pixels, i, hi, channel, reverse);
}

PImage wrongSort(PImage input, JSONObject p) {
  PImage out = input.get();
  out.loadPixels();
  float amount = p.getFloat("amount", .42);
  float threshold = p.getFloat("threshold", .32) * 255;
  int chunk = max(4, p.getInt("chunk", 54));
  int direction = p.getInt("direction", 0);
  int channel = p.getInt("channel", 5);
  boolean vertical = direction >= 2;
  boolean reverse = direction == 1 || direction == 3;
  int lines = vertical ? out.width : out.height;
  int length = vertical ? out.height : out.width;
  int stride = max(1, round(1 + (1 - amount) * 7));
  for (int line = 0; line < lines; line += stride) {
    if (random(1) > amount) continue;
    for (int start = 0; start < length; start += chunk) {
      if (random(1) > amount * 1.3) continue;
      int end = min(length, start + max(4, round(chunk * random(.45, 1.45))));
      int[] segment = new int[end - start];
      float mean = 0;
      for (int axis = start; axis < end; axis++) {
        int x = vertical ? line : axis, y = vertical ? axis : line;
        segment[axis - start] = out.pixels[y * out.width + x];
        mean += channelKey(segment[axis - start], channel);
      }
      if (segment.length > 1 && mean / segment.length >= threshold) {
        quickSortPixels(segment, 0, segment.length - 1, channel, reverse);
        for (int axis = start; axis < end; axis++) {
          int x = vertical ? line : axis, y = vertical ? axis : line;
          out.pixels[y * out.width + x] = segment[axis - start];
        }
      }
    }
  }
  out.updatePixels();
  return out;
}

int medianChannelValue(int c, int channel) {
  int baseChannel = channel % 6;
  int value = baseChannel == 0 ? int(red(c))
    : baseChannel == 1 ? int(green(c))
    : baseChannel == 2 ? int(blue(c))
    : baseChannel == 3 ? int(hue(c))
    : baseChannel == 4 ? int(saturation(c))
    : int(brightness(c));
  return channel >= 6 ? 255 - value : value;
}

void medianSwap(int[] values, int left, int right) {
  if (values[left] > values[right]) {
    int held = values[left]; values[left] = values[right]; values[right] = held;
  }
}

void sortMedianNeighborhood(int[] values) {
  medianSwap(values,0,1); medianSwap(values,3,4); medianSwap(values,6,7);
  medianSwap(values,1,2); medianSwap(values,4,5); medianSwap(values,7,8);
  medianSwap(values,0,1); medianSwap(values,3,4); medianSwap(values,6,7);
  medianSwap(values,0,3); medianSwap(values,3,6); medianSwap(values,0,3);
  medianSwap(values,1,4); medianSwap(values,4,7); medianSwap(values,1,4);
  medianSwap(values,2,5); medianSwap(values,5,8); medianSwap(values,2,5);
  medianSwap(values,1,3); medianSwap(values,5,7); medianSwap(values,2,6);
  medianSwap(values,4,6); medianSwap(values,2,4); medianSwap(values,2,3);
  medianSwap(values,5,6);
}

int medianBlendMode(int mode) {
  return mode == 1 ? OVERLAY : mode == 2 ? HARD_LIGHT : mode == 3 ? SCREEN
    : mode == 4 ? MULTIPLY : mode == 5 ? ADD : DIFFERENCE;
}

PImage medianFilter(PImage input, JSONObject p) {
  PImage original = input.get();
  PImage source = input.get();
  if (source.width < 3 || source.height < 3) return source;
  int position = constrain(p.getInt("position", 3), 0, 8);
  int channel = constrain(p.getInt("channel", 11), 0, 11);
  int iterations = constrain(p.getInt("iterations", 6), 1, 24);
  int[] neighborhood = new int[9];
  for (int pass = 0; pass < iterations; pass++) {
    source.loadPixels();
    PImage target = source.get();
    target.loadPixels();
    for (int y = 1; y < source.height - 1; y++) for (int x = 1; x < source.width - 1; x++) {
      int cursor = 0;
      for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
        int c = source.pixels[(y + oy) * source.width + x + ox];
        neighborhood[cursor++] = ((medianChannelValue(c, channel) & 255) << 24) | (c & 0x00ffffff);
      }
      sortMedianNeighborhood(neighborhood);
      target.pixels[y * target.width + x] = neighborhood[position] | 0xff000000;
    }
    target.updatePixels();
    source = target;
  }
  int blendMode = constrain(p.getInt("blendMode", 0), 0, 6);
  if (blendMode > 0) {
    PGraphics blended = createGraphics(source.width, source.height, P2D);
    blended.beginDraw();
    blended.image(source, 0, 0);
    blended.blendMode(medianBlendMode(blendMode));
    blended.image(original, 0, 0);
    blended.blendMode(BLEND);
    blended.endDraw();
    return blended.get();
  }
  return source;
}

boolean motionBefore(int a, int b, int channel, boolean reverse) {
  return reverse ? channelKey(a, channel) >= channelKey(b, channel) : channelKey(a, channel) <= channelKey(b, channel);
}

void motionSwap(int[] values, int a, int b) {
  int held = values[a]; values[a] = values[b]; values[b] = held;
}

void orderMotionFragment(int[] values, int method, float progress, int channel, boolean reverse, int seed, int line, int start) {
  int count = values.length;
  if (count < 2 || progress <= 0) return;
  if (method == 0) {
    int passes = round(progress * min(count - 1, 32));
    for (int pass = 0; pass < passes; pass++) for (int index = 1; index < count - pass; index++) {
      if (!motionBefore(values[index - 1], values[index], channel, reverse)) motionSwap(values, index - 1, index);
    }
  } else if (method == 1) {
    int frontier = 1 + round(progress * min(count - 1, 72));
    for (int index = 1; index < frontier; index++) {
      int held = values[index], cursor = index;
      while (cursor > 0 && !motionBefore(values[cursor - 1], held, channel, reverse)) {
        values[cursor] = values[cursor - 1]; cursor--;
      }
      values[cursor] = held;
    }
  } else if (method == 2) {
    int positions = round(progress * min(count - 1, 40));
    for (int position = 0; position < positions; position++) {
      int chosen = position;
      for (int index = position + 1; index < count; index++) if (!motionBefore(values[chosen], values[index], channel, reverse)) chosen = index;
      if (chosen != position) motionSwap(values, position, chosen);
    }
  } else if (method == 3) {
    int levels = max(1, ceil(log(count) / log(2)));
    int blockSize = min(count, round(pow(2, ceil(progress * levels))));
    for (int block = 0; block < count; block += blockSize) {
      int end = min(count, block + blockSize);
      if (end - block > 1) quickSortPixels(values, block, end - 1, channel, reverse);
    }
  } else if (method == 4) {
    int swaps = round(progress * (count - 1));
    for (int index = 1; index <= swaps; index++) {
      int target = min(count - 1, index + floor(asciiHash(seed, line, start, index * 17) * (count - index)));
      motionSwap(values, index - 1, target);
    }
  } else {
    int offset = round(progress * (count - 1));
    if (offset > 0) {
      int[] held = values.clone();
      for (int index = 0; index < count; index++) values[index] = held[(index + offset) % count];
    }
  }
}

PImage sortingMotion(PImage input, JSONObject effect, JSONObject p, float phase) {
  PImage out = input.get();
  out.loadPixels();
  int method = p.getInt("method", 0);
  float motion = .5 + .5 * cos(phase);
  float progress = constrain(p.getFloat("maximumOrder", .72) * motion, 0, 1);
  if (progress <= .000001) return out;
  int span = max(8, p.getInt("span", 72));
  int channel = p.getInt("channel", 5);
  int direction = p.getInt("direction", 0);
  boolean reverse = p.getFloat("reverse", 0) >= .5;
  boolean vertical = direction >= 2;
  boolean reverseTravel = direction == 1 || direction == 3;
  int lines = vertical ? out.width : out.height;
  int length = vertical ? out.height : out.width;
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int seed = renderSeed + where.getInt("seed", 0) + 4201;
  int[] source = out.pixels.clone();
  for (int line = 0; line < lines; line++) {
    for (int start = 0; start < length; start += span) {
      int end = min(length, start + span);
      int[] segment = new int[end - start];
      for (int axis = start; axis < end; axis++) {
        int x = vertical ? line : axis, y = vertical ? axis : line;
        segment[axis - start] = source[y * out.width + x];
      }
      orderMotionFragment(segment, method, progress, channel, reverse, seed, line, start);
      for (int axis = start; axis < end; axis++) {
        int x = vertical ? line : axis, y = vertical ? axis : line;
        int index = reverseTravel ? segment.length - 1 - (axis - start) : axis - start;
        out.pixels[y * out.width + x] = segment[index];
      }
    }
  }
  out.updatePixels();
  return out;
}

float ultimateHue(int c) {
  float r = red(c) / 255.0, g = green(c) / 255.0, b = blue(c) / 255.0;
  float high = max(r, max(g, b)), low = min(r, min(g, b)), delta = high - low;
  if (delta <= .000001) return 0;
  float hue = high == r ? ((g - b) / delta) % 6 : high == g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return ((hue * 60) + 360) % 360;
}

float ultimateSaturation(int c) {
  float high = max(red(c), max(green(c), blue(c))) / 255.0;
  float low = min(red(c), min(green(c), blue(c))) / 255.0;
  return high <= .000001 ? 0 : (high - low) / high;
}

float ultimateBrightness(int[] pixels, int width, int height, int x, int y) {
  x = constrain(x, 0, width - 1); y = constrain(y, 0, height - 1);
  int c = pixels[y * width + x];
  return (red(c) + green(c) + blue(c)) / 3.0;
}

boolean[] ultimateBodyMask(PImage current, PImage sourceTarget, JSONObject effect, JSONObject item, int recipeIndex) {
  String targetMemory = item.getString("bodyTargetMemory", "source");
  PImage recognition = targetMemory.equals("source") ? sourceTarget : current;
  JSONObject where = new JSONObject();
  where.setString("mode", "found-body");
  where.setInt("sampleColor", item.getInt("bodySampleColor", 0xc83d58));
  where.setFloat("sampleX", item.getFloat("bodySampleX", .5));
  where.setFloat("sampleY", item.getFloat("bodySampleY", .5));
  where.setFloat("colorReach", item.getFloat("bodyColorReach", .16));
  where.setFloat("shadeLoyalty", item.getFloat("bodyShadeLoyalty", .68));
  where.setFloat("edgeLoyalty", item.getFloat("bodyEdgeLoyalty", .58));
  where.setFloat("bodyExpansion", item.getFloat("bodyExpansion", 0));
  where.setFloat("recognition", .72);
  where.setFloat("softness", .12);
  where.setBoolean("invert", item.getBoolean("bodyInvert", false));
  where.setString("targetMemory", targetMemory);
  JSONObject bodyEffect = new JSONObject();
  String heldId = effect.getString("id", "ultimate-sort") + "::" + item.getString("id", "body-wand-" + recipeIndex);
  bodyEffect.setString("id", heldId);
  bodyEffect.setJSONObject("where", where);
  HeldWhereField field = targetMemory.equals("held") ? heldWhereFields.get(heldId) : null;
  if (field == null) {
    field = buildFoundWhere(recognition, bodyEffect);
    if (targetMemory.equals("held")) heldWhereFields.put(heldId, field);
  }
  boolean invert = item.getBoolean("bodyInvert", false);
  boolean[] mask = new boolean[current.width * current.height];
  for (int y = 0; y < current.height; y++) for (int x = 0; x < current.width; x++) {
    boolean selected = sampleWhereField(field, x, y, current.width, current.height) >= .5;
    mask[y * current.width + x] = invert ? !selected : selected;
  }
  return mask;
}

boolean[] ultimateMask(PImage image, PImage sourceTarget, JSONObject effect, JSONObject item, int recipeIndex) {
  image.loadPixels();
  boolean[] mask = new boolean[image.width * image.height];
  String territory = item.getString("territory", "whole");
  if (territory.equals("body")) return ultimateBodyMask(image, sourceTarget, effect, item, recipeIndex);
  float gate = item.getFloat("gate", 280);
  float toneRange = constrain(item.getFloat("toneTolerance", .2), 0, 1) * 255;
  for (int y = 0; y < image.height; y++) for (int x = 0; x < image.width; x++) {
    int at = y * image.width + x, c = image.pixels[at];
    float light = ultimateBrightness(image.pixels, image.width, image.height, x, y);
    boolean selected = territory.equals("whole");
    if (territory.equals("white")) selected = channelKey(c, 6) >= 255-toneRange;
    else if (territory.equals("black")) selected = channelKey(c, 7) >= 255-toneRange;
    else if (territory.equals("gray")) selected = channelKey(c, 10) <= toneRange;
    else if (territory.equals("colorful")) selected = channelKey(c, 10) >= toneRange;
    else if (territory.equals("midtones")) selected = abs(channelKey(c, 9)-127.5) <= toneRange/2;
    else if (territory.equals("light")) selected = light >= min(255, gate);
    else if (territory.equals("dark")) selected = light <= min(255, gate);
    else if (territory.equals("edges")) {
      float gx = -ultimateBrightness(image.pixels,image.width,image.height,x-1,y-1) - 2*ultimateBrightness(image.pixels,image.width,image.height,x-1,y) - ultimateBrightness(image.pixels,image.width,image.height,x-1,y+1)
        + ultimateBrightness(image.pixels,image.width,image.height,x+1,y-1) + 2*ultimateBrightness(image.pixels,image.width,image.height,x+1,y) + ultimateBrightness(image.pixels,image.width,image.height,x+1,y+1);
      float gy = -ultimateBrightness(image.pixels,image.width,image.height,x-1,y-1) - 2*ultimateBrightness(image.pixels,image.width,image.height,x,y-1) - ultimateBrightness(image.pixels,image.width,image.height,x+1,y-1)
        + ultimateBrightness(image.pixels,image.width,image.height,x-1,y+1) + 2*ultimateBrightness(image.pixels,image.width,image.height,x,y+1) + ultimateBrightness(image.pixels,image.width,image.height,x+1,y+1);
      selected = sqrt(gx*gx + gy*gy) >= gate;
    } else if (!territory.equals("whole") && !territory.equals("light") && !territory.equals("dark")) {
      float center = territory.equals("red") ? 0 : territory.equals("orange") ? 28 : territory.equals("yellow") ? 58 : territory.equals("green") ? 120 : territory.equals("cyan") ? 185 : territory.equals("blue") ? 235 : 325;
      float distance = abs(((ultimateHue(c) - center + 540) % 360) - 180);
      selected = ultimateSaturation(c) >= .12 && distance <= 28;
    }
    mask[at] = selected;
  }
  return mask;
}

int ultimateMethod(String method) {
  return method.equals("bubble") ? 0 : method.equals("insertion") ? 1 : method.equals("selection") ? 2 : method.equals("merge") ? 3
    : method.equals("permute") || method.equals("scatter") ? 4 : method.equals("roll") ? 5 : method.equals("heap") ? 6 : method.equals("shell") ? 7
    : method.equals("quick") ? 8 : method.equals("smooth") ? 9 : method.equals("one-color") ? 10 : 11;
}

int ultimateSignal(String signal) {
  return signal.equals("red") ? 0 : signal.equals("green") ? 1 : signal.equals("blue") ? 2 : signal.equals("hue") ? 3 : signal.equals("saturation") ? 4 : signal.equals("white") ? 6 : signal.equals("black") ? 7 : signal.equals("gray") ? 8 : signal.equals("luma") ? 9 : signal.equals("chroma") ? 10 : 5;
}

boolean ultimateAfter(int a, int b, int channel) {
  return channelKey(a, channel) > channelKey(b, channel);
}

void ultimateHeapSift(int[] values, int root, int end, int channel) {
  while (root * 2 + 1 <= end) {
    int child = root * 2 + 1, chosen = root;
    if (ultimateAfter(values[child], values[chosen], channel)) chosen = child;
    if (child + 1 <= end && ultimateAfter(values[child + 1], values[chosen], channel)) chosen = child + 1;
    if (chosen == root) return;
    motionSwap(values, root, chosen);
    root = chosen;
  }
}

void orderUltimateFragment(int[] values, int method, float progress, int channel, int seed, int line) {
  if (method < 6) {
    orderMotionFragment(values, method, progress, channel, false, seed, line, 0);
    return;
  }
  int count = values.length;
  if (count < 2 || progress <= 0) return;
  if (method == 6) {
    for (int root = (count - 2) / 2; root >= 0; root--) ultimateHeapSift(values, root, count - 1, channel);
    int extractions = max(1, round(progress * (count - 1)));
    for (int step = 0, end = count - 1; step < extractions && end > 0; step++, end--) {
      motionSwap(values, 0, end);
      ultimateHeapSift(values, 0, end - 1, channel);
    }
  } else if (method == 7) {
    int[] allGaps = {701, 301, 132, 57, 23, 10, 4, 1};
    int available = 0;
    for (int gap : allGaps) if (gap < count) available++;
    int passes = max(1, ceil(progress * available)), used = 0;
    for (int gap : allGaps) {
      if (gap >= count || used >= passes) continue;
      for (int index = gap; index < count; index++) {
        int held = values[index], cursor = index;
        while (cursor >= gap && ultimateAfter(values[cursor - gap], held, channel)) {
          values[cursor] = values[cursor - gap]; cursor -= gap;
        }
        values[cursor] = held;
      }
      used++;
    }
  } else if (method == 8) {
    int partitions = max(1, round(progress * (count - 1)));
    int[] lows = new int[count], highs = new int[count];
    int stack = 0; lows[stack] = 0; highs[stack++] = count - 1;
    while (stack > 0 && partitions > 0) {
      stack--; int low = lows[stack], high = highs[stack];
      if (low >= high) continue;
      int middle = low + (high - low) / 2;
      motionSwap(values, middle, high);
      int pivot = values[high], boundary = low;
      for (int index = low; index < high; index++) if (!ultimateAfter(values[index], pivot, channel)) {
        motionSwap(values, index, boundary++);
      }
      motionSwap(values, boundary, high);
      if (boundary + 1 < high) { lows[stack] = boundary + 1; highs[stack++] = high; }
      if (low < boundary - 1) { lows[stack] = low; highs[stack++] = boundary - 1; }
      partitions--;
    }
  } else if (method == 9) {
    int[] leonardo = {1, 3, 5, 9, 15, 25, 41, 67, 109, 177, 287, 465, 753, 1219};
    int available = 0;
    for (int gap : leonardo) if (gap < count) available++;
    int passes = max(1, ceil(progress * available));
    for (int gapIndex = available - 1; gapIndex >= max(0, available - passes); gapIndex--) {
      int gap = leonardo[gapIndex];
      for (int index = gap; index < count; index++) {
        int held = values[index], cursor = index;
        while (cursor >= gap && ultimateAfter(values[cursor - gap], held, channel)) {
          values[cursor] = values[cursor - gap]; cursor -= gap;
        }
        values[cursor] = held;
      }
    }
  } else if (method == 10) {
    int sample = values[constrain(round(progress * (count - 1)), 0, count - 1)];
    for (int index = 0; index < count; index++) values[index] = sample;
  } else {
    int[] source = values.clone();
    int cursor = 0;
    while (cursor < count) {
      int longest = max(2, round((1 - progress) * min(96, count) + 2));
      int span = max(1, round(longest * (.35 + asciiHash(seed, line, cursor, 991) * .65)));
      int sample = source[cursor];
      for (int index = cursor; index < min(count, cursor + span); index++) values[index] = sample;
      cursor += span;
    }
  }
}

void applyUltimateResolution(PImage before, PImage sorted, boolean[] mask, JSONObject item) {
  String resolution = item.getString("resolution", "pixel");
  int maxBlock = constrain(item.getInt("maxBlock", 18), 1, 32);
  int minBlock = constrain(item.getInt("minBlock", 1), 1, maxBlock);
  if (resolution.equals("pixel") || maxBlock <= 1) return;
  before.loadPixels(); sorted.loadPixels();
  int[] resolved = sorted.pixels.clone();
  int grid = max(2, maxBlock);
  for (int cellY = 0; cellY < sorted.height; cellY += grid) for (int cellX = 0; cellX < sorted.width; cellX += grid) {
    int x1 = min(sorted.width, cellX + grid), y1 = min(sorted.height, cellY + grid);
    float difference = 0; int selected = 0, sampleX = -1, sampleY = -1;
    for (int y = cellY; y < y1; y++) for (int x = cellX; x < x1; x++) {
      int at = y * sorted.width + x;
      if (!mask[at]) continue;
      difference += abs(red(sorted.pixels[at])-red(before.pixels[at])) + abs(green(sorted.pixels[at])-green(before.pixels[at])) + abs(blue(sorted.pixels[at])-blue(before.pixels[at]));
      selected++;
      if (sampleX < 0) { sampleX = x; sampleY = y; }
    }
    if (selected == 0) continue;
    float change = resolution.equals("fixed") ? 1 : min(1, difference / (selected * 255.0 * 1.4));
    int block = max(1, round(lerp(minBlock, maxBlock, change)));
    if (block <= 1) continue;
    int sample = sorted.pixels[sampleY * sorted.width + sampleX];
    int centerX = round((cellX + x1 - 1) / 2.0), centerY = round((cellY + y1 - 1) / 2.0);
    int left = centerX - block / 2, top = centerY - block / 2;
    for (int y = top; y < top + block; y++) for (int x = left; x < left + block; x++) {
      if (x >= 0 && y >= 0 && x < sorted.width && y < sorted.height && mask[y * sorted.width + x]) resolved[y * sorted.width + x] = sample;
    }
  }
  arrayCopy(resolved, sorted.pixels);
}

void drawUltimateWand(PImage image, boolean[] mask, float phase, int selectionSpeed) {
  image.loadPixels();
  int march = floor(phase / TWO_PI * 8 * selectionSpeed);
  int[] held = image.pixels.clone();
  for (int y = 0; y < image.height; y++) for (int x = 0; x < image.width; x++) {
    int at = y * image.width + x;
    if (!mask[at]) continue;
    boolean boundary = x == 0 || y == 0 || x == image.width-1 || y == image.height-1
      || !mask[at-1] || !mask[at+1] || !mask[at-image.width] || !mask[at+image.width];
    if (boundary) held[at] = ((x + y + march) % 8) < 4 ? color(245) : color(20);
  }
  arrayCopy(held, image.pixels);
}

float ultimateGlimmerNoise(int seed, float x, float y) {
  int left = floor(x), top = floor(y);
  float fx = x - left, fy = y - top;
  float sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  float topMix = lerp(asciiHash(seed, left, top, 1723), asciiHash(seed, left + 1, top, 1723), sx);
  float bottomMix = lerp(asciiHash(seed, left, top + 1, 1723), asciiHash(seed, left + 1, top + 1, 1723), sx);
  return lerp(topMix, bottomMix, sy);
}

float ultimatePixelLight(int[] pixels, int width, int height, int x, int y) {
  int heldX = constrain(x, 0, width - 1), heldY = constrain(y, 0, height - 1);
  int value = pixels[heldY * width + heldX];
  return (red(value) + green(value) + blue(value)) / 3.0;
}

void ultimateShine(int[] target, int[] source, int width, int height, int x, int y, float strength) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  int at = y * width + x, value = source[at];
  float alpha = constrain(strength, 0, 1);
  float r = lerp(red(value), 232 + red(value) * .09, alpha);
  float g = lerp(green(value), 232 + green(value) * .09, alpha);
  float b = lerp(blue(value), 232 + blue(value) * .09, alpha);
  target[at] = color(r, g, b, 255);
}

void applyUltimateGlimmer(PImage original, PImage sorted, boolean[] mask, JSONObject item, int seed, float phase) {
  float amount = constrain(item.getFloat("amount", .34), 0, 1);
  if (amount <= 0) return;
  float starSize = constrain(item.getFloat("glimmerSize", 4), .5, 12);
  float speed = constrain(item.getFloat("glimmerSpeed", .18), 0, 1);
  int signalChannel = ultimateSignal(item.getString("signal", "brightness"));
  original.loadPixels(); sorted.loadPixels();
  int[] source = sorted.pixels.clone(), shining = sorted.pixels.clone();
  float scale = max(sorted.width, sorted.height) / 1000.0;
  int spacing = max(4, round((30 - amount * 20) * scale));
  int radius = max(1, round(starSize * scale));
  float threshold = .78 - amount * .38;
  float drift = speed * 7;
  float driftX = cos(phase) * drift, driftY = sin(phase) * drift;
  for (int cellY = 0; cellY < sorted.height; cellY += spacing) for (int cellX = 0; cellX < sorted.width; cellX += spacing) {
    int x = min(sorted.width - 1, cellX + floor(asciiHash(seed, cellX, cellY, 31) * spacing));
    int y = min(sorted.height - 1, cellY + floor(asciiHash(seed, cellX, cellY, 47) * spacing));
    if (!mask[y * sorted.width + x]) continue;
    float center = ultimatePixelLight(source, sorted.width, sorted.height, x, y);
    float contrast = max(max(abs(center - ultimatePixelLight(source, sorted.width, sorted.height, x - radius, y)), abs(center - ultimatePixelLight(source, sorted.width, sorted.height, x + radius, y))), max(abs(center - ultimatePixelLight(source, sorted.width, sorted.height, x, y - radius)), abs(center - ultimatePixelLight(source, sorted.width, sorted.height, x, y + radius)))) / 105.0;
    int at = y * sorted.width + x;
    float changed = (abs(red(source[at]) - red(original.pixels[at])) + abs(green(source[at]) - green(original.pixels[at])) + abs(blue(source[at]) - blue(original.pixels[at]))) / 260.0;
    float chosenSignal = channelKey(source[at], signalChannel) / 255.0;
    float signal = min(1, contrast * .62 + changed * .68 + chosenSignal * .28);
    float noise = ultimateGlimmerNoise(seed, cellX / float(spacing) * .78 + driftX, cellY / float(spacing) * .78 + driftY);
    float ignition = noise * .58 + signal * .62;
    float intensity = constrain((ignition - threshold) / max(.001, 1.2 - threshold), 0, 1);
    if (intensity <= 0) continue;
    ultimateShine(shining, source, sorted.width, sorted.height, x, y, min(1, intensity * 1.5));
    for (int distance = 1; distance <= radius; distance++) {
      float ray = intensity * .72 * sq(1 - distance / float(radius + 1));
      if (x - distance >= 0 && mask[y * sorted.width + x - distance]) ultimateShine(shining, source, sorted.width, sorted.height, x - distance, y, ray);
      if (x + distance < sorted.width && mask[y * sorted.width + x + distance]) ultimateShine(shining, source, sorted.width, sorted.height, x + distance, y, ray);
      if (y - distance >= 0 && mask[(y - distance) * sorted.width + x]) ultimateShine(shining, source, sorted.width, sorted.height, x, y - distance, ray);
      if (y + distance < sorted.height && mask[(y + distance) * sorted.width + x]) ultimateShine(shining, source, sorted.width, sorted.height, x, y + distance, ray);
    }
  }
  arrayCopy(shining, sorted.pixels);
}

PImage ultimateSort(PImage input, JSONObject effect, float phase, PImage sourceTarget) {
  PImage out = input.get();
  if (!effect.hasKey("ultimateSort")) return out;
  JSONObject stack = effect.getJSONObject("ultimateSort");
  JSONArray recipes = stack.hasKey("recipes") ? stack.getJSONArray("recipes") : new JSONArray();
  float motion = .5 + .5 * cos(phase);
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int baseSeed = renderSeed + where.getInt("seed", 0) + 8801;
  for (int recipeIndex = 0; recipeIndex < recipes.size(); recipeIndex++) {
    JSONObject item = recipes.getJSONObject(recipeIndex);
    if (!item.getBoolean("enabled", true)) continue;
    PImage before = out.get(); before.loadPixels(); out.loadPixels();
    boolean[] mask = ultimateMask(before, sourceTarget, effect, item, recipeIndex);
    String methodName = item.getString("method", "permute");
    if (methodName.equals("glimmer")) {
      applyUltimateGlimmer(input, out, mask, item, baseSeed + recipeIndex * 10007 + 6090, phase);
      out.updatePixels();
      continue;
    }
    String action = item.getString("action", "sort");
    if (!action.equals("wand")) {
      String direction = item.getString("direction", "left");
      boolean vertical = direction.equals("up") || direction.equals("down");
      boolean reverseTravel = direction.equals("right") || direction.equals("down");
      int lines = vertical ? out.width : out.height, length = vertical ? out.height : out.width;
      boolean isScatter = methodName.equals("scatter");
      int method = ultimateMethod(methodName);
      int channel = ultimateSignal(item.getString("signal", "hue"));
      float progress = isScatter ? 1 : constrain(item.getFloat("amount", .1) * motion, 0, 1);
      float loopPosition = ((phase / TWO_PI) % 1 + 1) % 1;
      int scatterChanges = constrain(round(item.getFloat("scatterRefresh", 12)), 0, 120);
      int scatterState = isScatter && scatterChanges > 0 ? floor(loopPosition * scatterChanges + .000001) : 0;
      int scatterSeed = baseSeed + recipeIndex * 10007 + scatterState * 65537;
      for (int line = 0; line < lines; line++) {
        int[] positions = new int[length], values = new int[length]; int count = 0;
        for (int axis = 0; axis < length; axis++) {
          int x = vertical ? line : axis, y = vertical ? axis : line, at = y * out.width + x;
          if (!mask[at]) continue;
          positions[count] = at; values[count] = before.pixels[at]; count++;
        }
        if (count == 0) continue;
        int[] segment = subset(values, 0, count);
        orderUltimateFragment(segment, method, progress, channel, scatterSeed, line);
        for (int index = 0; index < count; index++) out.pixels[positions[index]] = segment[reverseTravel ? count - 1 - index : index];
      }
      applyUltimateResolution(before, out, mask, item);
    }
    if (!action.equals("sort")) drawUltimateWand(out, mask, phase, constrain(round(item.getFloat("selectionSpeed", 3)), 0, 12));
    out.updatePixels();
  }
  return out;
}

int[] wizPixelOrder(int width, int height, String path) {
  int[] order = new int[width * height];
  int cursor = 0;
  if (path.equals("columns")) {
    for (int x = 0; x < width; x++) for (int y = 0; y < height; y++) order[cursor++] = y * width + x;
  } else if (path.equals("snake")) {
    for (int y = 0; y < height; y++) for (int step = 0; step < width; step++) {
      int x = (y & 1) == 0 ? step : width - 1 - step;
      order[cursor++] = y * width + x;
    }
  } else if (path.equals("clustered")) {
    int tile = 32;
    for (int tileY = 0; tileY < height; tileY += tile) for (int tileX = 0; tileX < width; tileX += tile) {
      for (int morton = 0; morton < tile * tile; morton++) {
        int localX = 0, localY = 0;
        for (int bit = 0; bit < 5; bit++) {
          localX |= ((morton >> (bit * 2)) & 1) << bit;
          localY |= ((morton >> (bit * 2 + 1)) & 1) << bit;
        }
        int x = tileX + localX, y = tileY + localY;
        if (x < width && y < height) order[cursor++] = y * width + x;
      }
    }
  } else {
    for (int index = 0; index < order.length; index++) order[index] = index;
  }
  return order;
}

float wizHsbChannel(int value, int channel) {
  float r = red(value) / 255.0, g = green(value) / 255.0, b = blue(value) / 255.0;
  float high = max(r, max(g, b)), low = min(r, min(g, b)), delta = high - low;
  if (channel == 2) return high * 255;
  if (channel == 1) return high <= 0 ? 0 : delta / high * 255;
  if (delta <= .000001) return 0;
  float hue = high == r ? ((g - b) / delta) % 6 : high == g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (((hue * 60) + 360) % 360) / 360.0 * 255;
}

float wizSignal(int value, int channel, boolean hsb) {
  float signal = hsb ? wizHsbChannel(value, channel) : channel == 0 ? red(value) : channel == 1 ? green(value) : blue(value);
  return signal > 127 ? signal - 256 : signal;
}

int wizHsbColor(float hue, float saturation, float brightness) {
  float h = (hue / 255.0 * 360) % 360, s = saturation / 255.0, v = brightness / 255.0;
  float chroma = v * s, section = h / 60.0, middle = chroma * (1 - abs((section % 2) - 1));
  float r1, g1, b1;
  if (section < 1) { r1 = chroma; g1 = middle; b1 = 0; }
  else if (section < 2) { r1 = middle; g1 = chroma; b1 = 0; }
  else if (section < 3) { r1 = 0; g1 = chroma; b1 = middle; }
  else if (section < 4) { r1 = 0; g1 = middle; b1 = chroma; }
  else if (section < 5) { r1 = middle; g1 = 0; b1 = chroma; }
  else { r1 = chroma; g1 = 0; b1 = middle; }
  float match = v - chroma;
  return color((r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255);
}

final float WIZ_D65_X = .950456, WIZ_D65_Y = 1.0, WIZ_D65_Z = 1.088754;
final float WIZ_CIE_EPSILON = 216.0 / 24389.0, WIZ_CIE_K = 24389.0 / 27.0;

float wizClamp255(float value) { return Float.isNaN(value) || Float.isInfinite(value) ? 0 : constrain(value, 0, 255); }
float wizWrap256(float value) { return ((value % 256) + 256) % 256; }

void wizRgbToXyz(float red, float green, float blue, float[] result) {
  float r = red / 255.0, g = green / 255.0, b = blue / 255.0;
  r = r > .04045 ? pow((r + .055) / 1.055, 2.4) : r / 12.92;
  g = g > .04045 ? pow((g + .055) / 1.055, 2.4) : g / 12.92;
  b = b > .04045 ? pow((b + .055) / 1.055, 2.4) : b / 12.92;
  result[0] = (r * .4124 + g * .3576 + b * .1805) * 100;
  result[1] = (r * .2126 + g * .7152 + b * .0722) * 100;
  result[2] = (r * .0193 + g * .1192 + b * .9505) * 100;
}

int wizXyzToRgb(float xValue, float yValue, float zValue) {
  float x = xValue / 100.0, y = yValue / 100.0, z = zValue / 100.0;
  float r = x * 3.2406 + y * -1.5372 + z * -.4986;
  float g = x * -.9689 + y * 1.8758 + z * .0415;
  float b = x * .0557 + y * -.2040 + z * 1.057;
  r = r > .0031308 ? 1.055 * pow(r, 1.0 / 2.4) - .055 : 12.92 * r;
  g = g > .0031308 ? 1.055 * pow(g, 1.0 / 2.4) - .055 : 12.92 * g;
  b = b > .0031308 ? 1.055 * pow(b, 1.0 / 2.4) - .055 : 12.92 * b;
  return color(wizClamp255(r * 255), wizClamp255(g * 255), wizClamp255(b * 255));
}

void wizToColorSpace(int value, String space, float[] result, float[] xyz) {
  float r = red(value), g = green(value), b = blue(value);
  if (space.equals("rgb")) { result[0] = r; result[1] = g; result[2] = b; return; }
  if (space.equals("hsb")) { for (int channel = 0; channel < 3; channel++) result[channel] = wizHsbChannel(value, channel); return; }
  if (space.equals("cmy")) { result[0] = 255-r; result[1] = 255-g; result[2] = 255-b; return; }
  if (space.equals("ohta")) { result[0]=(r+g+b)/3; result[1]=127.5+.5*(r-b); result[2]=127.5-.25*r+.5*g-.25*b; return; }
  if (space.equals("rggbg")) { result[0]=wizWrap256(r-g); result[1]=g; result[2]=wizWrap256(b-g); return; }
  float luma=.2126*r+.7152*g+.0722*b;
  if (space.equals("ypbpr")) { result[0]=luma; result[1]=wizWrap256(b-luma); result[2]=wizWrap256(r-luma); return; }
  if (space.equals("ycbcr")) { result[0]=.298839*r+.586811*g+.114350*b; result[1]=-.168736*r-.331264*g+.5*b+127.5; result[2]=.5*r-.418688*g-.081312*b+127.5; return; }
  if (space.equals("ydbdr")) { result[0]=.299*r+.587*g+.114*b; result[1]=127.5+(-.450*r-.883*g+1.333*b)/2.666; result[2]=127.5+(-1.333*r+1.116*g+.217*b)/2.666; return; }
  if (space.equals("hwb")) {
    float high=max(r,max(g,b)), low=min(r,min(g,b));
    if (high==low) result[0]=255;
    else { float difference=r==low?g-b:g==low?b-r:r-g, sector=r==low?3:g==low?5:1; result[0]=(sector-difference/(high-low))/6*254; }
    result[1]=low; result[2]=255-high; return;
  }
  if (space.equals("hcl")) {
    float rn=r/255,gn=g/255,bn=b/255,high=max(rn,max(gn,bn)),low=min(rn,min(gn,bn)),chroma=high-low,hue=0;
    if(chroma!=0)hue=high==rn?((gn-bn)/chroma+6)%6:high==gn?(bn-rn)/chroma+2:(rn-gn)/chroma+4;
    result[0]=hue/6*255; result[1]=chroma*255; result[2]=(.298839*rn+.586811*gn+.114350*bn)*255; return;
  }
  wizRgbToXyz(r,g,b,xyz);
  if(space.equals("xyz")){result[0]=xyz[0]*2.55;result[1]=xyz[1]*2.55;result[2]=xyz[2]*2.55;}
  else if(space.equals("yxy")){float sum=xyz[0]+xyz[1]+xyz[2];result[0]=xyz[1]*2.55;result[1]=sum>0?xyz[0]/sum*255:0;result[2]=sum>0?xyz[1]/sum*255:0;}
  else if(space.equals("lab")){
    float x=xyz[0]/100/WIZ_D65_X,y=xyz[1]/100/WIZ_D65_Y,z=xyz[2]/100/WIZ_D65_Z;
    float fx=x>WIZ_CIE_EPSILON?pow(x,1.0/3.0):(WIZ_CIE_K*x+16)/116,fy=y>WIZ_CIE_EPSILON?pow(y,1.0/3.0):(WIZ_CIE_K*y+16)/116,fz=z>WIZ_CIE_EPSILON?pow(z,1.0/3.0):(WIZ_CIE_K*z+16)/116;
    result[0]=(116*fy-16)*.01*255;result[1]=(.5*(fx-fy)+.5)*255;result[2]=(.5*(fy-fz)+.5)*255;
  } else {
    float denominator=xyz[0]+15*xyz[1]+3*xyz[2],luminance=xyz[1]/100,lightness=luminance>WIZ_CIE_EPSILON?116*pow(luminance,1.0/3.0)-16:WIZ_CIE_K*luminance;
    if(denominator==0){result[0]=lightness*2.55;result[1]=128;result[2]=128;}
    else{float reference=WIZ_D65_X+15*WIZ_D65_Y+3*WIZ_D65_Z,u=13*lightness*(4*xyz[0]/denominator-4*WIZ_D65_X/reference),v=13*lightness*(9*xyz[1]/denominator-9*WIZ_D65_Y/reference);result[0]=lightness*2.55;result[1]=(u+134)/354*255;result[2]=(v+140)/262*255;}
  }
  for(int channel=0;channel<3;channel++)result[channel]=wizClamp255(result[channel]);
}

int wizFromColorSpace(String space,float first,float second,float third){
  float a=wizClamp255(first),b=wizClamp255(second),c=wizClamp255(third);
  if(space.equals("rgb"))return color(a,b,c); if(space.equals("hsb"))return wizHsbColor(a,b,c); if(space.equals("cmy"))return color(255-a,255-b,255-c);
  if(space.equals("ohta")){float i2=b-127.5,i3=c-127.5;return color(wizClamp255(a+i2-.66668*i3),wizClamp255(a+1.33333*i3),wizClamp255(a-i2-.66668*i3));}
  if(space.equals("rggbg"))return color(wizWrap256(a+b),b,wizWrap256(c+b));
  if(space.equals("ypbpr")){float blue=wizWrap256(b+a),red=wizWrap256(c+a),green=(a-.2126*red-.0722*blue)/.7152;return color(red,wizClamp255(green),blue);}
  if(space.equals("ycbcr")){float cb=b-127.5,cr=c-127.5;return color(wizClamp255(a+1.402*cr),wizClamp255(a-.344136*cb-.714136*cr),wizClamp255(a+1.772*cb));}
  if(space.equals("ydbdr")){float db=(b-127.5)*2.666,dr=(c-127.5)*2.666;return color(wizClamp255(a+9.23037e-5*db-.52591*dr),wizClamp255(a-.12913*db+.26789*dr),wizClamp255(a+.66467*db-7.92025e-5*dr));}
  if(space.equals("hwb")){
    float blackLimit=255-c;if(a==255)return color(blackLimit);float hue=a/254*6,fraction=hue-floor(hue);int sector=floor(hue);if((sector&1)!=0)fraction=1-fraction;float white=b/255,value=blackLimit/255,middle=white+fraction*(value-white),r,g,blue;
    if(sector==1){r=middle;g=value;blue=white;}else if(sector==2){r=white;g=value;blue=middle;}else if(sector==3){r=white;g=middle;blue=value;}else if(sector==4){r=middle;g=white;blue=value;}else if(sector==5){r=value;g=white;blue=middle;}else{r=value;g=middle;blue=white;}
    return color(wizClamp255(r*255),wizClamp255(g*255),wizClamp255(blue*255));
  }
  if(space.equals("hcl")){
    float hue=6*a/255,chroma=b/255,luma=c/255,middle=chroma*(1-abs((hue%2)-1)),r=0,g=0,blue=0;if(hue<1){r=chroma;g=middle;}else if(hue<2){r=middle;g=chroma;}else if(hue<3){g=chroma;blue=middle;}else if(hue<4){g=middle;blue=chroma;}else if(hue<5){r=middle;blue=chroma;}else{r=chroma;blue=middle;}float match=luma-(.298839*r+.586811*g+.114350*blue);return color(wizClamp255((r+match)*255),wizClamp255((g+match)*255),wizClamp255((blue+match)*255));
  }
  if(space.equals("xyz"))return wizXyzToRgb(a/2.55,b/2.55,c/2.55);if(space.equals("yxy")){float yy=a/2.55,x=b/255,y=c/255;return wizXyzToRgb(y>0?x*yy/y:0,yy,y>0?(1-x-y)*yy/y:0);}
  if(space.equals("lab")){float lightness=a/255*100,aa=b/255*2-1,bb=c/255*2-1,y=(lightness+16)/116,x=y+aa,z=y-bb,xc=x*x*x,yc=y*y*y,zc=z*z*z;x=xc>WIZ_CIE_EPSILON?xc:(116*x-16)/WIZ_CIE_K;y=yc>WIZ_CIE_EPSILON?yc:lightness/WIZ_CIE_K;z=zc>WIZ_CIE_EPSILON?zc:(116*z-16)/WIZ_CIE_K;return wizXyzToRgb(100*WIZ_D65_X*x,100*WIZ_D65_Y*y,100*WIZ_D65_Z*z);}
  float lightness=a/255*100;if(lightness==0)return color(0);float u=354*b/255-134,v=262*c/255-140,y=lightness>WIZ_CIE_K*WIZ_CIE_EPSILON?pow((lightness+16)/116,3):lightness/WIZ_CIE_K,reference=WIZ_D65_X+15*WIZ_D65_Y+3*WIZ_D65_Z,up=u/(13*lightness)+4*WIZ_D65_X/reference,vp=v/(13*lightness)+9*WIZ_D65_Y/reference;return wizXyzToRgb(100*y*9*up/(4*vp),100*y,100*y*(12-3*up-20*vp)/(4*vp));
}

float wizRecover(float value, String mode) {
  if (mode.equals("clip")) return constrain(value, 0, 255);
  if (mode.equals("wrap")) return ((value % 256) + 256) % 256;
  if (mode.equals("reflect")) {
    float reflected = ((value % 510) + 510) % 510;
    return reflected <= 255 ? reflected : 510 - reflected;
  }
  return abs(value < 0 ? 256 + value : value) % 256;
}

int wizBlockLength(int remaining) {
  int limit = min(16384, remaining), length = 1;
  while (length <= limit / 2) length *= 2;
  return length;
}

void wizProcessBlock(float[] signal, int length, float compression, float expansion, float mass, float structure, float grain) {
  float[] temporary = new float[length];
  int active = length, span = 2;
  while (active >= 2) {
    int half = active / 2;
    float survival = span <= 8 ? grain : span <= 128 ? structure : mass;
    for (int index = 0; index < half; index++) {
      float a = signal[index * 2], b = signal[index * 2 + 1];
      temporary[index] = (a + b) * sqrt(0.5);
      temporary[half + index] = (a - b) * sqrt(0.5) * survival;
    }
    arrayCopy(temporary, 0, signal, 0, active);
    active = half;
    span *= 2;
  }
  signal[0] *= mass;
  for (int index = 0; index < length; index++) signal[index] = (int)(signal[index] / compression);
  active = 1;
  while (active < length) {
    for (int index = 0; index < active; index++) {
      float average = signal[index], detail = signal[active + index];
      temporary[index * 2] = (average + detail) * sqrt(0.5);
      temporary[index * 2 + 1] = (average - detail) * sqrt(0.5);
    }
    arrayCopy(temporary, 0, signal, 0, active * 2);
    active *= 2;
  }
  for (int index = 0; index < length; index++) signal[index] *= expansion;
}

PImage wizprocess(PImage input, JSONObject effect, float phase) {
  PImage out = input.get();
  if (!effect.hasKey("wizprocess") && !effect.hasKey("waveletChamber")) return out;
  JSONObject process = effect.hasKey("wizprocess") ? effect.getJSONObject("wizprocess") : effect.getJSONObject("waveletChamber");
  float tide = constrain(process.getFloat("tide", .46), 0, 1);
  float mass = constrain(process.getFloat("mass", .82), 0, 1) * (1 - tide * .9 * sq(sin(phase * .5)));
  float structure = constrain(process.getFloat("structure", .68), 0, 1) * (1 - tide * .9 * sq(sin(phase)));
  float grain = constrain(process.getFloat("grain", .42), 0, 1) * (1 - tide * .9 * sq(sin(phase * 1.5)));
  float compression = constrain(process.getFloat("compression", 36), 1, 1200);
  float expansion = constrain(process.getFloat("expansion", 42), 0, 1200);
  String path = process.getString("path", "rows");
  String reconstruction = process.getString("reconstruction", "fold");
  String colorSpace = process.getString("colorSpace", "hsb");
  boolean hsb = colorSpace.equals("hsb"), directColor = colorSpace.equals("rgb") || hsb;
  boolean together = process.getString("channels", "separate").equals("together");
  int channelPhase = constrain(process.getInt("channelPhase", 0), -48, 48);
  out.loadPixels();
  input.loadPixels();
  int[] source = input.pixels.clone();
  int[] order = wizPixelOrder(out.width, out.height, path);
  byte[] first = new byte[order.length], second = new byte[order.length], third = new byte[order.length];
  byte[][] rebuilt = { first, second, third };
  float[] signal = new float[16384];
  float[] converted = new float[3], xyz = new float[3];
  if (!directColor) for (int position = 0; position < order.length; position++) {
    wizToColorSpace(source[order[position]], colorSpace, converted, xyz);
    for (int channel = 0; channel < 3; channel++) rebuilt[channel][position] = (byte)round(converted[channel]);
  }
  if (together) {
    int total = order.length * 3, offset = 0;
    while (offset < total) {
      int length = wizBlockLength(total - offset);
      for (int local = 0; local < length; local++) {
        int sample = offset + local, position = sample / 3, channel = sample % 3;
        if (directColor) signal[local] = wizSignal(source[order[position]], channel, hsb);
        else { int packed = rebuilt[channel][position] & 255; signal[local] = packed > 127 ? packed - 256 : packed; }
      }
      wizProcessBlock(signal, length, compression, expansion, mass, structure, grain);
      for (int local = 0; local < length; local++) {
        int sample = offset + local, position = sample / 3, channel = sample % 3;
        int shifted = ((local + channelPhase) % length + length) % length;
        rebuilt[channel][position] = (byte)round(wizRecover(signal[shifted], reconstruction));
      }
      offset += length;
    }
  } else {
    for (int channel = 0; channel < 3; channel++) {
      int offset = 0;
      while (offset < order.length) {
        int length = wizBlockLength(order.length - offset);
        for (int local = 0; local < length; local++) {
          if (directColor) signal[local] = wizSignal(source[order[offset + local]], channel, hsb);
          else { int packed = rebuilt[channel][offset + local] & 255; signal[local] = packed > 127 ? packed - 256 : packed; }
        }
        wizProcessBlock(signal, length, compression, expansion, mass, structure, grain);
        for (int local = 0; local < length; local++) rebuilt[channel][offset + local] = (byte)round(wizRecover(signal[local], reconstruction));
        offset += length;
      }
    }
  }
  for (int position = 0; position < order.length; position++) {
    float a = rebuilt[0][position] & 255, b = rebuilt[1][position] & 255, c = rebuilt[2][position] & 255;
    out.pixels[order[position]] = directColor ? (hsb ? wizHsbColor(a, b, c) : color(a, b, c)) : wizFromColorSpace(colorSpace, a, b, c);
  }
  out.updatePixels();
  return out;
}

PImage pixelDrift(PImage input, JSONObject p) {
  PImage out = input.get();
  int distance = max(1, p.getInt("distance", 9));
  int iterations = max(1, p.getInt("iterations", 4));
  float hueMemory = p.getFloat("hueMemory", .82);
  float lightMemory = p.getFloat("lightMemory", .38);
  int direction = p.getInt("direction", 0);
  int dx = direction == 0 ? -distance : direction == 1 ? distance : 0;
  int dy = direction == 2 ? -distance : direction == 3 ? distance : 0;
  out.loadPixels();
  for (int pass = 0; pass < iterations; pass++) {
    int[] prior = out.pixels.clone();
    for (int y = 0; y < out.height; y++) for (int x = 0; x < out.width; x++) {
      int sx = constrain(x + dx, 0, out.width - 1), sy = constrain(y + dy, 0, out.height - 1);
      int at = y * out.width + x, from = sy * out.width + sx;
      float localLight = brightness(prior[at]), sourceLight = brightness(prior[from]);
      float mix = sourceLight > localLight ? 1 - lightMemory : (1 - lightMemory) * .38;
      float rm = mix, gm = (1 - hueMemory) * .7 + mix * .3, bm = mix;
      out.pixels[at] = color(lerp(red(prior[at]), red(prior[from]), rm), lerp(green(prior[at]), green(prior[from]), gm), lerp(blue(prior[at]), blue(prior[from]), bm));
    }
  }
  out.updatePixels();
  return out;
}

PImage signalEcho(PImage input, JSONObject p, float phase) {
  float separation = p.getFloat("separation", 13);
  float bleed = p.getFloat("bleed", .54);
  float scan = p.getFloat("scan", .28);
  float ghost = p.getFloat("ghost", .46);
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  g.background(colorMode.equals("palette") ? paletteColor(3) : color(0));
  g.tint(255, 220); g.image(input, 0, 0);
  g.blendMode(SCREEN);
  int a = int(45 + bleed * 86);
  if (colorMode.equals("palette")) {
    int c0 = paletteColor(0), c1 = paletteColor(1);
    g.tint(red(c0), green(c0), blue(c0), a); g.image(input, separation * (1 + sin(phase) * .2), 0);
    g.tint(red(c1), green(c1), blue(c1), a * .8); g.image(input, -separation * .72, 0);
  } else {
    g.tint(255, 0, 0, a); g.image(input, separation * (1 + sin(phase) * .2), 0);
    g.tint(0, 255, 255, a * .8); g.image(input, -separation * .72, 0);
  }
  g.blendMode(BLEND);
  g.tint(255, ghost * 105); g.image(input, separation * 3.2, sin(phase) * 4);
  g.noTint(); g.noStroke(); g.fill(colorMode.equals("palette") ? paletteColor(3) : color(0), 30 + scan * 150);
  int spacing = max(2, round(8 - scan * 6));
  for (int y = 0; y < input.height; y += spacing) g.rect(0, y, input.width, max(1, scan * 2));
  g.endDraw();
  return g.get();
}

int ditherPaletteChoice(float rr, float gg, float bb, int paletteLogic, int levels) {
  float step = 255.0 / max(1, levels - 1);
  float pr = constrain(round(rr / step) * step, 0, 255);
  float pg = constrain(round(gg / step) * step, 0, 255);
  float pb = constrain(round(bb / step) * step, 0, 255);
  if (paletteLogic == 0) return color(pr, pg, pb);
  if (paletteLogic == 1) {
    int chosen = paletteColor(0);
    float distance = Float.MAX_VALUE;
    for (int index = 0; index < palette.size(); index++) {
      int candidate = paletteColor(index);
      float dr = pr - red(candidate), dg = pg - green(candidate), db = pb - blue(candidate);
      float next = dr * dr + dg * dg + db * db;
      if (next < distance) { distance = next; chosen = candidate; }
    }
    return chosen;
  }
  float tone = constrain(rr * .2126 + gg * .7152 + bb * .0722, 0, 255);
  float steppedTone = constrain(round(tone / step) * step, 0, 255);
  int index = constrain(floor(steppedTone / 256.0 * 4), 0, 3);
  int[] brokenOrder = {0, 2, 3, 1};
  return paletteColor(paletteLogic == 3 ? brokenOrder[index] : index);
}

void addDitherError(float[] buffer, int columns, int column, int channel, float value, float weight, float pressure) {
  if (column < 0 || column >= columns) return;
  buffer[(column + 1) * 3 + channel] += value * weight * pressure;
}

float ditherTone(int packed) {
  return (red(packed) * .2126 + green(packed) * .7152 + blue(packed) * .0722) / 255.0;
}

PImage ditherField(PImage input, JSONObject effect, JSONObject p) {
  PImage out = input.get(); out.loadPixels();
  int levels = max(2, p.getInt("levels", 4)), grain = max(1, p.getInt("grain", 2));
  float pressure = p.getFloat("pressure", .68);
  int channelOffset = p.getInt("channelOffset", 2);
  int[] matrix = {0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
  float step = 255.0 / (levels - 1);
  int[] prior = out.pixels.clone();
  int ditherVersion = p.getInt("ditherVersion", 0);

  // Preserve the exact Bayer field used by recipes made before Dither Mode.
  if (ditherVersion < 1) {
    for (int y = 0; y < out.height; y++) for (int x = 0; x < out.width; x++) {
      float threshold = (matrix[((y / grain & 3) * 4) + (x / grain & 3)] / 15.0 - .5) * step * pressure;
      int rx = constrain(x - channelOffset, 0, out.width - 1), bx = constrain(x + channelOffset, 0, out.width - 1);
      float r = round((red(prior[y*out.width+rx]) + threshold) / step) * step;
      float g = round((green(prior[y*out.width+x]) + threshold) / step) * step;
      float b = round((blue(prior[y*out.width+bx]) + threshold) / step) * step;
      out.pixels[y*out.width+x] = color(constrain(r,0,255), constrain(g,0,255), constrain(b,0,255));
    }
    out.updatePixels(); return out;
  }

  int travel = constrain(p.getInt("travel", 1), 0, 4);
  int paletteLogic = constrain(p.getInt("paletteLogic", 2), 0, 3);
  int body = constrain(p.getInt("body", 0), 0, 4);
  float sourceReturn = constrain(p.getFloat("sourceReturn", .16), 0, 1);
  int habitat = constrain(p.getInt("habitat", 0), 0, 3);
  float reach = constrain(p.getFloat("reach", 1), .05, 1);
  float habitatScale = max(8, p.getFloat("habitatScale", 72)) * max(1, min(input.width, input.height) / 760.0);
  float diversity = constrain(p.getFloat("diversity", 0), 0, 1);
  int cell = grain, columns = ceil(input.width / float(cell)), rows = ceil(input.height / float(cell));
  int[] cellColors = new int[columns * rows];
  byte[] cellTones = new byte[columns * rows];
  float[] currentError = new float[(columns + 2) * 3];
  float[] nextError = new float[(columns + 2) * 3];
  int seed = renderSeed + effect.getJSONObject("where").getInt("seed", 0) * 31;

  for (int row = 0; row < rows; row++) {
    boolean reverse = travel == 2 && (row & 1) == 1;
    for (int turn = 0; turn < columns; turn++) {
      int column = reverse ? columns - 1 - turn : turn;
      int index = row * columns + column;
      int centerX = constrain(column * cell + cell / 2, 0, input.width - 1);
      int centerY = constrain(row * cell + cell / 2, 0, input.height - 1);
      int rx = constrain(centerX - (paletteLogic == 0 ? channelOffset : 0), 0, input.width - 1);
      int bx = constrain(centerX + (paletteLogic == 0 ? channelOffset : 0), 0, input.width - 1);
      float[] original = {red(prior[centerY * input.width + rx]), green(prior[centerY * input.width + centerX]), blue(prior[centerY * input.width + bx])};
      float[] adjusted = new float[3];
      for (int channel = 0; channel < 3; channel++) {
        if (travel == 0) {
          float threshold = (matrix[((row & 3) * 4) + (column & 3)] / 15.0 - .5) * step * pressure;
          adjusted[channel] = constrain(original[channel] + threshold, 0, 255);
        } else if (travel == 3) {
          adjusted[channel] = constrain(original[channel] + (parliamentHash(seed, column, row, channel) - .5) * step * pressure * 2, 0, 255);
        } else adjusted[channel] = constrain(original[channel] + currentError[(column + 1) * 3 + channel], 0, 255);
      }
      int chosen = ditherPaletteChoice(adjusted[0], adjusted[1], adjusted[2], paletteLogic, levels);
      cellColors[index] = chosen;
      cellTones[index] = (byte) round(constrain(original[0] * .2126 + original[1] * .7152 + original[2] * .0722, 0, 255));

      if (travel == 1 || travel == 2 || travel == 4) for (int channel = 0; channel < 3; channel++) {
        float chosenChannel = channel == 0 ? red(chosen) : channel == 1 ? green(chosen) : blue(chosen);
        float error = adjusted[channel] - chosenChannel;
        int direction = reverse ? -1 : 1;
        if (travel == 4 && ((direction > 0 && column == columns - 1) || (direction < 0 && column == 0))) addDitherError(nextError, columns, direction > 0 ? 0 : columns - 1, channel, error, 7.0/16, pressure);
        else addDitherError(currentError, columns, column + direction, channel, error, 7.0/16, pressure);
        addDitherError(nextError, columns, column - direction, channel, error, 3.0/16, pressure);
        addDitherError(nextError, columns, column, channel, error, 5.0/16, pressure);
        addDitherError(nextError, columns, column + direction, channel, error, 1.0/16, pressure);
      }
    }
    currentError = nextError;
    nextError = new float[(columns + 2) * 3];
  }

  if (habitat > 0) {
    PGraphics ecology = createGraphics(input.width, input.height, P2D);
    ecology.beginDraw(); ecology.noSmooth(); ecology.image(input, 0, 0); ecology.noStroke();
    for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
      int index = row * columns + column;
      float centerX = column * cell + cell / 2.0, centerY = row * cell + cell / 2.0;
      int coarseX = floor(centerX / habitatScale), coarseY = floor(centerY / habitatScale);
      float fineScale = max(cell * 2, habitatScale * .43);
      int fineX = floor(centerX / fineScale), fineY = floor(centerY / fineScale);
      float climate = parliamentHash(seed, coarseX, coarseY, 41) * .68 + parliamentHash(seed, fineX, fineY, 43) * .32;
      float tone = (cellTones[index] & 0xff) / 255.0;
      int leftX = constrain(round(centerX - cell), 0, input.width - 1), rightX = constrain(round(centerX + cell), 0, input.width - 1);
      int upY = constrain(round(centerY - cell), 0, input.height - 1), downY = constrain(round(centerY + cell), 0, input.height - 1);
      int sampleX = constrain(round(centerX), 0, input.width - 1), sampleY = constrain(round(centerY), 0, input.height - 1);
      float horizontal = abs(ditherTone(prior[sampleY * input.width + rightX]) - ditherTone(prior[sampleY * input.width + leftX]));
      float vertical = abs(ditherTone(prior[downY * input.width + sampleX]) - ditherTone(prior[upY * input.width + sampleX]));
      float edge = min(1, (horizontal + vertical) * 2.4);
      float signal = habitat == 1 ? climate * .52 + abs(tone - .5) * .96 : habitat == 2 ? climate : climate * .42 + edge * .58;
      if (signal < 1 - reach) continue;

      float localSize = cell * (1 + floor(parliamentHash(seed, column, row, 53) * diversity * 3));
      int localBody = body;
      if (parliamentHash(seed, column, row, 59) < diversity * .55) localBody = (body + 1 + floor(parliamentHash(seed, column, row, 61) * 4)) % 5;
      int chosen = cellColors[index];
      if (paletteLogic > 0 && parliamentHash(seed, column, row, 67) < diversity * .42) {
        int paletteIndex = 0;
        for (int candidate = 0; candidate < 4; candidate++) if (paletteColor(candidate) == chosen) { paletteIndex = candidate; break; }
        chosen = paletteColor((paletteIndex + 1 + floor(parliamentHash(seed, column, row, 71) * 3)) % 4);
      }
      float darkness = 1 - tone;
      float x = centerX - localSize / 2.0, y = centerY - localSize / 2.0, cx = centerX, cy = centerY;
      ecology.noStroke(); ecology.fill(chosen);
      if (localBody == 0) ecology.rect(x, y, localSize, localSize);
      else if (localBody == 1) {
        float diameter = max(.8, localSize * (.32 + darkness * 1.12));
        ecology.ellipse(cx, cy, diameter, diameter);
      } else if (localBody == 2) ecology.rect(cx - localSize * .62, cy - max(.5, localSize * (.05 + darkness * .18)), localSize * 1.24, max(1, localSize * (.1 + darkness * .36)));
      else if (localBody == 3) {
        boolean flip = parliamentHash(seed, column, row, 73) > .5;
        ecology.triangle(x + (flip ? localSize : 0), y, x + (flip ? 0 : localSize), y + localSize * (.28 + darkness * .72), x + (flip ? localSize : 0), y + localSize);
      } else {
        float chosenTone = red(chosen) * .2126 + green(chosen) * .7152 + blue(chosen) * .0722;
        int level = constrain(floor(tone * 5), 0, 4);
        ecology.noStroke(); ecology.fill(chosen); ecology.rect(x, y, localSize, localSize);
        int ink = paletteLogic == 0 ? (chosenTone > 138 ? color(20, 24, 28) : color(245, 242, 234)) : (chosenTone > 138 ? paletteColor(3) : paletteColor(2));
        float weight = max(1, localSize * .075), inset = weight * .65;
        ecology.noFill(); ecology.stroke(ink, 210); ecology.strokeWeight(weight); ecology.rect(x + inset, y + inset, max(0, localSize - inset * 2), max(0, localSize - inset * 2));
        if (level == 1) { ecology.noStroke(); ecology.fill(ink); ecology.rect(x + localSize * .42, y + localSize * .42, localSize * .16, localSize * .16); }
        else if (level == 2) { ecology.noFill(); ecology.stroke(ink, 210); ecology.strokeWeight(weight); ecology.rect(x + localSize * .25, y + localSize * .25, localSize * .5, localSize * .5); }
        else if (level == 3) { ecology.stroke(ink, 210); ecology.strokeWeight(weight); ecology.line(cx, y + inset, cx, y + localSize - inset); ecology.line(x + inset, cy, x + localSize - inset, cy); }
        else if (level == 4) { ecology.noStroke(); ecology.fill(ink); ecology.rect(x + localSize * .18, y + localSize * .18, localSize * .64, localSize * .64); ecology.fill(chosen); ecology.rect(x + localSize * .36, y + localSize * .36, localSize * .28, localSize * .28); }
      }
    }
    ecology.endDraw(); out = ecology.get(); out.loadPixels();
  } else if (body == 0) {
    for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
      int chosen = cellColors[row * columns + column];
      for (int y = row * cell; y < min(input.height, (row + 1) * cell); y++) for (int x = column * cell; x < min(input.width, (column + 1) * cell); x++) out.pixels[y * input.width + x] = chosen;
    }
    out.updatePixels();
  } else if (body < 4) {
    PGraphics marks = createGraphics(input.width, input.height, P2D);
    marks.beginDraw(); marks.noSmooth(); marks.background(paletteLogic == 0 ? color(244,241,235) : paletteColor(3)); marks.noStroke();
    for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
      int index = row * columns + column;
      float darkness = 1 - (cellTones[index] & 0xff) / 255.0;
      float x = column * cell, y = row * cell, cx = x + cell / 2.0, cy = y + cell / 2.0;
      marks.fill(cellColors[index]);
      if (body == 1) {
        float diameter = max(.8, cell * (0.32 + darkness * 1.12));
        marks.ellipse(cx, cy, diameter, diameter);
      } else if (body == 2) {
        marks.rect(cx - cell * .62, cy - max(.5, cell * (.05 + darkness * .18)), cell * 1.24, max(1, cell * (.1 + darkness * .36)));
      } else {
        boolean flip = parliamentHash(seed, column, row, 17) > .5;
        marks.triangle(x + (flip ? cell : 0), y, x + (flip ? 0 : cell), y + cell * (.28 + darkness * .72), x + (flip ? cell : 0), y + cell);
      }
    }
    marks.endDraw(); out = marks.get(); out.loadPixels();
  } else {
    PGraphics windows = createGraphics(input.width, input.height, P2D);
    windows.beginDraw(); windows.noSmooth();
    for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
      int index = row * columns + column;
      int chosen = cellColors[index];
      float chosenTone = red(chosen) * .2126 + green(chosen) * .7152 + blue(chosen) * .0722;
      float lightness = (cellTones[index] & 0xff) / 255.0;
      int level = constrain(floor(lightness * 5), 0, 4);
      float x = column * cell, y = row * cell, cellWidth = min(cell, input.width - x), cellHeight = min(cell, input.height - y);
      windows.noStroke(); windows.fill(chosen); windows.rect(x, y, cellWidth, cellHeight);
      int ink = paletteLogic == 0 ? (chosenTone > 138 ? color(20, 24, 28) : color(245, 242, 234)) : (chosenTone > 138 ? paletteColor(3) : paletteColor(2));
      float weight = max(1, cell * .075), inset = weight * .65;
      windows.noFill(); windows.stroke(ink, 210); windows.strokeWeight(weight);
      windows.rect(x + inset, y + inset, max(0, cellWidth - inset * 2), max(0, cellHeight - inset * 2));
      if (level == 1) {
        windows.noStroke(); windows.fill(ink); windows.rect(x + cellWidth * .42, y + cellHeight * .42, cellWidth * .16, cellHeight * .16);
      } else if (level == 2) {
        windows.noFill(); windows.stroke(ink, 210); windows.strokeWeight(weight); windows.rect(x + cellWidth * .25, y + cellHeight * .25, cellWidth * .5, cellHeight * .5);
      } else if (level == 3) {
        windows.stroke(ink, 210); windows.strokeWeight(weight);
        windows.line(x + cellWidth * .5, y + inset, x + cellWidth * .5, y + cellHeight - inset);
        windows.line(x + inset, y + cellHeight * .5, x + cellWidth - inset, y + cellHeight * .5);
      } else if (level == 4) {
        windows.noStroke(); windows.fill(ink); windows.rect(x + cellWidth * .18, y + cellHeight * .18, cellWidth * .64, cellHeight * .64);
        windows.fill(chosen); windows.rect(x + cellWidth * .36, y + cellHeight * .36, cellWidth * .28, cellHeight * .28);
      }
    }
    windows.endDraw(); out = windows.get(); out.loadPixels();
  }
  if (sourceReturn > 0) {
    input.loadPixels(); out.loadPixels();
    for (int index = 0; index < out.pixels.length; index++) out.pixels[index] = lerpColor(out.pixels[index], input.pixels[index], sourceReturn);
    out.updatePixels();
  }
  return out;
}

float parliamentHash(int seed, int column, int row, int salt) {
  int value = seed ^ (column + 1) * 374761393 ^ (row + 3) * 668265263 ^ (salt + 7) * 0x9e3779b9;
  value = (value ^ (value >>> 13)) * 1274126177;
  long unsigned = (value ^ (value >>> 16)) & 0xffffffffL;
  return unsigned / 4294967296.0;
}

int parliamentWrap(int value, int limit) {
  int wrapped = value % limit;
  return wrapped < 0 ? wrapped + limit : wrapped;
}

int parliamentPalette(float rr, float gg, float bb, int rotation) {
  int chosenIndex = 0;
  float chosenDistance = Float.MAX_VALUE;
  for (int index = 0; index < palette.size(); index++) {
    int candidate = palette.getInt(index);
    float dr = rr - ((candidate >> 16) & 255);
    float dg = gg - ((candidate >> 8) & 255);
    float db = bb - (candidate & 255);
    float distance = dr * dr + dg * dg + db * db;
    if (distance < chosenDistance) {
      chosenDistance = distance;
      chosenIndex = index;
    }
  }
  return palette.getInt((chosenIndex + rotation) % palette.size());
}

PImage parliamentOfPixels(PImage input, JSONObject effect, JSONObject p) {
  input.loadPixels();
  PImage out = input.get();
  out.loadPixels();
  float scale = min(input.width, input.height) / 760.0;
  int district = max(4, round(p.getFloat("districtSize", 54) * scale));
  int grain = max(1, round(p.getFloat("ballotGrain", 2) * max(1, scale)));
  int parties = max(2, p.getInt("parties", 5));
  int heldDialect = constrain(p.getInt("dialect", 0), 0, 4);
  float majority = p.getFloat("majorityRule", .64);
  float minority = p.getFloat("minorityPersistence", .3);
  float migration = p.getFloat("migration", .46);
  float coupChance = p.getFloat("coup", .18);
  float disagreement = p.getFloat("channelDisagreement", .48);
  float memory = p.getFloat("sourceMemory", .2);
  int columns = ceil(input.width / float(district));
  int rows = ceil(input.height / float(district));
  int count = columns * rows;
  float[] averages = new float[count * 3];
  int[] dialects = new int[count];
  boolean[] coups = new boolean[count];
  int seed = renderSeed + effect.getJSONObject("where").getInt("seed", 0) * 31;
  int[] bayer = {0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
  float step = 255.0 / (parties - 1);

  for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
    int districtIndex = row * columns + column;
    int x0 = column * district, y0 = row * district;
    int x1 = min(input.width - 1, x0 + district - 1), y1 = min(input.height - 1, y0 + district - 1);
    int[] sampleX = {x0, x1, x0, x1, (x0 + x1) / 2};
    int[] sampleY = {y0, y0, y1, y1, (y0 + y1) / 2};
    for (int sample = 0; sample < 5; sample++) {
      int c = input.pixels[sampleY[sample] * input.width + sampleX[sample]];
      averages[districtIndex * 3] += red(c) / 5.0;
      averages[districtIndex * 3 + 1] += green(c) / 5.0;
      averages[districtIndex * 3 + 2] += blue(c) / 5.0;
    }
    dialects[districtIndex] = heldDialect == 0 ? 1 + min(3, floor(parliamentHash(seed, column, row, 5) * 4)) : heldDialect;
    coups[districtIndex] = parliamentHash(seed, column, row, 17) < coupChance;
    if (coups[districtIndex] && heldDialect == 0) dialects[districtIndex] = 1 + dialects[districtIndex] % 4;
  }

  for (int y = 0; y < input.height; y++) for (int x = 0; x < input.width; x++) {
    int column = x / district, row = y / district, districtIndex = row * columns + column;
    int dialect = dialects[districtIndex];
    int moveX = round((parliamentHash(seed, column, row, 23) * 2 - 1) * district * migration * 2.5);
    int moveY = round((parliamentHash(seed, column, row, 29) * 2 - 1) * district * migration * 1.5);
    int sampleX = parliamentWrap(x + moveX, input.width), sampleY = parliamentWrap(y + moveY, input.height);
    int sampleColor = input.pixels[sampleY * input.width + sampleX];
    float pixelVote = parliamentHash(seed, x / grain, y / grain, 37);
    float pattern;
    if (dialect == 1) pattern = bayer[((y / grain & 3) * 4) + (x / grain & 3)] / 15.0;
    else if (dialect == 2) pattern = (((x / grain) ^ (y / grain)) & 3) / 3.0;
    else if (dialect == 3) pattern = ((x / grain + (y / grain) * 2) % 7) / 6.0;
    else pattern = parliamentHash(seed, x / grain, y / grain, 43);
    float threshold = (pattern - .5) * step;
    boolean dissent = pixelVote < minority;
    float majorityWeight = majority * (dissent ? .12 : 1 - minority * .28);
    float sampledR = red(sampleColor), sampledG = green(sampleColor), sampledB = blue(sampleColor);
    float partyR = constrain(round((averages[districtIndex * 3] + threshold + (coups[districtIndex] ? step : 0)) / step) * step, 0, 255);
    float partyG = constrain(round((averages[districtIndex * 3 + 1] + threshold - (coups[districtIndex] ? step : 0)) / step) * step, 0, 255);
    float partyB = constrain(round((averages[districtIndex * 3 + 2] + threshold + (coups[districtIndex] ? step : 0)) / step) * step, 0, 255);
    float localR = constrain(round((sampledR + threshold * (1 - disagreement)) / step) * step, 0, 255);
    float localG = constrain(round((sampledG + threshold) / step) * step, 0, 255);
    float localB = constrain(round((sampledB + threshold * (1 + disagreement)) / step) * step, 0, 255);
    float electedR = lerp(localR, partyR, majorityWeight);
    float electedG = lerp(localG, partyG, majorityWeight);
    float electedB = lerp(localB, partyB, majorityWeight);

    if (dialect == 1) {
      int packed = parliamentPalette(electedR, electedG, electedB, coups[districtIndex] ? 1 : 0);
      electedR = (packed >> 16) & 255;
      electedG = (packed >> 8) & 255;
      electedB = packed & 255;
    } else if (dialect == 2) {
      int order = (column + row + (coups[districtIndex] ? 1 : 0)) % 3;
      float rawR = order == 0 ? sampledR : order == 1 ? sampledG : sampledB;
      float rawG = order == 0 ? sampledG : order == 1 ? sampledB : sampledR;
      float rawB = order == 0 ? sampledB : order == 1 ? sampledR : sampledG;
      electedR = lerp(electedR, rawR, disagreement * .72);
      electedG = lerp(electedG, rawG, disagreement * .72);
      electedB = lerp(electedB, rawB, disagreement * .72);
    } else if (dialect == 3) {
      float light = electedR * .2126 + electedG * .7152 + electedB * .0722;
      float fax = light + threshold * 1.7 >= 128 ? 255 : 0;
      electedR = lerp(fax, partyR, disagreement * .52);
      electedG = lerp(fax, partyG, disagreement * .52);
      electedB = lerp(fax, partyB, disagreement * .52);
    } else {
      int split = round(district * disagreement * .55);
      int redColor = input.pixels[sampleY * input.width + parliamentWrap(sampleX - split, input.width)];
      int blueColor = input.pixels[sampleY * input.width + parliamentWrap(sampleX + split, input.width)];
      electedR = lerp(electedR, red(redColor), disagreement);
      electedB = lerp(electedB, blue(blueColor), disagreement);
      if (((y / grain) + row) % 5 == 0) electedG *= 1 - disagreement * .72;
    }

    int target = y * input.width + x;
    int original = input.pixels[target];
    int rr = round(lerp(electedR, red(original), memory));
    int gg = round(lerp(electedG, green(original), memory));
    int bb = round(lerp(electedB, blue(original), memory));
    out.pixels[target] = (original & 0xff000000) | (constrain(rr, 0, 255) << 16) | (constrain(gg, 0, 255) << 8) | constrain(bb, 0, 255);
  }
  out.updatePixels();
  return out;
}

float asciiHash(int seed, int column, int row, int salt) {
  int value = seed ^ ((column + salt) * 374761393) ^ ((row - salt) * 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  int held = value ^ (value >>> 16);
  return (held & 0x7fffffff) / 2147483647.0;
}

float languageHash(int seed, int column, int row, int salt) {
  int value = seed ^ column * 374761393 ^ row * 668265263 ^ salt * 1274126177;
  value = (value ^ (value >>> 13)) * 1274126177;
  long unsigned = (value ^ (value >>> 16)) & 0xffffffffL;
  return unsigned / 4294967295.0;
}

float languageNoise(int seed, float x, float y, int salt) {
  int x0 = floor(x), y0 = floor(y);
  float rawX = x - x0, rawY = y - y0;
  float tx = rawX * rawX * (3 - 2 * rawX), ty = rawY * rawY * (3 - 2 * rawY);
  float top = lerp(languageHash(seed, x0, y0, salt), languageHash(seed, x0 + 1, y0, salt), tx);
  float bottom = lerp(languageHash(seed, x0, y0 + 1, salt), languageHash(seed, x0 + 1, y0 + 1, salt), tx);
  return lerp(top, bottom, ty);
}

float languageWhere(PImage input, JSONObject where, float x, float y) {
  int sx = constrain(round(x), 0, input.width - 1), sy = constrain(round(y), 0, input.height - 1);
  int sample = input.pixels[sy * input.width + sx];
  String mode = where.getString("mode", "whole");
  float threshold = where.getFloat("threshold", .5), softness = max(.001, where.getFloat("softness", .12));
  int scale = max(2, where.getInt("scale", 48)), seed = where.getInt("seed", renderSeed);
  float weight = 1, light = pixelLight(sample);
  if (mode.equals("light")) weight = whereSmooth(threshold - softness, threshold + softness, light);
  else if (mode.equals("dark")) weight = 1 - whereSmooth(threshold - softness, threshold + softness, light);
  else if (mode.equals("edges")) {
    float left = pixelLight(input.pixels[sy * input.width + max(0, sx - 1)]);
    float right = pixelLight(input.pixels[sy * input.width + min(input.width - 1, sx + 1)]);
    float above = pixelLight(input.pixels[max(0, sy - 1) * input.width + sx]);
    float below = pixelLight(input.pixels[min(input.height - 1, sy + 1) * input.width + sx]);
    weight = whereSmooth(threshold - softness, threshold + softness, min(1, sqrt(sq(right - left) + sq(below - above)) * 2.4));
  } else if (mode.equals("saturated")) weight = whereSmooth(threshold - softness, threshold + softness, pixelSaturation(sample));
  else if (mode.equals("muted")) weight = 1 - whereSmooth(threshold - softness, threshold + softness, pixelSaturation(sample));
  else if (mode.equals("hue")) {
    float distance = abs(((pixelHue(sample) - where.getFloat("hue", 0) + 540) % 360) - 180);
    float width = where.getFloat("hueWidth", 36);
    weight = (1 - whereSmooth(width, min(180, width + softness * 180), distance)) * whereSmooth(.01, .08, pixelSaturation(sample));
  } else if (mode.equals("checker")) weight = (floor(x / scale) + floor(y / scale)) % 2 == 0 ? 1 : 0;
  else if (mode.equals("stripes")) weight = floor(x / scale) % 2 == 0 ? 1 : 0;
  else if (mode.equals("blocks")) weight = languageHash(seed, floor(x / scale), floor(y / scale), 71) >= threshold ? 1 : 0;
  else if (mode.equals("random")) weight = languageHash(seed, floor(x / scale), floor(y / scale), 73) >= .5 ? 1 : 0;
  return where.getBoolean("invert", false) ? 1 - weight : weight;
}

float languageSegmentDistance(float x, float y, float ax, float ay, float bx, float by) {
  float dx = bx - ax, dy = by - ay;
  float amount = constrain(((x - ax) * dx + (y - ay) * dy) / max(.000001, dx * dx + dy * dy), 0, 1);
  return dist(x, y, ax + dx * amount, ay + dy * amount);
}

boolean languageInfantryShape(float x, float y) {
  boolean head = sq(x) / sq(.075) + sq(y + .265) / sq(.09) <= 1;
  boolean helmet = y >= -.34 && y <= -.29 && abs(x) <= .095;
  boolean torso = y >= -.18 && y <= .16 && abs(x) <= .105 - max(0, y) * .12;
  boolean leftLeg = languageSegmentDistance(x, y, -.045, .13, -.105, .42) <= .042;
  boolean rightLeg = languageSegmentDistance(x, y, .045, .13, .12, .42) <= .042;
  boolean arm = languageSegmentDistance(x, y, -.08, -.08, .125, .12) <= .035;
  boolean rifle = languageSegmentDistance(x, y, .02, -.12, .255, .21) <= .018;
  return head || helmet || torso || leftLeg || rightLeg || arm || rifle;
}

boolean languageDoveShape(float x, float y) {
  boolean body = sq(x) / sq(.11) + sq(y - .04) / sq(.2) <= 1;
  boolean head = sq(x) / sq(.075) + sq(y + .145) / sq(.075) <= 1;
  boolean leftWing = languageSegmentDistance(x, y, -.03, -.06, -.38, -.27) <= .055 + max(0, -.18 - x) * .11;
  boolean rightWing = languageSegmentDistance(x, y, .03, -.06, .38, -.27) <= .055 + max(0, x - .18) * .11;
  boolean leftTail = languageSegmentDistance(x, y, -.025, .18, -.14, .39) <= .045;
  boolean centerTail = languageSegmentDistance(x, y, 0, .18, 0, .42) <= .045;
  boolean rightTail = languageSegmentDistance(x, y, .025, .18, .14, .39) <= .045;
  return body || head || leftWing || rightWing || leftTail || centerTail || rightTail;
}

boolean languageAccepts(PImage input, JSONObject field, JSONObject where, float x, float y, float centerX, float centerY, float shortSide, float gate, float phase, int seed) {
  int sx = constrain(round(x), 0, input.width - 1), sy = constrain(round(y), 0, input.height - 1);
  String body = field.getString("body", "figure");
  if (body.equals("image")) {
    boolean accepted = pixelLight(input.pixels[sy * input.width + sx]) >= gate;
    return where.getBoolean("invert", false) ? !accepted : accepted;
  }
  if (body.equals("where")) return languageWhere(input, where, x, y) >= gate;
  float nx = (x - centerX) / shortSide, ny = (y - centerY) / shortSide;
  if (body.equals("infantry-dove")) {
    boolean infantry = languageInfantryShape(nx, ny), dove = languageDoveShape(nx, ny);
    if (!field.getString("loopMode", "held").equals("metamorphose")) return infantry;
    if (infantry == dove) return infantry;
    float metamorphosis = .5 - .5 * cos(phase);
    float address = languageHash(seed, floor((nx + .5) * 997), floor((ny + .5) * 991), 89);
    return dove ? address < metamorphosis : address >= metamorphosis;
  }
  boolean head = sq(nx) / sq(.14) + sq(ny) / sq(.18) <= 1;
  boolean neck = abs(nx) <= .1 && ny >= .15 && ny <= .3;
  float shoulderWidth = ny >= .3 && ny <= .4 ? .1 + ((ny - .3) / .1) * .15 : 0;
  return head || neck || (shoulderWidth > 0 && abs(nx) <= shoulderWidth);
}

int languagePhraseCount(JSONObject field) {
  if (field.hasKey("phrases")) {
    JSONArray voices = field.getJSONArray("phrases");
    int count = 0;
    for (int index = 0; index < voices.size(); index++) if (trim(voices.getString(index)).length() > 0) count++;
    if (count > 0) return count;
  }
  return trim(field.getString("phraseB", "Human")).length() > 0 ? 2 : 1;
}

String languagePhraseAt(JSONObject field, int voiceIndex) {
  if (field.hasKey("phrases")) {
    JSONArray voices = field.getJSONArray("phrases");
    int held = 0;
    for (int index = 0; index < voices.size(); index++) {
      String voice = trim(voices.getString(index));
      if (voice.length() == 0) continue;
      if (held == voiceIndex) return voice;
      held++;
    }
  }
  String phraseA = trim(field.getString("phraseA", "Almost"));
  String phraseB = trim(field.getString("phraseB", "Human"));
  if (phraseA.length() == 0) phraseA = "Almost";
  if (phraseB.length() == 0) phraseB = phraseA;
  return voiceIndex <= 0 ? phraseA : phraseB;
}

String languagePhrase(JSONObject field, PImage input, int seed, float x, float y, float centerX, float centerY, float shortSide, float baseSize, int slot) {
  int voiceCount = languagePhraseCount(field), voiceIndex = 0;
  String logic = field.getString("phraseLogic", "noise");
  if (logic.equals("alternate")) voiceIndex = abs(slot) % voiceCount;
  else if (logic.equals("near-far")) voiceIndex = constrain(floor(constrain(dist(x, y, centerX, centerY) / (shortSide * .42), 0, 1) * voiceCount), 0, voiceCount - 1);
  int sx = constrain(round(x), 0, input.width - 1), sy = constrain(round(y), 0, input.height - 1);
  if (logic.equals("image")) voiceIndex = constrain(floor((1 - pixelLight(input.pixels[sy * input.width + sx])) * voiceCount), 0, voiceCount - 1);
  else if (logic.equals("noise")) voiceIndex = constrain(floor(languageNoise(seed, x / max(1, baseSize * 3), y / max(1, baseSize * 3), 41) * voiceCount), 0, voiceCount - 1);
  return languagePhraseAt(field, voiceIndex);
}

int languageInk(JSONObject field, PImage input, float x, float y, int slot) {
  String mode = field.getString("inkMode", "chosen");
  if (mode.equals("source")) {
    int sx = constrain(round(x), 0, input.width - 1), sy = constrain(round(y), 0, input.height - 1);
    return input.pixels[sy * input.width + sx];
  }
  if (mode.equals("palette")) return paletteColor(abs(slot) % max(1, palette.size()));
  int packed = field.getInt("inkColor", 0xf2eee7);
  return color((packed >> 16) & 255, (packed >> 8) & 255, packed & 255);
}

void languageDraw(PGraphics g, PImage input, JSONObject field, JSONObject where, String phrase, float x, float y, float size, float rotation, int slot, float centerX, float centerY, float shortSide, float gate, float phase, int seed, float pulse, float collapse, boolean leftAligned) {
  if (!languageAccepts(input, field, where, x, y, centerX, centerY, shortSide, gate, phase, seed)) return;
  g.pushMatrix();
  g.translate(lerp(x, centerX, collapse), lerp(y, centerY, collapse));
  g.rotate(rotation);
  g.textSize(max(3, size * pulse));
  g.textAlign(leftAligned ? LEFT : CENTER, leftAligned ? TOP : CENTER);
  g.fill(languageInk(field, input, x, y, slot));
  g.text(phrase, 0, 0);
  g.popMatrix();
}

PImage languageBody(PImage input, JSONObject effect, JSONObject p, float phase) {
  JSONObject field = effect.hasKey("languageBody") ? effect.getJSONObject("languageBody") : new JSONObject();
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  float shortSide = max(1, min(input.width, input.height));
  float density = constrain(p.getFloat("languageDensity", 1), .4, 2);
  float baseSize = max(5, p.getFloat("typeScale", 18) * shortSide / 800.0);
  float sizeBreath = constrain(p.getFloat("sizeBreath", .45), 0, 1);
  float gate = constrain(p.getFloat("bodyGate", .5), 0, 1);
  float motion = constrain(p.getFloat("motion", .35), 0, 1);
  float centerX = constrain(p.getFloat("flowCenterX", .5), 0, 1) * input.width;
  float centerY = constrain(p.getFloat("flowCenterY", .45), 0, 1) * input.height;
  String loopMode = field.getString("loopMode", "held");
  float angleOffset = 0, pulse = 1, collapse = 0;
  if (loopMode.equals("orbit")) {
    angleOffset = phase * motion;
    centerX += cos(phase) * shortSide * .055 * motion;
    centerY += sin(phase) * shortSide * .055 * motion;
  } else if (loopMode.equals("breathe")) pulse = 1 + sin(phase) * .28 * motion;
  else if (loopMode.equals("collapse")) collapse = (.5 + .5 * cos(phase)) * motion;
  int seed = renderSeed + where.getInt("seed", 1);
  input.loadPixels();
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  if (field.getString("composition", "field").equals("inlay")) g.image(input, 0, 0);
  else {
    int ground = field.getInt("groundColor", 0x050505);
    g.background(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
  }
  g.smooth(4);
  g.noStroke();
  g.textFont(createFont("Arial", max(5, baseSize), true));
  if (field.getString("body", "figure").equals("knot")) {
    JSONObject kp=field.hasKey("knot")?field.getJSONObject("knot"):new JSONObject();
    int[] inks=new int[4];
    for(int i=0;i<4;i++) inks[i]=field.getString("inkMode","chosen").equals("palette")?palette.getInt(i):(i==3?field.getInt("groundColor",0x050505):field.getInt("inkColor",0xf2eee7));
    g.textFont(createFont("Microsoft JhengHei",48,true));
    drawKnot(g,input.width,input.height,kp,recipe.getInt("seed"),phase,inks,field);
    g.endDraw();return g.get();
  }
  String flow = field.getString("flow", "organic");
  int slot = 0;
  if (flow.equals("organic")) {
    float rowStep = max(4, baseSize * 1.05 / density);
    for (float y = 0; y < input.height + rowStep; y += rowStep) {
      float x = 0;
      while (x < input.width + baseSize * 4) {
        String phrase = languagePhrase(field, input, seed, x, y, centerX, centerY, shortSide, baseSize, slot);
        float n = languageNoise(seed, x / shortSide * 8, y / shortSide * 8, 7);
        float size = baseSize * (.72 + n * sizeBreath * 1.35);
        g.textSize(max(3, size * pulse));
        languageDraw(g, input, field, where, phrase, x, y, size, (n - .5) * .22 + angleOffset * .12, slot, centerX, centerY, shortSide, gate, phase, seed, pulse, collapse, true);
        x += max(baseSize * .7, (g.textWidth(phrase) + size * .3) / density);
        slot++;
      }
    }
  } else if (flow.equals("rings")) {
    float radiusStep = max(5, baseSize * 1.15 / density), maximum = sqrt(sq(input.width) + sq(input.height)) * .72;
    for (float radius = radiusStep; radius <= maximum; radius += radiusStep) {
      float size = baseSize * (.72 + (1 - min(1, radius / maximum)) * sizeBreath * .75);
      g.textSize(max(3, size * pulse));
      float measure = size;
      for (int voice = 0; voice < languagePhraseCount(field); voice++) measure = max(measure, g.textWidth(languagePhraseAt(field, voice)));
      int count = max(5, round(TWO_PI * radius / max(size, measure * .85) * density));
      for (int index = 0; index < count; index++) {
        float angle = index / float(count) * TWO_PI + angleOffset;
        float x = centerX + cos(angle) * radius, y = centerY + sin(angle) * radius;
        languageDraw(g, input, field, where, languagePhrase(field, input, seed, x, y, centerX, centerY, shortSide, baseSize, slot), x, y, size, angle + HALF_PI, slot++, centerX, centerY, shortSide, gate, phase, seed, pulse, collapse, false);
      }
    }
  } else if (flow.equals("rays")) {
    int count = max(8, round(36 * density));
    float step = max(5, baseSize * 1.25 / density), maximum = sqrt(sq(input.width) + sq(input.height)) * .72;
    for (int ray = 0; ray < count; ray++) {
      float angle = ray / float(count) * TWO_PI + angleOffset;
      for (float distance = step; distance <= maximum; distance += step) {
        float x = centerX + cos(angle) * distance, y = centerY + sin(angle) * distance;
        float n = languageNoise(seed, ray * .19, distance / shortSide * 7, 19);
        float size = baseSize * (.7 + n * sizeBreath);
        languageDraw(g, input, field, where, languagePhrase(field, input, seed, x, y, centerX, centerY, shortSide, baseSize, slot), x, y, size, angle + HALF_PI, slot++, centerX, centerY, shortSide, gate, phase, seed, pulse, collapse, false);
      }
    }
  } else {
    float step = max(5, baseSize * 1.35 / density);
    for (float y = step * .5; y < input.height; y += step) for (float x = step * .5; x < input.width; x += step) {
      float n = languageNoise(seed, x / shortSide * 9, y / shortSide * 9, 29);
      float size = baseSize * (.65 + n * sizeBreath * 1.1);
      languageDraw(g, input, field, where, languagePhrase(field, input, seed, x, y, centerX, centerY, shortSide, baseSize, slot), x, y, size, (n - .5) * HALF_PI + angleOffset, slot++, centerX, centerY, shortSide, gate, phase, seed, pulse, collapse, false);
    }
  }
  g.endDraw();
  return g.get();
}

float asciiHashV2(int seed, int column, int row, int salt) {
  int value = seed ^ ((column + salt) * 374761393) ^ ((row - salt) * 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  long unsigned = (value ^ (value >>> 16)) & 0xffffffffL;
  return unsigned / 4294967295.0;
}

float asciiLoopWave(float phase, float address) {
  return .5 + .5 * cos(phase + address * TWO_PI);
}

String[] asciiPrintableGlyphs(JSONObject field) {
  JSONArray source = field != null && field.hasKey("glyphs") ? field.getJSONArray("glyphs") : null;
  ArrayList<String> result = new ArrayList<String>();
  if (source != null) for (int i = 0; i < source.size(); i++) {
    String value = source.getString(i);
    for (int offset = 0; offset < value.length(); offset++) {
      String glyph = str(value.charAt(offset));
      int code = int(value.charAt(offset));
      if (code >= 32 && code <= 126 && !result.contains(glyph)) result.add(glyph);
    }
  }
  if (result.size() == 0) {
    String[] fallback = {" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"};
    for (String glyph : fallback) result.add(glyph);
  }
  return result.toArray(new String[result.size()]);
}

String[] asciiMeasuredGlyphs(String[] glyphs) {
  String[] measured = glyphs.clone();
  for (int left = 0; left < measured.length - 1; left++) for (int right = left + 1; right < measured.length; right++) {
    JSONObject a = asciiFeatures.get(measured[left]), b = asciiFeatures.get(measured[right]);
    float ad = a != null ? a.getFloat("density") : 0;
    float bd = b != null ? b.getFloat("density") : 0;
    if (bd < ad || (abs(bd - ad) < .000001 && int(measured[right].charAt(0)) < int(measured[left].charAt(0)))) {
      String swap = measured[left]; measured[left] = measured[right]; measured[right] = swap;
    }
  }
  return measured;
}

float asciiGlyphDistance(JSONObject feature, float mass, float horizontal, float vertical, float rise, float fall, float edge, String logic, float minimumDensity, float densitySpan) {
  float density = (feature.getFloat("density") - minimumDensity) / max(.000001, densitySpan);
  float h = feature.getFloat("h"), v = feature.getFloat("v"), r = feature.getFloat("rise"), f = feature.getFloat("fall");
  float minimum = min(min(h, v), min(r, f));
  h = max(0, h - minimum); v = max(0, v - minimum); r = max(0, r - minimum); f = max(0, f - minimum);
  float total = max(.000001, h + v + r + f);
  h /= total; v /= total; r /= total; f /= total;
  float massDistance = abs(density - mass);
  float structureDistance = abs(h - horizontal) + abs(v - vertical) + abs(r - rise) + abs(f - fall) + abs(feature.getFloat("edge") - edge) * .35;
  if (logic.equals("mass")) return massDistance;
  if (logic.equals("bones")) return structureDistance;
  return massDistance * .48 + structureDistance * .52;
}

String asciiStructuralGlyph(String[] glyphs, float mass, float horizontal, float vertical, float rise, float fall, float edge, String logic, float loyalty, float randomValue) {
  float minimumDensity = 999, maximumDensity = -999;
  for (String glyph : glyphs) {
    JSONObject feature = asciiFeatures.get(glyph);
    if (feature == null) continue;
    float density = feature.getFloat("density");
    minimumDensity = min(minimumDensity, density); maximumDensity = max(maximumDensity, density);
  }
  String[] ordered = glyphs.clone();
  float[] distances = new float[ordered.length];
  for (int i = 0; i < ordered.length; i++) {
    JSONObject feature = asciiFeatures.get(ordered[i]);
    distances[i] = feature == null ? 999 : asciiGlyphDistance(feature, mass, horizontal, vertical, rise, fall, edge, logic, minimumDensity, maximumDensity - minimumDensity);
  }
  for (int left = 0; left < ordered.length - 1; left++) for (int right = left + 1; right < ordered.length; right++) {
    if (distances[right] < distances[left] || (abs(distances[right] - distances[left]) < .000001 && int(ordered[right].charAt(0)) < int(ordered[left].charAt(0)))) {
      float distanceSwap = distances[left]; distances[left] = distances[right]; distances[right] = distanceSwap;
      String glyphSwap = ordered[left]; ordered[left] = ordered[right]; ordered[right] = glyphSwap;
    }
  }
  int searchWidth = max(1, min(ordered.length, 1 + round((1 - loyalty) * min(7, ordered.length - 1))));
  return ordered[min(searchWidth - 1, floor(randomValue * searchWidth))];
}

String asciiBitRot(String glyph, float amount, float randomValue, float secondRandom) {
  int code = int(glyph.charAt(0));
  if (code < 32 || code > 126 || randomValue >= amount) return glyph;
  int bit = 1 << min(6, floor(secondRandom * 7));
  int damaged = code ^ bit;
  if (damaged < 32 || damaged > 126) damaged = 32 + ((damaged - 32 + 95) % 95);
  return str(char(damaged));
}

int[] characterCornerGround(PImage input) {
  int[] ground = {0, 0, 0};
  int[] xs = {1, max(0, input.width - 2), 1, max(0, input.width - 2)};
  int[] ys = {1, 1, max(0, input.height - 2), max(0, input.height - 2)};
  for (int i = 0; i < 4; i++) {
    int packed = input.pixels[constrain(ys[i], 0, input.height - 1) * input.width + constrain(xs[i], 0, input.width - 1)];
    ground[0] += round(red(packed)); ground[1] += round(green(packed)); ground[2] += round(blue(packed));
  }
  ground[0] /= 4; ground[1] /= 4; ground[2] /= 4;
  return ground;
}

float characterGroundDifference(PImage input, int[] ground, float x, float y) {
  int packed = input.pixels[constrain(round(y), 0, input.height - 1) * input.width + constrain(round(x), 0, input.width - 1)];
  return dist(red(packed), green(packed), blue(packed), ground[0], ground[1], ground[2]) / 441.673;
}

float characterPlacementMask(PImage input, int[] ground, String placement, float gate, float x, float y, float reach) {
  if (placement.equals("whole")) return 1;
  float center = characterGroundDifference(input, ground, x, y);
  float body = whereSmooth(gate - .035, gate + .035, center);
  if (placement.equals("body")) return body;
  if (placement.equals("outside")) return 1 - body;
  float[] around = {
    characterGroundDifference(input, ground, x - reach, y), characterGroundDifference(input, ground, x + reach, y),
    characterGroundDifference(input, ground, x, y - reach), characterGroundDifference(input, ground, x, y + reach)
  };
  float boundary = 0, neighborBody = 1;
  for (int i = 0; i < 4; i++) {
    boundary = max(boundary, abs(around[i] - center));
    neighborBody = min(neighborBody, whereSmooth(gate - .035, gate + .035, around[i]));
  }
  return max(body * (1 - neighborBody), whereSmooth(.035, .2, boundary));
}

PImage asciiField(PImage input, JSONObject effect, JSONObject p, float phase) {
  JSONObject field = effect.hasKey("characterField") ? effect.getJSONObject("characterField") : null;
  if (field == null || field.getInt("asciiVersion", 1) < 2) return asciiFieldV1(input, effect, p, phase);
  return asciiFieldV2(input, effect, p, phase);
}

PImage asciiFieldV2(PImage input, JSONObject effect, JSONObject p, float phase) {
  JSONObject field = effect.getJSONObject("characterField");
  String[] enteredGlyphs = asciiPrintableGlyphs(field);
  String[] glyphs = field.getString("alphabetOrder", "measured").equals("measured") ? asciiMeasuredGlyphs(enteredGlyphs) : enteredGlyphs;
  float scale = min(input.width, input.height) / 760.0;
  int cell = max(5, round(p.getFloat("cellSize", 15) * scale));
  int columns = ceil(input.width / float(cell)), rows = ceil(input.height / float(cell));
  float gridOffsetX = (input.width - columns * cell) * .5, gridOffsetY = (input.height - rows * cell) * .5;
  float coverage = p.getFloat("coverage", 1), loyalty = p.getFloat("imageLoyalty", .88);
  float edgeVoice = p.getFloat("edgeVoice", .32);
  float bodyGate = p.getFloat("bodyGate", .16);
  String placement = field.getString("placement", "whole");
  boolean inverted = p.getFloat("invertDensity", 0) >= .5;
  float signalMemory = p.getFloat("signalMemory", .82), mutationTide = p.getFloat("mutationTide", .18);
  float bitRot = p.getFloat("bitRot", .08), overstrike = p.getFloat("overstrike", .12);
  float carriageDrift = p.getFloat("carriageDrift", .1), lineFeedFault = p.getFloat("lineFeedFault", .04);
  float tabGap = p.getFloat("tabGap", .04), dropout = p.getFloat("dropout", .03);
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int whereSeed = where.getInt("seed", 0), seed = renderSeed + whereSeed;
  String territoryMode = where.getString("mode", "whole");
  float territoryThreshold = where.getFloat("threshold", .5), territoryFeather = max(.001, where.getFloat("softness", .12));
  float territoryScale = max(cell, where.getFloat("scale", 48) * scale);
  boolean territoryInvert = where.getBoolean("invert", false);
  int ground = field.getInt("groundColor", palette.getInt(3)), ink = field.getInt("inkColor", 0xf2eee7);
  String inkMode = field.getString("inkMode", "source"), composition = field.getString("composition", "field");
  String glyphLogic = field.getString("glyphLogic", "hybrid");
  if (composition.equals("inlay")) territoryFeather = .001;
  input.loadPixels();
  int[] sourceGround = characterCornerGround(input);
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  if (composition.equals("inlay")) g.image(input, 0, 0);
  else g.background(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
  g.noStroke(); g.textAlign(CENTER, CENTER);
  g.textFont(createFont("SourceCodePro-Semibold.ttf", max(5, cell * .9), true));
  for (int row = 0; row < rows; row++) {
    float rowAddress = asciiHashV2(seed, 0, row, 103), rowWave = asciiLoopWave(phase, rowAddress);
    float faultAddress = asciiHashV2(seed, 0, row, 107);
    boolean skipRow = faultAddress < lineFeedFault * (.32 + rowWave * .68) * .42;
    boolean repeatPrevious = !skipRow && faultAddress > 1 - lineFeedFault * (.32 + rowWave * .68) * .58;
    int sampleRow = repeatPrevious ? max(0, row - 1) : row;
    float rowSlip = (asciiHashV2(seed, 0, row, 109) * 2 - 1) * cell * carriageDrift * 5 * (.25 + rowWave * .75);
    for (int column = 0; column < columns; column++) {
      float baseX = gridOffsetX + column * cell + cell * .5, baseY = gridOffsetY + row * cell + cell * .5;
      float x = baseX + rowSlip;
      while (x < gridOffsetX) x += columns * cell;
      while (x >= gridOffsetX + columns * cell) x -= columns * cell;
      float y = baseY, sampleY = gridOffsetY + sampleRow * cell + cell * .5;
      int sx = constrain(round(baseX), 0, input.width - 1), sy = constrain(round(sampleY), 0, input.height - 1);
      int rightX = constrain(round(baseX + cell * .45), 0, input.width - 1), leftX = constrain(round(baseX - cell * .45), 0, input.width - 1);
      int belowY = constrain(round(sampleY + cell * .45), 0, input.height - 1), aboveY = constrain(round(sampleY - cell * .45), 0, input.height - 1);
      int sample = input.pixels[sy * input.width + sx];
      float light = pixelLight(sample), edgeX = pixelLight(input.pixels[sy * input.width + rightX]) - pixelLight(input.pixels[sy * input.width + leftX]);
      float edgeY = pixelLight(input.pixels[belowY * input.width + sx]) - pixelLight(input.pixels[aboveY * input.width + sx]);
      float edge = min(1, sqrt(edgeX * edgeX + edgeY * edgeY) * 2.2);
      float orientationTotal = max(.000001, abs(edgeX) + abs(edgeY) + edge * .55);
      float diagonal = min(1, abs(edgeX * edgeY) * 7);
      float mass = inverted ? light : 1 - light, horizontal = abs(edgeY) / orientationTotal, vertical = abs(edgeX) / orientationTotal;
      float rise = edgeX * edgeY >= 0 ? diagonal : 0, fall = edgeX * edgeY < 0 ? diagonal : 0;
      int territoryColumn = floor(baseX / territoryScale), territoryRow = floor(baseY / territoryScale);
      float territory = 1;
      if (territoryMode.equals("light")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("dark")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("edges")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, edge);
      else if (territoryMode.equals("saturated")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("muted")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("hue")) {
        float distance = abs(((pixelHue(sample) - where.getFloat("hue", 0) + 540) % 360) - 180);
        float hueWidth = where.getFloat("hueWidth", 36);
        territory = (1 - whereSmooth(hueWidth, min(180, hueWidth + territoryFeather * 180), distance)) * whereSmooth(.01, .08, pixelSaturation(sample));
      } else if (territoryMode.equals("checker")) territory = (territoryColumn + territoryRow) % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("stripes")) territory = territoryColumn % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("blocks")) territory = asciiHashV2(whereSeed, territoryColumn, territoryRow, 71) >= territoryThreshold ? 1 : 0;
      else if (territoryMode.equals("random")) territory = asciiHashV2(whereSeed, territoryColumn, territoryRow, 73) < territoryThreshold ? 1 : 0;
      if (territoryInvert) territory = 1 - territory;
      territory *= characterPlacementMask(input, sourceGround, placement, bodyGate, baseX, sampleY, cell * .62);
      boolean addressed = !skipRow && asciiHashV2(seed, column, row, 79) < territory;
      if (addressed && composition.equals("inlay")) {
        g.fill(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
        g.rect(gridOffsetX + column * cell, gridOffsetY + row * cell, cell + 1, cell + 1);
      }
      int tabBlock = floor(column / 8.0);
      boolean tabSilent = asciiHashV2(seed, tabBlock, row, 113) < tabGap && column % 8 >= 4;
      boolean deleted = asciiHashV2(seed, column, row, 127) < dropout * (.45 + rowWave * .55);
      if (!addressed || asciiHashV2(seed, column, row, 83) >= coverage || tabSilent || deleted) continue;
      float structuralEdge = min(1, edge * (.5 + edgeVoice * 1.5));
      String glyph = glyphLogic.equals("repeat") ? glyphs[(column + sampleRow) % glyphs.length] : asciiStructuralGlyph(glyphs, mass, horizontal, vertical, rise, fall, structuralEdge, glyphLogic, loyalty, asciiHashV2(seed, column, sampleRow, 131));
      float cellWave = asciiLoopWave(phase, asciiHashV2(seed, column, row, 137));
      boolean mutable = asciiHashV2(seed, column, row, 139) < mutationTide * (1 - signalMemory * .86) * (.25 + cellWave * .75);
      if (mutable) glyph = asciiBitRot(glyph, bitRot, asciiHashV2(seed, column, row, 149), asciiHashV2(seed, column, row, 151));
      int drawInk = inkMode.equals("source") ? sample : inkMode.equals("chosen") ? color((ink >> 16) & 255, (ink >> 8) & 255, ink & 255) : paletteColor(constrain(round(mass * 2), 0, 2));
      g.fill(drawInk);
      if (overstrike > 0 && asciiHashV2(seed, column, row, 157) < overstrike) {
        int ghostIndex = 0;
        for (int i = 0; i < glyphs.length; i++) if (glyphs[i].equals(glyph)) ghostIndex = i;
        String ghost = glyphs[(ghostIndex + 1 + floor(asciiHashV2(seed, column, row, 163) * max(1, glyphs.length - 1))) % glyphs.length];
        g.pushStyle(); g.fill(drawInk, min(184, round(46 + overstrike * 128))); g.text(ghost, x - cell * overstrike * .13, y + cell * (.04 + overstrike * .1)); g.popStyle();
      }
      g.text(glyph, x, y + cell * .04);
    }
  }
  g.endDraw();
  return g.get();
}

PImage asciiFieldV1(PImage input, JSONObject effect, JSONObject p, float phase) {
  JSONObject field = effect.hasKey("characterField") ? effect.getJSONObject("characterField") : null;
  JSONArray glyphArray = field != null && field.hasKey("glyphs") ? field.getJSONArray("glyphs") : null;
  String[] fallback = {" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"};
  int glyphCount = glyphArray != null && glyphArray.size() > 0 ? glyphArray.size() : fallback.length;
  float scale = min(input.width, input.height) / 760.0;
  int cell = max(5, round(p.getFloat("cellSize", 15) * scale));
  int columns = ceil(input.width / float(cell)), rows = ceil(input.height / float(cell));
  float gridOffsetX = (input.width - columns * cell) * .5;
  float gridOffsetY = (input.height - rows * cell) * .5;
  float coverage = p.getFloat("coverage", 1);
  float loyalty = p.getFloat("imageLoyalty", .88);
  float edgeVoice = p.getFloat("edgeVoice", .32);
  float instability = p.getFloat("instability", .1);
  float vacancy = p.getFloat("vacancy", .03);
  float damage = p.getFloat("gridDamage", .04);
  boolean inverted = p.getFloat("invertDensity", 0) >= .5;
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int whereSeed = where.getInt("seed", 0);
  String territoryMode = where.getString("mode", "whole");
  float territoryThreshold = where.getFloat("threshold", .5);
  float territoryFeather = max(.001, where.getFloat("softness", .12));
  float territoryScale = max(cell, where.getFloat("scale", 48) * scale);
  boolean territoryInvert = where.getBoolean("invert", false);
  int seed = renderSeed + whereSeed + round(phase * 1000);
  int ground = field != null ? field.getInt("groundColor", palette.getInt(3)) : palette.getInt(3);
  int ink = field != null ? field.getInt("inkColor", 0xf2eee7) : 0xf2eee7;
  String inkMode = field != null ? field.getString("inkMode", "source") : "source";
  String composition = field != null ? field.getString("composition", "field") : "field";
  String glyphLogic = field != null ? field.getString("glyphLogic", "mass") : "mass";
  if (composition.equals("inlay")) territoryFeather = .001;
  input.loadPixels();
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  if (composition.equals("inlay")) g.image(input, 0, 0);
  else g.background(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
  g.noStroke();
  g.textAlign(CENTER, CENTER);
  g.textFont(createFont("Segoe UI Symbol", max(5, cell * .9), true));
  for (int row = 0; row < rows; row++) {
    float rowSlip = (asciiHash(seed, 0, row, 11) * 2 - 1) * cell * damage * 2.4;
    for (int column = 0; column < columns; column++) {
      float columnSlip = (asciiHash(seed, column, 0, 23) * 2 - 1) * cell * damage * 1.5;
      float x = gridOffsetX + column * cell + cell * .5 + rowSlip;
      float y = gridOffsetY + row * cell + cell * .5 + columnSlip;
      int sx = constrain(round(x), 0, input.width - 1), sy = constrain(round(y), 0, input.height - 1);
      int rightX = constrain(round(x + cell * .45), 0, input.width - 1);
      int leftX = constrain(round(x - cell * .45), 0, input.width - 1);
      int belowY = constrain(round(y + cell * .45), 0, input.height - 1);
      int aboveY = constrain(round(y - cell * .45), 0, input.height - 1);
      int sample = input.pixels[sy * input.width + sx];
      float light = pixelLight(sample);
      float edgeX = pixelLight(input.pixels[sy * input.width + rightX]) - pixelLight(input.pixels[sy * input.width + leftX]);
      float edgeY = pixelLight(input.pixels[belowY * input.width + sx]) - pixelLight(input.pixels[aboveY * input.width + sx]);
      float edge = min(1, sqrt(edgeX * edgeX + edgeY * edgeY) * 2.2);
      int territoryColumn = floor(x / territoryScale), territoryRow = floor(y / territoryScale);
      float territory = 1;
      if (territoryMode.equals("light")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("dark")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("edges")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, edge);
      else if (territoryMode.equals("saturated")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("muted")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("hue")) {
        float targetHue = where.getFloat("hue", 0);
        float distance = abs(((pixelHue(sample) - targetHue + 540) % 360) - 180);
        float hueWidth = where.getFloat("hueWidth", 36);
        territory = (1 - whereSmooth(hueWidth, min(180, hueWidth + territoryFeather * 180), distance)) * whereSmooth(.01, .08, pixelSaturation(sample));
      } else if (territoryMode.equals("checker")) territory = (territoryColumn + territoryRow) % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("stripes")) territory = territoryColumn % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("blocks")) territory = asciiHash(whereSeed, territoryColumn, territoryRow, 71) >= territoryThreshold ? 1 : 0;
      else if (territoryMode.equals("random")) territory = asciiHash(whereSeed, territoryColumn, territoryRow, 73) < territoryThreshold ? 1 : 0;
      if (territoryInvert) territory = 1 - territory;
      if (asciiHash(seed, column, row, 79) >= territory) continue;
      if (composition.equals("inlay")) {
        g.fill(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
        g.rect(gridOffsetX + column * cell, gridOffsetY + row * cell, cell + 1, cell + 1);
      }
      if (asciiHash(seed, column, row, 83) >= coverage) continue;
      if (asciiHash(seed, column, row, 17) < vacancy) continue;
      float density = inverted ? light : 1 - light;
      density = density * loyalty + asciiHash(seed, column, row, 31) * (1 - loyalty);
      int index = glyphLogic.equals("repeat")
        ? (column + row) % glyphCount
        : constrain(round(density * (glyphCount - 1)), 0, glyphCount - 1);
      if (asciiHash(seed, column, row, 43) < instability) {
        int reach = max(1, round(instability * glyphCount * .6));
        index = constrain(index + round((asciiHash(seed, column, row, 47) * 2 - 1) * reach), 0, glyphCount - 1);
      }
      String glyph = glyphArray != null && glyphArray.size() > 0 ? glyphArray.getString(index) : fallback[index];
      if (edge * edgeVoice > asciiHash(seed, column, row, 53) * .35) {
        glyph = abs(edgeX) > abs(edgeY) * 2
          ? "|"
          : abs(edgeY) > abs(edgeX) * 2
            ? "-"
            : edgeX * edgeY > 0 ? "/" : "\\";
      }
      if (inkMode.equals("source")) g.fill(sample);
      else if (inkMode.equals("chosen")) g.fill(color((ink >> 16) & 255, (ink >> 8) & 255, ink & 255));
      else g.fill(paletteColor(constrain(round(density * 2), 0, 2)));
      g.text(glyph, x, y + cell * .04);
    }
  }
  g.endDraw();
  return g.get();
}

PImage zhuyinWeave(PImage input, JSONObject effect, JSONObject p, float phase) {
  JSONObject field = effect.hasKey("zhuyinField") ? effect.getJSONObject("zhuyinField") : new JSONObject();
  JSONArray glyphArray = field.hasKey("glyphs") ? field.getJSONArray("glyphs") : null;
  String[] fallback = splitTokens("ㄅ ㄆ ㄇ ㄈ ㄉ ㄊ ㄋ ㄌ ㄍ ㄎ ㄏ ㄐ ㄑ ㄒ ㄓ ㄔ ㄕ ㄖ ㄗ ㄘ ㄙ ㄧ ㄨ ㄩ ㄚ ㄛ ㄜ ㄝ ㄞ ㄟ ㄠ ㄡ ㄢ ㄣ ㄤ ㄥ ㄦ");
  int glyphCount = glyphArray != null && glyphArray.size() > 0 ? glyphArray.size() : fallback.length;
  String[] glyphs = new String[glyphCount];
  for (int i = 0; i < glyphCount; i++) glyphs[i] = glyphArray != null && glyphArray.size() > 0 ? glyphArray.getString(i) : fallback[i];
  String spatialLogic = field.getString("spatialLogic", "weave");
  String placement = field.getString("placement", "whole");
  float scale = min(input.width, input.height) / 760.0;
  int cell = max(6, round(p.getFloat("cellSize", 22) * scale * (spatialLogic.equals("syllable") ? 1.55 : 1)));
  int columns = ceil(input.width / float(cell)) + 2, rows = ceil(input.height / float(cell)) + 2;
  float coverage = constrain(p.getFloat("coverage", .82), 0, 1);
  int voices = constrain(round(p.getFloat("voices", 2)), 1, 4);
  float misregistration = constrain(p.getFloat("misregistration", .22), 0, 1);
  float rowDrift = constrain(p.getFloat("rowDrift", .42), 0, 1);
  float imageRhythm = constrain(p.getFloat("imageRhythm", .38), 0, 1);
  float motion = constrain(p.getFloat("motion", .32), 0, 1);
  float bodyGate = p.getFloat("bodyGate", .16);
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int whereSeed = where.getInt("seed", 0);
  String territoryMode = where.getString("mode", "whole");
  float territoryThreshold = where.getFloat("threshold", .5);
  float territoryFeather = max(.001, where.getFloat("softness", .12));
  float territoryScale = max(cell, where.getFloat("scale", 48) * scale);
  boolean territoryInvert = where.getBoolean("invert", false);
  int seed = renderSeed + whereSeed;
  int ground = field.getInt("groundColor", palette.getInt(3));
  int ink = field.getInt("inkColor", 0xf2eee7);
  String inkMode = field.getString("inkMode", "palette");
  String composition = field.getString("composition", "inlay");
  if (composition.equals("inlay")) territoryFeather = .001;
  float loopAngle = phase * TWO_PI;
  input.loadPixels();
  int[] sourceGround = characterCornerGround(input);
  ArrayList<String> initialGlyphs = new ArrayList<String>(), finalGlyphs = new ArrayList<String>(), toneGlyphs = new ArrayList<String>();
  String initialBank = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ", finalBank = "ㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ", toneBank = "ˉˊˇˋ˙";
  for (int i = 0; i < glyphs.length; i++) {
    if (initialBank.indexOf(glyphs[i]) >= 0) initialGlyphs.add(glyphs[i]);
    if (finalBank.indexOf(glyphs[i]) >= 0) finalGlyphs.add(glyphs[i]);
    if (toneBank.indexOf(glyphs[i]) >= 0) toneGlyphs.add(glyphs[i]);
  }
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  if (composition.equals("inlay")) g.image(input, 0, 0);
  else g.background(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
  g.noStroke();
  g.textAlign(CENTER, CENTER);
  g.textFont(createFont("Noto Sans TC", max(6, cell * (spatialLogic.equals("syllable") ? .42 : .86)), true));
  for (int row = -1; row < rows; row++) {
    float stagger = row * cell * rowDrift * .72;
    for (int column = -1; column < columns; column++) {
      float baseX = column * cell + cell * .5 + stagger;
      float baseY = row * cell + cell * .5;
      int sx = constrain(round(baseX), 0, input.width - 1), sy = constrain(round(baseY), 0, input.height - 1);
      int rightX = constrain(round(baseX + cell * .45), 0, input.width - 1);
      int leftX = constrain(round(baseX - cell * .45), 0, input.width - 1);
      int belowY = constrain(round(baseY + cell * .45), 0, input.height - 1);
      int aboveY = constrain(round(baseY - cell * .45), 0, input.height - 1);
      int sample = input.pixels[sy * input.width + sx];
      float light = pixelLight(sample);
      float edgeX = pixelLight(input.pixels[sy * input.width + rightX]) - pixelLight(input.pixels[sy * input.width + leftX]);
      float edgeY = pixelLight(input.pixels[belowY * input.width + sx]) - pixelLight(input.pixels[aboveY * input.width + sx]);
      float edge = min(1, sqrt(edgeX * edgeX + edgeY * edgeY) * 2.2);
      int territoryColumn = floor(baseX / territoryScale), territoryRow = floor(baseY / territoryScale);
      float territory = 1;
      if (territoryMode.equals("light")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("dark")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, light);
      else if (territoryMode.equals("edges")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, edge);
      else if (territoryMode.equals("saturated")) territory = whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("muted")) territory = 1 - whereSmooth(territoryThreshold - territoryFeather, territoryThreshold + territoryFeather, pixelSaturation(sample));
      else if (territoryMode.equals("hue")) {
        float targetHue = where.getFloat("hue", 0);
        float distanceToHue = abs(((pixelHue(sample) - targetHue + 540) % 360) - 180);
        float hueWidth = where.getFloat("hueWidth", 36);
        territory = (1 - whereSmooth(hueWidth, min(180, hueWidth + territoryFeather * 180), distanceToHue)) * whereSmooth(.01, .08, pixelSaturation(sample));
      } else if (territoryMode.equals("checker")) territory = (territoryColumn + territoryRow) % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("stripes")) territory = territoryColumn % 2 == 0 ? 1 : 0;
      else if (territoryMode.equals("blocks")) territory = asciiHash(whereSeed, territoryColumn, territoryRow, 71) >= territoryThreshold ? 1 : 0;
      else if (territoryMode.equals("random")) territory = asciiHash(whereSeed, territoryColumn, territoryRow, 73) < territoryThreshold ? 1 : 0;
      if (territoryInvert) territory = 1 - territory;
      territory *= characterPlacementMask(input, sourceGround, placement, bodyGate, baseX, baseY, cell * .62);
      if (asciiHash(seed, column, row, 101) >= territory || asciiHash(seed, column, row, 103) >= coverage) continue;
      if (composition.equals("inlay")) {
        g.fill(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
        g.rect(baseX - cell * .55, baseY - cell * .55, cell * 1.1, cell * 1.1);
      }
      int imageOffset = round(light * imageRhythm * max(1, glyphCount - 1));
      int motionOffset = round(sin(loopAngle + row * .19) * motion * glyphCount * .18);
      for (int voice = 0; voice < voices; voice++) {
        float voiceAngle = loopAngle + voice * TWO_PI / voices;
        float distance = cell * misregistration * (voice / float(max(1, voices - 1)));
        float x = baseX + cos(voiceAngle) * distance * (.35 + motion * .65);
        float y = baseY + sin(voiceAngle) * distance * (.35 + motion * .65);
        int glyphIndex = ((column + round(row * (1 + rowDrift * 4)) + voice * 7 + imageOffset + motionOffset) % glyphCount + glyphCount) % glyphCount;
        if (inkMode.equals("source")) g.fill(sample, voices == 1 ? 255 : max(122, 219 - voice * 26));
        else if (inkMode.equals("chosen")) g.fill(color((ink >> 16) & 255, (ink >> 8) & 255, ink & 255), voices == 1 ? 255 : max(122, 219 - voice * 26));
        else g.fill(paletteColor(voice % 4), voices == 1 ? 255 : max(122, 219 - voice * 26));
        if (spatialLogic.equals("syllable")) {
          int clusterLength = min(3, glyphCount);
          for (int member = 0; member < clusterLength; member++) g.text(glyphs[(glyphIndex + member) % glyphCount], x, y + (member - (clusterLength - 1) * .5) * cell * .3);
        } else if (spatialLogic.equals("call-response")) {
          float address = asciiHashV2(seed, column, row, 211 + voice * 13);
          ArrayList<String> pool = edge > .22 && toneGlyphs.size() > 0 ? toneGlyphs : light < .5 && initialGlyphs.size() > 0 ? initialGlyphs : finalGlyphs.size() > 0 ? finalGlyphs : null;
          String glyph = pool == null ? glyphs[constrain(floor(address * glyphCount), 0, glyphCount - 1)] : pool.get(constrain(floor(address * pool.size()), 0, pool.size() - 1));
          g.text(glyph, x, y + cell * .03);
        } else g.text(glyphs[glyphIndex], x, y + cell * .03);
      }
    }
  }
  g.endDraw();
  return g.get();
}

PImage petsciiStudy(PImage input, JSONObject effect, JSONObject p) {
  int[] c64 = {
    0x000000, 0xffffff, 0x813338, 0x75cec8,
    0x8e3c97, 0x56ac4d, 0x2e2c9b, 0xedf171,
    0x8e5029, 0x553800, 0xc46c71, 0x4a4a4a,
    0x7b7b7b, 0xa9ff9f, 0x706deb, 0xb2b2b2
  };
  JSONObject field = effect.hasKey("tileField") ? effect.getJSONObject("tileField") : new JSONObject();
  int foreground = field.getInt("foregroundColor", c64[14]);
  int ground = field.getInt("backgroundColor", c64[0]);
  float threshold = p.getFloat("threshold", .48);
  float imagePull = constrain(p.getFloat("imagePull", .78), 0, 1);
  boolean reverseMass = p.getFloat("reverseMass", 0) >= .5;
  String tileLogic = field.getString("tileLogic", "image");
  float rulePressure = constrain(p.getFloat("rulePressure", 0), 0, 1);
  int tileSeed = renderSeed + (effect.hasKey("where") ? effect.getJSONObject("where").getInt("seed", 0) : 0);
  input.loadPixels();
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw();
  g.noSmooth();
  g.noStroke();
  g.background(color((ground >> 16) & 255, (ground >> 8) & 255, ground & 255));
  int[] masks = new int[40 * 25], colors = new int[40 * 25];
  for (int row = 0; row < 25; row++) {
    int y0 = round(row * input.height / 25.0), y1 = round((row + 1) * input.height / 25.0);
    int middleY = round((y0 + y1) * .5);
    for (int column = 0; column < 40; column++) {
      int x0 = round(column * input.width / 40.0), x1 = round((column + 1) * input.width / 40.0);
      int middleX = round((x0 + x1) * .5);
      int[] sx = { round((x0 + middleX) * .5), round((middleX + x1) * .5), round((x0 + middleX) * .5), round((middleX + x1) * .5) };
      int[] sy = { round((y0 + middleY) * .5), round((y0 + middleY) * .5), round((middleY + y1) * .5), round((middleY + y1) * .5) };
      boolean[] active = new boolean[4];
      float totalR = 0, totalG = 0, totalB = 0;
      int evidence = 0;
      for (int quadrant = 0; quadrant < 4; quadrant++) {
        int sample = input.pixels[constrain(sy[quadrant], 0, input.height - 1) * input.width + constrain(sx[quadrant], 0, input.width - 1)];
        float light = pixelLight(sample);
        active[quadrant] = reverseMass ? light >= threshold : light <= threshold;
        if (active[quadrant]) {
          totalR += red(sample); totalG += green(sample); totalB += blue(sample); evidence++;
        }
      }
      if (evidence == 0) {
        for (int quadrant = 0; quadrant < 4; quadrant++) {
          int sample = input.pixels[constrain(sy[quadrant], 0, input.height - 1) * input.width + constrain(sx[quadrant], 0, input.width - 1)];
          totalR += red(sample); totalG += green(sample); totalB += blue(sample);
        }
        evidence = 4;
      }
      float averageR = totalR / evidence, averageG = totalG / evidence, averageB = totalB / evidence;
      int nearest = c64[0];
      float nearestDistance = Float.MAX_VALUE;
      for (int colorIndex = 0; colorIndex < c64.length; colorIndex++) {
        int packed = c64[colorIndex];
        float dr = averageR - ((packed >> 16) & 255), dg = averageG - ((packed >> 8) & 255), db = averageB - (packed & 255);
        float distance = dr * dr + dg * dg + db * db;
        if (distance < nearestDistance) { nearest = packed; nearestDistance = distance; }
      }
      float inkR = lerp((foreground >> 16) & 255, (nearest >> 16) & 255, imagePull);
      float inkG = lerp((foreground >> 8) & 255, (nearest >> 8) & 255, imagePull);
      float inkB = lerp(foreground & 255, nearest & 255, imagePull);
      int mask = 0;
      for (int quadrant = 0; quadrant < 4; quadrant++) if (active[quadrant]) mask |= 1 << quadrant;
      masks[row * 40 + column] = mask;
      colors[row * 40 + column] = color(inkR, inkG, inkB);
    }
  }
  if (tileLogic.equals("infection") && rulePressure > 0) {
    int[] original = masks.clone();
    for (int row = 0; row < 25; row++) for (int column = 0; column < 40; column++) {
      if (asciiHashV2(tileSeed, column, row, 307) >= rulePressure * .86) continue;
      int[] neighbors = {
        original[row * 40 + max(0, column - 1)], original[max(0, row - 1) * 40 + column],
        original[row * 40 + min(39, column + 1)], original[min(24, row + 1) * 40 + column]
      };
      int neighbor = neighbors[floor(asciiHashV2(tileSeed, column, row, 311) * 4) % 4];
      int rotated = ((neighbor << 1) | (neighbor >> 3)) & 15;
      masks[row * 40 + column] = asciiHashV2(tileSeed, column, row, 313) < .62 ? original[row * 40 + column] | rotated : original[row * 40 + column] ^ rotated;
    }
  } else if (tileLogic.equals("gravity") && rulePressure > 0) {
    boolean[] subcells = new boolean[80 * 50], settled = new boolean[80 * 50];
    for (int row = 0; row < 25; row++) for (int column = 0; column < 40; column++) for (int bit = 0; bit < 4; bit++) if ((masks[row * 40 + column] & (1 << bit)) != 0) {
      subcells[(row * 2 + bit / 2) * 80 + column * 2 + bit % 2] = true;
    }
    for (int column = 0; column < 80; column++) {
      IntList occupied = new IntList();
      for (int row = 0; row < 50; row++) if (subcells[row * 80 + column]) occupied.append(row);
      for (int index = 0; index < occupied.size(); index++) {
        int destination = 50 - occupied.size() + index;
        int moved = constrain(round(lerp(occupied.get(index), destination, rulePressure)), 0, 49);
        settled[moved * 80 + column] = true;
      }
    }
    java.util.Arrays.fill(masks, 0);
    for (int row = 0; row < 50; row++) for (int column = 0; column < 80; column++) if (settled[row * 80 + column]) {
      masks[(row / 2) * 40 + column / 2] |= 1 << ((row % 2) * 2 + column % 2);
    }
  }
  for (int row = 0; row < 25; row++) {
    int y0 = round(row * input.height / 25.0), y1 = round((row + 1) * input.height / 25.0), middleY = round((y0 + y1) * .5);
    for (int column = 0; column < 40; column++) {
      int x0 = round(column * input.width / 40.0), x1 = round((column + 1) * input.width / 40.0), middleX = round((x0 + x1) * .5);
      int mask = masks[row * 40 + column]; g.fill(colors[row * 40 + column]);
      if ((mask & 1) != 0) g.rect(x0, y0, middleX - x0, middleY - y0);
      if ((mask & 2) != 0) g.rect(middleX, y0, x1 - middleX, middleY - y0);
      if ((mask & 4) != 0) g.rect(x0, middleY, middleX - x0, y1 - middleY);
      if ((mask & 8) != 0) g.rect(middleX, middleY, x1 - middleX, y1 - middleY);
    }
  }
  g.endDraw();
  return g.get();
}

float tectonicHash(int seed, int identity, int salt) {
  return parliamentHash(seed,identity,0,salt);
}

int tectonicFind(int[] parent,int start) {
  int root=start; while(parent[root]!=root)root=parent[root];
  int cursor=start; while(parent[cursor]!=cursor){int next=parent[cursor];parent[cursor]=root;cursor=next;} return root;
}

int tectonicMerge(int[] parent,int[] sizes,float[] internal,int left,int right,int weight) {
  int a=tectonicFind(parent,left),b=tectonicFind(parent,right);if(a==b)return a;
  if(sizes[a]<sizes[b]){int swap=a;a=b;b=swap;} parent[b]=a;sizes[a]+=sizes[b];internal[a]=max(weight,max(internal[a],internal[b]));return a;
}

int tectonicDistance(int a,int b,int signal,int[] rr,int[] gg,int[] bb,int[] hh,int[] ss,int[] ll) {
  if(signal==1){int delta=abs(hh[a]-hh[b]);return constrain(round(min(delta,255-delta)*(.35+.65*max(ss[a],ss[b])/255.0)),0,255);}
  if(signal==2)return abs(ll[a]-ll[b]);if(signal==3)return abs(ss[a]-ss[b]);
  int dr=abs(rr[a]-rr[b]),dg=abs(gg[a]-gg[b]),db=abs(bb[a]-bb[b]);return signal==4?max(dr,max(dg,db)):round((dr+dg+db)/3.0);
}

float tectonicLensSignal(int packed,int signal) {
  float r=(packed>>16)&255,g=(packed>>8)&255,b=packed&255;
  if(signal==3)return r/255-.5;if(signal==4)return g/255-.5;if(signal==5)return b/255-.5;if(signal==6)return(r-(g+b)*.5)/255;
  if(signal==1)return hue(packed)/255-.5;if(signal==2)return saturation(packed)/255-.5;return(r+g+b)/765-.5;
}

int tectonicWrap(float value,int size){return((round(value)%size)+size)%size;}

PImage tectonicLens(PImage input,JSONObject p,JSONObject effect,float phase) {
  input.loadPixels();PImage out=createImage(input.width,input.height,ARGB);out.loadPixels();int[] source=input.pixels;
  int detail=constrain(round(p.getFloat("territoryDetail",84)),24,180);float aspect=input.width/(max(1,input.height)+0.0f);
  int gw=max(2,min(320,round(aspect>=1?detail*aspect:detail))),gh=max(2,min(320,round(aspect>=1?detail:detail/aspect))),cells=gw*gh;
  int[] rr=new int[cells],gg=new int[cells],bb=new int[cells],hh=new int[cells],ss=new int[cells],ll=new int[cells];
  for(int gy=0;gy<gh;gy++)for(int gx=0;gx<gw;gx++){
    int x=min(input.width-1,floor((gx+.5)*input.width/gw)),y=min(input.height-1,floor((gy+.5)*input.height/gh)),cell=gy*gw+gx,packed=source[y*input.width+x];
    rr[cell]=(packed>>16)&255;gg[cell]=(packed>>8)&255;bb[cell]=packed&255;hh[cell]=round(hue(packed));ss[cell]=round(saturation(packed));ll[cell]=round((rr[cell]+gg[cell]+bb[cell])/3.0);
  }
  int edgeCount=(gw-1)*gh+(gh-1)*gw;int[] edgeA=new int[edgeCount],edgeB=new int[edgeCount],edgeWeight=new int[edgeCount],edgeNext=new int[edgeCount],bucketHead=new int[256];java.util.Arrays.fill(bucketHead,-1);
  int boundarySignal=constrain(round(p.getFloat("boundarySignal",0)),0,4),edge=0;
  for(int gy=0;gy<gh;gy++)for(int gx=0;gx<gw;gx++){
    int cell=gy*gw+gx;
    if(gx+1<gw){int weight=tectonicDistance(cell,cell+1,boundarySignal,rr,gg,bb,hh,ss,ll);edgeA[edge]=cell;edgeB[edge]=cell+1;edgeWeight[edge]=weight;edgeNext[edge]=bucketHead[weight];bucketHead[weight]=edge++;}
    if(gy+1<gh){int weight=tectonicDistance(cell,cell+gw,boundarySignal,rr,gg,bb,hh,ss,ll);edgeA[edge]=cell;edgeB[edge]=cell+gw;edgeWeight[edge]=weight;edgeNext[edge]=bucketHead[weight];bucketHead[weight]=edge++;}
  }
  int[] parent=new int[cells],componentSize=new int[cells];float[] internal=new float[cells];for(int cell=0;cell<cells;cell++){parent[cell]=cell;componentSize[cell]=1;}
  float sensitivity=constrain(p.getFloat("boundarySensitivity",.46),.05,1),mergePressure=12+sensitivity*sensitivity*620;
  for(int weight=0;weight<256;weight++)for(int current=bucketHead[weight];current>=0;current=edgeNext[current]){
    int a=tectonicFind(parent,edgeA[current]),b=tectonicFind(parent,edgeB[current]);if(a!=b&&weight<=internal[a]+mergePressure/componentSize[a]&&weight<=internal[b]+mergePressure/componentSize[b])tectonicMerge(parent,componentSize,internal,a,b,weight);
  }
  int minimum=max(1,round(p.getFloat("minimumTerritory",8)));
  for(int weight=0;weight<256;weight++)for(int current=bucketHead[weight];current>=0;current=edgeNext[current]){
    int a=tectonicFind(parent,edgeA[current]),b=tectonicFind(parent,edgeB[current]);if(a!=b&&(componentSize[a]<minimum||componentSize[b]<minimum))tectonicMerge(parent,componentSize,internal,a,b,weight);
  }
  int[] labels=new int[cells],count=new int[cells];float[] sumX=new float[cells],sumY=new float[cells];
  for(int gy=0;gy<gh;gy++)for(int gx=0;gx<gw;gx++){int cell=gy*gw+gx,root=tectonicFind(parent,cell);labels[cell]=root;count[root]++;sumX[root]+=gx+.5;sumY[root]+=gy+.5;}
  JSONObject where=effect.getJSONObject("where");int seed=renderSeed^where.getInt("seed",renderSeed)^0x054ec70c;
  int dominantLaw=constrain(round(p.getFloat("dominantLaw",2)),0,3),lensSignal=constrain(round(p.getFloat("lensSignal",1)),0,6);
  float pressure=p.getFloat("lensPressure",.48),diversity=p.getFloat("lawDiversity",.72),separation=p.getFloat("separation",.18),rotation=p.getFloat("rotation",.14);
  float echo=p.getFloat("echo",.24),absence=p.getFloat("absence",.08),infection=p.getFloat("boundaryInfection",.46),memory=p.getFloat("sourceMemory",.32),motion=p.getFloat("motion",.28),minimumDimension=min(input.width,input.height);
  int ground=colorMode.equals("palette")?paletteColor(3):color(0);
  for(int y=0;y<input.height;y++)for(int x=0;x<input.width;x++){
    int gx=min(gw-1,floor(x*gw/float(input.width))),gy=min(gh-1,floor(y*gh/float(input.height))),cell=gy*gw+gx,root=labels[cell],at=y*input.width+x,identity=root+1;
    float h0=tectonicHash(seed,identity,0),h1=tectonicHash(seed,identity,1),h2=tectonicHash(seed,identity,2),h3=tectonicHash(seed,identity,3);if(h0<absence){out.pixels[at]=ground;continue;}
    float centerX=sumX[root]/max(1,count[root])*input.width/gw,centerY=sumY[root]/max(1,count[root])*input.height/gh,direction=h1*TWO_PI,motionWave=sin(phase+h2*TWO_PI),breath=1+motion*motionWave*.72;
    float localX=x-centerX-cos(direction)*separation*minimumDimension*(.25+h2*.75)*breath,localY=y-centerY-sin(direction)*separation*minimumDimension*(.25+h2*.75)*breath;
    float turn=(h3*2-1)*rotation*PI*breath,cosine=cos(-turn),sine=sin(-turn),rotatedX=localX*cosine-localY*sine,rotatedY=localX*sine+localY*cosine;localX=rotatedX;localY=rotatedY;
    float sx=centerX+localX,sy=centerY+localY,evidence=tectonicLensSignal(source[at],lensSignal);int law=tectonicHash(seed,identity,4)<diversity?floor(tectonicHash(seed,identity,5)*4):dominantLaw;
    if(law==0){sx+=evidence*pressure*input.width*.22*cos(direction);sy+=evidence*pressure*input.height*.22*sin(direction);}
    else if(law==1){float exponent=.32+tectonicHash(seed,identity,6)*2.8,folded=(evidence<0?-1:1)*pow(abs(evidence*2),exponent)*.5;sx+=folded*pressure*input.width*.28*cos(direction);sy+=folded*pressure*input.height*.28*sin(direction);}
    else if(law==2){float wave=sin((evidence*2+localX/minimumDimension*(1+h1*4))*TWO_PI+motionWave*motion*PI);sx+=wave*pressure*minimumDimension*.18*cos(direction);sy+=wave*pressure*minimumDimension*.18*sin(direction);}
    else{float angle=atan2(localY,localX)+evidence*pressure*2.8*breath,radius=sqrt(localX*localX+localY*localY)*(1+evidence*pressure*.65);sx=centerX+cos(angle)*radius;sy=centerY+sin(angle)*radius;}
    if(tectonicHash(seed,identity,7)<echo){sx+=(tectonicHash(seed,identity,8)*2-1)*input.width*.3;sy+=(tectonicHash(seed,identity,9)*2-1)*input.height*.3;}
    int sourceX=tectonicWrap(sx,input.width),sourceY=tectonicWrap(sy,input.height),sampleAt=sourceY*input.width+sourceX,packed=source[sampleAt];float fractionX=x*gw/float(input.width)-gx,fractionY=y*gh/float(input.height)-gy;boolean fault=false;
    if(fractionX<.16&&gx>0&&labels[cell-1]!=root)fault=true;else if(fractionX>.84&&gx+1<gw&&labels[cell+1]!=root)fault=true;if(fractionY<.16&&gy>0&&labels[cell-gw]!=root)fault=true;else if(fractionY>.84&&gy+1<gh&&labels[cell+gw]!=root)fault=true;
    int nr=(packed>>16)&255,ng=(packed>>8)&255,nb=packed&255;if(fault&&infection>0){int split=max(1,round(infection*minimumDimension*.018)),redAt=sourceY*input.width+tectonicWrap(sourceX+split,input.width),blueAt=tectonicWrap(sourceY-split,input.height)*input.width+sourceX;nr=(source[redAt]>>16)&255;nb=source[blueAt]&255;}
    int original=source[at],or=(original>>16)&255,og=(original>>8)&255,ob=original&255;out.pixels[at]=color(lerp(nr,or,memory),lerp(ng,og,memory),lerp(nb,ob,memory));
  }
  out.updatePixels();return out;
}

PImage lensWarp(PImage input, JSONObject p, float phase) {
  PImage out = createImage(input.width, input.height, ARGB); input.loadPixels(); out.loadPixels();
  float bendX = p.getFloat("bendX", .22), bendY = p.getFloat("bendY", .14), frequency = p.getFloat("frequency", 3.4);
  int mode = p.getInt("mode", 1);
  for (int y = 0; y < input.height; y++) for (int x = 0; x < input.width; x++) {
    int at = y * input.width + x; float light = brightness(input.pixels[at]) / 255.0 - .5;
    float nx = x / float(input.width) - .5, ny = y / float(input.height) - .5;
    float ox = light * input.width * bendX, oy = light * input.height * bendY;
    if (mode == 1) {
      ox += sin((ny * frequency + phase * .1) * TWO_PI) * input.width * bendX * .34;
      oy += cos((nx * frequency - phase * .1) * TWO_PI) * input.height * bendY * .34;
    } else if (mode == 2) {
      float angle = atan2(ny, nx) + light * bendX * 3, radius = sqrt(nx*nx + ny*ny) * (1 + light * bendY * 2);
      ox += (cos(angle) * radius - nx) * input.width; oy += (sin(angle) * radius - ny) * input.height;
    }
    int sx = ((round(x + ox) % input.width) + input.width) % input.width;
    int sy = ((round(y + oy) % input.height) + input.height) % input.height;
    out.pixels[at] = input.pixels[sy * input.width + sx];
  }
  out.updatePixels(); return out;
}

PImage mirrorCut(PImage input, JSONObject p) {
  int mode = p.getInt("mode", 2); float offset = p.getFloat("offset", .16), mix = p.getFloat("mix", .74);
  PGraphics g = createGraphics(input.width, input.height, P2D); g.beginDraw(); g.image(input, 0, 0); g.tint(255, mix * 255);
  g.pushMatrix();
  if (mode == 0 || mode == 1) { g.translate(mode == 0 ? input.width : 0, offset * input.height); g.scale(-1, 1); g.image(input, mode == 0 ? 0 : -input.width, 0); }
  else if (mode == 2 || mode == 3) { g.translate(offset * input.width, mode == 2 ? input.height : 0); g.scale(1, -1); g.image(input, 0, mode == 2 ? 0 : -input.height); }
  else if (mode == 4) { g.translate(input.width * (.5 + offset * .2), input.height * .5); g.rotate(HALF_PI); g.scale(-1,1); g.image(input, -input.width*.5, -input.height*.5); }
  else { g.translate(input.width * offset, -input.height * offset); g.scale(-1,1); g.image(input, -input.width, 0); }
  g.popMatrix(); g.noTint(); g.endDraw(); return g.get();
}

PImage motionLeak(PImage input, JSONObject p, float phase) {
  int block = max(4, p.getInt("block", 16));
  float vector = p.getFloat("vector", 28), leak = p.getFloat("leak", .58);
  float residual = p.getFloat("residual", .34), coherence = p.getFloat("coherence", .67);
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw(); g.noSmooth(); g.image(input, 0, 0);
  for (int y = 0; y < input.height; y += block) for (int x = 0; x < input.width; x += block) {
    if (random(1) > leak) continue;
    float waveX = sin(y * .018 * coherence + phase) * vector;
    float waveY = cos(x * .014 * coherence - phase * .7) * vector * .55;
    float chaos = 1 - coherence;
    float dx = waveX + random(-vector, vector) * chaos;
    float dy = waveY + random(-vector, vector) * chaos;
    int sx = constrain(round(x + dx), 0, max(0, input.width - block));
    int sy = constrain(round(y + dy), 0, max(0, input.height - block));
    int sw = min(block, input.width - sx), sh = min(block, input.height - sy);
    int dw = min(block + 1, input.width - x), dh = min(block + 1, input.height - y);
    g.tint(255, 128 + leak * 127);
    g.image(input, x, y, dw, dh, sx, sy, sx + sw, sy + sh);
    if (residual > 0) {
      g.blendMode(SCREEN); g.tint(255, residual * 142);
      g.image(input, x + dx * .12, y + dy * .12, min(block, input.width-x), min(block, input.height-y), x, y, min(input.width, x+block), min(input.height, y+block));
      g.blendMode(BLEND);
    }
  }
  g.noTint(); g.endDraw(); return g.get();
}

void waveletHaarRegion(float[] data, int stride, int x0, int y0, int regionWidth, int regionHeight, boolean inverse) {
  float[] temp = new float[max(regionWidth, regionHeight)];
  if (!inverse) {
    for (int y = 0; y < regionHeight; y++) {
      int half = regionWidth / 2;
      for (int i = 0; i < half; i++) {
        float a = data[(y0 + y) * stride + x0 + i * 2];
        float b = data[(y0 + y) * stride + x0 + i * 2 + 1];
        temp[i] = (a + b) * 0.5;
        temp[half + i] = (a - b) * 0.5;
      }
      for (int i = 0; i < regionWidth; i++) data[(y0 + y) * stride + x0 + i] = temp[i];
    }
    for (int x = 0; x < regionWidth; x++) {
      int half = regionHeight / 2;
      for (int i = 0; i < half; i++) {
        float a = data[(y0 + i * 2) * stride + x0 + x];
        float b = data[(y0 + i * 2 + 1) * stride + x0 + x];
        temp[i] = (a + b) * 0.5;
        temp[half + i] = (a - b) * 0.5;
      }
      for (int i = 0; i < regionHeight; i++) data[(y0 + i) * stride + x0 + x] = temp[i];
    }
  } else {
    for (int x = 0; x < regionWidth; x++) {
      int half = regionHeight / 2;
      for (int i = 0; i < half; i++) {
        float a = data[(y0 + i) * stride + x0 + x];
        float d = data[(y0 + half + i) * stride + x0 + x];
        temp[i * 2] = a + d;
        temp[i * 2 + 1] = a - d;
      }
      for (int i = 0; i < regionHeight; i++) data[(y0 + i) * stride + x0 + x] = temp[i];
    }
    for (int y = 0; y < regionHeight; y++) {
      int half = regionWidth / 2;
      for (int i = 0; i < half; i++) {
        float a = data[(y0 + y) * stride + x0 + i];
        float d = data[(y0 + y) * stride + x0 + half + i];
        temp[i * 2] = a + d;
        temp[i * 2 + 1] = a - d;
      }
      for (int i = 0; i < regionWidth; i++) data[(y0 + y) * stride + x0 + i] = temp[i];
    }
  }
}

void waveletAnalyzeRect(float[] data, int stride, int regionWidth, int regionHeight, boolean packet, boolean inverse, int maxLevels) {
  if (packet) {
    int halfWidth = regionWidth / 2;
    int halfHeight = regionHeight / 2;
    if (!inverse) {
      waveletHaarRegion(data, stride, 0, 0, regionWidth, regionHeight, false);
      if (halfWidth % 2 == 0 && halfHeight % 2 == 0) for (int y = 0; y < regionHeight; y += halfHeight) for (int x = 0; x < regionWidth; x += halfWidth) waveletHaarRegion(data, stride, x, y, halfWidth, halfHeight, false);
    } else {
      if (halfWidth % 2 == 0 && halfHeight % 2 == 0) for (int y = 0; y < regionHeight; y += halfHeight) for (int x = 0; x < regionWidth; x += halfWidth) waveletHaarRegion(data, stride, x, y, halfWidth, halfHeight, true);
      waveletHaarRegion(data, stride, 0, 0, regionWidth, regionHeight, true);
    }
    return;
  }
  int[] levelWidths = new int[maxLevels];
  int[] levelHeights = new int[maxLevels];
  int count = 0;
  int levelWidth = regionWidth;
  int levelHeight = regionHeight;
  while (count < maxLevels && levelWidth >= 4 && levelHeight >= 4 && levelWidth % 2 == 0 && levelHeight % 2 == 0) {
    levelWidths[count] = levelWidth;
    levelHeights[count] = levelHeight;
    count++;
    levelWidth /= 2;
    levelHeight /= 2;
  }
  if (!inverse) for (int i = 0; i < count; i++) waveletHaarRegion(data, stride, 0, 0, levelWidths[i], levelHeights[i], false);
  else for (int i = count - 1; i >= 0; i--) waveletHaarRegion(data, stride, 0, 0, levelWidths[i], levelHeights[i], true);
}

void waveletAnalyze(float[] data, int size, boolean packet, boolean inverse) {
  waveletAnalyzeRect(data, size, size, size, packet, inverse, 3);
}

boolean waveletTerritory(int kind, float x, float y, float drift) {
  float nx = (x + drift + 2) % 1;
  float ny = (y + drift * 0.63 + 2) % 1;
  float edge = min(min(nx, ny), min(1 - nx, 1 - ny));
  if (kind == 0) return (nx < 0.28 || nx > 0.72) && (ny < 0.28 || ny > 0.72);
  if (kind == 1) return edge < 0.2;
  if (kind == 2) return abs(nx - 0.5) < 0.14 || abs(ny - 0.5) < 0.14;
  if (kind == 3) return nx > 0.22 && nx < 0.78 && ny > 0.22 && ny < 0.78;
  return (nx > 0.5) != (ny > 0.5);
}

void igniteWaveletChannel(int[] pixels, int channel, float amount) {
  if (amount <= 0) return;
  int[] histogram = new int[256];
  for (int c : pixels) histogram[channel == 0 ? (c >> 16) & 255 : channel == 1 ? (c >> 8) & 255 : c & 255]++;
  int[] lookup = new int[256];
  int sum = 0;
  for (int value = 0; value < 256; value++) { sum += histogram[value]; lookup[value] = round(sum * 255.0 / pixels.length); }
  for (int i = 0; i < pixels.length; i++) {
    int c = pixels[i];
    int old = channel == 0 ? (c >> 16) & 255 : channel == 1 ? (c >> 8) & 255 : c & 255;
    int value = round(lerp(old, lookup[old], amount));
    pixels[i] = channel == 0 ? (c & 0xff00ffff) | (value << 16) : channel == 1 ? (c & 0xffff00ff) | (value << 8) : (c & 0xffffff00) | value;
  }
}

PImage waveletCartography(PImage input, JSONObject p, float phase, boolean animated) {
  input.loadPixels();
  PImage output = createImage(input.width, input.height, ARGB);
  output.loadPixels();
  arrayCopy(input.pixels, output.pixels);
  int personality = round(p.getFloat("personality", 0));
  boolean packet = round(p.getFloat("transformBody", 0)) == 1;
  int character = round(p.getFloat("waveCharacter", 1));
  int transformScale = round(p.getFloat("transformScale", 2));
  int mapContinuity = round(p.getFloat("mapContinuity", 2));
  boolean hsb = round(p.getFloat("colorBody", 0)) == 1;
  boolean separate = round(p.getFloat("channelBond", 0)) == 1 || personality == 1;
  int territory = round(p.getFloat("territory", 0));
  float erasure = p.getFloat("erasure", 0.24);
  float merge = p.getFloat("coefficientMerge", 0.1);
  float ignition = p.getFloat("colorIgnition", 0.08);
  float sourceGhost = p.getFloat("sourceGhost", 0.3);
  float mapDrift = p.getFloat("mapDrift", 0.25);
  if (mapContinuity == 2) {
    int activeWidth = input.width - input.width % 2;
    int activeHeight = input.height - input.height % 2;
    int pixelCount = input.width * input.height;
    for (int channel = 0; channel < 3; channel++) {
      float[] field = new float[pixelCount];
      for (int pixel = 0; pixel < pixelCount; pixel++) {
        int c = input.pixels[pixel];
        if (hsb) field[pixel] = java.awt.Color.RGBtoHSB((c >> 16) & 255, (c >> 8) & 255, c & 255, null)[channel] * 255;
        else field[pixel] = channel == 0 ? (c >> 16) & 255 : channel == 1 ? (c >> 8) & 255 : c & 255;
      }
      waveletAnalyzeRect(field, input.width, activeWidth, activeHeight, packet, false, 6);
      float channelDrift = separate ? channel * 0.173 : 0;
      float motion = personality == 2 && animated ? sin(phase) * mapDrift * 0.42 : 0;
      for (int y = 0; y < activeHeight; y++) for (int x = 0; x < activeWidth; x++) {
        int index = y * input.width + x;
        if (!waveletTerritory(territory, x / float(activeWidth), y / float(activeHeight), motion + channelDrift)) continue;
        float held = field[index];
        float neighbor = field[y * input.width + ((x + activeWidth - 1) % activeWidth)];
        float vertical = field[((y + activeHeight - 1) % activeHeight) * input.width + x];
        if (character == 0) field[index] = held * (1 - erasure);
        else if (character == 1) field[index] = lerp(held, (neighbor + vertical) * 0.5, merge) * (1 - erasure * 0.7);
        else if (character == 2) field[index] = -held * (0.35 + erasure * 1.35);
        else if (character == 3) {
          int reach = 3 + floor(merge * max(activeWidth, activeHeight) * 0.04);
          field[index] = held * (1 - erasure) + field[y * input.width + ((x + activeWidth - reach) % activeWidth)] * merge * 1.8;
        } else if (character == 4) field[index] = held * (1 - erasure * 0.28) + (held < 0 ? -1 : 1) * abs(neighbor + vertical) * 0.5 * merge * 1.55;
        else field[index] = held * (0.65 + 0.7 * sin((x / float(activeWidth) * 7.3 + y / float(activeHeight) * 11.7 + channel * 0.7) * PI)) * (1 - erasure * 0.35);
      }
      if (merge > 0) for (int y = 0; y < activeHeight - 1; y += 2) for (int x = 0; x < activeWidth - 1; x += 2) {
        int at = y * input.width + x;
        float combined = (field[at] + field[at + 1] + field[at + input.width] + field[at + input.width + 1]) * 0.25;
        field[at] = lerp(field[at], combined, merge);
        field[at + 1] *= 1 - merge * 0.45;
        field[at + input.width] *= 1 - merge * 0.45;
      }
      waveletAnalyzeRect(field, input.width, activeWidth, activeHeight, packet, true, 6);
      for (int pixel = 0; pixel < pixelCount; pixel++) {
        int value = round(constrain(field[pixel], 0, 255));
        if (channel == 0) output.pixels[pixel] = (input.pixels[pixel] & 0xff00ffff) | (value << 16);
        else if (channel == 1) output.pixels[pixel] = (output.pixels[pixel] & 0xffff00ff) | (value << 8);
        else {
          int held = output.pixels[pixel];
          int rr, gg, bb;
          if (hsb) {
            int packed = java.awt.Color.HSBtoRGB(((held >> 16) & 255) / 255.0, ((held >> 8) & 255) / 255.0, value / 255.0);
            rr = (packed >> 16) & 255; gg = (packed >> 8) & 255; bb = packed & 255;
          } else {
            rr = (held >> 16) & 255; gg = (held >> 8) & 255; bb = value;
          }
          int source = input.pixels[pixel];
          rr = round(lerp(rr, (source >> 16) & 255, sourceGhost));
          gg = round(lerp(gg, (source >> 8) & 255, sourceGhost));
          bb = round(lerp(bb, source & 255, sourceGhost));
          output.pixels[pixel] = (source & 0xff000000) | (rr << 16) | (gg << 8) | bb;
        }
      }
    }
    for (int channel = 0; channel < 3; channel++) igniteWaveletChannel(output.pixels, channel, ignition);
    output.updatePixels();
    return output;
  }
  int[] tileScales = {32, 64, 128};
  int tileSize = tileScales[constrain(transformScale, 0, 2)];
  int stride = mapContinuity == 3 ? max(16, round(tileSize * 0.75)) : tileSize;
  for (int top = 0; top < input.height; top += stride) for (int left = 0; left < input.width; left += stride) {
    float[][] channels = new float[3][tileSize * tileSize];
    for (int y = 0; y < tileSize; y++) for (int x = 0; x < tileSize; x++) {
      int sx = min(input.width - 1, left + x);
      int sy = min(input.height - 1, top + y);
      int c = input.pixels[sy * input.width + sx];
      if (hsb) {
        float[] values = java.awt.Color.RGBtoHSB((c >> 16) & 255, (c >> 8) & 255, c & 255, null);
        for (int channel = 0; channel < 3; channel++) channels[channel][y * tileSize + x] = values[channel] * 255;
      } else {
        channels[0][y * tileSize + x] = (c >> 16) & 255;
        channels[1][y * tileSize + x] = (c >> 8) & 255;
        channels[2][y * tileSize + x] = c & 255;
      }
    }
    for (int channel = 0; channel < 3; channel++) {
      float[] tile = channels[channel];
      waveletAnalyze(tile, tileSize, packet, false);
      float channelDrift = separate ? channel * 0.173 : 0;
      float motion = personality == 2 && animated ? sin(phase) * mapDrift * 0.42 : 0;
      int tileHash = (left * 73856093) ^ (top * 19349663) ^ (channel * 83492791);
      float wanderX = (tileHash & 1023) / 1023.0;
      float wanderY = ((tileHash >> 10) & 1023) / 1023.0;
      for (int y = 0; y < tileSize; y++) for (int x = 0; x < tileSize; x++) {
        int index = y * tileSize + x;
        float mapX = mapContinuity == 2 ? (left + x) / float(max(1, input.width)) : x / float(tileSize) + (mapContinuity == 1 ? wanderX : 0);
        float mapY = mapContinuity == 2 ? (top + y) / float(max(1, input.height)) : y / float(tileSize) + (mapContinuity == 1 ? wanderY : 0);
        if (!waveletTerritory(territory, mapX, mapY, motion + channelDrift)) continue;
        float held = tile[index];
        float neighbor = tile[y * tileSize + ((x + tileSize - 1) % tileSize)];
        float vertical = tile[((y + tileSize - 1) % tileSize) * tileSize + x];
        if (character == 0) tile[index] = held * (1 - erasure);
        else if (character == 1) tile[index] = lerp(held, (neighbor + vertical) * 0.5, merge) * (1 - erasure * 0.7);
        else if (character == 2) tile[index] = -held * (0.35 + erasure * 1.35);
        else if (character == 3) {
          int reach = 3 + floor(merge * 13);
          tile[index] = held * (1 - erasure) + tile[y * tileSize + ((x + tileSize - reach) % tileSize)] * merge * 1.8;
        } else if (character == 4) tile[index] = held * (1 - erasure * 0.28) + (held < 0 ? -1 : 1) * abs(neighbor + vertical) * 0.5 * merge * 1.55;
        else tile[index] = held * (0.35 + 1.3 * sin((x * 0.73 + y * 1.17 + channel * 2.1) * PI)) * (1 - erasure * 0.45);
      }
      if (merge > 0) for (int y = 0; y < tileSize - 1; y += 2) for (int x = 0; x < tileSize - 1; x += 2) {
        int at = y * tileSize + x;
        float combined = (tile[at] + tile[at + 1] + tile[at + tileSize] + tile[at + tileSize + 1]) * 0.25;
        tile[at] = lerp(tile[at], combined, merge);
        tile[at + 1] *= 1 - merge * 0.72;
        tile[at + tileSize] *= 1 - merge * 0.72;
      }
      waveletAnalyze(tile, tileSize, packet, true);
    }
    for (int y = 0; y < min(tileSize, input.height - top); y++) for (int x = 0; x < min(tileSize, input.width - left); x++) {
      int pixel = (top + y) * input.width + left + x;
      int source = input.pixels[pixel];
      int index = y * tileSize + x;
      int rr, gg, bb;
      if (hsb) {
        int packed = java.awt.Color.HSBtoRGB(constrain(channels[0][index], 0, 255) / 255.0, constrain(channels[1][index], 0, 255) / 255.0, constrain(channels[2][index], 0, 255) / 255.0);
        rr = (packed >> 16) & 255; gg = (packed >> 8) & 255; bb = packed & 255;
      } else {
        rr = round(constrain(channels[0][index], 0, 255)); gg = round(constrain(channels[1][index], 0, 255)); bb = round(constrain(channels[2][index], 0, 255));
      }
      rr = round(lerp(rr, (source >> 16) & 255, sourceGhost));
      gg = round(lerp(gg, (source >> 8) & 255, sourceGhost));
      bb = round(lerp(bb, source & 255, sourceGhost));
      if (mapContinuity == 3) {
        float feather = sin(PI * (x + 0.5) / tileSize) * sin(PI * (y + 0.5) / tileSize);
        int existing = output.pixels[pixel];
        rr = round(lerp((existing >> 16) & 255, rr, feather));
        gg = round(lerp((existing >> 8) & 255, gg, feather));
        bb = round(lerp(existing & 255, bb, feather));
      }
      output.pixels[pixel] = (source & 0xff000000) | (rr << 16) | (gg << 8) | bb;
    }
  }
  for (int channel = 0; channel < 3; channel++) igniteWaveletChannel(output.pixels, channel, ignition);
  output.updatePixels();
  return output;
}

float lz77Hash(int seed, int phrase, int channel, int salt) {
  int value = seed ^ (phrase + 1) * 0x9e3779b1 ^ (channel + 3) * 0x85ebca6b ^ (salt + 7) * 0xc2b2ae35;
  value = (value ^ (value >>> 16)) * 0x7feb352d;
  value = (value ^ (value >>> 15)) * 0x846ca68b;
  long unsigned = (value ^ (value >>> 16)) & 0xffffffffL;
  return unsigned / 4294967296.0;
}

float lz77Attention(int[] source, int pixel, int mode) {
  if (mode == 0) return 1;
  int c = source[constrain(pixel, 0, source.length - 1)];
  float rr = ((c >> 16) & 255) / 255.0;
  float gg = ((c >> 8) & 255) / 255.0;
  float bb = (c & 255) / 255.0;
  if (mode == 1) return 0.12 + (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) * 1.76;
  if (mode == 2) {
    float maximum = max(rr, max(gg, bb));
    float minimum = min(rr, min(gg, bb));
    return 0.12 + (maximum == 0 ? 0 : (maximum - minimum) / maximum) * 1.76;
  }
  return 0.12 + rr * 1.76;
}

byte[] lz77Stream(byte[] bytes, int[] source, int pixelDivisor, int seed, int channel, int reach, int span, int wound, int attention, float amount, float severity, float tide, float phase, boolean animated) {
  byte[] output = bytes.clone();
  int[] recent = new int[65536];
  for (int i = 0; i < recent.length; i++) recent[i] = -1;
  int sourceAt = 0;
  int outputAt = 0;
  int phrase = 0;
  while (sourceAt < bytes.length && outputAt < output.length) {
    int first = bytes[sourceAt] & 255;
    int second = sourceAt + 1 < bytes.length ? bytes[sourceAt + 1] & 255 : 0;
    int third = sourceAt + 2 < bytes.length ? bytes[sourceAt + 2] & 255 : 0;
    int key = ((first * 251 + second) * 251 + third) & 65535;
    int previous = recent[key];
    int distance = 0;
    int length = 0;
    if (previous >= 0) {
      int candidateDistance = sourceAt - previous;
      if (candidateDistance > 0 && candidateDistance <= reach) {
        int limit = min(span, min(candidateDistance, bytes.length - sourceAt - 1));
        while (length < limit && bytes[previous + length] == bytes[sourceAt + length]) length++;
        if (length > 0) distance = candidateDistance;
      }
    }
    int literalAt = min(bytes.length - 1, sourceAt + length);
    int woundedDistance = distance;
    int woundedLength = length;
    int literal = bytes[literalAt] & 255;
    float attentionWeight = lz77Attention(source, sourceAt / pixelDivisor, attention);
    if (lz77Hash(seed, phrase, channel, 0) < min(1, amount * attentionWeight)) {
      float motion = animated ? sin(phase + lz77Hash(seed, phrase, channel, 1) * TWO_PI) * tide : 0;
      float pressure = constrain(severity * (1 + motion * 0.82), 0, 1.5);
      int selectedWound = wound == 4 ? 1 + floor(lz77Hash(seed, phrase, channel, 2) * 3) : wound;
      float signed = lz77Hash(seed, phrase, channel, 3) * 2 - 1;
      if (selectedWound == 0) {
        if (outputAt > 0) woundedDistance = max(1, min(outputAt, round((distance == 0 ? 1 : distance) + signed * max(1, reach * pressure * 0.045))));
        woundedLength = max(0, min(span, round(length + (lz77Hash(seed, phrase, channel, 4) * 2 - 1) * max(1, span * pressure * 0.08))));
      } else if (selectedWound == 1 && outputAt > 0) {
        int target = 1 + floor(lz77Hash(seed, phrase, channel, 5) * min(outputAt, reach));
        woundedDistance = max(1, min(outputAt, round((distance == 0 ? 1 : distance) * (1 - pressure) + target * pressure)));
        if (woundedLength == 0) woundedLength = 1 + floor(pressure * min(span, 12));
      } else if (selectedWound == 2) {
        int target = 1 + floor(lz77Hash(seed, phrase, channel, 6) * span);
        woundedLength = max(0, min(span, round(length * (1 - pressure) + target * pressure)));
        if (woundedLength > 0 && woundedDistance == 0 && outputAt > 0) woundedDistance = 1 + floor(lz77Hash(seed, phrase, channel, 7) * min(outputAt, reach));
      } else if (selectedWound == 3) {
        int mask = 1 + floor(lz77Hash(seed, phrase, channel, 8) * 255 * min(1, pressure));
        literal ^= mask;
      }
    }
    if (woundedLength > 0 && woundedDistance > 0) for (int copied = 0; copied < woundedLength && outputAt < output.length; copied++) {
      output[outputAt] = output[max(0, outputAt - woundedDistance)];
      outputAt++;
    }
    if (outputAt < output.length) output[outputAt++] = (byte)literal;
    int nextSource = min(bytes.length, literalAt + 1);
    for (int indexed = sourceAt; indexed < nextSource; indexed++) {
      int a = bytes[indexed] & 255;
      int b = indexed + 1 < bytes.length ? bytes[indexed + 1] & 255 : 0;
      int c = indexed + 2 < bytes.length ? bytes[indexed + 2] & 255 : 0;
      recent[((a * 251 + b) * 251 + c) & 65535] = indexed;
    }
    sourceAt = nextSource;
    phrase++;
  }
  return output;
}

int lz77Component(int c, int component) {
  if (component == 0) return (c >> 16) & 255;
  if (component == 1) return (c >> 8) & 255;
  if (component == 2) return c & 255;
  return (c >>> 24) & 255;
}

PImage lz77Memory(PImage input, JSONObject effect, JSONObject p, float phase, boolean animated) {
  input.loadPixels();
  PImage output = input.get();
  output.loadPixels();
  int memoryBody = round(p.getFloat("memoryBody", 0));
  boolean hsb = round(p.getFloat("colorMemory", 1)) == 1;
  int weave = constrain(round(p.getFloat("byteWeave", 0)), 0, 2);
  int[] reaches = {63, 255, 1023, 4095};
  int[] spans = {7, 19, 63, 191};
  int reach = reaches[constrain(round(p.getFloat("memoryReach", 2)), 0, 3)];
  int span = spans[constrain(round(p.getFloat("phraseSpan", 2)), 0, 3)];
  int wound = constrain(round(p.getFloat("woundCharacter", 0)), 0, 4);
  int attention = constrain(round(p.getFloat("attention", 1)), 0, 3);
  float amount = constrain(p.getFloat("damageAmount", 0.06), 0, 1);
  float severity = constrain(p.getFloat("damageSeverity", 0.34), 0, 1);
  float divergence = constrain(p.getFloat("channelDivergence", 0.28), 0, 1);
  float ghost = constrain(p.getFloat("sourceGhost", 0.3), 0, 1);
  float tide = constrain(p.getFloat("memoryTide", 0.24), 0, 1);
  int seed = effect.hasKey("where") ? effect.getJSONObject("where").getInt("seed", renderSeed) : renderSeed;
  int pixels = input.pixels.length;
  if (memoryBody == 0) {
    for (int channel = 0; channel < 3; channel++) {
      byte[] bytes = new byte[pixels];
      for (int pixel = 0; pixel < pixels; pixel++) {
        int c = input.pixels[pixel];
        int value;
        if (hsb) value = round(java.awt.Color.RGBtoHSB((c >> 16) & 255, (c >> 8) & 255, c & 255, null)[channel] * 255);
        else value = lz77Component(c, channel);
        bytes[pixel] = (byte)value;
      }
      byte[] recovered = lz77Stream(bytes, input.pixels, 1, seed + round(channel * divergence * 104729), channel, reach, span, wound, attention, amount, severity, tide, phase, animated);
      for (int pixel = 0; pixel < pixels; pixel++) {
        int value = recovered[pixel] & 255;
        if (channel == 0) output.pixels[pixel] = (output.pixels[pixel] & 0xff00ffff) | (value << 16);
        else if (channel == 1) output.pixels[pixel] = (output.pixels[pixel] & 0xffff00ff) | (value << 8);
        else output.pixels[pixel] = (output.pixels[pixel] & 0xffffff00) | value;
      }
    }
    for (int pixel = 0; pixel < pixels; pixel++) {
      int held = output.pixels[pixel];
      int rr, gg, bb;
      if (hsb) {
        int packed = java.awt.Color.HSBtoRGB(((held >> 16) & 255) / 255.0, ((held >> 8) & 255) / 255.0, (held & 255) / 255.0);
        rr = (packed >> 16) & 255; gg = (packed >> 8) & 255; bb = packed & 255;
      } else {
        rr = (held >> 16) & 255; gg = (held >> 8) & 255; bb = held & 255;
      }
      int source = input.pixels[pixel];
      rr = round(lerp(rr, (source >> 16) & 255, ghost));
      gg = round(lerp(gg, (source >> 8) & 255, ghost));
      bb = round(lerp(bb, source & 255, ghost));
      output.pixels[pixel] = (source & 0xff000000) | (rr << 16) | (gg << 8) | bb;
    }
  } else {
    int[][] orders = {{3, 0, 1, 2}, {0, 1, 2, 3}, {2, 1, 0, 3}};
    int[] order = orders[weave];
    byte[] bytes = new byte[pixels * 4];
    for (int pixel = 0; pixel < pixels; pixel++) for (int component = 0; component < 4; component++) bytes[pixel * 4 + component] = (byte)lz77Component(input.pixels[pixel], order[component]);
    byte[] recovered = lz77Stream(bytes, input.pixels, 4, seed, 0, reach, span, wound, attention, amount, severity, tide, phase, animated);
    for (int pixel = 0; pixel < pixels; pixel++) {
      int rr = 0, gg = 0, bb = 0, aa = 0;
      for (int component = 0; component < 4; component++) {
        int value = recovered[pixel * 4 + component] & 255;
        if (order[component] == 0) rr = value;
        else if (order[component] == 1) gg = value;
        else if (order[component] == 2) bb = value;
        else aa = value;
      }
      int source = input.pixels[pixel];
      rr = round(lerp(rr, (source >> 16) & 255, ghost));
      gg = round(lerp(gg, (source >> 8) & 255, ghost));
      bb = round(lerp(bb, source & 255, ghost));
      aa = round(lerp(aa, (source >>> 24) & 255, ghost));
      output.pixels[pixel] = (aa << 24) | (rr << 16) | (gg << 8) | bb;
    }
  }
  output.updatePixels();
  return output;
}

float signalReliefHash(int seed, int x, int y, int salt) {
  int value = ((x + 1) ^ salt) * 374761393 ^ ((y + 1) + salt) * 668265263 ^ (seed + salt) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  long unsigned = (value ^ (value >>> 16)) & 0xffffffffL;
  return (float)(unsigned / 4294967295.0);
}

int signalReliefPixel(PImage input, float x, float y) {
  int px = constrain(round(x), 0, input.width - 1);
  int py = constrain(round(y), 0, input.height - 1);
  return input.pixels[py * input.width + px];
}

float signalReliefLuma(int sample) {
  return (red(sample) * .2126 + green(sample) * .7152 + blue(sample) * .0722) / 255.0;
}

float signalReliefEvidence(PImage input, float x, float y, int column, int row, int signal, int seed, float spacing, float stepY) {
  int sample = signalReliefPixel(input, x, y);
  float light = signalReliefLuma(sample);
  if (signal == 0) return light;
  if (signal == 1) return 1 - light;
  if (signal == 2) {
    float horizontal = abs(signalReliefLuma(signalReliefPixel(input, x + spacing * .5, y)) - signalReliefLuma(signalReliefPixel(input, x - spacing * .5, y)));
    float vertical = abs(signalReliefLuma(signalReliefPixel(input, x, y + stepY * .5)) - signalReliefLuma(signalReliefPixel(input, x, y - stepY * .5)));
    return constrain(sqrt(horizontal * horizontal + vertical * vertical) * 1.7, 0, 1);
  }
  if (signal == 3) {
    float maximum = max(red(sample), max(green(sample), blue(sample)));
    float minimum = min(red(sample), min(green(sample), blue(sample)));
    return maximum <= 0 ? 0 : (maximum - minimum) / maximum;
  }
  return constrain(signalReliefHash(seed, column, row, 59) * .72 + light * .28, 0, 1);
}

void drawSignalReliefBody(PGraphics g, float x, float y, float radius, int body, int ink, float strength, float afterglow) {
  float r = red(ink), gr = green(ink), b = blue(ink);
  if (afterglow > 0 && strength > .005) {
    g.noStroke(); g.fill(r, gr, b, 255 * strength * afterglow * .2);
    g.ellipse(x, y, radius * (4.8 + afterglow * 5.6), radius * (4.8 + afterglow * 5.6));
  }
  g.fill(r, gr, b, 255 * strength); g.stroke(r, gr, b, 255 * strength); g.strokeWeight(max(.7, radius * .42));
  if (body == 0 || body == 1) {
    g.noStroke(); float diameter = radius * (body == 1 ? 2.16 : 1.44); g.ellipse(x, y, diameter, diameter);
  } else if (body == 2) {
    g.noStroke(); g.rect(x - radius * 1.45, y - radius * .28, radius * 2.9, radius * .56);
  } else if (body == 3) {
    g.line(x - radius, y, x + radius, y); g.line(x, y - radius, x, y + radius);
  } else {
    g.noFill(); g.rect(x - radius * .8, y - radius, radius * 1.6, radius * 2);
    g.noStroke(); g.fill(r, gr, b, 255 * strength); g.rect(x - radius * .12, y - radius, radius * .24, radius * 2);
  }
}

PImage signalRelief(PImage input, JSONObject effect, JSONObject p, float phase) {
  input.loadPixels();
  int density = max(18, round(p.getFloat("density", 72)));
  float spacing = input.width / (float)density;
  int rows = max(1, round(input.height / spacing));
  float stepY = input.height / (float)rows;
  int body = constrain(round(p.getFloat("body", 1)), 0, 4);
  float emitterSize = p.getFloat("emitterSize", .44);
  int lightSignal = constrain(round(p.getFloat("lightSignal", 0)), 0, 4);
  float threshold = p.getFloat("threshold", .34), curve = p.getFloat("signalCurve", 1.35);
  int polarity = round(p.getFloat("polarity", 0));
  int reliefSource = constrain(round(p.getFloat("reliefSource", 2)), 0, 3);
  float depth = p.getFloat("reliefDepth", .42), fieldYield = p.getFloat("fieldYield", .58);
  float flicker = p.getFloat("flicker", .18), afterglow = p.getFloat("afterglow", .34);
  int lightColor = constrain(round(p.getFloat("lightColor", 0)), 0, 2);
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int seed = renderSeed + where.getInt("seed", 0) * 17 + 47047;
  float shortEdge = min(input.width, input.height);
  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw(); g.background(2, 2, 4); g.rectMode(CORNER);
  for (int row = 0; row < rows; row++) for (int column = 0; column < density; column++) {
    float sourceX = (column + .5) * spacing, sourceY = (row + .5) * stepY;
    int reliefSignal = reliefSource == 3 ? 4 : reliefSource;
    float relief = signalReliefEvidence(input, sourceX, sourceY, column, row, reliefSignal, seed, spacing, stepY);
    float left = signalReliefEvidence(input, sourceX - spacing, sourceY, column - 1, row, reliefSignal, seed, spacing, stepY);
    float right = signalReliefEvidence(input, sourceX + spacing, sourceY, column + 1, row, reliefSignal, seed, spacing, stepY);
    float up = signalReliefEvidence(input, sourceX, sourceY - stepY, column, row - 1, reliefSignal, seed, spacing, stepY);
    float down = signalReliefEvidence(input, sourceX, sourceY + stepY, column, row + 1, reliefSignal, seed, spacing, stepY);
    float slopeX = right - left, slopeY = down - up, lift = (relief - .5) * depth;
    float perspectiveX = (sourceX - input.width * .5) / max(1, shortEdge);
    float perspectiveY = (sourceY - input.height * .5) / max(1, shortEdge);
    float x = sourceX + (slopeX * 1.8 + perspectiveX * lift) * spacing * fieldYield * 2.4;
    float y = sourceY + (slopeY * 1.8 + perspectiveY * lift) * stepY * fieldYield * 2.4;
    float raw = signalReliefEvidence(input, sourceX, sourceY, column, row, lightSignal, seed, spacing, stepY);
    float thresholded = constrain((raw - threshold) / max(.001, 1 - threshold), 0, 1);
    float strength = pow(thresholded, curve);
    if (polarity == 1) strength = 1 - strength;
    float electric = .5 + .5 * sin(phase + signalReliefHash(seed, column, row, 83) * TWO_PI);
    strength *= 1 - flicker * (.12 + electric * .58);
    int sampled = signalReliefPixel(input, sourceX, sourceY);
    int ink = color(255, 250, 238);
    if (lightColor == 1) ink = paletteColor(min(3, floor(constrain(relief, 0, 1) * 4)));
    else if (lightColor == 2) ink = sampled;
    float radius = max(.45, min(spacing, stepY) * emitterSize * (.55 + relief * depth * .75));
    if (depth > 0 && fieldYield > 0) {
      g.noStroke(); g.fill(0, 0, 0, 96); g.ellipse(x - slopeX * spacing * depth, y - slopeY * stepY * depth, radius * 2.6, radius * 2.6);
    }
    drawSignalReliefBody(g, x, y, radius, body, ink, strength, afterglow);
  }
  g.endDraw(); return g.get();
}

int almostAliveMix(int first, int second, float amount) {
  return color(
    lerp(red(first), red(second), amount),
    lerp(green(first), green(second), amount),
    lerp(blue(first), blue(second), amount)
  );
}

int almostAliveColor(int sampled, int column, int row, int colorLife, int world, float mischief, int seed) {
  int family = min(3, floor(signalReliefHash(seed, column, row, 71) * 4));
  int ink;
  if (colorLife == 0) ink = world == 0 ? color(35, 32, 34) : color(238, 235, 224);
  else if (colorLife == 1) ink = almostAliveMix(paletteColor(family), color(246, 239, 230), .48);
  else if (colorLife == 2) ink = paletteColor(family);
  else ink = sampled;
  int visitorIndex = (family + 1 + floor(signalReliefHash(seed, column, row, 73) * 3)) % 4;
  ink = almostAliveMix(ink, paletteColor(visitorIndex), mischief * .62);
  if (signalReliefHash(seed, column, row, 79) < mischief * .42) ink = color(green(ink), blue(ink), red(ink));
  return ink;
}

PImage almostAlive(PImage input, JSONObject effect, JSONObject p, float phase) {
  input.loadPixels();
  int columns = max(16, round(p.getFloat("evidenceScale", 48)));
  float spacing = input.width / (float)columns;
  int rows = max(1, round(input.height / spacing));
  float stepY = input.height / (float)rows;
  int signal = constrain(round(p.getFloat("lifeSignal", 2)), 0, 4);
  float gate = p.getFloat("recognition", .34), air = p.getFloat("breathingRoom", .46);
  int body = constrain(round(p.getFloat("markBody", 1)), 0, 3);
  float bodySize = p.getFloat("bodySize", .72), lifeSigns = p.getFloat("lifeSigns", .42);
  int reach = constrain(round(p.getFloat("webReach", 2)), 1, 4);
  int world = constrain(round(p.getFloat("world", 1)), 0, 1);
  int colorLife = constrain(round(p.getFloat("colorLife", 2)), 0, 3);
  float mischief = p.getFloat("colorMischief", .32), restlessness = p.getFloat("restlessness", .14);
  JSONObject where = effect.hasKey("where") ? effect.getJSONObject("where") : new JSONObject();
  int seed = renderSeed + where.getInt("seed", 0) * 23 + 71993;
  int count = columns * rows;
  boolean[] alive = new boolean[count];
  float[] xs = new float[count], ys = new float[count], strengths = new float[count], radii = new float[count], angles = new float[count];
  int[] inks = new int[count];

  for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
    int at = row * columns + column;
    float sourceX = (column + .5) * spacing, sourceY = (row + .5) * stepY;
    float raw = signalReliefEvidence(input, sourceX, sourceY, column, row, signal, seed, spacing, stepY);
    float strength = constrain((raw - gate) / max(.001, 1 - gate), 0, 1);
    if (strength <= .015 || signalReliefHash(seed, column, row, 41) > strength * (1 - air * .88)) continue;
    float orbit = phase + signalReliefHash(seed, column, row, 43) * TWO_PI;
    float travel = min(spacing, stepY) * restlessness * (1.4 + signalReliefHash(seed, column, row, 47) * 2.4);
    alive[at] = true; strengths[at] = strength;
    xs[at] = sourceX + cos(orbit) * travel;
    ys[at] = sourceY + sin(orbit * (1 + signalReliefHash(seed, column, row, 53) * .35)) * travel;
    radii[at] = max(.55, min(spacing, stepY) * bodySize * (.18 + strength * .34));
    angles[at] = signalReliefHash(seed, column, row, 61) * TWO_PI + sin(phase + orbit) * restlessness;
    inks[at] = almostAliveColor(signalReliefPixel(input, sourceX, sourceY), column, row, colorLife, world, mischief, seed);
  }

  PGraphics g = createGraphics(input.width, input.height, P2D);
  g.beginDraw(); g.smooth(4); g.background(world == 0 ? color(242, 239, 232) : color(8, 9, 13)); g.strokeCap(ROUND);
  for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
    int at = row * columns + column;
    if (!alive[at]) continue;
    for (int dy = -reach; dy <= 0; dy++) for (int dx = -reach; dx <= reach; dx++) {
      if (dy == 0 && dx >= 0) continue;
      int otherColumn = column + dx, otherRow = row + dy;
      if (otherColumn < 0 || otherColumn >= columns || otherRow < 0 || otherRow >= rows) continue;
      int other = otherRow * columns + otherColumn;
      if (!alive[other]) continue;
      float distance = sqrt(dx * dx + dy * dy), willingness = lifeSigns * (1 - distance / (reach + 1.0));
      if (signalReliefHash(seed, column + otherColumn, row + otherRow, 89 + dx * 7 + dy * 13) > willingness) continue;
      float alpha = constrain(min(strengths[at], strengths[other]) * (.16 + lifeSigns * .48), 0, 1);
      g.noFill(); g.stroke(red(inks[at]), green(inks[at]), blue(inks[at]), alpha * 255);
      g.strokeWeight(max(.45, min(radii[at], radii[other]) * .28));
      float bend = sin(angles[at] - angles[other]) * spacing * (.08 + restlessness * .4);
      g.beginShape(); g.vertex(xs[at], ys[at]); g.quadraticVertex((xs[at] + xs[other]) * .5 + bend, (ys[at] + ys[other]) * .5 - bend, xs[other], ys[other]); g.endShape();
    }
  }
  for (int row = 0; row < rows; row++) for (int column = 0; column < columns; column++) {
    int at = row * columns + column;
    if (!alive[at]) continue;
    float alpha = constrain(.28 + strengths[at] * .72, 0, 1), radius = radii[at], angle = angles[at];
    g.fill(red(inks[at]), green(inks[at]), blue(inks[at]), alpha * 255);
    g.stroke(red(inks[at]), green(inks[at]), blue(inks[at]), alpha * 255); g.strokeWeight(max(.55, radius * .28));
    if (body == 0) { g.noStroke(); g.ellipse(xs[at], ys[at], radius * 1.44, radius * 1.44); }
    else if (body == 1) g.line(xs[at] - cos(angle) * radius * 1.7, ys[at] - sin(angle) * radius * 1.7, xs[at] + cos(angle) * radius * 1.7, ys[at] + sin(angle) * radius * 1.7);
    else if (body == 2) { g.noStroke(); g.pushMatrix(); g.translate(xs[at], ys[at]); g.rotate(angle * .18); g.rect(-radius, -radius * .72, radius * 2, radius * 1.44); g.popMatrix(); }
    else {
      g.line(xs[at] - cos(angle) * radius * 1.5, ys[at] - sin(angle) * radius * 1.5, xs[at] + cos(angle) * radius * 1.5, ys[at] + sin(angle) * radius * 1.5);
      g.line(xs[at] - cos(angle + 1.7) * radius, ys[at] - sin(angle + 1.7) * radius, xs[at] + cos(angle + 1.7) * radius, ys[at] + sin(angle + 1.7) * radius);
    }
  }
  g.endDraw(); return g.get();
}

PImage resolutionQuilt(PImage input, JSONObject p) {
  float minChunk = max(4, p.getFloat("minChunk", 18));
  float maxChunk = max(minChunk, p.getFloat("maxChunk", 180));
  float drop = p.getFloat("resolutionDrop", .64), softness = p.getFloat("softness", .32);
  float displacement = p.getFloat("displacement", .18), vacancy = p.getFloat("vacancy", .08);
  PGraphics g = createGraphics(input.width, input.height, P2D); g.beginDraw(); g.noSmooth(); g.image(input,0,0);
  for (float y=0; y<input.height;) {
    float rh = min(input.height-y, random(minChunk,maxChunk));
    for (float x=0; x<input.width;) {
      float rw = min(input.width-x, random(minChunk,maxChunk));
      if (random(1) < vacancy) {
        g.noStroke(); g.fill(colorMode.equals("palette") ? paletteColor(3) : color(0)); g.rect(x,y,rw,rh);
      } else {
        int level = max(1, int(pow(2, floor(random(1 + drop*5)))));
        PImage chunk = input.get(int(x),int(y),max(1,int(rw)),max(1,int(rh)));
        chunk.resize(max(1,int(rw/level)),max(1,int(rh/level)));
        if (softness > random(1)) chunk.filter(BLUR, max(.5, softness*3));
        float travel = min(input.width,input.height)*displacement;
        g.image(chunk, x+random(-travel,travel), y+random(-travel,travel), rw, rh);
      }
      x += rw;
    }
    y += rh;
  }
  g.endDraw(); return g.get();
}

PImage shardField(PImage input, JSONObject p) {
  int pieces = max(1,p.getInt("pieces",34));
  float minSpan=p.getFloat("minSpan",.04), maxSpan=max(minSpan,p.getFloat("maxSpan",.28));
  float travel=p.getFloat("travel",.24), rotation=p.getFloat("rotation",.12);
  float repetition=p.getFloat("repetition",.22), absence=p.getFloat("absence",.12);
  PGraphics g=createGraphics(input.width,input.height,P2D); g.beginDraw(); g.image(input,0,0);
  for (int i=0;i<pieces;i++) {
    float rw=input.width*random(minSpan,maxSpan), rh=input.height*random(minSpan,maxSpan);
    float sx=random(max(1,input.width-rw)), sy=random(max(1,input.height-rh));
    if (random(1)<absence) {
      g.noStroke(); g.fill(colorMode.equals("palette")?paletteColor(3):color(0)); g.rect(sx,sy,rw,rh); continue;
    }
    int copies=random(1)<repetition?2+int(random(3)):1;
    for (int copy=0;copy<copies;copy++) {
      float dx=random(-input.width,input.width)*travel, dy=random(-input.height,input.height)*travel;
      g.pushMatrix(); g.translate(sx+dx+rw*.5,sy+dy+rh*.5); g.rotate(random(-PI,PI)*rotation);
      g.image(input,-rw*.5,-rh*.5,rw,rh,int(sx),int(sy),min(input.width,int(sx+rw)),min(input.height,int(sy+rh))); g.popMatrix();
    }
  }
  g.endDraw(); return g.get();
}

PImage cutRepeat(PImage input, JSONObject p) {
  int selector=p.getInt("selector",3), cuts=p.getInt("cuts",26), repetitions=max(1,p.getInt("repetition",4));
  float span=p.getFloat("span",.12), stretch=p.getFloat("stretch",.38);
  float drift=p.getFloat("drift",.16), absence=p.getFloat("absence",.14);
  PGraphics g=createGraphics(input.width,input.height,P2D); g.beginDraw(); g.image(input,0,0); input.loadPixels();
  for (int i=0;i<cuts;i++) {
    boolean vertical=random(1)>.5;
    float rw=vertical?max(2,input.width*span*random(.3,1.3)):input.width;
    float rh=vertical?input.height:max(2,input.height*span*random(.3,1.3));
    float sx=random(max(1,input.width-rw)), sy=random(max(1,input.height-rh));
    int sample=input.pixels[constrain(int(sy+rh*.5),0,input.height-1)*input.width+constrain(int(sx+rw*.5),0,input.width-1)];
    float light=brightness(sample)/255.0;
    boolean eligible=selector==3||(selector==0&&light>.58)||(selector==1&&light<.42)||(selector==2&&abs(red(sample)-blue(sample))+abs(green(sample)-blue(sample))>72);
    if (!eligible) continue;
    if (random(1)<absence) {
      g.noStroke(); g.fill(colorMode.equals("palette")?paletteColor(3):color(0)); g.rect(sx,sy,rw,rh); continue;
    }
    float stretchFactor=1+random(-.5,1.5)*stretch*3;
    for (int repeat=0;repeat<repetitions;repeat++) {
      float dx=vertical?repeat*input.width*drift/repetitions:0, dy=vertical?0:repeat*input.height*drift/repetitions;
      g.tint(255,255*(.42+.58*(1-repeat/float(repetitions))));
      g.image(input,sx+dx,sy+dy,vertical?rw*stretchFactor:rw,vertical?rh:rh*stretchFactor,int(sx),int(sy),min(input.width,int(sx+rw)),min(input.height,int(sy+rh)));
    }
  }
  g.noTint(); g.endDraw(); return g.get();
}

PImage fittedLayer(PImage image) {
  PGraphics g=createGraphics(targetWidth,targetHeight,P2D); g.beginDraw(); g.clear();
  float scale=max(targetWidth/float(image.width),targetHeight/float(image.height));
  float dw=image.width*scale, dh=image.height*scale;
  g.image(image,(targetWidth-dw)*.5,(targetHeight-dh)*.5,dw,dh); g.endDraw(); return g.get();
}

PImage maskLayer(PImage image, JSONObject layer) {
  String mode=layer.getString("maskMode","whole"); if (mode.equals("whole")) return image;
  int scale=max(2,layer.getInt("maskScale",48)), seed=layer.getInt("seed",renderSeed);
  image.loadPixels(); PImage mask=createImage(image.width,image.height,ARGB); mask.loadPixels(); randomSeed(seed);
  for (int y=0;y<image.height;y++) for (int x=0;x<image.width;x++) {
    int at=y*image.width+x, c=image.pixels[at]; float light=brightness(c)/255.0;
    float prior=x>0?brightness(image.pixels[at-1])/255.0:light;
    boolean visible=mode.equals("checker")?((x/scale+y/scale)%2==0):
      mode.equals("stripes")?(x%(scale*2)<scale):
      mode.equals("blocks")?(noise(x/float(scale),y/float(scale),seed*.001)>.48):
      mode.equals("light")?(light>.56):mode.equals("dark")?(light<.44):abs(light-prior)>.1;
    mask.pixels[at]=color(255,visible?255:0);
  }
  mask.updatePixels(); image.mask(mask); return image;
}

int layerBlendMode(String mode) {
  if (mode.equals("difference")) return DIFFERENCE;
  if (mode.equals("overlay")) return OVERLAY;
  if (mode.equals("screen")) return SCREEN;
  if (mode.equals("multiply")) return MULTIPLY;
  if (mode.equals("lighten")) return LIGHTEST;
  if (mode.equals("darken")) return DARKEST;
  return BLEND;
}

PImage hardMix(PImage base,PImage layer,float opacity) {
  PImage out=base.get(); out.loadPixels(); layer.loadPixels();
  for (int i=0;i<out.pixels.length;i++) {
    float a=alpha(layer.pixels[i])/255.0*opacity; if (a<=0) continue;
    int br=out.pixels[i], lr=layer.pixels[i];
    float r=red(br)+2*red(lr)>=383?255:0, g=green(br)+2*green(lr)>=383?255:0, b=blue(br)+2*blue(lr)>=383?255:0;
    out.pixels[i]=color(lerp(red(br),r,a),lerp(green(br),g,a),lerp(blue(br),b,a));
  }
  out.updatePixels(); return out;
}

PImage compositeLayersAt(PImage base, String joinAfter) {
  PImage current=base;
  for (int i=0;i<layers.size();i++) {
    JSONObject layer=layers.getJSONObject(i); if (!layer.getBoolean("enabled",true)) continue;
    String join = layer.getString("joinAfter", "");
    boolean valid = false;
    for (int j=0;j<effects.size();j++) { JSONObject e=effects.getJSONObject(j); if (e.getString("id").equals(join) && e.getString("materialId", "").equals("")) valid=true; }
    if (!valid) join="";
    if (!join.equals(joinAfter)) continue;
    PImage raw=loadImage(layer.getString("filePath")); if (raw==null) continue;
    PImage prepared=maskLayer(fittedLayer(raw),layer);
    prepared=renderChain(prepared,materialPhase,layer.getString("id"));
    float opacity=constrain(layer.getFloat("opacity",1),0,1); String mode=layer.getString("blendMode","normal");
    if (mode.equals("hard-mix")) { current=hardMix(current,prepared,opacity); continue; }
    PGraphics g=createGraphics(targetWidth,targetHeight,P2D); g.beginDraw(); g.image(current,0,0);
    g.blendMode(layerBlendMode(mode)); g.tint(255,opacity*255); g.image(prepared,0,0); g.noTint(); g.blendMode(BLEND); g.endDraw(); current=g.get();
  }
  return current;
}

PImage blendSource(PImage processed,PImage source,float presence) {
  processed.loadPixels(); source.loadPixels(); PImage out=processed.get(); out.loadPixels();
  float mix=constrain(presence,0,1);
  for (int i=0;i<out.pixels.length;i++) {
    int a=processed.pixels[i], b=source.pixels[i];
    out.pixels[i]=color(lerp(red(a),red(b),mix),lerp(green(a),green(b),mix),lerp(blue(a),blue(b),mix));
  }
  out.updatePixels(); return out;
}

// Fixed indexed-color maps; only palette values rotate with time.
double cycleMod(double n, double d) { return ((n % d) + d) % d; }
double cycleDistance(double[] a, double[] b) { return Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2)+Math.pow(a[2]-b[2],2); }
double cycleLuma(double[] c) { return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
double[][] imageCyclePalette(PImage image, int count) {
  image.loadPixels(); double[] weights=new double[512];double[][] sums=new double[512][3];
  for(int sy=0;sy<48;sy++)for(int sx=0;sx<48;sx++){
    int x=Math.min(image.width-1,(int)Math.floor((sx+.5)*image.width/48)),y=Math.min(image.height-1,(int)Math.floor((sy+.5)*image.height/48));
    int c=image.pixels[y*image.width+x];if((c>>>24)==0)continue;int r=(c>>16)&255,g=(c>>8)&255,b=c&255,bin=(r>>5)*64+(g>>5)*8+(b>>5);
    weights[bin]++;sums[bin][0]+=r;sums[bin][1]+=g;sums[bin][2]+=b;
  }
  ArrayList<double[]> bins=new ArrayList<double[]>();ArrayList<Double> mass=new ArrayList<Double>();
  for(int i=0;i<512;i++)if(weights[i]>0){bins.add(new double[]{sums[i][0]/weights[i],sums[i][1]/weights[i],sums[i][2]/weights[i]});mass.add(weights[i]);}
  double[][] centers=new double[count][3];if(bins.size()==0)return centers;
  int first=0;for(int i=1;i<bins.size();i++)if(mass.get(i)>mass.get(first))first=i;centers[0]=bins.get(first).clone();
  for(int k=1;k<count;k++){int best=0;double score=-1;for(int i=0;i<bins.size();i++){double d=Double.POSITIVE_INFINITY;for(int j=0;j<k;j++)d=Math.min(d,cycleDistance(centers[j],bins.get(i)));d*=Math.sqrt(mass.get(i));if(d>score){score=d;best=i;}}centers[k]=bins.get(best).clone();}
  for(int pass=0;pass<4;pass++){
    double[][] totals=new double[count][4];
    for(int i=0;i<bins.size();i++){int best=0;double d=Double.POSITIVE_INFINITY;for(int j=0;j<count;j++){double next=cycleDistance(bins.get(i),centers[j]);if(next<d){best=j;d=next;}}for(int c=0;c<3;c++)totals[best][c]+=bins.get(i)[c]*mass.get(i);totals[best][3]+=mass.get(i);}
    for(int j=0;j<count;j++)if(totals[j][3]>0)for(int c=0;c<3;c++)centers[j][c]=totals[j][c]/totals[j][3];
  }
  for(int j=0;j<count;j++)for(int c=0;c<3;c++)centers[j][c]=Math.round(centers[j][c]);
  for(int i=1;i<count;i++){double[] held=centers[i];int j=i-1;while(j>=0 && cyclePaletteAfter(centers[j],held)){centers[j+1]=centers[j];j--;}centers[j+1]=held;}
  return centers;
}
boolean cyclePaletteAfter(double[] a,double[] b){double d=cycleLuma(a)-cycleLuma(b);if(d!=0)return d>0;for(int c=0;c<3;c++)if(a[c]!=b[c])return a[c]>b[c];return false;}
double[][] studioCyclePalette(int count){
  int size=palette.size();double[][] colors=new double[count][3];
  for(int i=0;i<count;i++){double t=i*size/(double)count;int k=(int)Math.floor(t);double f=t-k;int a=palette.getInt(k%size),b=palette.getInt((k+1)%size);for(int c=0;c<3;c++){int shift=16-c*8;colors[i][c]=Math.round(((a>>shift)&255)*(1-f)+((b>>shift)&255)*f);}}
  return colors;
}
PImage paletteCycle(PImage input,JSONObject p,float phase){
  PImage out=input.get();input.loadPixels();out.loadPixels();int count=constrain(round(p.getFloat("colors",16)),2,32);
  double amount=p.getFloat("amount",1);if(amount<=0)return out;
  double[][] colors=p.getFloat("paletteSource",0)>=.5?studioCyclePalette(count):imageCyclePalette(input,count);
  if(p.getFloat("paletteSource",0)>=1.5){for(int i=0;i<count;i++){int packed=(int)p.getFloat("regionColor"+i,0);for(int ch=0;ch<3;ch++)colors[i][ch]=(packed>>(16-ch*8))&255;}}
  int first=constrain(round(p.getFloat("firstColor",1))-1,0,count-1),last=constrain(round(p.getFloat("lastColor",32))-1,first,count-1),span=last-first+1;
  double cycle=cycleMod(phase/(double)TWO_PI*Math.round(p.getFloat("cycles",1))*(Math.round(p.getFloat("speed",1)*8)/8.0)+p.getFloat("offset",0),1)*span;
  int map=round(p.getFloat("mapping",0));double angle=p.getFloat("angle",0)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),bands=p.getFloat("bands",3);
  double cx=p.getFloat("centerX",.5),cy=p.getFloat("centerY",.5);boolean blend=p.getFloat("blend",1)>=.5;
  double[][] moving=new double[count][3];
  for(int i=0;i<count;i++){double t=cycleMod(i-first+cycle,span);int a=((int)Math.floor(t+1e-9))%span,b=(a+1)%span;double f=blend?Math.max(0,t-Math.floor(t+1e-9)):0;for(int c=0;c<3;c++)moving[i][c]=colors[first+a][c]*(1-f)+colors[first+b][c]*f;}
  int[] lookup=new int[32768];java.util.Arrays.fill(lookup,-1);
  for(int y=0;y<input.height;y++)for(int x=0;x<input.width;x++){
    int at=y*input.width+x,c=input.pixels[at];if((c>>>24)==0)continue;int r=(c>>16)&255,g=(c>>8)&255,b=c&255,index=0;
    if(map==0){int bin=(r>>3)*1024+(g>>3)*32+(b>>3);index=lookup[bin];if(index<0){double[] rgb={(r&248)+3.5,(g&248)+3.5,(b&248)+3.5};double best=Double.POSITIVE_INFINITY;index=0;for(int j=0;j<count;j++){double d=cycleDistance(rgb,colors[j]);if(d<best){best=d;index=j;}}lookup[bin]=index;}}
    else {double t=0;if(map==1)t=(.2126*r+.7152*g+.0722*b)/255*bands;else if(map==2)t=((x+.5)/input.width*cs+(y+.5)/input.height*sn)*bands;else t=(Math.atan2(((y+.5)/input.height-cy)*input.height,((x+.5)/input.width-cx)*input.width)/(Math.PI*2)+.5)*Math.round(bands);index=Math.min(count-1,(int)Math.floor(cycleMod(t,1)*count+1e-9));}
    if(index<first||index>last)continue;
    int nr=(int)Math.round(r*(1-amount)+moving[index][0]*amount),ng=(int)Math.round(g*(1-amount)+moving[index][1]*amount),nb=(int)Math.round(b*(1-amount)+moving[index][2]*amount);
    out.pixels[at]=(c&0xff000000)|(constrain(nr,0,255)<<16)|(constrain(ng,0,255)<<8)|constrain(nb,0,255);
  }
  out.updatePixels();return out;
}

PImage surfaceMotion(PImage input, JSONObject effect, JSONObject p, float phase) {
 input.loadPixels();int w=input.width,h=input.height;PImage warped=input.get();warped.loadPixels();
 double dim=Math.min(w,h),t=phase*(Math.round(p.getFloat("speed",1)*8)/8.0)*Math.round(p.getFloat("cycles",1));
 double angle=p.getFloat("angle",90)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),distance=dim*.22*p.getFloat("motion",.25),scale=p.getFloat("scale",6),frequency=scale*Math.PI*2;
 int behavior=round(p.getFloat("behavior",0)),material=round(p.getFloat("material",1)),ground=(int)p.getFloat("groundColor",0x08090d),ink=(int)p.getFloat("inkColor",0xf3e8ce),seed=effect.getJSONObject("where").getInt("seed",0);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  double dx=0,dy=0;boolean valid=true;
  if(behavior==0){double v=(-x*sn+y*cs)/dim,wave=Math.sin(v*frequency-t);dx=cs*distance*wave;dy=sn*distance*wave;}
  else if(behavior==1){double rx=x-w/2.0,ry=y-h/2.0,len=Math.hypot(rx,ry),wave=Math.sin(len/dim*frequency-t)*distance;dx=rx/Math.max(1,len)*wave;dy=ry/Math.max(1,len)*wave;}
  else {double size=dim/Math.max(1,scale),cx=Math.floor(x/size),cy=Math.floor(y/size),a=((cx*37+cy*73+seed%997)%127)/127*Math.PI*2;dx=distance*(Math.cos(t)-1)*Math.cos(a);dy=distance*Math.sin(t)*Math.sin(a);valid=Math.floor((x-dx)/size)==cx&&Math.floor((y-dy)/size)==cy;}
  int sx=constrain((int)Math.round(x-dx),0,w-1),sy=constrain((int)Math.round(y-dy),0,h-1),at=y*w+x;
  warped.pixels[at]=valid?input.pixels[sy*w+sx]:(input.pixels[at]&0xff000000)|(ground&0xffffff);
 }
 warped.updatePixels();PImage changed=warped;
 float mix=p.getFloat("materialMix",.7);
 if(material>0 && mix>0){
  PGraphics g=createGraphics(w,h,JAVA2D);g.beginDraw();g.background(ground|0xff000000);g.noStroke();
  double cell=Math.max(1,p.getFloat("cellSize",8)*dim/600),gap=p.getFloat("gap",.12),size=cell*(1-gap);boolean two=p.getFloat("colorMode",0)>=.5;
  String alphabet="";if(effect.hasKey("characterField")){JSONArray a=effect.getJSONObject("characterField").getJSONArray("glyphs");for(int i=0;i<a.size();i++){String word=a.getString(i);for(int j=0;j<word.length();j++){char c=word.charAt(j);if(c>=32&&c<=126)alphabet+=c;}}}else alphabet=".:/|+";
  g.textFont(createFont("SourceCodePro-Semibold.ttf",(float)(cell*1.3),true));g.textAlign(CENTER,CENTER);
  for(double y=0;y<h;y+=cell)for(double x=0;x<w;x+=cell){int px=Math.min(w-1,(int)Math.floor(x+cell/2)),py=Math.min(h-1,(int)Math.floor(y+cell/2)),c=warped.pixels[py*w+px],r=(c>>16)&255,gr=(c>>8)&255,b=c&255;double light=(.2126*r+.7152*gr+.0722*b)/255;float alpha=(c>>>24);
   g.fill((two?ink:c)|0xff000000,(float)(alpha*(two&&material==1?light:1)));
   if(material==1)g.rect((float)(x+(cell-size)/2),(float)(y+(cell-size)/2),(float)size,(float)size);
   else if(alphabet.length()>0 && light>p.getFloat("cutoff",.025)){String glyph=alphabet.substring(Math.min(alphabet.length()-1,(int)Math.floor(light*alphabet.length())),Math.min(alphabet.length()-1,(int)Math.floor(light*alphabet.length()))+1);g.pushMatrix();g.translate((float)(x+cell/2),(float)(y+cell/2));g.scale((float)(1-gap));g.text(glyph,0,0);g.popMatrix();}
  }
  g.endDraw();PImage cells=g.get();cells.loadPixels();changed=warped.get();changed.loadPixels();
  for(int i=0;i<w*h;i++){int c=0;for(int shift=0;shift<=24;shift+=8)c|=((int)Math.round(((warped.pixels[i]>>>shift)&255)*(1-mix)+((cells.pixels[i]>>>shift)&255)*mix))<<shift;changed.pixels[i]=c;}
  changed.updatePixels();g.dispose();
 }
 changed.loadPixels();PImage out=input.get();out.loadPixels();double amount=p.getFloat("amount",1),cutoff=p.getFloat("cutoff",.025);boolean keep=p.getFloat("keepShape",1)>=.5;
 for(int i=0;i<w*h;i++){int a=input.pixels[i],b=changed.pixels[i],c=0;double light=Math.max((a>>16)&255,Math.max((a>>8)&255,a&255))/255.0,shape=keep?Math.max(0,Math.min(1,(light-cutoff)/.04))*(a>>>24)/255.0:1,m=amount*shape;for(int shift=0;shift<=24;shift+=8)c|=((int)Math.round(((a>>>shift)&255)*(1-m)+((b>>>shift)&255)*m))<<shift;out.pixels[i]=c;}
 out.updatePixels();return out;
}
