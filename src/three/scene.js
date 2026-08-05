import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export let scene;
export let camera;
export let renderer;
export let composer = null;

// Glowing traces via bloom post-processing. Tuned conservatively so
// frame rate holds on mid-range hardware; skipped entirely in lite mode.
export function enableBloom() {
    if (!renderer || !scene || !camera) return;
    try {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.45, // strength — subtle glow, not a light show
            0.3,  // radius
            0.7   // threshold — only emissive traces/LEDs bloom
        );
        composer.addPass(bloomPass);
        composer.setSize(window.innerWidth, window.innerHeight);
        composer.renderToScreen = true;
    } catch (err) {
        console.warn('Bloom init failed (likely import error):', err);
        composer = null;
    }
}

export const tickCallbacks = [];

// Track all disposable resources for cleanup
export const disposableResources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set()
};

// ─── Fab-bench backdrop ───────────────────────────────────────
// A pre-rendered CanvasTexture used as scene.background so the view is never
// an empty void around the board: deep FR-4 gradient, soft soldermask-green
// and ENIG-gold ambient glows, a faint fabrication grid, and plated vias at
// grid intersections — the same fab-shop language as the board itself.
// Painted once at init (no per-frame cost); deterministic, no wall-clock.
function createBackdropTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 1. FR-4 substrate gradient
    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, '#060f0b');
    base.addColorStop(0.5, '#0a1812');
    base.addColorStop(1, '#040c08');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // 2. Ambient glows — soldermask green wash top-center, gold wash bottom-right
    const greenGlow = ctx.createRadialGradient(size * 0.5, size * 0.08, 0, size * 0.5, size * 0.08, size * 0.46);
    greenGlow.addColorStop(0, 'rgba(46, 110, 76, 0.32)');
    greenGlow.addColorStop(1, 'rgba(46, 110, 76, 0)');
    ctx.fillStyle = greenGlow;
    ctx.fillRect(0, 0, size, size);

    const goldGlow = ctx.createRadialGradient(size * 0.88, size * 0.9, 0, size * 0.88, size * 0.9, size * 0.38);
    goldGlow.addColorStop(0, 'rgba(201, 162, 75, 0.10)');
    goldGlow.addColorStop(1, 'rgba(201, 162, 75, 0)');
    ctx.fillStyle = goldGlow;
    ctx.fillRect(0, 0, size, size);

    const signalGlow = ctx.createRadialGradient(size * 0.1, size * 0.78, 0, size * 0.1, size * 0.78, size * 0.3);
    signalGlow.addColorStop(0, 'rgba(62, 230, 160, 0.05)');
    signalGlow.addColorStop(1, 'rgba(62, 230, 160, 0)');
    ctx.fillStyle = signalGlow;
    ctx.fillRect(0, 0, size, size);

    // 3. Faint fabrication grid + plated vias at intersections
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.03)';
    ctx.lineWidth = 1;
    const cell = 64;
    for (let i = 0; i <= size; i += cell) {
        ctx.beginPath();
        ctx.moveTo(i + 0.5, 0);
        ctx.lineTo(i + 0.5, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i + 0.5);
        ctx.lineTo(size, i + 0.5);
        ctx.stroke();
    }
    for (let gx = 0; gx <= size; gx += cell * 2) {
        for (let gy = 0; gy <= size; gy += cell * 2) {
            ctx.beginPath();
            ctx.arc(gx + 0.5, gy + 0.5, 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(201, 162, 75, 0.16)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(gx + 0.5, gy + 0.5, 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(4, 12, 7, 0.9)';
            ctx.fill();
        }
    }

    // 4. Edge vignette baked into the backdrop — kept light (0.25) so it
    //    never stacks with the page .vignette-overlay (which can reach 0.6)
    //    into a dark ring around the board.
    const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.72);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

export function initScene(canvasElement) {
    // 1. Initialize Scene
    scene = new THREE.Scene();
    // The fab-bench backdrop fills the whole view — nothing around the board
    // is ever empty black. Painted once; the board renders on top of it.
    const backdrop = createBackdropTexture();
    scene.background = backdrop;
    disposableResources.textures.add(backdrop);

    // 2. Initialize Camera (Perspective, positioned to view board at an angle)
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, -2, 17);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    // 3. Initialize WebGL Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in r185 (deprecation warning) — PCF is the
    // supported soft variant now.
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // 4. Set up Lights
    // Ambient light - soft tint of green matching solder mask glow
    const ambientLight = new THREE.AmbientLight(0xdcfce7, 0.45);
    scene.add(ambientLight);

    // Hemisphere light — sky/soldermask color gradient gives materials depth
    // (chips stop reading as flat black boxes under the single ambient)
    const hemiLight = new THREE.HemisphereLight(0xe9f5ee, 0x1e4d33, 0.7);
    scene.add(hemiLight);

    // Key directional light creating specular metallic reflections
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(6, 4, 15);
    dirLight1.castShadow = true;
    // Shadow frustum sized for the WHOLE board (12.75 world units tall at
    // group scale 0.85) — the default ±5 ortho box clipped the cast shadow to
    // a hard-edged stripe. far must reach the shadow catcher plane, which sits
    // ~26 units from the light. 1024² keeps the original shadow-map fill cost
    // (the guardrail below scales bloom, not shadows, so don't inflate it).
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 35;
    dirLight1.shadow.camera.left = -10;
    dirLight1.shadow.camera.right = 10;
    dirLight1.shadow.camera.top = 10;
    dirLight1.shadow.camera.bottom = -10;
    dirLight1.shadow.camera.updateProjectionMatrix();
    // far grew 25→35, so bias needs to be a bit stronger to keep the same
    // acne margin on the board's self-shadowing edges.
    dirLight1.shadow.bias = -0.001;
    scene.add(dirLight1);

    // Secondary soft warm fill light
    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.4);
    fillLight.position.set(-6, -4, 5);
    scene.add(fillLight);

    // Soft soldermask-green backlight behind PCB — a matte fabrication wash,
    // not the neon arcade glow. Matches --mask-green in the fab-shop palette.
    const pcbBacklight = new THREE.PointLight(0x2a6b4c, 1.4, 18);
    pcbBacklight.position.set(0, 0, -1);
    scene.add(pcbBacklight);

    // Shadow catcher — a transparent "bench" plane below the board that
    // receives the already-cast shadows (board + components all cast).
    // ShadowMaterial renders ONLY the shadow, so everywhere else the
    // fab-bench backdrop shows through — the board reads as seated in the
    // scene instead of hovering. The light's shadow far=35 above covers it.
    const benchGeo = new THREE.PlaneGeometry(36, 36);
    benchGeo.rotateX(-Math.PI / 2);
    const benchMat = new THREE.ShadowMaterial({ opacity: 0.38 });
    const benchPlane = new THREE.Mesh(benchGeo, benchMat);
    benchPlane.position.y = -8.6; // ~2.2 below the board's lowest edge (y≈-6.4)
    benchPlane.receiveShadow = true;
    scene.add(benchPlane);
    disposableResources.geometries.add(benchGeo);
    disposableResources.materials.add(benchMat);

    // 5. Handle Resize (debounced for performance)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            if (composer) composer.setSize(window.innerWidth, window.innerHeight);
        }, 100);
    });

    // 6. FPS monitoring and performance guardrail
    // Tracks frame times; reduces bloom if sustained below thresholds
    let fpsHistory = [];
    const FPS_SAMPLE_WINDOW = 30; // frames
    let bloomReducedLevel = 0; // 0 = normal, 1 = reduced, 2 = minimal
    const originalBloomSettings = { strength: 0.45, radius: 0.3 };

    function checkPerformance(deltaMs) {
        fpsHistory.push(deltaMs);
        if (fpsHistory.length > FPS_SAMPLE_WINDOW) fpsHistory.shift();

        if (fpsHistory.length === FPS_SAMPLE_WINDOW && composer) {
            const avgMs = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
            const avgFps = 1000 / avgMs;

            // Multi-level performance scaling
            let newLevel = 0;
            if (avgFps < 30) {
                newLevel = 2; // Severe performance reduction
            } else if (avgFps < 45) {
                newLevel = 1; // Moderate reduction
            }

            // Only update if level changed
            if (newLevel !== bloomReducedLevel) {
                bloomReducedLevel = newLevel;
                const bloomPass = composer.passes.find(p => p instanceof UnrealBloomPass);
                if (bloomPass) {
                    switch (newLevel) {
                        case 0: // Normal
                            bloomPass.strength = originalBloomSettings.strength;
                            bloomPass.radius = originalBloomSettings.radius;
                            console.log(`[Performance] FPS ${avgFps.toFixed(1)} - restoring normal bloom`);
                            break;
                        case 1: // Reduced
                            bloomPass.strength = Math.min(originalBloomSettings.strength * 0.5, 0.2);
                            bloomPass.radius = Math.min(originalBloomSettings.radius * 0.5, 0.15);
                            console.log(`[Performance] FPS ${avgFps.toFixed(1)} < 45 - reducing bloom`);
                            break;
                        case 2: // Minimal
                            bloomPass.strength = Math.min(originalBloomSettings.strength * 0.25, 0.1);
                            bloomPass.radius = Math.min(originalBloomSettings.radius * 0.25, 0.08);
                            console.log(`[Performance] FPS ${avgFps.toFixed(1)} < 30 - minimal bloom`);
                            break;
                    }
                }
            }
        }
    }

    // 7. Start Render/Animation Tick loop
    // THREE.Timer replaces the deprecated THREE.Clock (r185+). This is a
    // real-time interactive scene, so a wall-clock-derived Timer is the
    // correct source of truth here (unlike deterministic HyperFrames renders).
    // The delta is CLAMPED at the source: after a background-tab return or a
    // long frame hitch, getDelta() can spike to seconds — unclamped, that
    // teleports delta-driven motion (particles, lerps, hover response) instead
    // of just skipping the frame. Elapsed-driven oscillators (radar ring,
    // LED flicker) intentionally phase-skip on return — invisible for sines.
    const timer = new THREE.Timer();
    const MAX_DELTA = 0.05; // 50ms cap — slower frames get a bounded response

    function animate() {
        const delta = Math.min(timer.getDelta(), MAX_DELTA);
        const elapsed = timer.getElapsed();

        // Performance check (every frame, delta is in seconds)
        checkPerformance(delta * 1000);

        // Run registered callbacks
        tickCallbacks.forEach(callback => callback(elapsed, delta));

        // Render pass — composer (bloom) when enabled, plain render otherwise
        if (composer) composer.render();
        else renderer.render(scene, camera);

        requestAnimationFrame(animate);
    }
    animate();
}
