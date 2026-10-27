# MVP 2 — Calificación IA especializada y bandeja Kanban (línea base para revisión Claude)

**Estado: APROBADO PARA IMPLEMENTAR — segunda revisión Claude Code en PR #32, sujeto a integrar este documento aprobado en `main` antes de E1.**

## Intención de negocio
La atención de WhatsApp debe clasificar y acompañar al cliente mediante **agentes de IA especializados, configurables por etapa**, con supervisión de la conversación completa en un **tablero Kanban**. Se prioriza este alcance como MVP 2 antes de comercio avanzado y omnicanal. El sistema existente de WhatsApp SaaS es la base; no trasladar ni modificar los sistemas productivos La Madeja o Live Manager.

## Fuentes obligatorias de auditoría
- `cesartapian/WhatsAgent`: verificar en código (no dar por existente sin prueba) CRM, pipeline, configuración de agentes, orquestación, multitenancy y componentes Kanban.
- `cesartapian/whatsapp-app`: mensajes, estados, Meta, conversación y handoff.
- `cesartapian/shopify-whatsapp-app`: agentes/comercio y contratos reutilizables sin activar Shopify productivo.
- `cesartapian/live-manager-cl`: únicamente revisión de patrones de autenticación, **sin cambios**.
- `cesartapian/lamadeja-saas`: migraciones, modelos, inbox, Nadia, workers, permisos, tests, límites de integración y PRs abiertos.

Claude debe elaborar una matriz **función / repositorio / ruta concreta / estado real / reusable-adaptar-reescribir / riesgos**. No asumir capacidades por nombre o por documentación previa.

## Requisitos funcionales
1. **Agentes configurables**: crear/editar/desactivar agentes especializados (calificación, ventas, soporte y futuras especialidades), con objetivo, instrucciones, modelo/proveedor permitido, herramientas, base de conocimiento por etapa, criterios de éxito, límites y transferencia. No inventar información ni habilitar herramientas o llamadas externas sin autorización.
2. **Orquestación independiente de Nadia**: asignación y transferencia determinista entre agentes según estado persistido; evitar dos agentes contestando a la vez, respuestas tardías tras handoff, duplicados, carreras e interferencia con pausa por conversación existente. Nadia podrá ser un agente, no el orquestador.
3. **Calificación persistente**: distinguir `etapa_negocio` (sin calificar, calificación, venta, soporte, seguimiento, cerrado — propuesta configurable) de `estado_atencion` (IA atendiendo, esperando cliente, requiere humano, humano atendiendo, cerrado — propuesta configurable). Capturar intención, necesidad, contexto, nivel de certeza, agente asignado y justificación; permitir corrección manual auditada.
4. **Kanban operativo**: columnas configurables de etapa de atención/comercial; tarjetas con cliente, resumen, última actividad, prioridad, agente asignado, estado, SLA si definido, indicadores de intervención humana. Filtros por agente, estado y prioridad. Transiciones validadas en backend; no solo estado local o mock.
5. **Conversación supervisable**: al abrir tarjeta, historial cronológico de mensajes de cliente, IA y humanos; distinguir autor y agente/modelo, eventos de clasificación, cambios de columna, transferencias y pausas. Separar mensajes visibles al cliente de razonamiento interno/logs privados. Permitir intervención humana segura y reanudación autorizada.
6. **Seguridad**: aislamiento por tenant/store, permisos owner/admin/agente, idempotencia de webhooks y mensajes, persistencia durable, límites de costo y observabilidad. Ninguna ejecución real contra clientes o canales productivos en pruebas.
7. **Evolución omnicanal**: modelo de contacto/conversación desacoplado del proveedor para futura integración Instagram/TikTok; **no implementar canales nuevos en MVP 2**.

## Criterios de aceptación verificables
- Un contacto nuevo de WhatsApp genera conversación persistida y tarjeta Kanban sin duplicarse ante webhook repetido.
- Un agente calificador configurado obtiene información del cliente y registra etapa, intención y contexto, sin asumir una venta si no hay evidencia.
- El orquestador deriva a agente comercial, soporte o humano conforme a reglas auditables, sin respuestas simultáneas ni posteriores a una pausa/transferencia.
- Cambiar de columna actualiza el backend y conserva historia de transiciones; permisos y transiciones inválidas se rechazan.
- Un operador puede abrir la tarjeta y leer secuencia íntegra de mensajes con identidad de emisor y eventos relevantes, y tomar el control de forma segura.
- Tests de concurrencia, idempotencia, aislamiento entre tiendas, permisos, reinicios, errores de IA y regresión de Nadia/inbox existente.
- No se afirma integración Meta real, NVIDIA real ni despliegue productivo si no existe evidencia.

## Propuesta de fases — sujeto a revisión
A. Inventario comparativo de repositorios, flujos actuales, esquema de datos y contratos.
B. Diseño de entidades y migraciones aditivas: agent_definitions, assignments, qualification_events, stage_transitions y auditoría (nombres por validar).
C. Orquestador y runtime seguro de agentes configurables con pruebas de carreras y handoff.
D. APIs y Kanban conectado a datos reales, conversación unificada e intervención humana.
E. End-to-end sintético, seguridad, observabilidad, documentación y criterios de salida.

## Preguntas que Claude debe resolver/proponer
- Qué piezas concretas de WhatsAgent y demás repos son reutilizables y cuál es su licencia/compatibilidad técnica.
- Si la etapa del tablero será comercial, operativa o vistas alternables; proponer default sin bloquear personalización.
- Cómo convivir con Nadia y el modelo actual de mensajes/outbox sin romper controles de pausa.
- Alcance mínimo de editor de agentes, permisos, reglas de transferencia, costos y base de conocimiento (esta última puede quedar para ola posterior).
- Riesgos de migración y orden de dependencias respecto a sender real y Shopify.

## Encargo explícito a Claude Code
**Revisar esta línea base y auditar código de repositorios.** Publicar una revisión verificable en este PR con una de dos decisiones exactas: **`APROBADO PARA IMPLEMENTAR`** o **`CAMBIOS SOLICITADOS`**, indicando hallazgos, ajustes y desglose propuesto de épicas/issues con dependencias, pruebas y prioridades. **No abrir todavía issues de construcción ni iniciar implementación sustancial** hasta completar revisión y cerrar el alcance. Mantener este PR como documento de revisión; seguir `AGENTS.md` y `PLAYBOOK.md`.


## Adenda — ajustes por auditoría Claude Code (PR #32)

### Matriz de reutilización verificada por Claude
| Función | Repositorio/ruta | Hallazgo | Decisión/riesgo |
|---|---|---|---|
| Agentes y etapas | `WhatsAgent/backend/server.py`: `Agent`, `FlowStage`, `/agents`, `/stages` | MongoDB, filtros de tienda opcionales, rutas sin autenticación | Solo conceptos; reescribir en Postgres con aislamiento |
| Cambio de etapa | `WhatsAgent/backend/server.py`: `PATCH /conversations/{id}/move-stage` | Sin transiciones validadas ni auditoría | Reescribir |
| Ruteo | `WhatsAgent`: `get_ai_response`, `detect_intent_and_route` | Keywords y llamada IA síncrona; dependencia `emergentintegrations` | Reescribir sobre runner asíncrono existente |
| Ejecución arbitraria | `WhatsAgent`: `POST /admin/execute-script` | JavaScript ejecutado sin autenticación | **No portar**; revisar exposición y deshabilitar si desplegado |
| Kanban | `whatsapp-app/src/components/whatsapp/ConversationKanban.tsx` | Drag-and-drop; columnas fijas y error PATCH sin rollback | Reutilizar patrón visual, implementar estados y errores robustos |
| Estado/agente | `whatsapp-app/migrations/schema.sql`: `state_agent_mapping` | Estados rígidos y single tenant | Concepto solamente |
| Clasificación | `shopify-whatsapp-app/server/services/classificationService.js` | LLM JSON con fallback manual pero sin esquema validado | Reutilizar patrón de fallback, no backend |
| Agentes | `shopify-whatsapp-app/prisma/schema.prisma` | SQLite y unicidad global no multi-tienda | Concepto solamente |
| Identidad | `live-manager-cl` | SaaS ya verifica JWT Supabase y roles | Sin cambios en Live Manager |
| Base segura | `lamadeja-saas`: migraciones 001–007, `processNadia.ts`, `nadiaStore.ts` | FKs tenant, idempotencia, lease y versionado | Implementar aquí |

Auditoría referenciada: `whatsagent@5753c31`, `whatsapp-app@6e5a030`, `shopify-whatsapp-app@e7b6489`, `live-manager-cl@eefca45`, `lamadeja-saas@3613e1e`. Claude reporta ausencia de `LICENSE` en repos auditados y dependencia propietaria `emergentintegrations` en algunos; **no copiar backend**.

### Alcance MVP 2 acotado (sustituye aspiraciones amplias anteriores)
- Editor de agentes: **nombre, objetivo, instrucciones, etapa, activo/inactivo, modelo seleccionado de lista permitida (inicialmente NVIDIA NIM), regla de transferencia**. Fuera de MVP 2: herramientas externas, nuevas plataformas de modelos y bases de conocimiento por etapa.
- Nadia se incorpora como una `agent_definition` general/soporte; el orquestador es independiente. **Generalizar `nadia_runs` a `agent_runs`**, conservando lease, `claim_token`, `conversation_version` y compatibilidad/regresión de Nadia.
- Invariantes persistidas: **máximo un agente activo por conversación** (índice único parcial); transferir o pausar incrementa `conversation_version` y cancela/invalida runs y outbox pendientes. Analizar `nadia_one_inference_per_store` (límite actual una inferencia por tienda); concurrencia aprobada: máximo 1 run activo por conversación (índice único parcial) y 3 runs `generating` por tienda, validado al reclamar el trabajo. Probar 5 conversaciones simultáneas: nunca más de 3 en generación ni dos por conversación.
- `messages` debe identificar autor `customer`, `agent_ai` (`agent_id`, modelo) o `human` (`user_id`). Eventos internos de clasificación, cambios de columna, pausa y handoff se guardan por separado y nunca se envían al cliente.
- Clasificador devuelve **JSON validado por esquema**: `stage`, `intent`, `confidence` en [0,1], `reason`. Fallo de esquema o certeza baja -> requiere humano, salvo saludos o mensajes aún no clasificables: se mantienen `sin_calificar` con el agente calificador y un límite de intentos; jamás saltar a venta por simple saludo. Umbral aprobado: `confidence < 0.6` deriva a humano, salvo saludo o mensaje sin información, que permanece `sin_calificar`. Después de 3 respuestas del calificador sin clasificar, deriva a humano y registra evento.
- Kanban: **columnas por `etapa_negocio`** y **`estado_atencion` como indicador/filtro**. Transiciones persistidas, validadas y auditadas; errores de API restauran la tarjeta a su posición real. Vistas alternables fuera de MVP 2.
- Medición: preparar **30 conversaciones sintéticas etiquetadas** (incluidos saludos, venta, soporte, ambigüedad, handoff) y objetivo aprobado >= 85% de acierto en casos clasificables y 100% de derivación segura ante errores/certeza baja. Límites aprobados **10 llamadas IA por conversación/día y 100 por tienda/día**, configurables por tienda, nunca constantes de código. Exceso deriva a humano y registra evento.
- Omnicanal: `channel_connections.provider` ya prepara el modelo; **sin trabajo de canales adicionales en MVP 2**. Meta real y Shopify no son dependencias; pruebas con outbox simulado.

### Épicas propuestas por Claude — NO crear issues de construcción hasta aprobación
1. **E1 (Alta):** migración 008 aditiva: `agent_definitions`, `conversation_assignments`, `qualification_events`, `stage_transitions`, autor de mensajes. Tests FKs compuestas, aislamiento cross-tenant.
2. **E2 (Alta, depende E1):** runner `agent_runs` + orquestación/transferencias. Tests carreras, handoff, leases vencidos, regresión Nadia.
3. **E3 (Alta, depende E2):** agente calificador JSON validado y fallback. Tests set sintético y límites.
4. **E4 (Media, depende E1):** API Kanban, historial y transiciones autorizadas. Tests 4xx y permisos.
5. **E5 (Media, depende E4/E2):** UI Kanban, timeline y toma humana. Tests cancelación de run.
6. **E6 (Media, depende E3/E5):** E2E sintético, observabilidad, límites. Tests duplicación de webhooks y fallos.

### Solicitud de segunda revisión a Claude
Revisar esta adenda como **alcance normativo**, por encima de las propuestas amplias previas del documento. Confirmar o corregir umbral de certeza, límite de intentos, concurrencia por conversación y topes iniciales; comprobar consistencia de criterios y dependencias. Registrar decisión explícita `APROBADO PARA IMPLEMENTAR` o `CAMBIOS SOLICITADOS` en PR #32. Hasta aprobación, no abrir issues de construcción ni implementar. No realizar cambios en producción, Meta real, Live Manager ni La Madeja.


### Cierre de revisión funcional Claude Code — PR #32
Decisión registrada: **`APROBADO PARA IMPLEMENTAR`** sobre commit `57dfa09`, con parámetros definitivos: `confidence < 0.6` a humano salvo saludos/sin información; 3 turnos sin clasificar a humano; 1 run activo por conversación y máximo 3 `generating` por tienda; límites configurables de 10 llamadas IA por conversación/día y 100 por tienda/día; corpus de 30 conversaciones sintéticas, exactitud >= 85% y derivación segura 100%. Esta versión debe fusionarse en `main` mediante PR revisado por Claude antes de iniciar E1 o abrir issues de construcción. La aprobación del documento no equivale a aprobar automáticamente PRs de código.
