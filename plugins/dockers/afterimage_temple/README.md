# Glitch Temple in Afterimage

This plugin runs Tai Mei's Glitch Temple 0.47.3 Processing renderer inside a
private Windows desktop and places its result into Krita's native document.
The full, original React Studio is hosted in a user-opened, movable, resizable,
minimizable WebView2 window. The welcome card and Tools â†’ Creative Workplaces â†’
Glitch Temple Studio open it directly for the active artwork. With no artwork,
they open the native new-canvas dialog and launch Studio only if a document is
created. A separate quick-controls dock stays available from Creative Workplaces
and Settings â†’ Dockers;
the Studio window and agent tools share the document-bound service and editable
recipe. The copied engine and Studio retain upstream attribution in
`TEMPLE-LICENSE` and `studio_web/UPSTREAM.md`. The source checkout remains read-only.
Opening Studio again for the same document restores its window; choosing it from
a different active document opens a Studio bound to that document. Neither a
passively presented agent document nor application startup opens Studio.

The dock ID is `AfterimageTempleDocker`. Plugin initialization creates the
`AfterimageTempleService` singleton even when the dock is hidden. A caller can
find it under `QCoreApplication::instance()` and invoke these methods on the
Qt application thread:

- `documentId(KisDocument*) -> QString`: stable ID for an open native document.
- `renderRecipe(documentId, QJsonObject recipe, int maxEdge) -> renderId`:
  `maxEdge > 0` renders a bounded native tiled preview; `0` renders full size.
- `renderFinished(renderId, QJsonObject result)` supplies an app-owned PNG path
  or an error. The result names the original document and dimensions.
- `applyRender(renderId)` commits a full-size result to that exact still-open
  document as one undoable paint layer, without changing active tab, layer,
  tool, or input focus. `applyFinished` returns its native layer ID or an error.
- `recipeForLayer(documentId, layerId)` retrieves the full editable recipe
  stored in the KRA image annotation after application.
- `exportLoop(documentId, recipe, format, outputPath)` renders a source
  time-score sequence with the same private engine and encodes GIF or MP4.
  Completion returns the output path, frame count, and frame rate.

`TempleToolGateway::tools()` exposes bounded catalog, recipe inspection,
render, loop export, and apply tools to the native agent bridge. Each document
operation requires the matching bound document ID. Results name app-owned
artifacts by path; image data is never placed in a textual tool result.

The renderer serializes requests through one private Processing JVM. The first
render pays the sketch compile/start cost; later requests reuse the engine.
Processing's animation thread owns a continuous request loop, rather than
returning from `draw()` between jobs. Requests and responses use separate JSON
files; responses are published by rename after rendering finishes. The owned
Windows job terminates the entire renderer process tree at shutdown. The
runtime is official Processing 4.5.6 portable under `<application>/processing`
or an explicit `AFTERIMAGE_TEMPLE_PROCESSING_ROOT` path. Loop export requires
FFmpeg under `<application>/ffmpeg/bin/ffmpeg.exe` or an explicit
`AFTERIMAGE_TEMPLE_FFMPEG` path. The Studio requires the official WebView2
Evergreen runtime and the bundled SDK 1.0.4191.47 loader. Processing, FFmpeg,
the Studio web assets, and their upstream notices must be packaged with the app.

The full Studio retains the original authored UI: ordered, repeated and bypassed
Glitch processes and their specialist editors; KONE, Knot, Figure, poses, groups,
and multi-form composition; source images and material layers; OKLCH palettes,
presets, role locks, and palette libraries; source time/material score editors;
held Canvas2D preview, feedback, galleries, named states, and process recipes.
The native bridge implements the source command set for loading/persisting a
bound draft, material import and preview, PNG/GIF/MP4 render, held-preview
preservation, ASCII capture, feedback, palette library import/export, gallery
selection/order, saved states/process recipes, code reading, file dialogs, and
the source agent-command inbox. Artists can also import a folder of their own
emoji images into a content-addressed app-owned library; the import runs off
the UI thread and preserves each original, rendering PNG, thumbnail, and alias.
The added `render_apply` action deliberately
renders the exact recipe at native canvas size and adds one undoable layer to
the originally bound document. Output-size controls affect exports; they are
not silently treated as canvas dimensions. Material files live in an app-owned
vault. Applied layers embed material bytes in KRA annotations, so their recipes
survive moving and reopening the KRA without the picked file.

There are real limits. The original browser Canvas2D LivePreview and the
Processing export engine are separate implementations; their appearance can
differ. Tai Mei's original 4,237-item personal emoji corpus is not bundled;
a fresh vault begins with the built-ins until the artist imports their own
images. The curated gallery likewise
starts empty until the artist chooses a folder or creates outputs. Specialist
editors and every command branch have not been individually exercised in the
hosted WebView, so complete behavioral parity is not claimed. The older compact
Qt dock has a useful subset of controls, while the full Studio is the primary
artist authoring surface.

The earlier isolated renderer, bridge and host fixtures have been removed. Their passing results did not establish the ordinary live-canvas workflow: Frank encountered repeated capture timeouts when adding effects to a new document with an image layer. That issue is unresolved, and Temple implementation is paused while the integration design is reconsidered. Verify future changes through complete creative work in Afterimage itself.
