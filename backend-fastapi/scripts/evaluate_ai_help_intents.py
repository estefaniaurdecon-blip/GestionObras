from __future__ import annotations

from collections import Counter

from app.api.v1 import ai_chat


def main() -> None:
    intents = ai_chat._intent_catalog()
    total = 0
    matched = 0
    mismatches: list[tuple[str, str, str, str]] = []
    confusion_counter: Counter[tuple[str, str]] = Counter()

    for entry in intents:
        expected_id = str(entry.get("intent_id", ""))
        expected_label = f"{entry.get('module', '')} :: {entry.get('question', '')}".strip()
        for probe in ai_chat._intent_probe_queries(entry):
            total += 1
            resolved = ai_chat._best_matching_intent(probe)
            resolved_id = str((resolved or {}).get("intent_id", ""))
            resolved_label = (
                f"{(resolved or {}).get('module', '')} :: {(resolved or {}).get('question', '')}".strip()
                if resolved
                else "sin match"
            )
            if resolved_id == expected_id:
                matched += 1
                continue

            mismatches.append((probe, expected_label, resolved_label, expected_id))
            confusion_counter[(expected_label, resolved_label)] += 1

    print(f"Intenciones catalogadas: {len(intents)}")
    print(f"Consultas de prueba: {total}")
    print(f"Aciertos: {matched}")
    accuracy = (matched / total * 100.0) if total else 0.0
    print(f"Cobertura: {accuracy:.1f}%")

    if not mismatches:
        print("\nSin confusiones detectadas en este barrido.")
        return

    print("\nConfusiones mas frecuentes:")
    for (expected_label, resolved_label), count in confusion_counter.most_common(10):
        print(f"- {count}x esperado `{expected_label}` -> obtenido `{resolved_label}`")

    print("\nPrimeros ejemplos fallidos:")
    for probe, expected_label, resolved_label, _expected_id in mismatches[:20]:
        print(f"- `{probe}`")
        print(f"  esperado: {expected_label}")
        print(f"  obtenido: {resolved_label}")


if __name__ == "__main__":
    main()
