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

export function initScene(canvasElement) {
    // 1. Initialize Scene
    scene = new THREE.Scene();

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Set up Lights
    // Ambient light - soft tint of green matching solder mask glow
    const ambientLight = new THREE.AmbientLight(0xdcfce7, 0.45);
    scene.add(ambientLight);

    // Key directional light creating specular metallic reflections
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(6, 4, 15);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 25;
    dirLight1.shadow.bias = -0.0005;
    scene.add(dirLight1);

    // Secondary soft warm fill light
    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.4);
    fillLight.position.set(-6, -4, 5);
    scene.add(fillLight);

    // Dynamic green backlight behind PCB for glow on canvas
    const pcbBacklight = new THREE.PointLight(0x00ff88, 1.2, 18);
    pcbBacklight.position.set(0, 0, -1);
    scene.add(pcbBacklight);

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
    const clock = new THREE.Clock();

    function animate() {
        const delta = clock.getDelta();
        const elapsed = clock.getElapsedTime();

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
