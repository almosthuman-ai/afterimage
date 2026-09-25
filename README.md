# Afterimage

Afterimage is a free, open-source Windows art application built on Krita, with workplaces for pixel art, comics, Glitch Temple compositions and artwork made with an AI collaborator.

Paint and edit directly, ask the collaborator to work on your artwork, or do both. The collaborator uses native document operations and artwork renders, so it can keep working while you type elsewhere or minimize the app. Layers, selections, undo and saving belong to Krita's native document engine.

This is an active development build. The integrated Windows application works locally; a public release is not yet available.

## Creative workplaces

- **Pixel art:** transparent sprites, palettes, palette reduction and dithering, integer zoom, and original-size or nearest-neighbor scaled PNG export.
- **Comics:** editable panel and lettering layers, ordered books of KRA pages, and background multi-page PDF export.
- **Glitch Temple:** Tai Mei's original Studio UI in a native window, with forms, effect chains, curves, materials, an importable symbol library and animated exports. Apply a composition as an undoable artwork layer.
- **AI collaboration:** ChatGPT sign-in through the official Codex app server, conversations and steering, explicit model and reasoning choices, image generation and crop edits. Google and OpenAI API image generation are separate billing routes with their own credentials. Local image models are planned.

## Build and run

The Windows build uses an isolated toolchain and dependency prefix under ignored `.afterimage/`. The [module map](module-manifest.md) has setup commands; the [build script](afterimage/scripts/build-windows.py) and [development runtime notes](afterimage/THIRD-PARTY-dev-runtime.md) cover the local install. See the [Windows packaging guide](afterimage/PACKAGING.md) for the portable preview.

Implementation details and current limitations live with their owners:

- [AI collaboration and image providers](plugins/dockers/afterimage/README.md)
- [Pixel art and comics](plugins/dockers/afterimage_artist/README.md)
- [Glitch Temple integration](plugins/dockers/afterimage_temple/README.md)

## Credits and license

Afterimage is an independent fork of [Krita](https://krita.org), preserving its document engine, tools, source history and attribution. Krita's [original README](afterimage/UPSTREAM-README.md) is retained, and its [user manual](https://docs.krita.org/en/user_manual.html) covers the underlying painting tools.

Glitch Temple is created by Tai Mei. Its original source and attribution are preserved in the [Studio integration](plugins/dockers/afterimage_temple/studio_web/UPSTREAM.md).

The application is licensed under the [GNU GPL version 3](COPYING). Individual components retain their compatible licenses and third-party notices.
