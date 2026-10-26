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

- 24 pruebas de scripts/backend/TLS aprobadas con PostgreSQL 16 desechable; ninguna omitida en esa ejecución.
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

## Runtime remoto y prueba real aprobados

Se añadieron imágenes Docker de API/workers y frontend, configuración Vercel y Compose, preparación basada en DB/ciclos, apagado ordenado y recuperación de desconexiones del pool. Los workers ejecutables se limitan al ámbito configurado. La prueba de contenedores con PostgreSQL 16 desechable verificó procesamiento, aislamiento, SIGTERM, fallo de preparación y recuperación tras caída de la base.

El workflow Real development integration [pasó en Actions](https://github.com/cesartapian/lamadeja-saas/actions/runs/40229617433): 21 comprobaciones distintas de Auth auténtico, TLS verificado, API, aislamiento, deduplicación, workers, navegador y outbox simulada. El artefacto summary.json confirma status=passed y fixture_cleanup_complete=true. No usó mocks ni envió WhatsApp. La cuenta dedicada y los cinco secretos están configurados. Cloud recuperó acceso de lectura y confirmó directamente la ejecución y su artefacto. Google interactivo y el dominio público siguen pendientes. [Contrato y configuración](STAGING.md).

## Opciones de alojamiento sin cuota mensual

[Comparación y requisitos](HOSTING_OPTIONS.md): Oracle Always Free es candidato para Docker con los workers actuales, sujeto a capacidad, cuotas y recuperación de instancias inactivas. Render/Koyeb gratuitos tienen suspensión y límites de workers; Railway ofrece crédito limitado. No se contrató ni provisionó ningún servicio.

## Enlace y producción pendientes

Origen confirmado: livemanager.lamadeja.cl. La entrada Conversaciones está preparada en live-manager-cl y se activa con VITE_SAAS_APP_URL. La URL publicada del SaaS sigue sin confirmar; no se transmiten sesiones ni tokens por el enlace. El SaaS usa su propia sesión o Google mediante PKCE.

[Recorrido y activación](LIVE_MANAGER_ENTRY.md). Paso a producción autorizado. Vercel ya respondió HTTP 200 a la consulta autenticada de Cloud: equipo Hobby y dominio livemanager.lamadeja.cl confirmados. No apareció un proyecto del nuevo SaaS en el listado consultado; faltan su destino y el alojamiento de API/workers persistentes. La prueba de Actions sí verificó la conexión TLS a Supabase y el recorrido completo en un runner remoto. Esto no equivale a un servicio permanente publicado. No hay credenciales de un proveedor de API/workers entre las disponibles; elegir alojamiento y revisar costo sigue pendiente.

## Próximos pasos

1. Completada la prueba local de evento sintético, worker, conversación/hilo y ficha detallada del contacto.
2. Outbox/tablero aprobados e integrados mediante PR #10. PC actualizado; compositor y procesamiento manual comprobados. El usuario ya confirmó estado simulado para las solicitudes de prueba. Revisar cobertura de fallos/reintentos antes de publicar. La entrada de Live Manager sigue en su rama local del repositorio separado.
3. Completar acceso a hosting, alojar API/workers y frontend, y configurar callbacks y enlace del dominio publicado.
4. Validar el recorrido publicado antes de habilitar cualquier WhatsApp real.

Actualizar este resumen y progress.html con evidencia observada. Mantener separados implementado, probado con simulación, verificado con servicio real y desplegado. Shopify/CRM/asistencia siguen siendo orientación futura, no fechas comprometidas.

## Continuación sin servidor Oracle

La creación de A1 en AD-1 devolvió falta de capacidad y el usuario decidió posponerla. No existe despliegue Oracle verificado ni costo cero confirmado. La prueba real de Actions sigue aprobada y permite avanzar sin depender del PC. El siguiente ajuste corrige hilo/vista previa para ordenar por coalesce(sent_at, created_at), con id como desempate y timestamp de vista previa coherente; cubre llegadas tardías, valores nulos y paginación en ambos sentidos. El plan de implementación ya distingue tareas completadas de publicación y transporte Meta pendientes.

## Preparación del transporte sandbox

Diseño y contrato de decisiones en [WHATSAPP_SANDBOX_DESIGN.md](WHATSAPP_SANDBOX_DESIGN.md): claims, resultados inciertos sin reenvío automático, límite de intentos y política de destinatarios/ventana. Funciones puras con pruebas unitarias; no están conectadas al runtime ni a persistencia. Siguen pendientes la migración/claims transaccionales, receipts y adaptador Meta. No se enviaron mensajes reales.

## Persistencia sandbox preparada

Migración 005 y repositorio transaccional independientes de la outbox simulada: idempotencia, claims con SKIP LOCKED, tokens nuevos, control de versión, reloj de PostgreSQL y recuperación por ámbito. Pruebas con conexiones independientes verifican concurrencia, aislamiento, reintentos limitados y fallo de persistencia después de aceptación. Los estados inciertos no vuelven a cola. La migración solo se ejecutó en base desechable; Supabase y el smoke real actual siguen con 001–004. Sin API/worker sandbox, scheduler, adaptador Meta ni envíos reales.

Validación del incremento de persistencia: suite completa con PostgreSQL 16 desechable, 36 pruebas aprobadas (6 scripts y 30 API, incluidos subcasos), ninguna omitida; tablero en escritorio/móvil aprobado, tipos y lint correctos. No se presenta como migración aplicada ni como prueba Meta real.

Tras la revisión de Claude se añadió comprobación transaccional de membresía al encolar y manejo del evento de error de la conexión activa; si falla la conexión/rollback, se descarta del pool. La prueba termina deliberadamente un backend PostgreSQL y confirma rollback, recuperación del pool e idempotencia al repetir la solicitud.

## Migración 005 aplicada en desarrollo

El 26 de octubre, por autorización explícita del usuario, se aplicó únicamente 005 del PR #18 ya integrado. Preflight confirmó ausencia de tabla/constraint; transacción DDL con límites de espera; verificación posterior confirmó cola vacía, RLS, cero políticas de navegador, restricciones e índices. Los conteos de usuarios, membresías, tiendas, conversaciones y mensajes permanecieron iguales. No se repitió ninguna migración anterior. El workflow real se amplía para probar el repositorio compilado en el tenant temporal y borrar sandbox_dispatch durante la limpieza. La ejecución ampliada [40270492905](https://github.com/cesartapian/lamadeja-saas/actions/runs/40270492905) pasó: 28 comprobaciones y fixture_cleanup_complete=true. Sin transporte ni entrega Meta real.

## Confirmaciones de entrega en desarrollo

006 y worker entrante: confirma firma, persiste/deduplica statuses, aísla por canal/tenant/destinatario y mantiene una proyección sin retrocesos (read > delivered > failed > sent), separada del estado accepted. Conserva receipts anticipados y permite conciliarlos por lotes sin bloquearse con filas ya consistentes. Pendiente revisión/merge, aplicación de 006 y prueba remota ampliada. Sin transporte Meta ni scheduler de envío.

## Receipts integrados y siguiente incremento

PR #21 aprobado por Claude tras corregir concurrencia por mensaje y tolerancia a statuses no soportados. 006 aplicada y verificada en desarrollo. Ejecución real [40320701757](https://github.com/cesartapian/lamadeja-saas/actions/runs/40320701757) aprobada con 33 comprobaciones, limpieza completa y cero envíos reales. El adaptador sandbox se prepara en la siguiente rama: no está montado ni tiene credenciales/configuración activa; pruebas con transporte inyectado.
