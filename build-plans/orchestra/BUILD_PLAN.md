# Accessible Instruments Network — Build Plan

> This document is the implementation brief for Claude Code.
> Work through phases in order. Each phase has a clear acceptance test.
> Do not begin a new phase until the current phase acceptance test passes.

---

## Vision

A low-cost, accessible music instrument system where students use printed templates +
front-facing camera as instruments. Instruments work **standalone** out of the box.
When connected to a session hub, a teacher or designated conductor gains full
orchestration control — tempo, key, mute, cue — while the hub acts as OSC bridge
to a DAW for audio generation and recording.

---

## Two Operating Modes

### Standalone Mode
Instrument runs in the browser with no server.
- Internal metronome (tap tempo or BPM input)
- Key/scale selected locally
- Audio generated on-device (Web Audio API, simple synth)
- No network required
- Useful for practice, low-resource settings, or when hub isn't available

### Ensemble Mode
Instrument connects to a session hub on the local network.
- Detects hub automatically via mDNS or manual URL entry
- BPM and key locked to conductor's broadcast (overrides local settings)
- Performance data streamed to hub as OSC over WebSocket
- Visual metronome synced to session
- Teacher/conductor can mute, cue, reset individual instruments
- On disconnect, falls back gracefully to standalone mode

Instrument UI clearly shows current mode:
```
┌─────────────────────────────────┐
│  ◉ ENSEMBLE  session: class-4b  │   ← green when connected
│  ○ STANDALONE                   │   ← grey when not connected
└─────────────────────────────────┘
```

---

## Architecture

```
[Student devices — any mode]
                                        [Teacher laptop — ensemble mode only]
Browser instruments ──────────────────▶┌────────────────────────────────────┐
  (WebSocket, OSC-formatted)            │  Node process  (localhost:3000)    │
                                        │                                    │
                                        │  WebSocket server                  │
                                        │  ├── receives student events       │
                                        │  ├── player registry               │
                                        │  └── session recorder              │
                                        │           │                        │
                                        │  OSC Bridge                        │
                                        │  ├── UDP out → DAW                 │
                                        │  └── configurable host:port        │
                                        │           │                        │
                                        │  HTTP server                       │
                                        │  └── serves teacher UI at /        │
                                        └──────────┬─────────────────────────┘
                                                   │ UDP OSC
                                                   ▼
                                              DAW (Ableton / Max / SC)
                                              Audio generation + recording
```

Teacher opens `http://localhost:3000` — the process serves its own UI.
Students open `http://{teacher-ip}:3000/instrument` on their device.

---

## Repository Structure

```
accessible-instruments/
├── CLAUDE.md
├── README.md
├── package.json               ← monorepo root (npm workspaces)
│
├── server/                    ← Teacher hub + OSC bridge (Node.js)
│   ├── src/
│   │   ├── index.js           ← starts Express + WS + OSC, serves teacher UI
│   │   ├── websocket.js       ← WS server: students + teacher UI both connect here
│   │   ├── registry.js        ← connected players, instrument state, conductor role
│   │   ├── osc-bridge.js      ← UDP OSC out (node-osc), configurable target
│   │   ├── session.js         ← JSON-lines recorder, replay emitter
│   │   ├── broadcast.js       ← fans tempo/key/commands out to all WS clients
│   │   └── api.js             ← REST endpoints for teacher UI actions
│   └── package.json
│
├── teacher-ui/                ← Control station (React + Vite, served by Express)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── ChannelStrip.jsx       ← per student: status, instrument, activity
│   │   │   ├── MasterControls.jsx     ← BPM, key, broadcast, record
│   │   │   ├── ConductorAssign.jsx    ← promote a student to conductor role
│   │   │   ├── OscConfig.jsx          ← set DAW IP:port live, test ping
│   │   │   ├── SessionControls.jsx    ← rec / stop / replay / export
│   │   │   └── InstrumentDetail.jsx   ← expanded per-student panel
│   │   ├── hooks/
│   │   │   ├── useServerSocket.js     ← WS to own server
│   │   │   └── useSession.js
│   │   └── store/
│   │       └── instruments.js         ← Zustand: all connected players + state
│   └── package.json
│
├── instrument/                ← Student browser instrument (Vite + vanilla JS)
│   ├── src/
│   │   ├── main.js            ← entry point, detects mode on load
│   │   ├── mode.js            ← standalone vs ensemble state machine
│   │   ├── camera.js          ← getUserMedia, 30fps frame loop
│   │   ├── cv/
│   │   │   ├── detector.js    ← TF.js HandPose + colour blob fallback
│   │   │   ├── mapper.js      ← CV coords → musical values
│   │   │   └── confidence.js  ← detection quality scoring
│   │   ├── audio/
│   │   │   ├── synth.js       ← Web Audio API synth (standalone mode)
│   │   │   └── metronome.js   ← internal click, syncs to conductor in ensemble
│   │   ├── osc.js             ← formats { address, args } packets
│   │   ├── transport.js       ← WS connection, reconnect, fallback to standalone
│   │   ├── conductor.js       ← receives + applies BPM/key/command from hub
│   │   ├── ui/
│   │   │   ├── setup.js       ← name, instrument select, hub URL, mode indicator
│   │   │   ├── overlay.js     ← camera preview + detection markers + note display
│   │   │   └── feedback.js    ← visual metronome, cue flash, mute overlay
│   │   └── templates/
│   │       ├── index.js       ← template registry
│   │       ├── string-5.js    ← 5-zone horizontal string template
│   │       ├── theremin.js    ← X/Y continuous pitch + volume
│   │       └── percussion.js  ← grid zones → drum hits
│   └── package.json
│
└── templates/                 ← Printable instrument templates
    ├── string-5/
    │   ├── string-5-A4.svg
    │   ├── string-5-A4.pdf
    │   └── README.md
    ├── theremin/
    └── percussion-4x4/
```

---

## Standalone Mode — Instrument Behaviour

When no hub is detected or hub URL is left blank:

- Web Audio API handles sound generation on-device
- Simple polyphonic synth, one voice per instrument type
- BPM set via tap tempo button or numeric input
- Key/scale set from dropdown
- Visual metronome runs locally
- All CV detection and mapping still runs normally
- No data leaves the device

This means the instrument works as a **self-contained accessible instrument** —
print a template, open the URL, play. The network layer is entirely additive.

---

## Ensemble Mode — Conductor Role

Any connected participant can be assigned conductor by the teacher, or the teacher
station itself acts as default conductor.

A conductor can:
- Set and broadcast BPM (overrides all instruments' local tempo)
- Set and broadcast key/scale (instruments re-map their note zones live)
- Send cue events (visual flash + optional audio click on target instruments)
- Mute / unmute individual players

Teacher retains:
- Override of conductor settings at any time
- OSC bridge configuration
- Session record / replay / export
- Ability to revoke and reassign conductor role

If conductor disconnects, instruments hold last received settings and continue
playing until a new conductor broadcasts or they are manually reset.

```
Conductor hierarchy:
  Teacher (always present if hub running)
    └── Assigned conductor (optional, any connected device)
          └── Individual instruments (follow conductor, fallback to teacher)
```

---

## OSC Address Schema

### Student → Hub → DAW

```
/instrument/{id}/register     string:name  string:type  string:template_version
/instrument/{id}/note         int:midi_note  float:velocity  float:confidence
/instrument/{id}/pitch        float:hz  float:confidence
/instrument/{id}/pressure     float:0-1
/instrument/{id}/position     float:x  float:y
/instrument/{id}/gesture      string:name  float:confidence
/instrument/{id}/heartbeat    float:fps  float:detection_rate  float:battery
/instrument/{id}/disconnect
```

### Hub → All Instruments (broadcast)

```
/session/tempo                float:bpm  int:beat_number
/session/key                  string:root  string:scale
/session/cue                  string:player_id  (or "all")
/session/command/{id}         string:command    (mute|unmute|solo|reset)
/session/conductor            string:player_id  (announces current conductor)
```

### Conductor → Hub → All (hub validates role then rebroadcasts)

```
/conductor/tempo              float:bpm
/conductor/key                string:root  string:scale
/conductor/cue                string:player_id  (or "all")
```

---

## Dual Recording

Every incoming packet is written to two destinations simultaneously:

```
Incoming event
      │
      ├──▶ session.jsonl  (full packet, timestamp, player metadata, confidence)
      │
      └──▶ osc-bridge     (filtered, mapped to MIDI note ranges) ──UDP──▶ DAW
```

**Session log** captures everything — raw CV values, confidence, instrument config,
conductor events, mode changes. This is the ground truth.

**DAW recording** captures audio. The OSC bridge drives instrument tracks in real time.

**Replay** — teacher can load any session log and re-emit it as live OSC:
- Re-render with a different DAW patch or soundscape
- Play back at reduced speed for class review
- Scrub to a specific moment

---

## Server API

```
WS   ws://localhost:3000/hub     ← students + teacher UI both connect here

GET  /players                    ← current registry snapshot
GET  /sessions                   ← list recorded sessions
GET  /session/:id                ← download full session log
GET  /session/:id/replay         ← re-emit session as live OSC (SSE progress)

POST /osc-config                 body: { host, port }
POST /broadcast/tempo            body: { bpm }
POST /broadcast/key              body: { root, scale }
POST /broadcast/cue              body: { player_id } or { all: true }
POST /command/:player_id         body: { command }
POST /conductor/assign           body: { player_id }  ("teacher" to reclaim)
POST /session/start
POST /session/stop
```

---

## Teacher Control Station UI

### Channel Strip (per student)
```
┌──────────────────────────────────────────────┐
│ ● Amara                       string-5-v2    │
│ ──────────────────────────────────────────── │
│ Scale   D pentatonic minor                   │
│ Zones   D3  F3  G3  A3  C4                  │
│ CV      ████████░░  87%   28fps              │
│ Last    String 2 / G3 / vel 0.74            │
│                                              │
│ [Mute] [Solo] [▶ Cue] [★ Conductor] [✕]    │
└──────────────────────────────────────────────┘
```

### Master Bar
```
┌──────────────────────────────────────────────────────────────┐
│  BPM  120 ±  [tap]     Key  D   Scale  Pentatonic Minor      │
│  [Broadcast]  [Cue All]  [Mute All]  [Reset All]             │
│  OSC  127.0.0.1 : 9000  [● connected]  [test]               │
│  Session  class-4b-2026-03-01  [● REC 04:22]  [stop]        │
│  Conductor  ★ Amara  [reassign]                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tech | Reason |
|---|---|---|
| Hub server | Node.js + Express + `ws` + `node-osc` | Minimal, runs on teacher laptop |
| Teacher UI | React + Vite + Zustand | Reactive multi-channel state |
| Instrument | Vanilla JS + Vite | Fast on old/cheap phones, no framework overhead |
| Standalone audio | Web Audio API | Zero dependencies, works offline |
| CV primary | TensorFlow.js HandPose | Runs in browser, no server needed |
| CV fallback | Colour blob (canvas pixel scan) | Works on 2013-era devices |
| Transport | WebSocket (JSON `{address, args}`) | Bridge to UDP OSC at server |
| Templates | SVG → PDF | Print anywhere, calibrate via camera |

---

## Key Design Constraints

- **Instruments are fully functional with no server.** Network is additive, never required.
- **Graceful fallback.** Lose connection → hold last settings → continue playing standalone.
- **Student device = browser only.** No install, no app store, camera permission only.
- **All ensemble audio on teacher machine.** Student devices have zero audio hardware requirement.
- **Works on school WiFi.** Everything on LAN, no internet dependency during session.
- **Accessibility first.** Template zones sized for broad motor control. Colour + shape redundancy for colour-blind users. Confidence threshold tunable per student.
- **Conductor empowers students.** Any player can be promoted — encourages peer leadership and musical responsibility within the ensemble.

---

## Build Phases

### Phase 1 — Hub Server
- WS server, player registry, JSON-lines session recorder
- UDP OSC bridge with configurable target
- REST API for teacher UI
- **Done when:** wscat → server → OSC arrives in Protokol

### Phase 2 — Instrument (Standalone)
- Camera, CV detection, colour blob fallback
- Web Audio synth, tap tempo, key select
- Template: theremin (no print needed — validates CV pipeline first)
- **Done when:** open browser, wave hand, hear notes

### Phase 3 — Instrument (Ensemble)
- WS transport, hub URL entry, mode indicator
- Conductor receiver: apply BPM/key/command from hub
- Graceful fallback to standalone on disconnect
- **Done when:** two browser tabs, one receives tempo change from server and visual metronome updates

### Phase 4 — Teacher UI
- Channel strips, master controls, OSC config panel
- Conductor assign / revoke
- Session record / stop / replay
- **Done when:** teacher mutes a student from UI, instrument shows mute overlay

### Phase 5 — Additional Templates
- string-5 with printed calibration markers + homography detection
- percussion-4x4
- SVG → PDF export pipeline

### Phase 6 — DAW Integration Docs
- Ableton: Max for Live patch receiving `/instrument/*/note` → MIDI tracks
- Max/MSP: `udpreceive` + `route` patch
- SuperCollider: `OSCdef` handlers + `SynthDef` per instrument type

---

## Running The Project

```bash
# Install all workspaces
npm install

# Start hub + teacher UI
cd server && npm start
# Teacher opens  → http://localhost:3000
# Students open  → http://{teacher-ip}:3000/instrument

# Instrument dev (hot reload)
cd instrument && npm run dev

# Point DAW OSC input to 127.0.0.1:9000
```

---

## Open Questions / Future Work

- mDNS auto-discovery so instruments find hub without typing an IP
- MIDI 2.0 UMP output from hub for per-note expression
- Ableton Link integration so hub BPM locks to DAW clock (and vice versa)
- Mixed instrument type sessions (string + percussion + theremin in one ensemble)
- Physical template generator: teacher defines custom zones, system prints + calibrates
- Offline-capable PWA (service worker caches TF.js model for no-internet classrooms)
- Session annotation: teacher adds timestamped text notes during live recording
- Student-facing replay: review your own performance after class
- Confidence-adaptive quantisation: loosen timing grid when detection quality drops
