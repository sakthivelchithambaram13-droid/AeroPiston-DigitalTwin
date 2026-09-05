# AeroTwin GCS — Interactive 360° Engine Health Twin

This project is a browser-based SIH prototype for monitoring a representative four-cylinder aero-piston engine. It combines a 360° component view with simulated telemetry, previous-versus-current changes, physics-twin predictions, normalized residuals, fault injection, RUL and mission decision support.

## Recommended tools

- **Blender:** prepare or simplify the engine, separate clickable components and export one `.glb` file.
- **Three.js:** render the GLB in the browser, rotate/zoom it, detect component clicks and recolour parts from live health data.
- **HTML, CSS and JavaScript:** build the operator dashboard and data logic.
- **VS Code:** edit and run the project.
- **Node-RED or a small Python/Node service later:** decode CAN/SocketCAN data and send JSON telemetry to the browser through WebSocket.

The included version needs no engine asset: `engine3d.js` creates a lightweight four-cylinder demonstrator. Replace that model when your Blender asset is ready.

## Run locally

ES modules must be served over HTTP; do not open `index.html` by double-clicking it.

From the project folder, run:

```bash
python -m http.server 8000 -d dist
```

Then open `http://localhost:8000`.

The quick-start version loads a pinned Three.js build from a CDN. For the SIH venue, bundle Three.js locally during your final build so the prototype does not depend on internet access.

## Add your Blender engine model

1. Import or model the aero-piston engine in Blender.
2. Reduce unnecessary polygon detail so it runs smoothly on an ordinary laptop.
3. Keep important parts as separate objects.
4. Use these object names so the dashboard can connect telemetry automatically:

   - `cylinder1`
   - `cylinder2`
   - `cylinder3`
   - `cylinder4`
   - `injector3`
   - `fuelRail`
   - `oilSystem`
   - `crankshaft`
   - `alternator`

5. Export as glTF 2.0 Binary (`.glb`).
6. Save it as `dist/models/aero-piston-engine.glb`.
7. In `dist/index.html`, change:

```js
window.AEROTWIN_MODEL_URL = "";
```

to:

```js
window.AEROTWIN_MODEL_URL = "./models/aero-piston-engine.glb";
```

If a component is not named correctly, the model still loads but that part cannot be selected or recoloured independently.

## Important files

- `dist/index.html` — application entry point and 3D model configuration.
- `dist/styles.css` — complete dashboard and 3D-view styling.
- `dist/app.js` — simulator, digital-twin values, fault logic, navigation and telemetry payload.
- `dist/engine3d.js` — Three.js scene, 360° controls, clickable parts, health colours and comparison inspector.

## Connecting real telemetry later

Keep the browser interface unchanged and replace `computeTelemetry()` in `app.js` with values received from your acquisition service. A practical pipeline is:

```text
Engine ECU / sensors → CAN or SocketCAN → edge decoder → WebSocket JSON → dashboard → digital-twin comparison
```

Do not send raw safety-critical control commands from this prototype to the ECU. Treat the dashboard as read-only decision support.

## Meaning of the three comparisons

- **Current versus previous:** shows direction and rate of change.
- **Current versus twin prediction:** shows whether the change is expected for the present altitude, throttle, ambient temperature and mission phase.
- **Normalized residual:** expresses the difference relative to expected model error, allowing unlike parameters to be assessed without adding incompatible units.

An increase is not automatically bad. The dashboard colours a component only when the change is abnormal for the operating context or corroborated by related evidence.

## Prototype limitation

The included telemetry, physics response and fault data are simulated. This is an SIH software demonstrator, not a flight-certified engine model or airworthiness system.
