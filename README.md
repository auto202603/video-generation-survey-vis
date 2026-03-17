# Video Generation Survey — Paper Explorer

An interactive, HuggingFace-inspired web app to explore papers from the [video-generation-survey](https://github.com/auto202603/video-generation-survey) repository.

🌐 **Live Site**: https://auto202603.github.io/video-generation-survey-vis/

## Features

- **📹 4 Research Directions**: Video Generation, Editing in Diffusion, Multi-modality Generation, Virtual Human
- **🔍 Search**: Filter papers by title keyword in real-time
- **📂 Subsection filter**: Click any subsection in the left sidebar to narrow down
- **↕️ Sort**: by date (newest/oldest first) or GitHub stars
- **🔄 Auto-sync**: Data loaded from GitHub raw API, cached in localStorage for 6 hours
- **⭐ Star badges**: GitHub star counts via shields.io, linked to repos
- **📋 Abstract toggle**: Expandable abstract area per card

## Data Sources

Papers are parsed from these MD files in the survey repo:
- `video-generation.md`
- `Editing-in-Diffusion.md`
- `Multi-modality Generation.md`
- `virtual_human.md`

## Tech Stack

- Pure static HTML + CSS + JavaScript (no framework, no CDN dependencies)
- Data fetched client-side via `fetch()` from GitHub raw content API
- Deployed via GitHub Pages (`gh-pages` branch)

## Local Development

```bash
# Serve locally
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Updating Content

Click the **🔄 Sync from GitHub** button in the top-right to force-refresh data from the source repo.
