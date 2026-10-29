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


def test_assessment_and_training_are_gated_on_the_baseline():
    assert "state.baselineDone" in JS
    assert "Faça a avaliação inicial antes de treinar" in JS
    assert "state.paused" in JS
    assert "DOSE_CAP_SECONDS" in JS


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
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_discourse_bank_is_continuous_speech_in_four_tiers():
    bank = _discourse_bank()
    assert len(bank) == 10
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
    pool = JS.split("function discoursePassageOfTier")[1].split("function ")[0]
    assert "DISCOURSE_RESERVED.indexOf(d.id) < 0" in pool


def test_running_speech_has_no_replay_but_training_can_count_one():
    running = JS.split("function renderRunningTest")[1].split("function playRunning")[0]
    assert "btnRepeatRunning" not in running
    assert "não existe botão de repetir" in running
    training = JS.split("function renderDiscourse")[1].split("function playDiscourse")[0]
    assert "chkDiscourseRepeat" in training
    assert "btnRepeatDiscourse" in training
    assert "replays" in JS


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
