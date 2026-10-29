/* Optional end-to-end smoke test for app/index.html + app.js.
 *
 * Requires jsdom (not part of the Python CI):
 *   npm install jsdom
 *   node tools/smoke_app.js
 *
 * It drives the real UI through: baseline HHIE-S -> speech-in-noise -> gap ->
 * training -> report -> export/import -> week advance -> week-4 assessment ->
 * demo mode. Every element lookup and every flow is exercised without a real
 * browser. If jsdom is absent the script prints a skip and exits 0.
 */
"use strict";

const fs = require("fs");
const path = require("path");

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require("jsdom"));
} catch (e) {
  console.log("SKIP: jsdom is not installed. Run `npm install jsdom` in the repository root.");
  process.exit(0);
}

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "app/index.html"), "utf8");
const protocol = fs.readFileSync(path.join(ROOT, "app/protocol.js"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

function audioNode() {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  return {
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    gain: param(),
    frequency: param(),
    Q: param(),
    type: "sine",
    buffer: null,
    loop: false,
  };
}

function makeDom(seed, url, extra, options) {
  const localHtml = html
    .replace(/<script src="protocol\.js[^"]*"><\/script>/, () => "<script>" + protocol + "</script>")
    .replace(/<script src="app\.js[^"]*"><\/script>/, () => "<script>" + app + "</script>");
  return new JSDOM(localHtml, {
    url: url || "https://example.org/app/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      const realTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => realTimeout(fn, Math.min(Number(ms) || 0, 20), ...args);
      window.setInterval = () => 1;
      window.clearInterval = () => {};
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => null;
      window.scrollTo = () => {};
      window.open = () => null;
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      window.URL.createObjectURL = () => "blob:test";
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () {};
      window.navigator.clipboard = { writeText: () => Promise.resolve() };

      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      const voices = [{ name: "Luciana (teste)", lang: "pt-BR", default: true }];
      window.speechSynthesis = {
        speaking: false,
        paused: false,
        onvoiceschanged: null,
        getVoices: () => voices,
        speak(utt) {
          const self = this;
          realTimeout(() => {
            self.speaking = true;
            if (utt.onstart) utt.onstart();
            realTimeout(() => {
              self.speaking = false;
              if (utt.onend) utt.onend();
            }, 5);
          }, 5);
        },
        cancel() { this.speaking = false; },
        resume() {},
        pause() {},
      };

      window.AudioContext = class {
        constructor() {
          this.state = "running";
          this.currentTime = 0;
          this.sampleRate = 8000;
          this.destination = audioNode();
        }
        resume() { this.state = "running"; }
        createGain() { return audioNode(); }
        createBiquadFilter() { return audioNode(); }
        createOscillator() { return audioNode(); }
        createBufferSource() { return audioNode(); }
        createBuffer(ch, len) {
          const data = new Float32Array(len);
          return { getChannelData: () => data, length: len, sampleRate: this.sampleRate };
        }
      };

      if (seed) {
        window.localStorage.setItem("audioswarm.v4.state", JSON.stringify(seed));
      }
      Object.keys(extra || {}).forEach((k) => window.localStorage.setItem(k, extra[k]));
      if (options && options.blockStorage) {
        Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
        Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
      }
      window.addEventListener("error", (e) => errors.push("window error: " + (e.message || e.error)));
      window.addEventListener("unhandledrejection", (e) => errors.push("unhandled rejection: " + e.reason));
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail || "" });
  if (!condition) console.log("FAIL:", name, detail || "");
}

function click(dom, sel) {
  const el = dom.window.document.querySelector(sel);
  if (!el) throw new Error("missing selector " + sel);
  el.click();
  return el;
}

function state(dom) {
  const raw = dom.window.localStorage.getItem("audioswarm.v4.state");
  return raw ? JSON.parse(raw) : null;
}

function dumpStorage(dom) {
  const out = {};
  const ls = dom.window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    out[k] = ls.getItem(k);
  }
  return out;
}

function seedState(over) {
  const now = new Date().toISOString();
  return Object.assign({
    version: 4,
    week: 3,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    settings: { voiceIndex: 0, noise: "rosa", level: 1, rate: 0.9 },
    dose: { date: now.slice(0, 10), seconds: 0 },
    createdAt: now,
  }, over || {});
}

async function assessmentFlow(dom) {
  click(dom, "#btnStartAssessment");
  await sleep(40);
  check("HHIE-S card appears", Boolean(dom.window.document.querySelector("#hhieArea")));

  for (let i = 0; i < 10; i++) {
    const group = dom.window.document.querySelector(`.hhie-options[data-q="${i}"]`);
    const btn = group.querySelector('button[data-val="2"]');
    btn.click();
  }
  await sleep(10);
  const submit = dom.window.document.querySelector("#btnSubmitHHIE");
  check("HHIE-S submit enabled", submit && !submit.disabled);
  submit.click();
  await sleep(40);
  check("speech test appears", Boolean(dom.window.document.querySelector("#speechArea")));

  for (let trial = 0; trial < 14; trial++) {
    click(dom, "#btnPlaySpeech");
    await sleep(90);
    const options = dom.window.document.querySelectorAll("#speechOptions button");
    if (!options.length) throw new Error("no speech options at trial " + trial);
    options[0].click();
    await sleep(40);
    if (dom.window.document.querySelector("#assessmentHistory")) { /* keep going */ }
  }
  await sleep(120);
  check("real-life block appears after the speech test", Boolean(dom.window.document.querySelector("#realLifeArea")));
  const rlStart = dom.window.document.querySelector("#btnStartRealLife");
  check("real-life block can be started", Boolean(rlStart));
  if (rlStart) rlStart.click();
  await sleep(40);
  for (let item = 0; item < 4; item++) {
    const play = dom.window.document.querySelector("#btnPlayRealLife");
    if (!play) throw new Error("no real-life play button at item " + item);
    play.click();
    await sleep(90);
    const opts = dom.window.document.querySelectorAll("#realLifeOptions button");
    if (!opts.length) throw new Error("no real-life options at item " + item);
    opts[0].click();
    await sleep(520);
  }
  await sleep(120);
  check("running-speech block appears after the long sentences", Boolean(dom.window.document.querySelector("#runningArea")));
  const rsStart = dom.window.document.querySelector("#btnStartRunning");
  check("running-speech block can be started", Boolean(rsStart));
  if (rsStart) rsStart.click();
  await sleep(40);
  const rsPlay = dom.window.document.querySelector("#btnPlayRunning");
  check("running speech offers a single listen", Boolean(rsPlay));
  if (rsPlay) rsPlay.click();
  await sleep(300);
  check("running speech asks before offering any replay", Boolean(dom.window.document.querySelector("#runningOptions")) &&
    !dom.window.document.querySelector("#btnRepeatRunning"));
  for (let q = 0; q < 4; q++) {
    const opts = dom.window.document.querySelectorAll("#runningOptions button");
    if (!opts.length) throw new Error("no running-speech options at question " + q);
    opts[0].click();
    await sleep(120);
  }
  await sleep(150);
  check("gap phase appears after the running-speech block", Boolean(dom.window.document.querySelector("#gapArea")));

  // 2 practice + 16 test trials
  for (let trial = 0; trial < 18; trial++) {
    const yes = dom.window.document.querySelector("#gapYes");
    if (!yes) throw new Error("no gap buttons at trial " + trial);
    yes.click();
    await sleep(60);
  }
  await sleep(120);
  check("assessment results appear", Boolean(dom.window.document.querySelector("#resultsArea")));
  const finish = dom.window.document.querySelector("#btnFinishAssessment");
  check("finish button exists", Boolean(finish));
  if (finish) finish.click();
  await sleep(80);

  const s = state(dom);
  check("baseline saved", s && s.baselineDone === true, JSON.stringify(s && { b: s.baselineDone, h: s.hhie.length, sp: s.speechTests.length, g: s.gapTests.length }));
  check("HHIE-S stored", s && s.hhie.length === 1);
  check("speech test stored", s && s.speechTests.length === 1);
  check("gap test stored", s && s.gapTests.length === 1);
  check("real-life comprehension stored", s && s.realLife && s.realLife.length === 1,
    JSON.stringify(s && (s.realLife || []).map(r => ({ set: r.set, p: r.percent, k: r.skipped }))));
  const rl = s && s.realLife && s.realLife[0];
  check("real-life uses set 1 at baseline", rl && String(rl.set) === "1", rl && String(rl.set));
  check("real-life is scored in percent, not a threshold", rl && typeof rl.percent === "number" && rl.percent >= 0 && rl.percent <= 100,
    rl && String(rl.percent));
  check("real-life is marked non-adaptive", rl && rl.adaptive === false);
  check("real-life keeps the four item ids", rl && rl.items.length === 4, rl && rl.items.join(","));
  const rs = s && s.runningSpeech && s.runningSpeech[0];
  check("running-speech comprehension stored", s && s.runningSpeech && s.runningSpeech.length === 1);
  check("running speech is scored in percent", rs && typeof rs.percent === "number" && rs.percent >= 0 && rs.percent <= 100, rs && String(rs.percent));
  check("running speech uses set 1 at baseline", rs && String(rs.set) === "1", rs && String(rs.set));
  check("running speech has no replay in the assessment", rs && rs.replays === 0);
  check("running speech records genre and tier", rs && rs.genre && rs.tier === "D2", rs && (rs.genre + "/" + rs.tier));
  click(dom, '[data-tab="vida"]');
  await sleep(60);
  const rlSummary = dom.window.document.querySelector("#realLifeSummary");
  check("the real-life card shows the percent, not a threshold", Boolean(rlSummary && /%/.test(rlSummary.textContent)),
    rlSummary && rlSummary.textContent.slice(0, 80));
  check("the real-life card keeps the percent caveat", Boolean(rlSummary && rlSummary.textContent.includes("não é limiar")));
  click(dom, '[data-tab="inicio"]');
  await sleep(20);
  check("week stays 1 after baseline", s && s.week === 1, s && String(s.week));
}

async function trainingFlow(dom) {
  click(dom, '[data-tab="treino"]');
  await sleep(20);
  const activeTab = dom.window.document.querySelector(".tab.active");
  check("active tab is announced", activeTab && activeTab.getAttribute("aria-current") === "page");
  click(dom, "#btnStartSession");
  await sleep(60);
  check("training card appears", Boolean(dom.window.document.querySelector("#btnPlayTraining")));
  const trainText = dom.window.document.querySelector("#trainingArea").textContent;
  check("training card localizes the noise", trainText.includes("Ruído rosa"), trainText.slice(0, 90));
  check("training card states the level rule", trainText.includes("3 acertos seguidos"));

  // warm-up + 8 core + closing (the closing may need a retry, but we answer correctly by trial)
  for (let i = 0; i < 11; i++) {
    const play = dom.window.document.querySelector("#btnPlayTraining");
    if (!play) break;
    play.click();
    await sleep(80);
    const options = dom.window.document.querySelectorAll("#trainingOptions button");
    if (!options.length) throw new Error("no training options at item " + i);
    options[0].click();
    await sleep(20);
    const next = dom.window.document.querySelector("#btnNextTraining");
    if (!next) throw new Error("no next button at item " + i);
    next.click();
    await sleep(40);
    if (dom.window.document.querySelector("#fatigueButtons")) break;
  }
  await sleep(40);
  check("training summary appears", Boolean(dom.window.document.querySelector("#fatigueButtons")));
  const beforeFatigue = state(dom);
  check("session saved before the fatigue answer", beforeFatigue && beforeFatigue.sessions.length === 1,
    beforeFatigue && String(beforeFatigue.sessions.length));
  check("fatigue starts empty and is filled later", beforeFatigue && beforeFatigue.sessions[0].fatigue === null);
  const fatigue = dom.window.document.querySelector('#fatigueButtons button[data-fatigue="2"]');
  if (fatigue) fatigue.click();
  await sleep(60);
  const s = state(dom);
  check("session saved", s && s.sessions.length === 1, s && JSON.stringify(s.sessions[0] && { a: s.sessions[0].accuracy, t: s.sessions[0].total }));
  check("fatigue updates the same record instead of duplicating it", s && s.sessions.length === 1 && s.sessions[0].fatigue === 2);
  check("dose recorded", s && s.dose && s.dose.seconds > 0);
}

async function reportFlow(dom) {
  click(dom, '[data-tab="relatorio"]');
  await sleep(20);
  click(dom, "#btnGenerateReport");
  await sleep(40);
  const report = dom.window.document.querySelector("#reportOut").textContent;
  check("report has performance indicators", report.includes("INDICADORES DE DESEMPENHO"));
  check("report has confidence section", report.includes("CONFIANÇA"));
  check("report has safety section", report.includes("SEGURANÇA"));
  check("report does not claim proof", report.includes("Não é prova de melhora"));
  const sessionText = dom.window.document.querySelector("#sessionTable").textContent;
  check("session table localizes the noise", sessionText.includes("Ruído rosa"), sessionText.slice(-80));

  click(dom, "#btnExportPackage");
  await sleep(40);
  const raw = dom.window.document.querySelector("#packageOut").value;
  let pkg = null;
  try { pkg = JSON.parse(raw); } catch (e) { /* ignore */ }
  check("package is valid JSON", Boolean(pkg));
  if (pkg) {
    check("package schema", pkg.schema === "audioswarm.v1.1");
    check("package limits", pkg.limits.dailySeconds === 600 && pkg.limits.calibratedDb === false);
    check("package has planning", Boolean(pkg.measurement && pkg.training && pkg.plan));
    check("package has gap stats", Array.isArray(pkg.gapStats) && pkg.gapStats.length === 1);
    check("package carries the exploratory real-life stats", Array.isArray(pkg.realLifeStats) && pkg.realLifeStats.length === 1,
      JSON.stringify(pkg.realLifeStats || null));
    check("real-life outcome is exported apart from the threshold",
      Array.isArray(pkg.outcomes && pkg.outcomes.real_life_comprehension) && pkg.outcomes.real_life_comprehension.length === 1);
    check("running-speech stats are exported", Array.isArray(pkg.runningStats) && pkg.runningStats.length === 1,
      JSON.stringify(pkg.runningStats || null));
    check("running speech has its own outcome key",
      Array.isArray(pkg.outcomes && pkg.outcomes.running_speech) && pkg.outcomes.running_speech.length === 1);
    check("package has sessions", pkg.sessions.length === 1);
    check("package storage mode", typeof pkg.storageMode === "string");
    check("package has v1.1 extras", Boolean(pkg.mods && pkg.outcomes && pkg.safety && pkg.protocol && typeof pkg.protocol.minutesPerDay === "number"));
  }
}

async function gapTrainingFlow() {
  const seed = {
    version: 4,
    week: 5,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "h", timepoint: "baseline", date: new Date().toISOString(), score: 20, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    settings: { voiceIndex: 0, noise: "restaurante", level: 2, rate: 0.95 },
    dose: { date: new Date().toISOString().slice(0, 10), seconds: 0 },
    createdAt: new Date().toISOString(),
  };
  const dom = makeDom(seed);
  await sleep(120);
  click(dom, '[data-tab="treino"]');
  await sleep(20);
  click(dom, "#btnStartSession");
  await sleep(60);
  // warm-up
  click(dom, "#btnPlayTraining");
  await sleep(80);
  dom.window.document.querySelectorAll("#trainingOptions button")[0].click();
  await sleep(20);
  click(dom, "#btnNextTraining");
  await sleep(50);
  check("week 5 gap block appears", Boolean(dom.window.document.querySelector("#btnPlayGapTraining")));
  const gapText = dom.window.document.querySelector("#trainingArea").textContent;
  check("gap training states its rule", gapText.includes("2 acertos seguidos") && gapText.includes("1 sem pausa"), gapText.slice(0, 160));
  for (let i = 0; i < 4; i++) {
    const play = dom.window.document.querySelector("#btnPlayGapTraining");
    if (!play) break;
    play.click();
    await sleep(30);
    click(dom, "#gapTrainYes");
    await sleep(40);
  }
  await sleep(80);
  check("gap block returns to core", Boolean(dom.window.document.querySelector("#trainingOptions") || dom.window.document.querySelector("#btnPlayTraining")));
  dom.window.close();
  return errors.length;
}

async function homeStartFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 2,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    settings: { voiceIndex: 0, noise: "rosa", level: 1, rate: 0.9 },
    dose: { date: now.slice(0, 10), seconds: 0 },
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(150);
  click(dom, "#btnStartTraining");
  await sleep(80);
  check("starting from home opens the training tab", !dom.window.document.querySelector("#tab-treino").classList.contains("hidden"));
  check("starting from home shows the first item", Boolean(dom.window.document.querySelector("#btnPlayTraining")));
  dom.window.close();
}

async function diaryFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 2,
    baselineDone: true,
    sessions: [],
    dose: { date: now.slice(0, 10), seconds: 0 },
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(160);
  const q = (sel) => dom.window.document.querySelector(sel);
  click(dom, '[data-tab="vida"]');
  await sleep(30);

  check("diary card shows the week", q("#diaryWeekLabel").textContent === "2", q("#diaryWeekLabel").textContent);
  check("diary starts empty", q("#diaryNote").value === "" && q("#diaryTv").value === "0");

  // type WITHOUT pressing the save button
  q("#diaryNote").value = "Entendeu o jornal melhor; no restaurante ainda pede repetição.";
  q("#diaryNote").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  q("#diaryTv").value = "3-5";
  q("#diaryTv").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await sleep(90);

  const afterTyping = state(dom);
  check("diary saves while typing, without the save button",
    Boolean(afterTyping && afterTyping.diary && afterTyping.diary["2"] && afterTyping.diary["2"].note),
    afterTyping && JSON.stringify(afterTyping.diary && afterTyping.diary["2"]));
  check("diary status is visible", /salvo/i.test(q("#diaryStatus").textContent || ""),
    q("#diaryStatus").textContent);

  // leave the tab and come back: the text must survive the re-render
  click(dom, '[data-tab="inicio"]');
  await sleep(20);
  click(dom, '[data-tab="vida"]');
  await sleep(30);
  check("diary survives a tab change", q("#diaryNote").value.includes("restaurante") && q("#diaryTv").value === "3-5",
    q("#diaryNote").value.slice(0, 40));

  // switching the week must not overwrite the previous week
  const sel = q("#weekSelect");
  sel.value = "3";
  sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await sleep(60);
  check("new week starts blank", q("#diaryNote").value === "" && q("#diaryWeekLabel").textContent === "3");
  q("#diaryNote").value = "Semana 3: conversa em grupo ainda difícil.";
  q("#diaryNote").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await sleep(90);
  sel.value = "2";
  sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await sleep(60);
  check("previous week keeps its own diary", q("#diaryNote").value.includes("jornal"), q("#diaryNote").value.slice(0, 40));
  const history = q("#diaryHistory").textContent.replace(/\s+/g, " ");
  check("saved weeks are listed", history.includes("Semana 3") || (history.includes("3") && history.includes("2")), history.slice(0, 90));

  const saved = state(dom);
  dom.window.close();

  // "turn the computer off": a fresh page with the same storage
  const dom2 = makeDom(saved);
  await sleep(170);
  const q2 = (sel) => dom2.window.document.querySelector(sel);
  click(dom2, '[data-tab="vida"]');
  await sleep(30);
  check("diary is still there after reopening the app", q2("#diaryNote").value.includes("jornal"),
    q2("#diaryNote").value.slice(0, 40));
  dom2.window.close();
}

async function diaryFlow() {
  const seed = seedState();
  const dom = makeDom(seed);
  await sleep(160);
  const d = dom.window.document;
  click(dom, '[data-tab="vida"]');
  await sleep(40);
  check("diary week selector exists", Boolean(d.querySelector("#diaryWeekSelect")));
  check("diary week label matches the app week", d.querySelector("#diaryWeekLabel").textContent === "3");

  // type and switch the machine off at once: no debounce time allowed
  const note = d.querySelector("#diaryNote");
  note.focus();
  note.value = "Entendeu o telejornal inteiro hoje.";
  note.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const typed = dumpStorage(dom);
  check("every keystroke writes a hot copy", Boolean(typed["audioswarm.v4.state.diary"]), Object.keys(typed).join(","));
  dom.window.close();

  const dom2 = makeDom(null, "https://example.org/app/", typed);
  await sleep(200);
  const d2 = dom2.window.document;
  click(dom2, '[data-tab="vida"]');
  await sleep(50);
  check("diary survives an immediate shutdown", d2.querySelector("#diaryNote").value === "Entendeu o telejornal inteiro hoje.",
    d2.querySelector("#diaryNote").value);
  check("recovered diary says so", d2.querySelector("#diaryStatus").textContent.includes("recuperada"));

  // finish the entry, then move the protocol to week 4
  d2.querySelector("#diaryTv").value = "3-5";
  d2.querySelector("#diaryTv").dispatchEvent(new dom2.window.Event("change", { bubbles: true }));
  await sleep(600);
  const savedWeek3 = state(dom2);
  check("diary stored under week 3", Boolean(savedWeek3.diary[3] && savedWeek3.diary[3].note), JSON.stringify(savedWeek3.diary));

  const weekSel = d2.querySelector("#weekSelect");
  weekSel.value = "4";
  weekSel.dispatchEvent(new dom2.window.Event("change", { bubbles: true }));
  await sleep(60);
  check("diary form shows the new week empty", d2.querySelector("#diaryNote").value === "", d2.querySelector("#diaryNote").value);
  check("old diary is still listed", d2.querySelector("#diaryHistory").textContent.includes("Entendeu o telejornal"));

  // go back to week 3 through the diary selector
  const diarySel = d2.querySelector("#diaryWeekSelect");
  diarySel.value = "3";
  diarySel.dispatchEvent(new dom2.window.Event("change", { bubbles: true }));
  await sleep(60);
  check("diary of week 3 comes back", d2.querySelector("#diaryNote").value === "Entendeu o telejornal inteiro hoje.");
  check("diary selector warns about a past week", d2.querySelector("#diaryWeekHint").textContent.includes("não da semana atual"));
  dom2.window.close();
}

async function diarySurvivesTrainingFlow() {
  const now = new Date().toISOString();
  const seed = seedState({
    diary: { 3: { tv: "3-5", conv: "1-2", fatigue: 4, note: "Jantar em família, entendi quase tudo.", date: now, updatedAt: now } },
  });
  const dom = makeDom(seed);
  await sleep(160);
  const d = dom.window.document;
  click(dom, '[data-tab="treino"]');
  await sleep(20);
  click(dom, "#btnStartSession");
  await sleep(60);
  for (let i = 0; i < 12; i++) {
    const play = d.querySelector("#btnPlayTraining");
    if (!play) break;
    play.click();
    await sleep(60);
    const opts = d.querySelectorAll("#trainingOptions button");
    if (!opts.length) break;
    opts[0].click();
    await sleep(20);
    const next = d.querySelector("#btnNextTraining");
    if (next) next.click();
    await sleep(40);
    if (d.querySelector("#fatigueButtons")) break;
  }
  click(dom, '[data-tab="vida"]');
  await sleep(50);
  check("training does not clear the diary", d.querySelector("#diaryNote").value === "Jantar em família, entendi quase tudo.",
    d.querySelector("#diaryNote").value);
  const s = state(dom);
  check("diary still in the state after a session", Boolean(s.diary[3] && s.diary[3].note), JSON.stringify(Object.keys(s.diary || {})));
  dom.window.close();
}

async function blockedStorageFlow() {
  const dom = makeDom(null, "https://example.org/app/", null, { blockStorage: true });
  await sleep(160);
  const d = dom.window.document;
  check("blocked storage is announced", !d.querySelector("#storageBanner").classList.contains("hidden"));
  check("blocked storage text is explicit", d.querySelector("#storageBanner").textContent.includes("bloqueando o armazenamento"));
  check("blocked storage badge is red", d.querySelector("#storageBadge").textContent.includes("memória"));
  check("blocked storage offers a backup", Boolean(d.querySelector("#btnStorageBackup")));
  dom.window.close();
}

async function draftResumeFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 3,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    settings: { voiceIndex: 0, noise: "rosa", level: 1, rate: 0.9 },
    dose: { date: now.slice(0, 10), seconds: 0 },
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(140);
  click(dom, '[data-tab="treino"]');
  await sleep(20);
  click(dom, "#btnStartSession");
  await sleep(60);
  // answer warm-up + two core items, then "reload" without finishing
  for (let i = 0; i < 3; i++) {
    click(dom, "#btnPlayTraining");
    await sleep(70);
    const opts = dom.window.document.querySelectorAll("#trainingOptions button");
    if (!opts.length) break;
    opts[0].click();
    await sleep(20);
    const next = dom.window.document.querySelector("#btnNextTraining");
    if (next) next.click();
    await sleep(40);
  }
  const draft = dom.window.localStorage.getItem("audioswarm.v4.state.draft");
  check("mid-session draft is written", Boolean(draft), draft ? String(draft.length) : "vazio");
  const parsed = draft ? JSON.parse(draft) : null;
  check("draft keeps the answered items", Boolean(parsed && parsed.results && parsed.results.length >= 2),
    parsed && String((parsed.results || []).length));
  dom.window.close();

  // new page: same localStorage contents, no in-memory training object
  const dom2 = makeDom(seed, "https://example.org/app/", { "audioswarm.v4.state.draft": draft });
  await sleep(160);
  const notice = dom2.window.document.querySelector("#resumeNotice");
  check("reload offers to resume the session", Boolean(notice && notice.textContent.includes("interrompida")),
    notice && notice.textContent.slice(0, 60));
  click(dom2, '[data-tab="treino"]');
  await sleep(30);
  const resumeBtn = dom2.window.document.querySelector("#resumeTrainingResume");
  check("training tab shows the resume card", Boolean(resumeBtn));
  if (resumeBtn) resumeBtn.click();
  await sleep(60);
  check("resumed session continues at the next item", Boolean(dom2.window.document.querySelector("#btnPlayTraining")));
  const resumed = state(dom2);
  check("resuming does not create a session yet", resumed && resumed.sessions.length === 0);
  dom2.window.close();
}

async function weekAdvanceFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 2,
    baselineDone: true,
    sessions: [1, 2, 3].map((i) => ({ id: "s" + i, date: now, week: 2, accuracy: 75, correct: 6, total: 8, startSnr: 8, endSnr: 6, moves: 1, fatigue: 2, durationSec: 240, noise: "rosa", level: 1, rate: 0.9, endedOnSuccess: true })),
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(140);
  const btn = dom.window.document.querySelector("#btnAdvanceWeek");
  check("advance button appears after a completed week", Boolean(btn));
  if (btn) btn.click();
  await sleep(40);
  const s = state(dom);
  check("week advances to 3", s && s.week === 3, s && String(s.week));
  dom.window.close();
}

async function week4AssessmentFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 4,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(140);
  const btn = dom.window.document.querySelector("#btnWeekAssessment");
  check("week 4 assessment button is visible", btn && !btn.classList.contains("hidden"), btn && btn.textContent);
  if (btn) btn.click();
  await sleep(60);
  check("week 4 assessment starts at HHIE-S", Boolean(dom.window.document.querySelector("#hhieArea")));
  dom.window.close();
}

async function realLifeSkipFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 4,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(160);
  click(dom, "#btnWeekAssessment");
  await sleep(60);
  for (let i = 0; i < 10; i++) {
    const group = dom.window.document.querySelector(`.hhie-options[data-q="${i}"]`);
    group.querySelector('button[data-val="2"]').click();
  }
  await sleep(10);
  dom.window.document.querySelector("#btnSubmitHHIE").click();
  await sleep(40);
  for (let trial = 0; trial < 14; trial++) {
    click(dom, "#btnPlaySpeech");
    await sleep(90);
    const options = dom.window.document.querySelectorAll("#speechOptions button");
    if (!options.length) throw new Error("no speech options at trial " + trial);
    options[0].click();
    await sleep(40);
  }
  await sleep(120);
  const skip = dom.window.document.querySelector("#btnSkipRealLife");
  check("real-life block offers a way out", Boolean(skip));
  if (skip) skip.click();
  await sleep(80);
  check("skipping real life moves on to the running-speech block", Boolean(dom.window.document.querySelector("#btnStartRunning")));
  const skipRun = dom.window.document.querySelector("#btnSkipRunning");
  check("running-speech block can be skipped", Boolean(skipRun));
  if (skipRun) skipRun.click();
  await sleep(80);
  check("skipping running speech moves on to the gap test", Boolean(dom.window.document.querySelector("#gapArea")));
  const s = state(dom);
  const rl = s && s.realLife && s.realLife[0];
  check("skipping is recorded, not hidden", rl && rl.skipped === true, rl && JSON.stringify({ k: rl.skipped, n: rl.scored }));
  check("a skipped block has no percent score", rl && rl.percent === null, rl && String(rl.percent));
  check("week 4 uses the second real-life set", rl && String(rl.set) === "2", rl && String(rl.set));
  const rsk = s && s.runningSpeech && s.runningSpeech[0];
  check("a skipped running block is recorded as skipped", rsk && rsk.skipped === true, rsk && JSON.stringify({ k: rsk.skipped }));
  check("skipped running block has no percent", rsk && rsk.percent === null, rsk && String(rsk.percent));
  check("skipping does not fake a speech threshold", s && s.speechTests.length === 1 && s.gapTests.length === 0);
  dom.window.close();
}

async function discourseFlow() {
  const now = new Date().toISOString();
  const seed = {
    version: 4,
    week: 3,
    baselineDone: true,
    sessions: [],
    hhie: [{ id: "hb", timepoint: "baseline", date: now, score: 22, band: "mild_to_moderate", answers: [2,2,2,2,2,2,2,2,2,2] }],
    createdAt: now,
  };
  const dom = makeDom(seed);
  await sleep(160);
  click(dom, '[data-tab="treino"]');
  await sleep(60);
  const card = dom.window.document.querySelector("#discourseCard");
  check("the running-text card exists in the training tab", Boolean(card));
  check("the running-text card explains that the audio does not stop", Boolean(card && card.textContent.includes("não para")));
  check("the running-text level follows the week", Boolean(card && card.textContent.includes("D2")), card && card.textContent.slice(0, 50));
  dom.window.document.querySelector("#btnStartDiscourse").click();
  await sleep(40);
  dom.window.document.querySelector("#btnPlayDiscourse").click();
  await sleep(260);
  check("the questions only show after the text ends", Boolean(dom.window.document.querySelector("#discourseOptions")));
  const repeatOff = !dom.window.document.querySelector("#btnRepeatDiscourse");
  check("no replay by default", repeatOff);
  for (let q = 0; q < 4; q++) {
    const opts = dom.window.document.querySelectorAll("#discourseOptions button");
    if (!opts.length) throw new Error("no discourse options at question " + q);
    opts[0].click();
    await sleep(700);
  }
  const done = dom.window.document.querySelector("#discourseCard").textContent;
  check("the running text ends with a score", done.includes("Texto corrido concluído"), done.slice(0, 80));
  const s = state(dom);
  const rec = s && s.discourse && s.discourse[0];
  check("running-text training is saved", Boolean(rec), JSON.stringify(rec));
  check("running-text record keeps replays and percent", Boolean(rec && typeof rec.percent === "number" && typeof rec.replays === "number"));
  check("running-text record is marked non-adaptive", Boolean(rec && rec.adaptive === false));

  click(dom, "#btnDiscourseClose");
  await sleep(40);
  click(dom, "#btnDiscourseHarder");
  await sleep(40);
  check("the level can be raised by hand", state(dom).discourseLevel === "D3", state(dom).discourseLevel);
  dom.window.close();
}

async function importFlow(dom) {
  const pkg = JSON.parse(dom.window.document.querySelector("#packageOut").value);
  pkg.protocol.week = 3;
  dom.window.applyPackage(JSON.stringify(pkg));
  await sleep(60);
  const afterPkg = state(dom);
  check("package import applies the week", afterPkg && afterPkg.week === 3, afterPkg && String(afterPkg.week));

  dom.window.localStorage.setItem("protocolo_swarm_v31", JSON.stringify({
    semana: 2,
    objetivos: ["objetivo antigo"],
    sessoes: [{ data: new Date().toISOString(), semana: 1, acertos: 7, total: 10, porcentagem: 70, ruido: "rosa", velocidade: 0.9 }],
  }));
  click(dom, "#btnLegacy");
  await sleep(60);
  const afterLegacy = state(dom);
  check("legacy import appends a session", afterLegacy && afterLegacy.sessions.length === 2, afterLegacy && String(afterLegacy.sessions.length));
  check("legacy objective stored", afterLegacy && afterLegacy.legacyObjectives.length === 1);
}

async function demoFlow() {
  const dom = makeDom(null, "https://example.org/app/?demo=2");
  await sleep(160);
  check("demo banner visible", !dom.window.document.querySelector("#demoBanner").classList.contains("hidden"));
  check("demo banner offers an exit", Boolean(dom.window.document.querySelector("#exitDemo")));
  check("demo opens the report", !dom.window.document.querySelector("#tab-relatorio").classList.contains("hidden"));
  check("demo has seeded sessions", dom.window.document.querySelector("#sessionTable").textContent.includes("2026"));
  const changes = dom.window.document.querySelector("#changesTable").textContent;
  check("change table marks direction", changes.includes("melhor"), changes.slice(0, 120));
  check("demo change table explains the direction", changes.includes("menor é melhor"));
  const report = dom.window.document.querySelector("#reportOut").textContent;
  check("demo generates the report", report.includes("INDICADORES DE DESEMPENHO") && report.length > 800, String(report.length));
  dom.window.close();

  const planDom = makeDom(null, "https://example.org/app/?demo=3");
  await sleep(180);
  const plan = planDom.window.document.querySelector("#protocolOut").textContent;
  check("demo builds the protocol", plan.includes("Plano de medição") && plan.includes("A5_safety"), String(plan.length));
  check("the protocol tab shows the sentence ladder", plan.includes("Conteúdo das frases") && plan.includes("N4"), String(plan.length));
  planDom.window.close();
}

(async () => {
  const dom = makeDom(null);
  await sleep(150);
  check("no page errors on load", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("engine loaded", Boolean(dom.window.SwarmEngine && dom.window.SwarmEngine.buildProtocol));
  check("home summary rendered", (dom.window.document.querySelector("#planSummary").textContent || "").length > 20);
  check("four level cards", dom.window.document.querySelectorAll("#levelCards .card").length === 4);
  check("seven tabs", dom.window.document.querySelectorAll(".tab").length === 7);
  check("voice available badge", (dom.window.document.querySelector("#voiceBadge").textContent || "").includes("voz"));

  await assessmentFlow(dom);
  await trainingFlow(dom);
  await reportFlow(dom);
  await importFlow(dom);
  const afterErrors = errors.slice();
  check("no runtime errors after flows", afterErrors.length === 0, afterErrors.slice(0, 5).join(" | "));

  await gapTrainingFlow();
  await draftResumeFlow();
  await blockedStorageFlow();
  await diaryFlow();
  await homeStartFlow();
  await diaryFlow();
  await diarySurvivesTrainingFlow();
  await weekAdvanceFlow();
  await week4AssessmentFlow();
  await realLifeSkipFlow();
  await discourseFlow();
  await demoFlow();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== RESULTS ===");
  results.forEach((r) => console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.detail ? "  [" + r.detail + "]" : "")));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
  console.log("errors:", errors.slice(0, 10));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  console.error("page errors:", errors);
  process.exit(2);
});
