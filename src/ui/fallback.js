// @ts-check
import * as THREE from 'three';

// ============================================================
// WebGL Fallback — graceful degradation for unsupported browsers
// ============================================================

export function detectWebGL() {
    try {
        const canvas = document.createElement('canvas');
        /** @type {WebGLRenderingContext | null} */
        const gl = /** @type {WebGLRenderingContext | null} */ (
            canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        );
        if (!gl) return false;
        // Check for minimum required extensions
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        return true;
    } catch (e) {
        return false;
    }
}

export function showFallbackUI() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    container.innerHTML = `
        <div class="webgl-fallback">
            <div class="fallback-content">
                <div class="fallback-icon">⚡</div>
                <h2 class="fallback-title">WebGL Not Available</h2>
                <p class="fallback-text">
                    Your browser does not support WebGL, which is required to render the 3D PCB portfolio.
                </p>
                <p class="fallback-text">
                    Please try using a modern browser like Chrome, Firefox, or Edge.
                </p>
                <div class="fallback-links">
                    <a href="https://get.webgl.org/" target="_blank" class="nav-btn" rel="noopener noreferrer">[ CHECK WEBGL SUPPORT ]</a>
                    <a href="https://github.com/imnotparama" target="_blank" class="nav-btn" rel="noopener noreferrer">[ VISIT GITHUB ]</a>
                </div>
            </div>
        </div>
    `;

    // Hide boot overlay since we can't show the 3D content
    const bootOverlay = document.getElementById('boot-overlay');
    if (bootOverlay) bootOverlay.style.display = 'none';
}

// Clean up Three.js resources on page unload
/** @param {THREE.Scene} scene @param {THREE.WebGLRenderer} renderer */
export function setupCleanup(scene, renderer) {
    window.addEventListener('beforeunload', () => {
        disposeScene(scene);
        if (renderer) {
            renderer.dispose();
            renderer.forceContextLoss();
        }
    });
}

/** @param {THREE.Scene | undefined} scene */
function disposeScene(scene) {
    if (!scene) return;
    scene.traverse((/** @type {THREE.Object3D} */ obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => disposeMaterial(m));
                } else {
                    disposeMaterial(obj.material);
                }
            }
        }
    });
}

/** @param {THREE.Material} mat */
function disposeMaterial(mat) {
    // MeshStandardMaterial carries map/lightMap/envMap — dispose them
    // defensively for any material that has them.
    const texMat = /** @type {THREE.MeshStandardMaterial} */ (mat);
    if (texMat.map) texMat.map.dispose();
    if (texMat.lightMap) texMat.lightMap.dispose();
    if (texMat.envMap) texMat.envMap.dispose();
    mat.dispose();
}
