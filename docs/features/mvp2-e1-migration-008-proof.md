# MVP 2 / E1 — migración 008

Implementa #34 según la adenda aprobada en [línea base](mvp2-agent-qualification-kanban.md), revisión funcional PR #32 regularizada en main. La autorización del plan no autoriza el merge. Este PR requiere revisión técnica de Claude y autorización expresa del propietario; conservarlo en borrador mientras se corrige el workflow en #40.

## Alcance persistente

- `agent_definitions`: configuración por organización/tienda, versión y registro inicial Nadia deshabilitado por tienda existente. Esto no cambia la configuración ni la pausa de Nadia actual. Nuevas tiendas deberán provisionar sus definiciones explícitamente.
- `conversation_assignments`: historial, motivo, actor opcional para asignaciones del sistema, clave idempotente y máximo una asignación sin fecha de cierre por conversación, incluso con conexiones concurrentes.
- `qualification_events` y `stage_transitions`: eventos internos separados de mensajes, autor humano o agente obligatorio y exclusivo, contexto/certeza/motivo e idempotencia por tienda. FKs compuestas impiden referencias a otras conversaciones/tiendas. Eventos append-only.
- `agent_definition_events`: captura automáticamente valores anteriores/nuevos y rol SQL en inserts/updates de definiciones, incluidos los registros iniciales. La identidad de aplicación deberá registrarse por la API futura: el rol SQL compartido no demuestra identidad de operador.
- Conversaciones: etapa inicial `sin_calificar`, estado técnico `sin_asignar` y versión de futura orquestación, sin asignaciones ni ejecuciones creadas. Etapas comerciales son texto acotado para permitir configuración futura, no columnas rígidas. APIs posteriores deben validar transiciones permitidas.
- Mensajes: tienda derivada de conversación, autor `customer`, `agent_ai` con agente/modelo, `human` con miembro, o `legacy_unknown` para salidas sin autor conocido. No se inventa autoría histórica. Un trigger conserva compatibilidad con writers antiguos que omiten tienda/autor; FKs y checks siguen validando cualquier valor explícito. `legacy_unknown` permanece disponible a esos writers durante la transición.
- RLS habilitada, sin políticas de navegador. Acceso por backend autenticado; ningún grant nuevo. El propietario SQL/superusuario conserva sus privilegios habituales.

No se renombra `nadia_runs`, no se elimina `nadia_one_inference_per_store`, no se sincronizan las versiones futuras con Nadia ni se activan agentes nuevos: runner, invalidación por transferencia/pausa y cuota/concurrencia 3 por tienda pertenecen a E2. La allowlist del editor/modelos, autorización API y límites de negocio tampoco se activan mediante DDL. No se modifican mensajes/outbox de Nadia ni tablas sandbox existentes.

## Pruebas y evidencia

PostgreSQL 16 en contenedor descartable propio, base sintética; nunca se usó DATABASE_URL del entorno para estas pruebas.

| Criterio | Evidencia |
| --- | --- |
| Rollback seguro | Aplicar DDL dentro de transacción y rollback: vuelve al esquema 007 con mensajes intactos |
| Datos existentes/defaults | Fixtures previas a 008: mensajes entrantes/salientes y run Nadia pendiente; IDs, cuerpos, fechas y dirección preservados |
| Reaplicación | Segundo intento falla atómicamente, rollback explícito y datos preservados; la migración es de aplicación única, no un mecanismo de reparación parcial |
| Aislamiento | Rechazo de asignación/agente/mensaje/transición cross-tenant y entre tiendas de la misma organización |
| Concurrencia | Dos conexiones intentan asignar; una sola acepta, la otra recibe unique violation |
| Restricciones/autoría | Autor humano miembro, agente y modelo obligatorios, forma/dirección inválidas rechazadas |
| Eventos/idempotencia | Claves duplicadas rechazadas, certeza fuera [0,1] rechazada, eventos no modificables/borrables |
| Regresión Nadia | Run previo reclama y genera salida sintética; pausa cancela outbox. Suite completa Nadia sobre 008 |
| Regresión inbox/outbox | Todas las fixtures SQL/PGlite existentes se amplían hasta 008 |

Resultados observados: `npm test` con TEST_DATABASE_URL descartable: **6 scripts y 63 API aprobados, cero fallos/omisiones**. `npm run typecheck` y `npm run lint`: aprobados. Tras incluir auditoría del registro inicial, la prueba específica 008: **8 aprobadas, cero fallos/omisiones**.

## Aplicación y recuperación

Aplicación única tras 001–007, con backup y revisión previa del entorno destino; transacción con lock_timeout 5s y statement_timeout 30s. El backfill de mensajes y los locks pueden superar ese presupuesto en una base grande: fallar y revisar volumen/ventana, no aumentar límites automáticamente. Probar primero en copia descartable representativa.

Antes de commit basta rollback (verificado). Tras commit, la aplicación anterior sigue siendo compatible; revertir primero la aplicación y conservar esquema/datos nuevos. No proporcionar un down destructivo que borre auditoría o mensajes. Si se requiere retirar objetos, preparar una migración posterior expresamente revisada y con respaldo de datos. No se aplicó 008 en desarrollo remoto ni producción; sin Meta/NVIDIA real ni despliegue en este incremento.
