# Playbook — desarrollo ágil y trazable del WhatsApp SaaS

## Objetivo y ámbitos
El usuario define visión y reglas de negocio. ChatGPT/Codex planifica y ejecuta autónomamente en `lamadeja-saas`; Claude Code revisa de forma independiente. **Live Manager no se modifica.** El usuario es el único que autoriza despliegues a producción y acciones sobre sistemas reales fuera del alcance previamente autorizado.

## Ruta de funcionalidad
1. **Idea:** registrar en `docs/features/<slug>.md` intención original, valor de negocio, límites, criterios observables y decisiones pendientes. No inventar decisiones.
2. **Plan:** Codex propone implementación, fases, pruebas, seguridad, efectos y reversión. Distinguir decisiones técnicas autónomas de decisiones reservadas al usuario.
3. **Revisión previa:** para funcionalidades sustanciales, Claude Code revisa el plan contra intención y restricciones. Registrar `APROBADO PARA IMPLEMENTAR`, `CAMBIOS SOLICITADOS` o `BLOQUEADO` con enlace verificable. Sin aprobación registrada no se afirma que esté aprobado.
4. **Desarrollo autónomo:** Codex implementa, refactoriza, prueba y corrige en su rama. No necesita aprobación humana para cada detalle técnico dentro del alcance acordado. Si cambia el objetivo de negocio, actualizar plan y solicitar revisión nuevamente.
5. **Revisión final:** PR con matriz criterio→prueba, resultados reales, limitaciones, riesgos y respuesta a comentarios. Claude Code revisa y deja evidencia de aprobación o cambios solicitados.
6. **Integración a `main` del SaaS:** permitida sin autorización individual del usuario **solo** tras revisión técnica favorable registrada, checks requeridos satisfactorios y cumplimiento de protecciones GitHub. Si faltan controles, dejar abierto. Merge no es despliegue.
7. **Producción / impacto real:** exclusivamente por autorización explícita del usuario; incluye activar envíos reales de WhatsApp, afectar tiendas o usuarios reales, o desplegar servicios productivos.

## Ruta rápida
Para documentación, correcciones técnicas pequeñas y refactorizaciones sin cambio funcional sustancial: rama → cambio → pruebas proporcionadas → PR → revisión Claude Code → merge en `main` del SaaS si los controles pasan. No exigir una aprobación de plan independiente para cada detalle.

## Roles
- **Usuario:** define negocio, resuelve ambigüedades de alcance, autoriza producción.
- **ChatGPT/Codex:** mantiene contexto, implementa y entrega evidencia verificable.
- **Claude Code:** revisa planes sustanciales y PRs; registra decisiones técnicas. Un comentario solicitando revisión no equivale a una revisión ejecutada.

## Evidencia mínima
Documento funcional cuando aplique; criterios y pruebas vinculadas; comandos y resultados ejecutados realmente; riesgos y reversión; resolución de observaciones. Señalar expresamente pruebas pendientes.

## Límites de integración
No modificar repositorio Live Manager ni tienda La Madeja desde este flujo. No habilitar webhooks o envíos reales, migraciones destructivas ni desplegar a producción sin autorización. El desarrollo y las pruebas aisladas del SaaS no requieren permisos repetidos. Las migraciones persistentes en recursos alojados requieren autorización cuando afectan datos/servicios reales o exceden el alcance ya autorizado.

## Aprendizaje
Registrar aquí mejoras recurrentes del proceso. El PR de este playbook no autoriza por sí solo cambios productivos.
