# Knight's Spiral

Knight's Spiral is an interactive, high-performance visualization engine designed to explore emergent mathematical patterns on an infinite grid. The project is inspired by the Numberphile exploration of chessboard patterns based on Jonas Karlsson's simulations. By placing pieces on the lowest available square that is not under attack, this simulation demonstrates how simple, deterministic rules can generate complex, fractal-like structures.

## Simulation Rules

The simulation operates on a Ulam-like square spiral grid, where each cell is mapped to a positive integer starting from the center of the coordinate system. During a turn, the simulation searches for the lowest available integer that is not currently occupied and is not under attack by any opponent. The active player then places their piece on that square, and the turn advances to the next player.

## Features and Architecture

The engine uses background Web Workers to offload heavy calculations, keeping the main thread responsive during intensive runs. A custom quadtree spatial indexing structure handles the rendering of millions of pieces, allowing smooth panning and zooming on an infinite 2D canvas at 60 frames per second. 

You can experiment with classic pieces like the Knight, Zebra, Antelope, Vazir, and Fers, or configure custom move vectors. The interface includes presets for classic scenarios like the Zebra Crossing and the Fortress, alongside real-time controls for simulation speed, player configurations, and color palettes.

## Getting Started

To run the project locally, clone the repository, install the dependencies, and start the development server.

```bash
git clone https://github.com/mutatrum/knights-spiral.git
cd knights
npm install
npm run dev
```

The development server runs locally, and you can view the application in your browser. You can build the production application with the build command:

```bash
npm run build
```

## GitHub Pages Deployment

This project includes a preconfigured GitHub Actions workflow for automatic deployment. When you push your code to the master branch, the workflow builds the application and deploys the assets to GitHub Pages. To activate this, push the repository to GitHub, open the repository settings, go to the Pages tab, and select GitHub Actions as the build and deployment source.

## Credits and Inspiration

The core concept of this project originates from the Numberphile video [Amazing Chessboard Patterns](https://www.youtube.com/watch?v=STX77JlOjGs). The mathematical research and original simulations were conducted by [Jonas Karlsson](https://jonka364.github.io/). The implementation is released under the MIT License.
