// @ts-check
// ============================================================
// CYBER-RUNNER 3D — THREE.js Sub-Scene Engine
//
// Replaces the 128×64 1-bit prototype canvas with a full 3D Three.js
// perspective arcade experience rendered directly onto the 512×256
// arcade CRT canvas and mirrored to LCD1 on the motherboard.
//
// Features:
//   - Dedicated Three.js Scene (`gameScene`) and Camera (`gameCamera`)
//   - Hardware-accelerated WebGLRenderer on `#arcade-crt-canvas`
//   - Infinite 3D perspective cyber track with glowing copper rail & neon guides
//   - Dynamic scrolling track floor with circuit grid lines
//   - Distant cyberpunk horizon with glowing wireframe monoliths
//   - 3D High-Tech Pulse Core Avatar with spinning gyroscopic gimbal rings
//   - Dynamic action kinematics: somersault flips, rail friction sparks, dash afterimages
//   - 3D Volumetric Physical Obstacles: SMT Resistors, Can Capacitors, Laser Beams, Chasms, Relays, Spikes
//   - 3D Collectibles & Holographic Power-ups: Gold Bohr Electrons, Geodesic Shield, Overclock Vortex, Turbo Cones
//   - Dynamic Cinematic Camera: speed-reactive FOV warp, landing bob, camera shake
//   - Explosive 24-shard 3D core fracture with bounce physics on Game Over
//   - 3D Floating Holographic "SIGNAL LOST" & Score Popups
//   - High-performance zero-allocation obstacle & collectible pooling
// ============================================================
import * as THREE from 'three';
import { motionPrefs } from '../utils/motion-prefs.js';

// Screen resolution for the arcade display
const CRT_W = 512;
const CRT_H = 256;

// Horizontal World Coordinate Mapping (matches 128x64 lcd-sim.js field)
const WORLD_LEFT_X = -4.0;
const WORLD_SPAN_X = 8.0;
const SIM_GROUND_Y = 50;
const WORLD_GROUND_Y = 0.35;
const WORLD_HEIGHT_SCALE = 2.75 / 42.0;

// Track geometry constants for horizontal side-scroller
const SEGMENT_WIDTH = 4.0;
const NUM_TILES = 8;
const RAIL_DEPTH = 1.2;
const TRACK_DEPTH = 2.0;

/**
 * Map simulation pixel X (0..128) to 3D horizontal world space (-4.0..+4.0).
 * @param {number} px
 * @returns {number}
 */
export function toWorldX(px) {
    return WORLD_LEFT_X + (px / 128.0) * WORLD_SPAN_X;
}

/**
 * Map simulation pixel Y (0..64) to 3D horizontal world space (ground=0.35, apex=3.1).
 * @param {number} py
 * @returns {number}
 */
export function toWorldY(py) {
    return WORLD_GROUND_Y + (SIM_GROUND_Y - py) * WORLD_HEIGHT_SCALE;
}

/** @type {THREE.Scene | null} */
let gameScene = null;

/** @type {THREE.PerspectiveCamera | null} */
let gameCamera = null;

/** @type {THREE.WebGLRenderer | null} */
let gameRenderer = null;

/** @type {HTMLCanvasElement | null} */
let boundCanvas = null;

/** @type {THREE.PointLight | null} */
let playerLight = null;

/** @type {THREE.Group | null} */
let trackGroup = null;

/** @type {Array<THREE.Group>} */
let trackTiles = [];

/** @type {THREE.Group | null} */
let playerGroup = null;

/** @type {THREE.Mesh | null} */
let coreMesh = null;

/** @type {THREE.Mesh | null} */
let innerSparkMesh = null;

/** @type {THREE.Mesh | null} */
let outerRingMesh = null;

/** @type {THREE.Mesh | null} */
let innerRingMesh = null;

/** @type {THREE.Mesh | null} */
let playerShadow = null;

/** @type {THREE.Mesh | null} */
let shieldSphere = null;

/** @type {THREE.Mesh | null} */
let overclockHalo = null;

/** @type {THREE.Group | null} */
let turboFlames = null;

/** @type {Array<THREE.Mesh>} */
let afterimages = [];

/** @type {THREE.InstancedMesh | null} */
let trailInstanced = null;
const TRAIL_COUNT = 20;
const trailHistory = Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: 0.28, z: 0, scale: 0.1 }));

/** @type {THREE.Points | null} */
let slideSparks = null;
const SPARK_COUNT = 18;
/** @type {Float32Array} */
let sparkPositions = new Float32Array(SPARK_COUNT * 3);
/** @type {Array<{ vx: number, vy: number, vz: number, life: number }>} */
let sparkVels = [];

/** @type {THREE.Group | null} */
let obstacleGroup = null;

/** @type {Record<string, Array<THREE.Group>>} */
const obstaclePool = {
    resistor: [],
    capacitor: [],
    beam: [],
    gap: [],
    relay: [],
    spike: []
};

/** @type {THREE.Group | null} */
let collectiblesGroup = null;

/** @type {Array<THREE.Group>} */
let electronPool = [];
const ELECTRON_POOL_SIZE = 28;

/** @type {Record<string, Array<THREE.Group>>} */
const powerupPool = {
    shield: [],
    overclock: [],
    turbo: [],
    magnet: [],
    stabilizer: []
};

// 3D Shatter Crash System
/** @type {THREE.Group | null} */
let shatterGroup = null;
const SHARD_COUNT = 24;
/** @type {Array<{ mesh: THREE.Mesh, vx: number, vy: number, vz: number, rx: number, ry: number, rz: number }>} */
let shardData = [];

// 3D Holographic "SIGNAL LOST" Banner
/** @type {THREE.Mesh | null} */
let signalLostMesh = null;

// Camera dynamics
let cameraShake = 0;
let currentCameraFov = 54;
let lastSimState = 'off';
let lastObservedElectrons = 0;
let lastObservedCombo = 1;
let wasJumpingIn3d = false;

// Horizon & Atmosphere features
/** @type {THREE.Line | null} */
let skyScopeLine = null;
const SKY_SCOPE_PTS = 64;

/** @type {Array<{ led: THREE.Mesh, phase: number, freq: number }>} */
const monolithLeds = [];

/** @type {THREE.Points | null} */
let electronDust = null;
const DUST_COUNT = 90;
let dustPositions = new Float32Array(DUST_COUNT * 3);

/** @type {THREE.MeshStandardMaterial | null} */
let copperRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let neonRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let trackFloorMat = null;

/** @type {boolean} */
let isInitialized = false;

/**
 * Initialize the 3D game engine. If no canvas is provided, creates an offscreen canvas
 * or binds directly to `#diag-sim-canvas` for full-screen diagnostic simulation.
 * Safe in headless environments: returns false if WebGL is unavailable.
 * @param {HTMLCanvasElement | null} [canvas]
 * @returns {boolean}
 */
export function init3dGame(canvas = null) {
    if (isInitialized) return true;
    if (typeof document === 'undefined') return false;

    let targetCanvas = canvas;
    if (!targetCanvas) {
        targetCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('diag-sim-canvas'));
    }
    if (!targetCanvas) {
        targetCanvas = document.createElement('canvas');
        targetCanvas.width = CRT_W;
        targetCanvas.height = CRT_H;
    }

    if (!targetCanvas || typeof targetCanvas.getContext !== 'function') return false;

    // Check WebGL availability using a probe canvas so targetCanvas preserves its context options
    try {
        const probe = document.createElement('canvas');
        const probeGl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!probeGl) return false;
    } catch {
        return false;
    }

    boundCanvas = targetCanvas;
    const isFullscreen = boundCanvas.id === 'diag-sim-canvas';
    const initW = isFullscreen && typeof window !== 'undefined' ? window.innerWidth : CRT_W;
    const initH = isFullscreen && typeof window !== 'undefined' ? window.innerHeight : CRT_H;
    boundCanvas.width = initW;
    boundCanvas.height = initH;

    // 1. Create Game Scene
    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x010804);
    gameScene.fog = new THREE.FogExp2(0x010804, 0.038);

    // 2. Cinematic 2.5D Side-Perspective Camera
    const aspect = initW / initH;
    gameCamera = new THREE.PerspectiveCamera(54, aspect, 0.1, 100);
    gameCamera.position.set(0.0, 1.45, 5.2);
    gameCamera.lookAt(0.2, 0.95, 0.0);

    // 3. WebGL Renderer
    try {
        gameRenderer = new THREE.WebGLRenderer({
            canvas: boundCanvas,
            antialias: true,
            preserveDrawingBuffer: true, // required for CanvasTexture mirror to LCD1 quad
            powerPreference: 'high-performance'
        });
        gameRenderer.setSize(initW, initH, false);
        gameRenderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5));
        gameRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        gameRenderer.toneMappingExposure = 1.45;
    } catch (err) {
        console.warn('Could not initialize WebGLRenderer for Signal Runner 3D:', err);
        return false;
    }

    if (isFullscreen && typeof window !== 'undefined') {
        window.addEventListener('resize', resize3dGame);
    }


    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0x0e3522, 1.8);
    gameScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x3ee6a0, 2.2);
    dirLight.position.set(2, 6, 4);
    gameScene.add(dirLight);

    playerLight = new THREE.PointLight(0x00ffcc, 3.5, 8.5);
    playerLight.position.set(0, 0.8, 0);
    gameScene.add(playerLight);

    // 5. Materials
    copperRailMat = new THREE.MeshStandardMaterial({
        color: 0xd49b38,
        metalness: 0.92,
        roughness: 0.28,
        emissive: 0x6a4805,
        emissiveIntensity: 0.35
    });

    neonRailMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 2.2,
        roughness: 0.2
    });

    trackFloorMat = new THREE.MeshStandardMaterial({
        color: 0x051a0e,
        metalness: 0.6,
        roughness: 0.5,
        emissive: 0x031008,
        emissiveIntensity: 0.25
    });

    // 6. Build Modular Infinite Track
    buildTrack();

    // 7. Build Distant Cyber Horizon
    buildHorizon();

    // 8. Build 3D Cyber-Pulse Avatar & FX
    buildPlayer();

    // 9. Build Obstacle Container Group
    obstacleGroup = new THREE.Group();
    gameScene.add(obstacleGroup);

    // 10. Build Collectibles Container Group
    collectiblesGroup = new THREE.Group();
    gameScene.add(collectiblesGroup);
    buildCollectiblePools();

    // 11. Build 3D Shatter Crash System
    buildShatterSystem();

    // 12. Build 3D Signal Lost Hologram Banner
    buildSignalLostBanner();

    isInitialized = true;
    return true;
}

/**
 * Constructs modular looping horizontal track segments along X.
 */
function buildTrack() {
    if (!gameScene || !copperRailMat || !neonRailMat || !trackFloorMat) return;

    trackGroup = new THREE.Group();
    gameScene.add(trackGroup);
    trackTiles = [];

    // Base substrate: SEGMENT_WIDTH wide in X, 0.16 high in Y, TRACK_DEPTH deep in Z
    const floorGeo = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.16, TRACK_DEPTH);
    // Central ENIG Gold Transmission Rail: SEGMENT_WIDTH wide in X, 0.05 high in Y, RAIL_DEPTH deep in Z
    const railGeo = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.05, RAIL_DEPTH);
    // Front and Back glowing neon guide rails
    const edgeGuideGeo = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.07, 0.05);

    // Micro-vias along the track edges (small emissive discs)
    const viaGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10);
    const viaMat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00ffcc,
        emissiveIntensity: 2.5
    });

    for (let i = 0; i < NUM_TILES; i++) {
        const tile = new THREE.Group();

        // Dark PCB Substrate Base Slab
        const floor = new THREE.Mesh(floorGeo, trackFloorMat);
        floor.position.set(0, 0.08, 0);
        tile.add(floor);

        // Center ENIG Copper Busway Rail (Brushed Gold)
        const rail = new THREE.Mesh(railGeo, copperRailMat);
        rail.position.set(0, 0.18, 0);
        tile.add(rail);

        // Front & Rear Neon Guide Tracks (Emerald Laser Curbs)
        const guideFront = new THREE.Mesh(edgeGuideGeo, neonRailMat);
        guideFront.position.set(0, 0.21, RAIL_DEPTH / 2 + 0.03);
        tile.add(guideFront);

        const guideRear = new THREE.Mesh(edgeGuideGeo, neonRailMat);
        guideRear.position.set(0, 0.21, -RAIL_DEPTH / 2 - 0.03);
        tile.add(guideRear);

        // Micro-via solder pads along the track
        for (let v = -SEGMENT_WIDTH / 2 + 0.5; v < SEGMENT_WIDTH / 2; v += 1.0) {
            const viaF = new THREE.Mesh(viaGeo, viaMat);
            viaF.position.set(v, 0.20, RAIL_DEPTH / 2 + 0.12);
            tile.add(viaF);

            const viaR = new THREE.Mesh(viaGeo, viaMat);
            viaR.position.set(v, 0.20, -RAIL_DEPTH / 2 - 0.12);
            tile.add(viaR);
        }

        // Horizontal circuit trace lines on the substrate
        const traceGeo = new THREE.PlaneGeometry(SEGMENT_WIDTH, 0.03);
        traceGeo.rotateX(-Math.PI / 2);
        const traceMat = new THREE.MeshBasicMaterial({
            color: 0x10794a,
            transparent: true,
            opacity: 0.5
        });
        const trace1 = new THREE.Mesh(traceGeo, traceMat);
        trace1.position.set(0, 0.165, TRACK_DEPTH / 2 - 0.1);
        tile.add(trace1);

        const trace2 = new THREE.Mesh(traceGeo, traceMat);
        trace2.position.set(0, 0.165, -TRACK_DEPTH / 2 + 0.1);
        tile.add(trace2);

        // Position tiles along X
        tile.position.set(-12 + i * SEGMENT_WIDTH, 0, 0);

        trackGroup.add(tile);
        trackTiles.push(tile);
    }
}

function createScopeGridTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = 'rgba(1, 14, 8, 0.45)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = 'rgba(62, 230, 160, 0.22)';
    ctx.lineWidth = 1;
    for (let y = 16; y < 256; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
    }
    for (let x = 16; x < 512; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, 4, 504, 248);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#3ee6a0';
    ctx.fillText('DIFFERENTIAL LOGIC BUS // CH1 16.0MHz', 14, 24);
    ctx.fillStyle = '#ffd875';
    ctx.fillText('TRACE IMPEDANCE: 50Ω · CLK LOCKED', 260, 24);

    return new THREE.CanvasTexture(c);
}

/**
 * @param {string} label
 * @param {string} sub
 * @returns {THREE.CanvasTexture | null}
 */
function createChipSilkscreenTexture(label, sub) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#08140e';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#1b3b29';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 236);

    ctx.fillStyle = '#3ee6a0';
    ctx.beginPath();
    ctx.arc(28, 28, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(230, 245, 235, 0.9)';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 128, 115);

    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(62, 230, 160, 0.85)';
    ctx.fillText(sub, 128, 145);

    return new THREE.CanvasTexture(c);
}

/**
 * Builds distant glowing motherboard city, IC monoliths, and cyber grid.
 */
function buildHorizon() {
    if (!gameScene) return;

    const hGroup = new THREE.Group();
    gameScene.add(hGroup);


    // 1. Monolithic 3D IC Packages in background (-Z)
    const chipMat = new THREE.MeshStandardMaterial({
        color: 0x09160f,
        roughness: 0.35,
        metalness: 0.85,
        emissive: 0x040e08,
        emissiveIntensity: 0.3
    });

    const heatsinkMat = new THREE.MeshStandardMaterial({
        color: 0x14281c,
        roughness: 0.2,
        metalness: 0.92,
        wireframe: true
    });

    const chipDefs = [
        { x: -9.5, y: 2.2, z: -6.5, w: 4.2, h: 3.2, d: 3.0, label: 'STM32F405', sub: 'ARM CORTEX-M4' },
        { x: -3.5, y: 3.8, z: -8.5, w: 4.8, h: 4.8, d: 3.5, label: 'XILINX ARTIX', sub: 'FPGA MATRIX' },
        { x: 3.5, y: 2.6, z: -7.0, w: 3.8, h: 3.4, d: 3.0, label: 'CYPRESS FX3', sub: 'USB 3.0 PHY' },
        { x: 10.0, y: 4.2, z: -10.0, w: 5.5, h: 5.5, d: 3.8, label: 'ALTERA CYCLONE', sub: 'LOGIC ARRAY' },
        { x: -16.0, y: 5.0, z: -13.0, w: 6.5, h: 7.0, d: 4.5, label: 'TI TMS320', sub: 'DSP ENGINE' },
        { x: 16.5, y: 4.5, z: -12.0, w: 6.0, h: 6.0, d: 4.0, label: 'ESP32-S3', sub: 'DUAL XTENSA' }
    ];

    const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const ledColors = [0x3ee6a0, 0x00ffff, 0xffd875];

    chipDefs.forEach((cp, idx) => {
        const chip = new THREE.Mesh(new THREE.BoxGeometry(cp.w, cp.h, cp.d), chipMat);
        chip.position.set(cp.x, cp.y, cp.z);
        hGroup.add(chip);

        // Silkscreen front label
        const silkTex = createChipSilkscreenTexture(cp.label, cp.sub);
        if (silkTex) {
            const silkMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(cp.w * 0.85, cp.h * 0.75),
                new THREE.MeshBasicMaterial({ map: silkTex, transparent: true, opacity: 0.9 })
            );
            silkMesh.position.set(cp.x, cp.y, cp.z + cp.d / 2 + 0.02);
            hGroup.add(silkMesh);
        }

        // Extruded cooling fins
        const fins = new THREE.Mesh(new THREE.BoxGeometry(cp.w * 0.92, 0.45, cp.d * 0.92), heatsinkMat);
        fins.position.set(cp.x, cp.y + cp.h / 2 + 0.22, cp.z);
        hGroup.add(fins);

        // Status LED at top-left pin 1
        const ledMat = new THREE.MeshBasicMaterial({
            color: ledColors[idx % ledColors.length],
            transparent: true,
            opacity: 0.85
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(cp.x - cp.w / 2 + 0.25, cp.y + cp.h / 2 + 0.1, cp.z + cp.d / 2 + 0.05);
        hGroup.add(led);
        monolithLeds.push({ led, phase: idx * 1.3, freq: 2.2 + idx * 0.6 });
    });

    // 2. Giant Holographic Oscilloscope Sky Projection
    const scopeTex = createScopeGridTexture();
    if (scopeTex) {
        const scopeScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 7.5),
            new THREE.MeshBasicMaterial({
                map: scopeTex,
                transparent: true,
                opacity: 0.42,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            })
        );
        scopeScreen.position.set(0, 6.2, -12.0);
        scopeScreen.rotation.x = 0.12;
        hGroup.add(scopeScreen);
    }

    const scopeLinePos = new Float32Array(SKY_SCOPE_PTS * 3);
    for (let i = 0; i < SKY_SCOPE_PTS; i++) {
        scopeLinePos[i * 3] = -7.5 + (i / (SKY_SCOPE_PTS - 1)) * 15.0;
        scopeLinePos[i * 3 + 1] = 6.2;
        scopeLinePos[i * 3 + 2] = -11.9;
    }
    const scopeLineGeo = new THREE.BufferGeometry();
    scopeLineGeo.setAttribute('position', new THREE.BufferAttribute(scopeLinePos, 3));
    skyScopeLine = new THREE.Line(
        scopeLineGeo,
        new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        })
    );
    hGroup.add(skyScopeLine);

    // 3. Volumetric Floating Electron Dust Cloud
    const dustGeo = new THREE.BufferGeometry();
    dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 24;
        dustPositions[i * 3 + 1] = Math.random() * 5.0 + 0.2;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
        color: 0x3ee6a0,
        size: 0.065,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
    });
    electronDust = new THREE.Points(dustGeo, dustMat);
    gameScene.add(electronDust);

    // 4. Distant cylindrical ferrite choke coils
    const chokeGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16);
    const chokeMat = new THREE.MeshStandardMaterial({
        color: 0x9b6b28,
        metalness: 0.85,
        roughness: 0.3
    });
    for (let c = 0; c < 5; c++) {
        const choke = new THREE.Mesh(chokeGeo, chokeMat);
        choke.position.set(-10 + c * 5.0, 1.2, -4.2);
        hGroup.add(choke);
    }

    // 5. Glowing Cyber Horizon Data Grid
    const gridHelper = new THREE.GridHelper(50, 50, 0x3ee6a0, 0x0c3820);
    gridHelper.position.set(0, -0.05, -7);
    hGroup.add(gridHelper);
}

/**
 * Builds the 3D Cyber-Pulse Core Avatar:
 * Crystalline Octahedron Core, Gyroscopic Gimbal Rings, Jet Trail, and Slide Sparks.
 */
function buildPlayer() {
    if (!gameScene) return;

    playerGroup = new THREE.Group();
    playerGroup.position.set(0, 0.28, 0);
    gameScene.add(playerGroup);

    // 1. Central Crystalline Octahedron Core
    const coreGeo = new THREE.OctahedronGeometry(0.18, 0);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x3ee6a0,
        emissiveIntensity: 2.8,
        roughness: 0.15,
        metalness: 0.85
    });
    coreMesh = new THREE.Mesh(coreGeo, coreMat);
    playerGroup.add(coreMesh);

    // Inner White Super-Energy Spark
    const sparkGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    innerSparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
    playerGroup.add(innerSparkMesh);

    // 2. Gyroscopic Gimbal Rings
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 2.0,
        roughness: 0.2,
        metalness: 0.8
    });

    const outerRingGeo = new THREE.TorusGeometry(0.32, 0.022, 8, 32);
    outerRingMesh = new THREE.Mesh(outerRingGeo, ringMat);
    playerGroup.add(outerRingMesh);

    const innerRingGeo = new THREE.TorusGeometry(0.24, 0.018, 8, 32);
    innerRingMesh = new THREE.Mesh(innerRingGeo, ringMat);
    playerGroup.add(innerRingMesh);

    // 3. Geodesic Force-Field Shield Sphere (Active on Powerup)
    const shieldGeo = new THREE.IcosahedronGeometry(0.48, 1);
    const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
        emissive: 0x0088cc,
        emissiveIntensity: 2.2
    });
    shieldSphere = new THREE.Mesh(shieldGeo, shieldMat);
    shieldSphere.visible = false;
    playerGroup.add(shieldSphere);

    // 4. Overclock Golden Lightning Vortex
    const haloGeo = new THREE.TorusGeometry(0.42, 0.016, 6, 24);
    const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44,
        emissive: 0xffaa00,
        emissiveIntensity: 3.0,
        roughness: 0.1
    });
    overclockHalo = new THREE.Mesh(haloGeo, haloMat);
    overclockHalo.visible = false;
    playerGroup.add(overclockHalo);

    // 5. Turbo Twin Plasma Thruster Cones (Facing -X)
    turboFlames = new THREE.Group();
    const flameGeo = new THREE.ConeGeometry(0.06, 0.35, 8);
    flameGeo.rotateZ(Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const f1 = new THREE.Mesh(flameGeo, flameMat);
    f1.position.set(-0.32, 0.08, 0);
    turboFlames.add(f1);
    const f2 = new THREE.Mesh(flameGeo, flameMat);
    f2.position.set(-0.32, -0.08, 0);
    turboFlames.add(f2);
    turboFlames.visible = false;
    playerGroup.add(turboFlames);

    // 6. Ground Shadow on Copper Rail
    const shadowGeo = new THREE.PlaneGeometry(0.65, 0.48);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55
    });
    playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    playerShadow.position.set(-2.5, 0.21, 0);
    gameScene.add(playerShadow);

    // 7. Dash Afterimage Ghosts
    afterimages = [];
    const ghostMat1 = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.45,
        wireframe: true
    });
    const ghostMat2 = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.25,
        wireframe: true
    });
    const ghost1 = new THREE.Mesh(coreGeo, ghostMat1);
    const ghost2 = new THREE.Mesh(coreGeo, ghostMat2);
    ghost1.visible = false;
    ghost2.visible = false;
    gameScene.add(ghost1);
    gameScene.add(ghost2);
    afterimages.push(ghost1, ghost2);

    // 8. Instanced Particle Jet Trail
    const trailGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const trailMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.75
    });
    trailInstanced = new THREE.InstancedMesh(trailGeo, trailMat, TRAIL_COUNT);
    trailInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gameScene.add(trailInstanced);

    // 9. Slide Rail Friction Sparks
    const sparkGeoPoints = new THREE.BufferGeometry();
    sparkPositions = new Float32Array(SPARK_COUNT * 3);
    sparkVels = [];
    for (let i = 0; i < SPARK_COUNT; i++) {
        sparkPositions[i * 3] = 0;
        sparkPositions[i * 3 + 1] = 0.04;
        sparkPositions[i * 3 + 2] = 0;
        sparkVels.push({
            vx: (Math.random() - 0.5) * 1.5,
            vy: Math.random() * 1.2 + 0.3,
            vz: Math.random() * 2.0 + 1.0,
            life: 0
        });
    }
    sparkGeoPoints.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMatPoints = new THREE.PointsMaterial({
        color: 0xffdd44,
        size: 0.055,
        transparent: true,
        opacity: 0.95
    });
    slideSparks = new THREE.Points(sparkGeoPoints, sparkMatPoints);
    slideSparks.visible = false;
    gameScene.add(slideSparks);
}

// ─────────────────────────────────────────────────────────────
// 3D Shatter Crash System & Signal Lost Banner
// ─────────────────────────────────────────────────────────────

function buildShatterSystem() {
    if (!gameScene) return;

    shatterGroup = new THREE.Group();
    shatterGroup.visible = false;
    gameScene.add(shatterGroup);

    const shardGeo1 = new THREE.TetrahedronGeometry(0.085, 0);
    const shardGeo2 = new THREE.OctahedronGeometry(0.07, 0);
    const shardMatEmerald = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 3.8,
        roughness: 0.2
    });
    const shardMatCyan = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 4.2,
        roughness: 0.15
    });
    const shardMatGold = new THREE.MeshStandardMaterial({
        color: 0xffdd44,
        emissive: 0xffaa00,
        emissiveIntensity: 3.5,
        roughness: 0.25
    });

    shardData = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
        const geo = i % 2 === 0 ? shardGeo1 : shardGeo2;
        const mat = i % 3 === 0 ? shardMatCyan : (i % 3 === 1 ? shardMatEmerald : shardMatGold);
        const shard = new THREE.Mesh(geo, mat);
        shatterGroup.add(shard);
        shardData.push({
            mesh: shard,
            vx: 0,
            vy: 0,
            vz: 0,
            rx: (Math.random() - 0.5) * 20,
            ry: (Math.random() - 0.5) * 20,
            rz: (Math.random() - 0.5) * 20
        });
    }
}

/**
 * Triggers horizontal 3D core fracture explosion at the player's crash coordinates.
 * @param {number} [playerX=-2.5]
 * @param {number} [playerY=0.35]
 */
function trigger3dCrash(playerX = -2.5, playerY = 0.35) {
    if (!shatterGroup || !playerGroup) return;
    shatterGroup.visible = true;
    playerGroup.visible = false;
    cameraShake = 0.85;

    for (let i = 0; i < SHARD_COUNT; i++) {
        const s = shardData[i];
        s.mesh.position.set(playerX, playerY, 0);
        const speed = 3.2 + Math.random() * 4.8;
        const angle = Math.random() * Math.PI * 2;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.abs(Math.sin(angle)) * speed + 2.0;
        s.vz = (Math.random() - 0.5) * 3.5;
        s.rx = (Math.random() - 0.5) * 24;
        s.ry = (Math.random() - 0.5) * 24;
        s.rz = (Math.random() - 0.5) * 24;
    }

    if (signalLostMesh) {
        signalLostMesh.visible = true;
        signalLostMesh.position.set(playerX, 1.75, 0.3);
    }
}

function buildSignalLostBanner() {
    if (!gameScene) return;

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 160;
    const ctx = bannerCanvas.getContext('2d');
    if (ctx) {
        // Dark translucent cyber card
        ctx.fillStyle = 'rgba(2, 14, 8, 0.88)';
        ctx.fillRect(0, 0, 512, 160);

        // Cyberpunk border & corner reticles
        ctx.strokeStyle = '#3ee6a0';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, 500, 148);

        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 5;
        // Top-left bracket
        ctx.beginPath();
        ctx.moveTo(6, 30); ctx.lineTo(6, 6); ctx.lineTo(30, 6);
        ctx.stroke();
        // Top-right bracket
        ctx.beginPath();
        ctx.moveTo(482, 6); ctx.lineTo(506, 6); ctx.lineTo(506, 30);
        ctx.stroke();
        // Bottom-left bracket
        ctx.beginPath();
        ctx.moveTo(6, 130); ctx.lineTo(6, 154); ctx.lineTo(30, 154);
        ctx.stroke();
        // Bottom-right bracket
        ctx.beginPath();
        ctx.moveTo(482, 154); ctx.lineTo(506, 154); ctx.lineTo(506, 130);
        ctx.stroke();

        // Scanline lines across card
        ctx.fillStyle = 'rgba(0, 255, 170, 0.08)';
        for (let y = 10; y < 150; y += 4) {
            ctx.fillRect(10, y, 492, 1);
        }

        // Warning Icon & Main Title
        ctx.fillStyle = '#ff3366';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff1144';
        ctx.shadowBlur = 10;
        ctx.fillText('SIGNAL LOST', 256, 52);
        ctx.shadowBlur = 0;

        // Subtitle Status
        ctx.fillStyle = '#3ee6a0';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('TRACE DECOUPLING // SEVERE CIRCUIT BREACH', 256, 84);

        // Action prompt button
        ctx.fillStyle = 'rgba(0, 255, 204, 0.2)';
        ctx.fillRect(64, 102, 384, 38);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(64, 102, 384, 38);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('[ENTER] / [TAP] TO REBOOT CORE', 256, 127);
    }

    const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.PlaneGeometry(2.4, 0.75);
    const bannerMat = new THREE.MeshBasicMaterial({
        map: bannerTexture,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide
    });
    signalLostMesh = new THREE.Mesh(bannerGeo, bannerMat);
    signalLostMesh.visible = false;
    gameScene.add(signalLostMesh);
}

// ─────────────────────────────────────────────────────────────
// 3D Procedural Obstacle Factories & Pooling
// ─────────────────────────────────────────────────────────────

function createResistorMesh() {
    const grp = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.72, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x383b40, roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.12, 0);
    grp.add(body);

    const capGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.09, 12);
    capGeo.rotateX(Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.92, roughness: 0.15 });
    const capFront = new THREE.Mesh(capGeo, capMat);
    capFront.position.set(0, 0.12, 0.36);
    grp.add(capFront);

    const capRear = new THREE.Mesh(capGeo, capMat);
    capRear.position.set(0, 0.12, -0.36);
    grp.add(capRear);

    const bandGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.04, 12);
    bandGeo.rotateX(Math.PI / 2);
    const colors = [0x111111, 0x8b4513, 0xff2200, 0xd4af37];
    [-0.18, -0.06, 0.06, 0.18].forEach((zPos, idx) => {
        const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ color: colors[idx] }));
        band.position.set(0, 0.12, zPos);
        grp.add(band);
    });

    grp.userData = { type: 'resistor' };
    return grp;
}

function createCapacitorMesh() {
    const grp = new THREE.Group();
    const canGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.48, 16);
    const canMat = new THREE.MeshStandardMaterial({
        color: 0x48525e,
        metalness: 0.88,
        roughness: 0.2,
        emissive: 0x112233,
        emissiveIntensity: 0.25
    });
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(0, 0.24, 0);
    grp.add(can);

    const ventGeo = new THREE.BoxGeometry(0.24, 0.02, 0.04);
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x1f2429 });
    const vent1 = new THREE.Mesh(ventGeo, ventMat);
    vent1.position.set(0, 0.485, 0);
    grp.add(vent1);
    const vent2 = new THREE.Mesh(ventGeo, ventMat);
    vent2.position.set(0, 0.485, 0);
    vent2.rotation.y = Math.PI / 2;
    grp.add(vent2);

    const sparkNodeGeo = new THREE.OctahedronGeometry(0.06, 0);
    const sparkNodeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const sparkNode = new THREE.Mesh(sparkNodeGeo, sparkNodeMat);
    sparkNode.position.set(0, 0.54, 0);
    grp.add(sparkNode);

    grp.userData = { type: 'capacitor', sparkNode };
    return grp;
}

function createBeamMesh() {
    const grp = new THREE.Group();
    const pylonGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.2, 8);
    const pylonMat = new THREE.MeshStandardMaterial({
        color: 0x24282c,
        metalness: 0.7,
        roughness: 0.3
    });

    // Front & Rear vertical pylons
    const pylonFront = new THREE.Mesh(pylonGeo, pylonMat);
    pylonFront.position.set(0, 0.60, 0.68);
    grp.add(pylonFront);

    const pylonRear = new THREE.Mesh(pylonGeo, pylonMat);
    pylonRear.position.set(0, 0.60, -0.68);
    grp.add(pylonRear);

    // Elevated horizontal laser beam along Z (height 0.85 — must slide under!)
    const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.36, 8);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xff3366,
        transparent: true,
        opacity: 0.92
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.85, 0);
    grp.add(beamMesh);

    const coreBeamGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.36, 6);
    coreBeamGeo.rotateX(Math.PI / 2);
    const coreBeamMesh = new THREE.Mesh(coreBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    coreBeamMesh.position.set(0, 0.85, 0);
    grp.add(coreBeamMesh);

    grp.userData = { type: 'beam', beamMesh };
    return grp;
}

function createGapMesh() {
    const grp = new THREE.Group();
    // Cutout chasm through the copper rail
    const voidGeo = new THREE.BoxGeometry(0.95, 0.45, 1.35);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000201 });
    const voidBox = new THREE.Mesh(voidGeo, voidMat);
    voidBox.position.set(0, -0.15, 0);
    grp.add(voidBox);

    // Frayed copper sparks at left and right fracture edges
    const frayGeo = new THREE.BoxGeometry(0.06, 0.06, 0.08);
    const frayMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0 });
    const frayL = new THREE.Mesh(frayGeo, frayMat);
    frayL.position.set(-0.48, 0.04, 0);
    grp.add(frayL);

    const frayR = new THREE.Mesh(frayGeo, frayMat);
    frayR.position.set(0.48, 0.04, 0);
    grp.add(frayR);

    grp.userData = { type: 'gap' };
    return grp;
}

function createRelayMesh() {
    const grp = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(0.55, 0.42, 0.65);
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1a2e22,
        metalness: 0.6,
        roughness: 0.4,
        emissive: 0x0a1e12,
        emissiveIntensity: 0.25
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 0.52, 0);
    grp.add(box);

    const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.38, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xd49b38, metalness: 0.9, roughness: 0.2 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 0.24, 0);
    grp.add(arm);

    grp.userData = { type: 'relay', arm };
    return grp;
}

function createSpikeMesh() {
    const grp = new THREE.Group();
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.38, 4);
    const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff7700,
        emissiveIntensity: 2.4,
        roughness: 0.15,
        metalness: 0.8
    });

    const s1 = new THREE.Mesh(spikeGeo, spikeMat);
    s1.position.set(-0.14, 0.19, 0);
    grp.add(s1);

    const s2 = new THREE.Mesh(spikeGeo, spikeMat);
    s2.position.set(0.14, 0.19, 0);
    grp.add(s2);

    const s3 = new THREE.Mesh(spikeGeo, spikeMat);
    s3.scale.set(1.2, 1.2, 1.2);
    s3.position.set(0, 0.23, 0);
    grp.add(s3);

    grp.userData = { type: 'spike' };
    return grp;
}

/**
 * @param {string} type
 * @returns {THREE.Group}
 */
function getPooledObstacle(type) {
    if (!obstaclePool[type]) obstaclePool[type] = [];
    const pool = obstaclePool[type];
    for (let i = 0; i < pool.length; i++) {
        if (!pool[i].visible) {
            pool[i].visible = true;
            return pool[i];
        }
    }
    let newMesh = null;
    if (type === 'resistor') newMesh = createResistorMesh();
    else if (type === 'capacitor') newMesh = createCapacitorMesh();
    else if (type === 'beam') newMesh = createBeamMesh();
    else if (type === 'gap') newMesh = createGapMesh();
    else if (type === 'relay') newMesh = createRelayMesh();
    else newMesh = createSpikeMesh();

    if (obstacleGroup) obstacleGroup.add(newMesh);
    pool.push(newMesh);
    return newMesh;
}

// ─────────────────────────────────────────────────────────────
// 3D Procedural Collectible & Powerup Factories & Pooling
// ─────────────────────────────────────────────────────────────

function buildCollectiblePools() {
    if (!collectiblesGroup) return;

    // High-visibility Cyber Gold Coin geometry:
    // Chamfered coin disc with circular faces oriented toward the 2.5D camera (+Z)
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20);
    coinGeo.rotateX(Math.PI / 2); // Faces toward camera
    const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xff9900,
        emissiveIntensity: 2.8,
        roughness: 0.12,
        metalness: 0.95
    });

    // Inner radiant energy core
    const coreGeo = new THREE.OctahedronGeometry(0.11, 0);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffdd44,
        emissiveIntensity: 4.5,
        roughness: 0.1
    });

    // Outer luminous cyan halo ring
    const ringGeo = new THREE.TorusGeometry(0.24, 0.016, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    // Orbiting quantum electron satellites
    const satGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    for (let i = 0; i < ELECTRON_POOL_SIZE; i++) {
        const el = new THREE.Group();

        // 1. Spinning Coin Body
        const coinBody = new THREE.Group();
        const disc = new THREE.Mesh(coinGeo, coinMat);
        coinBody.add(disc);

        const innerCore = new THREE.Mesh(coreGeo, coreMat);
        coinBody.add(innerCore);

        const halo = new THREE.Mesh(ringGeo, ringMat);
        coinBody.add(halo);

        el.add(coinBody);

        // 2. Quantum Orbit 1
        const orbitPivot = new THREE.Group();
        orbitPivot.rotation.x = Math.PI / 4;
        const sat1 = new THREE.Mesh(satGeo, satMat);
        sat1.position.set(0.32, 0, 0);
        orbitPivot.add(sat1);
        el.add(orbitPivot);

        // 3. Quantum Orbit 2
        const orbitPivot2 = new THREE.Group();
        orbitPivot2.rotation.y = Math.PI / 3;
        orbitPivot2.rotation.z = Math.PI / 6;
        const sat2 = new THREE.Mesh(satGeo, satMat);
        sat2.position.set(0, 0.32, 0);
        orbitPivot2.add(sat2);
        el.add(orbitPivot2);

        el.userData = { coinBody, orbitPivot, orbitPivot2 };
        el.visible = false;
        collectiblesGroup.add(el);
        electronPool.push(el);
    }
}

/**
 * Creates a floating 3D power-up token.
 * @param {string} type
 */
function createPowerupMesh(type) {
    const grp = new THREE.Group();

    if (type === 'shield') {
        const geo = new THREE.IcosahedronGeometry(0.18, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x0088cc, emissiveIntensity: 2.0, wireframe: true });
        grp.add(new THREE.Mesh(geo, mat));
    } else if (type === 'overclock') {
        const geo = new THREE.TetrahedronGeometry(0.18, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 2.5 });
        grp.add(new THREE.Mesh(geo, mat));
    } else if (type === 'turbo') {
        const geo = new THREE.ConeGeometry(0.14, 0.32, 6);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00aaff, emissiveIntensity: 2.0 });
        grp.add(new THREE.Mesh(geo, mat));
    } else {
        const geo = new THREE.TorusGeometry(0.16, 0.04, 6, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0xff0044, emissiveIntensity: 2.0 });
        grp.add(new THREE.Mesh(geo, mat));
    }

    grp.userData = { type };
    return grp;
}

/**
 * Retrieves a pooled power-up pickup mesh.
 * @param {string} type
 */
function getPooledPowerup(type) {
    if (!powerupPool[type]) powerupPool[type] = [];
    const pool = powerupPool[type];
    for (let i = 0; i < pool.length; i++) {
        if (!pool[i].visible) {
            pool[i].visible = true;
            return pool[i];
        }
    }
    const newMesh = createPowerupMesh(type);
    if (collectiblesGroup) collectiblesGroup.add(newMesh);
    pool.push(newMesh);
    return newMesh;
}

/**
 * Synchronizes 3D Electrons & Power-up tokens with simulation state.
 * @param {number} delta
 * @param {any} sim
 */
function updateCollectibles(delta, sim) {
    if (!collectiblesGroup || !sim) return;

    // 1. Hide pooled electrons
    for (let i = 0; i < electronPool.length; i++) {
        electronPool[i].visible = false;
    }

    // Hide pooled powerups
    for (const key of Object.keys(powerupPool)) {
        const list = powerupPool[key];
        for (let i = 0; i < list.length; i++) {
            list[i].visible = false;
        }
    }

    // 2. Position active electrons in horizontal space
    if (Array.isArray(sim.fieldEls)) {
        for (let i = 0; i < sim.fieldEls.length; i++) {
            if (i >= electronPool.length) break;
            const e = sim.fieldEls[i];
            const worldX = toWorldX(e.x);
            if (worldX < -5.5 || worldX > 5.5) continue;

            const elMesh = electronPool[i];
            elMesh.visible = true;

            const baseTargetY = toWorldY(e.y);
            const bob = Math.sin(sim.dist * 0.35 + worldX * 2.2) * 0.05;
            const targetY = baseTargetY + bob;
            const playerX = playerGroup ? playerGroup.position.x : -2.5;
            const playerY = playerGroup ? playerGroup.position.y : 0.35;

            if (sim.magnet > 0 && Math.abs(worldX - playerX) < 2.8) {
                // Smooth 3D magnetic attraction towards player
                elMesh.position.x = THREE.MathUtils.lerp(elMesh.position.x, playerX, delta * 8.5);
                elMesh.position.y = THREE.MathUtils.lerp(elMesh.position.y, playerY, delta * 8.5);
            } else {
                elMesh.position.set(worldX, targetY, 0.0);
            }

            if (elMesh.userData.coinBody) {
                elMesh.userData.coinBody.rotation.y += delta * 4.2;
            }
            if (elMesh.userData.orbitPivot) elMesh.userData.orbitPivot.rotation.z += delta * 8.0;
            if (elMesh.userData.orbitPivot2) elMesh.userData.orbitPivot2.rotation.x += delta * 6.5;
        }
    }

    // 3. Position active power-up pickups in horizontal space
    if (Array.isArray(sim.actors)) {
        for (const a of sim.actors) {
            if (a.kind !== 'powerup') continue;
            const worldX = toWorldX(a.x + a.w / 2);
            if (worldX < -5.5 || worldX > 5.5) continue;

            const pMesh = getPooledPowerup(a.type);
            const targetY = toWorldY(a.y) + Math.sin(sim.dist * 0.2 + a.x) * 0.08;
            pMesh.position.set(worldX, targetY, 0.0);
            pMesh.rotation.y += delta * 3.5;
            pMesh.rotation.x += delta * 2.2;
        }
    }
}

/**
 * Synchronize 3D obstacles with simulation actors.
 * @param {number} delta
 * @param {any} sim
 */
function updateObstacles(delta, sim) {
    if (!obstacleGroup || !sim || !Array.isArray(sim.actors)) return;

    for (const key of Object.keys(obstaclePool)) {
        const list = obstaclePool[key];
        for (let i = 0; i < list.length; i++) {
            list[i].visible = false;
        }
    }

    for (const a of sim.actors) {
        if (a.kind !== 'obstacle') continue;

        const worldX = toWorldX(a.x + a.w / 2);
        if (worldX < -6.0 || worldX > 6.0) continue;

        const mesh = getPooledObstacle(a.type);
        mesh.position.set(worldX, 0.20, 0.0);

        if (a.type === 'beam') {
            if (mesh.userData.beamMesh) {
                mesh.userData.beamMesh.material.opacity = 0.75 + 0.25 * Math.sin(sim.dist * 0.4);
            }
        } else if (a.type === 'relay') {
            if (mesh.userData.arm) {
                mesh.userData.arm.position.y = 0.24 + Math.sin(a.phase) * 0.12;
            }
        } else if (a.type === 'capacitor') {
            if (mesh.userData.sparkNode) {
                mesh.userData.sparkNode.rotation.y += delta * 6.0;
            }
        }
    }
}

/**
 * Updates player position, somersault, slide compression, dash trails, and particles.
 * @param {number} delta
 * @param {any} sim
 */
function updatePlayer(delta, sim) {
    if (!playerGroup || !coreMesh || !outerRingMesh || !innerRingMesh) return;

    // Fixed horizontal baseline mapping
    playerGroup.position.x = toWorldX(sim.px);
    playerGroup.position.z = 0.0;

    const baseTargetY = toWorldY(sim.py);
    const heightNorm = Math.max(0, (SIM_GROUND_Y - sim.py) / 38.0);

    if (sim.sliding) {
        // Flat horizontal aerodynamic duck
        coreMesh.scale.set(1.65, 0.38, 1.25);
        if (innerSparkMesh) innerSparkMesh.scale.set(1.5, 0.32, 1.1);
        outerRingMesh.rotation.set(0, 0, Math.PI / 2);
        innerRingMesh.rotation.set(0, 0, Math.PI / 2);
        playerGroup.position.y = 0.22;

        if (slideSparks) {
            slideSparks.visible = true;
            for (let i = 0; i < SPARK_COUNT; i++) {
                const vel = sparkVels[i];
                vel.life -= delta * 4.0;
                if (vel.life <= 0) {
                    sparkPositions[i * 3] = playerGroup.position.x - 0.15;
                    sparkPositions[i * 3 + 1] = 0.21;
                    sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
                    vel.vx = -Math.random() * 4.5 - 2.0;
                    vel.vy = Math.random() * 2.2 + 0.6;
                    vel.vz = (Math.random() - 0.5) * 1.5;
                    vel.life = 1.0;
                } else {
                    sparkPositions[i * 3] += vel.vx * delta;
                    sparkPositions[i * 3 + 1] += vel.vy * delta;
                    sparkPositions[i * 3 + 2] += vel.vz * delta;
                    vel.vy -= 9.8 * delta * 0.5;
                }
            }
            const posAttr = slideSparks.geometry.getAttribute('position');
            if (posAttr) posAttr.needsUpdate = true;
        }
    } else {
        if (slideSparks) slideSparks.visible = false;

        if (sim.dashing) {
            // Horizontal elongated missile pose
            coreMesh.scale.set(2.4, 0.75, 0.75);
            if (innerSparkMesh) innerSparkMesh.scale.set(2.1, 0.7, 0.7);
            outerRingMesh.rotation.z -= delta * 18.0;
            innerRingMesh.rotation.x += delta * 15.0;
            playerGroup.position.y = baseTargetY;
        } else {
            coreMesh.scale.set(1, 1, 1);
            if (innerSparkMesh) innerSparkMesh.scale.set(1, 1, 1);

            if (!sim.onGround) {
                // Forward somersault rotation in 3D around Z axis
                const flipSpeed = (sim.jumpsUsed >= 2 ? 22.0 : 12.0);
                playerGroup.rotation.z -= delta * flipSpeed;
                playerGroup.rotation.x *= 0.82;
                playerGroup.position.y = baseTargetY;
            } else {
                playerGroup.rotation.z *= 0.82;
                playerGroup.rotation.x *= 0.82;
                const idle = (!sim.curSpeed || sim.state === 'ready');
                const bob = idle
                    ? Math.sin((sim.idleAccum || 0) * 3.8) * 0.04
                    : Math.sin(sim.dist * 0.25) * 0.035;
                playerGroup.position.y = baseTargetY + bob;

                outerRingMesh.rotation.x += delta * 3.8;
                outerRingMesh.rotation.y += delta * 2.4;
                innerRingMesh.rotation.y += delta * 4.8;
                innerRingMesh.rotation.z += delta * 3.2;
            }
        }
    }

    if (shieldSphere) {
        shieldSphere.visible = !!sim.shield;
        if (sim.shield) {
            shieldSphere.rotation.y += delta * 3.2;
            shieldSphere.rotation.x += delta * 1.8;
            const pulse = 1.0 + Math.sin(sim.dist * 0.35) * 0.06;
            shieldSphere.scale.set(pulse, pulse, pulse);
        }
    }

    if (overclockHalo) {
        overclockHalo.visible = (sim.overclock > 0);
        if (sim.overclock > 0) {
            overclockHalo.rotation.z += delta * 14.0;
            overclockHalo.rotation.x = Math.PI / 3;
        }
    }

    if (turboFlames) {
        turboFlames.visible = (sim.turbo > 0);
        if (sim.turbo > 0) {
            const flameScale = 1.0 + Math.random() * 0.7;
            turboFlames.scale.set(flameScale, 1.0, 1.0);
        }
    }

    if (afterimages.length >= 2) {
        if (sim.dashing) {
            afterimages[0].visible = true;
            afterimages[1].visible = true;
            afterimages[0].position.set(playerGroup.position.x - 0.38, playerGroup.position.y, 0);
            afterimages[0].scale.set(1.8, 0.7, 0.7);
            afterimages[1].position.set(playerGroup.position.x - 0.76, playerGroup.position.y, 0);
            afterimages[1].scale.set(1.5, 0.65, 0.65);
        } else {
            afterimages[0].visible = false;
            afterimages[1].visible = false;
        }
    }

    // Horizontal instanced particle exhaust stream trailing to the left (-X)
    if (trailInstanced) {
        for (let i = TRAIL_COUNT - 1; i > 0; i--) {
            trailHistory[i].x = trailHistory[i - 1].x;
            trailHistory[i].y = trailHistory[i - 1].y;
            trailHistory[i].z = trailHistory[i - 1].z;
        }
        trailHistory[0].x = playerGroup.position.x - 0.25;
        trailHistory[0].y = playerGroup.position.y;
        trailHistory[0].z = playerGroup.position.z;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < TRAIL_COUNT; i++) {
            const node = trailHistory[i];
            const p = 1.0 - (i / TRAIL_COUNT);
            const scale = p * 0.085;
            dummy.position.set(node.x, node.y, node.z);
            dummy.scale.set(scale * 1.8, scale, scale);
            dummy.updateMatrix();
            trailInstanced.setMatrixAt(i, dummy.matrix);
        }
        trailInstanced.instanceMatrix.needsUpdate = true;
    }

    if (playerShadow) {
        playerShadow.position.set(playerGroup.position.x, 0.21, 0);
        const shadowOpacity = Math.max(0.08, 0.55 - heightNorm * 0.38);
        /** @type {THREE.MeshBasicMaterial} */ (playerShadow.material).opacity = shadowOpacity;
        const shadowScale = Math.max(0.6, 1.0 - heightNorm * 0.3);
        playerShadow.scale.set(shadowScale, shadowScale, shadowScale);
    }

    if (playerLight) {
        playerLight.position.set(playerGroup.position.x, playerGroup.position.y + 0.2, 0.6);
        if (sim.dashing) {
            playerLight.color.setHex(0x00ffff);
            playerLight.intensity = 5.2;
        } else if (sim.overclock > 0) {
            playerLight.color.setHex(0xffcc00);
            playerLight.intensity = 4.5;
        } else if (sim.shield) {
            playerLight.color.setHex(0x38bdf8);
            playerLight.intensity = 4.0;
        } else {
            playerLight.color.setHex(0x3ee6a0);
            playerLight.intensity = 3.5;
        }
    }
}

/**
 * Main 3D Game Render Step — called per frame while game is active.
 * @param {number} delta
 * @param {any} sim - Live simulation snapshot from lcd-sim.js
 */
export function update3dGame(delta, sim) {
    if (!isInitialized || !gameRenderer || !gameScene || !gameCamera || !sim) return;

    // 1. Detect State Transitions (Crash / Restart)
    if (sim.state !== lastSimState) {
        if (sim.state === 'over') {
            const curX = playerGroup ? playerGroup.position.x : -2.5;
            const curY = playerGroup ? playerGroup.position.y : 0.35;
            trigger3dCrash(curX, curY);
        } else if (sim.state === 'playing' || sim.state === 'count' || sim.state === 'ready') {
            if (shatterGroup) shatterGroup.visible = false;
            if (playerGroup) playerGroup.visible = true;
            if (signalLostMesh) signalLostMesh.visible = false;
        }
        lastSimState = sim.state;
    }

    // 2. Camera FOV Speed Warp & Jump Tilt Kinematics
    const targetFov = sim.dashing ? 68.0 : (sim.turbo > 0 ? 64.0 : 54.0);
    currentCameraFov = THREE.MathUtils.lerp(currentCameraFov, targetFov, delta * 6.0);
    gameCamera.fov = currentCameraFov;
    gameCamera.updateProjectionMatrix();

    // Jump 2° camera tilt and landing compression shake
    const isJumping = !sim.onGround;
    const targetRoll = isJumping ? -0.035 : 0; // ~2 degrees
    const targetPitch = isJumping ? 0.022 : 0;
    gameCamera.rotation.z = THREE.MathUtils.lerp(gameCamera.rotation.z, targetRoll, delta * 9.0);
    gameCamera.rotation.x = THREE.MathUtils.lerp(gameCamera.rotation.x, targetPitch, delta * 9.0);

    if (wasJumpingIn3d && sim.onGround && sim.state === 'playing') {
        cameraShake = Math.max(cameraShake, 0.28);
        wasJumpingIn3d = false;
    } else if (!sim.onGround) {
        wasJumpingIn3d = true;
    }

    // 3. Camera Shake Decay & Jitter
    if (sim.electrons > lastObservedElectrons) {
        cameraShake = Math.max(cameraShake, 0.16);
        lastObservedElectrons = sim.electrons;
    } else if (sim.electrons < lastObservedElectrons) {
        lastObservedElectrons = sim.electrons;
    }
    if (sim.combo > lastObservedCombo) {
        cameraShake = Math.max(cameraShake, 0.28);
        lastObservedCombo = sim.combo;
    } else if (sim.combo < lastObservedCombo) {
        lastObservedCombo = sim.combo;
    }

    if (cameraShake > 0) {
        cameraShake = Math.max(0, cameraShake - delta * 4.2);
    }
    const shakeX = (Math.random() - 0.5) * cameraShake * 0.08;
    const shakeY = (Math.random() - 0.5) * cameraShake * 0.08;

    // 4. Update Camera Position with Subtle Dynamic Reactions
    const bob = (!motionPrefs.reduced && sim.state === 'playing') ? Math.sin(sim.dist * 0.25) * 0.02 : 0;
    gameCamera.position.set(shakeX, 1.45 + bob + shakeY, 5.2);
    gameCamera.lookAt(0.2 + shakeX, 0.95, 0.0);

    // 5. Update Holographic Sky Oscilloscope Waveform Line
    if (skyScopeLine && skyScopeLine.geometry) {
        const posAttr = /** @type {THREE.BufferAttribute} */ (skyScopeLine.geometry.attributes.position);
        const arr = posAttr.array;
        const t = (sim.dist || 0) * 0.18;
        const isOverclock = sim.overclock > 0 || sim.dist >= 1000;
        for (let i = 0; i < SKY_SCOPE_PTS; i++) {
            const xNorm = i / SKY_SCOPE_PTS;
            const wave = Math.sin(xNorm * (isOverclock ? 32 : 18) + t) * Math.cos(xNorm * 8 + t * 0.4) * (isOverclock ? 1.4 : 0.95);
            arr[i * 3 + 1] = 6.2 + wave;
        }
        posAttr.needsUpdate = true;
    }

    // 6. Blink IC Monolith Status LEDs
    monolithLeds.forEach((item) => {
        item.phase += delta * item.freq;
        const bright = Math.sin(item.phase) > 0.15 ? 1.0 : 0.15;
        if (item.led.material instanceof THREE.MeshBasicMaterial) {
            item.led.material.opacity = bright;
        }
    });

    // 7. Drift Volumetric Electron Dust Particles
    if (electronDust && electronDust.geometry) {
        const dPos = /** @type {THREE.BufferAttribute} */ (electronDust.geometry.attributes.position);
        const dArr = dPos.array;
        const driftX = (sim.curSpeed || 85) * delta * 0.035;
        for (let i = 0; i < DUST_COUNT; i++) {
            dArr[i * 3] -= driftX;
            if (dArr[i * 3] < -12) {
                dArr[i * 3] += 24;
                dArr[i * 3 + 1] = Math.random() * 5.0 + 0.2;
            }
        }
        dPos.needsUpdate = true;
    }

    // 8. Update Shatter Shards if game is over
    if (sim.state === 'over' && shatterGroup && shatterGroup.visible) {
        for (let i = 0; i < SHARD_COUNT; i++) {
            const s = shardData[i];
            s.mesh.position.x += s.vx * delta;
            s.mesh.position.y += s.vy * delta;
            s.mesh.position.z += s.vz * delta;
            s.vy -= 9.8 * delta;
            if (s.mesh.position.y < 0.21) {
                s.mesh.position.y = 0.21;
                s.vy = -s.vy * 0.45; // elastic copper bounce
                s.vx *= 0.85; // friction
                s.vz *= 0.85;
            }
            s.mesh.rotation.x += s.rx * delta;
            s.mesh.rotation.y += s.ry * delta;
            s.mesh.rotation.z += s.rz * delta;
        }
        if (signalLostMesh && signalLostMesh.visible) {
            signalLostMesh.position.y = 1.75 + Math.sin(sim.overAccum ? sim.overAccum * 3.5 : 0) * 0.04;
        }
    } else {
        // 9. Advance Track Tiles horizontally to the left (-X) based on speed
        const trackSpeed = sim.curSpeed || 85;
        const scrollX = (trackSpeed * delta * 0.045);

        if (trackTiles.length > 0) {
            for (let i = 0; i < trackTiles.length; i++) {
                const tile = trackTiles[i];
                tile.position.x -= scrollX;
                if (tile.position.x < -14.0) {
                    let maxX = -14.0;
                    for (let j = 0; j < trackTiles.length; j++) {
                        if (trackTiles[j].position.x > maxX) maxX = trackTiles[j].position.x;
                    }
                    tile.position.x = maxX + SEGMENT_WIDTH;
                }
            }
        }

        // 10. Update 3D Obstacles
        updateObstacles(delta, sim);

        // 11. Update 3D Collectibles & Power-ups
        updateCollectibles(delta, sim);

        // 12. Update 3D Cyber-Pulse Avatar
        updatePlayer(delta, sim);
    }

    // 13. Render 3D Scene
    gameRenderer.render(gameScene, gameCamera);
}

/**
 * Dynamically resize the 3D game viewport to match full browser dimensions.
 */
export function resize3dGame() {
    if (!gameRenderer || !gameCamera || !boundCanvas) return;
    if (typeof window === 'undefined') return;
    if (boundCanvas.id !== 'diag-sim-canvas') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    boundCanvas.width = w;
    boundCanvas.height = h;
    gameCamera.aspect = w / h;
    gameCamera.updateProjectionMatrix();
    gameRenderer.setSize(w, h, false);
}

/**
 * Returns whether 3D engine is active and ready.
 */
export function is3dGameReady() {
    return isInitialized && boundCanvas !== null;
}

/**
 * Returns the CRT canvas element.
 */
export function get3dGameCanvas() {
    return boundCanvas;
}

/**
 * Returns the offscreen / rendered 3D canvas element.
 * @returns {HTMLCanvasElement | null}
 */
export function get3dCanvas() {
    return boundCanvas;
}

