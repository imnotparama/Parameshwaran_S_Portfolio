// @ts-check
// ============================================================
// Night Bench — the power moment.
//
// Click the PWR LED in the HUD (or press P) to cut the bench
// lights: the room lights fade to ~4%, the fab-bench backdrop
// swaps to its lights-out variant, bloom ramps so the emissive
// traces/LEDs bloom harder, and a signal-green surge floods the
// main bus (U1→U2) like power coming on. The board's emissive
// elements — traces, LEDs, silicon die, current dot — become the
// only light source. Press again to restore the bench.
//
// The toggle is fully reversible, interruptible (rapid P presses
// kill the in-flight fade and rebuild), and gated by
// prefers-reduced-motion (no surge sweep — just the state fade).
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { benchLights, setBenchBackdrop, setBloomBoost } from './scene.js';
import { boardGroup } from './board.js';
import { traceData } from './traces.js';
import { beepBuzzer } from '../utils/buzzer.js';
import { relayClick } from '../utils/sound.js';
import { motionPrefs } from '../utils/motion-prefs.js';

/** @type {boolean} */
let powerOn = false;
/** @type {gsap.core.Timeline | null} */
let powerTimeline = null;
/** @type {THREE.PointLight | null} */
let surgeLight = null;
/** @type {THREE.CatmullRomCurve3 | null} */
let surgeCurve = null;
/** @type {THREE.Vector3} */
const scratch = new THREE.Vector3();

// Decorative one-shot — reduced-motion users get the state fade without the
// traveling surge (same gate pattern as the radar ring / current dot; the
// flag comes from motionPrefs, the single policy source).

/** Build the surge light + its flight path. Called once after the scene,
 *  traces, and bloom exist (main.js wires it after enableBloom). */
export function initPower() {
    // The surge rides the U1→U2 main bus (the first trace route). Parented to
    // boardGroup so it inherits the group's 0.85 scale and parallax bob —
    // curve points are board-local, so no world-offset math is needed.
    const route = traceData.find(r => r.component === 'U2') || traceData[0];
    if (!route) return;
    surgeCurve = new THREE.CatmullRomCurve3(route.points, false, 'catmullrom', 0.4);
    if (!boardGroup) return;
    surgeLight = new THREE.PointLight(0x3ee6a0, 0, 20);
    surgeLight.position.set(route.points[0].x, route.points[0].y, route.points[0].z + 0.5);
    boardGroup.add(surgeLight);
}

/** @returns {boolean} */
export function isPowerOn() {
    return powerOn;
}

/** Toggle the bench lights. */
export function togglePower() {
    // The relay throw — the mechanical click of the night-bench switch.
    // Gated on the master SND toggle inside sound.js (muted by default).
    relayClick();
    setPower(!powerOn);
}

/** Kill the lights (on) or restore them (off). Interruptible: a mid-fade
 *  toggle kills the in-flight timeline and rebuilds from the current state —
 *  rapid P presses never queue up.
 *  @param {boolean} on */
export function setPower(on) {
    if (powerOn === on) return;
    powerOn = on;
    document.body.classList.toggle('night-bench', powerOn);
    if (powerTimeline) powerTimeline.kill();

    const tl = gsap.timeline();
    powerTimeline = tl;

    // 1. The bench lights fade out (on) or back in (off) — the whole rig on
    //    the house curve. Only emissive materials keep the board lit at rest.
    benchLights.forEach(({ light, base }) => {
        tl.to(light, {
            intensity: powerOn ? base * 0.04 : base,
            duration: 0.9,
            ease: 'power2.inOut'
        }, 0);
    });

    // 2. Backdrop + bloom follow the fade: the room visibly darkens while the
    //    lights are still dying, then the emissive glow blooms harder.
    tl.add(() => setBenchBackdrop(powerOn), powerOn ? 0.25 : 0);
    tl.add(() => setBloomBoost(powerOn ? 2.2 : 1), powerOn ? 0.1 : 0);

    // 3. The horn marks the throw of the switch.
    tl.add(() => beepBuzzer(), 0.02);

    // 4. Power-ON surge: a signal-green point light floods the main bus from
    //    U1 to U2, peaking mid-route, then settles dark.
    if (powerOn && !motionPrefs.reduced && surgeCurve && surgeLight) {
        // Local captures — module-level lets can't be narrowed across the
        // tween's closures (they could be reassigned between check and call).
        const curve = surgeCurve;
        const light = surgeLight;
        const proxy = { t: 0 };
        tl.add(gsap.fromTo(proxy, { t: 0 }, {
            t: 1,
            duration: 0.9,
            ease: 'power1.inOut',
            onUpdate: () => {
                curve.getPoint(proxy.t, scratch);
                light.position.set(scratch.x, scratch.y, scratch.z + 0.5);
                light.intensity = Math.sin(proxy.t * Math.PI) * 7;
            },
            onComplete: () => { light.intensity = 0; }
        }), 0.06);
    }
}
