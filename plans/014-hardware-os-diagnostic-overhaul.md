# Implementation Plan: Hardware Operating System & Diagnostic Instrument Overhaul

## Executive Summary
Transform the LCD1 subsystem from a dashboard with card boxes into an **authentic, mission-grade Hardware Operating System and Diagnostic Instrument** inspired by world-class engineering suites (Altium Designer, Saleae Logic, Unreal Engine 5, Vivado, and KiCad).

This plan tackles the fundamental issues identified:
1. **Kill the Boxy "Bootstrap" Cards**: Eliminate stacked rounded boxes. Replace with an integrated, borderless engineering interface driven by hierarchy, hairline rules, tabular monospace numerals, and breathing whitespace.
2. **Make the Right Panel Feel Alive**: Introduce continuous living micro-motion—a live 60fps canvas oscilloscope waveform, real-time analog voltage jitter (`3.298V` ↔ `3.302V`), thermal drift (`41.8°C` ↔ `42.1°C`), and streaming UART firmware logs.
3. **Curate the Information**: Reduce visual noise by ~50%. Replace 20 competing metrics/badges with **5 curated hero metrics** that breathe.
4. **Physical LCD Realism**: Make the LCD screen look and behave like a genuine 2.4" physical TFT/IPS panel—subpixel RGB raster grid, exponential phosphor persistence ghosting, corner backlight bleed, glass specular glare, and subtle 60Hz micro-flicker.
5. **Diagnostic Concept Reframing**: Reframe the game into an authentic electrical carrier pulse routing routine across broken bus traces, floating EMI interference, and noise spikes.
6. **The Flagship Three.js "WOW" Moment — 1000m Board-Wide Overclock Event**: At the 1000m milestone, trigger a synchronized 5-second board-wide spectacle:
   - Full motherboard copper traces surge with lightning current.
   - U1 Silicon CPU die flares through the laser-etched lid with intense emissive bloom.
   - C1–C4 capacitor banks discharge cascading plasma arcs.
   - D1–D7 LED array executes a supersonic runway chase.
   - Voltage readout surges to `3.65V` and temperature climbs to `68°C`.
   - Oscilloscope canvas spikes violently into high-frequency clipping.
   - Synthesized fan turbine whines up with ramping pitch and air rush.
   - Camera micro-shakes dynamically with realistic mechanical resonance.

---

## Architectural Comparison: Before vs. After

```
BEFORE (Arcade Web Dashboard)               AFTER (Hardware OS & Diagnostic Instrument)
┌─────────────────────────────────┐         ┌──────────────────────────────────────────────┐
│ [Card Box: Preview CRT]         │         │ SYSTEM DIAGNOSTICS // BUS ANALYZER           │
└─────────────────────────────────┘         │ ST7789V 2.4" TFT · SPI 16.0MHz · VDD 3.30V   │
┌─────────────────────────────────┐         ├──────────────────────────────────────────────┤
│ [Card Box: 6 Metric Grid]       │         │ █ LIVE BUS WAVEFORM (32px Oscilloscope)      │
│  Dist | Score | Speed | Combo   │         │ ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿  │
└─────────────────────────────────┘         ├──────────────────────────────────────────────┤
┌─────────────────────────────────┐         │ 5 CURATED HERO METRICS (Clean Tabular Grid)  │
│ [Card Box: Integrity Deck]      │         │                                              │
│  Bar: 100% NOMINAL              │         │  BUS INTEGRITY      CARRIER DISTANCE         │
└─────────────────────────────────┘         │  99.4%              0,428 m                  │
┌─────────────────────────────────┐         │  CONTINUITY: LOCKED  REG 0x04: PROPAGATING   │
│ [Card Box: 4 Power Badges]      │         │                                              │
│  OC·2X | MAG | DEF | SPD        │         │  PACKETS ROUTED     VDD RAIL       CORE TEMP │
└─────────────────────────────────┘         │  142 pkts           3.301 V        41.9 °C   │
┌─────────────────────────────────┐         │  DMA FIFO OK        ±0.003V NOISE  THERMAL   │
│ [Card Box: UART Window]         │         ├──────────────────────────────────────────────┤
└─────────────────────────────────┘         │ LIVE FIRMWARE UART STREAM (Hairline border)  │
┌─────────────────────────────────┐         │ [SPI] CLK SYNC 16.0MHz LOCKED                │
│ [Card Box: EEPROM Leaderboard]  │         │ [DMA] BURST #142 -> U1_FIFO OK               │
└─────────────────────────────────┘         │ [PWR] RAIL VDD 3.301V NOMINAL                │
┌─────────────────────────────────┐         ├──────────────────────────────────────────────┤
│ [Card Box: 5 Arcade Buttons]    │         │ [W/SPACE] INJECT PULSE  [S/↓] CLEAR  [D] DASH│
└─────────────────────────────────┘         └──────────────────────────────────────────────┘
```

---

## Detailed Implementation Phases

### Phase 1: Altium / Saleae Instrument Layout (Kill the Boxes)
- **Eliminate Box Backgrounds & Heavy Borders**:
  - Remove all rounded cards (`background: rgba(...)`, `border-radius: 8px`, `box-shadow`).
  - Use Altium / Saleae Logic inspired architecture:
    - Pure transparent dark workspace surface (`#030906` / `#050f0a`).
    - Delicate 1px hairline dividers (`border-bottom: 1px solid rgba(62, 230, 160, 0.12)`).
    - True tabular grid with monospace numerical features (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`).
    - Generous negative whitespace between sections so data can breathe.
- **Typographic Hierarchy**:
  - **Station Title**: `font-size: 18px`, `font-weight: 700`, `letter-spacing: 0.14em`, crisp phosphor-white `#eafff4`.
  - **Subtitle**: `font-size: 9px`, `font-weight: 500`, `letter-spacing: 0.2em`, muted technical cyan `rgba(62, 230, 160, 0.6)`.
  - **Hero Metric Numerals**: `font-size: 32px`, `font-weight: 800`, `font-family: var(--font-mono)`, high-contrast amber/green phosphor glow.
  - **Micro Technical Tags**: `font-size: 8px`, `letter-spacing: 0.22em`, register annotations (`REG 0x12 // DMA_ACTIVE`).
  - **Muted Secondary Info**: Low-contrast phosphor dim (`rgba(220, 240, 230, 0.45)`).

---

### Phase 2: Living Telemetry Engine & Continuous Micro-Motion
Professional instruments are never frozen. Every element continuously breathes:
- **Real-Time Oscilloscope Waveform Canvas**:
  - Implement a dedicated 32px-high continuous canvas element (`#diag-scope-canvas`) at the top of the telemetry section.
  - Renders a rolling live SPI high-frequency square wave with subtle jitter, eye-diagram shimmer, and clock pulses at 60fps.
  - During player jumps, dashes, or collisions, the waveform spikes or ripples with realistic transient ringing!
- **Analog Jitter Engine**:
  - Procedural micro-noise loop running at 10-15Hz:
    - **Rail Voltage**: Drifts subtly between `3.298 V` and `3.303 V` (`3.300 ± Math.sin(t*3)*0.002 + rand*0.001`).
    - **Die Temperature**: Drifts between `41.8 °C` and `42.1 °C` based on activity.
    - **Bus Clock Pulse**: A 1Hz pulsing micro-dot (`●`) indicating active bus master heartbeat.
- **Continuous UART Telemetry Stream**:
  - A clean, borderless terminal stream that periodically scrolls authentic firmware messages:
    - `[SPI] CLK SYNC PHASE 0x1A LOCKED`
    - `[DMA] CARRIER BURST 16B -> U1_FIFO`
    - `[PWR] RAIL VDD 3.301V NOMINAL`
    - `[EMI] AMBIENT NOISE FLOOR -82dBm`
  - Automatically scrolls with zero layout shifts or jumpiness.

---

### Phase 3: Physical LCD Realism (On-Glass Optics in Three.js)
Make the soldered 2.4" LCD screen look and behave like a genuine physical TFT/IPS display:
- **Subpixel RGB Raster & Grid Mask**:
  - Render a crisp subpixel triad shadow mask on the 2D LCD canvas to recreate physical LCD aperture grille lines.
- **Exponential Phosphor Persistence Ghosting**:
  - Add an optical persistence ghost buffer. High-velocity carrier pulses leave subtle phosphor ghost trails that naturally decay over 3-4 frames.
- **Optical Display Flaws**:
  - **Corner Backlight Bleed**: Subtle non-uniform luminance bleeding outward from the corners of the display bezel.
  - **Viewing Angle Contrast Falloff**: Slight contrast and chrominance shift dependent on the 3D camera angle.
  - **Glass Specular Glare**: Dynamic glossy sheen across the glass face that catches Three.js studio lights.
  - **60Hz Micro-Flicker**: Imperceptible 60Hz luminance flutter simulating active LED backlighting.
  - **Hardware Dead/Hot Subpixel**: A single subtle hot subpixel at (x: 418, y: 82), an authentic hallmark of physical display panels.

---

### Phase 4: Diagnostic Pulse Routing Concept Reframing
Completely reframe the simulation mechanics from an arcade jumper into a genuine PCB diagnostic routine:
- **Concept**:
  - The "player" is a **Differential Electrical Carrier Pulse** propagating along a high-speed SPI bus trace.
  - **Obstacles are Circuit Faults**:
    - `BROKEN TRACE GAP`: Trace impedance discontinuity where the signal must leap via capacitive coupling (`[W/SPACE] PULSE JUMP`).
    - `FLOATING EMI CLOUD`: Inductive EMI field hanging overhead that requires ducking/ground clearance (`[S/DOWN] GROUND CLEARANCE`).
    - `IMPEDANCE SPIKE / NOISE INJECTION`: High-voltage noise wall requiring a high-energy transient boost to punch through (`[D/SHIFT] BURST DASH`).
  - **Pickups**:
    - `DATA PACKET`: Synchronous payload packet restoring FIFO buffer.
    - `DECOUPLING CAPACITOR`: Restores rail integrity and clears bus ripple.
    - `CLOCK SYNC BEACON`: Re-locks PLL phase.
  - **Failure State**:
    - `// BUS SYNCHRONIZATION COLLAPSE //`
    - `Impedance mismatch at offset 0,428 m · Rail decoupled`
    - `[SPACE] RE-INITIALIZE CARRIER GENERATOR`

---

### Phase 5: The Flagship Three.js "WOW" Moment — 1000m Board-Wide Overclock Event
When the carrier pulse reaches **1000m** (or user triggers emergency overdrive):
The entire physical motherboard and telemetry console synchronously enter **OVERCLOCK MODE** for 5 unforgettable seconds:
1. **Motherboard Copper Traces Surge with Lightning**:
   - `energizeTraceForSection('sec-hero', true)` and `energizeTraceAtPoint(LCD_LOCAL, 3.5)` ignite copper trace networks across the motherboard.
   - Electrical wavefronts ripple outwards from CPU U1 to RAM, Flash, and LCD.
2. **Silicon CPU Die Flares Through the Lid**:
   - U1 Silicon Die emissive intensity surges from nominal `0.4` to `3.2` with brilliant cyan/gold bloom radiating through the laser-etched IHS lid.
3. **Capacitor Banks (C1-C4) Plasma Lightning Arcs**:
   - Cascade all 4 capacitor banks (`triggerCapacitorOverdrive()`).
   - Procedural electric arc lines jump between TP1, TP2, and capacitor terminals.
4. **D1-D7 Status LED Runway Chase**:
   - The onboard diagnostic LED array executes a supersonic back-and-forth chase sequence at triple speed.
5. **Telemetry Overdrive Spike**:
   - Supply voltage readout surges from `3.30V` to `3.65V` with an amber warning badge (`OVERVOLT SURGE`).
   - Silicon core temperature climbs from `41.9°C` to `68.4°C`.
   - Oscilloscope canvas spikes violently into high-voltage clipping.
   - UART console floods with supersonic system logs (`[TURBO] OVERVOLT 3.65V ENGAGED`, `[PLL] MULTIPLIER 8X LOCKED`, `[THERM] CORE TEMP SPIKE 68.4C`).
6. **Synthesized Turbine/Fan Ramp (Web Audio)**:
   - Web Audio synthesizes an accelerating turbine/cooling fan spool whine ramping up in pitch (200Hz ➔ 1400Hz) combined with filtered white-noise air rush.
7. **Cinematic Dynamic Camera Micro-Shake**:
   - The Three.js camera executes a subtle, high-frequency physical micro-shake with natural exponential decay over 5 seconds.
8. **Synchronized 5-Second Climax**:
   - At second 5, a cooling shockwave pulse radiates across the board, traces settle back to nominal 3.3V, fan ramps down, and an on-screen badge confirms:
     `DIAGNOSTIC BENCHMARK CERTIFIED // GRADE S: SILICON OVERDRIVE`.

---

## Verification & Safety Strategy
- **Headless Smoke Tests**:
  - `npm run smoke` (`tests/smoke-tick.mjs`) must pass 100% across all phases (A through F).
  - All internal simulation variables (`dist`, `score`, `electrons`, `bestScore`, `state`, etc.) are preserved.
- **Type Safety**:
  - `npm run typecheck` (`tsc --noEmit`) must remain 100% error-free.
- **Production Bundle**:
  - `npm run build` must compile cleanly with zero errors.
- **Commit Budget**:
  - Implement in atomic, disciplined commits with push after each commit, staying strictly within the budget.
