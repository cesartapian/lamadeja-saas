# Flujo de trabajo — repositorio WhatsApp SaaS

- Antes de modificar Git, crear una rama exclusiva por tarea; nunca hacer push directo a `main`.
- Publicar cambios mediante Pull Request con pruebas y evidencia; Claude Code actúa como revisor independiente.
- **Autonomía amplia en este repositorio:** Codex puede diseñar, implementar, refactorizar, corregir, ejecutar pruebas y preparar PRs sin pedir autorización por cada decisión técnica, respetando la intención y criterios acordados.
- Después de revisión técnica favorable de Claude Code y controles automatizados satisfactorios, se permite fusionar PRs **exclusivamente de este repositorio** a `main` sin aprobación individual del usuario, siempre que sean cambios de desarrollo y no activen sistemas reales ni despliegues productivos. La aprobación no se presume por silencio. Respetar además las protecciones de rama de GitHub.
- **Solo el usuario autoriza pasar cambios a producción**, habilitar envíos reales o efectuar acciones con impacto real no previamente autorizadas. Fusionar a `main` no implica autorización para desplegar.
- **Live Manager queda intacto:** no cambiar su repositorio, configuración ni entorno productivo desde este flujo. La tienda La Madeja y sus sistemas productivos también quedan fuera de alcance.
- Cambios sobre datos alojados o servicios externos requieren evaluar entorno y efecto: pruebas aisladas y recursos de desarrollo autorizados pueden usarse dentro de su alcance; migraciones persistentes, operaciones destructivas, costos nuevos o integraciones reales requieren autorización explícita cuando impliquen impacto real.
- Si un PR afecta límites externos o hay dudas de negocio, escalar al usuario antes de ejecutar ese cambio; no bloquear por decisiones técnicas rutinarias.

# Trazabilidad de funcionalidades

- Seguir `PLAYBOOK.md` para funcionalidades y cambios de negocio; crear o actualizar `docs/features/<slug>.md` desde su plantilla.
- Registrar intención original, criterios de aceptación, supuestos, decisiones pendientes y evidencias.
- Solicitar y registrar revisión del plan por Claude Code antes de cambios funcionales sustanciales. Para correcciones técnicas menores, refactorizaciones seguras o documentación, usar revisión de PR sin puerta de plan separada.
- Vincular documento, revisión y matriz criterio→prueba en PRs aplicables. No inventar decisiones de negocio ni resultados de pruebas.
- Si Claude Code no está disponible, dejar el PR abierto y documentar el bloqueo; no fingir aprobación.

# graphify

- Cuando el usuario escriba `/graphify`, usa la skill graphify instalada o sus instrucciones antes de hacer cualquier otra cosa.
