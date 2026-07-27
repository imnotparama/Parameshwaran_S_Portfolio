import * as THREE from 'three';

export let scene;
export let camera;
export let renderer;

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
        }, 100);
    });

    // 6. Start Render/Animation Tick loop
    const clock = new THREE.Clock();

    function animate() {
        const delta = clock.getDelta();
        const elapsed = clock.getElapsedTime();

        // Run registered callbacks
        tickCallbacks.forEach(callback => callback(elapsed, delta));

        // Render pass
        renderer.render(scene, camera);

        requestAnimationFrame(animate);
    }
    animate();
}
