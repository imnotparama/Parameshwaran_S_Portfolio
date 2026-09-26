# Implementation Plan: LCD1 Hardware Diagnostic Station & Embedded PCB Integration

## Executive Summary
Transform the LCD1 mini-game from an arcade-style web prototype into an **authentic, mission-grade Embedded Hardware Diagnostic Station**. The redesign eliminates the redundant top-right preview box, reduces interface clutter by ~40% to match professional engineering tools (KiCad, Unreal Engine, Fusion 360, VS Code), converts all arcade phrasing into embedded systems terminology (Signal Packets, Signal Integrity, Power Rail 3.30V, Bus Sync), renders realistic hardware LCD optics (phosphor persistence, scanline raster, glass glare), and tightly couples the game to the 3D motherboard so that every in-game action (jumps, dashes, packet routing) physically lights up the PCB copper traces, capacitors, CPU LEDs, and live UART stream.

---

## Architecture & Visual Philosophy
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3D Motherboard Viewport (Left 58%)                                          │
│                                                                             │
│  [Camera zooms in directly to physical 2.4" LCD1 screen on the board]      │
│  • Rest of PCB dims to darkroom inspection level                            │
│  • Copper traces surge with light when jumping                              │
│  • U1 CPU status LED flashes on clock cycle                                │
│  • Capacitors discharge on Dash                                             │
│  • LCD glass has physical bezel shadow, scanlines, and optical persistence  │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ Synchronized Telemetry
┌─────────────────────────────────────────────────────────────────────────────┐
│ Right Panel (42%): Mission-Grade Hardware Diagnostic Deck                   │
│                                                                             │
│  1. SUBSYSTEM HEADER: LCD1 (2.4" ST7789V) · BUS INTEGRITY DIAGNOSTIC        │
│     Mission: Reconnect damaged communication bus traces                     │
│     Status: ● RUNNING / 60Hz · 3.30V NOMINAL                                │
│                                                                             │
│  2. SIGNAL INTEGRITY & BUS TELEMETRY (Replaces arcade score cards)          │
│     • Signal Integrity: [████████████████░░] 94.2%                          │
│     • Packet Loss: 1.8% · Power Rail: 3.30V · SPI Clock: 16.0 MHz           │
│     • Diagnostic Distance: 0428 u · Transfer Rate: 160 B/s                  │
│                                                                             │
│  3. LIVE FIRMWARE UART STREAM (Replaces generic badges)                     │
│     • [BUS] SPI CLK PULSE DISPATCHED // 3.30V                               │
│     • [DMA] PACKET #042 ROUTED -> U1 FIFO                                   │
│     • [PWR] TVS VOLTAGE CLAMP NOMINAL                                       │
│                                                                             │
│  4. LOCAL EEPROM LOGBOOK (Replaces arcade Hall of Fame #1 #2 #3)            │
│     • RUN 014: 1,420u · 98.4% SIG · 48 PKTS [VERIFIED]                      │
│     • RUN 013: 0,980u · 95.1% SIG · 32 PKTS                                 │
│     • RUN 012: 0,640u · 91.0% SIG · 18 PKTS                                 │
│                                                                             │
│  5. MINIMALIST KEYMAP REFERENCE BAR (Replaces huge arcade buttons)          │
│     [W/SPACE] PULSE JUMP · [S/↓] CLEARANCE · [D/SHIFT] DASH · [ESC] EXIT   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Phases

### Phase 1: Diagnostic Deck Redesign (`index.html` & `scroll.css`)
- **Remove Redundant Top-Right Preview**:
  - Delete `.arcade-crt-wrapper` and duplicate `#arcade-crt-canvas`. The game is rendered directly on the motherboard's 3D soldered LCD screen, which is already in high-fidelity focus in the primary viewport.
- **Reduce Visual Noise by 40%**:
  - Replace the chunky arcade buttons (`JUMP`, `SLIDE`, `DASH`, `RESTART`, `EXIT`) with a sleek, low-profile engineering keymap strip.
  - Remove arcade ability badges (`OVERCLOCK 2X`, `MAGNET FLUX`, `SHIELD ARRAY`, `TURBO CHARGE`) and replace with an integrated **Bus Diagnostic Status Strip** that monitors `TVS CLAMP (Active/Standby)`, `DMA BURST`, and `SPI MULTIPLIER`.
- **Engineering Terminology Replacement**:
  - `DISTANCE` ➔ `DIAGNOSTIC DISTANCE (u)`
  - `SCORE / ELECTRONS` ➔ `SIGNAL INTEGRITY (%) / PACKETS ROUTED`
  - `VELOCITY` ➔ `BAUD / TRANSFER RATE (B/s)`
  - `ACTIVE COMBO` ➔ `PACKET CHAIN / BURST DEPTH`
  - `HARDWARE INTEGRITY` ➔ `POWER RAIL (3.30V)`
  - `HALL OF FAME` ➔ `LOCAL EEPROM // NON-VOLATILE ARCHIVE`
  - `COPY ASCII BRAG CARD` ➔ `EXPORT EEPROM SESSION LOG`
- **Dark Engineered Aesthetic**:
  - Use KiCad / Fusion 360 inspired dark technical aesthetic (`#030d07`, subtle 1px border lines in `rgba(62, 230, 160, 0.25)`, gold ENIG accents, monospace silkscreen labels).

---

### Phase 2: Authentic LCD Optics & On-Glass Rendering (`src/three/lcd.js`)
- **Realistic LCD Physics & Optics**:
  - Add phosphor decay / optical persistence (ghosting buffer so high-speed packets leave subtle natural phosphor trails).
  - Add realistic LCD subpixel raster line structure and subtle horizontal refresh wave.
  - Implement a micro-flicker and subtle bezel shadow around the glass boundary.
  - Render subtle glass reflection glare across the LCD face quad in Three.js.
- **On-Glass Text & Diagnostic States**:
  - **Ready / Boot State**:
    - `STATUS: DIAGNOSTIC MODE`
    - `MISSION: RECONNECT DAMAGED COMMUNICATION BUS`
    - `>> PRESS [SPACE] OR [ENTER] TO INITIALIZE BUS <<`
  - **Active State (HUD Overlay on Glass)**:
    - `INTEGRITY: 96%` · `PKTS: 42` · `RAIL: 3.30V` · `OFFSET: 0348u`
  - **Diagnostic Decoupling / End State**:
    - Replace `GAME OVER` with:
      ```
      // DIAGNOSTIC FAILED //
      BUS SYNCHRONIZATION LOST AT OFFSET 0348u
      SIGNAL INTEGRITY: 94.2%  |  PACKETS: 42
      ATTEMPTING AUTOMATIC RECOVERY...
      >> PRESS [SPACE] OR [ENTER] TO RESTART DIAGNOSTICS <<
      ```

---

### Phase 3: Deep PCB Hardware Integration ("The Board Plays the Game")
- **Trace & Current Wavefront Surges**:
  - On `doJump()`: dispatch copper trace current from U1 CPU to LCD1 (`energizeTraceAtPoint(LCD_LOCAL_POS, 1.5)`), flash U1 CPU status LED, increase LCD screen brightness temporarily.
  - On `doDash()`: trigger capacitor bank flash (`energizeCapacitor('C1')`), emit localized micro-spark, discharge high-speed pulse.
  - On Packet Acquisition: pulse signal-green optical point along the nearest bus trace.
- **Sound & Telemetry Integration**:
  - Connect jump to resonant piezo click / tactile relay blip.
  - Live UART Stream:
    - `[BUS] SPI CLK PULSE DISPATCHED // 3.30V`
    - `[DMA] PACKET #042 ROUTED -> U1 FIFO`
    - `[FAULT] SPI BUS SYNCHRONIZATION LOST AT OFFSET 0348u`
    - `[EEPROM] DIAGNOSTIC SESSION ARCHIVED`
- **Board Dimming on Focus**:
  - When LCD is focused, slightly dim general ambient lights (`0.85 ➔ 0.45`) while keeping copper emissive traces, component LEDs, and LCD glow brilliantly vibrant, drawing 100% focus to the hardware display.

---

### Phase 4: Persistence, EEPROM Archive & Session Logging (`src/three/lcd-sim.js`)
- **EEPROM Logbook**:
  - Store diagnostic run history in localStorage under an authentic engineering format:
    `{ runId: 'RUN-014', timestamp: Date.now(), distance: 1420, packets: 48, integrity: 98.4, status: 'VERIFIED' }`
  - Export feature: generates formatted engineering session report (CSV or ASCII diagnostic readout) rather than an arcade brag card.

---

## Verification & Constraints
- **Zero Regressions**:
  - All existing headless smoke test assertions (`tests/smoke-tick.mjs` Phase E) will be preserved: power cycle, countdown auto-start, jump/slide/dash physics, exclusive-keys gate, and persistent high-score persistence.
  - `npm run typecheck`, `npm run smoke`, and `npm run build` must remain 100% green before every commit.
- **Workflow**:
  - Incremental commits: test, commit, and push after each logical step.
  - Total commits will remain well under the 20-commit budget.
