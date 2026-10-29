"""Command-line entry point: build an auditable protocol from a profile JSON."""

from __future__ import annotations

import json
import sys

from .engine import build_protocol, calibration_questions
from .schema import Profile, ProfileError


def render_text(protocol: dict) -> str:
    lines: list[str] = []
    lines.append("PROTOCOLO DE REABILITACAO AUDITIVA — SWARM v4")
    lines.append("=" * 60)
    for agent in protocol["agents"]:
        lines.append("")
        lines.append(f"[{agent['agent']}] {agent['objective']}")
        if "actions" in agent:
            for act in agent["actions"]:
                lines.append(f"  - {act['action']}: {act['detail']}")
                lines.append(f"      refs: {', '.join(act['refs'])}")
        if "micro_sessions_per_day" in agent:
            lines.append(
                f"  dose: {agent['micro_sessions_per_day']}x/dia, "
                f"{agent['minutes_per_session']} min, {agent['days_per_week']} dias/semana"
            )
            lines.append(f"  plato esperado: {agent['expected_plateau_weeks']} semanas")
        if "tv_ladder" in agent:
            lines.append("  escada de TV: " + " -> ".join(agent["tv_ladder"]))
            lines.append(
                f"  musica: {agent['music']['minutes_per_session']} min, "
                f"{agent['music']['sessions_per_week']}x/semana"
            )
        if "rules" in agent:
            for rule in agent["rules"]:
                lines.append(f"  * {rule}")
        if "escalation_rules" in agent:
            for rule in agent["escalation_rules"]:
                lines.append(f"  ! {rule}")
        if agent.get("flags"):
            for flag in agent["flags"]:
                lines.append(f"  ALERTA {flag['flag']}: {flag['action']}")

    lines.append("")
    lines.append("PLANO DE 8 SEMANAS")
    lines.append("-" * 60)
    for week in protocol["plan"]:
        lines.append(f"Semana {week['week']} - {week['focus']} (TV: {week['tv_content']})")
        for act in week["actions"]:
            lines.append(f"  - {act}")

    lines.append("")
    lines.append("ACOMPANHAMENTO E MEDICOES")
    lines.append("-" * 60)
    for step in protocol.get("followup", []):
        lines.append(f"Semana {step['week']} ({step['checkpoint']})")
        for measure in step["measures"]:
            lines.append(f"  - medir: {measure}")
        lines.append(f"  alvo: {step['target']}")
        lines.append(f"  se nao atingir: {step['action_if_not_met']}")

    measurement = protocol.get("measurement", {})
    lines.append("")
    lines.append("PLANO DE MEDICAO")
    lines.append("-" * 60)
    lines.append(f"desfecho primario: {measurement.get('primary_outcome')}")
    for row in measurement.get("outcome_hierarchy", []):
        lines.append(f"  [{row['role']}] {row['level']}: {row['measure']}")
        lines.append(f"      {row['statement']}")
    for step in measurement.get("schedule", []):
        lines.append(f"  semana {step['week']} ({step['timepoint']}): {', '.join(step['tests'])}")
    speech = measurement.get("speech_in_noise", {})
    if speech:
        lines.append(
            "  fala em ruido: "
            f"{speech['method']}, {speech['practice_trials']} pratica + "
            f"{speech['scored_trials']} medidas, inicio {speech['start_snr_db']} dB, "
            f"passo {speech['step_db']} dB, estimativa: {speech['estimate']}"
        )
    gap = measurement.get("gap_detection", {})
    if gap:
        lines.append(
            "  gap: "
            f"{gap['practice_trials']} pratica + {gap['scored_trials']} medidas + "
            f"{gap['catch_probability']:.0%} catch, inicio {gap['start_gap_ms']} ms, "
            f"estimativa: {gap['estimate']}"
        )
    for rule in measurement.get("rules", []):
        lines.append(f"  * {rule}")
    for limit in measurement.get("limits", []):
        lines.append(f"  ! {limit}")

    training = protocol.get("training", {})
    lines.append("")
    lines.append("TREINO NO APP")
    lines.append("-" * 60)
    if training:
        lines.append(f"modelo: {training['model']}")
        lines.append(f"dose: {training['dose_note']}")
        for week in training.get("weeks", []):
            gap_trials = week.get("gap_trials", 0)
            gap_text = f", {gap_trials} gap" if gap_trials else ""
            lines.append(
                f"  semana {week['week']}: {week['sessions_planned']} sessao(oes), "
                f"{week['minutes']} min, SNR {week['snr_start_db']} dB, "
                f"{week['rate']}x, {week['noise']} n{week['noise_level']}{gap_text} — {week['focus']}"
            )
        gap_training = training.get("gap_training")
        if gap_training:
            lines.append(f"  gap: {gap_training['rule']} ({gap_training['claim']})")
        for limit in training.get("limits", []):
            lines.append(f"  ! {limit}")

    limits = protocol.get("limits", {})
    lines.append("")
    lines.append("LIMITES GLOBAIS")
    lines.append("-" * 60)
    lines.append(
        f"calibrated_db={limits.get('calibrated_db')} "
        f"medical_device={limits.get('medical_device')} "
        f"clinical_inference={limits.get('clinical_inference')} "
        f"control_group={limits.get('control_group')} "
        f"transfer_guaranteed={limits.get('transfer_guaranteed')}"
    )
    for note in limits.get("notes", []):
        lines.append(f"  ! {note}")

    lines.append("")
    lines.append("REFERENCIAS")
    lines.append("-" * 60)
    for key in protocol["references"]:
        ev = protocol["evidence"][key]
        lines.append(f"[{ev['grade']}] {key}: {ev['citation']}")
        lines.append(f"      {ev['url']}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] in {"-h", "--help"}:
        print("uso: python -m swarm.cli [profile.json]")
        print("sem argumento: imprime as perguntas de calibragem")
        return 0

    if len(argv) < 2:
        for q in calibration_questions():
            print(f"- {q['id']}: {q['question']}")
        return 0

    with open(argv[1], encoding="utf-8") as handle:
        data = json.load(handle)

    try:
        profile = Profile.from_dict(data)
    except ProfileError as exc:
        print(f"perfil invalido: {exc}", file=sys.stderr)
        return 2

    protocol = build_protocol(profile)
    if len(argv) > 2 and argv[2] == "--json":
        print(json.dumps(protocol, ensure_ascii=False, indent=2))
    else:
        print(render_text(protocol))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
