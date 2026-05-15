# ♟️ Interactive Chessboard Patterns Explorer

An advanced web-based visualization engine inspired by the Numberphile exploration of **Amazing Chessboard Patterns**, featuring Jonas Karlsson's simulations of emergent complexity on an infinite, spirally numbered grid.

---

## 🌌 Vision

This project aims to recreate the stunning self-organizing fractal-like structures that emerge when simple chess-based rules are applied to a mathematical spiral. By placing pieces on the lowest available square that is not under attack, we witness the birth of crystal lattices, starship-like peninsulas, and Mandelbrot-esque complexity.

**Goal**: A high-performance, infinite zoomable canvas allowing real-time experimentation with multi-player piece placement and "Fairy Chess" mechanics.

---

## 🕹️ Core Simulation Mechanics

### 1. The Spiral Grid
The simulation operates on an infinite grid where each square $(x, y)$ is assigned a unique integer $n$ following a **Ulam-like square spiral** starting from the center ($n=0$ or $n=1$).
- **Clockwise/Counter-clockwise** rotation options.
- Efficient $O(1)$ conversion between Cartesian $(x, y)$ and Spiral $n$.

### 2. The Placement Rule (Greedy Emergence)
The simulation follows a cyclical turn-based system for $K$ players (colors):
1. For the current player, find the **smallest integer $n$** that satisfies:
   - Square $n$ is currently **unoccupied**.
   - Square $n$ is **not under attack** by any piece belonging to an **opposing color**.
2. Place the player's designated piece on square $n$.
3. Advance to the next player in the cycle.

---

## 🛡️ The Arsenal: Piece Movement Library

The engine supports a wide array of **Fairy Chess** pieces, defined by their $(a, b)$ leap vectors. A piece at $(x, y)$ attacks all squares $(x \pm a, y \pm b)$ and $(x \pm b, y \pm a)$.

| Piece Name | Leap Vector $(a, b)$ | Description |
| :--- | :--- | :--- |
| **Knight** | $(2, 1)$ | The classic L-jump. |
| **Alfil / Elephant** | $(2, 2)$ | A two-square diagonal leap. |
| **Dabbaba** | $(2, 0)$ | A two-square orthogonal leap. |
| **Zebra** | $(3, 2)$ | A longer, sharper L-jump. |
| **Antelope** | $(4, 3)$ | A very long leap $(5^2 + 2^2 \text{ style})$. |
| **Ferz** | $(1, 1)$ | A one-square diagonal leap. |
| **Wazir** | $(1, 0)$ | A one-square orthogonal leap. |
| **Camel** | $(3, 1)$ | A long L-jump. |
| **Custom Leaper** | $(a, b)$ | User-defined $(a, b)$ parameters. |

---

## 🎨 Gallery of Emergence: Presets

Pre-configured scenarios from the original research to showcase specific mathematical phenomena:

- **The Knight Series**: 2, 3, 4, and 5 Knight players (demonstrating density shifts).
- **Hybrid Dynamics**:
  - **Knight + Alfil**: Creates dense, crystalline structures.
  - **Knight + Antelope**: Produces sparse, sprawling "starship" patterns.
  - **Knight + Zebra**: High-frequency interference patterns.
- **The Fortress**: Knight + Dabbaba + Wazir (demonstrating defensive saturation).
- **Symmetry Breakers**: Vizier (Wazir) + Ferz combinations.

---

## 🛠️ Technical Architecture

### Tech Stack
- **Frontend**: React + TypeScript for a robust, type-safe UI.
- **Styling**: Vanilla CSS (Modern CSS variables + Flex/Grid).
- **Rendering**: HTML5 Canvas (2D Context) or WebGL for high-performance rendering of millions of pieces.
- **State**: Zustand for lightweight, reactive simulation state.

### Performance Strategy
- **Spatial Indexing**: Use a Hash Map or Quadtree to store piece positions for $O(1)$ or $O(\log N)$ attack lookups.
- **Web Workers**: Offload the heavy "find smallest $n$" computation to background threads to keep the UI responsive.
- **Chunked Rendering**: Only render squares within the current viewport, using a tile-based system for the infinite canvas.

---

## 🗺️ Roadmap & Milestones

### Phase 1: Foundation
- [ ] Implement `spiral.ts` (Coordinate <-> $n$ conversions).
- [ ] Core placement loop logic (The "Greedy" selector).
- [ ] Basic Canvas renderer with pan/zoom.

### Phase 2: Interactivity
- [ ] Sidebar Controls: Add/Remove players, change colors.
- [ ] Piece Library Selector: Assign $(a, b)$ vectors to players.
- [ ] Play/Pause/Step simulation controls.

### Phase 3: Polish & Visualization
- [ ] **Attack Heatmaps**: Visualize "unsafe" squares for the current player.
- [ ] High-resolution export (PNG/SVG).

---

## 📂 Project Structure

```text
knights/
├── src/
│   ├── components/
│   │   ├── Canvas/          # Rendering logic
│   │   ├── Sidebar/         # Controls & Presets
│   │   └── UI/              # Shared components
│   ├── engine/
│   │   ├── simulation.ts    # Core placement logic
│   │   ├── spiral.ts        # Math utilities
│   │   └── pieces.ts        # Piece definitions
│   ├── store/               # Zustand state management
│   └── App.tsx
├── public/                  # Assets & Favicons
├── project.md               # Architecture & Roadmap
└── package.json
```

---

## 📜 Credits & Inspiration

- **Original Concept**: [Amazing Chessboard Patterns](https://www.youtube.com/watch?v=STX77JlOjGs) by **Numberphile**.
- **Research & Simulations**: **Jonas Karlsson**.
- **Data & OEIS**: Inspired by sequences like A000196 and other spiral-based number properties.

---

## ⚖️ License
MIT License — build, share, and discover.
