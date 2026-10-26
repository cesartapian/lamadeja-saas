# Playbook: idea → plan → revisión → implementación → evidencia

## Propósito
Preservar la intención del usuario durante la colaboración ChatGPT/Codex y Claude Code a través de GitHub. Este procedimiento no sustituye las autorizaciones humanas ni las restricciones de seguridad existentes.

## Fuente de verdad por funcionalidad
Crear un documento en `docs/features/<slug>.md` a partir de `docs/features/TEMPLATE.md`. Debe registrar el objetivo expresado por el usuario, alcance, reglas de negocio, escenarios, criterios de aceptación identificados, restricciones, decisiones pendientes y riesgos. No inventar decisiones de negocio; marcar `PENDIENTE DE USUARIO`.

## Puertas de control
1. **Descubrimiento:** el usuario describe la necesidad. Codex/ChatGPT registra intención y preguntas abiertas.
2. **Plan:** proponer diseño, fases, impactos, pruebas y criterios de aceptación, vinculando el documento de funcionalidad.
3. **Revisión del plan:** Claude Code contrasta plan con intención y límites. Registrar comentarios y resultado en el PR o documento: `APROBADO PARA IMPLEMENTAR`, `CAMBIOS SOLICITADOS` o `BLOQUEADO`. No asumir aprobación por silencio ni por pruebas exitosas. Si la revisión no está disponible, pedir revisión explícita.
4. **Implementación:** después de aprobación documentada, trabajar en rama de tarea, realizar cambios acotados y pruebas. Los cambios de alcance requieren volver a revisar el plan.
5. **Revisión final:** PR vincula documento, plan aprobado, matriz criterio→prueba/evidencia, limitaciones y riesgos. Claude Code evalúa cumplimiento funcional, seguridad y calidad técnica; dejar registro verificable.
6. **Integración:** solo tras autorización explícita del usuario se puede fusionar o desplegar, respetando `AGENTS.md`.

## Responsabilidades
- **Usuario:** intención, prioridades, decisiones de negocio, aprobación de merge/despliegue.
- **ChatGPT/Codex:** formalización, plan, código, pruebas, evidencias y correcciones.
- **Claude Code:** revisión independiente del plan y del PR; no reemplaza aprobación humana.

## Evidencia mínima
- Enlace al documento de funcionalidad y revisión del plan.
- Criterios de aceptación con prueba o verificación manual asociada y resultado.
- Comandos ejecutados y resultados reales, o pruebas no ejecutadas y motivo.
- Riesgos, migraciones, reversión y efecto sobre otros sistemas.
- Resolución de observaciones con referencia al comentario y commit.

## Protección de sistemas existentes
La Madeja productiva, Live Manager, credenciales y webhooks reales quedan fuera de alcance salvo autorización expresa. No ejecutar migraciones sobre bases alojadas, envíos WhatsApp reales, merges o despliegues por el solo hecho de aprobar un plan. Utilizar entornos aislados y cambios reversibles.

## Mejora continua
Registrar decisiones recurrentes y fallos de proceso aquí sin sobrescribir la intención de cada funcionalidad. El PR de documentación de este playbook no autoriza automáticamente ninguna implementación futura.
