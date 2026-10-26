# Interview — protocolo de descubrimiento funcional

## Objetivo
Transformar una petición oral o escrita del usuario en requisitos de negocio verificables, sin obligarlo a repetir contexto conocido.

## Procedimiento
1. Recuperar el contexto disponible del proyecto, funcionalidades y decisiones previas.
2. Resumir en lenguaje de negocio qué se entendió y distinguir hechos, hipótesis y decisiones pendientes.
3. Cubrir cinco dimensiones, preguntando solo por vacíos que cambien el comportamiento:
   - **Problema:** ¿qué dificultad o necesidad concreta queremos resolver y para quién?
   - **Resultado:** ¿qué debe poder hacer la persona usuaria al finalizar?
   - **Reglas y excepciones:** ¿qué condiciones, permisos, errores y casos límite importan?
   - **Alcance e impacto:** ¿qué queda incluido/excluido, qué sistemas o datos toca?
   - **Aceptación:** ¿qué ejemplo observable demostraría que funciona?
4. Hacer una pregunta a la vez cuando sea posible; agrupar solo decisiones relacionadas y necesarias.
5. No inventar reglas comerciales ni convertir supuestos en hechos. Anotar preguntas abiertas con responsable.
6. Crear `docs/features/<slug>.md` usando `docs/workflow/FEATURE-SPEC.md`, con criterios Given/When/Then o ejemplos observables.
7. Clasificar la ficha: `LISTA PARA IMPLEMENTAR`, `PENDIENTE DE DECISIÓN DE NEGOCIO` o `REQUIERE INVESTIGACIÓN TÉCNICA`.
8. Una funcionalidad sustancial pasa a revisión del plan por Claude Code antes de implementación; correcciones pequeñas pueden seguir la ruta rápida de `PLAYBOOK.md`.

## Condición de salida
Cada criterio de aceptación tiene identificador estable (CA-01...), contexto, acción y resultado esperado. Se explicitan exclusiones y dependencias. No bloquear trabajo técnico rutinario por preguntas irrelevantes.

## Responsabilidades
ChatGPT facilita la entrevista y redacta la ficha; Codex implementa y prueba; Claude Code revisa y, cuando corresponda, fusiona PRs de WhatsApp SaaS. Live Manager queda fuera de alcance.
