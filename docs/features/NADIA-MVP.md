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
