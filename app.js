const navItems = [
  { id: "cockpit", label: "Cockpit" },
  { id: "twin", label: "Digital Twin" },
  { id: "analytics", label: "AI & RUL" },
  { id: "mission", label: "Mission Planner" },
  { id: "advisory", label: "Advisories" },
  { id: "can", label: "CAN Monitor" },
  { id: "validation", label: "Validation & Security" },
  { id: "replay", label: "Replay & Report" }
];

const scenarios = {
  nominal: {
    name: "Nominal endurance mission",
    note: "Representative cruise at 8,000 ft under standard-day conditions.",
    altitude: 8000,
    ambient: 12,
    throttle: 72,
    phase: 2
  },
  altitude: {
    name: "High-altitude loiter",
    note: "Sustained 16,000 ft loiter with reduced air density.",
    altitude: 16000,
    ambient: -12,
    throttle: 83,
    phase: 3
  },
  hot: {
    name: "Hot-weather climb",
    note: "High thermal load during climb at 43 °C ambient.",
    altitude: 3500,
    ambient: 43,
    throttle: 91,
    phase: 1
  },
  endurance: {
    name: "Extended ISR endurance",
    note: "Six-hour cruise and loiter profile with accumulated thermal exposure.",
    altitude: 11000,
    ambient: 4,
    throttle: 68,
    phase: 3
  },
  transient: {
    name: "Rapid throttle transition",
    note: "Repeated 45–92% throttle transients for response validation.",
    altitude: 7000,
    ambient: 15,
    throttle: 92,
    phase: 1
  }
};

const faultDefs = {
  injector: {
    name: "Injector 3 degradation",
    short: "Injector degradation",
    component: "Cylinder 3 fuel injector",
    cause: "Fuel-delivery imbalance",
    consequence: "Rising EGT spread, reduced combustion efficiency and accelerated thermal wear.",
    differential: "EGT sensor drift",
    action: "Reduce continuous high-power operation; inspect Injector 3 flow and spray pattern after landing.",
    inspection: [
      ["Verify cylinder balance", "Compare per-cylinder EGT/CHT at identical RPM and manifold pressure."],
      ["Inspect Injector 3", "Check connector, pulse width, fuel rail pressure and calibrated flow."],
      ["Review borescope evidence", "Inspect plug condition and combustion deposits before release to service."]
    ],
    downtime: "45–70 min",
    spares: "Injector seal kit",
    rulComponent: "Injector 3"
  },
  lubrication: {
    name: "Lubrication-system degradation",
    short: "Lubrication degradation",
    component: "Oil pump / lubrication circuit",
    cause: "Pressure loss under sustained load",
    consequence: "Bearing-film margin is decreasing as oil pressure falls and temperature rises.",
    differential: "Oil-pressure sensor drift",
    action: "Limit engine load and return to base; inspect oil quantity, filter restriction and pump performance.",
    inspection: [
      ["Confirm oil quantity", "Cross-check oil quantity and evidence of leakage or aeration."],
      ["Inspect pressure circuit", "Test pressure sensor, filter differential and relief valve operation."],
      ["Perform debris inspection", "Inspect filter media and oil sample before the next flight."]
    ],
    downtime: "70–120 min",
    spares: "Filter and oil sample kit",
    rulComponent: "Lubrication circuit"
  },
  sensor: {
    name: "CHT-2 sensor drift",
    short: "Sensor drift",
    component: "Cylinder 2 CHT channel",
    cause: "Measurement bias without corroborating engine evidence",
    consequence: "Incorrect temperature indication can create false maintenance or mask genuine overheating.",
    differential: "Cylinder 2 cooling fault",
    action: "Use model-estimated CHT with reduced confidence; inspect sensor attachment, harness and calibration.",
    inspection: [
      ["Cross-check redundant evidence", "Compare CHT-2 with EGT-2, adjacent cylinders and thermal-model estimate."],
      ["Inspect sensor installation", "Check thermocouple seating, connector resistance and harness continuity."],
      ["Recalibrate channel", "Perform controlled-temperature calibration and record offset."]
    ],
    downtime: "30–45 min",
    spares: "CHT probe / connector",
    rulComponent: "CHT-2 sensor"
  },
  misfire: {
    name: "Intermittent Cylinder 3 misfire",
    short: "Combustion misfire",
    component: "Cylinder 3 combustion path",
    cause: "Irregular combustion events",
    consequence: "Torque fluctuation, vibration growth and loss of thermal balance.",
    differential: "Ignition-harness fault",
    action: "Avoid rapid throttle changes; prepare return-to-base plan and inspect ignition and fuel delivery.",
    inspection: [
      ["Review event waveform", "Correlate RPM fluctuation, vibration impulses and EGT-3 collapse."],
      ["Inspect ignition system", "Check plug, lead, coil and timing for Cylinder 3."],
      ["Verify fuel delivery", "Rule out intermittent injector command or pressure loss."]
    ],
    downtime: "60–90 min",
    spares: "Spark plug and lead",
    rulComponent: "Cylinder 3 combustion"
  },
  cooling: {
    name: "Cooling-path degradation",
    short: "Cooling degradation",
    component: "Cylinder cooling path",
    cause: "Reduced heat rejection",
    consequence: "Multi-cylinder CHT trend is rising after load and ambient correction.",
    differential: "Lean mixture condition",
    action: "Reduce thermal load, descend if operationally acceptable and inspect airflow path after landing.",
    inspection: [
      ["Inspect cooling path", "Check inlet, baffles and fin passages for obstruction or damage."],
      ["Verify mixture evidence", "Compare fuel-flow and EGT residuals to rule out a lean condition."],
      ["Pressure-test installation", "Inspect duct sealing and differential pressure across the engine."]
    ],
    downtime: "50–80 min",
    spares: "Baffle seal kit",
    rulComponent: "Cooling system"
  }
};

const state = {
  view: "cockpit",
  scenario: "nominal",
  altitude: scenarios.nominal.altitude,
  ambient: scenarios.nominal.ambient,
  throttle: scenarios.nominal.throttle,
  phase: scenarios.nominal.phase,
  stagedFault: "injector",
  fault: null,
  severity: 0,
  stagedSeverity: 38,
  tick: 0,
  paused: false,
  linkLost: false,
  linkLossTicks: 0,
  lastLive: null,
  selectedPlan: null,
  acknowledged: false,
  checks: new Set(),
  replayPosition: 100,
  histories: { cht: [], oil: [], zCht: [], zOil: [], reliability: [] },
  events: [
    { time: clock(), type: "info", title: "Mission simulation initialized", detail: "Representative four-cylinder engine model synchronized with virtual CAN telemetry." },
    { time: clock(-3), type: "ok", title: "Secure link checks passed", detail: "Prototype authentication, sequence and freshness checks are active." }
  ]
};

let latest = null;
let previousLatest = null;

function clock(offsetSeconds = 0) {
  const value = new Date(Date.now() + offsetSeconds * 1000);
  return value.toISOString().slice(11, 19) + "Z";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function noise(scale, shift = 0) {
  return Math.sin((state.tick + shift) * 0.73) * scale + Math.sin((state.tick + shift) * 0.19) * scale * 0.35;
}

function pushHistory(name, value) {
  state.histories[name].push(Number(value));
  if (state.histories[name].length > 42) state.histories[name].shift();
}

function computeTelemetry(record = false) {
  const sev = state.fault ? state.severity / 100 : 0;
  const altitudeFactor = state.altitude / 10000;
  const tempFactor = (state.ambient - 15) / 25;
  const transient = state.scenario === "transient" ? Math.sin(state.tick * 1.35) * 190 : 0;
  const baseRpm = 2200 + state.throttle * 7.1 - altitudeFactor * 28 + transient;
  const rpmTwin = baseRpm;
  const chtBase = 148 + state.throttle * 0.42 + tempFactor * 12 + altitudeFactor * 2.8;
  const egtBase = 560 + state.throttle * 1.82 - altitudeFactor * 7 + (state.scenario === "transient" ? Math.abs(Math.sin(state.tick * 1.35)) * 18 : 0);
  const oilPressureTwin = 48 + (baseRpm - 2200) * 0.012 - Math.max(0, tempFactor) * 2.5;
  const oilTempTwin = 72 + state.throttle * 0.29 + Math.max(0, tempFactor) * 9 + (state.scenario === "endurance" ? 4 : 0);
  const fuelFlowTwin = 8.8 + state.throttle * 0.16 + altitudeFactor * 0.25;
  const manifoldTwin = clamp(29.2 - altitudeFactor * 3.1 + state.throttle * 0.025, 18, 30.2);
  const vibrationTwin = 0.29 + state.throttle * 0.0017 + (state.scenario === "transient" ? 0.05 : 0);
  const cylinders = [0, 1.7, -1.2, 0.8];
  const egtOffsets = [0, 8, -6, 4];

  const twin = {
    rpm: rpmTwin,
    cht: cylinders.map(offset => chtBase + offset),
    egt: egtOffsets.map(offset => egtBase + offset),
    oilPressure: oilPressureTwin,
    oilTemp: oilTempTwin,
    fuelFlow: fuelFlowTwin,
    manifold: manifoldTwin,
    vibration: vibrationTwin,
    busVoltage: 28.3,
    alternatorCurrent: 31 + state.throttle * 0.12,
    injectionTiming: 22 + state.throttle * 0.045
  };

  const actual = {
    rpm: twin.rpm + noise(10, 1),
    cht: twin.cht.map((value, index) => value + noise(1.1, index * 2)),
    egt: twin.egt.map((value, index) => value + noise(3.5, index * 3)),
    oilPressure: twin.oilPressure + noise(0.45, 2),
    oilTemp: twin.oilTemp + noise(0.65, 5),
    fuelFlow: twin.fuelFlow + noise(0.14, 4),
    manifold: twin.manifold + noise(0.12, 7),
    vibration: twin.vibration + Math.abs(noise(0.018, 2)),
    busVoltage: twin.busVoltage + noise(0.08, 1),
    alternatorCurrent: twin.alternatorCurrent + noise(0.6, 3),
    injectionTiming: twin.injectionTiming + noise(0.16, 9)
  };

  if (state.fault === "injector") {
    actual.egt[2] += 92 * sev;
    actual.cht[2] += 32 * sev;
    actual.fuelFlow += 1.5 * sev;
    actual.vibration += 0.24 * sev;
    actual.rpm -= 28 * sev;
  }
  if (state.fault === "lubrication") {
    actual.oilPressure -= 27 * sev;
    actual.oilTemp += 42 * sev;
    actual.vibration += 0.32 * sev;
    actual.cht = actual.cht.map(value => value + 10 * sev);
  }
  if (state.fault === "sensor") {
    actual.cht[1] += 46 * sev;
  }
  if (state.fault === "misfire") {
    const impulse = Math.abs(Math.sin(state.tick * 2.8));
    actual.egt[2] -= 145 * sev * impulse;
    actual.rpm -= 95 * sev * impulse;
    actual.vibration += 0.62 * sev * impulse;
    actual.fuelFlow += 0.7 * sev;
  }
  if (state.fault === "cooling") {
    actual.cht = actual.cht.map((value, index) => value + (35 + index * 2) * sev);
    actual.oilTemp += 18 * sev;
  }

  if (state.linkLost && state.lastLive) {
    Object.assign(actual, JSON.parse(JSON.stringify(state.lastLive)));
  } else {
    state.lastLive = JSON.parse(JSON.stringify(actual));
  }

  const residuals = {
    rpm: (actual.rpm - twin.rpm) / 25,
    cht1: (actual.cht[0] - twin.cht[0]) / 3,
    cht2: (actual.cht[1] - twin.cht[1]) / 3,
    cht3: (actual.cht[2] - twin.cht[2]) / 3,
    cht4: (actual.cht[3] - twin.cht[3]) / 3,
    egt3: (actual.egt[2] - twin.egt[2]) / 8,
    oilPressure: (actual.oilPressure - twin.oilPressure) / 1.8,
    oilTemp: (actual.oilTemp - twin.oilTemp) / 2.5,
    fuelFlow: (actual.fuelFlow - twin.fuelFlow) / 0.45,
    vibration: (actual.vibration - twin.vibration) / 0.06
  };

  const residualVector = Object.values(residuals);
  const anomalyScore = Math.sqrt(residualVector.reduce((sum, value) => sum + value * value, 0) / residualVector.length);
  const faultPenalty = state.fault ? state.severity * ({
    injector: 0.52,
    lubrication: 0.72,
    sensor: 0.18,
    misfire: 0.67,
    cooling: 0.57
  }[state.fault]) : 0;
  const scenarioPenalty = state.scenario === "hot" ? 7 : state.scenario === "altitude" ? 5 : state.scenario === "transient" ? 4 : state.scenario === "endurance" ? 3 : 0;
  const reliability = clamp(97 - scenarioPenalty - faultPenalty, 12, 99);
  const twinSync = clamp(99 - anomalyScore * 2.6 - (state.linkLost ? state.linkLossTicks * 2.8 : 0), 35, 99);

  if (record) {
    pushHistory("cht", mean(actual.cht));
    pushHistory("oil", actual.oilTemp);
    pushHistory("zCht", residuals.cht3);
    pushHistory("zOil", residuals.oilPressure);
    pushHistory("reliability", reliability);
  }

  return { actual, twin, residuals, anomalyScore, reliability, twinSync };
}

function diagnosis() {
  if (!state.fault || state.severity < 5) {
    return {
      primary: "Normal operation",
      confidence: clamp(98 - (latest ? latest.anomalyScore * 1.5 : 0), 91, 98),
      component: "No active fault",
      firstSeen: "—",
      severity: "Nominal",
      color: "var(--green)",
      badge: "ok",
      differential: "No credible alternative fault",
      evidence: [
        ["Physics residuals", 10, "All normalized residuals remain within the expected envelope."],
        ["Cylinder balance", 8, "CHT and EGT spread are stable after load correction."],
        ["Vibration residual", 6, "No abnormal impulse or band-energy increase detected."],
        ["Data quality", 98, "Fresh, continuous and sequence-valid telemetry."]
      ],
      alternatives: [
        ["Normal operation", 96.8],
        ["Unknown anomaly", 1.4],
        ["Sensor drift", 0.9]
      ]
    };
  }

  const def = faultDefs[state.fault];
  const confidence = clamp(51 + state.severity * 0.61, 54, 96.5);
  const maps = {
    injector: [
      ["EGT-3 residual", clamp(Math.abs(latest.residuals.egt3) * 9, 5, 100), "Cylinder 3 EGT exceeds the load-corrected twin estimate."],
      ["CHT-3 residual", clamp(Math.abs(latest.residuals.cht3) * 9, 4, 100), "Cylinder 3 thermal residual rises with injector severity."],
      ["Fuel-flow residual", clamp(Math.abs(latest.residuals.fuelFlow) * 18, 3, 100), "Fuel demand has diverged from predicted mission load."],
      ["Vibration corroboration", clamp(Math.abs(latest.residuals.vibration) * 12, 2, 100), "Mechanical response supports a combustion imbalance."]
    ],
    lubrication: [
      ["Oil-pressure residual", clamp(Math.abs(latest.residuals.oilPressure) * 9, 5, 100), "Pressure is lower than the RPM and temperature-corrected prediction."],
      ["Oil-temperature residual", clamp(Math.abs(latest.residuals.oilTemp) * 10, 4, 100), "Thermal rise corroborates a lubrication-path issue."],
      ["Vibration residual", clamp(Math.abs(latest.residuals.vibration) * 10, 3, 100), "Vibration increases as film margin decreases."],
      ["Cylinder thermal trend", clamp(state.severity * 0.56, 2, 100), "A smaller multi-cylinder thermal rise is present."]
    ],
    sensor: [
      ["CHT-2 residual", clamp(Math.abs(latest.residuals.cht2) * 7, 5, 100), "CHT-2 diverges from the physics estimate."],
      ["No EGT corroboration", 82, "EGT-2 remains consistent with engine load."],
      ["Adjacent cylinders agree", 79, "CHT-1, CHT-3 and CHT-4 remain balanced."],
      ["Signal drift signature", clamp(state.severity * 0.9, 5, 100), "Bias grows smoothly without corresponding subsystem evidence."]
    ],
    misfire: [
      ["Vibration impulses", clamp(Math.abs(latest.residuals.vibration) * 8, 5, 100), "Transient impulse energy exceeds the operating-regime baseline."],
      ["RPM fluctuation", clamp(Math.abs(latest.residuals.rpm) * 10, 5, 100), "Crankshaft speed variation is combustion-synchronous."],
      ["EGT-3 collapse", clamp(Math.abs(latest.residuals.egt3) * 7, 5, 100), "Intermittent low EGT aligns with missed combustion events."],
      ["Cylinder localization", 86, "Evidence converges on Cylinder 3."]
    ],
    cooling: [
      ["Multi-cylinder CHT residual", clamp(state.severity * 1.05, 5, 100), "All cylinders rise after ambient and load correction."],
      ["Oil-temperature trend", clamp(Math.abs(latest.residuals.oilTemp) * 10, 4, 100), "Oil temperature supports reduced heat rejection."],
      ["Fuel-flow consistency", 78, "Fuel-flow behaviour does not support a global lean-mixture cause."],
      ["Thermal persistence", clamp(state.severity * 0.88, 4, 100), "Residual persists beyond transient thermal lag."]
    ]
  };
  const alternatives = {
    injector: [[def.name, confidence], ["EGT sensor drift", clamp(27 - state.severity * 0.2, 3, 22)], ["Combustion instability", 7.1]],
    lubrication: [[def.name, confidence], ["Oil-pressure sensor drift", clamp(25 - state.severity * 0.16, 4, 20)], ["Bearing wear", 8.2]],
    sensor: [[def.name, confidence], ["Cylinder 2 cooling fault", clamp(24 - state.severity * 0.14, 4, 19)], ["Unknown anomaly", 6.5]],
    misfire: [[def.name, confidence], ["Ignition-harness fault", clamp(28 - state.severity * 0.17, 4, 22)], ["Injector interruption", 8.4]],
    cooling: [[def.name, confidence], ["Lean mixture", clamp(27 - state.severity * 0.15, 4, 21)], ["CHT calibration error", 7.7]]
  };
  const severity = state.severity >= 65 ? "Critical" : state.severity >= 25 ? "Warning" : "Advisory";
  const badge = state.severity >= 65 ? "critical" : "warning";
  return {
    primary: def.name,
    confidence,
    component: def.component,
    firstSeen: state.events.find(event => event.type === "fault")?.time || clock(),
    severity,
    color: state.severity >= 65 ? "var(--red)" : "var(--amber)",
    badge,
    differential: def.differential,
    evidence: maps[state.fault],
    alternatives: alternatives[state.fault]
  };
}

function activeAlertCount() {
  if (!state.fault || state.severity < 5) return 0;
  return latest && latest.reliability < 70 ? 2 : 1;
}

function addEvent(type, title, detail) {
  state.events.unshift({ time: clock(), type, title, detail });
  if (state.events.length > 12) state.events.pop();
}

function eventColor(type) {
  return type === "critical" ? "var(--red)" : type === "fault" || type === "warning" ? "var(--amber)" : type === "ok" ? "var(--green)" : "var(--cyan)";
}

function viewHeading(title, description, actions = "") {
  return `<div class="view-heading">
    <div><h1>${title}</h1><p>${description}</p></div>
    ${actions ? `<div class="heading-actions">${actions}</div>` : ""}
  </div>`;
}

function badge(text, type = "info") {
  return `<span class="badge ${type}">${text}</span>`;
}

function metric(label, value, unit, meta, meter, color = "var(--cyan)") {
  return `<article class="metric" style="--metric-color:${color};--meter:${clamp(meter, 0, 100)}%">
    <div class="label"><span>${label}</span><span class="quality ${state.linkLost ? "predicted" : ""}">${state.linkLost ? "last-known" : "valid"}</span></div>
    <div class="value">${value}<small>${unit}</small></div>
    <div class="meta">${meta}</div>
    <div class="meter" aria-hidden="true"><span></span></div>
  </article>`;
}

function lineChart(series, options = {}) {
  const width = 700;
  const height = 260;
  const pad = { left: 52, right: 20, top: 16, bottom: 36 };
  const all = series.flatMap(item => item.values);
  let min = options.min ?? Math.min(...all);
  let max = options.max ?? Math.max(...all);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max - min < 0.01) max = min + 1;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index, count) => pad.left + (index / Math.max(1, count - 1)) * plotWidth;
  const y = value => pad.top + (1 - (value - min) / (max - min)) * plotHeight;
  let grid = "";
  for (let i = 0; i < 5; i += 1) {
    const yy = pad.top + (i / 4) * plotHeight;
    const value = max - (i / 4) * (max - min);
    grid += `<line class="chart-grid" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"></line>`;
    grid += `<text class="chart-axis" x="${pad.left - 9}" y="${yy + 4}" text-anchor="end">${round(value, options.digits ?? 0)}</text>`;
  }
  const paths = series.map((item, seriesIndex) => {
    const points = item.values.map((value, index) => `${x(index, item.values.length)},${y(value)}`).join(" ");
    return `<polyline class="${item.className || `chart-line-${String.fromCharCode(97 + seriesIndex)}`}" points="${points}"></polyline>`;
  }).join("");
  const legend = series.map(item => `<span style="color:${item.color}"><i></i>${item.label}</span>`).join("");
  return `<div class="legend">${legend}</div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.label || "Live trend chart"}">
        ${grid}
        <line class="chart-grid" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
        ${paths}
        <text class="chart-axis" x="${pad.left}" y="${height - 10}">−42 s</text>
        <text class="chart-axis" x="${width - pad.right}" y="${height - 10}" text-anchor="end">now</text>
        <text class="chart-axis" x="${pad.left}" y="12">${options.unit || ""}</text>
      </svg>
    </div>`;
}

function renderHeader() {
  const d = diagnosis();
  const engine = document.getElementById("headerEngineState");
  engine.className = `status-pill ${d.badge}`;
  engine.textContent = d.severity === "Nominal" ? "ENGINE NOMINAL" : `ENGINE ${d.severity.toUpperCase()}`;
  const strip = document.querySelector(".system-strip");
  strip.innerHTML = `
    <span class="status-pill simulated">SIMULATION MODE</span>
    <span class="status-pill ${state.linkLost ? "warning" : "ok"}">${state.linkLost ? `LINK LOST ${state.linkLossTicks}s` : "LINK AUTHENTICATED"}</span>
    <span class="status-pill ${latest.twinSync > 85 ? "ok" : "warning"}">TWIN SYNC ${round(latest.twinSync, 0)}%</span>
    <span id="headerEngineState" class="status-pill ${d.badge}">${d.severity === "Nominal" ? "ENGINE NOMINAL" : `ENGINE ${d.severity.toUpperCase()}`}</span>`;
}

function renderNav() {
  const count = activeAlertCount();
  document.getElementById("primaryNav").innerHTML = navItems.map(item => {
    const counter = item.id === "advisory" && count ? `<span class="nav-count">${count}</span>` : "";
    return `<button type="button" data-view="${item.id}" class="${state.view === item.id ? "active" : ""}" aria-current="${state.view === item.id ? "page" : "false"}">${item.label}${counter}</button>`;
  }).join("");
}

function renderEvents(limit = 5) {
  return `<div class="event-list">${state.events.slice(0, limit).map(event => `
    <div class="event">
      <time>${event.time}</time>
      <span class="event-dot" style="--event-color:${eventColor(event.type)}"></span>
      <div><strong>${event.title}</strong><p>${event.detail}</p></div>
    </div>`).join("")}</div>`;
}

function renderCockpit() {
  const a = latest.actual;
  const d = diagnosis();
  const avgCht = mean(a.cht);
  const avgEgt = mean(a.egt);
  const command = `<button class="btn" data-view="mission">Open mission planner</button>
    <button class="btn ${state.paused ? "primary" : "ghost"}" data-action="toggle-pause">${state.paused ? "Resume telemetry" : "Pause telemetry"}</button>`;
  return `<section class="view">
    ${viewHeading("Propulsion cockpit", "Live, mission-contextual engine health for the UAV operator. Values are generated by the representative engine simulator and are clearly marked as simulated.", command)}
    <div class="command-bar">
      <div class="mission-name"><strong>${scenarios[state.scenario].name}</strong><small>Phase: ${["Pre-flight", "Climb", "Cruise", "Loiter", "Return", "Landing"][state.phase]} · Mission elapsed 02:${String(18 + Math.floor(state.tick / 60)).padStart(2, "0")}:${String(state.tick % 60).padStart(2, "0")}</small></div>
      ${badge(state.linkLost ? `Last live ${state.linkLossTicks}s ago` : `Data age 42 ms`, state.linkLost ? "warning" : "ok")} ${badge(`${round(latest.reliability, 0)}% mission completion`, latest.reliability > 84 ? "ok" : latest.reliability > 60 ? "warning" : "critical")}
    </div>
    <div class="metric-grid">
      ${metric("Engine speed", round(a.rpm, 0), "RPM", `Rated limit 2,900 RPM`, a.rpm / 29, "var(--cyan)")}
      ${metric("Average CHT", round(avgCht, 1), "°C", `Max cylinder ${round(Math.max(...a.cht), 1)} °C`, avgCht / 2.25, avgCht > 210 ? "var(--red)" : avgCht > 195 ? "var(--amber)" : "var(--green)")}
      ${metric("Average EGT", round(avgEgt, 0), "°C", `Cylinder spread ${round(Math.max(...a.egt) - Math.min(...a.egt), 0)} °C`, avgEgt / 8.5, "var(--amber)")}
      ${metric("Oil pressure", round(a.oilPressure, 1), "psi", `Expected ${round(latest.twin.oilPressure, 1)} psi`, a.oilPressure / 0.7, a.oilPressure < 35 ? "var(--red)" : a.oilPressure < 43 ? "var(--amber)" : "var(--green)")}
      ${metric("Oil temperature", round(a.oilTemp, 1), "°C", `Advisory above 115 °C`, a.oilTemp / 1.3, a.oilTemp > 120 ? "var(--red)" : a.oilTemp > 110 ? "var(--amber)" : "var(--cyan)")}
      ${metric("Fuel flow", round(a.fuelFlow, 1), "L/h", `BSFC ${round(238 + state.throttle * .18, 0)} g/kWh`, a.fuelFlow / .3, "var(--amber)")}
      ${metric("Manifold pressure", round(a.manifold, 1), "inHg", `Altitude ${state.altitude.toLocaleString()} ft`, a.manifold / .3, "var(--blue)")}
      ${metric("Vibration RMS", round(a.vibration, 3), "g", `Twin residual ${round(latest.residuals.vibration, 2)} σ`, a.vibration * 80, a.vibration > .75 ? "var(--red)" : a.vibration > .55 ? "var(--amber)" : "var(--green)")}
      ${metric("Alternator output", round(a.busVoltage, 1), "V", `${round(a.alternatorCurrent, 1)} A · regulated`, a.busVoltage / .32, "var(--violet)")}
      ${metric("Injection timing", round(a.injectionTiming, 1), "° BTDC", `Commanded ${round(latest.twin.injectionTiming, 1)}°`, a.injectionTiming * 3.3, "var(--cyan)")}
    </div>
    <div class="grid main-side">
      <article class="panel">
        <div class="panel-header"><div><h2>Thermal trend</h2><p>Load-corrected temperatures with readable units and time scale.</p></div>${badge("10 Hz source / 1 Hz display", "info")}</div>
        <div class="panel-body">${lineChart([
          { label: "Average CHT", color: "var(--cyan)", values: state.histories.cht, className: "chart-line-a" },
          { label: "Oil temperature", color: "var(--amber)", values: state.histories.oil, className: "chart-line-b" }
        ], { min: 75, max: 225, unit: "°C", label: "Average cylinder head and oil temperature trend" })}</div>
      </article>
      <aside class="panel">
        <div class="panel-header"><div><h2>Mission reliability envelope</h2><p>Forecast for the remaining mission, not a generic health percentage.</p></div></div>
        <div class="panel-body">
          <div class="risk-card">
            <div class="risk-label">Current plan completion probability</div>
            <div class="risk-value ${latest.reliability > 84 ? "green" : latest.reliability > 60 ? "amber" : "red"}">${round(latest.reliability, 0)}%</div>
            <p>Estimated from current degradation, ${state.altitude.toLocaleString()} ft altitude, ${state.ambient} °C ambient and ${state.throttle}% throttle demand.</p>
          </div>
          <div class="divider"></div>
          <div class="model-card">
            <div class="model-row"><span>Engine condition</span><strong>${d.severity}</strong></div>
            <div class="model-row"><span>Primary diagnosis</span><strong>${d.primary}</strong></div>
            <div class="model-row"><span>Safe margin</span><strong>${state.fault ? `${round(5.8 - state.severity * .052, 1)} h` : "Mission + 2.6 h"}</strong></div>
            <div class="model-row"><span>Active alerts</span><strong>${activeAlertCount()}</strong></div>
          </div>
          <button class="btn primary" style="width:100%;margin-top:14px" data-view="mission">Compare contingency plans</button>
        </div>
      </aside>
    </div>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Operational event stream</h2><p>Every fault, recommendation and acknowledgement is timestamped for replay.</p></div>${badge(`${state.events.length} logged`, "info")}</div>
      <div class="panel-body">${renderEvents(5)}</div>
    </article>
    <p class="footer-note">Prototype note: This interface uses a configurable representative four-cylinder spark-ignition aero-piston model. It is not calibrated to a classified or flight-certified engine.</p>
  </section>`;
}

function cylinderClass(index) {
  const temp = latest.actual.cht[index];
  if (state.fault === "sensor" && index === 1) return "sensor";
  if (temp >= 220) return "critical";
  if (temp >= 195 || ((state.fault === "injector" || state.fault === "misfire") && index === 2 && state.severity > 20)) return "hot";
  return "";
}

function componentCondition(id) {
  const warning = state.severity >= 65 ? "critical" : "warning";
  if (state.linkLost) return { level: "unknown", label: "Data unavailable" };
  if (state.fault === "injector" && ["injector3", "cylinder3", "fuelRail"].includes(id)) return { level: warning, label: state.severity >= 65 ? "Critical" : "Degrading" };
  if (state.fault === "misfire" && ["cylinder3", "crankshaft"].includes(id)) return { level: warning, label: state.severity >= 65 ? "Critical" : "Unstable" };
  if (state.fault === "lubrication" && ["oilSystem", "crankshaft"].includes(id)) return { level: warning, label: state.severity >= 65 ? "Critical" : "Degrading" };
  if (state.fault === "cooling" && id.startsWith("cylinder")) return { level: warning, label: state.severity >= 65 ? "Critical" : "Overheating" };
  if (state.fault === "sensor" && id === "cylinder2") return { level: "suspect", label: "Sensor suspect" };
  return { level: "normal", label: "Normal" };
}

function twinPayload() {
  const a = latest.actual;
  const t = latest.twin;
  const p = previousLatest ? previousLatest.actual : a;
  const metricRow = (label, current, previous, predicted, unit, digits = 1, residual = null) => ({
    label, current, previous, predicted, unit, digits, residual
  });
  const components = {};
  for (let index = 0; index < 4; index += 1) {
    const id = `cylinder${index + 1}`;
    components[id] = {
      id,
      name: `Cylinder ${index + 1}`,
      condition: componentCondition(id),
      metrics: [
        metricRow("Cylinder head temperature", a.cht[index], p.cht[index], t.cht[index], "°C", 1, latest.residuals[`cht${index + 1}`]),
        metricRow("Exhaust gas temperature", a.egt[index], p.egt[index], t.egt[index], "°C", 0, index === 2 ? latest.residuals.egt3 : null)
      ]
    };
  }
  components.injector3 = {
    id: "injector3", name: "Injector 3", condition: componentCondition("injector3"), metrics: [
      metricRow("Fuel flow", a.fuelFlow, p.fuelFlow, t.fuelFlow, "L/h", 1, latest.residuals.fuelFlow),
      metricRow("Injection timing", a.injectionTiming, p.injectionTiming, t.injectionTiming, "° BTDC", 1)
    ]
  };
  components.fuelRail = {
    id: "fuelRail", name: "Fuel rail", condition: componentCondition("fuelRail"), metrics: [
      metricRow("Total fuel flow", a.fuelFlow, p.fuelFlow, t.fuelFlow, "L/h", 1, latest.residuals.fuelFlow),
      metricRow("Manifold pressure", a.manifold, p.manifold, t.manifold, "inHg", 1)
    ]
  };
  components.oilSystem = {
    id: "oilSystem", name: "Lubrication system", condition: componentCondition("oilSystem"), metrics: [
      metricRow("Oil pressure", a.oilPressure, p.oilPressure, t.oilPressure, "psi", 1, latest.residuals.oilPressure),
      metricRow("Oil temperature", a.oilTemp, p.oilTemp, t.oilTemp, "°C", 1, latest.residuals.oilTemp)
    ]
  };
  components.crankshaft = {
    id: "crankshaft", name: "Crankshaft", condition: componentCondition("crankshaft"), metrics: [
      metricRow("Engine speed", a.rpm, p.rpm, t.rpm, "RPM", 0, latest.residuals.rpm),
      metricRow("Vibration RMS", a.vibration, p.vibration, t.vibration, "g", 3, latest.residuals.vibration)
    ]
  };
  components.alternator = {
    id: "alternator", name: "Alternator", condition: componentCondition("alternator"), metrics: [
      metricRow("Bus voltage", a.busVoltage, p.busVoltage, t.busVoltage, "V", 1),
      metricRow("Output current", a.alternatorCurrent, p.alternatorCurrent, t.alternatorCurrent, "A", 1)
    ]
  };
  return {
    components,
    selectedDefault: state.fault === "lubrication" ? "oilSystem" : state.fault === "sensor" ? "cylinder2" : state.fault ? "cylinder3" : "cylinder1",
    fault: state.fault,
    severity: state.severity,
    linkLost: state.linkLost,
    twinSync: latest.twinSync,
    anomalyScore: latest.anomalyScore,
    diagnosis: diagnosis(),
    comparisonRows: [
      metricRow("Engine speed", a.rpm, p.rpm, t.rpm, "RPM", 0, latest.residuals.rpm),
      metricRow("Average CHT", mean(a.cht), mean(p.cht), mean(t.cht), "°C", 1, mean([latest.residuals.cht1, latest.residuals.cht2, latest.residuals.cht3, latest.residuals.cht4])),
      metricRow("Cylinder 3 EGT", a.egt[2], p.egt[2], t.egt[2], "°C", 0, latest.residuals.egt3),
      metricRow("Oil pressure", a.oilPressure, p.oilPressure, t.oilPressure, "psi", 1, latest.residuals.oilPressure),
      metricRow("Oil temperature", a.oilTemp, p.oilTemp, t.oilTemp, "°C", 1, latest.residuals.oilTemp),
      metricRow("Fuel flow", a.fuelFlow, p.fuelFlow, t.fuelFlow, "L/h", 1, latest.residuals.fuelFlow),
      metricRow("Vibration RMS", a.vibration, p.vibration, t.vibration, "g", 3, latest.residuals.vibration)
    ]
  };
}

function publishTwinTelemetry() {
  if (state.view !== "twin" || !latest) return;
  window.dispatchEvent(new CustomEvent("aerotwin:telemetry", { detail: twinPayload() }));
}

function renderTwin() {
  return `<section class="view">
    ${viewHeading("Interactive 360° engine health twin", "Drag to rotate, scroll to zoom and select a labelled component. Live measurements are compared with the previous sample and the mission-conditioned physics prediction.", `<button class="btn" data-view="mission">Inject a test fault</button>${state.fault ? `<button class="btn ghost" data-action="clear-fault">Clear active fault</button>` : ""}`)}
    <div class="grid twin-3d-layout">
      <article class="panel engine-3d-panel">
        <div class="panel-header"><div><h2>Four-cylinder aero-piston demonstrator</h2><p>Procedural training model now; replace it with your named GLB model for the final prototype.</p></div>${badge("Drag · zoom · select", "info")}</div>
        <div class="panel-body engine-3d-body">
          <div id="engine3dViewport" class="engine3d-viewport" aria-label="Interactive 3D aero-piston engine health model">
            <div id="engine3dStage" class="engine3d-stage"></div>
            <div id="engine3dLabels" class="engine3d-labels" aria-live="polite"></div>
            <div id="engine3dLoading" class="engine3d-loading"><strong>Preparing 360° engine twin</strong><span>Loading the interactive model…</span></div>
            <div class="engine3d-help">Left-drag: rotate · Wheel/pinch: zoom · Select a label or component</div>
          </div>
          <div class="engine3d-toolbar" aria-label="3D model controls">
            <button class="btn small" type="button" data-engine-action="reset">Reset view</button>
            <button class="btn small" type="button" data-engine-action="explode" aria-pressed="false">Exploded view</button>
            <button class="btn small" type="button" data-engine-action="labels" aria-pressed="true">Hide labels</button>
            <span class="engine-legend"><i class="normal"></i>Normal <i class="warning"></i>Degrading <i class="critical"></i>Critical <i class="unknown"></i>No data</span>
          </div>
          <div class="sync-box">
            <div id="twinSync3d" class="sync-score">${round(latest.twinSync, 0)}%</div>
            <div><strong>Twin synchronization confidence</strong><small id="twinSyncDescription">State estimator current · model MVEM-4C v0.7 · update latency 36 ms · telemetry age 42 ms</small></div>
          </div>
        </div>
      </article>
      <aside class="panel component-inspector">
        <div class="panel-header"><div><h2 id="selectedComponentTitle">Select a component</h2><p>One component, three comparisons and an engineering interpretation.</p></div><span id="componentStatusBadge" class="badge info">Waiting</span></div>
        <div class="panel-body">
          <div id="componentDeltaSummary" class="component-summary">Select a label on the 3D engine to inspect its state.</div>
          <div class="table-scroll">
            <table class="component-table">
              <thead><tr><th>Measurement</th><th>Current</th><th>Previous</th><th>Twin prediction</th></tr></thead>
              <tbody id="componentDetailBody"></tbody>
            </table>
          </div>
          <div id="componentInterpretation" class="notice" style="--notice-color:var(--cyan);margin-top:14px">
            <div class="notice-icon">i</div><div><strong>Why three values?</strong><p>Previous shows direction. The twin prediction shows whether that change is expected for the current mission conditions.</p></div>
          </div>
        </div>
      </aside>
    </div>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Whole-engine comparison</h2><p>Current, one-second previous and physics-predicted values update together.</p></div><span id="twinAnomalyBadge" class="badge info">Waiting for model</span></div>
      <div class="panel-body flush table-scroll">
        <table>
          <thead><tr><th>Parameter</th><th>Current</th><th>Previous</th><th>Change</th><th>Twin prediction</th><th>Normalized residual</th></tr></thead>
          <tbody id="telemetryComparisonBody"></tbody>
        </table>
      </div>
    </article>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Normalized residual trend</h2><p>Residuals are dimensionless so RPM, temperature and pressure can be compared safely.</p></div>${badge("Warning envelope ±3σ", "info")}</div>
      <div class="panel-body">
        ${lineChart([
          { label: "Cylinder 3 CHT residual", color: "var(--cyan)", values: state.histories.zCht, className: "chart-line-a" },
          { label: "Oil-pressure residual", color: "var(--amber)", values: state.histories.zOil, className: "chart-line-b" }
        ], { min: -12, max: 12, digits: 1, unit: "σ", label: "Normalized cylinder temperature and oil pressure residual trend" })}
        <div class="callout">Combined anomaly score uses a weighted root-mean-square of normalized residuals: z = (measured − predicted) / expected model error. It does not add incompatible units.</div>
      </div>
    </article>
  </section>`;
}

function renderAnalytics() {
  const d = diagnosis();
  const def = state.fault ? faultDefs[state.fault] : null;
  const mainRul = state.fault ? clamp(46 - state.severity * .39, 2.5, 44) : null;
  const lower = mainRul ? mainRul * .68 : null;
  const upper = mainRul ? mainRul * 1.42 : null;
  return `<section class="view">
    ${viewHeading("Explainable diagnosis and RUL", "Fault probabilities, supporting evidence and useful-life estimates are tied to the same synchronized engine state.", `<button class="btn" data-view="validation">Open model evidence</button>`)}
    <div class="grid analytics-layout">
      <article class="panel">
        <div class="panel-header"><div><h2>Primary fault assessment</h2><p>Human-readable evidence and differential diagnosis.</p></div>${badge(`${round(d.confidence, 1)}% confidence`, d.badge)}</div>
        <div class="panel-body">
          <div class="diagnosis-hero" style="--diagnosis-color:${d.color}">
            <div class="eyebrow">Current diagnosis</div>
            <h2>${d.primary}</h2>
            <p>${def ? def.consequence : "All monitored subsystems agree with the mission-conditioned physics model."}</p>
            <div class="diagnosis-meta">
              <div><small>Affected component</small><strong>${d.component}</strong></div>
              <div><small>First precursor</small><strong>${d.firstSeen}</strong></div>
              <div><small>Model status</small><strong>Within validated envelope</strong></div>
            </div>
          </div>
          <div class="divider"></div>
          <h3 class="section-label">Top diagnostic probabilities</h3>
          <div class="signal-list">${d.alternatives.map((item, index) => `<div class="signal">
            <div class="signal-label"><strong>${item[0]}</strong><small>${index === 0 ? "Primary assessment" : "Alternative hypothesis"}</small></div>
            <div class="bar"><span style="--bar:${item[1]}%;--bar-color:${index === 0 ? d.color : "var(--blue)"}"></span></div>
            <div class="signal-value">${round(item[1], 1)}%</div>
          </div>`).join("")}</div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Evidence attribution</h2><p>Direction and physical interpretation are shown with each contribution.</p></div>${badge("Hybrid rules + XGBoost", "info")}</div>
        <div class="panel-body">
          <div class="signal-list">${d.evidence.map(item => `<div class="signal">
            <div class="signal-label"><strong>${item[0]}</strong><small>${item[2]}</small></div>
            <div class="bar"><span style="--bar:${clamp(item[1], 1, 100)}%;--bar-color:${item[1] > 70 && state.fault ? d.color : "var(--cyan)"}"></span></div>
            <div class="signal-value">${round(item[1], 0)}</div>
          </div>`).join("")}</div>
          <div class="notice" style="--notice-color:var(--violet);margin-top:15px">
            <div class="notice-icon">D</div><div><strong>Differential check</strong><p>${state.fault ? `${d.differential} was considered. Cross-sensor and physics evidence makes it less likely than the primary diagnosis.` : "No alternative fault currently has sufficient corroborating evidence."}</p></div>
          </div>
        </div>
      </article>
    </div>
    <div class="grid cols-2">
      <article class="panel">
        <div class="panel-header"><div><h2>Component useful-life forecast</h2><p>Prognostic RUL is separated from scheduled maintenance.</p></div>${badge(state.fault ? "90% interval" : "No active degradation", state.fault ? "warning" : "ok")}</div>
        <div class="panel-body">
          <div class="rul-list">
            ${state.fault ? `<div class="rul-card">
              <header><h3>${def.rulComponent}</h3>${badge(d.severity, d.badge)}</header>
              <div class="range">${round(mainRul, 1)} h <span class="muted">[${round(lower, 1)}–${round(upper, 1)} h]</span></div>
              <p>Failure criterion: component-specific residual exceeds its validated limit under the current mission usage profile.</p>
            </div>` : `<div class="rul-card"><header><h3>Prognostic RUL</h3>${badge("Inactive", "ok")}</header><div class="range">No active degradation</div><p>A precise failure countdown is intentionally not shown while no degradation trend is established.</p></div>`}
            <div class="rul-card"><header><h3>Scheduled inspection interval</h3>${badge("Maintenance plan", "info")}</header><div class="range">420 h remaining</div><p>Calendar/usage-based maintenance interval; this is not an AI failure prediction.</p></div>
            <div class="rul-card"><header><h3>Prediction assumptions</h3>${badge("Current plan", "info")}</header><div class="range">${state.altitude.toLocaleString()} ft · ${state.throttle}% load</div><p>Interval widens automatically if telemetry quality falls or the mission moves outside the validated envelope.</p></div>
          </div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Model card</h2><p>Traceability shown beside every operational prediction.</p></div>${badge("Prototype", "warning")}</div>
        <div class="panel-body model-card">
          <div class="model-row"><span>Diagnosis model</span><strong>XGBoost v0.3 + physics rules</strong></div>
          <div class="model-row"><span>State estimator</span><strong>Unscented Kalman filter v0.6</strong></div>
          <div class="model-row"><span>Training source</span><strong>Synthetic engine missions</strong></div>
          <div class="model-row"><span>Test separation</span><strong>Held out by complete mission</strong></div>
          <div class="model-row"><span>Current operating envelope</span><strong class="green">In distribution</strong></div>
          <div class="model-row"><span>Physical-engine validation</span><strong class="amber">Pending test-rig data</strong></div>
        </div>
      </article>
    </div>
  </section>`;
}

function missionOptions() {
  const current = latest.reliability;
  const options = [
    { id: "continue", name: "Continue current mission", note: "No change to route or power demand.", probability: current, cost: "Full objective" },
    { id: "shorten", name: "Shorten loiter by 25 minutes", note: "Preserves the primary ISR segment and reduces cumulative exposure.", probability: clamp(current + 17, 15, 99), cost: "Partial objective" },
    { id: "derate", name: "Descend 2,000 ft and cap throttle at 68%", note: "Reduces thermal and mechanical loading while preserving return capability.", probability: clamp(current + 25, 18, 99), cost: "Longer return" },
    { id: "rtb", name: "Return to base now", note: "Highest survival margin; mission objective is terminated.", probability: clamp(current + 34, 28, 99), cost: "Abort mission" }
  ];
  const recommended = !state.fault ? "continue" : state.severity >= 65 ? "rtb" : state.severity >= 25 ? "derate" : "shorten";
  return { options, recommended };
}

function renderMission() {
  const plan = missionOptions();
  return `<section class="view">
    ${viewHeading("Mission reliability planner", "Test environmental conditions and progressive faults, then compare explainable contingency options before committing an operator decision.", `<button class="btn" data-action="reset-demo">Reset demonstration</button>`)}
    <div class="grid cols-2">
      <article class="panel">
        <div class="panel-header"><div><h2>Mission scenario</h2><p>The physics twin adapts to operating conditions before assessing faults.</p></div>${badge(scenarios[state.scenario].name, "info")}</div>
        <div class="panel-body">
          <div class="scenario-list">
            ${Object.entries(scenarios).map(([id, scenario]) => `<button class="scenario ${state.scenario === id ? "active" : ""}" data-scenario="${id}">
              <strong>${scenario.name}</strong><small>${scenario.note}</small>
            </button>`).join("")}
          </div>
          <div class="control">
            <label><span>Altitude</span><strong class="mono">${state.altitude.toLocaleString()} ft</strong></label>
            <div class="range-row"><input aria-label="Altitude" data-control="altitude" type="range" min="0" max="22000" step="500" value="${state.altitude}"><span class="range-value">${state.altitude}</span></div>
          </div>
          <div class="control">
            <label><span>Ambient temperature</span><strong class="mono">${state.ambient} °C</strong></label>
            <div class="range-row"><input aria-label="Ambient temperature" data-control="ambient" type="range" min="-30" max="50" step="1" value="${state.ambient}"><span class="range-value">${state.ambient}</span></div>
          </div>
          <div class="control">
            <label><span>Throttle demand</span><strong class="mono">${state.throttle}%</strong></label>
            <div class="range-row"><input aria-label="Throttle demand" data-control="throttle" type="range" min="35" max="100" step="1" value="${state.throttle}"><span class="range-value">${state.throttle}</span></div>
          </div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Progressive fault injection</h2><p>Faults change multiple physically related parameters and retain a ground-truth label.</p></div>${badge(state.fault ? "Fault active" : "Nominal", state.fault ? "warning" : "ok")}</div>
        <div class="panel-body">
          <div class="fault-grid">
            ${Object.entries(faultDefs).map(([id, fault]) => `<button class="fault-card ${state.stagedFault === id ? "active" : ""}" data-fault-select="${id}">
              <strong>${fault.short}</strong><small>${fault.component}</small>
            </button>`).join("")}
          </div>
          <div class="control fault-control">
            <label><span>Fault severity</span><strong id="faultSeverityLabel" class="mono">${state.stagedSeverity}%</strong></label>
            <div class="range-row"><input aria-label="Fault severity" id="faultSeverity" data-control="faultSeverity" type="range" min="5" max="90" step="1" value="${state.stagedSeverity}"><span id="faultSeverityValue" class="range-value">${state.stagedSeverity}%</span></div>
          </div>
          <div class="model-card" style="margin-top:14px">
            <div class="model-row"><span>Progression profile</span><strong>Gradual · 12 simulated minutes</strong></div>
            <div class="model-row"><span>Ground-truth label</span><strong>${faultDefs[state.stagedFault].name}</strong></div>
            <div class="model-row"><span>Reproducibility seed</span><strong class="mono">MALE-26054-07</strong></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn danger" data-action="inject-fault">Inject selected fault</button>
            <button class="btn ghost" data-action="clear-fault" ${state.fault ? "" : "disabled"}>Clear active fault</button>
          </div>
        </div>
      </article>
    </div>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Remaining mission profile</h2><p>Mission phase is part of the engine-load forecast.</p></div>${badge(`Completion ${round(latest.reliability, 0)}%`, latest.reliability > 84 ? "ok" : latest.reliability > 60 ? "warning" : "critical")}</div>
      <div class="panel-body">
        <div class="phase-track">${["Pre-flight", "Climb", "Cruise", "Loiter", "Return", "Landing"].map((phase, index) => `<div class="phase ${index < state.phase ? "complete" : index === state.phase ? "current" : ""}">${phase}</div>`).join("")}</div>
        ${lineChart([{ label: "Mission completion probability", color: "var(--cyan)", values: state.histories.reliability, className: latest.reliability < 60 ? "chart-line-c" : "chart-line-a" }], { min: 0, max: 100, unit: "%", label: "Mission completion probability trend" })}
      </div>
    </article>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Counterfactual contingency comparison</h2><p>Advisory only. An operator must approve any mission change.</p></div>${badge(`Recommended: ${plan.options.find(item => item.id === plan.recommended).name}`, "ok")}</div>
      <div class="panel-body option-list">
        ${plan.options.map(item => `<div class="mission-option ${item.id === plan.recommended ? "recommended" : ""} ${state.selectedPlan === item.id ? "selected" : ""}" data-plan="${item.id}" tabindex="0" role="button" aria-label="Select ${item.name}">
          <div><strong>${item.name}</strong><small>${item.note} · ${item.cost}</small></div>
          <div class="probability ${item.probability > 84 ? "green" : item.probability > 60 ? "amber" : "red"}">${round(item.probability, 0)}%</div>
          <button class="btn small ${item.id === plan.recommended ? "primary" : ""}" data-plan="${item.id}">${state.selectedPlan === item.id ? "Selected" : "Select plan"}</button>
        </div>`).join("")}
      </div>
    </article>
  </section>`;
}

function renderAdvisory() {
  const d = diagnosis();
  const def = state.fault ? faultDefs[state.fault] : null;
  const actions = def ? def.inspection : [
    ["Perform pre-flight engine inspection", "Verify oil quantity, fuel supply, fasteners, leaks and intake/cooling obstructions."],
    ["Confirm sensor validity", "Check that all channels are fresh, plausible and within the configured operating envelope."],
    ["Review deferred items", "Confirm no open propulsion maintenance item blocks mission release."]
  ];
  return `<section class="view">
    ${viewHeading("Maintenance decision support", "Evidence-linked recommendations for ground technicians. All actions require human acknowledgement and maintenance authority.", `<button class="btn" data-view="replay">Open audit replay</button>`)}
    <div class="grid main-side">
      <article class="panel">
        <div class="panel-header"><div><h2>${def ? def.name : "Scheduled pre-flight checklist"}</h2><p>${def ? def.component : "No AI-generated corrective maintenance is active."}</p></div>${badge(d.severity, d.badge)}</div>
        <div class="panel-body">
          <div class="notice" style="--notice-color:${d.color}">
            <div class="notice-icon">${def ? "!" : "i"}</div>
            <div><strong>${def ? def.action : "Engine condition is nominal"}</strong><p>${def ? def.consequence : "Complete the normal inspection schedule. Prognostic RUL remains inactive until a credible degradation trend is observed."}</p></div>
          </div>
          ${def ? `<div class="notice" style="--notice-color:var(--violet)">
            <div class="notice-icon">E</div><div><strong>Why this recommendation</strong><p>${d.evidence.slice(0, 3).map(item => item[0]).join(", ")} provide mutually corroborating evidence. ${d.differential} remains the strongest alternative hypothesis.</p></div>
          </div>` : ""}
          <div class="divider"></div>
          <h3 class="section-label">${def ? "Post-flight inspection protocol" : "Release-to-service checks"}</h3>
          <div class="checklist">
            ${actions.map((action, index) => `<label class="check">
              <input type="checkbox" data-check="${index}" ${state.checks.has(index) ? "checked" : ""}>
              <span><strong>${index + 1}. ${action[0]}</strong><small>${action[1]}</small></span>
            </label>`).join("")}
          </div>
          <button class="btn primary" style="margin-top:14px" data-action="acknowledge">${state.acknowledged ? "Advisory acknowledged" : "Acknowledge and assign"}</button>
        </div>
      </article>
      <aside class="grid">
        <article class="panel">
          <div class="panel-header"><div><h2>Work-order summary</h2><p>Operational impact and traceability.</p></div></div>
          <div class="panel-body model-card">
            <div class="model-row"><span>Priority</span><strong>${def ? d.severity : "Routine"}</strong></div>
            <div class="model-row"><span>Recommended timing</span><strong>${def ? "After landing / before next flight" : "Before release"}</strong></div>
            <div class="model-row"><span>Estimated downtime</span><strong>${def ? def.downtime : "15–20 min"}</strong></div>
            <div class="model-row"><span>Suggested materials</span><strong>${def ? def.spares : "Standard inspection kit"}</strong></div>
            <div class="model-row"><span>Decision authority</span><strong>Licensed ground technician</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><div><h2>Audit trail</h2><p>Recent decisions and evidence changes.</p></div></div>
          <div class="panel-body">${renderEvents(4)}</div>
        </article>
      </aside>
    </div>
  </section>`;
}

function byte(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

function canFrames() {
  const a = latest.actual;
  const now = Date.now() - (state.linkLost ? state.linkLossTicks * 1000 : 0);
  return [
    {
      time: now,
      id: "0x18F00400",
      name: "Engine speed / load",
      bytes: `${byte(a.rpm / 16)} ${byte(a.rpm / 64)} ${byte(state.throttle * 2.5)} 7D 00 00 00 A1`,
      decoded: `${round(a.rpm, 0)} RPM · ${state.throttle}% throttle`,
      rate: "50 Hz"
    },
    {
      time: now - 14,
      id: "0x18FEEF00",
      name: "Lubrication state",
      bytes: `${byte(a.oilPressure * 2)} ${byte(a.oilTemp + 40)} 00 00 00 00 4E B2`,
      decoded: `${round(a.oilPressure, 1)} psi · ${round(a.oilTemp, 1)} °C`,
      rate: "10 Hz"
    },
    {
      time: now - 26,
      id: "0x18FF1000",
      name: "Cylinder thermal bank",
      bytes: `${byte(a.cht[0])} ${byte(a.cht[1])} ${byte(a.cht[2])} ${byte(a.cht[3])} ${byte(a.egt[2] / 4)} 00 61 C4`,
      decoded: `CHT 1–4 · EGT-3 ${round(a.egt[2], 0)} °C`,
      rate: "10 Hz"
    },
    {
      time: now - 39,
      id: "0x18FF1100",
      name: "Fuel and injection",
      bytes: `${byte(a.fuelFlow * 5)} ${byte(a.injectionTiming * 4)} ${byte(a.manifold * 4)} 00 00 00 39 D8`,
      decoded: `${round(a.fuelFlow, 1)} L/h · ${round(a.injectionTiming, 1)}° BTDC`,
      rate: "20 Hz"
    },
    {
      time: now - 52,
      id: "0x18FF1200",
      name: "Electrical health",
      bytes: `${byte(a.busVoltage * 4)} ${byte(a.alternatorCurrent * 2)} 00 00 00 00 1F 8A`,
      decoded: `${round(a.busVoltage, 1)} V · ${round(a.alternatorCurrent, 1)} A`,
      rate: "5 Hz"
    }
  ];
}

function renderCan() {
  const frames = canFrames();
  return `<section class="view">
    ${viewHeading("CAN and telemetry integrity", "Prototype DBC-mapped aero-piston signals replace the earlier electric-drivetrain frames. Raw bytes are illustrative simulation output.", `<button class="btn" data-view="validation">Review security architecture</button>`)}
    <div class="security-grid">
      <div class="security-item"><small>Data source</small><strong class="amber">Virtual CAN · simulated</strong><p>Ground-truth fault labels retained separately.</p></div>
      <div class="security-item"><small>Transport</small><strong class="green">Authenticated demo channel</strong><p>Sequence and freshness validation enabled.</p></div>
      <div class="security-item"><small>Packet continuity</small><strong class="green">99.98%</strong><p>One recovered packet in the active window.</p></div>
      <div class="security-item"><small>Latest frame age</small><strong class="mono ${state.linkLost ? "amber" : ""}">${state.linkLost ? `${state.linkLossTicks}.04 s` : "42 ms"}</strong><p>Stale-state threshold configured at 500 ms.</p></div>
    </div>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Real-time SocketCAN monitor</h2><p>Representative J1939-style and prototype proprietary frames; production IDs must match the selected ECU/FADEC specification.</p></div>${badge("Virtual CAN active", "info")}</div>
      <div class="panel-body flush table-scroll">
        <table>
          <thead><tr><th>UTC timestamp</th><th>CAN ID</th><th>Mapped signal group</th><th>DLC</th><th>Raw bytes</th><th>Decoded engineering values</th><th>Rate</th><th>Quality</th></tr></thead>
          <tbody>${frames.map(frame => `<tr>
            <td class="mono nowrap">${new Date(frame.time).toISOString().slice(11, 23)}</td>
            <td class="mono cyan">${frame.id}</td>
            <td>${frame.name}</td>
            <td class="mono">8</td>
            <td class="mono amber nowrap">${frame.bytes}</td>
            <td class="mono green nowrap">${frame.decoded}</td>
            <td class="mono">${frame.rate}</td>
            <td><span class="quality ${state.linkLost ? "predicted" : ""}">${state.linkLost ? "stale" : "valid"}</span></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </article>
    <div class="grid cols-2">
      <article class="panel">
        <div class="panel-header"><div><h2>Frame-quality gate</h2><p>Bad data is isolated before entering the twin.</p></div></div>
        <div class="panel-body model-card">
          <div class="model-row"><span>Timestamp monotonicity</span><strong class="green">Pass</strong></div>
          <div class="model-row"><span>Sequence continuity</span><strong class="green">Pass</strong></div>
          <div class="model-row"><span>Range / plausibility</span><strong class="green">Pass</strong></div>
          <div class="model-row"><span>Cross-sensor consistency</span><strong class="${state.fault === "sensor" ? "amber" : "green"}">${state.fault === "sensor" ? "CHT-2 suspect" : "Pass"}</strong></div>
          <div class="model-row"><span>Replay / duplicate detection</span><strong class="green">No event</strong></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Schema traceability</h2><p>Every engineering value must trace to an ECU signal definition.</p></div></div>
        <div class="panel-body">
          <div class="notice" style="--notice-color:var(--amber)"><div class="notice-icon">!</div><div><strong>Prototype mapping disclosure</strong><p>The displayed frame IDs and byte packing demonstrate the software path. Replace them with the selected engine ECU’s verified DBC/ARXML or interface-control document before claiming hardware compatibility.</p></div></div>
          <div class="model-card" style="margin-top:13px">
            <div class="model-row"><span>Schema version</span><strong>AP-4C-DBC v0.2</strong></div>
            <div class="model-row"><span>Decoder checksum</span><strong class="mono">A4C9-72E1</strong></div>
            <div class="model-row"><span>Gateway mode</span><strong>Read-only monitoring</strong></div>
          </div>
        </div>
      </article>
    </div>
  </section>`;
}

function renderValidation() {
  const d = diagnosis();
  return `<section class="view">
    ${viewHeading("Validation and security evidence", "Transparent prototype evidence, limitations and deployment controls. These numbers are labelled to prevent synthetic results being mistaken for flight certification.", `<button class="btn ${state.linkLost ? "primary" : "warning"}" data-action="toggle-link">${state.linkLost ? "Restore telemetry link" : "Simulate telemetry loss"}</button><button class="btn" data-view="replay">Open mission report</button>`)}
    <div class="callout">Evidence status: the current benchmark uses synthetic, mission-held-out data from the representative engine simulator. Physical test-rig and engine-specific calibration remain required before operational use.</div>
    <div class="grid cols-2">
      <article class="panel">
        <div class="panel-header"><div><h2>Prototype validation scorecard</h2><p>Synthetic held-out benchmark · 160 complete missions.</p></div>${badge("Not flight-certified", "warning")}</div>
        <div class="panel-body flush table-scroll">
          <table>
            <thead><tr><th>Capability</th><th>Metric</th><th>Prototype result</th><th>Evidence status</th></tr></thead>
            <tbody>
              <tr><td>Physics twin</td><td>CHT RMSE by mission</td><td class="mono">3.8 °C</td><td class="amber">Synthetic</td></tr>
              <tr><td>Physics twin</td><td>Oil-pressure RMSE</td><td class="mono">1.9 psi</td><td class="amber">Synthetic</td></tr>
              <tr><td>Fault isolation</td><td>Macro-F1</td><td class="mono">0.91</td><td class="amber">Mission-held-out</td></tr>
              <tr><td>Early warning</td><td>Median precursor lead</td><td class="mono">07:42</td><td class="amber">Injected faults</td></tr>
              <tr><td>False alarms</td><td>Events / flight hour</td><td class="mono">0.06</td><td class="amber">Synthetic</td></tr>
              <tr><td>RUL</td><td>90% interval coverage</td><td class="mono">88%</td><td class="amber">Degradation simulation</td></tr>
              <tr><td>Pipeline</td><td>CAN-to-dashboard latency</td><td class="mono">36 ms</td><td class="green">Local measurement</td></tr>
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Model applicability</h2><p>The system can refuse overconfident predictions.</p></div>${badge("In distribution", "ok")}</div>
        <div class="panel-body model-card">
          <div class="model-row"><span>Altitude envelope</span><strong>0–18,000 ft</strong></div>
          <div class="model-row"><span>Ambient envelope</span><strong>−20 to 45 °C</strong></div>
          <div class="model-row"><span>Throttle envelope</span><strong>40–95%</strong></div>
          <div class="model-row"><span>Current condition</span><strong class="${state.altitude <= 18000 && state.ambient >= -20 && state.ambient <= 45 && state.throttle <= 95 ? "green" : "amber"}">${state.altitude <= 18000 && state.ambient >= -20 && state.ambient <= 45 && state.throttle <= 95 ? "Within envelope" : "Reduced-confidence extrapolation"}</strong></div>
          <div class="model-row"><span>Primary assessment</span><strong>${d.primary}</strong></div>
          <div class="model-row"><span>Probability calibration</span><strong>Temperature-scaled</strong></div>
        </div>
      </article>
    </div>
    <article class="panel" style="margin-top:14px">
      <div class="panel-header"><div><h2>Defence-oriented telemetry architecture</h2><p>Offline-first controls with a read-only engine interface and human authority.</p></div>${badge("Prototype controls", "info")}</div>
      <div class="panel-body security-grid">
        <div class="security-item"><small>Engine interface</small><strong>Read-only CAN gateway</strong><p>The analytics layer cannot write engine-control commands.</p></div>
        <div class="security-item"><small>Link integrity</small><strong>Authenticated frames</strong><p>Sequence numbers, timestamps and message authentication detect replay.</p></div>
        <div class="security-item"><small>Link-loss mode</small><strong>Bounded extrapolation</strong><p>Confidence decays visibly; predictions are never labelled as live telemetry.</p></div>
        <div class="security-item"><small>Deployment</small><strong>Local GCS analytics</strong><p>Core operation does not depend on a public cloud connection.</p></div>
        <div class="security-item"><small>Access control</small><strong>Role-separated actions</strong><p>Operator, propulsion engineer and maintainer permissions are distinct.</p></div>
        <div class="security-item"><small>Auditability</small><strong>Versioned evidence</strong><p>Model, schema, operator action and advisory history are retained.</p></div>
        <div class="security-item"><small>AI authority</small><strong>Advisory only</strong><p>Mission and maintenance changes require explicit human approval.</p></div>
        <div class="security-item"><small>Unknown faults</small><strong>Safe abstention</strong><p>Out-of-distribution evidence produces an unknown-anomaly state.</p></div>
      </div>
    </article>
    <div class="grid cols-2">
      <article class="panel">
        <div class="panel-header"><div><h2>Dataset provenance</h2><p>No generic turbofan data is presented as piston-engine proof.</p></div></div>
        <div class="panel-body model-card">
          <div class="model-row"><span>Nominal missions</span><strong>1,200 simulated</strong></div>
          <div class="model-row"><span>Fault missions</span><strong>2,400 simulated</strong></div>
          <div class="model-row"><span>Fault classes</span><strong>5 + unknown</strong></div>
          <div class="model-row"><span>Split strategy</span><strong>Mission-wise, no row leakage</strong></div>
          <div class="model-row"><span>Real engine runs</span><strong class="amber">0 · planned validation</strong></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><h2>Known prototype limitations</h2><p>Explicit risks strengthen technical credibility.</p></div></div>
        <div class="panel-body">
          <div class="notice" style="--notice-color:var(--amber)"><div class="notice-icon">1</div><div><strong>Engine-specific calibration pending</strong><p>Thermal maps and failure thresholds must be fitted to the selected aero-piston engine.</p></div></div>
          <div class="notice" style="--notice-color:var(--amber)"><div class="notice-icon">2</div><div><strong>RUL validation limited</strong><p>Run-to-failure or accelerated degradation data is needed for trustworthy life prediction.</p></div></div>
          <div class="notice" style="--notice-color:var(--amber)"><div class="notice-icon">3</div><div><strong>No flight-control authority</strong><p>The prototype intentionally provides decision support only.</p></div></div>
        </div>
      </article>
    </div>
  </section>`;
}

function replayEvents() {
  const def = state.fault ? faultDefs[state.fault] : faultDefs.injector;
  return [
    { p: 0, time: "00:00", title: "Mission initialized", detail: "CAN acquisition, physics model and state estimator synchronized.", type: "ok" },
    { p: 18, time: "00:42", title: "Climb phase entered", detail: `Altitude trend established toward ${state.altitude.toLocaleString()} ft.`, type: "info" },
    { p: 42, time: "01:36", title: "Cruise baseline established", detail: "Model residuals remain inside the expected envelope.", type: "ok" },
    { p: 59, time: "02:12", title: `${def.name} precursor`, detail: "Correlated residual trend begins before a hard threshold is crossed.", type: "warning" },
    { p: 71, time: "02:27", title: "Explainable advisory generated", detail: `${def.component}: ${def.consequence}`, type: "fault" },
    { p: 84, time: "02:39", title: "Mission alternatives evaluated", detail: "Counterfactual planner compares continue, shorten, derate and return-to-base options.", type: "info" },
    { p: 100, time: "02:51", title: state.selectedPlan ? "Operator plan recorded" : "Awaiting operator decision", detail: state.selectedPlan ? `Selected plan: ${missionOptions().options.find(item => item.id === state.selectedPlan)?.name}.` : "No mission modification has been approved.", type: state.selectedPlan ? "ok" : "warning" }
  ];
}

function renderReplay() {
  const d = diagnosis();
  const selected = replayEvents().filter(event => event.p <= state.replayPosition).slice(-1)[0];
  return `<section class="view">
    ${viewHeading("Mission replay and health report", "Reconstruct the fault, evidence, prediction and human decision from a single timestamped record.", `<button class="btn primary" data-action="print-report">Print / save PDF</button><button class="btn" data-action="reset-demo">Reset demonstration</button>`)}
    <div class="report-summary">
      <div class="report-stat"><small>Mission</small><strong>ISR-ALPHA-07</strong></div>
      <div class="report-stat"><small>Engine state</small><strong class="${d.badge === "ok" ? "green" : "amber"}">${d.severity}</strong></div>
      <div class="report-stat"><small>Completion forecast</small><strong>${round(latest.reliability, 0)}%</strong></div>
      <div class="report-stat"><small>Data completeness</small><strong>99.98%</strong></div>
    </div>
    <div class="grid main-side">
      <article class="panel">
        <div class="panel-header"><div><h2>Replay controller</h2><p>Move through the event chain without changing the original evidence.</p></div>${badge(`${state.replayPosition}%`, "info")}</div>
        <div class="panel-body">
          <div class="replay-controls">
            <button class="btn small" data-action="replay-back">−10%</button>
            <input aria-label="Replay position" type="range" data-control="replay" min="0" max="100" step="1" value="${state.replayPosition}">
            <button class="btn small" data-action="replay-forward">+10%</button>
          </div>
          <div class="diagnosis-hero" style="--diagnosis-color:${eventColor(selected.type)}">
            <div class="eyebrow">Replay position ${selected.time}</div>
            <h2>${selected.title}</h2>
            <p>${selected.detail}</p>
          </div>
          <div class="divider"></div>
          <div class="event-list">${replayEvents().map(event => `<div class="event" style="opacity:${event.p <= state.replayPosition ? 1 : .34}">
            <time>${event.time}</time><span class="event-dot" style="--event-color:${eventColor(event.type)}"></span><div><strong>${event.title}</strong><p>${event.detail}</p></div>
          </div>`).join("")}</div>
        </div>
      </article>
      <aside class="grid">
        <article class="panel">
          <div class="panel-header"><div><h2>Report conclusion</h2><p>Evidence and limitations travel with the result.</p></div>${badge("Prototype report", "warning")}</div>
          <div class="panel-body model-card">
            <div class="model-row"><span>Primary diagnosis</span><strong>${d.primary}</strong></div>
            <div class="model-row"><span>Confidence</span><strong>${round(d.confidence, 1)}%</strong></div>
            <div class="model-row"><span>Mission decision</span><strong>${state.selectedPlan ? missionOptions().options.find(item => item.id === state.selectedPlan)?.name : "Pending"}</strong></div>
            <div class="model-row"><span>Advisory status</span><strong>${state.acknowledged ? "Acknowledged" : "Open"}</strong></div>
            <div class="model-row"><span>Model / schema</span><strong>MVEM-4C v0.6 / AP-4C v0.2</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><div><h2>Data provenance</h2><p>Required for reproducibility.</p></div></div>
          <div class="panel-body model-card">
            <div class="model-row"><span>Source</span><strong class="amber">Simulated virtual CAN</strong></div>
            <div class="model-row"><span>Scenario</span><strong>${scenarios[state.scenario].name}</strong></div>
            <div class="model-row"><span>Fault label</span><strong>${state.fault ? faultDefs[state.fault].name : "None"}</strong></div>
            <div class="model-row"><span>Seed</span><strong class="mono">MALE-26054-07</strong></div>
            <div class="model-row"><span>Integrity</span><strong class="green">Sequence verified</strong></div>
          </div>
        </article>
      </aside>
    </div>
    <p class="footer-note">This generated report demonstrates the required audit structure. It is not an airworthiness release, maintenance approval or flight-safety certification.</p>
  </section>`;
}

function render() {
  if (!latest) latest = computeTelemetry(false);
  renderHeader();
  renderNav();
  const views = {
    cockpit: renderCockpit,
    twin: renderTwin,
    analytics: renderAnalytics,
    mission: renderMission,
    advisory: renderAdvisory,
    can: renderCan,
    validation: renderValidation,
    replay: renderReplay
  };
  document.getElementById("mainContent").innerHTML = views[state.view]();
  window.dispatchEvent(new CustomEvent("aerotwin:viewchange", { detail: { view: state.view } }));
  if (state.view === "twin") window.queueMicrotask(publishTwinTelemetry);
}

function toast(message) {
  const region = document.getElementById("toastRegion");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 3200);
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const scenarioButton = event.target.closest("[data-scenario]");
  if (scenarioButton) {
    const id = scenarioButton.dataset.scenario;
    const scenario = scenarios[id];
    state.scenario = id;
    state.altitude = scenario.altitude;
    state.ambient = scenario.ambient;
    state.throttle = scenario.throttle;
    state.phase = scenario.phase;
    addEvent("info", "Mission scenario changed", scenario.name);
    previousLatest = latest;
    latest = computeTelemetry(true);
    render();
    return;
  }

  const faultButton = event.target.closest("[data-fault-select]");
  if (faultButton) {
    state.stagedFault = faultButton.dataset.faultSelect;
    render();
    return;
  }

  const planButton = event.target.closest("[data-plan]");
  if (planButton) {
    state.selectedPlan = planButton.dataset.plan;
    const item = missionOptions().options.find(option => option.id === state.selectedPlan);
    addEvent("ok", "Operator plan selected", `${item.name}; forecast completion probability ${round(item.probability, 0)}%.`);
    toast(`Plan selected: ${item.name}. Human approval recorded in the prototype audit trail.`);
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "toggle-pause") {
    state.paused = !state.paused;
    toast(state.paused ? "Telemetry display paused. Acquisition continues in the simulator." : "Live telemetry resumed.");
  }
  if (action === "toggle-link") {
    state.linkLost = !state.linkLost;
    state.linkLossTicks = 0;
    if (state.linkLost) {
      addEvent("warning", "Telemetry link lost", "Twin entered bounded prediction mode; data age and uncertainty are now increasing visibly.");
      toast("Telemetry lost. Last-known measurements are frozen while twin confidence decays.");
    } else {
      addEvent("ok", "Telemetry link restored", "Fresh authenticated frames received; state estimator re-synchronizing.");
      toast("Live telemetry restored. Twin synchronization is recovering.");
    }
  }
  if (action === "inject-fault") {
    state.fault = state.stagedFault;
    state.severity = state.stagedSeverity;
    state.acknowledged = false;
    state.checks.clear();
    state.selectedPlan = null;
    addEvent(state.severity >= 65 ? "critical" : "fault", "Progressive fault injected", `${faultDefs[state.fault].name} at ${state.severity}% simulated severity.`);
    addEvent("warning", "Early precursor detected", `Physics residuals identify ${faultDefs[state.fault].component} before a hard-limit exceedance.`);
    toast(`${faultDefs[state.fault].name} is now propagating across the twin.`);
  }
  if (action === "clear-fault") {
    const previous = state.fault ? faultDefs[state.fault].name : "fault";
    state.fault = null;
    state.severity = 0;
    state.acknowledged = false;
    state.checks.clear();
    state.selectedPlan = null;
    addEvent("ok", "Fault injection cleared", `${previous} removed; the estimator is returning to the nominal envelope.`);
    toast("Fault cleared. The twin is re-synchronizing.");
  }
  if (action === "acknowledge") {
    state.acknowledged = true;
    addEvent("ok", "Advisory acknowledged", "Assigned to ground maintenance authority; no automatic engine action was taken.");
    toast("Advisory acknowledged and written to the audit trail.");
  }
  if (action === "reset-demo") {
    state.scenario = "nominal";
    state.altitude = scenarios.nominal.altitude;
    state.ambient = scenarios.nominal.ambient;
    state.throttle = scenarios.nominal.throttle;
    state.phase = scenarios.nominal.phase;
    state.fault = null;
    state.severity = 0;
    state.stagedSeverity = 38;
    state.selectedPlan = null;
    state.acknowledged = false;
    state.checks.clear();
    state.replayPosition = 100;
    state.linkLost = false;
    state.linkLossTicks = 0;
    addEvent("ok", "Demonstration reset", "Nominal mission baseline restored.");
    toast("Nominal demonstration state restored.");
  }
  if (action === "replay-back") state.replayPosition = clamp(state.replayPosition - 10, 0, 100);
  if (action === "replay-forward") state.replayPosition = clamp(state.replayPosition + 10, 0, 100);
  if (action === "print-report") {
    toast("Opening the browser print dialog. Select “Save as PDF” to export the report.");
    window.setTimeout(() => window.print(), 250);
  }
  previousLatest = latest;
  latest = computeTelemetry(true);
  render();
});

document.addEventListener("input", event => {
  const control = event.target.dataset.control;
  if (!control) return;
  const value = Number(event.target.value);
  if (control === "faultSeverity") {
    state.stagedSeverity = value;
    const display = document.getElementById("faultSeverityValue");
    const label = document.getElementById("faultSeverityLabel");
    if (display) display.textContent = `${value}%`;
    if (label) label.textContent = `${value}%`;
    return;
  }
  if (control === "replay") {
    state.replayPosition = value;
    render();
    return;
  }
  if (["altitude", "ambient", "throttle"].includes(control)) {
    state[control] = value;
    previousLatest = latest;
    latest = computeTelemetry(false);
    const display = event.target.nextElementSibling;
    if (display) display.textContent = control === "altitude" ? `${value} ft` : control === "ambient" ? `${value} °C` : `${value}%`;
  }
});

document.addEventListener("change", event => {
  const control = event.target.dataset.control;
  if (["altitude", "ambient", "throttle"].includes(control)) {
    addEvent("info", "Environmental control adjusted", `${control} changed to ${event.target.value}.`);
    previousLatest = latest;
    latest = computeTelemetry(true);
    render();
  }
  if (event.target.dataset.check !== undefined) {
    const index = Number(event.target.dataset.check);
    if (event.target.checked) state.checks.add(index);
    else state.checks.delete(index);
  }
});

for (let index = 0; index < 42; index += 1) {
  state.tick = index;
  previousLatest = latest;
  latest = computeTelemetry(true);
}
state.tick = 42;
render();

window.setInterval(() => {
  if (state.paused) return;
  state.tick += 1;
  if (state.linkLost) state.linkLossTicks += 1;
  previousLatest = latest;
  latest = computeTelemetry(true);
  if (document.activeElement && document.activeElement.matches("input[type='range']")) return;
  if (state.view === "twin") {
    renderHeader();
    publishTwinTelemetry();
  } else {
    render();
  }
}, 1000);
