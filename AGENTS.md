# Flujo de trabajo obligatorio

- Antes de modificar un proyecto Git, crea una rama nueva y exclusiva para la tarea; no reutilices ramas de tareas anteriores.
- Nunca hagas push directamente a `main`.
- Publica los cambios en la rama de trabajo y abre un Pull Request para revisión.
- Deja el Pull Request abierto para que Claude o el usuario revise los cambios antes de incorporarlos a `main` y de que lleguen a producción.
- No fusiones el Pull Request ni despliegues sin autorización explícita del usuario.


# Trazabilidad de funcionalidades

- Para nuevas funcionalidades y cambios funcionales, seguir `PLAYBOOK.md` y crear o actualizar `docs/features/<slug>.md` usando `docs/features/TEMPLATE.md`.
- Conservar la intención original, reglas de negocio, criterios de aceptación, supuestos y decisiones pendientes. No inventar decisiones de negocio.
- Solicitar y registrar revisión del plan por Claude Code antes de implementar cambios funcionales. Silencio no significa aprobación.
- Vincular documento de funcionalidad, aprobación del plan y evidencia criterio→prueba en cada PR usando `.github/pull_request_template.md`.
- Registrar observaciones de revisión y su resolución; no declarar pruebas ejecutadas sin evidencia.
- No modificar sistemas productivos, migrar bases alojadas, habilitar envíos reales ni desplegar sin autorización expresa.
- Cambios documentales al proceso pueden revisarse como tales, sin exigir un plan funcional previo.

# graphify

- Cuando el usuario escriba `/graphify`, usa la skill graphify instalada o sus instrucciones antes de hacer cualquier otra cosa.
