# Flujo obligatorio — WhatsApp SaaS

- Codex desarrolla autónomamente en ramas de trabajo y abre Pull Requests; nunca hace push directo a `main`.
- Claude Code revisa los PR, solicita correcciones cuando corresponda y, si aprueba la revisión y pasan los controles aplicables, **Claude Code realiza el merge a `main`** del repositorio WhatsApp SaaS. No requiere autorización individual del usuario.
- La revisión debe quedar registrada; una solicitud de revisión o el silencio no constituyen aprobación.
- Codex puede planificar, implementar, refactorizar, probar y corregir dentro del alcance del SaaS sin pedir autorización por cada decisión técnica.
- **Live Manager está fuera de alcance:** no modificar su repositorio ni su entorno. En Live Manager, solo el usuario autoriza el merge a `main`, que constituye el paso a producción en ese proyecto.
- Mantener separados los entornos y datos: no afectar La Madeja, Live Manager ni servicios/clientes reales mediante pruebas del SaaS. Cualquier operación con impacto externo real o fuera del alcance acordado requiere decisión explícita antes de ejecutarse.
- No introducir una autorización humana adicional para el merge a `main` de WhatsApp SaaS. Las protecciones técnicas que existan en GitHub deben respetarse, pero no se presupone que estén configuradas.

# Trazabilidad funcional

- Para funcionalidades sustanciales, seguir `PLAYBOOK.md` y registrar la intención de negocio en `docs/features/<slug>.md`.
- Claude Code revisa el plan funcional antes de la implementación sustancial y después revisa el PR. Para correcciones técnicas menores, refactorizaciones seguras y documentación, basta revisión de PR.
- Vincular criterios de aceptación con pruebas y resultados reales. Registrar observaciones y correcciones. No inventar decisiones de negocio ni evidencias.
- No aplicar retroactivamente las plantillas a PRs antiguos.

# graphify

- Cuando el usuario escriba `/graphify`, usa la skill graphify instalada o sus instrucciones antes de hacer cualquier otra cosa.
