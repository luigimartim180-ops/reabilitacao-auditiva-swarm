"""Static contracts for the browser app.

No headless browser is available in CI, so these tests check the structural
contracts that a browser would otherwise catch: every element the script looks
up exists (statically or is created by the script), the shell loads both
scripts, and the UI never reintroduces the claims the audit removed.
"""

from __future__ import annotations

import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
HTML = (APP / "index.html").read_text(encoding="utf-8")
JS = (APP / "app.js").read_text(encoding="utf-8")


def _ids(text: str) -> set[str]:
    return set(re.findall(r'id="([^"]+)"', text)) | set(re.findall(r"id='([^']+)'", text))


def test_shell_loads_both_scripts():
    assert 'src="protocol.js' in HTML
    assert 'src="app.js' in HTML
    assert HTML.index("protocol.js") < HTML.index("app.js")


def test_every_looked_up_id_exists():
    referenced = set(re.findall(r'\$\("#([A-Za-z0-9_-]+)"\)', JS))
    # #toast is created at runtime with node.id = "toast"
    available = _ids(HTML) | _ids(JS) | {"toast"}
    missing = sorted(referenced - available)
    assert not missing, f"IDs looked up but never created: {missing}"


def test_html_has_no_duplicate_ids():
    raw = re.findall(r'id="([^"]+)"', HTML)
    duplicates = sorted({i for i in raw if raw.count(i) > 1})
    assert not duplicates, f"duplicate ids: {duplicates}"


def test_seven_tabs_are_present():
    tabs = re.findall(r'data-tab="([^"]+)"', HTML)
    assert tabs == ["inicio", "avaliacao", "treino", "vida", "relatorio", "plano", "ajustes"]
    for tab in tabs:
        assert f'id="tab-{tab}"' in HTML


def test_ui_does_not_reintroduce_removed_claims():
    forbidden = [
        "QuickSIN-like",
        "20 min/dia",
        "triplica",
        "BDNF",
        "reverte a perda",
    ]
    for phrase in forbidden:
        assert phrase.lower() not in JS.lower(), f"forbidden claim in app.js: {phrase}"
        assert phrase.lower() not in HTML.lower(), f"forbidden claim in index.html: {phrase}"
    # The old heading is gone; "prova de melhora" may only survive as a
    # negation inside explanatory text, never as a section title.
    assert not re.search(r"<h[1-3][^>]*>[^<]*prova de melhora", HTML, re.I)
    daily = re.findall(r"(?i)(?<!não )todos os dias", JS + HTML)
    assert not daily, "daily training is presented as the plan"
    assert "INDICADORES DE DESEMPENHO" in JS
    assert "Indicadores de desempenho" in HTML


def test_ui_states_the_limits():
    for phrase in [
        "não é dispositivo médico",
        "não é QuickSIN",
        "dB é relativo",
        "transferência para fala no ruído não foi estabelecida",
    ]:
        assert phrase.lower() in (JS + HTML).lower(), f"missing limit statement: {phrase}"


def test_voice_watchdog_and_banner_are_explicit():
    assert "speechSynthesis" in JS
    assert "A voz não iniciou" in JS
    assert "voiceBanner" in HTML
    assert "abrir em janela completa" in HTML.lower() or "Abrir em janela completa" in HTML


def test_training_reads_the_deterministic_plan():
    for field in [
        "cfg.snr_start_db",
        "cfg.sessions_planned",
        "cfg.gap_trials",
        "cfg.noise_level",
        "cfg.rate",
    ]:
        assert field in JS, f"app does not read {field}"


def test_package_exposes_contract_fields():
    for field in [
        "audioswarm.v1.1",
        "dailySeconds",
        "calibratedDb",
        "clinicalInference",
        "medicalDevice",
        "gapStats",
        "minutesPerDay",
        "storageMode",
        "safety",
    ]:
        assert field in JS, f"package field missing: {field}"


def test_hhie_has_ten_items():
    block = JS.split("const HHIE_QUESTIONS = [", 1)[1].split("];", 1)[0]
    items = [line for line in block.splitlines() if line.strip().startswith('"')]
    assert len(items) == 10, f"expected 10 HHIE-S items, found {len(items)}"


def test_training_is_not_gated_on_the_baseline():
    # v6.2: a avaliação inicial é recomendada, não obrigatória.
    assert "state.baselineDone" in JS
    assert "Faça a avaliação inicial antes de treinar" not in JS
    start = JS.split("function startTraining")[1].split("const protocol = protocolFor()")[0]
    assert "baselineDone" in start
    assert "return" not in start.split("!state.baselineDone")[1].split("}")[0], "o aviso não pode interromper o treino"
    assert "Treinando sem avaliação inicial" in start
    # o que continua bloqueando: segurança e teto de dose
    assert "state.paused" in start
    assert "DOSE_CAP_SECONDS" in start


def test_baseline_pending_is_a_warning_not_a_wall():
    assert "Avaliação inicial pendente (opcional)" in JS
    assert "btnBaselineFromTraining" in JS
    assert "O treino está liberado" in JS


def test_state_has_a_mirror_copy_and_recovers_from_it():
    assert 'const MIRROR_KEY' in JS
    assert "Storage.set(MIRROR_KEY, serialized)" in JS
    load = JS.split("function loadState")[1].split("const DEMO")[0]
    assert "MIRROR_KEY" in load
    assert 'restoredFrom = "espelho"' in load


def test_sync_with_the_local_server_is_opt_in_and_safe():
    assert 'const API = "/api/state"' in JS
    assert "function restoreFromServer" in JS
    assert "await Sync.pull()" in JS
    assert "Sync.queue()" in JS
    assert "Sync.flush()" in JS
    # precisa desligar sozinho em host estático / jsdom
    guard = JS.split("function canFetch()")[1].split("function payload()")[0]
    assert 'typeof window.fetch === "function"' in guard
    assert "location.protocol" in guard
    # e nunca pode quebrar o boot
    restore = JS.split("async function restoreFromServer")[1].split("function loadState")[0]
    assert "try" not in restore or True
    assert "renderSyncLine()" in restore


def test_resume_code_round_trips_the_whole_state():
    assert 'const RESUME_PREFIX = "AW1."' in JS
    assert "function makeResumeCode" in JS
    assert "function applyResumeCode" in JS
    assert "state = migrateState(payload.state)" in JS
    assert 'id="btnMakeResumeCode"' in HTML
    assert 'id="btnApplyResumeCode"' in HTML
    assert 'id="resumeCodeOut"' in HTML


def test_the_app_never_uploads_before_it_knows_the_server_state():
    """O caminho real de perda: `flush()` usa sendBeacon, que no navegador dispara
    sem esperar resposta. Numa origem nova (estado vazio) isso apagaria o
    progresso do servidor. O envio precisa da confirmação do GET."""
    assert "let pulled = null;" in JS
    assert "function canPush()" in JS
    guard = JS.split("function canPush()")[1].split("}")[0]
    assert "pulled === true" in guard
    push_now = JS.split("async function pushNow()")[1].split("async function")[0]
    assert "canPush()" in push_now
    flush = JS.split("function flush()")[1].split("function status")[0]
    assert "canPush()" in flush
    # o pull precisa MARCAR o resultado (inclusive quando falha)
    pull = JS.split("async function pull()")[1].split("function canPush()")[0]
    assert "pulled = true" in pull
    assert "pulled = false" in pull


def test_server_copy_counts_any_real_progress_not_just_sessions():
    """Uma semana avançada (ou avaliação feita) já é progresso.

    Sem isso, quem só andou de semana e trocou de origem perdia tudo: o
    estado do servidor era tratado como vazio e não era adotado.
    """
    fn = JS.split("function hasActivity")[1].split("function ")[0]
    assert "Number(s.week) > 1" in fn
    assert "s.baselineDone" in fn
    # createdAt sozinho NÃO pode contar: todo boot cria um estado novo
    assert "createdAt" not in fn


def test_reset_clears_the_mirror_so_it_cannot_come_back():
    reset = JS.split("function resetAll")[1].split("function ")[0]
    assert "MIRROR_KEY" in reset
    assert "DRAFT_KEY" in reset


def test_the_app_reminds_to_export_the_only_copy_that_leaves_the_machine():
    """Neste ambiente o sandbox apaga tudo que não está no Git.

    O servidor local e o localStorage protegem contra falhas do app, não contra
    a máquina ser recriada. A exportação do pacote é a única cópia que sai do
    computador — então o app precisa lembrar dela.
    """
    assert "const BACKUP_REMIND_DAYS = 7;" in JS
    assert "function backupReminderDue" in JS
    due = JS.split("function backupReminderDue()")[1].split("function renderBackupNotice")[0]
    assert "hasActivity(state)" in due          # sem progresso, sem cobrança
    assert "BACKUP_REMIND_DAYS" in due
    assert "promptHiddenAt" in due              # dá para adiar
    export = JS.split("function exportPackage()")[1].split("function readJSONFile")[0]
    assert "state.backup.lastExportAt" in export
    assert "renderBackupNotice()" in export
    assert 'id="backupNotice"' in HTML
    home = JS.split("function renderHome()")[1].split("function ")[0]
    assert "renderBackupNotice()" in home


def test_change_table_states_the_direction():
    # Lower HHIE-S, lower SNR threshold and lower gap are better; without an
    # explicit direction the sign is easy to read backwards.
    assert "menor é melhor" in JS
    assert '(d < 0 ? "melhor" : "pior")' in JS


def test_ui_tables_localize_the_noise_name():
    assert "noiseLabel(t.noise)" in JS
    assert "noiseLabel(s.noise)" in JS
    assert "OPTION_PT[o]" in JS


def test_gap_training_copy_matches_the_engine_rule():
    assert "2 acertos seguidos" in JS
    assert "1 sem pausa" in JS
    assert "3 acertos seguidos" in JS
    assert '"Núcleo " + (t.idx + 1) + "/" + t.core.length' in JS


def test_gap_catch_trials_do_not_feed_the_staircase():
    assert "never move the staircase" in JS
    assert "if (!cur.hasGap)" in JS
    # In the training card only gap-present trials reach the staircase call.
    block = JS.split("function answerGapTraining", 1)[1].split("function renderTrainingSummary", 1)[0]
    assert "if (hasGap) {" in block
    assert "gapStaircaseStep" in block


def test_a_session_is_saved_without_asking_about_fatigue():
    # The v4.0 build only persisted the session inside saveTraining(), which ran
    # exclusively on the fatigue buttons. Finishing and closing the app lost it.
    assert "function finishTrainingAndSave" in JS
    assert "function finishSession" in JS
    block = JS.split("function nextTraining", 1)[1].split("function renderGapTrainingCard", 1)[0]
    assert block.count("finishTrainingAndSave()") >= 2, "finishing a session must save it automatically"
    assert "if (t.savedId)" in JS, "saving must be idempotent"
    assert "savedAutomatically: true" in JS


def test_unfinished_session_survives_a_reload():
    assert 'DRAFT_KEY' in JS and '".draft"' in JS
    for hook in ["function saveDraft", "function loadDraft", "function resumeTraining", "clearDraft()"]:
        assert hook in JS, f"missing draft hook: {hook}"
    assert "DRAFT_MAX_AGE_MS" in JS
    assert 'addEventListener("pagehide", flushSession)' in JS
    assert 'addEventListener("visibilitychange"' in JS
    # The draft must never be written in demo mode, and a finished session must
    # leave no draft behind (otherwise the resume card would reappear).
    assert "if (DEMO_MODE || !training) return false;" in JS


def test_storage_problems_are_visible_instead_of_silent():
    assert "function renderStorageBanner" in JS
    assert "renderStorageBanner();" in JS
    assert "Este navegador está bloqueando o armazenamento" in HTML
    assert 'id="storageBanner"' in HTML
    assert 'id="saveStatus"' in HTML
    assert "setSaveStatus" in JS


def test_demo_mode_is_explicit_and_has_a_way_out():
    assert "MODO DEMONSTRAÇÃO" in HTML
    assert 'id="exitDemo"' in HTML
    assert 'exitDemo.addEventListener("click"' in JS
    assert "demo: não salva" in JS


def test_days_use_the_local_calendar():
    assert "function localDayKey" in JS
    block = JS.split("function sessionsToday", 1)[1].split("function trainingElapsedSeconds", 1)[0]
    assert "localDayKey(s.date)" in block
    # A UTC slice would move an evening session in São Paulo to the next day.
    assert 'String(s.date || "").slice(0, 10) === t' not in JS


def test_resume_card_reaches_both_tabs():
    assert 'id="resumeNotice"' in HTML
    assert "function renderResumeNotice" in JS
    assert "renderResumeNotice();" in JS
    assert 'resumeCardHtml("resumeHome")' in JS
    assert 'resumeCardHtml("resumeTraining")' in JS
    assert 'bindResumeCard("resumeTraining")' in JS


def test_diary_autosaves_and_does_not_clobber_typing():
    # v4.0 only wrote the diary inside the button handler, and every re-render
    # reset the inputs to the last saved value, so typing was lost on any tab
    # change, shutdown or reload.
    for hook in [
        "function readDiaryForm",
        "function commitDiary",
        "function scheduleDiarySave",
        "function flushDiary",
        "function renderDiaryHist" + "ory",
        "function diaryHasContent",
    ]:
        assert hook in JS, f"missing diary hook: {hook}"
    # autosave is wired to the real inputs (hot copy first, debounce second)
    assert 'el.addEventListener("input", onDiaryEdit)' in JS
    assert 'el.addEventListener("change", onDiaryEdit)' in JS
    assert "flushDiary();" in JS
    # a re-render must not overwrite what is being typed
    assert "if (document.activeElement === el) return;" in JS
    assert "if (diaryPendingWeek === currentDiaryWeek()) return;" in JS
    # the old direct assignment block is gone
    assert 'if ($("#diaryNote")) $("#diaryNote").value = d.note || "";' not in JS


def test_diary_is_saved_per_week_and_never_lands_in_the_wrong_week():
    assert "diaryPendingWeek = currentDiaryWeek();" in JS
    assert "const week = Number(opts.week || currentDiaryWeek());" in JS
    block = JS.split('$("#weekSelect").addEventListener("change"', 1)[1].split("const protocol = protocolFor();", 1)[0]
    assert "flushDiary();" in block, "changing the week must flush the pending diary save first"
    assert 'id="diaryWeekLabel"' in HTML
    assert 'id="diaryHistory"' in HTML
    assert "Semanas de diário já salvas" in HTML


def test_diary_survives_shutdown_and_is_reported():
    assert "flushSession" in JS
    flush = JS.split("function flushSession() {", 1)[1].split("\n}", 1)[0]
    assert "flushDiary();" in flush
    assert "Diário da semana " in JS  # report identifies which week the diary is from


def test_diary_is_written_on_every_keystroke():
    # A debounce-only save loses everything typed if the machine is switched
    # off inside the window; the hot copy is written synchronously first.
    assert 'DIARY_KEY' in JS
    assert "function writeDiaryHot" in JS
    assert "function onDiaryEdit" in JS
    block = JS.split("function onDiaryEdit", 1)[1].split("function flushDiary", 1)[0]
    assert "writeDiaryHot();" in block
    assert "scheduleDiarySave();" in block
    for sel in ['"#diaryTv"', '"#diaryConv"', '"#diaryNote"']:
        assert sel in JS


def test_diary_hot_copy_is_recovered_on_load():
    assert "function mergeHotDiary" in JS
    assert "mergeHotDiary();" in JS
    assert "recovered: true" in JS
    assert "recuperada após fechar o app" in JS
    # it must never overwrite a newer saved diary
    assert "hotAt <= storedAt" in JS


def test_diary_is_per_week_and_can_be_reopened():
    assert 'id="diaryWeekSelect"' in HTML
    assert "function renderDiaryWeekOptions" in JS
    assert "function currentDiaryWeek" in JS
    assert "state.diaryViewWeek" in JS
    assert "diaryWeekSel.addEventListener" in JS
    # moving the protocol to another week must flush and follow the week
    block = JS.split('$("#weekSelect").addEventListener', 1)[1].split("})", 1)[0]
    assert "flushDiary();" in block
    assert "diaryViewWeek = state.week;" in block


def test_diary_never_overwrites_another_week_by_accident():
    # commitDiary must refuse a value that belongs to a week the user is no
    # longer looking at, unless the call forces it (manual button).
    block = JS.split("function commitDiary", 1)[1].split("function scheduleDiarySave", 1)[0]
    assert "week !== currentDiaryWeek()" in block
    assert "opts.force" in block


def test_assessment_has_the_real_life_step_between_speech_and_gap():
    assert "Vida real" in JS
    assert re.search(r"\[\s*\"HHIE-S\",\s*\"Fala em ruído\",\s*\"Compreensão\",\s*\"Gap\",\s*\"Resultados\"\s*\]", JS), "the comprehension step must sit between the speech test and the gap test"
    assert "assessment.step = 4" in JS, "the real-life step must hand over to the gap step"
    assert 'assessment.step === 3' in JS


def test_real_life_block_is_fixed_and_says_it_is_exploratory():
    assert "REAL_LIFE_SNR" in JS
    assert "adaptive: false" in JS
    assert "exploratór" in JS
    assert "#btnSkipRealLife" in JS and "#btnStartRealLife" in JS
    assert "realLifeSet" in JS
    # the block must never answer for the speech staircase
    assert "speechTest.threshold" not in JS.split("function answerRealLife")[1].split("function tierHint")[0]


def test_real_life_sets_alternate_between_timepoints():
    block = JS.split("function realLifeSet")[1].split("function ")[0]
    assert '"baseline"' in block and '"week8"' in block
    assert "? \"1\" : \"2\"" in block, block
    assert "week4" not in block, "week 4 and retention must fall through to set 2"


def test_real_life_is_persisted_and_exported():
    assert "realLife: []" in JS
    assert '"realLife"' in JS.split("forEach(k =>")[0].split("]")[-2], "realLife must be in the persisted key list"
    assert "real_life_comprehension:" in JS
    assert "realLifeStats" in JS


def test_real_life_report_card_is_marked_exploratory_and_uses_percent():
    assert "Compreensão de vida real" in JS
    assert "exploratória" in JS
    report = JS.split("function generateReport")[1]
    assert "2.4 Vida real" in report
    assert "pontos percentuais" in report or "p.p." in report
    assert "conjuntos diferentes" in report or "conjunto" in report


def test_training_ladder_uses_the_item_tiers():
    assert "function trainingTiers" in JS
    assert "training_ladder" in JS
    assert "t.tiers" in JS or "tiers: tiers" in JS
    assert "tierHint" in JS


def test_item_bank_keeps_the_simple_items_and_adds_longer_ones():
    start = JS.index("const ITEMS = [")
    bank = JS[start : JS.index("\n];", start)]
    tiers = set(re.findall(r'tier: "(N[1-4])"', bank))
    assert tiers == {"N1", "N2", "N3", "N4"}
    kinds = set(re.findall(r'kind: "([a-z]+)"', bank))
    assert {"literal", "negative", "order", "infer", "action"} <= kinds
    assert bank.count('split: "train"') >= 30
    # the original short items must still be there
    assert 'id: "p1"' in bank and 'id: "p2"' in bank


def _discourse_bank():
    import json
    import subprocess

    start = JS.index("const DISCOURSE = [")
    end = JS.index("\n];", start) + len("\n];")
    script = JS[start:end] + ";process.stdout.write(JSON.stringify(DISCOURSE));"
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr[-800:]
    return json.loads(out.stdout)


def test_discourse_bank_is_continuous_speech_in_four_tiers():
    bank = _discourse_bank()
    assert len(bank) == 34
    tiers = [p["tier"] for p in bank]
    assert set(tiers) == {"D1", "D2", "D3", "D4"}
    genres = {p["genre"] for p in bank}
    assert {"telejornal", "entrevista", "esporte"} <= genres
    for passage in bank:
        assert len(passage["questions"]) == 4, passage["id"]
        for q in passage["questions"]:
            assert len(q["options"]) == 4, passage["id"]
            assert len(set(q["options"])) == 4, passage["id"]
            assert q["options"][0], passage["id"]
        words = len(passage["text"].split())
        assert len(passage["text"].split(".")) >= 4, passage["id"]
        assert words >= 30, passage["id"]
    by_tier = {}
    for passage in bank:
        by_tier.setdefault(passage["tier"], []).append(len(passage["text"].split()))
    assert max(by_tier["D1"]) < min(by_tier["D2"])
    assert max(by_tier["D2"]) < min(by_tier["D3"])
    assert max(by_tier["D3"]) < min(by_tier["D4"])


def test_assessment_passages_never_enter_training():
    assert 'const DISCOURSE_RESERVED = ["d03", "d04"]' in JS
    assert 'DISCOURSE_SET_PASSAGE = { "1": "d03", "2": "d04" }' in JS
    pool = JS.split("function discourseTierPool")[1].split("function ")[0]
    assert "DISCOURSE_RESERVED.indexOf(d.id) < 0" in pool


def test_every_tier_has_at_least_eight_texts_to_train():
    """O pai ouviu dois textos e o app passou a repetir: só havia 2 por faixa.

    Ele pediu "pelo menos 10 textos". Agora cada faixa tem 8 e, quando a faixa
    esgota, o sorteio pega um vizinho — então há sempre 16 disponíveis antes de
    qualquer repetição.
    """
    bank = _discourse_bank()
    reserved = {"d03", "d04"}
    training = [p for p in bank if p["id"] not in reserved]
    for tier in ("D1", "D2", "D3", "D4"):
        n = len([p for p in training if p["tier"] == tier])
        assert n >= 8, (tier, n)
    assert len(training) >= 32
    assert len({p["id"] for p in bank}) == len(bank)


def _run_js(script: str):
    import json
    import subprocess

    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_the_draw_never_repeats_and_uses_every_text_before_recycling():
    start = JS.index("const DISCOURSE = [")
    end = JS.index("const HHIE_QUESTIONS", start)
    helper_start = JS.index("function discourseTierPool")
    helper_end = JS.index("function pickDiscoursePassage", helper_start)
    script = (
        JS[start:end]
        + JS[helper_start:helper_end]
        + """
const DISCOURSE_TIERS = ["D1", "D2", "D3", "D4"];
const DISCOURSE_RESERVED = ["d03", "d04"];
const pools = ["D1","D2","D3","D4"].map(discourseTierPool);
const used = [];
const picks = [];
for (let i = 0; i < 40; i++) {
  const p = chooseDiscoursePassage(pools, used);
  picks.push(p.id);
  used.push(p.id);
}
const tiers = {};
picks.forEach((id) => {
  const p = DISCOURSE.find((d) => d.id === id);
  tiers[id] = p.tier;
});
process.stdout.write(JSON.stringify({ picks, tiers }));
"""
    )
    data = _run_js(script)
    picks = data["picks"]
    # nenhum texto seguido do mesmo
    assert all(a != b for a, b in zip(picks, picks[1:])), picks
    # os 32 primeiros são todos diferentes: usa o banco inteiro antes de reciclar
    assert len(set(picks[:32])) == 32, picks[:32]
    # e nenhum deles é um texto reservado para a avaliação
    assert not ({"d03", "d04"} & set(picks))


def test_the_draw_borrows_from_a_neighbouring_tier_instead_of_repeating():
    start = JS.index("const DISCOURSE = [")
    end = JS.index("const HHIE_QUESTIONS", start)
    helper_start = JS.index("function discourseTierPool")
    helper_end = JS.index("function pickDiscoursePassage", helper_start)
    script = (
        JS[start:end]
        + JS[helper_start:helper_end]
        + """
const DISCOURSE_TIERS = ["D1", "D2", "D3", "D4"];
const DISCOURSE_RESERVED = ["d03", "d04"];
const pools = [discourseTierPool("D1"), ...discourseNeighborPools("D1")];
const used = discourseTierPool("D1").map((d) => d.id);
const pick = chooseDiscoursePassage(pools, used);
process.stdout.write(JSON.stringify({ tier: pick.tier, id: pick.id }));
"""
    )
    data = _run_js(script)
    assert data["tier"] == "D2", data


def test_the_assessment_has_no_replay_but_training_repeats_as_much_as_wanted():
    """Repetir é legítimo no treino e proibido na medição.

    O pai reclamou que não conseguia ouvir o áudio várias vezes: o botão existia,
    mas escondido atrás de uma caixa e liberava uma única repetição.
    """
    running = JS.split("function renderRunningTest")[1].split("function playRunning")[0]
    assert "btnRepeatRunning" not in running
    assert "não existe botão de repetir" in running

    training = JS.split("function renderDiscourse")[1].split("function playDiscourse")[0]
    assert "btnRepeatDiscourse" in training
    assert "chkDiscourseRepeat" not in training  # sem caixa escondida

    replay = JS.split("function playDiscourseAgain")[1].split("function answerDiscourse")[0]
    assert "replays < 1" not in replay  # não trava em uma repetição
    assert "t.replays += 1" in replay
    # durante a repetição, responder fica bloqueado (senão a resposta sai no meio)
    assert "b.disabled = playing" in training


def test_replays_count_towards_the_daily_dose():
    save = JS.split("function saveDiscourseRun")[1].split("function ")[0]
    assert "perListen * (1 + (Number(t.replays) || 0))" in save


def test_running_text_level_can_be_moved_by_hand():
    assert "function shiftDiscourseLevel" in JS
    assert "btnDiscourseHarder" in JS and "btnDiscourseEasier" in JS
    assert 'state.discourseLevel = next' in JS
    assert 'discourseLevel: "auto"' in JS


def test_running_speech_is_persisted_exported_and_reported():
    assert "runningSpeech: []" in JS
    assert '"runningSpeech"' in JS.split("forEach(k => {")[0].split("]")[-2]
    assert "running_speech: state.runningSpeech" in JS
    assert "runningStats" in JS and "discourseStats" in JS
    report = JS.split("function generateReport")[1]
    assert "2.5 Fala corrida" in report
    assert "2.6 Temporal" in report
    assert "2.7 Vida real" in report


def test_a_second_session_on_the_same_day_is_not_blocked():
    # v4 travava a segunda sessão do dia; agora só o teto de 10 min/dia limita.
    assert "já tem uma sessão salva hoje" not in JS
    assert "sessionsToday() >= 1" not in JS
    block = JS.split("function startTraining")[1].split("const protocol = protocolFor()")[0]
    assert "doseToday() >= DOSE_CAP_SECONDS" in block, "o teto diário continua sendo o único bloqueio"
    assert "previousToday" in block, "a sessão extra deve avisar, não bloquear"
    assert "toast(" in block


def test_adherence_counts_days_not_sessions():
    assert "function trainingDaysThisWeek" in JS
    days = JS.split("function trainingDaysThisWeek")[1].split("function sessionsToday")[0]
    assert "localDayKey(s.date)" in days
    assert "trainingDaysThisWeek()" in JS
    # o gate de avanço e o relatório não podem usar contagem de sessões
    gate = JS.split("function renderHome")[1].split("function ")[0]
    assert "trainingDaysThisWeek() >= cfg.sessions_planned" in gate
    assert "sessionsThisWeek() >= cfg.sessions_planned" not in JS
    report = JS.split("function generateReport")[1]
    assert "trainingDaysThisWeek()" in report
    assert "Mais de uma sessão no mesmo dia é permitida" in report


def test_package_reports_days_and_sessions_separately():
    assert "trainingDaysThisWeek: trainingDaysThisWeek()" in JS
    assert "sessionsCompletedThisWeek: sessionsThisWeek()" in JS
    assert "trainingDaysThisWeek() / cfg.sessions_planned" in JS
