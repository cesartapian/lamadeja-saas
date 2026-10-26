# Proof — evidencia ligada al requisito

## Regla
Una implementación no se considera verificada solo porque compila o porque un agente afirma que funciona. Cada criterio de aceptación de la ficha debe contar con evidencia o una limitación explícita.

## Matriz mínima
| ID | Escenario esperado | Prueba/comando | Resultado real | Evidencia/enlace | Estado |
| --- | --- | --- | --- | --- | --- |
| CA-01 | <resultado observable> | <test/manual> | <resultado> | <PR/log/captura> | PENDIENTE |

Estados: `APROBADO`, `FALLIDO`, `BLOQUEADO`, `NO EJECUTADO` (con motivo).

## Revisión final
1. Codex ejecuta pruebas pertinentes y publica evidencia auténtica en PR.
2. Claude Code comprueba que los criterios están cubiertos, que no se inventaron pruebas y que no se afecta el aislamiento entre tenants ni sistemas externos.
3. Observaciones implican correcciones y nueva verificación; la ausencia de comentario no equivale a aprobación.
4. Claude Code registra aprobación y realiza merge a `main` del SaaS solo cuando se satisfacen controles aplicables.
5. Live Manager no forma parte de este flujo; allí el usuario autoriza el merge a `main`.
