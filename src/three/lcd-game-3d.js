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
//   - High-performance zero-allocation obstacle pooling
//   - Lighting rig: cyber ambient, top-down key light, player point light
// ============================================================
import * as THREE from 'three';
import { motionPrefs } from '../utils/motion-prefs.js';

// Screen resolution for the arcade display
const CRT_W = 512;
const CRT_H = 256;

// Track geometry constants
const TRACK_WIDTH = 2.4;
const RAIL_WIDTH = 0.7;
const TILE_LENGTH = 5.0;
const NUM_TILES = 12;

// Simulation ground height baseline (matches GROUND_Y in lcd-sim.js)
const SIM_GROUND_Y = 50;

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

/** @type {THREE.MeshStandardMaterial | null} */
let copperRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let neonRailMat = null;

/** @type {THREE.MeshStandardMaterial | null} */
let trackFloorMat = null;

/** @type {boolean} */
let isInitialized = false;

/**
 * Initialize the 3D game engine attached to the arcade CRT canvas.
 * Safe in headless environments: returns false if WebGL is unavailable.
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean}
 */
export function init3dGame(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return false;

    // Check WebGL availability
    let gl = null;
    try {
        gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    } catch {
        return false;
    }
    if (!gl) return false;

    boundCanvas = canvas;
    boundCanvas.width = CRT_W;
    boundCanvas.height = CRT_H;

    // 1. Create Game Scene
    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x020a06);
    gameScene.fog = new THREE.FogExp2(0x020a06, 0.038);

    // 2. Perspective Camera (3rd person chase angle)
    gameCamera = new THREE.PerspectiveCamera(62, CRT_W / CRT_H, 0.1, 100);
    gameCamera.position.set(0, 1.85, 3.9);
    gameCamera.lookAt(0, 0.65, -9.0);

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

    isInitialized = true;
    return true;
}

/**
 * Constructs modular looping track segments.
 */
function buildTrack() {
    if (!gameScene || !copperRailMat || !neonRailMat || !trackFloorMat) return;

    trackGroup = new THREE.Group();
    gameScene.add(trackGroup);
    trackTiles = [];

    const floorGeo = new THREE.PlaneGeometry(TRACK_WIDTH, TILE_LENGTH);
    floorGeo.rotateX(-Math.PI / 2);

    const railGeo = new THREE.BoxGeometry(RAIL_WIDTH, 0.06, TILE_LENGTH);
    const edgeGuideGeo = new THREE.BoxGeometry(0.06, 0.08, TILE_LENGTH);

    for (let i = 0; i < NUM_TILES; i++) {
        const tile = new THREE.Group();

        // Dark PCB Track Floor
        const floor = new THREE.Mesh(floorGeo, trackFloorMat);
        floor.position.y = -0.01;
        tile.add(floor);

        // Center ENIG Copper Busway Rail
        const rail = new THREE.Mesh(railGeo, copperRailMat);
        rail.position.y = 0.03;
        tile.add(rail);

        // Left & Right Neon Guide Tracks
        const guideL = new THREE.Mesh(edgeGuideGeo, neonRailMat);
        guideL.position.set(-TRACK_WIDTH / 2 + 0.05, 0.04, 0);
        tile.add(guideL);

        const guideR = new THREE.Mesh(edgeGuideGeo, neonRailMat);
        guideR.position.set(TRACK_WIDTH / 2 - 0.05, 0.04, 0);
        tile.add(guideR);

        // Circuit grid markers on floor
        const markerGeo = new THREE.PlaneGeometry(TRACK_WIDTH * 0.85, 0.08);
        markerGeo.rotateX(-Math.PI / 2);
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0x10794a,
            transparent: true,
            opacity: 0.4
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(0, 0.005, TILE_LENGTH / 2 - 0.2);
        tile.add(marker);

        tile.position.z = -i * TILE_LENGTH;
        trackGroup.add(tile);
        trackTiles.push(tile);
    }
}

/**
 * Builds distant glowing wireframe monoliths and horizon grid.
 */
function buildHorizon() {
    if (!gameScene) return;

    horizonGroup = new THREE.Group();
    gameScene.add(horizonGroup);

    // Cyber wireframe towers in the background
    const towerGeo = new THREE.BoxGeometry(2.5, 12, 2.5);
    const towerMat = new THREE.MeshBasicMaterial({
        color: 0x0a3d22,
        wireframe: true,
        transparent: true,
        opacity: 0.4
    });

    for (let i = 0; i < 10; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const dist = -18 - (i * 4.5);
        const xPos = side * (5.5 + (i * 1.2));
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(xPos, 4.0, dist);
        horizonGroup.add(tower);
    }

    // Distant horizon laser ring
    const ringGeo = new THREE.TorusGeometry(18, 0.12, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.35,
        wireframe: true
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 2.5, -45);
    horizonGroup.add(ring);
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

    // 3. Ground Shadow
    const shadowGeo = new THREE.PlaneGeometry(0.48, 0.65);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55
    });
    playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    playerShadow.position.set(0, 0.035, 0);
    gameScene.add(playerShadow);

    // 4. Dash Afterimage Ghosts
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

    // 5. Instanced Particle Jet Trail
    const trailGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const trailMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.75
    });
    trailInstanced = new THREE.InstancedMesh(trailGeo, trailMat, TRAIL_COUNT);
    trailInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gameScene.add(trailInstanced);

    // 6. Slide Rail Friction Sparks
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
// 3D Procedural Obstacle Factories & Pooling
// ─────────────────────────────────────────────────────────────

/**
 * 1. 3D SMT Resistor: Ceramic body, nickel end caps, colored stripes
 */
function createResistorMesh() {
    const grp = new THREE.Group();
    // Ceramic body
    const bodyGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.52, 12);
    bodyGeo.rotateZ(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x383b40, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    grp.add(body);

    // Metallic End Caps
    const capGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.08, 12);
    capGeo.rotateZ(Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.2 });
    const capL = new THREE.Mesh(capGeo, capMat);
    capL.position.x = -0.23;
    grp.add(capL);

    const capR = new THREE.Mesh(capGeo, capMat);
    capR.position.x = 0.23;
    grp.add(capR);

    // Colored Resistance Bands
    const bandGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.04, 12);
    bandGeo.rotateZ(Math.PI / 2);
    const colors = [0x111111, 0x8b4513, 0xff2200, 0xd4af37];
    [-0.12, -0.04, 0.04, 0.12].forEach((xPos, idx) => {
        const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ color: colors[idx] }));
        band.position.x = xPos;
        grp.add(band);
    });

    grp.userData = { type: 'resistor' };
    return grp;
}

/**
 * 2. 3D Can Capacitor: Aluminum electrolytic cylinder with top vent
 */
function createCapacitorMesh() {
    const grp = new THREE.Group();
    // Can body
    const canGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.58, 16);
    const canMat = new THREE.MeshStandardMaterial({
        color: 0x48525e,
        metalness: 0.85,
        roughness: 0.25,
        emissive: 0x112233,
        emissiveIntensity: 0.2
    });
    const can = new THREE.Mesh(canGeo, canMat);
    can.position.y = 0.29;
    grp.add(can);

    // Top vent cross
    const ventGeo = new THREE.BoxGeometry(0.3, 0.02, 0.05);
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x1f2429 });
    const vent1 = new THREE.Mesh(ventGeo, ventMat);
    vent1.position.y = 0.585;
    grp.add(vent1);
    const vent2 = new THREE.Mesh(ventGeo, ventMat);
    vent2.position.y = 0.585;
    vent2.rotation.y = Math.PI / 2;
    grp.add(vent2);

    // Spark node on top
    const sparkNodeGeo = new THREE.OctahedronGeometry(0.06, 0);
    const sparkNodeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const sparkNode = new THREE.Mesh(sparkNodeGeo, sparkNodeMat);
    sparkNode.position.y = 0.64;
    grp.add(sparkNode);

    grp.userData = { type: 'capacitor', sparkNode };
    return grp;
}

/**
 * 3. 3D Laser Beam Emitters: Twin neon pylons with horizontal volumetric laser
 */
function createBeamMesh() {
    const grp = new THREE.Group();
    // Twin emitter pylons on lateral edges
    const pylonGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6);
    const pylonMat = new THREE.MeshStandardMaterial({
        color: 0x22262a,
        metalness: 0.7,
        roughness: 0.3
    });

    const pylonL = new THREE.Mesh(pylonGeo, pylonMat);
    pylonL.position.set(-TRACK_WIDTH / 2 + 0.1, 0.55, 0);
    grp.add(pylonL);

    const pylonR = new THREE.Mesh(pylonGeo, pylonMat);
    pylonR.position.set(TRACK_WIDTH / 2 - 0.1, 0.55, 0);
    grp.add(pylonR);

    // Pulsing volumetric laser beam (must slide under!)
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, TRACK_WIDTH - 0.2, 8);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xff3366,
        transparent: true,
        opacity: 0.9
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.55, 0);
    grp.add(beamMesh);

    // Secondary core beam
    const coreBeamGeo = new THREE.CylinderGeometry(0.015, 0.015, TRACK_WIDTH - 0.2, 6);
    coreBeamGeo.rotateZ(Math.PI / 2);
    const coreBeamMesh = new THREE.Mesh(coreBeamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    coreBeamMesh.position.set(0, 0.55, 0);
    grp.add(coreBeamMesh);

    grp.userData = { type: 'beam', beamMesh };
    return grp;
}

/**
 * 4. 3D Broken Trace Gap / PCB Chasm
 */
function createGapMesh() {
    const grp = new THREE.Group();
    // Void box (dark abyss cut into the track)
    const voidGeo = new THREE.BoxGeometry(RAIL_WIDTH + 0.12, 0.45, 1.35);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000201 });
    const voidBox = new THREE.Mesh(voidGeo, voidMat);
    voidBox.position.set(0, -0.22, 0);
    grp.add(voidBox);

    // Frayed copper sparks at both ends of the break
    const frayGeo = new THREE.BoxGeometry(0.06, 0.06, 0.08);
    const frayMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0 });
    const fray1 = new THREE.Mesh(frayGeo, frayMat);
    fray1.position.set(0, 0.04, -0.68);
    grp.add(fray1);
    const fray2 = new THREE.Mesh(frayGeo, frayMat);
    fray2.position.set(0, 0.04, 0.68);
    grp.add(fray2);

    grp.userData = { type: 'gap' };
    return grp;
}

/**
 * 5. 3D Solenoid Relay Gate: Oscillating mechanical contact arm
 */
function createRelayMesh() {
    const grp = new THREE.Group();
    // Housing
    const boxGeo = new THREE.BoxGeometry(0.62, 0.46, 0.38);
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1a2e22,
        metalness: 0.6,
        roughness: 0.4,
        emissive: 0x0a1e12,
        emissiveIntensity: 0.2
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 0.52, 0);
    grp.add(box);

    // Oscillating solenoid arm
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xd49b38, metalness: 0.9, roughness: 0.2 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 0.24, 0);
    grp.add(arm);

    grp.userData = { type: 'relay', arm };
    return grp;
}

/**
 * 6. 3D Voltage Spike: Jagged amber crystal pyramids
 */
function createSpikeMesh() {
    const grp = new THREE.Group();
    const spikeGeo = new THREE.ConeGeometry(0.14, 0.42, 4);
    const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff7700,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.8
    });

    const s1 = new THREE.Mesh(spikeGeo, spikeMat);
    s1.position.set(-0.16, 0.21, 0);
    grp.add(s1);

    const s2 = new THREE.Mesh(spikeGeo, spikeMat);
    s2.position.set(0.16, 0.21, 0);
    grp.add(s2);

    const s3 = new THREE.Mesh(spikeGeo, spikeMat);
    s3.scale.set(1.25, 1.25, 1.25);
    s3.position.set(0, 0.26, 0);
    grp.add(s3);

    grp.userData = { type: 'spike' };
    return grp;
}

/**
 * Retrieves a pooled obstacle or creates one on demand.
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
    // Create new mesh if none available
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

/**
 * Synchronize 3D obstacles with simulation actors.
 * @param {number} delta
 * @param {any} sim
 */
function updateObstacles(delta, sim) {
    if (!obstacleGroup || !sim || !Array.isArray(sim.actors)) return;

    // 1. Hide all pooled obstacles
    for (const key of Object.keys(obstaclePool)) {
        const list = obstaclePool[key];
        for (let i = 0; i < list.length; i++) {
            list[i].visible = false;
        }
    }

    // 2. Position active obstacles
    for (const a of sim.actors) {
        if (a.kind !== 'obstacle') continue;

        // Player is at x = 16 in 2D simulation
        const relX = a.x - 16;
        // Transform 2D horizontal distance to 3D Z depth
        const z3d = -relX * 0.38;

        // Skip obstacles far behind camera
        if (z3d > 4.0 || z3d < -55.0) continue;

        const mesh = getPooledObstacle(a.type);
        mesh.position.z = z3d;

        if (a.type === 'beam') {
            mesh.position.set(0, 0, z3d);
            if (mesh.userData.beamMesh) {
                // Pulse laser opacity
                mesh.userData.beamMesh.material.opacity = 0.7 + 0.3 * Math.sin(sim.dist * 0.4);
            }
        } else if (a.type === 'gap') {
            mesh.position.set(0, 0, z3d);
        } else if (a.type === 'relay') {
            mesh.position.set(0, 0, z3d);
            if (mesh.userData.arm) {
                // Oscillate relay contact arm with actor phase
                mesh.userData.arm.position.y = 0.24 + Math.sin(a.phase) * 0.12;
            }
        } else if (a.type === 'capacitor') {
            mesh.position.set(0, 0, z3d);
            if (mesh.userData.sparkNode) {
                mesh.userData.sparkNode.rotation.y += delta * 6.0;
            }
        } else {
            // Resistor / Spike: sit on copper rail
            mesh.position.set(0, 0, z3d);
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

    // 1. Calculate Target 3D Height from 2D sim py
    const heightNorm = Math.max(0, (SIM_GROUND_Y - sim.py) / 38.0);
    const baseTargetY = 0.28 + heightNorm * 1.35;

    // 2. Action States Kinematics
    if (sim.sliding) {
        // Flat streamline pose: core compresses, rings tilt flat
        coreMesh.scale.set(1.45, 0.35, 1.45);
        if (innerSparkMesh) innerSparkMesh.scale.set(1.4, 0.3, 1.4);
        outerRingMesh.rotation.set(Math.PI / 2, 0, 0);
        innerRingMesh.rotation.set(Math.PI / 2, 0, 0);
        playerGroup.position.y = 0.16;

        // Slide rail sparks emission
        if (slideSparks) {
            slideSparks.visible = true;
            for (let i = 0; i < SPARK_COUNT; i++) {
                const vel = sparkVels[i];
                vel.life -= delta * 4.0;
                if (vel.life <= 0) {
                    sparkPositions[i * 3] = (Math.random() - 0.5) * 0.2;
                    sparkPositions[i * 3 + 1] = 0.04;
                    sparkPositions[i * 3 + 2] = 0.1;
                    vel.vx = (Math.random() - 0.5) * 1.8;
                    vel.vy = Math.random() * 1.2 + 0.4;
                    vel.vz = Math.random() * 3.5 + 2.0;
                    vel.life = 1.0;
                } else {
                    sparkPositions[i * 3] += vel.vx * delta;
                    sparkPositions[i * 3 + 1] += vel.vy * delta;
                    sparkPositions[i * 3 + 2] += vel.vz * delta;
                    vel.vy -= 9.8 * delta * 0.5; // gravity
                }
            }
            const posAttr = slideSparks.geometry.getAttribute('position');
            if (posAttr) posAttr.needsUpdate = true;
        }
    } else {
        if (slideSparks) slideSparks.visible = false;

        if (sim.dashing) {
            // Forward needle stretch
            coreMesh.scale.set(0.75, 0.75, 2.2);
            if (innerSparkMesh) innerSparkMesh.scale.set(0.7, 0.7, 2.0);
            outerRingMesh.rotation.x += delta * 12.0;
            innerRingMesh.rotation.y += delta * 15.0;
            playerGroup.position.y = baseTargetY;
        } else {
            // Standard scale
            coreMesh.scale.set(1, 1, 1);
            if (innerSparkMesh) innerSparkMesh.scale.set(1, 1, 1);

            if (!sim.onGround) {
                // Jump / Somersault Flip
                const flipSpeed = (sim.jumpsUsed >= 2 ? 18.0 : 10.0);
                playerGroup.rotation.x += delta * flipSpeed;
                playerGroup.position.y = baseTargetY;
            } else {
                // Ground Run: Hovering bob & continuous ring precession
                playerGroup.rotation.x *= 0.82;
                playerGroup.rotation.z *= 0.82;
                const bob = Math.sin(sim.dist * 0.25) * 0.035;
                playerGroup.position.y = baseTargetY + bob;

                outerRingMesh.rotation.x += delta * 3.8;
                outerRingMesh.rotation.y += delta * 2.4;
                innerRingMesh.rotation.y += delta * 4.8;
                innerRingMesh.rotation.z += delta * 3.2;
            }
        }
    }

    // 3. Update Dash Afterimage Ghosts
    if (afterimages.length >= 2) {
        if (sim.dashing) {
            afterimages[0].visible = true;
            afterimages[1].visible = true;
            afterimages[0].position.set(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z + 0.35);
            afterimages[0].scale.set(0.7, 0.7, 1.8);
            afterimages[1].position.set(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z + 0.70);
            afterimages[1].scale.set(0.65, 0.65, 1.5);
        } else {
            afterimages[0].visible = false;
            afterimages[1].visible = false;
        }
    }

    // 4. Update Particle Jet Trail
    if (trailInstanced) {
        // Shift trail history
        for (let i = TRAIL_COUNT - 1; i > 0; i--) {
            trailHistory[i].x = trailHistory[i - 1].x;
            trailHistory[i].y = trailHistory[i - 1].y;
            trailHistory[i].z = trailHistory[i - 1].z + (sim.curSpeed || 85) * delta * 0.045;
        }
        trailHistory[0].x = playerGroup.position.x;
        trailHistory[0].y = playerGroup.position.y;
        trailHistory[0].z = playerGroup.position.z + 0.25;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < TRAIL_COUNT; i++) {
            const node = trailHistory[i];
            const p = 1.0 - (i / TRAIL_COUNT);
            const scale = p * 0.09;
            dummy.position.set(node.x, node.y, node.z);
            dummy.scale.set(scale, scale, scale * 1.6);
            dummy.updateMatrix();
            trailInstanced.setMatrixAt(i, dummy.matrix);
        }
        trailInstanced.instanceMatrix.needsUpdate = true;
    }

    // 5. Update Ground Shadow
    if (playerShadow) {
        playerShadow.position.y = 0.035;
        const shadowOpacity = Math.max(0.08, 0.55 - heightNorm * 0.38);
        /** @type {THREE.MeshBasicMaterial} */ (playerShadow.material).opacity = shadowOpacity;
        const shadowScale = Math.max(0.6, 1.0 - heightNorm * 0.3);
        playerShadow.scale.set(shadowScale, shadowScale, shadowScale);
    }

    // 6. Update Dynamic Player Point Light
    if (playerLight) {
        playerLight.position.set(0, playerGroup.position.y + 0.15, 0.1);
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

    // 1. Advance Track Tiles based on distance
    const trackSpeed = sim.curSpeed || 85;
    const scrollZ = (trackSpeed * delta * 0.05);

    if (trackTiles.length > 0) {
        for (let i = 0; i < trackTiles.length; i++) {
            const tile = trackTiles[i];
            tile.position.z += scrollZ;
            // Loop back when tile passes behind camera
            if (tile.position.z > 5.0) {
                // Find current furthest tile
                let minZ = 0;
                for (let j = 0; j < trackTiles.length; j++) {
                    if (trackTiles[j].position.z < minZ) minZ = trackTiles[j].position.z;
                }
                tile.position.z = minZ - TILE_LENGTH;
            }
        }
    }

    // 2. Update 3D Obstacles
    updateObstacles(delta, sim);

    // 3. Update 3D Cyber-Pulse Avatar
    updatePlayer(delta, sim);

    // 4. Update camera position & subtle speed bobbing
    if (!motionPrefs.reduced) {
        const bob = Math.sin(sim.dist * 0.12) * 0.025;
        gameCamera.position.y = 1.85 + bob;
    }

    // 5. Render 3D Sub-Scene to CRT canvas
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
