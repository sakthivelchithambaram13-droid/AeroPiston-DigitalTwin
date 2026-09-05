import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const COLORS = {
  normal: 0x4cc7d3,
  warning: 0xf1b74b,
  critical: 0xff5959,
  suspect: 0xaa8cff,
  unknown: 0x66737d,
  metal: 0x60717c,
  darkMetal: 0x263640
};

const LABEL_NAMES = {
  cylinder1: "Cylinder 1",
  cylinder2: "Cylinder 2",
  cylinder3: "Cylinder 3",
  cylinder4: "Cylinder 4",
  injector3: "Injector 3",
  fuelRail: "Fuel rail",
  oilSystem: "Oil system",
  crankshaft: "Crankshaft",
  alternator: "Alternator"
};

let activeViewer = null;
let lastPayload = null;

function formatValue(value, digits, unit) {
  return `${Number(value).toFixed(digits)} ${unit}`;
}

function statusClass(level) {
  return level === "normal" ? "ok" : level === "critical" ? "critical" : level === "unknown" ? "info" : "warning";
}

class EngineHealthViewer {
  constructor(payload) {
    this.viewport = document.getElementById("engine3dViewport");
    this.stage = document.getElementById("engine3dStage");
    this.labelsLayer = document.getElementById("engine3dLabels");
    this.loading = document.getElementById("engine3dLoading");
    if (!this.viewport || !this.stage || !this.labelsLayer) return;

    this.payload = payload;
    this.selectedId = payload.selectedDefault || "cylinder1";
    this.parts = new Map();
    this.anchors = new Map();
    this.labelButtons = new Map();
    this.basePositions = new Map();
    this.exploded = false;
    this.labelsVisible = true;
    this.disposed = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d12);
    this.scene.fog = new THREE.FogExp2(0x070d12, 0.034);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(8.8, 6.3, 9.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.stage.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 6.5;
    this.controls.maxDistance = 19;
    this.controls.target.set(0, 0.35, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;

    this.engineRoot = new THREE.Group();
    this.engineRoot.rotation.y = -0.28;
    this.scene.add(this.engineRoot);
    this.addLighting();
    this.buildProceduralEngine();
    this.buildLabels();
    this.bindEvents();
    this.resize();
    this.update(payload);
    this.loadOptionalModel();
    this.loading.hidden = true;
    this.animate();
  }

  material(color = COLORS.metal, roughness = 0.42, metalness = 0.72) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xbcefff, 0x111820, 1.55));
    const key = new THREE.DirectionalLight(0xd9f7ff, 3.2);
    key.position.set(5, 9, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4cc7d3, 2.3);
    rim.position.set(-8, 2, -6);
    this.scene.add(rim);
    const warning = new THREE.PointLight(0xf1b74b, 16, 16, 2);
    warning.position.set(3, -1, 5);
    this.scene.add(warning);

    const grid = new THREE.GridHelper(22, 22, 0x24434b, 0x13242b);
    grid.position.y = -2.75;
    this.scene.add(grid);
  }

  addPart(id, object, position) {
    object.position.copy(position);
    object.userData.componentId = id;
    object.traverse(child => {
      if (child.isMesh) child.userData.componentId = id;
    });
    this.engineRoot.add(object);
    this.parts.set(id, object);
    this.basePositions.set(id, position.clone());
    return object;
  }

  makeCylinderAssembly(id, position, direction) {
    const group = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 2.25, 28), this.material(0x536872));
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);
    for (let index = -4; index <= 4; index += 1) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.055, 28), this.material(0x344750, 0.58, 0.65));
      fin.rotation.x = Math.PI / 2;
      fin.position.z = index * 0.19;
      group.add(fin);
    }
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.88, 0.48, 28), this.material(0x71828b));
    head.rotation.x = Math.PI / 2;
    head.position.z = direction * 1.25;
    group.add(head);
    group.rotation.y = direction < 0 ? Math.PI : 0;
    return this.addPart(id, group, position);
  }

  buildProceduralEngine() {
    this.proceduralRoot = new THREE.Group();
    this.engineRoot.add(this.proceduralRoot);

    const caseGroup = new THREE.Group();
    const caseMain = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.35, 2.3), this.material(0x52646e, 0.38, 0.8));
    caseMain.geometry.translate(0, 0, 0);
    caseGroup.add(caseMain);
    const topCase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 1.7), this.material(0x344853, 0.48, 0.72));
    topCase.position.y = 1.45;
    caseGroup.add(topCase);
    this.addPart("crankshaft", caseGroup, new THREE.Vector3(0, -0.2, 0));
    this.proceduralRoot.attach(caseGroup);

    const cylinderPositions = [
      ["cylinder1", -1.25, 0.55, -2.05, -1],
      ["cylinder2", 1.25, 0.55, -2.05, -1],
      ["cylinder3", -1.25, 0.55, 2.05, 1],
      ["cylinder4", 1.25, 0.55, 2.05, 1]
    ];
    cylinderPositions.forEach(([id, x, y, z, direction]) => {
      const part = this.makeCylinderAssembly(id, new THREE.Vector3(x, y, z), direction);
      this.proceduralRoot.attach(part);
    });

    const fuelRailGroup = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.1, 16), this.material(0x2f7480, 0.28, 0.8));
    rail.rotation.z = Math.PI / 2;
    fuelRailGroup.add(rail);
    for (const x of [-1.25, 1.25]) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 12), this.material(0x2f7480, 0.3, 0.75));
      branch.position.x = x;
      branch.position.z = 0.9;
      branch.rotation.x = Math.PI / 2;
      fuelRailGroup.add(branch);
    }
    this.addPart("fuelRail", fuelRailGroup, new THREE.Vector3(0, 2.05, 0));
    this.proceduralRoot.attach(fuelRailGroup);

    const injector = new THREE.Group();
    const injectorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.82, 18), this.material(0xd29c3d, 0.3, 0.76));
    injectorBody.rotation.x = -0.42;
    injector.add(injectorBody);
    const connector = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.26, 0.32), this.material(0x293740, 0.7, 0.2));
    connector.position.y = 0.47;
    injector.add(connector);
    this.addPart("injector3", injector, new THREE.Vector3(-1.25, 2.03, 1.32));
    this.proceduralRoot.attach(injector);

    const oilGroup = new THREE.Group();
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.72, 28), this.material(0x425763));
    pump.rotation.z = Math.PI / 2;
    oilGroup.add(pump);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 20), this.material(0x7f6331, 0.52, 0.5));
    filter.position.set(-0.15, -0.65, 0.25);
    oilGroup.add(filter);
    this.addPart("oilSystem", oilGroup, new THREE.Vector3(-2.55, -1.25, 0.45));
    this.proceduralRoot.attach(oilGroup);

    const alternatorGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 1.05, 28), this.material(0x65747c, 0.42, 0.75));
    body.rotation.z = Math.PI / 2;
    alternatorGroup.add(body);
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 24), this.material(0x222d33, 0.65, 0.55));
    pulley.rotation.z = Math.PI / 2;
    pulley.position.x = 0.62;
    alternatorGroup.add(pulley);
    this.addPart("alternator", alternatorGroup, new THREE.Vector3(2.75, -0.75, -0.15));
    this.proceduralRoot.attach(alternatorGroup);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.1, 24), this.material(0x25343c, 0.3, 0.9));
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(0, -0.15, 0);
    caseGroup.add(shaft);

    this.createAnchor("crankshaft", new THREE.Vector3(0, 0.15, 0));
    this.createAnchor("cylinder1", new THREE.Vector3(-1.25, 0.9, -3.35));
    this.createAnchor("cylinder2", new THREE.Vector3(1.25, 0.9, -3.35));
    this.createAnchor("cylinder3", new THREE.Vector3(-1.25, 0.9, 3.35));
    this.createAnchor("cylinder4", new THREE.Vector3(1.25, 0.9, 3.35));
    this.createAnchor("injector3", new THREE.Vector3(-1.25, 2.55, 1.45));
    this.createAnchor("fuelRail", new THREE.Vector3(0, 2.65, 0));
    this.createAnchor("oilSystem", new THREE.Vector3(-2.75, -1.55, 0.5));
    this.createAnchor("alternator", new THREE.Vector3(3.2, -0.6, -0.15));
  }

  createAnchor(id, position) {
    const anchor = new THREE.Object3D();
    anchor.position.copy(position);
    this.engineRoot.add(anchor);
    this.anchors.set(id, anchor);
  }

  buildLabels() {
    this.labelsLayer.innerHTML = "";
    Object.entries(LABEL_NAMES).forEach(([id, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "engine-hotspot normal";
      button.dataset.component = id;
      button.innerHTML = `<i></i><span>${name}</span>`;
      button.addEventListener("click", event => {
        event.stopPropagation();
        this.select(id);
      });
      this.labelsLayer.appendChild(button);
      this.labelButtons.set(id, button);
    });
  }

  bindEvents() {
    this.onCanvasClick = event => {
      if (event.target !== this.renderer.domElement) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersections = this.raycaster.intersectObjects([...this.parts.values()], true);
      const id = intersections.find(hit => hit.object.userData.componentId)?.object.userData.componentId;
      if (id) this.select(id);
    };
    this.renderer.domElement.addEventListener("click", this.onCanvasClick);
    this.renderer.domElement.addEventListener("pointerdown", () => { this.controls.autoRotate = false; }, { passive: true });

    this.onToolbarClick = event => {
      const button = event.target.closest("[data-engine-action]");
      if (!button) return;
      const action = button.dataset.engineAction;
      if (action === "reset") this.resetView();
      if (action === "explode") {
        this.exploded = !this.exploded;
        button.setAttribute("aria-pressed", String(this.exploded));
        button.textContent = this.exploded ? "Assemble engine" : "Exploded view";
      }
      if (action === "labels") {
        this.labelsVisible = !this.labelsVisible;
        button.setAttribute("aria-pressed", String(this.labelsVisible));
        button.textContent = this.labelsVisible ? "Hide labels" : "Show labels";
        this.labelsLayer.hidden = !this.labelsVisible;
      }
    };
    this.viewport.parentElement.addEventListener("click", this.onToolbarClick);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
  }

  resetView() {
    this.camera.position.set(8.8, 6.3, 9.4);
    this.controls.target.set(0, 0.35, 0);
    this.controls.autoRotate = true;
    this.controls.update();
  }

  update(payload) {
    this.payload = payload;
    if (!payload.components[this.selectedId]) this.selectedId = payload.selectedDefault || "cylinder1";
    this.parts.forEach((part, id) => this.applyCondition(part, payload.components[id]?.condition || { level: "normal" }, id === this.selectedId));
    this.labelButtons.forEach((button, id) => {
      const level = payload.components[id]?.condition.level || "normal";
      button.className = `engine-hotspot ${level}${id === this.selectedId ? " selected" : ""}`;
    });
    this.updateInspector();
    this.updateComparison();
    this.updateSync();
  }

  applyCondition(part, condition, selected) {
    const color = new THREE.Color(COLORS[condition.level] ?? COLORS.normal);
    part.traverse(child => {
      if (!child.isMesh || !child.material) return;
      child.material.color.lerp(color, condition.level === "normal" ? 0.24 : 0.82);
      if ("emissive" in child.material) {
        child.material.emissive.copy(color);
        child.material.emissiveIntensity = selected ? 0.28 : condition.level === "warning" || condition.level === "critical" ? 0.16 : 0.025;
      }
    });
  }

  select(id) {
    if (!this.payload?.components[id]) return;
    this.selectedId = id;
    this.update(this.payload);
  }

  updateInspector() {
    const component = this.payload.components[this.selectedId];
    if (!component) return;
    const title = document.getElementById("selectedComponentTitle");
    const badge = document.getElementById("componentStatusBadge");
    const summary = document.getElementById("componentDeltaSummary");
    const body = document.getElementById("componentDetailBody");
    const interpretation = document.getElementById("componentInterpretation");
    if (!title || !badge || !summary || !body || !interpretation) return;

    title.textContent = component.name;
    badge.className = `badge ${statusClass(component.condition.level)}`;
    badge.textContent = component.condition.label;
    const primary = component.metrics[0];
    const delta = primary.current - primary.previous;
    const deltaText = `${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta).toFixed(primary.digits)} ${primary.unit}`;
    summary.innerHTML = `<small>Latest change</small><strong class="${component.condition.level === "critical" ? "red" : component.condition.level === "warning" ? "amber" : "cyan"}">${deltaText}</strong><span>${formatValue(primary.current, primary.digits, primary.unit)} now · ${formatValue(primary.previous, primary.digits, primary.unit)} one second ago</span>`;
    body.innerHTML = component.metrics.map(metric => {
      const change = metric.current - metric.previous;
      return `<tr><td><strong>${metric.label}</strong>${metric.residual === null ? "" : `<small>${metric.residual >= 0 ? "+" : ""}${metric.residual.toFixed(2)} σ residual</small>`}</td><td class="mono">${formatValue(metric.current, metric.digits, metric.unit)}</td><td class="mono muted">${formatValue(metric.previous, metric.digits, metric.unit)} <span class="delta ${change > 0 ? "up" : change < 0 ? "down" : "flat"}">${change > 0 ? "↑" : change < 0 ? "↓" : "→"}</span></td><td class="mono cyan">${formatValue(metric.predicted, metric.digits, metric.unit)}</td></tr>`;
    }).join("");

    const messages = {
      normal: ["Within expected behaviour", "The current movement agrees with the mission-conditioned physics model. Direction alone is not treated as a fault."],
      warning: ["Corroborated degradation", "The change is larger than expected and is supported by related sensor and physics residuals."],
      critical: ["Critical divergence", "Measured behaviour is materially outside the expected envelope. Review the mission and maintenance advisories."],
      suspect: ["Measurement channel suspect", "This sensor disagrees with related measurements, so the twin reduces confidence instead of declaring an engine fault."],
      unknown: ["Live data unavailable", "The last measurement is frozen while the twin predicts forward with increasing uncertainty."]
    };
    const message = messages[component.condition.level] || messages.normal;
    interpretation.style.setProperty("--notice-color", component.condition.level === "critical" ? "var(--red)" : component.condition.level === "warning" ? "var(--amber)" : component.condition.level === "suspect" ? "var(--violet)" : "var(--cyan)");
    interpretation.innerHTML = `<div class="notice-icon">${component.condition.level === "normal" ? "✓" : "!"}</div><div><strong>${message[0]}</strong><p>${message[1]}</p></div>`;
  }

  updateComparison() {
    const body = document.getElementById("telemetryComparisonBody");
    const badge = document.getElementById("twinAnomalyBadge");
    if (!body || !badge) return;
    body.innerHTML = this.payload.comparisonRows.map(metric => {
      const delta = metric.current - metric.previous;
      const residualClass = metric.residual !== null && Math.abs(metric.residual) > 3 ? "amber" : "green";
      return `<tr><td><strong>${metric.label}</strong></td><td class="mono">${formatValue(metric.current, metric.digits, metric.unit)}</td><td class="mono muted">${formatValue(metric.previous, metric.digits, metric.unit)}</td><td class="mono"><span class="delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta).toFixed(metric.digits)} ${metric.unit}</span></td><td class="mono cyan">${formatValue(metric.predicted, metric.digits, metric.unit)}</td><td class="mono ${residualClass}">${metric.residual === null ? "—" : `${metric.residual >= 0 ? "+" : ""}${metric.residual.toFixed(2)} σ`}</td></tr>`;
    }).join("");
    badge.className = `badge ${this.payload.anomalyScore > 4 ? "warning" : "ok"}`;
    badge.textContent = `Anomaly ${this.payload.anomalyScore.toFixed(2)} σ`;
  }

  updateSync() {
    const score = document.getElementById("twinSync3d");
    const description = document.getElementById("twinSyncDescription");
    if (!score || !description) return;
    score.textContent = `${this.payload.twinSync.toFixed(0)}%`;
    score.style.borderColor = this.payload.twinSync > 85 ? "var(--green)" : "var(--amber)";
    description.textContent = this.payload.linkLost
      ? "Live telemetry unavailable · bounded prediction mode · confidence decreases with data age"
      : "State estimator current · model MVEM-4C v0.7 · update latency 36 ms · telemetry age 42 ms";
  }

  loadOptionalModel() {
    const url = window.AEROTWIN_MODEL_URL;
    if (!url) return;
    const loader = new GLTFLoader();
    loader.load(url, gltf => {
      if (this.disposed) return;
      const model = gltf.scene;
      model.scale.setScalar(1.25);
      this.engineRoot.add(model);
      const normalized = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      Object.keys(LABEL_NAMES).forEach(id => {
        const match = model.getObjectByProperty("name", id) || model.children.find(item => normalized(item.name).includes(normalized(id)));
        if (!match) return;
        this.parts.set(id, match);
        this.basePositions.set(id, match.position.clone());
        this.engineRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(match);
        const point = this.engineRoot.worldToLocal(box.getCenter(new THREE.Vector3()));
        const anchor = this.anchors.get(id);
        if (anchor) anchor.position.copy(point);
      });
      this.proceduralRoot.visible = false;
      this.update(this.payload);
    }, undefined, () => {
      this.loading.hidden = false;
      this.loading.innerHTML = "<strong>Custom model could not be loaded</strong><span>The built-in engineering demonstrator remains active.</span>";
      window.setTimeout(() => { if (this.loading) this.loading.hidden = true; }, 4500);
    });
  }

  resize() {
    if (!this.viewport || this.disposed) return;
    const width = Math.max(320, this.viewport.clientWidth);
    const height = Math.max(420, this.viewport.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  updateExplodedPositions() {
    this.parts.forEach((part, id) => {
      const base = this.basePositions.get(id);
      if (!base) return;
      const multiplier = this.exploded && id !== "crankshaft" ? 1.42 : 1;
      const target = base.clone().multiplyScalar(multiplier);
      part.position.lerp(target, 0.085);
    });
  }

  positionLabels() {
    if (!this.labelsVisible) return;
    const rect = this.viewport.getBoundingClientRect();
    this.anchors.forEach((anchor, id) => {
      const button = this.labelButtons.get(id);
      if (!button) return;
      const localPoint = anchor.position.clone();
      if (this.exploded && id !== "crankshaft") localPoint.multiplyScalar(1.42);
      const point = this.engineRoot.localToWorld(localPoint).project(this.camera);
      const visible = point.z > -1 && point.z < 1 && point.x > -1.18 && point.x < 1.18 && point.y > -1.18 && point.y < 1.18;
      button.hidden = !visible;
      if (!visible) return;
      button.style.left = `${(point.x * 0.5 + 0.5) * rect.width}px`;
      button.style.top = `${(-point.y * 0.5 + 0.5) * rect.height}px`;
    });
  }

  animate() {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.updateExplodedPositions();
    this.positionLabels();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.renderer?.domElement.removeEventListener("click", this.onCanvasClick);
    this.viewport?.parentElement?.removeEventListener("click", this.onToolbarClick);
    this.scene?.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.renderer?.dispose();
  }
}

function ensureViewer(payload) {
  const viewport = document.getElementById("engine3dViewport");
  if (!viewport) return;
  if (activeViewer && activeViewer.viewport !== viewport) {
    activeViewer.dispose();
    activeViewer = null;
  }
  if (!activeViewer) activeViewer = new EngineHealthViewer(payload);
  else activeViewer.update(payload);
}

window.addEventListener("aerotwin:telemetry", event => {
  lastPayload = event.detail;
  ensureViewer(lastPayload);
});

window.addEventListener("aerotwin:viewchange", event => {
  if (event.detail.view === "twin") {
    if (lastPayload) ensureViewer(lastPayload);
    return;
  }
  if (activeViewer) {
    activeViewer.dispose();
    activeViewer = null;
  }
});
