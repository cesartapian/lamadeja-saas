# Flujo obligatorio — WhatsApp SaaS

- Codex desarrolla autónomamente en ramas de trabajo y abre Pull Requests; nunca hace push directo a `main`.
- Claude Code revisa los PR, solicita correcciones cuando corresponda y, si aprueba la revisión y pasan los controles aplicables, **Claude Code realiza el merge a `main`** del repositorio WhatsApp SaaS. No requiere autorización individual del usuario.
- La revisión debe quedar registrada; una solicitud de revisión o el silencio no constituyen aprobación.
- Codex puede planificar, implementar, refactorizar, probar y corregir dentro del alcance del SaaS sin pedir autorización por cada decisión técnica.
- **Live Manager está fuera de alcance:** no modificar su repositorio ni su entorno. En Live Manager, solo el usuario autoriza el merge a `main`, que constituye el paso a producción en ese proyecto.
- Mantener separados los entornos y datos: no afectar La Madeja, Live Manager ni servicios/clientes reales mediante pruebas del SaaS. Cualquier operación con impacto externo real o fuera del alcance acordado requiere decisión explícita antes de ejecutarse.
- No introducir una autorización humana adicional para el merge a `main` de WhatsApp SaaS. Las protecciones técnicas que existan en GitHub deben respetarse, pero no se presupone que estén configuradas.

# Continuidad autónoma durante una tarea activa

- Después de publicar o corregir un PR, revisar el siguiente pendiente autorizado; no terminar la tarea únicamente para esperar CI, revisión o merge si hay trabajo independiente disponible.
- Mientras un PR está en revisión, avanzar en otra rama con correcciones técnicas, pruebas, documentación o preparación del siguiente plan. No construir una dependencia sobre cambios sin fusionar ni saltar la revisión funcional de `PLAYBOOK.md`.
- Al registrarse el merge de Claude, actualizar el estado y continuar con el siguiente incremento sin pedir al usuario que diga «avanza». Una aprobación sin merge no libera una dependencia.
- Resolver observaciones técnicas de Claude autónomamente, incluidas las no bloqueantes cuando sean correcciones acotadas. Conservar evidencia y no inventar resultados.
- Usar comprobaciones acotadas del estado de GitHub; evitar ciclos de espera/polling que sustituyan trabajo útil o repetir suites sin cambios que lo justifiquen.
- Detener solo el trabajo dependiente cuando falte una decisión funcional, una credencial/capacidad indispensable, autorización de impacto externo o no quede trabajo autorizado independiente. Completar lo demás y comunicar el bloqueo concreto.
- Una prueba dispensada por el usuario queda como NO EJECUTADA, nunca APROBADA. No reintroducirla como bloqueo sin un requisito nuevo.
- Esta regla guía las sesiones activas; no implica un servicio de ejecución en segundo plano fuera de la sesión.

# Trazabilidad funcional

- Para funcionalidades sustanciales, seguir `PLAYBOOK.md` y registrar la intención de negocio en `docs/features/<slug>.md`.
- Claude Code revisa el plan funcional antes de la implementación sustancial y después revisa el PR. Para correcciones técnicas menores, refactorizaciones seguras y documentación, basta revisión de PR.
- Vincular criterios de aceptación con pruebas y resultados reales. Registrar observaciones y correcciones. No inventar decisiones de negocio ni evidencias.
- No aplicar retroactivamente las plantillas a PRs antiguos.

# graphify

- Cuando el usuario escriba `/graphify`, usa la skill graphify instalada o sus instrucciones antes de hacer cualquier otra cosa.
