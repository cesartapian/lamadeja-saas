# Autorización de merge — issue #40

Toda integración, incluso documentación, planes, CI y migraciones, requiere tres decisiones separadas:

1. Aprobación funcional del plan para implementar cuando corresponda.
2. Revisión técnica de Claude del HEAD exacto. El comentario empieza con `✅ Aprobado` e incluye una línea `HEAD_SHA: <40 caracteres>`.
3. Autorización expresa del propietario para fusionar ese mismo HEAD, después de CI. Ni el punto 1 ni el 2 autorizan merge.

## Procedimiento verificable

En GitHub → Actions → **Owner authorized merge** → Run workflow, seleccionar **main** e introducir:

- `pr`: número del PR.
- `sha`: SHA completo actual del PR, visible en Commits.
- `confirmation`: `MERGE <SHA completo>`.

Solo el propietario del repositorio (`cesartapian` actualmente) puede autorizar. El workflow rechaza actores distintos y re-ejecuciones: un rerun no reutiliza autorización. Si falla, el propietario debe realizar un dispatch nuevo. Comentarios, etiquetas, aprobaciones del bot, silencio y checks verdes no disparan esta acción.

El gate exige PR abierto, fuera de borrador, destino main, revisión técnica de Claude para el SHA actual, jobs `test`, `container-runtime` y `revisar` aprobados, ejecución CI conocida aprobada y ningún check/status pendiente o fallido. Un SHA nuevo invalida la autorización. La API de merge usa `sha` como comparación atómica para rechazar cambios entre validación y merge. El código del gate se obtiene de main, nunca del PR.

El dispatch y su resumen de ejecución dejan constancia del actor, PR, SHA e intento. Las pruebas locales simulan decisiones; **no prueban ni ejecutan un merge real**. No es obligatorio activar este workflow para revisar PRs: revisión y correcciones automáticas siguen independientes, sin permisos de escritura de contenido en el job revisor.

## Activación y límites administrativos

Este cambio debe ser revisado y autorizado expresamente antes de integrarse. Hasta entonces el workflow antiguo de main continúa vigente: mantener los PR #40/E1 en borrador evita la revisión/merge automático de ese flujo. No marcar ready ni disparar revisiones del flujo antiguo como sustituto de autorización.

Los archivos del repositorio no pueden impedir que un administrador use merge manual, auto-merge, un token externo o un workflow distinto con permisos de escritura. El gate protege **este flujo**, no equivale a una protección universal del servidor. No se han configurado rulesets/protecciones ni revocado tokens. La consulta de protección de main devolvió HTTP 403; el listado de rulesets no devolvió elementos. Esto no demuestra qué protecciones clásicas están activas.

El propietario debe revisar en Settings → Rules/Branches y Actions:

- Proteger main contra pushes directos/force pushes y requerir PR/checks aplicables; limitar excepciones/bypass.
- Deshabilitar auto-merge/merge queue o cualquier integración alternativa que pueda fusionar sin su autorización; revisar automatizaciones externas.
- Revisar permisos y alcance de GitHub Apps/PAT y workflow tokens. El job de revisión ya no pide `contents: write`; el único job de merge exige dispatch del propietario.

Una configuración administrativa compatible debe conservar revisión independiente y autorización del propietario. No afirmar protección del servidor hasta verificarla. El propio propietario puede realizar un merge manual expresamente autorizado una vez completada revisión/checks; agentes y bots no deducen esa autorización.
