# Playbook — WhatsApp SaaS: Codex construye, Claude Code revisa, el propietario autoriza merge

## Ámbitos y autoridad
- **WhatsApp SaaS (`cesartapian/lamadeja-saas`):** repositorio de desarrollo autónomo. Codex prepara código y PRs; Claude Code revisa técnicamente. Cada merge requiere autorización expresa del propietario para el SHA exacto después de revisión y checks.
- **Live Manager:** repositorio independiente e intacto. Solo el usuario autoriza el merge a `main`, que representa su paso a producción. Este playbook no modifica sus instrucciones ni permisos.
- **La Madeja:** sistemas operativos existentes fuera del alcance del SaaS. No alterar sistemas externos o datos reales accidentalmente.

## Flujo para nuevas funcionalidades sustanciales
1. **Idea:** ChatGPT/Codex registra la intención del usuario, reglas de negocio, criterios de aceptación y preguntas abiertas en `docs/features/<slug>.md`.
2. **Plan:** Codex propone implementación, pruebas, riesgos y alcance. Decide autónomamente detalles técnicos; no inventa decisiones de negocio.
3. **Revisión del plan:** Claude Code evalúa intención, alcance y viabilidad; deja constancia verificable de `APROBADO PARA IMPLEMENTAR` o `CAMBIOS SOLICITADOS`. No asumir aprobación por silencio.
4. **Implementación:** Codex desarrolla y corrige autónomamente en rama independiente. Si cambia la intención de negocio, actualizar y volver a revisar el plan.
5. **PR y revisión:** adjuntar evidencia de criterios y pruebas. Claude Code solicita correcciones hasta quedar conforme; registra la revisión.
6. **Merge:** separar aprobación técnica, aprobación funcional para implementar y autorización del propietario para merge. Solo el propietario autoriza cada SHA con el procedimiento de `docs/workflow/MERGE_AUTHORIZATION.md`. Un commit nuevo invalida la autorización; no inferirla de silencio, etiquetas, comentarios genéricos o bots. No fusionar si falta cualquier control.

## Ruta rápida
Para correcciones técnicas pequeñas, documentación y refactorizaciones sin cambio sustancial de negocio: Codex crea rama, implementa y prueba, abre PR; Claude Code revisa; el propietario debe autorizar expresamente el SHA para merge. No imponer revisión separada de plan.

## Evidencia
Vincular intención y criterios cuando aplique, resultados reales de pruebas, limitaciones, riesgos y observaciones resueltas. Una solicitud de revisión no equivale a aprobación.

## Límites
No tocar repositorio ni producción de Live Manager; no modificar La Madeja operativa. Evitar envíos reales de WhatsApp, cambios destructivos o impactos sobre clientes/servicios externos fuera del alcance autorizado. Todos los PR del SaaS, incluidos los ordinarios y documentales, requieren autorización expresa del propietario para merge.

## Mejora continua
Documentar aprendizajes sin bloquear iteraciones técnicas rutinarias.

## Regla de avance sin espera pasiva

Después de cada PR, Codex selecciona el siguiente pendiente del plan autorizado. Si CI o Claude siguen trabajando, utiliza una rama independiente para mantenimiento acotado, evidencia o el próximo plan. Si el siguiente incremento depende del PR abierto, no lo integra antes de confirmar el merge; trabaja primero en otro pendiente sin esa dependencia.

Tras el merge registrado de Claude, continúa la implementación ya autorizada sin una nueva orden del usuario. Corrige observaciones técnicas con sus pruebas y conserva los límites de seguridad, revisión de planes funcionales y sistemas externos. No confundir el permiso para avanzar con permiso para desplegar, contratar servicios o enviar mensajes reales.

Solo las decisiones funcionales, configuración indispensable, impactos externos pendientes o el agotamiento del trabajo autorizado justifican devolver un bloqueo. Una espera de CI por sí sola no basta cuando hay trabajo independiente. Registrar explícitamente pruebas omitidas por el usuario; no presentarlas como aprobadas ni exigirlas de nuevo para esta misma revisión.

Al terminar una sesión, dejar el pendiente concreto y su bloqueo en el plan; no prometer ejecución continua en segundo plano si no hay un mecanismo configurado que la ejecute.
