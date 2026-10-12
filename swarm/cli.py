"""Command-line entry point: build an auditable protocol from a profile JSON."""

from __future__ import annotations

import json
import sys

from .engine import build_protocol, calibration_questions
from .schema import Profile, ProfileError


def render_text(protocol: dict) -> str:
    lines: list[str] = []
    lines.append("PROTOCOLO DE REABILITACAO AUDITIVA")
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
