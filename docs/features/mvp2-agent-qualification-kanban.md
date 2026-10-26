# MVP 2 — Calificación IA especializada y bandeja Kanban (línea base para revisión Claude)

**Estado: PROPUESTA — pendiente revisión funcional/técnica de Claude Code. NO autorizada para implementar hasta constancia `APROBADO PARA IMPLEMENTAR`.**

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
