# Avance de La Madeja SaaS

[Tablero interactivo de fases](progress.html): descargar/abrir el HTML en un navegador para filtrar los estados. Funciona sin red y no contiene credenciales. Es un registro editorial versionado, no telemetría del despliegue.

| Fase / hito | Estado de desarrollo | Evidencia | Pendiente |
| --- | --- | --- | --- |
| 1. Base, identidad y aislamiento | Implementada | API/web, PKCE, correo y membresía; PR #6 integrado | Login con cuenta Google real |
| 2. Recepción e inbox durable | Implementada | Pruebas HMAC, SQL, deduplicación y recuperación | Recorrido con servicios reales; no hay webhooks productivos |
| 3. Bandeja de conversaciones | Implementada | Pruebas de escritorio/móvil, paginación, contactos y errores | Validación con usuario y datos del entorno aislado |
| Acceso desde Live Manager | Código preparado en repositorio de origen; por revisar | Origen `livemanager.lamadeja.cl`; 7 pruebas y build Live Manager aprobados | URL SaaS, revisión/despliegue, configuración OAuth y recorrido real |
| 4. Outbox simulada | Implementada en esta rama; por revisar | Cola persistente, compositor, idempotencia y worker | Revisión, integración y aplicación de migración 004 al entorno aislado |
| Supabase / Google reales | Validación pendiente | Preparación en PR #7 y #8; diagnóstico TLS en #9 | Red PostgreSQL, conexión privada, CA si corresponde, OAuth y membresía real |
| Envío WhatsApp controlado | No iniciado | Contrato de simulación documentado | Autorización sandbox, políticas, transporte, reconciliación y recibos |
| Shopify, CRM y asistencia | Alcance por definir | Límites de integración documentados | Definir el incremento antes de implementarlo |

## Validación de este incremento

- 15 pruebas backend/TLS aprobadas; ninguna omitida al ejecutar con PostgreSQL 16 desechable.
- 46 casos de navegador aprobados en escritorio/móvil: 44 de la aplicación y 2 del tablero.
- Tipos, lint del compilador y build web aprobados.
- `npm run worker:outbox` procesó una solicitud persistida contra PostgreSQL 16 sin escribir ningún mensaje real de salida.
- La prueba de concurrencia comprobó bloqueo, procesamiento paralelo y recuperación tras desconexión.

Esta evidencia no valida Supabase remoto ni Google real. La migración 004 solo se ejecutó en bases de prueba; ninguna base cloud o productiva fue modificada.

## Enlace desde Live Manager

El origen confirmado es `https://livemanager.lamadeja.cl`. Se preparó una entrada **Conversaciones** en el repositorio `live-manager-cl`, configurada mediante `VITE_SAAS_APP_URL` y oculta hasta tener un destino válido. La URL publicada del nuevo frontend sigue sin confirmar. El enlace no comparte sesiones ni transmite tokens: el SaaS restaura su propia sesión o pide Google mediante PKCE.

[Recorrido, activación y validación pendientes](LIVE_MANAGER_ENTRY.md). Código local preparado; no publicado ni desplegado.

## Pendiente manual: migración 004 en Supabase

**Estado:** pendiente; todavía no aplicada al proyecto de desarrollo. **Responsable del siguiente paso:** usuario, desde el SQL Editor de Supabase. Se deja registrado para retomarlo más adelante; no bloquea seguir construyendo con pruebas sintéticas.

**Motivo:** esta sesión Codex Cloud no tiene un conector Supabase disponible ni `DATABASE_URL` configurada, y la conexión PostgreSQL directa al puerto 5432 fue rechazada. No se ha confirmado que añadir un MCP en el cliente local lo habilite en esta sesión Cloud.

**Acción al retomarlo:** abrir únicamente el proyecto de desarrollo `lamadeja-saas-dev` (`ropciikoozdbvsmiulhh`), comprobar que 001–003 estén aplicadas y que 004 no exista, y ejecutar [004_simulated_outbox.sql](../packages/database/migrations/004_simulated_outbox.sql) en SQL Editor. No repetir 001–003. Después comprobar la tabla `message_outbox`, sus índices, restricciones y RLS, y registrar el resultado aquí. La ejecución debe realizarse una sola vez; si ya existe total o parcialmente, inspeccionar el estado antes de reintentarlo.

No compartir contraseñas ni tokens en el chat. No se ha conectado ni modificado ninguna base productiva.

## Cómo mantener el tablero

Actualizar este archivo y `progress.html` cuando cambie una fase, se revise/integre su PR o se valide una integración real. Mantener separados **implementado**, **probado con simulación**, **verificado con servicio real** y **desplegado**. Añadir el resultado verificable y no convertir una aprobación de código en una afirmación de funcionamiento real. El hito de Shopify/CRM/asistencia es orientación futura, no una fase ya especificada ni una fecha comprometida.

Siguiente paso: revisar este incremento. Después, aplicar 004 al entorno aislado autorizado y validar acceso real antes de habilitar un transporte WhatsApp.
