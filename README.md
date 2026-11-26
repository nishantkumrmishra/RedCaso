# RedCaso 📸

> **A blazingly fast, modern desktop photo organizer and Google Photos sync manager — heavily inspired by Google Picasa 3.**

[![Release](https://img.shields.io/badge/release-v1.5.0-blue.svg)](https://github.com/nishantkumrmishra/RedCaso/releases/tag/v1.5.0)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-red.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Overview

**RedCaso** is a high-performance local photo library organizer built for Windows. It combines the beloved simplicity, ultra-responsive scrolling, and photo-viewing experience of classic **Google Picasa 3** with a cutting-edge **Rust backend** and **Windows 11 Fluent design system**.

While modern electron apps consume gigabytes of memory, RedCaso runs at **under 50 MB of RAM** and **under 2% CPU usage**, capable of seamlessly indexing and scrolling through libraries of 100,000+ local photos.

---

## ✨ Features

### 1. Picasa-Style Fluid Photo Gallery
- **Natural Aspect Ratio Packing**: Photos retain their true proportions (portrait tall, landscape wide) with a uniform 12px gap.
- **Zero-Latency Scrolling**: Smooth virtualization recycling DOM nodes with pre-cached 256px thumbnails.
- **Floating Timeline HUD**: Floating date and folder badge dynamically updates while rapid scrolling.
- **Zero White Mats / Borders**: Pure images floating directly on the canvas with subtle drop shadows that elevate slightly on hover.

### 2. Hierarchical Directory Tree Sidebar
- **Nested Folder Tree**: Collapsible directory hierarchy matching your actual disk layout (`C:\`, `D:\`, etc.).
- **Photo Counts**: Instant photo counts per folder (e.g. `Camera (13)`, `Downloads (7)`).
- **Fast Filter Search**: Instant incremental search box to jump directly to any folder in large libraries.

### 3. Comprehensive Picasa Photo Viewer & Editor
- **Double-Click Full View**: Immersive viewer with slate backdrop and `← Back to Library` navigation.
- **Interactive Zoom & Pan**: Mouse wheel zoom up to 500% with grab-hand panning and a floating **Mini-Map Navigator** in the bottom-right corner.
- **Filmstrip Carousel**: Seamless sibling photo carousel at the top with left/right keyboard navigation.
- **Side-by-Side Comparison (A / AB)**: Split-screen mode comparing original vs. edited versions side-by-side.
- **Real-time RGB Histogram**: Live canvas-rendered Red, Green, and Blue frequency curves.
- **Common Fixes & Tuning**:
  - *I'm Feeling Lucky* (auto color, contrast, and levels)
  - *Auto Contrast* and *Auto Color*
  - *Fill Light* and *Contrast* sliders
  - *Color Temperature* and *Saturation* tuning
  - *B&W*, *Sepia*, *Warmify*, and *Cool Tint* creative effects
  - 90° lossless rotations and star/favoriting

### 4. Facial Recognition & People Clustering (New in v1.5.0)
- **Embedded Neural Face Detection**: Integrated `rustface` model detecting faces at 150+ photos/sec.
- **People View**: Automatic face thumbnail extraction, grouping, and naming.

### 5. Background Scanner & Desktop Detector Toast
- **Paced Picasa Scanner**: Scans drives (`C:`, `D:`, etc.) in the background while keeping CPU under 5%.
- **Desktop Detector Toast**: Floating secondary window on the desktop that alerts you in real time with thumbnail previews as new folders are discovered, even when the main app is minimized.

### 6. Google Photos Sync Manager
- Direct one-click folder sync toggle to back up local albums to Google Photos with progress pills.

### 7. Design Principles
- **Strict 90° Sharp Corners**: Clean rectangular corners across all cards, buttons, badges, and modals.
- **System Theme Adaptive**: Defaults to Light Mode matching Windows 11 preferences, with an instant toggle for Dark Mode.

---

## 🚀 Downloads (v1.5.0)

Pre-built binaries are available under [GitHub Releases](https://github.com/nishantkumrmishra/RedCaso/releases/tag/v1.5.0):

| Package | Format | Description |
| :--- | :--- | :--- |
| **RedCaso Portable** | `.exe` | Standalone portable executable. No installation required. |
| **RedCaso Installer** | `.msi` / `.exe` | Standard Windows setup wizard with Start Menu shortcuts. |

---

## 🛠️ Architecture

RedCaso is built on **Tauri v2** with a high-throughput hybrid pipeline:

```
[ Local Disk Drives ]
        │ (walkdir crawler)
        ▼
[ Rust Background Worker ] ──(exif + rustface)──► [ SQLite Embedded Cache ]
        │                                                     │
        ▼ (tauri IPC / asset protocol)                         ▼
[ React 19 Virtualized DOM ] ◄───────────────────────── [ Memory Index ]
```

---

## 💻 Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (1.80+)

### Setup & Run
```bash
# Clone the repository
git clone https://github.com/nishantkumrmishra/RedCaso.git
cd RedCaso

# Install dependencies
npm install

# Run development mode
npm run tauri dev

# Build production bundle
npm run tauri build
```

---

## 📄 License

MIT © [nishantkumrmishra](https://github.com/nishantkumrmishra)
