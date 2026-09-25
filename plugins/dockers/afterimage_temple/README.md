# Glitch Temple in Afterimage

This plugin runs Tai Mei's Glitch Temple 0.47.3 Processing renderer inside a
private Windows desktop and places its result into Krita's native document.
The copied engine and bundled assets retain their upstream attribution in
`TEMPLE-LICENSE`. The source checkout remains read-only.

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
`AFTERIMAGE_TEMPLE_FFMPEG` path. Both runtimes must be packaged with the app.

Current native authoring covers ordered, repeatable, bypassable process chains
from the 34 source process definitions; their numeric/choice controls; where
territories and target memory; repeatable ordered FORM parts with KONE, Knot,
and Figure selection; source-derived basic FORM controls; 51 source palette
presets, role locks and OKLCH relationship generation; imported image
materials with blend, mask, presence, source fitting, source ground, and join
position; point-and-curve time-score authoring for FORM and effect parameters;
frame count, frame rate, and native GIF/MP4 loop export; editable full recipe
JSON; bounded preview, full render, undoable apply, and recipe provenance.
Picked material bytes are retained in an app-owned vault. Applied layers also
embed their material bytes in KRA annotations so the editable recipe survives
moving and reopening the KRA even if the original picked file disappears.

The copied Processing engine accepts the broader source recipe schema, so
imported recipes can render beyond the controls exposed here. Native authoring
still lacks much of the original specialized FORM composition, pose/group and
structure editors; some nested material/time, palette library/print-set, and
specialist process editors; and the original Studio's full interactions.
The native time editor exposes scalar score curves but does not reproduce
every source editor or generator. Full visual and workflow parity with the
original Studio is therefore **not** claimed. The original browser LivePreview
is a distinct Canvas2D implementation; this plugin previews with the copied
Processing engine at a bounded size, so some render differences may remain.

`tools/probe_private_processing.py` exercises the private renderer without
opening a foreground window. It rendered a source-derived 1024×1024 two-part
FORM composition plus signal echo in 0.718 s after warm startup; the exact
PNG and recipe are in ignored `.afterimage/temple-probe/` during development.
`afterimage_temple_workflow_tests` is an explicit native test target for full
render, apply, undo/redo, KRA reopen, recipe and picked-material recovery, and
four-frame GIF/MP4 export. It requires the Processing and FFmpeg paths above.
On Windows with Processing 4.5.6, FFmpeg 8.1.2, and Qt offscreen, it passed
4/4 cases in 7.563 s. Set `AFTERIMAGE_TEMPLE_PROOF_DIR` to retain the synthetic
KRA proof files after the test's temporary documents are removed.
