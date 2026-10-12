/*
 * Offline mirror of swarm/engine.py.
 *
 * The browser app must be able to produce the personalised protocol with no
 * server and no language model. This file re-implements the deterministic
 * policy so the recommendation logic runs on-device. tests/test_parity.py
 * compares this output against the Python engine to catch drift.
 */
(function (global) {
  "use strict";

  const SNR_LOSS_BANDS = [
    [2.0, "normal_0_2db"],
    [7.0, "mild_3_7db"],
    [15.0, "moderate_8_15db"],
    [Infinity, "severe_gt_15db"]
  ];

  const TV_LADDER = ["news_anchor", "interview", "soap_opera_with_questions", "film_with_music"];
  const MUSIC_DOSE_MIN_PER_SESSION = 15;
  const MUSIC_SESSIONS_PER_WEEK = 2;
  const DEFAULT_MICRO_SESSIONS_PER_DAY = 3;
  const DEFAULT_MINUTES_PER_SESSION = 6;

  const COMPLAINTS = ["tv", "noise", "group", "phone", "quick_speech", "female_voice", "fatigue"];

  const CONTRACTS = {
    A1_signal_chain: {
      objective: "maximise signal-to-noise ratio and device configuration before any training",
      rationale: "signal engineering is the fastest and largest lever (day-1 effect)",
      inputs: ["hearing_aid", "hearing_aid_streaming", "tv_setup", "tv_can_configure", "top_complaints", "medications_ototoxic"],
      stop_criteria: "streaming path configured and verified on day 1; if not, refer to audiologist for accessory fitting",
      evidence_gaps: ["no RCT compares TV streaming brands head-to-head", "remote-microphone benefit in the home is extrapolated from lab SNR studies"]
    },
    A2_dosage: {
      objective: "reach the therapeutic window without inducing auditory fatigue",
      rationale: "most dosage gain completes by 5-7.5 weeks; daily training adds no benefit",
      inputs: ["cognitive_impairment", "falls_last_year", "top_complaints"],
      stop_criteria: "plateau at 5-7.5 weeks, or any fatigue sign -> stop the session immediately",
      evidence_gaps: ["optimal dose for adults over 85 is not separately established"]
    },
    A3_transfer: {
      objective: "move gains from exercises into TV, phone and real conversation",
      rationale: "on-task gains do not transfer automatically; the environment must be staged",
      inputs: ["favourite_program", "favourite_time", "uses_captions", "top_complaints"],
      stop_criteria: "participant follows the favourite programme without captions for a full episode",
      evidence_gaps: ["transfer to untrained talkers is smaller than on-task gain", "music dose in the home is extrapolated from lab and group protocols"]
    },
    A4_partner: {
      objective: "raise intelligibility by changing how others speak, not only how he listens",
      rationale: "clear speech from a trained partner changes the signal at the source",
      inputs: ["living", "caregiver_hours_per_day"],
      stop_criteria: "partner demonstrates the five clear-speech rules unaided in a real conversation",
      evidence_gaps: ["clear-speech benefit is talker-dependent and measured mostly in lab tasks"]
    },
    A5_safety: {
      objective: "never let a rehabilitation plan delay medical care",
      rationale: "some symptoms require urgent assessment, not training",
      inputs: ["falls_last_year", "tinnitus", "medications_ototoxic"],
      stop_criteria: "any red flag routes to medical assessment before training continues",
      evidence_gaps: ["no validated digital screen for sudden sensorineural hearing loss in the home"]
    }
  };

  function has(p, c) { return p.top_complaints.includes(c); }

  function classifySnrLoss(v) {
    for (const [t, name] of SNR_LOSS_BANDS) if (v <= t) return name;
    return SNR_LOSS_BANDS[SNR_LOSS_BANDS.length - 1][1];
  }

  function signalChain(p) {
    const actions = [];
    if (p.hearing_aid_streaming === "none") {
      actions.push({ priority: 1, action: "enable_tv_audio_streaming", detail: "Add a TV adapter or Bluetooth streaming path so TV audio goes directly to the hearing aids instead of through the room.", expected_effect: "+11 to +14 percentage points of TV speech recognition", effort: "15 min", cost_band: "low", why: "bypasses room acoustics, noise and distance in one step", refs: ["tv_streaming_2024", "tv_adapter_2010"] });
    } else if (p.hearing_aid_streaming === "unknown") {
      actions.push({ priority: 1, action: "verify_streaming_capability", detail: "Check the hearing-aid model for TV adapter or Bluetooth streaming support; this is the single fastest available win.", expected_effect: "unlocks the day-1 signal win if supported", effort: "10 min", cost_band: "none", why: "capability unknown; verify before planning around it", refs: ["tv_streaming_2024"] });
    }
    if (p.tv_can_configure) {
      actions.push({ priority: 2, action: "configure_tv_streaming_today", detail: "Configure the TV streaming path on day 1 and confirm the aids are on the correct program for streamed audio.", expected_effect: "visible improvement on day 1 builds adherence", effort: "15 min", cost_band: "none", why: "signal quality, not effort, drives the fastest gain", refs: ["tv_streaming_2024"] });
    } else {
      actions.push({ priority: 2, action: "arrange_configuration_help", detail: "Bring in a family member, neighbour or the audiologist to configure the TV streaming path; it is the highest-value task of week 1 and should not be skipped because it is fiddly.", expected_effect: "removes the main blocker to the day-1 win", effort: "15 min", cost_band: "none", why: "configuration skill is the bottleneck, not the hardware", refs: ["tv_streaming_2024"] });
    }
    if (has(p, "phone")) {
      actions.push({ priority: 2, action: "enable_phone_streaming", detail: "Route phone calls directly to the hearing aids instead of holding the phone to the aid microphone.", expected_effect: "word recognition 30.0 -> 39.1 of 50; lower listening effort", effort: "10 min", cost_band: "none", why: "phone calls are a high-frequency, high-frustration setting", refs: ["phone_streaming_2024", "bluetooth_coupling_2024"] });
    }
    if (has(p, "noise") || has(p, "group")) {
      actions.push({ priority: 3, action: "introduce_remote_microphone", detail: "For restaurants, family gatherings and car rides, place a remote microphone on the talker rather than relying on the hearing-aid microphones.", expected_effect: "+11 to +19.5 dB SNR, benefit independent of distance", effort: "clinic visit", cost_band: "medium", why: "SNR is the bottleneck in noise, not audibility", refs: ["remote_mic_2021", "snr_requirement_10db"] });
    }
    if (p.medications_ototoxic) {
      actions.push({ priority: 2, action: "medication_review", detail: "Ask the prescriber or pharmacist to review current medicines for ototoxic effects. Do not stop any prescribed drug without medical advice.", expected_effect: "prevents an avoidable, ongoing hearing insult", effort: "clinic visit", cost_band: "none", why: "some drugs affect hearing or balance", refs: ["ototoxic_meds"] });
    }
    actions.push({ priority: 5, action: "audit_room_acoustics", detail: "Reduce competing noise at the source (hard floors, running TV or radio, kitchen appliances) before increasing volume.", expected_effect: "raises the SNR the brain receives for free", effort: "20 min", cost_band: "none", why: "SNR is driven by ambient noise, distance and reverberation", refs: ["snr_requirement_10db"] });

    actions.sort((a, b) => a.priority - b.priority);
    const refs = Array.from(new Set(actions.flatMap(a => a.refs))).sort();
    const triggers = [
      { id: "T1.1", when: "hearing_aid_streaming == none", fired: p.hearing_aid_streaming === "none" },
      { id: "T1.2", when: "hearing_aid_streaming == unknown", fired: p.hearing_aid_streaming === "unknown" },
      { id: "T1.3", when: "tv_can_configure == false", fired: !p.tv_can_configure },
      { id: "T1.4", when: "complaint in {noise, group}", fired: has(p, "noise") || has(p, "group") },
      { id: "T1.5", when: "complaint == phone", fired: has(p, "phone") },
      { id: "T1.6", when: "medications_ototoxic == true", fired: p.medications_ototoxic }
    ];
    return Object.assign({ agent: "A1_signal_chain" }, CONTRACTS.A1_signal_chain, { triggers: triggers, actions: actions, refs: refs });
  }

  function dosage(p) {
    let sessions = DEFAULT_MICRO_SESSIONS_PER_DAY;
    let minutes = DEFAULT_MINUTES_PER_SESSION;
    const notes = [];
    if (p.cognitive_impairment) {
      sessions = 2; minutes = 5;
      notes.push("shorter, more frequent sessions; stop at the first sign of fatigue");
    }
    if (p.falls_last_year >= 1) notes.push("sit during training; keep the walk inside and supervised");
    if (has(p, "fatigue")) notes.push("front-load fatigue control: one extra rest before the last micro-session");
    const triggers = [
      { id: "T2.1", when: "always", fired: true },
      { id: "T2.2", when: "cognitive_impairment == true", fired: p.cognitive_impairment === true },
      { id: "T2.3", when: "falls_last_year >= 1", fired: p.falls_last_year >= 1 },
      { id: "T2.4", when: "complaint == fatigue", fired: has(p, "fatigue") }
    ];
    return Object.assign({ agent: "A2_dosage" }, CONTRACTS.A2_dosage, {
      triggers: triggers,
      micro_sessions_per_day: sessions,
      minutes_per_session: minutes,
      days_per_week: 3,
      expected_plateau_weeks: "5-7.5",
      session_structure: ["warm-up: one easy item the participant already gets right", "core: adaptive speech-in-noise at the current level", "close: one guaranteed correct item (ends on success)"],
      progression: ["raise difficulty after 3 consecutive correct responses without hesitation", "hold the level if two consecutive errors occur", "never advance two levels in one day"],
      fatigue_signs: ["rubbing the ear or the hearing aid", "asking to stop or looking away", "errors that suddenly cluster after a good start"],
      stop_rules: ["stop the session at the first fatigue sign", "stop and simplify if adherence drops below 80% in a week"],
      adherence_target: ">=80% of planned sessions; log missed days without penalty",
      ending_rule: "always end the session on a correct response",
      notes: notes,
      refs: ["humes_dosage_2014", "act_gamified_2025"]
    });
  }

  function transfer(p) {
    const ladder = TV_LADDER.slice();
    const tvNote = p.uses_captions
      ? "Captions stay OFF during the training block only; keep them available outside training so leisure TV remains enjoyable."
      : "Introduce captions only if a week of the ladder stalls.";
    const tvTargets = {};
    tvTargets[ladder[0]] = "understand >=80% of a 10-minute block";
    tvTargets[ladder[1]] = "understand the guest's main point with one repeat";
    tvTargets[ladder[2]] = "follow the plot and answer one question per block";
    tvTargets[ladder[3]] = "follow dialogue through music and effects";
    const triggers = [
      { id: "T3.1", when: "always", fired: true },
      { id: "T3.2", when: "uses_captions == true", fired: p.uses_captions === true },
      { id: "T3.3", when: "complaint == phone", fired: has(p, "phone") },
      { id: "T3.4", when: "complaint in {group, noise}", fired: has(p, "group") || has(p, "noise") },
      { id: "T3.5", when: "always", fired: true }
    ];
    return Object.assign({ agent: "A3_transfer" }, CONTRACTS.A3_transfer, {
      triggers: triggers,
      tv_ladder: ladder,
      tv_targets: tvTargets,
      favourite_program: p.favourite_program,
      favourite_time: p.favourite_time,
      tv_note: tvNote,
      phone_ladder: ["short call with a familiar speaker in a quiet room", "longer call with a familiar speaker, speakerphone allowed", "call with a less familiar speaker", "call in a mildly noisy room"],
      conversation_ladder: ["one-to-one in a quiet room, face to face", "one-to-one at a small table with some room noise", "three people at a table with the remote microphone", "group gathering with the remote microphone on the main talker"],
      generalisation_check: "weekly: pick one untrained situation and ask him to report what he understood; on-task gain does not transfer automatically",
      music: {
        minutes_per_session: MUSIC_DOSE_MIN_PER_SESSION,
        sessions_per_week: MUSIC_SESSIONS_PER_WEEK,
        detail: "music from the participant's era, singing along where possible",
        refs: ["music_mci_2024", "choir_rct_2025", "zendel_music_2019"]
      },
      active_ingredients: ["adaptive speech-in-noise", "time-compressed speech (0.85x -> 1.0x)", "competing talker", "gap detection (temporal resolution)", "auditory working memory"],
      refs: ["act_gamified_2025", "auditory_training_sin_meta", "kraus_brainfit_2013", "phone_streaming_2024"]
    });
  }

  function partner(p) {
    let mode, detail;
    if (p.living === "alone") { mode = "self_and_remote"; detail = "train the main remote contact by phone and any regular visitor"; }
    else if (p.living === "care_facility") { mode = "staff_briefing"; detail = "brief the care staff on clear speech and on the hearing-aid routine"; }
    else { mode = "household_partner"; detail = "train the household partner who speaks with him most often"; }
    const doRules = [
      "get attention before starting to speak",
      "face him, at the same level, with light on your face",
      "reduce background noise first (TV, radio, fan)",
      "speak slightly slower and slightly louder, without exaggerating",
      "rephrase instead of repeating the same words louder",
      "confirm understanding by asking for the key point back"
    ];
    const dontRules = [
      "never shout: it raises pitch and lowers clarity",
      "do not cover your mouth or talk from another room",
      "do not switch topic without a clear cue",
      "do not repeat the identical sentence when it was not understood"
    ];
    const triggers = [
      { id: "T4.1", when: "living == with_family", fired: p.living === "with_family" },
      { id: "T4.2", when: "living == alone", fired: p.living === "alone" },
      { id: "T4.3", when: "living == care_facility", fired: p.living === "care_facility" },
      { id: "T4.4", when: "caregiver_hours_per_day < 2", fired: p.caregiver_hours_per_day < 2 }
    ];
    const notes = [];
    if (p.caregiver_hours_per_day < 2) notes.push("low supervision: keep the partner training to a single 10-minute block");
    return Object.assign({ agent: "A4_partner" }, CONTRACTS.A4_partner, {
      triggers: triggers,
      mode: mode,
      detail: detail,
      caregiver_hours_per_day: p.caregiver_hours_per_day,
      role_script: "Before speaking, get his attention and face him. Then say: 'I want to be sure you understood - can you tell me the main point back?'",
      do_rules: doRules,
      dont_rules: dontRules,
      rules: doRules.concat(dontRules.filter(r => r.indexOf("never") === 0)),
      training_session: ["2 min: explain that hearing aids amplify but do not restore", "5 min: practise the six 'do' rules face to face", "5 min: practise rephrasing instead of repeating louder", "5 min: rehearse the repair phrases together", "3 min: agree one signal to use in noisy places"],
      repair_strategies: ["'I heard that it is Tuesday - what time did you say?'", "'Could you say that another way?'", "'Please repeat just the last few words.'", "'Could you give me the main point first?'"],
      environment_checklist: ["TV and radio off or low while talking", "seat him facing the light, not the window behind the talker", "soft furnishings reduce echo in the room", "at restaurants, choose a corner table away from the kitchen"],
      notes: notes,
      refs: ["clear_speech_partner_2016", "nia_communication_tips", "repair_strategies_ace"]
    });
  }

  function safety(p) {
    const flags = [];
    if (p.falls_last_year >= 1) flags.push({ flag: "falls", urgency: "soon", action: "refer for balance and hearing review; consider vestibular assessment" });
    if (p.tinnitus) flags.push({ flag: "tinnitus", urgency: "routine", action: "mention tinnitus at the next audiology appointment; do not self-treat" });
    if (p.medications_ototoxic) flags.push({ flag: "ototoxic_medication", urgency: "soon", action: "prescriber or pharmacist medication review before any change" });
    const triggers = [
      { id: "T5.1", when: "always", fired: true },
      { id: "T5.2", when: "falls_last_year >= 1", fired: p.falls_last_year >= 1 },
      { id: "T5.3", when: "tinnitus == true", fired: p.tinnitus === true },
      { id: "T5.4", when: "medications_ototoxic == true", fired: p.medications_ototoxic }
    ];
    return Object.assign({ agent: "A5_safety" }, CONTRACTS.A5_safety, {
      triggers: triggers,
      red_flags: [
        { sign: "sudden hearing change in one ear", urgency: "urgent", target: "emergency or ENT same day" },
        { sign: "ear pain, discharge or sudden dizziness", urgency: "urgent", target: "medical assessment" },
        { sign: "new one-sided tinnitus with hearing change", urgency: "urgent", target: "ENT" },
        { sign: "repeated falls with vertigo", urgency: "soon", target: "balance clinic" }
      ],
      referral_targets: ["audiologist for audiometry, real-ear verification and accessory fitting", "ENT for sudden or one-sided changes", "prescriber or pharmacist for medication review", "balance clinic when falls and vertigo co-occur"],
      escalation_rules: ["sudden hearing change in one ear -> urgent medical assessment", "ear pain, discharge or sudden dizziness -> medical assessment", "no measurable progress after 4 weeks at >=80% adherence -> new audiometry and device review"],
      contraindications: ["do not run loud training with ear pain, discharge or active infection", "do not train through dizziness; stop and assess", "do not use tDCS or any electrical stimulation at home"],
      flags: flags,
      ceiling: "Cochlear hair-cell loss is permanent. The plan targets central processing, attention, strategy and signal quality, not restoration.",
      refs: ["presbycusis_irreversible", "ototoxic_meds"]
    });
  }

  function planWeeks(p, d) {
    const micro = d.micro_sessions_per_day;
    const minutes = d.minutes_per_session;
    const tv = TV_LADDER;
    return [
      { week: 1, focus: "signal + first win", actions: ["configure TV streaming and confirm the correct hearing-aid program", "baseline QuickSIN-like SNR loss estimate and HHIE-S", "start music sessions and partner clear-speech training"], tv_content: tv[0], refs: ["tv_streaming_2024", "hhie_s_screening", "clear_speech_partner_2016"] },
      { week: 2, focus: "establish the routine", actions: [micro + " micro-sessions/day of " + minutes + " min, 3 days/week", "speech-in-noise at the easiest SNR", "end every session on a correct response"], tv_content: tv[0], refs: ["humes_dosage_2014"] },
      { week: 3, focus: "add difficulty", actions: ["speech compression 0.90x", "introduce the competing-talker task", "first mid-point check of the TV ladder"], tv_content: tv[1], refs: ["act_gamified_2025"] },
      { week: 4, focus: "first re-test", actions: ["repeat QuickSIN-like estimate and HHIE-S", "review adherence; if <80%, simplify rather than intensify"], tv_content: tv[1], refs: ["hhie_s_screening", "zheng_rehab_meta_2024"] },
      { week: 5, focus: "temporal resolution", actions: ["gap detection and time-compressed speech at 0.95x", "remote microphone in one real noisy setting"], tv_content: tv[2], refs: ["remote_mic_2021"] },
      { week: 6, focus: "real-world transfer", actions: ["TV content with questions after each block", "phone practice with a familiar speaker", "rehearse the communication repair phrases with the family"], tv_content: tv[2], refs: ["clear_speech_partner_2016", "repair_strategies_ace", "phone_streaming_2024"] },
      { week: 7, focus: "consolidation", actions: ["full-speed speech (1.0x)", "group conversation with the remote microphone"], tv_content: tv[3], refs: ["remote_mic_2021", "choir_rct_2025"] },
      { week: 8, focus: "final re-test and maintenance", actions: ["repeat QuickSIN-like estimate and HHIE-S", "set the long-term routine: music + 20 min/day of listening practice", "book a full audiometry review"], tv_content: tv[3], refs: ["hhie_s_screening", "humes_dosage_2014", "music_mci_2024"] }
    ];
  }

  function followupSchedule(p) {
    return [
      { week: 1, checkpoint: "baseline", measures: ["HHIE-S questionnaire (0-40)", "QuickSIN-like SNR loss estimate", "hearing-aid program and TV streaming verified"], target: "baseline recorded before training starts", action_if_not_met: "complete the baseline before starting the daily routine", refs: ["hhie_s_screening", "quicksin_norms", "tv_streaming_2024"] },
      { week: 4, checkpoint: "interim", measures: ["adherence (sessions completed / sessions planned)", "HHIE-S questionnaire", "repeat QuickSIN-like SNR loss estimate"], target: "adherence >= 80% and no worsening of the HHIE-S score", action_if_not_met: "if adherence < 80%, simplify the routine instead of intensifying it; if there is no measurable progress, book a new audiometry and review the device", refs: ["humes_dosage_2014", "hhie_s_screening", "zheng_rehab_meta_2024"] },
      { week: 8, checkpoint: "final", measures: ["HHIE-S questionnaire", "QuickSIN-like SNR loss estimate", "full audiometry review"], target: "SNR loss reduced by >= 2-3 dB and HHIE-S improved", action_if_not_met: "no measurable gain after 8 weeks at >= 80% adherence -> full audiometry, device review and implant assessment", refs: ["hhie_s_screening", "quicksin_norms", "zheng_rehab_meta_2024"] }
    ];
  }

  function progressMarkers() {
    return [
      { when: "day 1", marker: "TV volume lower and fewer requests to repeat" },
      { when: "weeks 2-3", marker: "tolerates background noise without irritation" },
      { when: "weeks 4-6", marker: "follows a soap opera without captions" },
      { when: "week 8", marker: "SNR loss reduced by >=2-3 dB on re-test" }
    ];
  }

  function buildProtocol(p) {
    const d = dosage(p);
    const agents = [signalChain(p), d, transfer(p), partner(p), safety(p)];
    const refs = new Set();
    agents.forEach(a => (a.refs || []).forEach(r => refs.add(r)));
    const plan = planWeeks(p, d);
    plan.forEach(w => (w.refs || []).forEach(r => refs.add(r)));
    const followup = followupSchedule(p);
    followup.forEach(s => (s.refs || []).forEach(r => refs.add(r)));
    return {
      profile_summary: {
        hearing_aid: p.hearing_aid,
        streaming: p.hearing_aid_streaming,
        living: p.living,
        complaints: p.top_complaints,
        favourite_program: p.favourite_program,
        favourite_time: p.favourite_time
      },
      agents: agents,
      plan: plan,
      followup: followup,
      progress_markers: progressMarkers(),
      references: Array.from(refs).sort()
    };
  }

  const api = { buildProtocol: buildProtocol, classifySnrLoss: classifySnrLoss, COMPLAINTS: COMPLAINTS, CONTRACTS: CONTRACTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SwarmEngine = api;
})(typeof window !== "undefined" ? window : this);
