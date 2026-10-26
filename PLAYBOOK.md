# Playbook — WhatsApp SaaS: Codex construye, Claude Code revisa y fusiona

## Ámbitos y autoridad
- **WhatsApp SaaS (`cesartapian/lamadeja-saas`):** repositorio de desarrollo autónomo. Codex prepara código y PRs; Claude Code revisa y ejecuta el merge a `main` cuando no quedan observaciones y los controles aplicables pasan. El usuario no tiene que aprobar cada merge.
- **Live Manager:** repositorio independiente e intacto. Solo el usuario autoriza el merge a `main`, que representa su paso a producción. Este playbook no modifica sus instrucciones ni permisos.
- **La Madeja:** sistemas operativos existentes fuera del alcance del SaaS. No alterar sistemas externos o datos reales accidentalmente.

## Flujo para nuevas funcionalidades sustanciales
1. **Idea:** ChatGPT/Codex registra la intención del usuario, reglas de negocio, criterios de aceptación y preguntas abiertas en `docs/features/<slug>.md`.
2. **Plan:** Codex propone implementación, pruebas, riesgos y alcance. Decide autónomamente detalles técnicos; no inventa decisiones de negocio.
3. **Revisión del plan:** Claude Code evalúa intención, alcance y viabilidad; deja constancia verificable de `APROBADO PARA IMPLEMENTAR` o `CAMBIOS SOLICITADOS`. No asumir aprobación por silencio.
4. **Implementación:** Codex desarrolla y corrige autónomamente en rama independiente. Si cambia la intención de negocio, actualizar y volver a revisar el plan.
5. **PR y revisión:** adjuntar evidencia de criterios y pruebas. Claude Code solicita correcciones hasta quedar conforme; registra la revisión.
6. **Merge:** **Claude Code realiza el merge a `main` del SaaS** cuando aprueba y se cumplen los checks y protecciones aplicables de GitHub. No necesita autorización individual del usuario. Si no puede ejecutarlo, informa el bloqueo; no se declara fusionado.

## Ruta rápida
Para correcciones técnicas pequeñas, documentación y refactorizaciones sin cambio sustancial de negocio: Codex crea rama, implementa y prueba, abre PR; Claude Code revisa y fusiona si corresponde. No imponer revisión separada de plan.

## Evidencia
Vincular intención y criterios cuando aplique, resultados reales de pruebas, limitaciones, riesgos y observaciones resueltas. Una solicitud de revisión no equivale a aprobación.

## Límites
No tocar repositorio ni producción de Live Manager; no modificar La Madeja operativa. Evitar envíos reales de WhatsApp, cambios destructivos o impactos sobre clientes/servicios externos fuera del alcance autorizado. Estos límites no constituyen un requisito de aprobación del usuario para fusionar PRs ordinarios del SaaS.

## Mejora continua
Documentar aprendizajes sin bloquear iteraciones técnicas rutinarias.
