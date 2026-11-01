# Ensayo de dispatch Codex

Estado del ensayo: PENDIENTE

Ensayo aislado del adaptador por mención GitHub aprobado como siguiente paso del diseño en PR #43. Este archivo es el único objetivo permitido de la tarea externa. No contiene datos de clientes ni configuración operativa.

El ejecutor externo debe cambiar únicamente la línea de estado a `Estado del ensayo: RESPUESTA DEL EJECUTOR RECIBIDA`, hacer commit en la misma rama y comentar SHA de resultado e identificador/enlace de tarea cuando exista. No fusionar, abrir otro PR, aplicar migraciones, modificar workflows ni invocar proveedores de IA/WhatsApp.

La edición solicitada es una señal de ensayo, no prueba por sí misma de identidad, idempotencia o recuperación. Para aprobar el spike deben observarse autor/acuse del servicio, commit nuevo diferente del preparado por esta sesión, diff limitado, vínculo de tarea si está disponible y resultado registrado por el coordinador. Si el servicio no expone task_id/status/cancelación consultables, registrar esa limitación; no declarar cumplido todo el contrato del diseño.

Dispatch duplicado, reinicio, cancelación y corrección tras revisión real: NO EJECUTADOS. Esta prueba no implementa el coordinador ni autoriza ejecución continua.
