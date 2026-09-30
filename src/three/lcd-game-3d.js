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

// Dynamic Electromagnetic Movement VFX
/** @type {THREE.Mesh | null} */
let jumpRippleMesh = null;
let jumpRippleLife = 0;

/** @type {THREE.Mesh | null} */
let landingVibrationMesh = null;
let landingVibrationLife = 0;

/** @type {THREE.Mesh | null} */
let chargeFlashMesh = null;
let chargeFlashLife = 0;

// Parallax Layer 6: 3D AI Neural Network Graph
/** @type {Array<THREE.Mesh>} */
const neuralNodes = [];
/** @type {THREE.LineSegments | null} */
let neuralSynapses = null;
/** @type {Array<{ pulsePos: number, speed: number, from: THREE.Vector3, to: THREE.Vector3, mesh: THREE.Mesh }>} */
const synapticPulses = [];

// Parallax Layer 2: Robotic Gantry Arm
/** @type {THREE.Group | null} */
let gantryArmGroup = null;
/** @type {THREE.Mesh | null} */
let armSegmentMesh = null;
/** @type {Array<THREE.Group>} */
const foupPods = [];

// Parallax Layer 5: Datacenter Server Racks
/** @type {Array<{ mesh: THREE.Mesh, leds: Array<THREE.MeshBasicMaterial> }>} */
const serverRackUnits = [];

// Layer 1: Moving electric current pulses on copper highway
/** @type {Array<THREE.Mesh>} */
const trackCurrentPulses = [];

// Silicon Megafactory Atmosphere, Zones, & Machinery
/** @type {THREE.DirectionalLight | null} */
let mainDirLight = null;
/** @type {THREE.PointLight | null} */
let emergencyAlarmLight = null;
let facilityCycleTime = 0;
let activeZoneIndex = 0;

/** @type {THREE.Group | null} */
let horizonGroup = null;
let bgFocusLevel = 0; // 0 = CALM (distant, dark, muted silhouette), 1 = MINIMAL (pure void, zero background)

/**
 * Toggles background visual mode between Calm Focus (0) and Ultra-Minimal Void (1).
 * @returns {number}
 */
export function toggleBgFocus() {
    bgFocusLevel = (bgFocusLevel + 1) % 2;
    if (horizonGroup) {
        horizonGroup.visible = (bgFocusLevel === 0);
    }
    return bgFocusLevel;
}

/**
 * Returns current background focus level.
 * @returns {number}
 */
export function getBgFocusLevel() {
    return bgFocusLevel;
}

const FOUNDRY_ZONES = [
    { name: 'ZONE 1: WAFER FABRICATION', distMin: 0, distMax: 300, lightCol: 0x3ee6a0, fogCol: 0x010804 },
    { name: 'ZONE 2: EUV LITHOGRAPHY & PLASMA', distMin: 300, distMax: 700, lightCol: 0x22d3ee, fogCol: 0x010609 },
    { name: 'ZONE 3: ROBOTIC CPU ASSEMBLY', distMin: 700, distMax: 1200, lightCol: 0x10b981, fogCol: 0x010805 },
    { name: 'ZONE 4: AI SUPERCOMPUTING CORE', distMin: 1200, distMax: 1800, lightCol: 0x38bdf8, fogCol: 0x01060a },
    { name: 'ZONE 5: CRYOGENIC FUSION REACTOR', distMin: 1800, distMax: 99999, lightCol: 0x34d399, fogCol: 0x010705 }
];

/** @type {THREE.Group | null} */
let siliconWaferGroup = null;

/** @type {Array<{ bladeMesh: THREE.Group }>} */
const ventilationFans = [];

/** @type {THREE.Group | null} */
let weldingRobotArm = null;
/** @type {THREE.Mesh | null} */
let weldingForearm = null;

/** @type {THREE.Points | null} */
let weldingSparkParticles = null;
const WELDING_SPARK_COUNT = 24;
let weldingSparkPositions = new Float32Array(WELDING_SPARK_COUNT * 3);
/** @type {Array<{ vx: number, vy: number, vz: number, life: number }>} */
let weldingSparkVels = [];

/** @type {THREE.Group | null} */
let inspectionDrone = null;

/** @type {Array<THREE.Mesh>} */
const cryoCoolantPulses = [];

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
    gameScene.background = new THREE.Color(0x010503);
    gameScene.fog = new THREE.FogExp2(0x010503, 0.045);

    // 2. Cinematic 2.5D Side-Perspective Camera
    const aspect = initW / initH;
    gameCamera = new THREE.PerspectiveCamera(52, aspect, 0.1, 100);
    gameCamera.position.set(0.0, 1.05, 4.4);
    gameCamera.lookAt(0.2, 0.78, 0.0);

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
        gameRenderer.toneMappingExposure = 1.35;
    } catch (err) {
        console.warn('Could not initialize WebGLRenderer for Signal Runner 3D:', err);
        return false;
    }

    if (isFullscreen && typeof window !== 'undefined') {
        window.addEventListener('resize', resize3dGame);
    }


    // 4. Calibrated Lighting Rig: Soothing, Glare-Free Ambient & Soft Directional Light
    const ambientLight = new THREE.AmbientLight(0x06140c, 1.2);
    gameScene.add(ambientLight);

    mainDirLight = new THREE.DirectionalLight(0x3ee6a0, 1.6);
    mainDirLight.position.set(2, 6, 4);
    gameScene.add(mainDirLight);

    emergencyAlarmLight = new THREE.PointLight(0xff1122, 0.0, 18.0);
    emergencyAlarmLight.position.set(0, 7.0, -3.5);
    gameScene.add(emergencyAlarmLight);

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

        // High-speed 100Ω Differential Microstrip Trace Pairs
        const diffTraceGeo = new THREE.PlaneGeometry(SEGMENT_WIDTH, 0.018);
        diffTraceGeo.rotateX(-Math.PI / 2);
        const diffTraceMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.7 });
        const dt1 = new THREE.Mesh(diffTraceGeo, diffTraceMat);
        dt1.position.set(0, 0.166, 0.38);
        tile.add(dt1);
        const dt2 = new THREE.Mesh(diffTraceGeo, diffTraceMat);
        dt2.position.set(0, 0.166, 0.42);
        tile.add(dt2);

        // Solder mask gold test pads (TP1, TP2)
        const padGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            metalness: 0.95,
            roughness: 0.15,
            emissive: 0xaa8800,
            emissiveIntensity: 0.5
        });
        const tp1 = new THREE.Mesh(padGeo, padMat);
        tp1.position.set(-SEGMENT_WIDTH / 4, 0.17, -0.42);
        tile.add(tp1);
        const tp2 = new THREE.Mesh(padGeo, padMat);
        tp2.position.set(SEGMENT_WIDTH / 4, 0.17, -0.42);
        tile.add(tp2);

        // Position tiles along X
        tile.position.set(-12 + i * SEGMENT_WIDTH, 0, 0);

        trackGroup.add(tile);
        trackTiles.push(tile);
    }

    // Moving electric current pulses inside copper traces (Layer 1)
    trackCurrentPulses.length = 0;
    const pulseGeo = new THREE.BoxGeometry(0.45, 0.022, 0.04);
    const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.85
    });
    for (let p = 0; p < 10; p++) {
        const cp = new THREE.Mesh(pulseGeo, pulseMat);
        cp.position.set(-14 + p * 2.8, 0.18, p % 2 === 0 ? 0.40 : -0.40);
        gameScene.add(cp);
        trackCurrentPulses.push(cp);
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

    // Pin 1 indicator dot
    ctx.fillStyle = '#3ee6a0';
    ctx.beginPath();
    ctx.arc(28, 28, 8, 0, Math.PI * 2);
    ctx.fill();

    if (label.includes('PRM-NPU')) {
        // Render 8x8 Tensor Processing Unit Matrix Die Grid
        ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
        ctx.fillRect(40, 48, 176, 110);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(40, 48, 176, 110);

        for (let r = 0; r < 6; r++) {
            for (let k = 0; k < 10; k++) {
                ctx.fillStyle = ((r + k) % 3 === 0) ? '#3ee6a0' : '#114428';
                ctx.fillRect(46 + k * 16, 54 + r * 16, 12, 12);
            }
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, 128, 185);

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ffd875';
        ctx.fillText(sub, 128, 205);

        ctx.font = '10px monospace';
        ctx.fillStyle = '#3ee6a0';
        ctx.fillText('PARAMESHWARAN S // SILICON CORE', 128, 224);
    } else {
        ctx.fillStyle = 'rgba(230, 245, 235, 0.9)';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, 128, 115);

        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(62, 230, 160, 0.85)';
        ctx.fillText(sub, 128, 145);

        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(0, 255, 204, 0.65)';
        ctx.fillText('DIAGNOSTIC ARCHITECTURE', 128, 175);
    }

    return new THREE.CanvasTexture(c);
}

/**
 * Builds Parallax Layer 2: Overhead Automated Pick-and-Place & Laser Soldering Gantry.
 * @param {THREE.Group} hGroup
 */
function buildRoboticGantry(hGroup) {
    gantryArmGroup = new THREE.Group();
    gantryArmGroup.position.set(0, 8.2, -18.0);

    // Overhead transverse gantry rail spanning across scene
    const railGeo = new THREE.BoxGeometry(32.0, 0.35, 0.55);
    const railMat = new THREE.MeshStandardMaterial({
        color: 0x1a2620,
        metalness: 0.9,
        roughness: 0.25
    });
    const rail = new THREE.Mesh(railGeo, railMat);
    gantryArmGroup.add(rail);

    // Stepper Carriage Head
    const carriageGeo = new THREE.BoxGeometry(1.6, 0.5, 0.8);
    const carriageMat = new THREE.MeshStandardMaterial({
        color: 0x273b30,
        metalness: 0.8,
        roughness: 0.3
    });
    const carriage = new THREE.Mesh(carriageGeo, carriageMat);
    carriage.position.set(0, -0.2, 0);
    gantryArmGroup.add(carriage);

    // Articulated robotic arm segments
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10);
    const armMat = new THREE.MeshStandardMaterial({
        color: 0x3d5a49,
        metalness: 0.85,
        roughness: 0.2
    });
    armSegmentMesh = new THREE.Mesh(armGeo, armMat);
    armSegmentMesh.position.set(0, -1.0, 0);
    gantryArmGroup.add(armSegmentMesh);

    // Laser soldering diode nozzle
    const nozzleGeo = new THREE.ConeGeometry(0.12, 0.45, 12);
    const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0xd49b38,
        metalness: 0.95,
        roughness: 0.15
    });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, -1.9, 0);
    gantryArmGroup.add(nozzle);

    hGroup.add(gantryArmGroup);
}

/**
 * Builds overhead cleanroom automated wafer carrier pods (FOUPs on OHT ceiling monorail track).
 * @param {THREE.Group} hGroup
 */
function buildFoupMonorail(hGroup) {
    foupPods.length = 0;
    // Overhead ceiling monorail guide rail in upper rafters
    const monorailGeo = new THREE.BoxGeometry(40.0, 0.22, 0.35);
    const monorailMat = new THREE.MeshStandardMaterial({
        color: 0x16221c,
        metalness: 0.9,
        roughness: 0.22
    });
    const monorail = new THREE.Mesh(monorailGeo, monorailMat);
    monorail.position.set(0, 8.5, -16.0);
    hGroup.add(monorail);

    // 3 FOUP pods carrying 300mm silicon wafers
    const podBodyGeo = new THREE.BoxGeometry(1.3, 0.75, 0.9);
    const podBodyMat = new THREE.MeshStandardMaterial({
        color: 0x0a1a14,
        metalness: 0.8,
        roughness: 0.28,
        emissive: 0x02140e,
        emissiveIntensity: 0.3
    });
    const podLedMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

    for (let i = 0; i < 3; i++) {
        const podGrp = new THREE.Group();
        const podBody = new THREE.Mesh(podBodyGeo, podBodyMat);
        podGrp.add(podBody);

        // Indicator LED on front of pod
        const pLed = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), podLedMat);
        pLed.position.set(0.55, 0, 0.46);
        podGrp.add(pLed);

        // Clear acrylic wafer inspection window
        const winGeo = new THREE.PlaneGeometry(0.7, 0.35);
        const winMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0, transparent: true, opacity: 0.4 });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(0, 0.05, 0.46);
        podGrp.add(win);

        podGrp.position.set(-14 + i * 14, 8.0, -16.0);
        hGroup.add(podGrp);
        foupPods.push(podGrp);
    }
}

/**
 * Builds Parallax Layer 5: Datacenter Server Racks (Data Science & Cloud Compute Backbone).
 * @param {THREE.Group} hGroup
 */
function buildServerRacks(hGroup) {
    serverRackUnits.length = 0;
    const rackGeo = new THREE.BoxGeometry(2.4, 7.5, 2.2);
    const rackMat = new THREE.MeshStandardMaterial({
        color: 0x07110b,
        metalness: 0.85,
        roughness: 0.35,
        emissive: 0x020704,
        emissiveIntensity: 0.2
    });

    const rackPositions = [-18.5, -15.5, 15.5, 18.5];
    const ledGeo = new THREE.BoxGeometry(0.06, 0.03, 0.02);

    rackPositions.forEach((posX, rIdx) => {
        const rack = new THREE.Mesh(rackGeo, rackMat);
        rack.position.set(posX, 4.5, -20.5);
        hGroup.add(rack);

        // Rack front panel louvers & cascading LEDs
        const rackLeds = [];
        for (let u = 0; u < 14; u++) {
            const yPos = 1.5 + u * 0.45;
            const ledMat = new THREE.MeshBasicMaterial({
                color: (u + rIdx) % 3 === 0 ? 0x00ffff : ((u + rIdx) % 3 === 1 ? 0x3ee6a0 : 0xffdd44),
                transparent: true,
                opacity: 0.5
            });
            const led1 = new THREE.Mesh(ledGeo, ledMat);
            led1.position.set(posX - 0.7, yPos, -19.38);
            hGroup.add(led1);

            const led2 = new THREE.Mesh(ledGeo, ledMat);
            led2.position.set(posX + 0.7, yPos, -19.38);
            hGroup.add(led2);

            rackLeds.push(ledMat);
        }
        serverRackUnits.push({ mesh: rack, leds: rackLeds });
    });
}

/**
 * Builds Parallax Layer 6: 3D AI Neural Network Sky Graph.
 * @param {THREE.Group} hGroup
 */
function buildNeuralNetworkSkyGraph(hGroup) {
    neuralNodes.length = 0;
    synapticPulses.length = 0;

    const layerDefs = [
        { count: 5, x: -6.5, z: -14.0, col: 0x3ee6a0 }, // Input layer
        { count: 8, x: -2.2, z: -14.8, col: 0x00ffff }, // Hidden Layer 1
        { count: 8, x: 2.2, z: -14.8, col: 0x00ffff },  // Hidden Layer 2
        { count: 4, x: 6.5, z: -14.0, col: 0xffdd44 }   // Output layer
    ];

    const nodeGeo = new THREE.SphereGeometry(0.11, 8, 8);
    /** @type {Array<Array<THREE.Vector3>>} */
    const layers = [];
    /** @type {Array<number>} */
    const synapseLineCoords = [];

    layerDefs.forEach((ld, lIdx) => {
        const layerNodes = [];
        const ySpan = ld.count * 0.48;
        const yStart = 6.2 - ySpan / 2;

        for (let n = 0; n < ld.count; n++) {
            const y = yStart + n * 0.52;
            const pos = new THREE.Vector3(ld.x, y, ld.z);
            const mat = new THREE.MeshBasicMaterial({ color: ld.col });
            const nodeMesh = new THREE.Mesh(nodeGeo, mat);
            nodeMesh.position.copy(pos);
            hGroup.add(nodeMesh);
            neuralNodes.push(nodeMesh);
            layerNodes.push(pos);
        }
        layers.push(layerNodes);

        // Connect layer to previous layer with synapses
        if (lIdx > 0) {
            const prevLayer = layers[lIdx - 1];
            for (let i = 0; i < prevLayer.length; i++) {
                for (let j = 0; j < layerNodes.length; j++) {
                    if ((i + j) % 2 === 0) {
                        const from = prevLayer[i];
                        const to = layerNodes[j];
                        synapseLineCoords.push(from.x, from.y, from.z, to.x, to.y, to.z);

                        if (synapticPulses.length < 18 && (i + j) % 3 === 0) {
                            const pulseGeo = new THREE.SphereGeometry(0.045, 6, 6);
                            const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                            const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
                            hGroup.add(pulseMesh);
                            synapticPulses.push({
                                pulsePos: Math.random(),
                                speed: 0.4 + Math.random() * 0.6,
                                from,
                                to,
                                mesh: pulseMesh
                            });
                        }
                    }
                }
            }
        }
    });

    const synGeo = new THREE.BufferGeometry();
    synGeo.setAttribute('position', new THREE.Float32BufferAttribute(synapseLineCoords, 3));
    const synMat = new THREE.LineBasicMaterial({
        color: 0x175836,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    neuralSynapses = new THREE.LineSegments(synGeo, synMat);
    hGroup.add(neuralSynapses);
}

/**
 * Builds Far Distance: Holographic Wireframe Circuit Skyline.
 * @param {THREE.Group} hGroup
 */
function buildHolographicCity(hGroup) {
    const cityMat = new THREE.MeshBasicMaterial({
        color: 0x0b3820,
        wireframe: true,
        transparent: true,
        opacity: 0.28
    });

    const towerDefs = [
        { x: -22, z: -22, w: 4.5, h: 14, d: 4.5 },
        { x: -14, z: -24, w: 5.0, h: 18, d: 5.0 },
        { x: -6, z: -25, w: 4.0, h: 16, d: 4.0 },
        { x: 3, z: -23, w: 5.5, h: 20, d: 5.5 },
        { x: 11, z: -25, w: 4.2, h: 15, d: 4.2 },
        { x: 18, z: -22, w: 5.0, h: 17, d: 5.0 }
    ];

    towerDefs.forEach(td => {
        const towerGeo = new THREE.BoxGeometry(td.w, td.h, td.d);
        const tower = new THREE.Mesh(towerGeo, cityMat);
        tower.position.set(td.x, td.h / 2 - 1.0, td.z);
        hGroup.add(tower);
    });
}

/**
 * Generates a high-resolution patterned semiconductor silicon wafer texture.
 * @returns {THREE.CanvasTexture | null}
 */
function createSiliconWaferTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#060f09';
    ctx.fillRect(0, 0, 512, 512);

    // Outer circular boundary with mirror chrome bevel
    ctx.strokeStyle = '#22553b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric lithography step-and-repeat ring zones
    const ringRadii = [60, 110, 160, 200, 230];
    ringRadii.forEach((r, idx) => {
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(62, 230, 160, 0.35)' : 'rgba(0, 255, 204, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(256, 256, r, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Rectangular semiconductor dies matrix (silicon processors before dicing)
    const dieW = 20;
    const dieH = 20;
    const gap = 4;
    for (let x = 40; x < 470; x += dieW + gap) {
        for (let y = 40; y < 470; y += dieH + gap) {
            const dx = x + dieW / 2 - 256;
            const dy = y + dieH / 2 - 256;
            if (dx * dx + dy * dy < 225 * 225) {
                ctx.fillStyle = ((x + y) % 3 === 0) ? 'rgba(62, 230, 160, 0.55)' : 'rgba(12, 55, 30, 0.45)';
                ctx.fillRect(x, y, dieW, dieH);
                ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, dieW, dieH);
            }
        }
    }

    // Lithography alignment reticle marks
    ctx.strokeStyle = '#ffd875';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 20); ctx.lineTo(256, 60);
    ctx.moveTo(256, 452); ctx.lineTo(256, 492);
    ctx.moveTo(20, 256); ctx.lineTo(60, 256);
    ctx.moveTo(452, 256); ctx.lineTo(492, 256);
    ctx.stroke();

    return new THREE.CanvasTexture(c);
}

/**
 * Builds Enormous 14-meter Spinning Silicon Wafer in cleanroom fab bay.
 * @param {THREE.Group} hGroup
 */
function buildSiliconWafer(hGroup) {
    siliconWaferGroup = new THREE.Group();
    siliconWaferGroup.position.set(-6.5, 7.5, -22.0);
    siliconWaferGroup.rotation.x = 0.15;

    const waferTex = createSiliconWaferTexture();
    const waferMat = new THREE.MeshStandardMaterial({
        map: waferTex || null,
        color: 0x224433,
        roughness: 0.12,
        metalness: 0.95,
        emissive: 0x051a0e,
        emissiveIntensity: 0.4
    });

    const waferDisc = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.18, 36), waferMat);
    waferDisc.rotateX(Math.PI / 2);
    siliconWaferGroup.add(waferDisc);

    // Vacuum chuck mount spindle
    const chuckMat = new THREE.MeshStandardMaterial({ color: 0x111c16, metalness: 0.9, roughness: 0.3 });
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 20), chuckMat);
    chuck.position.set(0, 0, -0.6);
    chuck.rotateX(Math.PI / 2);
    siliconWaferGroup.add(chuck);

    hGroup.add(siliconWaferGroup);
}

/**
 * Builds Industrial Ventilation Turbines & Exhaust Cooling Fans.
 * @param {THREE.Group} hGroup
 */
function buildVentilationFans(hGroup) {
    ventilationFans.length = 0;
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x141f18, metalness: 0.85, roughness: 0.35 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x25382c, metalness: 0.9, roughness: 0.2 });

    const fanPositions = [-17.5, 17.5];
    fanPositions.forEach(posX => {
        const fanGroup = new THREE.Group();
        fanGroup.position.set(posX, 6.5, -20.0);

        // Circular Intake Duct Housing
        const duct = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 10, 28), housingMat);
        fanGroup.add(duct);

        // Center Spinner Hub & 6 Blades
        const bladeAssembly = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), bladeMat);
        bladeAssembly.add(hub);

        for (let b = 0; b < 6; b++) {
            const angle = (b / 6) * Math.PI * 2;
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.05), bladeMat);
            blade.position.set(Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0);
            blade.rotation.z = angle;
            blade.rotation.x = 0.35; // Pitch angle
            bladeAssembly.add(blade);
        }

        fanGroup.add(bladeAssembly);
        hGroup.add(fanGroup);
        ventilationFans.push({ bladeMesh: bladeAssembly });
    });
}

/**
 * Builds Articulated Robotic Welding Arm in distant fabrication bay.
 * @param {THREE.Group} hGroup
 */
function buildWeldingRobot(hGroup) {
    weldingRobotArm = new THREE.Group();
    weldingRobotArm.position.set(4.8, 8.5, -18.0);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a3d31, metalness: 0.88, roughness: 0.25 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x16221b, metalness: 0.92, roughness: 0.2 });

    // Base Pivot Turret
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 14), jointMat);
    weldingRobotArm.add(turret);

    // Upper Arm Segment
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 0.3), metalMat);
    upperArm.position.set(0, -1.0, 0);
    weldingRobotArm.add(upperArm);

    // Elbow Joint
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), jointMat);
    elbow.position.set(0, -1.9, 0);
    weldingRobotArm.add(elbow);

    // Forearm & Welding Torch
    weldingForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 1.5, 10), metalMat);
    weldingForearm.position.set(0, -2.7, 0);
    weldingRobotArm.add(weldingForearm);

    // Ceramic Torch Tip
    const torch = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2 }));
    torch.position.set(0, -3.5, 0);
    weldingRobotArm.add(torch);

    hGroup.add(weldingRobotArm);

    // Subtle distant welding sparks particle system
    weldingSparkVels = [];
    for (let i = 0; i < WELDING_SPARK_COUNT; i++) {
        weldingSparkPositions[i * 3] = 4.8;
        weldingSparkPositions[i * 3 + 1] = 5.0;
        weldingSparkPositions[i * 3 + 2] = -18.0;
        weldingSparkVels.push({
            vx: (Math.random() - 0.5) * 1.5,
            vy: -Math.random() * 2 - 0.5,
            vz: (Math.random() - 0.5) * 1.0,
            life: Math.random()
        });
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(weldingSparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
        color: 0xffd700,
        size: 0.06,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
    });
    weldingSparkParticles = new THREE.Points(sparkGeo, sparkMat);
    hGroup.add(weldingSparkParticles);
}

/**
 * Builds Transparent Cryogenic Coolant Conduits in background.
 * @param {THREE.Group} hGroup
 */
function buildCryoPipes(hGroup) {
    cryoCoolantPulses.length = 0;
    const pipeMat = new THREE.MeshStandardMaterial({
        color: 0x0e3522,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.28
    });

    const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
    });

    const pipeGeo = new THREE.CylinderGeometry(0.15, 0.15, 34, 12);
    pipeGeo.rotateZ(Math.PI / 2);

    const pipe1 = new THREE.Mesh(pipeGeo, pipeMat);
    pipe1.position.set(0, 5.8, -16.0);
    hGroup.add(pipe1);

    const pipe2 = new THREE.Mesh(pipeGeo, pipeMat);
    pipe2.position.set(0, 8.5, -18.0);
    hGroup.add(pipe2);

    // Glowing Coolant Flow Pulses inside pipes
    const pulseGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
    pulseGeo.rotateZ(Math.PI / 2);

    for (let p = 0; p < 8; p++) {
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.position.set(-15 + p * 4.5, (p % 2 === 0 ? 5.8 : 8.5), (p % 2 === 0 ? -16.0 : -18.0));
        hGroup.add(pulse);
        cryoCoolantPulses.push(pulse);
    }
}

/**
 * Builds Distant Autonomous Cleanroom Drone in upper rafters.
 * @param {THREE.Group} hGroup
 */
function buildInspectionDrone(hGroup) {
    inspectionDrone = new THREE.Group();
    inspectionDrone.position.set(0, 6.5, -18.0);

    const droneMat = new THREE.MeshStandardMaterial({ color: 0x1f2e24, metalness: 0.9, roughness: 0.25 });
    const droneBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.25, 0.55), droneMat);
    inspectionDrone.add(droneBody);

    // Quad Sensor Pods
    const podGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0 });
    const p1 = new THREE.Mesh(podGeo, beaconMat); p1.position.set(-0.35, 0.1, 0.25); inspectionDrone.add(p1);
    const p2 = new THREE.Mesh(podGeo, beaconMat); p2.position.set(0.35, 0.1, 0.25); inspectionDrone.add(p2);
    const p3 = new THREE.Mesh(podGeo, beaconMat); p3.position.set(-0.35, 0.1, -0.25); inspectionDrone.add(p3);
    const p4 = new THREE.Mesh(podGeo, beaconMat); p4.position.set(0.35, 0.1, -0.25); inspectionDrone.add(p4);

    hGroup.add(inspectionDrone);
}

/**
 * Builds Colossal Distant Megastructure: 40-Meter Suspended AI Reactor Core.
 * @param {THREE.Group} hGroup
 */
function buildDistantMegastructure(hGroup) {
    const megastructureGroup = new THREE.Group();
    megastructureGroup.position.set(0, 10.5, -28.0);

    // Colossal suspended octahedral reactor core
    const coreGeo = new THREE.OctahedronGeometry(9.0, 1);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x031208,
        wireframe: true,
        roughness: 0.2,
        metalness: 0.95,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.6
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    megastructureGroup.add(coreMesh);

    // Inner Radiant Cherenkov Energy Sphere
    const innerGeo = new THREE.SphereGeometry(5.2, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    megastructureGroup.add(innerSphere);

    // 4 Massive High-Tension Anchoring Cables
    const cableMat = new THREE.LineBasicMaterial({ color: 0x175836, transparent: true, opacity: 0.5 });
    const cableCoords = [
        -9, 0, 0, -28, 20, 0,
        9, 0, 0, 28, 20, 0,
        0, -9, 0, -18, -12, 0,
        0, -9, 0, 18, -12, 0
    ];
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cableCoords, 3));
    const cables = new THREE.LineSegments(cableGeo, cableMat);
    megastructureGroup.add(cables);

    hGroup.add(megastructureGroup);
}

/**
 * Builds distant glowing motherboard city, IC monoliths, and cyber grid.
 */
function buildHorizon() {
    if (!gameScene) return;

    horizonGroup = new THREE.Group();
    gameScene.add(horizonGroup);
    const hGroup = horizonGroup;

    // 1. Monolithic 3D IC Packages in deep background (-Z): Parameshwaran's Core Hardware Stack
    const chipMat = new THREE.MeshStandardMaterial({
        color: 0x050e09,
        roughness: 0.65,
        metalness: 0.6,
        emissive: 0x010503,
        emissiveIntensity: 0.12
    });

    const heatsinkMat = new THREE.MeshStandardMaterial({
        color: 0x0a1610,
        roughness: 0.4,
        metalness: 0.8,
        wireframe: true
    });

    const chipDefs = [
        { x: 0.0, y: 5.5, z: -22.0, w: 8.5, h: 7.2, d: 3.5, label: 'PRM-NPU v2.0', sub: '32 TOPS TENSOR ACCELERATOR' },
        { x: -14.0, y: 4.8, z: -20.0, w: 6.5, h: 5.0, d: 3.0, label: 'STM32F405', sub: 'ARM CORTEX-M4 168MHz' },
        { x: -7.0, y: 4.2, z: -19.0, w: 5.8, h: 5.5, d: 2.8, label: 'XILINX ARTIX-7', sub: 'FPGA FABRIC MATRIX' },
        { x: 7.5, y: 4.0, z: -19.0, w: 7.0, h: 4.0, d: 2.0, label: 'DDR4 SDRAM', sub: 'QUAD-CHANNEL 3200MT/s' },
        { x: 15.0, y: 4.5, z: -20.0, w: 5.5, h: 4.8, d: 2.6, label: 'CYPRESS FX3', sub: 'USB 3.0 PHY 5Gbps' },
        { x: -22.0, y: 3.5, z: -18.0, w: 4.8, h: 3.8, d: 2.2, label: 'DPAK MOSFETS', sub: 'HIGH-CURRENT DRIVER ARRAY' },
        { x: 22.0, y: 3.2, z: -18.0, w: 4.5, h: 3.2, d: 2.0, label: '16.0MHz XTAL', sub: 'QUARTZ OSCILLATOR' }
    ];

    const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const ledColors = [0x3ee6a0, 0x00ffff, 0xffd875];

    chipDefs.forEach((cp, idx) => {
        const chip = new THREE.Mesh(new THREE.BoxGeometry(cp.w, cp.h, cp.d), chipMat);
        chip.position.set(cp.x, cp.y, cp.z);
        hGroup.add(chip);

        // Silkscreen front label - subtle dark blueprint aesthetic
        const silkTex = createChipSilkscreenTexture(cp.label, cp.sub);
        if (silkTex) {
            const silkMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(cp.w * 0.85, cp.h * 0.75),
                new THREE.MeshBasicMaterial({ map: silkTex, transparent: true, opacity: 0.28 })
            );
            silkMesh.position.set(cp.x, cp.y, cp.z + cp.d / 2 + 0.02);
            hGroup.add(silkMesh);
        }

        // Extruded cooling fins
        const fins = new THREE.Mesh(new THREE.BoxGeometry(cp.w * 0.92, 0.45, cp.d * 0.92), heatsinkMat);
        fins.position.set(cp.x, cp.y + cp.h / 2 + 0.22, cp.z);
        hGroup.add(fins);

        // Status LED at top-left pin 1 (calm, non-distracting)
        const ledMat = new THREE.MeshBasicMaterial({
            color: ledColors[idx % ledColors.length],
            transparent: true,
            opacity: 0.35
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(cp.x - cp.w / 2 + 0.25, cp.y + cp.h / 2 + 0.1, cp.z + cp.d / 2 + 0.05);
        hGroup.add(led);
        monolithLeds.push({ led, phase: idx * 1.3, freq: 2.2 + idx * 0.6 });
    });

    // 2. Parallax Layer 2: Overhead Automated Pick-and-Place Gantry in Rafters
    buildRoboticGantry(hGroup);
    buildFoupMonorail(hGroup);

    // Silicon Megafactory Machinery in Deep Background
    buildSiliconWafer(hGroup);
    buildVentilationFans(hGroup);
    buildWeldingRobot(hGroup);
    buildCryoPipes(hGroup);
    buildInspectionDrone(hGroup);
    buildDistantMegastructure(hGroup);

    // 3. Parallax Layer 3: Subtle Holographic Oscilloscope Sky Projection
    const scopeTex = createScopeGridTexture();
    if (scopeTex) {
        const scopeScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 7.5),
            new THREE.MeshBasicMaterial({
                map: scopeTex,
                transparent: true,
                opacity: 0.22,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            })
        );
        scopeScreen.position.set(0, 7.2, -18.0);
        scopeScreen.rotation.x = 0.12;
        hGroup.add(scopeScreen);
    }

    const scopeLinePos = new Float32Array(SKY_SCOPE_PTS * 3);
    for (let i = 0; i < SKY_SCOPE_PTS; i++) {
        scopeLinePos[i * 3] = -7.5 + (i / (SKY_SCOPE_PTS - 1)) * 15.0;
        scopeLinePos[i * 3 + 1] = 7.2;
        scopeLinePos[i * 3 + 2] = -17.9;
    }
    const scopeLineGeo = new THREE.BufferGeometry();
    scopeLineGeo.setAttribute('position', new THREE.BufferAttribute(scopeLinePos, 3));
    skyScopeLine = new THREE.Line(
        scopeLineGeo,
        new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 1.5,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending
        })
    );
    hGroup.add(skyScopeLine);

    // 4. Parallax Layer 5: Datacenter Server Racks (Cloud & AI Backbone)
    buildServerRacks(hGroup);

    // 5. Parallax Layer 6: 3D AI Neural Network Sky Visualization
    buildNeuralNetworkSkyGraph(hGroup);

    // 6. Far Distance: Holographic Wireframe Circuit Skyline
    buildHolographicCity(hGroup);

    // 7. Volumetric Floating Electron Dust Cloud (Soft, Faint Ambiance)
    const dustGeo = new THREE.BufferGeometry();
    dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 24;
        dustPositions[i * 3 + 1] = Math.random() * 5.0 + 0.2;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 4;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
        color: 0x3ee6a0,
        size: 0.035,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending
    });
    electronDust = new THREE.Points(dustGeo, dustMat);
    gameScene.add(electronDust);

    // 8. Distant Glowing Cyber Horizon Data Grid (Muted Emerald Ground Guide)
    const gridHelper = new THREE.GridHelper(80, 40, 0x0a2618, 0x03120a);
    gridHelper.position.set(0, -0.15, -18.0);
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

    // 10. Electromagnetic Jump Floor Ripple
    const rippleGeo = new THREE.RingGeometry(0.08, 0.24, 24);
    rippleGeo.rotateX(-Math.PI / 2);
    const rippleMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    jumpRippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    jumpRippleMesh.position.set(0, 0.22, 0);
    jumpRippleMesh.visible = false;
    gameScene.add(jumpRippleMesh);

    // 11. Concentric PCB Landing Vibration Shockwave
    const landGeo = new THREE.RingGeometry(0.12, 0.36, 24);
    landGeo.rotateX(-Math.PI / 2);
    const landMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    landingVibrationMesh = new THREE.Mesh(landGeo, landMat);
    landingVibrationMesh.position.set(0, 0.22, 0);
    landingVibrationMesh.visible = false;
    gameScene.add(landingVibrationMesh);

    // 12. DMA Energy Packet Capacitive Charge Flash
    const flashGeo = new THREE.RingGeometry(0.15, 0.45, 24);
    flashGeo.rotateX(-Math.PI / 2);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    chargeFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    chargeFlashMesh.position.set(0, 0.22, 0);
    chargeFlashMesh.visible = false;
    gameScene.add(chargeFlashMesh);
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

/** @type {Record<string, THREE.CanvasTexture>} */
const cachedHoloTextures = {};

/**
 * Creates a glowing tactical holographic warning HUD tag above obstacles.
 * @param {string} actionText
 * @param {string} descText
 * @param {string} strokeColor
 * @param {string} [bgColor='rgba(12, 4, 2, 0.88)']
 * @returns {THREE.Mesh}
 */
export function createHoloWarningTag(actionText, descText, strokeColor, bgColor = 'rgba(12, 4, 2, 0.88)') {
    const key = `${actionText}_${descText}_${strokeColor}`;
    let tex = cachedHoloTextures[key];
    if (!tex && typeof document !== 'undefined') {
        const cvs = document.createElement('canvas');
        cvs.width = 256;
        cvs.height = 96;
        const ctx = cvs.getContext('2d');
        if (ctx) {
            // Dark cybernetic semi-transparent container
            ctx.fillStyle = bgColor;
            ctx.fillRect(4, 4, 248, 88);

            // Bold luminous hazard border
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(4, 4, 248, 88);

            // Corner tactical bracket ticks
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(4, 20); ctx.lineTo(4, 4); ctx.lineTo(24, 4);
            ctx.moveTo(232, 4); ctx.lineTo(252, 4); ctx.lineTo(252, 20);
            ctx.moveTo(4, 76); ctx.lineTo(4, 92); ctx.lineTo(24, 92);
            ctx.moveTo(232, 92); ctx.lineTo(252, 92); ctx.lineTo(252, 76);
            ctx.stroke();

            // Background subtle scanlines
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            for (let y = 8; y < 88; y += 4) {
                ctx.fillRect(8, y, 240, 1);
            }

            // Action Instruction (e.g. "⬆ JUMP" or "⬇ SLIDE")
            ctx.font = '900 32px "Courier New", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowColor = strokeColor;
            ctx.shadowBlur = 12;
            ctx.fillText(actionText, 128, 42);
            ctx.shadowBlur = 0;

            // Description / Specs (e.g. "RELAY 400V // DANGER")
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.fillStyle = strokeColor;
            ctx.fillText(descText, 128, 72);
        }
        tex = new THREE.CanvasTexture(cvs);
        cachedHoloTextures[key] = tex;
    }

    const geo = new THREE.PlaneGeometry(1.2, 0.45);
    const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
    });
    return new THREE.Mesh(geo, mat);
}

/** @type {THREE.CanvasTexture | null} */
let cachedHazardTexture = null;

function getHazardTexture() {
    if (cachedHazardTexture) return cachedHazardTexture;
    if (typeof document === 'undefined') return null;
    try {
        const cvs = document.createElement('canvas');
        cvs.width = 256;
        cvs.height = 64;
        const ctx = cvs.getContext('2d');
        if (!ctx) return null;

        // Dark background with high-contrast safety stripes
        ctx.fillStyle = '#0f0500';
        ctx.fillRect(0, 0, 256, 64);

        // Blazing bright safety amber/orange stripes
        ctx.fillStyle = '#ff8800';
        const stripeW = 16;
        for (let x = -64; x < 320; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + stripeW, 0);
            ctx.lineTo(x + stripeW - 24, 64);
            ctx.lineTo(x - 24, 64);
            ctx.closePath();
            ctx.fill();
        }

        // High-contrast glowing caution borders
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 252, 60);

        // Glowing center warning chevron track
        ctx.font = '900 24px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 8;
        ctx.fillText('>>> HAZARD ZONE >>>', 128, 40);

        cachedHazardTexture = new THREE.CanvasTexture(cvs);
        cachedHazardTexture.wrapS = THREE.RepeatWrapping;
        cachedHazardTexture.wrapT = THREE.RepeatWrapping;
        return cachedHazardTexture;
    } catch {
        return null;
    }
}

/**
 * Creates an elevated holographic warning beacon for obstacle telegraphing.
 * @param {number} [colorHex=0xffaa00]
 */
function createHazardBeacon(colorHex = 0xffaa00) {
    const grp = new THREE.Group();
    // Glowing warning diamond / octahedron
    const octGeo = new THREE.OctahedronGeometry(0.15, 0);
    const octMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 4.5,
        roughness: 0.1,
        metalness: 0.8
    });
    const oct = new THREE.Mesh(octGeo, octMat);
    grp.add(oct);

    // Rotating warning reticle ring
    const ringGeo = new THREE.TorusGeometry(0.24, 0.022, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);

    // Vertical volumetric warning light pin
    const pinGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.75, 6);
    const pinMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85 });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.y = -0.38;
    grp.add(pin);

    grp.userData = { oct, ring };
    return grp;
}

function createResistorMesh() {
    const grp = new THREE.Group();
    // Substantial 1206 SMT High-Power Resistor Body
    const bodyGeo = new THREE.BoxGeometry(0.50, 0.28, 0.62);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x22262c,
        roughness: 0.35,
        metalness: 0.5,
        emissive: 0x11161d,
        emissiveIntensity: 0.5
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.18, 0);
    grp.add(body);

    // Incandescent Searing Thermal Core Slit (Thermal dissipation overload)
    const coreSlitGeo = new THREE.BoxGeometry(0.28, 0.06, 0.63);
    const coreSlitMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const coreSlit = new THREE.Mesh(coreSlitGeo, coreSlitMat);
    coreSlit.position.set(0, 0.18, 0);
    grp.add(coreSlit);

    // Glowing Silver-Nickel Barrier Termination End Caps
    const capGeo = new THREE.BoxGeometry(0.12, 0.29, 0.64);
    const capMat = new THREE.MeshStandardMaterial({
        color: 0xffddaa,
        emissive: 0xff9900,
        emissiveIntensity: 2.8,
        metalness: 0.95,
        roughness: 0.1
    });
    const capL = new THREE.Mesh(capGeo, capMat);
    capL.position.set(-0.24, 0.18, 0);
    grp.add(capL);

    const capR = new THREE.Mesh(capGeo, capMat);
    capR.position.set(0.24, 0.18, 0);
    grp.add(capR);

    // Solder fillets on PCB (ENIG Gold & Silver)
    const filletGeo = new THREE.BoxGeometry(0.08, 0.06, 0.66);
    const filletMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff7700, emissiveIntensity: 1.5, metalness: 0.9, roughness: 0.2 });
    const fL = new THREE.Mesh(filletGeo, filletMat);
    fL.position.set(-0.31, 0.06, 0);
    grp.add(fL);
    const fR = new THREE.Mesh(filletGeo, filletMat);
    fR.position.set(0.31, 0.06, 0);
    grp.add(fR);

    // Silkscreen "R010 // 50A" High-Visibility Power Mark on top
    const labelGeo = new THREE.PlaneGeometry(0.32, 0.42);
    labelGeo.rotateX(-Math.PI / 2);
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const lbl = new THREE.Mesh(labelGeo, labelMat);
    lbl.position.set(0, 0.325, 0);
    grp.add(lbl);

    // Projected Ground Hazard Caution Decal (Extends in front to telegraph approach)
    const hTex = getHazardTexture();
    const decalGeo = new THREE.PlaneGeometry(0.85, 0.68);
    decalGeo.rotateX(-Math.PI / 2);
    const decalMat = hTex
        ? new THREE.MeshBasicMaterial({ map: hTex, transparent: true, opacity: 0.95 })
        : new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85 });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.set(0.60, 0.02, 0);
    grp.add(decal);

    // Overhead Holographic Danger Beacon
    const beacon = createHazardBeacon(0xffaa00);
    beacon.position.set(0, 0.85, 0);
    grp.add(beacon);

    grp.userData = { type: 'resistor', beacon, coreSlit };
    return grp;
}

function createCapacitorMesh() {
    const grp = new THREE.Group();
    // Substantial Low-ESR Aluminum Electrolytic Can
    const canGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.72, 20);
    const canMat = new THREE.MeshStandardMaterial({
        color: 0x1b2d42,
        metalness: 0.88,
        roughness: 0.18,
        emissive: 0x0a1e36,
        emissiveIntensity: 0.8
    });
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(0, 0.36, 0);
    grp.add(can);

    // Wide Fluorescent Neon Polarity Hazard Stripe (high contrast)
    const stripeGeo = new THREE.BoxGeometry(0.06, 0.73, 0.29);
    const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xffdd00,
        emissive: 0xffaa00,
        emissiveIntensity: 3.2,
        roughness: 0.1
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0.26, 0.36, 0);
    grp.add(stripe);

    // Glowing Cyan High-Voltage Base Collar on PCB
    const collarGeo = new THREE.TorusGeometry(0.30, 0.022, 6, 24);
    collarGeo.rotateX(Math.PI / 2);
    const collarMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.04, 0);
    grp.add(collar);

    // Brushed Aluminum Top Rim
    const topGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20);
    const topMat = new THREE.MeshStandardMaterial({ color: 0xeef2f8, metalness: 0.95, roughness: 0.1 });
    const topRim = new THREE.Mesh(topGeo, topMat);
    topRim.position.set(0, 0.73, 0);
    grp.add(topRim);

    // Stamped Safety Vent Lines ("+" relief score)
    const ventGeo = new THREE.BoxGeometry(0.36, 0.02, 0.04);
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x050a12 });
    const vent1 = new THREE.Mesh(ventGeo, ventMat);
    vent1.position.set(0, 0.752, 0);
    grp.add(vent1);
    const vent2 = new THREE.Mesh(ventGeo, ventMat);
    vent2.position.set(0, 0.752, 0);
    vent2.rotation.y = Math.PI / 2;
    grp.add(vent2);

    // High-Voltage Corona Spark Discharge Node
    const sparkNodeGeo = new THREE.OctahedronGeometry(0.09, 0);
    const sparkNodeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const sparkNode = new THREE.Mesh(sparkNodeGeo, sparkNodeMat);
    sparkNode.position.set(0, 0.82, 0);
    grp.add(sparkNode);

    const innerSparkGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const innerSparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const innerSpark = new THREE.Mesh(innerSparkGeo, innerSparkMat);
    innerSpark.position.set(0, 0.82, 0);
    grp.add(innerSpark);

    // Projected Ground Hazard Perimeter Ring
    const ringDecalGeo = new THREE.RingGeometry(0.34, 0.44, 24);
    ringDecalGeo.rotateX(-Math.PI / 2);
    const ringDecalMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ringDecal = new THREE.Mesh(ringDecalGeo, ringDecalMat);
    ringDecal.position.set(0, 0.02, 0);
    grp.add(ringDecal);

    // Overhead Holographic Danger Beacon
    const beacon = createHazardBeacon(0x00e5ff);
    beacon.position.set(0, 1.15, 0);
    grp.add(beacon);

    grp.userData = { type: 'capacitor', sparkNode, beacon };
    return grp;
}

function createBeamMesh() {
    const grp = new THREE.Group();
    const pylonGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.25, 8);
    const pylonMat = new THREE.MeshStandardMaterial({
        color: 0x333a42,
        metalness: 0.8,
        roughness: 0.25
    });

    // Front & Rear vertical pylons with hazard stripes
    const pylonFront = new THREE.Mesh(pylonGeo, pylonMat);
    pylonFront.position.set(0, 0.625, 0.72);
    grp.add(pylonFront);

    const pylonRear = new THREE.Mesh(pylonGeo, pylonMat);
    pylonRear.position.set(0, 0.625, -0.72);
    grp.add(pylonRear);

    // Top Warning Emergency Strobe Beacons on Pylons
    const strobeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
    const strobeFront = new THREE.Mesh(strobeGeo, strobeMat);
    strobeFront.position.set(0, 1.26, 0.72);
    grp.add(strobeFront);

    const strobeRear = new THREE.Mesh(strobeGeo, strobeMat);
    strobeRear.position.set(0, 1.26, -0.72);
    grp.add(strobeRear);

    // Elevated horizontal laser beam along Z (height 0.85 — must slide under!)
    const beamGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.48, 12);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xff0055,
        transparent: true,
        opacity: 0.95
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.85, 0);
    grp.add(beamMesh);

    // White-hot laser core
    const coreBeamGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.48, 8);
    coreBeamGeo.rotateX(Math.PI / 2);
    const coreBeamMesh = new THREE.Mesh(coreBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    coreBeamMesh.position.set(0, 0.85, 0);
    grp.add(coreBeamMesh);

    // Volumetric Radiant Laser Energy Curtain (From beam down to slide clearance height 0.35)
    const curtainGeo = new THREE.PlaneGeometry(1.44, 0.50);
    const curtainMat = new THREE.MeshBasicMaterial({
        color: 0xff0044,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const laserCurtain = new THREE.Mesh(curtainGeo, curtainMat);
    laserCurtain.position.set(0, 0.60, 0);
    grp.add(laserCurtain);

    // Ground Laser Hazard Projection Boundary Line
    const groundLineGeo = new THREE.PlaneGeometry(0.12, 1.48);
    groundLineGeo.rotateX(-Math.PI / 2);
    const groundLineMat = new THREE.MeshBasicMaterial({ color: 0xff0033, transparent: true, opacity: 0.85 });
    const groundLine = new THREE.Mesh(groundLineGeo, groundLineMat);
    groundLine.position.set(0, 0.02, 0);
    grp.add(groundLine);

    // Overhead Holographic Danger Beacon
    const beacon = createHazardBeacon(0xff0044);
    beacon.position.set(0, 1.35, 0);
    grp.add(beacon);

    grp.userData = { type: 'beam', beamMesh, laserCurtain, beacon, strobeFront, strobeRear };
    return grp;
}

function createGapMesh() {
    const grp = new THREE.Group();
    // Cutout chasm through the copper rail
    const voidGeo = new THREE.BoxGeometry(1.15, 0.55, 1.45);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000201 });
    const voidBox = new THREE.Mesh(voidGeo, voidMat);
    voidBox.position.set(0, -0.22, 0);
    grp.add(voidBox);

    // Molten Searing Fractured Copper Lips on Left & Right
    const lipGeo = new THREE.BoxGeometry(0.14, 0.10, 1.45);
    const lipMat = new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff6600,
        emissiveIntensity: 3.5,
        metalness: 0.9,
        roughness: 0.1
    });
    const lipL = new THREE.Mesh(lipGeo, lipMat);
    lipL.position.set(-0.58, 0.05, 0);
    grp.add(lipL);

    const lipR = new THREE.Mesh(lipGeo, lipMat);
    lipR.position.set(0.58, 0.05, 0);
    grp.add(lipR);

    // Thick Procedural Electric Plasma Arcs Bridging Across Void
    const arcGeo1 = new THREE.CylinderGeometry(0.025, 0.025, 1.15, 6);
    arcGeo1.rotateZ(Math.PI / 2);
    const arcMat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.95 });
    const plasmaArc1 = new THREE.Mesh(arcGeo1, arcMat1);
    plasmaArc1.position.set(0, 0.10, -0.2);
    grp.add(plasmaArc1);

    const arcGeo2 = new THREE.CylinderGeometry(0.02, 0.02, 1.15, 6);
    arcGeo2.rotateZ(Math.PI / 2);
    const arcMat2 = new THREE.MeshBasicMaterial({ color: 0xff00aa, transparent: true, opacity: 0.9 });
    const plasmaArc2 = new THREE.Mesh(arcGeo2, arcMat2);
    plasmaArc2.position.set(0, 0.14, 0.2);
    grp.add(plasmaArc2);

    // Side Hazard Warning Pylons with Flashing Yellow Strobes
    const pylonGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 6);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff7700, emissiveIntensity: 2.0 });
    const p1 = new THREE.Mesh(pylonGeo, pylonMat);
    p1.position.set(-0.58, 0.30, 0.72);
    grp.add(p1);

    const p2 = new THREE.Mesh(pylonGeo, pylonMat);
    p2.position.set(0.58, 0.30, 0.72);
    grp.add(p2);

    // Pre-Chasm Ground Hazard Decal
    const hTex = getHazardTexture();
    const decalGeo = new THREE.PlaneGeometry(0.85, 0.68);
    decalGeo.rotateX(-Math.PI / 2);
    const decalMat = hTex
        ? new THREE.MeshBasicMaterial({ map: hTex, transparent: true, opacity: 0.95 })
        : new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85 });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.set(0.85, 0.02, 0);
    grp.add(decal);

    // Overhead Holographic Danger Beacon
    const beacon = createHazardBeacon(0xff6600);
    beacon.position.set(0, 0.85, 0);
    grp.add(beacon);

    grp.userData = { type: 'gap', plasmaArc: plasmaArc1, plasmaArc2, beacon };
    return grp;
}

function createRelayMesh() {
    const grp = new THREE.Group();
    // Industrial Relay Housing
    const boxGeo = new THREE.BoxGeometry(0.58, 0.44, 0.68);
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1f2e24,
        metalness: 0.7,
        roughness: 0.3,
        emissive: 0x0f2015,
        emissiveIntensity: 0.6
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 0.54, 0);
    grp.add(box);

    // Glowing Electromagnetic Coil Window inside
    const coilGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.32, 16);
    const coilMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff8800,
        emissiveIntensity: 3.5,
        metalness: 0.9,
        roughness: 0.1
    });
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.position.set(0, 0.54, 0);
    grp.add(coil);

    // Oscillating High-Voltage Contact Armature
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8);
    const armMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44,
        emissive: 0xffaa00,
        emissiveIntensity: 2.5,
        metalness: 0.95,
        roughness: 0.1
    });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 0.26, 0);
    grp.add(arm);

    // Contact Arc Spark Node
    const sparkGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.set(0, 0.06, 0);
    arm.add(spark);

    // Projected Ground Hazard Decal
    const hTex = getHazardTexture();
    const decalGeo = new THREE.PlaneGeometry(0.85, 0.68);
    decalGeo.rotateX(-Math.PI / 2);
    const decalMat = hTex
        ? new THREE.MeshBasicMaterial({ map: hTex, transparent: true, opacity: 0.95 })
        : new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85 });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.set(0.60, 0.02, 0);
    grp.add(decal);

    // Overhead Warning Beacon
    const beacon = createHazardBeacon(0xffaa00);
    beacon.position.set(0, 1.05, 0);
    grp.add(beacon);

    grp.userData = { type: 'relay', arm, beacon };
    return grp;
}

function createSpikeMesh() {
    const grp = new THREE.Group();
    // Incandescent Magma Thermal Spikes with Searing Tips
    const spikeGeo = new THREE.ConeGeometry(0.14, 0.45, 6);
    const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xff5500,
        emissive: 0xff3300,
        emissiveIntensity: 3.8,
        roughness: 0.1,
        metalness: 0.8
    });

    const s1 = new THREE.Mesh(spikeGeo, spikeMat);
    s1.position.set(-0.16, 0.225, 0);
    grp.add(s1);

    const s2 = new THREE.Mesh(spikeGeo, spikeMat);
    s2.position.set(0.16, 0.225, 0);
    grp.add(s2);

    const s3 = new THREE.Mesh(spikeGeo, spikeMat);
    s3.scale.set(1.25, 1.25, 1.25);
    s3.position.set(0, 0.28, 0);
    grp.add(s3);

    // White-Hot Incandescent Tips
    const tipGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tip1 = new THREE.Mesh(tipGeo, tipMat);
    tip1.position.set(-0.16, 0.45, 0);
    grp.add(tip1);
    const tip2 = new THREE.Mesh(tipGeo, tipMat);
    tip2.position.set(0.16, 0.45, 0);
    grp.add(tip2);
    const tip3 = new THREE.Mesh(tipGeo, tipMat);
    tip3.position.set(0, 0.56, 0);
    grp.add(tip3);

    // Heavy Industrial Hazard Baseplate
    const baseGeo = new THREE.BoxGeometry(0.65, 0.05, 0.55);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff7700,
        emissiveIntensity: 2.0,
        metalness: 0.9,
        roughness: 0.2
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.025, 0);
    grp.add(base);

    // Overhead Danger Beacon
    const beacon = createHazardBeacon(0xff3300);
    beacon.position.set(0, 0.95, 0);
    grp.add(beacon);

    grp.userData = { type: 'spike', beacon };
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

    // Quantized DMA Charge Packet Geometry:
    // Dual intersecting octahedral flux crystals with pure white plasma core and quantum flux rings
    const crystalGeo1 = new THREE.OctahedronGeometry(0.16, 0);
    const crystalMat1 = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00c4bb,
        emissiveIntensity: 3.5,
        roughness: 0.1,
        metalness: 0.9
    });

    const crystalGeo2 = new THREE.OctahedronGeometry(0.12, 0);
    crystalGeo2.rotateY(Math.PI / 4);
    crystalGeo2.rotateZ(Math.PI / 4);
    const crystalMat2 = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 3.0,
        roughness: 0.15,
        metalness: 0.85
    });

    // Inner Radiant White Super-Energy Plasma Core
    const sparkGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Counter-rotating Quantum Flux Guide Ring
    const ringGeo = new THREE.TorusGeometry(0.22, 0.014, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

    // Orbiting Data Photon Bit Satellites
    const satGeo = new THREE.SphereGeometry(0.028, 8, 8);
    const satMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let i = 0; i < ELECTRON_POOL_SIZE; i++) {
        const el = new THREE.Group();

        // 1. Dual Octahedral Flux Packet Body (assigned to coinBody for continuous rotation)
        const coinBody = new THREE.Group();
        const c1 = new THREE.Mesh(crystalGeo1, crystalMat1);
        coinBody.add(c1);

        const c2 = new THREE.Mesh(crystalGeo2, crystalMat2);
        coinBody.add(c2);

        const innerCore = new THREE.Mesh(sparkGeo, sparkMat);
        coinBody.add(innerCore);

        const halo = new THREE.Mesh(ringGeo, ringMat);
        coinBody.add(halo);

        el.add(coinBody);

        // 2. Quantum Orbit 1
        const orbitPivot = new THREE.Group();
        orbitPivot.rotation.x = Math.PI / 4;
        const sat1 = new THREE.Mesh(satGeo, satMat);
        sat1.position.set(0.30, 0, 0);
        orbitPivot.add(sat1);
        el.add(orbitPivot);

        // 3. Quantum Orbit 2
        const orbitPivot2 = new THREE.Group();
        orbitPivot2.rotation.y = Math.PI / 3;
        orbitPivot2.rotation.z = Math.PI / 6;
        const sat2 = new THREE.Mesh(satGeo, satMat);
        sat2.position.set(0, 0.30, 0);
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
            // Synchronous formation wave: all packets in an ordered cluster bob in harmonious alignment
            const bob = Math.sin(sim.dist * 0.35) * 0.04;
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
 * Synchronize 3D obstacles with simulation actors and animate telegraphing beacons & effects.
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

        // Animate overhead telegraphing warning beacon
        if (mesh.userData.beacon) {
            const b = mesh.userData.beacon;
            if (b.userData.oct) b.userData.oct.rotation.y += delta * 4.5;
            if (b.userData.ring) b.userData.ring.rotation.z += delta * 3.0;
            const strobe = 0.8 + 0.2 * Math.sin(sim.dist * 0.7 + worldX * 3.0);
            b.scale.setScalar(0.92 + 0.14 * strobe);
        }

        if (a.type === 'beam') {
            if (mesh.userData.beamMesh) {
                mesh.userData.beamMesh.material.opacity = 0.82 + 0.18 * Math.sin(sim.dist * 0.6);
            }
            if (mesh.userData.laserCurtain) {
                mesh.userData.laserCurtain.material.opacity = 0.38 + 0.22 * Math.sin(sim.dist * 0.9 + worldX);
            }
            if (mesh.userData.strobeFront && mesh.userData.strobeRear) {
                const strobeFlash = Math.sin(sim.dist * 1.5) > 0;
                mesh.userData.strobeFront.visible = strobeFlash;
                mesh.userData.strobeRear.visible = !strobeFlash;
            }
        } else if (a.type === 'relay') {
            if (mesh.userData.arm) {
                mesh.userData.arm.position.y = 0.26 + Math.sin(a.phase) * 0.14;
            }
        } else if (a.type === 'capacitor') {
            if (mesh.userData.sparkNode) {
                mesh.userData.sparkNode.rotation.y += delta * 6.0;
                mesh.userData.sparkNode.rotation.z += delta * 4.0;
            }
        } else if (a.type === 'gap') {
            if (mesh.userData.plasmaArc) {
                mesh.userData.plasmaArc.rotation.z = Math.PI / 2 + Math.sin(sim.dist * 2.0) * 0.1;
            }
            if (mesh.userData.plasmaArc2) {
                mesh.userData.plasmaArc2.rotation.z = Math.PI / 2 - Math.sin(sim.dist * 2.4) * 0.12;
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
                if (!wasJumpingIn3d && jumpRippleMesh && playerGroup) {
                    jumpRippleMesh.position.set(playerGroup.position.x, 0.22, 0);
                    jumpRippleLife = 1.0;
                    jumpRippleMesh.visible = true;
                }
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
        const isSlam = (sim.slamPulseTime && sim.slamPulseTime > 0) || sim.slamActive;
        cameraShake = Math.max(cameraShake, isSlam ? 0.65 : 0.28);
        if (landingVibrationMesh && playerGroup) {
            landingVibrationMesh.position.set(playerGroup.position.x, 0.22, 0);
            landingVibrationLife = isSlam ? 1.4 : 1.0;
            landingVibrationMesh.visible = true;
        }
        wasJumpingIn3d = false;
    } else if (!sim.onGround) {
        wasJumpingIn3d = true;
    }

    // 3. Camera Shake Decay & Jitter, and Charge Flash Trigger
    if (sim.electrons > lastObservedElectrons) {
        cameraShake = Math.max(cameraShake, 0.16);
        if (chargeFlashMesh && playerGroup) {
            chargeFlashMesh.position.set(playerGroup.position.x, playerGroup.position.y, 0);
            chargeFlashLife = 1.0;
            chargeFlashMesh.visible = true;
        }
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

    // Dynamic Movement VFX lifecycle update
    if (jumpRippleLife > 0 && jumpRippleMesh) {
        jumpRippleLife = Math.max(0, jumpRippleLife - delta * 3.5);
        const s = 1.0 + (1.0 - jumpRippleLife) * 4.2;
        jumpRippleMesh.scale.set(s, s, s);
        /** @type {THREE.MeshBasicMaterial} */ (jumpRippleMesh.material).opacity = jumpRippleLife * 0.85;
        jumpRippleMesh.visible = jumpRippleLife > 0.01;
    }
    if (landingVibrationLife > 0 && landingVibrationMesh) {
        landingVibrationLife = Math.max(0, landingVibrationLife - delta * 3.0);
        const s = 1.0 + (1.0 - landingVibrationLife) * 5.0;
        landingVibrationMesh.scale.set(s, s, s);
        /** @type {THREE.MeshBasicMaterial} */ (landingVibrationMesh.material).opacity = landingVibrationLife * 0.95;
        landingVibrationMesh.visible = landingVibrationLife > 0.01;
    }
    if (chargeFlashLife > 0 && chargeFlashMesh) {
        chargeFlashLife = Math.max(0, chargeFlashLife - delta * 4.0);
        const s = 1.0 + (1.0 - chargeFlashLife) * 3.8;
        chargeFlashMesh.scale.set(s, s, s);
        /** @type {THREE.MeshBasicMaterial} */ (chargeFlashMesh.material).opacity = chargeFlashLife * 0.9;
        chargeFlashMesh.visible = chargeFlashLife > 0.01;
    }

    if (cameraShake > 0) {
        cameraShake = Math.max(0, cameraShake - delta * 4.2);
    }
    const shakeX = (Math.random() - 0.5) * cameraShake * 0.08;
    const shakeY = (Math.random() - 0.5) * cameraShake * 0.08;

    // 4. Update Camera Position with Subtle Dynamic Reactions
    const bob = (!motionPrefs.reduced && sim.state === 'playing') ? Math.sin(sim.dist * 0.25) * 0.02 : 0;
    gameCamera.position.set(shakeX, 1.05 + bob + shakeY, 4.4);
    gameCamera.lookAt(0.2 + shakeX, 0.78, 0.0);

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

    // Animate moving current flowing along copper highway (Layer 1)
    const curSpeed = (sim.curSpeed || 85) * 0.14 + 5.0;
    for (let p = 0; p < trackCurrentPulses.length; p++) {
        const cp = trackCurrentPulses[p];
        cp.position.x -= delta * curSpeed;
        if (cp.position.x < -14.0) {
            cp.position.x += 28.0;
        }
    }

    // Animate Robotic Soldering Arm Gantry (Layer 2)
    if (gantryArmGroup && armSegmentMesh) {
        const gantrySway = Math.sin((sim.dist || 0) * 0.08) * 1.5;
        gantryArmGroup.position.x = gantrySway;
        armSegmentMesh.rotation.z = Math.sin((sim.dist || 0) * 0.14) * 0.14;
    }

    // Animate Datacenter Server Racks Activity LEDs (Layer 5)
    const simTime = (sim.dist || 0) * 0.15;
    for (let r = 0; r < serverRackUnits.length; r++) {
        const rUnit = serverRackUnits[r];
        for (let l = 0; l < rUnit.leds.length; l++) {
            const flicker = Math.sin(simTime * 9.0 + r * 3.1 + l * 1.7) > 0.1 ? 0.9 : 0.12;
            rUnit.leds[l].opacity = flicker;
        }
    }

    // Animate FOUP automated wafer pods along ceiling track
    for (let f = 0; f < foupPods.length; f++) {
        const pod = foupPods[f];
        pod.position.x += delta * 1.6;
        if (pod.position.x > 20) pod.position.x = -20;
    }

    // Animate 3D AI Neural Network Synaptic Tensor Pulses (Layer 6)
    for (let i = 0; i < synapticPulses.length; i++) {
        const sp = synapticPulses[i];
        sp.pulsePos += delta * sp.speed;
        if (sp.pulsePos > 1.0) sp.pulsePos = 0;
        sp.mesh.position.lerpVectors(sp.from, sp.to, sp.pulsePos);
    }

    // Silicon Megafactory Dynamic Power Outage Cycle & Zone Atmospheric Evolution
    facilityCycleTime += delta;
    const cycleSec = facilityCycleTime % 18.0;
    const isOutage = cycleSec > 14.2 && cycleSec < 16.4;
    const isReboot = cycleSec >= 16.4 && cycleSec < 17.4;

    if (emergencyAlarmLight) {
        emergencyAlarmLight.intensity = isOutage ? (Math.sin(facilityCycleTime * 22.0) > 0 ? 6.5 : 0.8) : 0.0;
    }
    if (mainDirLight) {
        mainDirLight.intensity = isOutage ? 0.25 : (isReboot ? 4.2 : 2.2);
    }

    // Dynamic Zone Transitions based on traveled distance
    const curDist = sim.dist || 0;
    let currentZone = FOUNDRY_ZONES[0];
    for (let z = FOUNDRY_ZONES.length - 1; z >= 0; z--) {
        if (curDist >= FOUNDRY_ZONES[z].distMin) {
            currentZone = FOUNDRY_ZONES[z];
            activeZoneIndex = z;
            break;
        }
    }

    const targetLightCol = new THREE.Color(isOutage ? 0x220505 : currentZone.lightCol);
    const targetFogCol = new THREE.Color(isOutage ? 0x140202 : currentZone.fogCol);
    if (mainDirLight) mainDirLight.color.lerp(targetLightCol, delta * 3.0);
    if (gameScene.fog instanceof THREE.FogExp2) {
        gameScene.fog.color.lerp(targetFogCol, delta * 3.0);
    }

    // Update Zone telemetry indicator in DOM if available
    if (typeof document !== 'undefined') {
        const zoneBadge = document.getElementById('diag-zone-badge');
        if (zoneBadge) {
            const text = isOutage ? 'EMERGENCY: POWER TRIP' : currentZone.name;
            if (zoneBadge.textContent !== text) zoneBadge.textContent = text;
            if (isOutage) zoneBadge.classList.add('badge-alarm');
            else zoneBadge.classList.remove('badge-alarm');
        }
    }

    // Animate Spinning Silicon Wafer
    if (siliconWaferGroup) {
        siliconWaferGroup.rotation.z += delta * (isOutage ? 0.05 : 0.45);
    }

    // Animate Industrial Ventilation Turbines
    for (let f = 0; f < ventilationFans.length; f++) {
        ventilationFans[f].bladeMesh.rotation.z += delta * (isOutage ? 2.0 : 16.0);
    }

    // Animate Articulated Robotic Welding Arm & Sparks
    if (weldingRobotArm) {
        weldingRobotArm.rotation.z = Math.sin((sim.dist || 0) * 0.08) * 0.16;
        if (weldingForearm) weldingForearm.rotation.z = Math.cos((sim.dist || 0) * 0.11) * 0.20;
    }
    if (weldingSparkParticles) {
        for (let i = 0; i < WELDING_SPARK_COUNT; i++) {
            const vel = weldingSparkVels[i];
            vel.life -= delta * 3.5;
            if (vel.life <= 0) {
                weldingSparkPositions[i * 3] = 4.8 + (Math.random() - 0.5) * 0.2;
                weldingSparkPositions[i * 3 + 1] = 5.2;
                weldingSparkPositions[i * 3 + 2] = -18.0 + (Math.random() - 0.5) * 0.2;
                vel.vx = (Math.random() - 0.5) * 1.5;
                vel.vy = -Math.random() * 2.0 - 0.5;
                vel.vz = (Math.random() - 0.5) * 1.0;
                vel.life = 1.0;
            } else {
                weldingSparkPositions[i * 3] += vel.vx * delta;
                weldingSparkPositions[i * 3 + 1] += vel.vy * delta;
                weldingSparkPositions[i * 3 + 2] += vel.vz * delta;
                vel.vy -= 9.8 * delta * 0.4;
            }
        }
        const wPosAttr = weldingSparkParticles.geometry.getAttribute('position');
        if (wPosAttr) wPosAttr.needsUpdate = true;
    }

    // Animate Cryogenic Coolant Conduits Pulses
    const cryoSpeed = 7.5;
    for (let c = 0; c < cryoCoolantPulses.length; c++) {
        const cp = cryoCoolantPulses[c];
        cp.position.x += delta * cryoSpeed;
        if (cp.position.x > 17.0) cp.position.x = -17.0;
    }

    // Animate Patrolling Autonomous Inspection Drone in upper rafters
    if (inspectionDrone) {
        inspectionDrone.position.x = Math.sin((sim.dist || 0) * 0.06) * 5.5;
        inspectionDrone.position.y = 6.5 + Math.sin(facilityCycleTime * 2.5) * 0.18;
    }

    // Gentle Parallax Drift for distant horizon architecture
    if (horizonGroup) {
        horizonGroup.position.x = -((sim.dist || 0) * 0.008) % 30.0;
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

/**
 * Returns the active megafactory zone index.
 * @returns {number}
 */
export function getActiveZoneIndex() {
    return activeZoneIndex;
}

/**
 * Returns the active megafactory zone descriptor.
 * @returns {{ name: string, distMin: number, distMax: number, lightCol: number, fogCol: number }}
 */
export function getActiveZone() {
    return FOUNDRY_ZONES[activeZoneIndex] || FOUNDRY_ZONES[0];
}

