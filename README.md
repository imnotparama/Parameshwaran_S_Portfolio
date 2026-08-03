# Parameshwaran S Portfolio

An interactive 3D PCB portfolio showcasing ECE (Electronics and Communication Engineering) and Data Science skills. Navigate through a printed circuit board where each component represents a different aspect of my background and projects.

## Features

- **Interactive 3D PCB Board**: Explore a layered circuit board with smooth camera movement
- **Scroll-Journey Navigation**: Scroll to move the camera between key components (CPU, Projects, Skills, Experience, Contact)
- **Tiered Interactions**: 
  - In journey mode: subtle hover glow only (preserves performance)
  - In legacy mode: full tooltip, HUD, and trace speed boost on hover
- **Data-Driven Projects**: Project status (`shipped`/`building`) automatically determines rendering (soldered chip with steady glow vs breadboard with flickering LEDs)
- **Terminal Boot Sequence**: Typewriter-style boot messages on page load
- **Responsive Design**: 
  - Mobile fallback (<=768px viewport) disables scroll-jacking for vertical stacking
  - Responsive layouts at 900px and 640px breakpoints
- **Reduced Motion Support**: Respects `prefers-reduced-motion` media query
- **Performance Optimization**:
  - FPS monitor reduces bloom effect if sustained FPS < 50
  - Raycaster throttling (every 3rd frame)
  - Frustum culling and render call minimization
- **Accessibility**:
  - Skip-to-content link
  - ARIA labels on interactive elements
  - Keyboard navigable controls
  - Semantic HTML structure
- **Error Handling**: Graceful fallback for canvas texture generation
- **Continuous Camera Motion**: Smooth Catmull-Rom spline path between sections (no teleporting)
- **Nav-Click Synchronization**: Clicking navigation buttons smoothly scrolls to corresponding section
- **Persistent LinkedIn CTA**: Always-visible call-to-action in header and section panels

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Parameshwaran_S_Portfolio
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```
   Then open `http://localhost:5173` in your browser.

4. **Build for production**
   ```bash
   npm run build
   ```
   Outputs to `/dist` directory.

## Technology Stack

- **Build Tool**: Vite (ES modules, fast HMR)
- **3D Graphics**: Three.js (renders PCB board, components, traces)
- **Animations**: GSAP (timeline-based sequences, smooth transitions)
- **Scrolling**: GSAP ScrollTrigger (scroll-linked camera movement)
- **Styling**: CSS3 (CSS variables, flexbox, grid, backdrop-filter)
- **Typography**: 
  - Orbitron (headings, ECE aesthetic)
  - Share Tech Mono (terminal, monospace elements)
- **Asset Pipeline**: Vite (handles images, fonts, etc.)

## Project Structure

```
/src
  /data          # Portfolio data (projects, skills, experience)
  /three         # Three.js scene, board, components, traces, particles, project chips
  /scroll        # Scroll-journey logic (camera path, panel positioning)
  /ui            # UI elements (boot sequence, tooltips, panels, sections, fallback)
  /utils         # Utilities (hover detection, camera states)
index.html       # Main HTML structure
main.js          # Application entry point
style.css        # Core styling (variables, layouts)
scroll.css       # Journey-specific panel styles
```

## Browser Support

- **Primary**: Modern browsers (Chrome, Firefox, Safari, Edge) with WebGL 2 support
- **Fallback**: 
  - WebGL 1 fallback via Three.js
  - Canvas renderer fallback for very old browsers
  - No-JS fallback shows basic styling and content
- **Mobile**: Fully responsive; touch interactions supported

## Development Notes

- The PCB board is modeled in Three.js with extruded geometry for the base
- Silkscreen textures are dynamically generated using HTML5 Canvas
- Project chips render based on `status` field in `/src/data/portfolio.js`
- Camera path uses Catmull-Rom spline for smooth interpolation between components
- Performance monitored via frame timing; adjusts bloom effect dynamically

## Customization

- Update profile data in `/src/data/portfolio.js`
- Adjust colors in `style.css` CSS variables (`--bg-color`, `--glow-green`, etc.)
- Modify boot sequence text in `/src/ui/boot.js`
- Change camera path points in `/src/scroll/journey.js`

---

*Built with Three.js, GSAP, and Vite. Deployed via Vercel/Netlify.*