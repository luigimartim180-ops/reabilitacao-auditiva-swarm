/* Prova ponta a ponta de persistência: app real (app/) + servidor real (tools/serve.py).
 *
 * Diferente de tools/smoke_app.js, aqui o fetch vai DE VERDADE para o servidor,
 * então isso testa o caminho inteiro: localStorage -> POST /api/state -> arquivo
 * em disco -> GET /api/state -> adoção numa origem nova (localStorage vazio).
 * É exatamente o cenário "o servidor caiu e a URL mudou".
 *
 * Uso:
 *   1. make serve            (ou python3 tools/serve.py --port 12000)
 *   2. make e2e-sync         (precisa de jsdom: NODE_PATH=... node tools/...)
 *
 * Cuidado: grava em data/app-state.json. O script zera o estado no começo.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.AUDIOSWARM_BASE || "http://localhost:12000";
const html = fs.readFileSync(path.join(ROOT, "app/index.html"), "utf8");
const protocol = fs.readFileSync(path.join(ROOT, "app/protocol.js"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");

const errors = [];
function audioNode() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: "sine", buffer: null, loop: false };
}

function makeDom(origin) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e && e.message)));
  const localHtml = html
    .replace(/<script src="protocol\.js[^"]*"><\/script>/, () => "<script>" + protocol + "</script>")
    .replace(/<script src="app\.js[^"]*"><\/script>/, () => "<script>" + app + "</script>");
  return new JSDOM(localHtml, {
    url: origin,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      const realTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => realTimeout(fn, Math.min(Number(ms) || 0, 25), ...args);
      window.setInterval = () => 1;
      window.clearInterval = () => {};
      window.alert = () => {};
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      window.speechSynthesis = {
        speaking: false, paused: false, onvoiceschanged: null,
        getVoices: () => [{ name: "Luciana", lang: "pt-BR", default: true }],
        speak(u) { const s = this; realTimeout(() => { s.speaking = true; if (u.onstart) u.onstart(); realTimeout(() => { s.speaking = false; if (u.onend) u.onend(); }, 5); }, 5); },
        cancel() { this.speaking = false; }, resume() {}, pause() {},
      };
      window.AudioContext = class {
        constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = audioNode(); }
        resume() {} createGain() { return audioNode(); } createBiquadFilter() { return audioNode(); }
        createOscillator() { return audioNode(); } createBufferSource() { return audioNode(); }
        createBuffer(c, l) { const d = new Float32Array(l); return { getChannelData: () => d, length: l, sampleRate: 8000 }; }
      };
      // fetch real apontando para o servidor de verdade
      window.fetch = (url, opts) => fetch(new URL(url, BASE).toString(), opts);
      window.navigator.sendBeacon = () => false;
      window.addEventListener("error", (e) => errors.push("err: " + (e.message || e.error)));
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d) => out.push((ok ? "PASS  " : "FAIL  ") + n + (d ? "  [" + d + "]" : ""));

(async () => {
  // limpa o estado do servidor para o teste ser determinístico
  await fetch(BASE + "/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: {}, savedAt: "1970-01-01T00:00:00Z" }) });

  const domA = makeDom("https://origem-a.example/app/");
  await sleep(400);
  const lineA = domA.window.document.querySelector("#syncStatus").textContent;
  check("origem A detecta a API do servidor", lineA.includes("Cópia no servidor ativa"), lineA.slice(0, 60));

  // avança a semana pela interface (isso chama save() -> POST)
  domA.window.document.querySelector('[data-tab="ajustes"]').click();
  await sleep(80);
  const sel = domA.window.document.querySelector("#weekSelect");
  sel.value = "4";
  sel.dispatchEvent(new domA.window.Event("change"));
  await sleep(300);
  const stA = JSON.parse(domA.window.localStorage.getItem("audioswarm.v4.state"));
  check("origem A salvou a semana 4", stA && stA.week === 4, stA && String(stA.week));
  domA.window.close();

  const saved = await (await fetch(BASE + "/api/state")).json();
  check("o servidor recebeu a semana 4", saved && saved.state && saved.state.week === 4, JSON.stringify(saved && saved.state && saved.state.week));

  // "servidor caiu e a URL mudou": origem nova, localStorage vazio
  const domB = makeDom("https://origem-b.example/app/");
  await sleep(500);
  const stB = JSON.parse(domB.window.localStorage.getItem("audioswarm.v4.state") || "null");
  check("origem B (vazia) adota o progresso do servidor", stB && stB.week === 4, stB && String(stB.week));
  const selB = domB.window.document.querySelector("#weekSelect").value;
  check("a interface já abre na semana recuperada", selB === "4", selB);
  domB.window.close();

  console.log(out.join("\n"));
  console.log(errors.length ? "ERRORS: " + errors.slice(0, 3).join(" | ") : "sem erros de página");
  process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
})();
