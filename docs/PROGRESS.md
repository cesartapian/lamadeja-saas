# Avance de La Madeja SaaS

[Tablero interactivo](progress.html) · [Lista para dejar listo el entorno](ENVIRONMENT_READINESS.md)

## Último resultado: recepción y procesamiento local verificados

El usuario aportó una captura de localhost:5173 mostrando la conversación de prueba y el mensaje sintético recibido. Queda comprobado el recorrido de evento firmado a API local → webhook_inbox persistente → worker → datos de Supabase de desarrollo → lectura autenticada de conversación e hilo en el frontend. La prueba utiliza un evento sintético, sin contacto con Meta ni envío WhatsApp real. El usuario confirmó después la ficha del contacto de prueba. La outbox ya está instalada en el PC: el compositor guardó solicitudes y una ejecución directa devolvió PROCESADO: true. Tras reiniciar el worker con la CA, el usuario aportó una captura con todas las solicitudes visibles en Simulado · sin envío real · Intentos 1/5. Queda validado el éxito de la outbox desde el compositor hasta el worker; la captura no ejercita fallos/reintentos. El despliegue publicado sigue pendiente.

| Fase / hito | Estado | Evidencia | Pendiente |
| --- | --- | --- | --- |
| 1. Identidad y aislamiento | Implementada; acceso local real verificado | Usuario Google real, membresía agent y bandeja autorizada | Acceso desde un dominio publicado |
| 2. Inbox durable y procesamiento | Implementada; prueba local contra Supabase verificada | Evento sintético firmado procesado por worker y visible en la bandeja | Integración Meta real y runtime publicado |
| 3. Bandeja de conversaciones | Implementada; conversación e hilo de prueba verificados | Captura del frontend local con mensaje persistido y lectura autorizada | Recorrido publicado |
| Acceso desde Live Manager | Código preparado en repositorio de origen; por revisar | Origen livemanager.lamadeja.cl; siete pruebas y build aprobados | URL SaaS, revisión y despliegue/configuración del enlace |
| 4. Outbox simulada | Integrada en main; ejecución manual en Supabase procesó una tarea | PC actualizado, compositor guarda solicitudes y processNextOutbox devolvió true | Éxito visual y prueba aislada de reintentos confirmados en PC; desplegar runtime |
| Supabase / Google | Acceso local real verificado | Google/callback, conexión PostgreSQL del PC y lectura autorizada del inbox | Aclarar diagnóstico ampliado y validar runtime publicado |
| WhatsApp controlado | No iniciado | Contrato de simulación documentado | Autorización sandbox, políticas, transporte, reconciliación y recibos |
| Shopify, CRM y asistencia | Alcance por definir | Límites de integración documentados | Definir cada incremento |

## Validación de código

- 16 pruebas backend/TLS aprobadas con PostgreSQL 16 desechable; ninguna omitida en esa ejecución.
- 46 casos de navegador aprobados en escritorio/móvil: 44 de la aplicación y dos del tablero. Pruebas del tablero actualizadas al añadir el acceso desde Live Manager.
- Tipos, lint del compilador y build web aprobados.
- El comando real `npm run worker:outbox` procesó una simulación persistida sin escribir un mensaje real de salida en la base desechable.
- Siete pruebas del enlace Live Manager y su build aprobados; grafo de código actualizado según sus instrucciones.

Estas pruebas automatizadas son distintas de la validación manual del usuario contra Supabase de desarrollo. No se ha habilitado WhatsApp real ni se ha publicado el nuevo frontend.

## Esquema de desarrollo: 004 verificada

El usuario aportó desde SQL Editor la tabla message_outbox, sus restricciones y la unicidad de ámbito de conversations. Después confirmó ambos índices y RLS: `indice_reintentos=true`, `indice_conversacion=true`, `rls_habilitada=true`. No repetir 004 ni 001–003.

## Configuración y autenticación del PC

El usuario creó ambos .env desde las plantillas, instaló dependencias y guardó DATABASE_URL privadamente. Se resolvió SELF_SIGNED_CERT_IN_CHAIN para la conexión básica cargando la CA oficial mediante NODE_EXTRA_CA_CERTS antes de iniciar Node; el usuario confirmó PASS de conexión/autenticación pg con verify-full.

Se detectaron procesos de otra copia del repositorio, claves públicas distintas y una clave de API rechazada con 401. Tras la corrección guiada se alcanzó autorización 403; la consulta por UUID reveló un usuario Google real sin membresía. El usuario creó la membresía mínima agent y la captura posterior muestra lectura autorizada de la bandeja vacía. No se guardan correo, UUID personal, claves ni URI privada en este tablero.

NODE_EXTRA_CA_CERTS debe estar presente en el proceso padre de cada API/worker; ponerlo solo en un .env cargado por la aplicación no configura la confianza de arranque de Node. El diagnóstico ampliado tuvo un fallo genérico que queda por aclarar: agrega opciones de sesión y consulta pg_stat_ssl detrás del pooler. Su resultado no se presenta como aprobado y no invalida la conexión básica/lectura de API observadas.

## Interpretación y cobertura de reintentos

La captura del usuario muestra solicitudes `simulated` con `Intentos 1/5`: éxito en el primer intento, con un máximo de cinco. No son mensajes fallidos. El test SQL aislado nuevo cubre cinco fallos consecutivos con esperas de 30/60/120/240 segundos, estado terminal `failed` y ningún sexto intento; también cubre dos fallos y recuperación en el tercero. La elegibilidad se adelanta solo en la base efímera de pruebas. El éxito real local queda validado; no se presenta la captura como prueba manual de fallos del proveedor. Los fallos anteriores de transacción se revertían y son una categoría diferente.

El usuario actualizó su PC desde main tras integrar PR #11 y ejecutó la prueba filtrada `outbox retries recover on the third attempt or stop after five failures`: una aprobada, cero fallidas, cero omitidas. Esto confirma el caso de fallos/reintentos en una base aislada del PC; la prueba manual de la interfaz contra Supabase confirmó el éxito en el primer intento. No se presenta como un envío WhatsApp real ni una prueba manual de fallos del proveedor remoto.

## Enlace y producción pendientes

Origen confirmado: livemanager.lamadeja.cl. La entrada Conversaciones está preparada en live-manager-cl y se activa con VITE_SAAS_APP_URL. La URL publicada del SaaS sigue sin confirmar; no se transmiten sesiones ni tokens por el enlace. El SaaS usa su propia sesión o Google mediante PKCE.

[Recorrido y activación](LIVE_MANAGER_ENTRY.md). Paso a producción autorizado. Vercel ya respondió HTTP 200 a la consulta autenticada de Cloud: equipo Hobby y dominio livemanager.lamadeja.cl confirmados. No apareció un proyecto del nuevo SaaS en el listado consultado; faltan su destino y el alojamiento de API/workers persistentes. DATABASE_URL ahora está presente en Cloud, pero su configuración no coincide con el endpoint/usuario/base/TLS del desarrollo esperado; no se utilizó para cambios. La conexión de Cloud a Supabase sigue sin validar; la configuración y las pruebas reales realizadas en el PC no se trasladan automáticamente a Cloud.

## Próximos pasos

1. Completada la prueba local de evento sintético, worker, conversación/hilo y ficha detallada del contacto.
2. Outbox/tablero aprobados e integrados mediante PR #10. PC actualizado; compositor y procesamiento manual comprobados. El usuario ya confirmó estado simulado para las solicitudes de prueba. Revisar cobertura de fallos/reintentos antes de publicar. La entrada de Live Manager sigue en su rama local del repositorio separado.
3. Completar acceso a hosting, alojar API/workers y frontend, y configurar callbacks y enlace del dominio publicado.
4. Validar el recorrido publicado antes de habilitar cualquier WhatsApp real.

Actualizar este resumen y progress.html con evidencia observada. Mantener separados implementado, probado con simulación, verificado con servicio real y desplegado. Shopify/CRM/asistencia siguen siendo orientación futura, no fechas comprometidas.
