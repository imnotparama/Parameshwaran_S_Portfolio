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

    playerLight = new THREE.PointLight(0x00ffcc, 3.2, 8.5);
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

    // 2. Update camera position & subtle speed bobbing
    if (!motionPrefs.reduced) {
        const bob = Math.sin(sim.dist * 0.12) * 0.025;
        gameCamera.position.y = 1.85 + bob;
    }

    // 3. Render 3D Sub-Scene to CRT canvas
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
