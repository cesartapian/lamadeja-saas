# Nadia — MVP de asistente IA para WhatsApp

Estado: **BUSINESS DECISION PENDING / TECHNICAL INVESTIGATION**. No habilitar respuestas reales hasta validar integración, credenciales y pruebas.

## Problema
La bandeja recibe mensajes de WhatsApp, pero actualmente requiere respuesta manual. Nadia debe responder automáticamente desde el primer mensaje usando IA real.

## Resultado esperado
- Al recibir un mensaje, Nadia interpreta la intención y responde de manera contextual mediante **NVIDIA NIM**, priorizando modelos gratuitos.
- En el primer contacto se identifica claramente como asistente virtual con IA llamada **Nadia**.
- No inventa precios, disponibilidad, productos, políticas ni información de la empresa. Ante falta de información, pregunta o deriva a atención humana.
- Usa lenguaje neutro salvo que la persona indique explícitamente cómo desea ser tratada; no deduce género por nombre o estilo.
- La bandeja ofrece control visible para activar/pausar respuestas automáticas, **activado por defecto** para la configuración inicial. El alcance exacto del interruptor (global o por conversación) queda pendiente de definición.
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
- Confirmar alcance del interruptor (global, por tenant o conversación) y si Nadia responde durante toda la conversación.
- Verificar modelo NVIDIA NIM disponible gratuitamente y límites vigentes.
- Determinar migraciones y tests necesarios. Implementar en PR separado tras revisión de esta especificación.

## Despliegue: segunda etapa
La verificación de Vercel detectó `whatsapp-app` como proyecto separado, conectado al repositorio antiguo `cesartapian/whatsapp-app`, no al nuevo `cesartapian/lamadeja-saas`. El último despliegue observado de `whatsapp-app` estaba en ERROR. La configuración/despliegue del nuevo SaaS en Vercel se tratará **después** de avanzar en Nadia; no bloquear el trabajo de código por ello.

## Esquema técnico para revisión antes de implementar (26-10-2026)

**Alcance de este cambio:** solo diseño; no activar tráfico real ni crear nuevos PR por cada fase. Consolidar la futura implementación y pruebas en **un único PR de código** tras la revisión del esquema. El PR #27 sigue siendo la referencia de diseño.

### Componentes existentes comprobados
- `apps/api`: Express/TypeScript, recepción de webhook Meta con verificación HMAC, persistencia PostgreSQL y worker de entrada.
- `apps/web`: React/Vite, bandeja autenticada.
- Fase 4: cola persistente de respuestas **simuladas** y worker separado; `OUTBOX_MODE=simulated` requiere activación explícita, y `disabled` es el valor por defecto. No existe transporte real de salida.
- Autenticación y pertenencia a organización/tienda ya aplicadas a endpoints; reutilizar estas fronteras, sin cambiar Live Manager.

### Secuencia propuesta
```text
Meta webhook firmado -> durable inbox (evento único)
 -> worker de entrada -> mensaje/conversación persistidos
 -> elegibilidad Nadia (tenant + conversación + política de prueba)
 -> cargar historial acotado y datos comerciales permitidos
 -> NVIDIA NIM desde backend (timeout, cuota, secreto privado)
 -> validar salida (sin afirmaciones comerciales sin fuente)
 -> outbox SIMULADA con clave de idempotencia
 -> bandeja: respuesta sugerida / simulada, nunca «enviada»
```

### Controles y decisiones de diseño
1. **Doble bloqueo:** preferencia `nadia_enabled=true` para nuevas configuraciones, pero `NADIA_EXECUTION_MODE=disabled` por defecto. Solo `simulate` habilita generación y cola simulada en entorno de prueba autorizado; **ningún modo** de este incremento permite envío real a Meta. El botón de pausa tiene precedencia sobre cualquier configuración.
2. **Alcance del botón (propuesta a confirmar):** por conversación, con valor heredado de configuración por tenant. Mostrar estado efectivo y permitir pausa inmediata. En ausencia de configuración persistida, no asumir autorización para producción.
3. **Deduplicación:** clave de entrada derivada de ID de mensaje Meta + tenant; clave de respuesta derivada de conversación + mensaje entrante + versión de flujo. Persistir la decisión antes de llamar al modelo y evitar ejecución concurrente sobre el mismo mensaje.
4. **Contexto:** últimas N interacciones de la misma conversación y tenant; límites de longitud, sin datos de otros tenants. No usar datos de Shopify/CRM sin integración autorizada. Sin precio/stock comprobado: pedir aclaración o derivar.
5. **NVIDIA:** `NVIDIA_API_KEY` solo backend; modelo configurable por variable privada. No incluir claves, mensajes completos ni datos personales en logs. Error, cuota agotada o timeout: registrar estado seguro, sin respuesta inventada ni reintentos infinitos.
6. **Primera respuesta:** identificarse como «Nadia, asistente virtual con inteligencia artificial». Lenguaje neutro salvo preferencia explícita.
7. **Estados:** `disabled`, `skipped`, `generating`, `simulated`, `retrying`, `failed`; nunca marcar `sent` sin transporte real y confirmación del proveedor.
8. **Límites de integración:** no cambiar repositorios, secretos o despliegues de Live Manager, La Madeja ni WhatsApp antiguo. Oracle Cloud ARM64 queda como destino futuro; aprovisionamiento bloqueado temporalmente por capacidad. Vercel en pausa.

### Entrega agrupada (un solo PR de implementación)
- Migración aditiva: preferencias y registro idempotente de generación por mensaje/tenant; índices y permisos acordes con el aislamiento existente.
- Backend: servicio de contexto, adaptador NVIDIA NIM, política de elegibilidad, integración con worker de entrada y cola simulada.
- Frontend: estado de Nadia y control de pausa; mostrar respuestas simuladas con etiqueta inequívoca.
- Pruebas automáticas: webhook duplicado, concurrencia, tenant cruzado, pausa, primer contacto, desconocimiento de precios, timeout/cuota, reinicio de worker y ausencia de llamadas de salida a Meta.
- Evidencia de validación: tests y typecheck, trazas saneadas y una llamada **real** a NVIDIA únicamente cuando exista credencial aislada y autorización para pruebas; nunca sustituirla por mock y afirmar que fue real.

### Puertas de aceptación
**Puerta A — revisión humana del esquema:** confirmar alcance del interruptor y uso de entorno aislado. **Puerta B — PR único de implementación:** Claude Code revisa observaciones y evidencia. **Puerta C — pruebas reales:** requieren credenciales/entorno aislados; no se bloquea el desarrollo por falta de Oracle. **Puerta D — envío a clientes:** fuera del alcance, exige autorización explícita posterior.
