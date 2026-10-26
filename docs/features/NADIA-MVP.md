# Nadia — MVP de asistente IA para WhatsApp

Estado: **IMPLEMENTADA EN PR #28 / REVISIÓN DE CLAUDE**. La prueba real NVIDIA fue omitida por instrucción explícita del usuario; no se presenta como aprobada. No habilitar respuestas reales hasta validar integración, credenciales y pruebas.

## Problema
La bandeja recibe mensajes de WhatsApp, pero actualmente requiere respuesta manual. Nadia debe responder automáticamente desde el primer mensaje usando IA real.

## Resultado esperado
- Al recibir un mensaje, Nadia interpreta la intención y responde de manera contextual mediante **NVIDIA NIM**, priorizando modelos gratuitos.
- En el primer contacto se identifica claramente como asistente virtual con IA llamada **Nadia**.
- No inventa precios, disponibilidad, productos, políticas ni información de la empresa. Ante falta de información, pregunta o deriva a atención humana.
- Usa lenguaje neutro salvo que la persona indique explícitamente cómo desea ser tratada; no deduce género por nombre o estilo.
- La bandeja ofrece control visible para activar/pausar respuestas automáticas, **activado por defecto** para la configuración inicial. Decisión explícita del usuario: **solo por conversación**, sin interruptor global. La configuración por conversación inicia activa una vez que el runtime se habilita explícitamente.
- Cuando la IA está pausada, nunca envía respuestas automáticas.

## Límites y seguridad
- Solo backend consulta NVIDIA; variable `NVIDIA_API_KEY` guardada en el entorno de WhatsApp SaaS, nunca en cliente, logs o GitHub.
- No modificar Live Manager ni el Shopify productivo. Reutilizar la credencial NVIDIA existente solo mediante configuración independiente y autorización apropiada.
- No introducir proveedor de pago ni cambiar de proveedor sin aprobación del usuario.
- Deduplicar eventos entrantes por ID de mensaje y prevenir bucles al recibir mensajes propios.
- Registrar estado de procesamiento, errores y resultado de envío sin exponer contenido sensible en logs.
- Limitar tiempo de espera, reintentos y concurrencia según cuota del modelo gratuito; si falla la IA, no enviar texto inventado.
- Mantener separación por tenant y conversación; respetar controles de acceso existentes.

## Flujo propuesto
1. Ingresar webhook de WhatsApp y validar autenticidad.
2. Persistir mensaje entrante de manera idempotente.
3. Consultar configuración de Nadia y detectar si está pausada.
4. Construir contexto limitado a la conversación y datos comerciales autorizados.
5. Invocar NVIDIA NIM en backend.
6. Validar respuesta y enviar una sola vez por canal oficial.
7. Persistir respuesta y estado para mostrar en bandeja.

## Prueba de aceptación y evidencia
| Criterio | Prueba | Evidencia exigida |
|---|---|---|
| Primer contacto | Mensaje nuevo de prueba | Nadia se identifica como IA y responde a la intención |
| Respuesta real | Simular conversación con credencial de entorno de prueba | Llamada real a NVIDIA NIM, sin mock |
| Pausa | Desactivar interruptor y enviar mensaje | Cero respuestas automáticas |
| Duplicados | Repetir webhook con mismo ID | Un solo envío |
| Aislamiento | Mensajes de dos tenants | Sin mezcla de contexto |
| Error NVIDIA | Timeout o cuota agotada | Error controlado, sin respuesta inventada |
| Datos desconocidos | Consultar precio inexistente | Solicita aclaración o deriva |

## Investigación técnica previa a implementar
- Localizar entrada de webhooks, persistencia de mensajes, UI de bandeja y modelo de tenant en `lamadeja-saas`.
- Verificar que el canal permita envíos de prueba sin contactar clientes reales.
- Alcance confirmado: pausa solo por conversación. Responde a cada mensaje entrante nuevo cuando está activa; no reprocesa mensajes recibidos mientras estaba pausada.
- Verificar modelo NVIDIA NIM disponible gratuitamente y límites vigentes.
- Determinar migraciones y tests necesarios. Implementar en PR separado tras revisión de esta especificación.

## Despliegue: segunda etapa
La verificación de Vercel detectó `whatsapp-app` como proyecto separado, conectado al repositorio antiguo `cesartapian/whatsapp-app`, no al nuevo `cesartapian/lamadeja-saas`. El último despliegue observado de `whatsapp-app` estaba en ERROR. La configuración/despliegue del nuevo SaaS en Vercel se tratará **después** de avanzar en Nadia; no bloquear el trabajo de código por ello.

## Implementación y operación del PR #28

- Migración 007: configuración por conversación, trabajos idempotentes por mensaje origen y atribución de outbox (`origin=nadia`, sin atribuir la automatización a un usuario humano). RLS sin políticas de navegador. Aplicada y verificada en Supabase de desarrollo por instrucción del usuario; no repetir 007.
- Ingesta: con NADIA_MODE=simulated y OUTBOX_MODE=simulated, el worker de inbox encola únicamente mensajes entrantes nuevos. Receipts y duplicados no disparan Nadia; al pausar se cancelan trabajos pendientes y simulaciones de IA pendientes, manteniendo las manuales.
- Worker independiente: npm run worker:nadia. Una inferencia concurrente por tienda, intervalo mínimo configurable (2 s), dos intentos máximos por mensaje y retry de 30 s para timeout/cuota/proveedor. Sin transacción SQL durante la llamada NIM. Token de claim, lease y versión de pausa impiden duplicados o que una respuesta antigua se publique después de pausar/reanudar.
- Contexto: hasta 20 turnos y 12.000 caracteres de la misma conversación, solo entradas y respuestas Nadia anteriores. La identidad inicial de IA se antepone por código. Se conserva el error sin texto inventado cuando NVIDIA falla; la instrucción de no inventar datos y usar lenguaje neutral sigue requiriendo evaluación del modelo real, no es una garantía semántica demostrada por pruebas con dobles.
- UI: switch por conversación para admin/owner; agentes inspeccionan estado. Error de permisos al pausar no cierra la sesión. Las respuestas se muestran como Nadia · IA · Simulado · sin envío real; las canceladas se identifican. No se escriben mensajes outgoing reales.
- Activación técnica separada: NADIA_MODE=disabled por defecto. Configurar en backend NADIA_MODEL y NVIDIA_API_KEY, OUTBOX_MODE=simulated y habilitar el worker explícitamente. No hay proveedor alternativo ni modelo de pago por defecto. `compose.staging.yml --profile nadia` añade el worker; requiere también el profile simulation para procesar la outbox.
- El modelo sugerido por el usuario es nvidia/nemotron-3-ultra-550b-a55b; disponibilidad y cuota gratuita **no verificadas**. Se solicita stream=false, max_tokens=256 y, para Nemotron 3, enable_thinking=false. No se expone razonamiento interno.
- Diagnóstico de una solicitud real con prompt sintético: NADIA_RUN_REAL_NIM=1 npm run test:nadia:real, solo después de cargar la clave segura y confirmar cuota/modelo. Imprime únicamente indicadores y longitud, nunca clave ni contenido. No lo ejecuta CI automáticamente.

## Evidencia actual

| Criterio | Resultado / límite |
| --- | --- |
| Persistencia, duplicados, pausa/reanudación y aislamiento | Pruebas con PostgreSQL 16 real desechable y transacciones/conexiones reales; inferencia inyectada sintética |
| Primera presentación y límites del adaptador | Pruebas de contrato con transporte inyectado, deadline efectivo, host fijo, sin redirects y lectura acotada |
| Interfaz y permisos | Pruebas Playwright en escritorio/móvil contra respuestas API sintéticas |
| NVIDIA NIM real | NO EJECUTADA por instrucción explícita del usuario; disponibilidad/cuota/modelo no validados |
| WhatsApp real | FUERA DE ESTE PR; ninguna prueba automática envía mensajes reales |
| Migración 007 remota | APLICADA y verificada en desarrollo: tablas/RLS/índices/FK y datos anteriores preservados; no repetir 001–007 |

El usuario dispensó la prueba real para este incremento y autorizó 007; el PR puede pasar a revisión técnica. Esa dispensa no constituye evidencia NVIDIA real ni habilita el runtime. No copiar una credencial expuesta a código, logs, fixtures ni configuración versionada. La configuración del entorno preparada para NVIDIA debe guardarse/publicarse por el usuario para estar disponible; guardarla como draft no la activa en el runtime.

[Pruebas y limitaciones del PR #28](NADIA-MVP-PROOF.md).
