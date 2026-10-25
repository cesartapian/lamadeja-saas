# Lista para dejar listo el entorno

Estado comprobado desde esta sesión Cloud. Los datos y configuración del PC no son visibles aquí; primero comprobar lo que ya exista antes de volver a configurar cuentas o credenciales.

| Orden | Punto | Estado comprobado | Criterio para cerrarlo |
| --- | --- | --- | --- |
| 1 | Código y revisión | Outbox/tablero y entrada Live Manager preparados en ramas locales; no se encontraron PR abiertos de esas ramas | Publicar/revisar los cambios por el flujo acordado e integrar solo lo aprobado |
| 2 | Esquema Supabase | Verificado por resultados del usuario: tabla, restricciones, ambos índices y RLS de 004 | Cerrado: esquema de desarrollo verificado; no repetir 004 |
| 3 | Google OAuth y cuentas | Verificado: usuario Google real, membresía agent y lectura autorizada de bandeja vacía en localhost | Cerrado para acceso local; falta validar el dominio publicado |
| 4 | PostgreSQL/TLS real | PC: conexión/autenticación pg con verify-full confirmó PASS tras cargar CA; diagnóstico ampliado aún por aclarar. Cloud sin conexión privada | Conexión, lectura API y worker con evento sintético comprobados en Supabase de desarrollo; diagnóstico ampliado pendiente de aclarar |
| 5 | Alojamiento API y workers | Plataforma/URL del backend nuevo sin confirmar | Seleccionar un runtime compatible con API Express y workers persistentes, configurar variables privadas y comprobar arranque y recuperación; no basta publicar el frontend en Vercel |
| 6 | Frontend SaaS y Vercel | URL SaaS no confirmada; requisito VERCEL_TOKEN sin valor guardado | Acceso seguro al proyecto/equipo Vercel, frontend publicado con Auth/API reales y rutas de callback operativas |
| 7 | Enlace y recorrido completo | Origen confirmado livemanager.lamadeja.cl; entrada Conversaciones preparada pero no activada | Configurar VITE_SAAS_APP_URL con el destino real, reconstruir Live Manager y probar Google → membresía → inbox → simulación |

## Primera comprobación en el PC

Abrir [SQL Editor del proyecto de desarrollo](https://supabase.com/dashboard/project/ropciikoozdbvsmiulhh/sql/new). Confirmar que el proyecto sea **lamadeja-saas-dev**, referencia `ropciikoozdbvsmiulhh`.

Ejecutar [check-development-readiness.sql](../scripts/sql/check-development-readiness.sql). Es una transacción de solo lectura que consulta metadatos. No instala migraciones ni lee correos, clientes, mensajes o secretos. Si `message_outbox` no existe, 004 sigue pendiente; si existe, inspeccionar sus restricciones e índices antes de ejecutar nada. No repetir 001–003 ni asumir que una tabla parcialmente creada equivale a una migración completa.

## Configuración del PC comprobada

El usuario ejecutó `Test-Path` desde la raíz local y confirmó que `apps/api/.env` y `apps/web/.env` no existen. Crear ambos desde sus `.env.example`, sin sobrescribir archivos existentes. Después configurar el proyecto de desarrollo, clave pública, correo autorizado, IDs del tenant documentado y conexión privada; no iniciar con placeholders. El usuario confirmó después la creación de ambos archivos y la configuración inicial de URL/clave pública/correo/IDs. El helper guardó DATABASE_URL en el PC sin imprimirla; npm ci instaló 140 paquetes y reportó cero vulnerabilidades. La CA oficial se cargó mediante NODE_EXTRA_CA_CERTS antes de iniciar Node. El usuario reportó PASS en la conexión directa con pg tras el error inicial SELF_SIGNED_CERT_IN_CHAIN. La prueba ampliada falló con un mensaje genérico; su diferencia con la conexión básica (opciones de sesión/consulta de pg_stat_ssl detrás del pooler) sigue pendiente de aclarar. Los IDs de ejemplo antiguos no cumplen la validación UUID: usar los del entorno aislado documentado, no inventar identidades de usuarios. Las credenciales se introducen solo en los archivos privados del PC o ajustes seguros, nunca en el chat ni en Git.

## Después, autenticación

En ese mismo proyecto, comprobar Authentication → Providers → Google; verificar primero si ya existe la configuración del cliente OAuth y los usuarios de prueba. El callback de Google apunta al Auth de Supabase (`https://ropciikoozdbvsmiulhh.supabase.co/auth/v1/callback` en este entorno dev). La lista de redirecciones de Supabase admite el callback del frontend, por ejemplo `http://localhost:5173/auth/callback` para prueba local; la dirección productiva se añade cuando exista, no se inventa.

La membresía debe referenciar al usuario **real** de ese mismo proyecto Auth, creado al autenticarse. No sembrar usuarios ficticios ni relajar los controles para forzar un resultado exitoso.

## Accesos y publicación

- Vercel: entrar a la cuenta/equipo existente y comprobar los proyectos. El token personal se introduce solo en los ajustes seguros del entorno si se decide que Cloud opere la API; el requisito `VERCEL_TOKEN` está guardado pero no tiene binding. No compartirlo en el chat.
- PostgreSQL: la conexión privada y, si corresponde, la CA se configuran en el PC/runtime que hará la prueba. El token HTTP de Vercel o una clave pública de Supabase no reemplazan la conexión de base de datos.
- Runtime backend: usar una opción existente compatible cuando la haya. No habilitar planes, complementos ni infraestructura de pago sin confirmación del coste y autorización.
- Las sesiones del PC y Cloud son distintas. Guardar valores en el PC no los inyecta automáticamente en Cloud, ni un conector MCP local garantiza herramientas en esta sesión.

## Recepción local: validación completada

El usuario confirmó que el evento sintético firmado pasó por API → inbox → worker → Supabase y apareció como conversación/mensaje en el frontend. También confirmó la ficha del contacto de prueba. El usuario ejecutó Test-Path para apps/api/src/outboxWorker.ts y obtuvo false: la outbox todavía no está instalada en esa copia del PC. Antes de probarla, publicar y revisar/integrar los cambios preparados en Cloud mediante el flujo de PR acordado. Después actualizar la copia correcta del PC, instalar dependencias con npm ci, configurar OUTBOX_MODE=simulated en el .env privado de la API, reiniciar API y arrancar npm run worker:outbox con la CA. No repetir 004: su esquema de desarrollo ya quedó verificado.

## Listo significa

Código revisado y disponible en los repositorios; esquema verificado; login real y autorización comprobados; PostgreSQL/TLS funcional desde el runtime; API/workers arrancan con datos persistentes; frontend tiene URL y configuración correctas; enlace desde Live Manager funciona y no transfiere tokens. La simulación completa debe terminar con estado `simulated`, sin envíos WhatsApp reales. La habilitación de WhatsApp sandbox/productivo es un incremento separado.

Actualizar [el tablero](progress.html) y [el resumen](PROGRESS.md) con resultados observados, manteniendo separados preparado, verificado y desplegado.
