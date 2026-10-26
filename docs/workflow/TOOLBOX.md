# Toolbox — procedimientos reutilizables

Usar instrucciones versionadas en GitHub y vinculadas desde el PR, no depender de memoria implícita de los agentes.

## Herramientas de trabajo
- **Entrevista y ficha:** `docs/workflow/INTERVIEW.md` y `docs/workflow/FEATURE-SPEC.md`.
- **Plan y ejecución:** `PLAYBOOK.md` y `AGENTS.md`.
- **Implementación:** rama por tarea, PR con alcance, decisiones, pruebas, migraciones y rollback si corresponde.
- **Pruebas:** unitarias, integración y aislamiento por tenant según riesgos reales; no afirmar resultados sin ejecutarlas.
- **Revisión:** Claude Code contrasta código y pruebas contra criterios de aceptación y registra observaciones.
- **Integración:** Claude Code fusiona a `main` del SaaS tras aprobar y superar checks aplicables.

## Cómo ampliar Toolbox
Para un patrón repetido, agregar una guía en `docs/workflow/toolbox/<tema>.md` que incluya disparador, entradas, pasos, validaciones, límites y evidencia. Preferir procedimientos pequeños y ejecutables. No crear automatizaciones ni activar integraciones externas sin definir su alcance.

## Seguridad de alcance
No modificar Live Manager ni La Madeja operativa; no usar pruebas del SaaS para enviar mensajes reales ni alterar datos externos.
