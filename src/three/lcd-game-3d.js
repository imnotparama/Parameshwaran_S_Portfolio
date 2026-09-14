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
let horizonGroup = null;

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
let currentCameraFov = 62;
let lastSimState = 'off';
let lastObservedElectrons = 0;
let lastObservedCombo = 1;

/** @type {THREE.MeshStandardMaterial | null} */
let copperRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let neonRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let trackFloorMat = null;

/** @type {boolean} */
let isInitialized = false;

/**
 * Initialize the 3D game engine. If no canvas is provided, creates an offscreen canvas.
 * Safe in headless environments: returns false if WebGL is unavailable.
 * @param {HTMLCanvasElement | null} [canvas]
 * @returns {boolean}
 */
export function init3dGame(canvas = null) {
    if (isInitialized) return true;
    if (typeof document === 'undefined') return false;

    let targetCanvas = canvas;
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
    boundCanvas.width = CRT_W;
    boundCanvas.height = CRT_H;

    // 1. Create Game Scene
    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x020a06);
    gameScene.fog = new THREE.FogExp2(0x020a06, 0.035);

    // 2. Cinematic 2.5D Side-Perspective Camera
    gameCamera = new THREE.PerspectiveCamera(56, CRT_W / CRT_H, 0.1, 100);
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
        gameRenderer.setSize(CRT_W, CRT_H, false);
        gameRenderer.setPixelRatio(1);
        gameRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        gameRenderer.toneMappingExposure = 1.35;
    } catch (err) {
        console.warn('Could not initialize WebGLRenderer for Signal Runner 3D:', err);
        return false;
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

/**
 * Builds distant glowing motherboard city, IC monoliths, and cyber grid.
 */
function buildHorizon() {
    if (!gameScene) return;

    horizonGroup = new THREE.Group();
    gameScene.add(horizonGroup);

    // 1. Monolithic 3D BGA Chips in background (-Z)
    const chipMat = new THREE.MeshStandardMaterial({
        color: 0x0a1c12,
        roughness: 0.4,
        metalness: 0.8,
        emissive: 0x05120a,
        emissiveIntensity: 0.3
    });

    const heatsinkMat = new THREE.MeshStandardMaterial({
        color: 0x183022,
        roughness: 0.2,
        metalness: 0.9,
        wireframe: true
    });

    const chipPositions = [
        { x: -9, y: 1.8, z: -5.5, w: 3.5, h: 2.2, d: 2.5 },
        { x: -4, y: 3.2, z: -8.0, w: 4.0, h: 4.5, d: 3.0 },
        { x: 2, y: 2.2, z: -6.0, w: 3.2, h: 2.8, d: 2.5 },
        { x: 8, y: 3.8, z: -9.5, w: 5.0, h: 5.0, d: 3.5 },
        { x: -14, y: 4.5, z: -12.0, w: 6.0, h: 6.5, d: 4.0 },
        { x: 14, y: 4.0, z: -11.0, w: 5.5, h: 5.5, d: 3.8 }
    ];

    for (const cp of chipPositions) {
        const chip = new THREE.Mesh(new THREE.BoxGeometry(cp.w, cp.h, cp.d), chipMat);
        chip.position.set(cp.x, cp.y, cp.z);
        horizonGroup.add(chip);

        const fins = new THREE.Mesh(new THREE.BoxGeometry(cp.w * 0.9, 0.4, cp.d * 0.9), heatsinkMat);
        fins.position.set(cp.x, cp.y + cp.h / 2 + 0.2, cp.z);
        horizonGroup.add(fins);
    }

    // 2. Distant cylindrical ferrite choke coils
    const chokeGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16);
    const chokeMat = new THREE.MeshStandardMaterial({
        color: 0x9b6b28,
        metalness: 0.85,
        roughness: 0.3
    });
    for (let c = 0; c < 5; c++) {
        const choke = new THREE.Mesh(chokeGeo, chokeMat);
        choke.position.set(-10 + c * 5.0, 1.2, -4.2);
        horizonGroup.add(choke);
    }

    // 3. Glowing Cyber Horizon Data Grid
    const gridHelper = new THREE.GridHelper(50, 50, 0x3ee6a0, 0x0c3820);
    gridHelper.position.set(0, -0.05, -7);
    horizonGroup.add(gridHelper);
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

    const shardGeo = new THREE.TetrahedronGeometry(0.075, 0);
    const shardMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 3.5,
        roughness: 0.2
    });

    shardData = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
        const shard = new THREE.Mesh(shardGeo, shardMat);
        shatterGroup.add(shard);
        shardData.push({
            mesh: shard,
            vx: 0,
            vy: 0,
            vz: 0,
            rx: (Math.random() - 0.5) * 16,
            ry: (Math.random() - 0.5) * 16,
            rz: (Math.random() - 0.5) * 16
        });
    }
}

function trigger3dCrash(playerY = 0.28) {
    if (!shatterGroup || !playerGroup) return;
    shatterGroup.visible = true;
    playerGroup.visible = false;
    cameraShake = 0.65;

    for (let i = 0; i < SHARD_COUNT; i++) {
        const s = shardData[i];
        s.mesh.position.set(0, playerY, 0);
        const speed = 2.4 + Math.random() * 3.8;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.3) * Math.PI * 0.5;
        s.vx = Math.cos(theta) * Math.cos(phi) * speed;
        s.vy = Math.sin(phi) * speed + 1.8;
        s.vz = Math.sin(theta) * Math.cos(phi) * speed;
    }

    if (signalLostMesh) {
        signalLostMesh.visible = true;
        signalLostMesh.position.set(0, 1.1, -1.8);
    }
}

function buildSignalLostBanner() {
    if (!gameScene) return;

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 256;
    bannerCanvas.height = 64;
    const ctx = bannerCanvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'rgba(3, 19, 10, 0.85)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = '#3ee6a0';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 248, 56);
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SIGNAL LOST', 128, 30);
        ctx.fillStyle = '#3ee6a0';
        ctx.font = '12px monospace';
        ctx.fillText('ENTER // RETRY', 128, 48);
    }

    const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
    const bannerGeo = new THREE.PlaneGeometry(1.6, 0.4);
    const bannerMat = new THREE.MeshBasicMaterial({
        map: bannerTexture,
        transparent: true,
        opacity: 0.95
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

    const coreGeo = new THREE.OctahedronGeometry(0.10, 0);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffaa00,
        emissiveIntensity: 2.8,
        roughness: 0.15,
        metalness: 0.85
    });

    const satGeo = new THREE.SphereGeometry(0.028, 6, 6);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    for (let i = 0; i < ELECTRON_POOL_SIZE; i++) {
        const el = new THREE.Group();
        const core = new THREE.Mesh(coreGeo, coreMat);
        el.add(core);

        // Orbit 1: Tilted X
        const orbitPivot = new THREE.Group();
        orbitPivot.rotation.x = Math.PI / 4;
        const sat1 = new THREE.Mesh(satGeo, satMat);
        sat1.position.set(0.18, 0, 0);
        orbitPivot.add(sat1);
        el.add(orbitPivot);

        // Orbit 2: Tilted Y/Z
        const orbitPivot2 = new THREE.Group();
        orbitPivot2.rotation.y = Math.PI / 3;
        orbitPivot2.rotation.z = Math.PI / 6;
        const sat2 = new THREE.Mesh(satGeo, satMat);
        sat2.position.set(0, 0.18, 0);
        orbitPivot2.add(sat2);
        el.add(orbitPivot2);

        el.userData = { core, orbitPivot, orbitPivot2 };
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

            const targetY = toWorldY(e.y);
            const playerX = playerGroup ? playerGroup.position.x : -2.5;
            const playerY = playerGroup ? playerGroup.position.y : 0.35;

            if (sim.magnet > 0 && Math.abs(worldX - playerX) < 2.8) {
                // Smooth 3D magnetic attraction towards player
                elMesh.position.x = THREE.MathUtils.lerp(elMesh.position.x, playerX, delta * 8.5);
                elMesh.position.y = THREE.MathUtils.lerp(elMesh.position.y, playerY, delta * 8.5);
            } else {
                elMesh.position.set(worldX, targetY, 0.0);
            }

            if (elMesh.userData.core) {
                elMesh.userData.core.rotation.y += delta * 4.5;
                elMesh.userData.core.rotation.z += delta * 3.0;
            }
            if (elMesh.userData.orbitPivot) elMesh.userData.orbitPivot.rotation.z += delta * 8.5;
            if (elMesh.userData.orbitPivot2) elMesh.userData.orbitPivot2.rotation.x += delta * 7.0;
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
            const curY = playerGroup ? playerGroup.position.y : 0.28;
            trigger3dCrash(curY);
        } else if (sim.state === 'playing' || sim.state === 'count' || sim.state === 'ready') {
            if (shatterGroup) shatterGroup.visible = false;
            if (playerGroup) playerGroup.visible = true;
            if (signalLostMesh) signalLostMesh.visible = false;
        }
        lastSimState = sim.state;
    }

    // 2. Camera FOV Speed Warp
    const targetFov = sim.dashing ? 68.0 : (sim.turbo > 0 ? 64.0 : 56.0);
    currentCameraFov = THREE.MathUtils.lerp(currentCameraFov, targetFov, delta * 6.0);
    gameCamera.fov = currentCameraFov;
    gameCamera.updateProjectionMatrix();

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

    // 5. Update Shatter Shards if game is over
    if (sim.state === 'over' && shatterGroup && shatterGroup.visible) {
        for (let i = 0; i < SHARD_COUNT; i++) {
            const s = shardData[i];
            s.mesh.position.x += s.vx * delta;
            s.mesh.position.y += s.vy * delta;
            s.mesh.position.z += s.vz * delta;
            s.vy -= 9.8 * delta;
            if (s.mesh.position.y < 0.04) {
                s.mesh.position.y = 0.04;
                s.vy = -s.vy * 0.42; // bounce
            }
            s.mesh.rotation.x += s.rx * delta;
            s.mesh.rotation.y += s.ry * delta;
            s.mesh.rotation.z += s.rz * delta;
        }
        if (signalLostMesh && signalLostMesh.visible) {
            signalLostMesh.position.y = 1.6 + Math.sin(sim.dist * 0.4) * 0.03;
        }
    } else {
        // 6. Advance Track Tiles horizontally to the left (-X) based on speed
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

        // 7. Update 3D Obstacles
        updateObstacles(delta, sim);

        // 8. Update 3D Collectibles & Power-ups
        updateCollectibles(delta, sim);

        // 9. Update 3D Cyber-Pulse Avatar
        updatePlayer(delta, sim);
    }

    // 10. Render 3D Sub-Scene to CRT canvas
    gameRenderer.render(gameScene, gameCamera);
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
