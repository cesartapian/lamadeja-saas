# Alojamiento del entorno de desarrollo

Consulta de documentación oficial: 25 de octubre de 2026. No se creó una cuenta, servidor, suscripción ni servicio de pago.

## Recursos necesarios

El frontend puede publicarse en Vercel. La API Express y los dos workers necesitan ejecución persistente, acceso TLS al pooler de Supabase, secretos inyectados en runtime y una CA montada. Compose ya empaqueta esos tres procesos; el frontend público debe alcanzar la API mediante HTTPS. Solo la API necesita un puerto público; base y workers no deben exponerse.

| Opción | Oferta gratuita y límite observado | Encaje |
| --- | --- | --- |
| Oracle Cloud Always Free | Instancias elegibles dentro de cuotas; disponibilidad sujeta a capacidad. Oracle puede recuperar instancias consideradas inactivas. | Candidato para ejecutar Docker y conservar los workers actuales; requiere cuenta, capacidad, operación del servidor y acceso de despliegue. No garantiza continuidad. |
| Render Free | Web services se suspenden después de 15 minutos sin tráfico; horas gratuitas limitadas. | Demo de API, no sustituye por sí sola el alojamiento de los workers persistentes. |
| Koyeb Free | Una instancia de 512 MB/0.1 vCPU por organización; no admite Worker Services y se reduce a cero tras una hora sin tráfico. | No encaja con el despliegue actual de API más workers separados. |
| Railway Free | USD 1 de crédito mensual; no acredita consumo suficiente para tres procesos continuos. | No prometer operación gratuita permanente; medir consumo y revisar límites primero. |

## Intento de aprovisionamiento

La selección de VM.Standard.A1.Flex llegó a devolver `Out of capacity` en AD-1. El usuario pospuso la creación. No hay VM creada/verificada y el costo del disco no quedó confirmado como cero. No cambiar a recursos de pago para sortear el bloqueo.

## Siguiente decisión

Si se prioriza costo cero y se aceptan disponibilidad y mantenimiento, comprobar primero una cuenta Oracle Always Free y capacidad para una VM elegible, sin actualizarla a un plan de pago. No hay credenciales de Oracle ni un servidor existente configurado en esta tarea. No se eligió proveedor de forma definitiva.

Antes de desplegar: confirmar elegibilidad/cuotas de todos los recursos (VM, disco, red/IP), arquitectura compatible y conectividad Supabase. El Dockerfile usa imágenes multi-arquitectura, pero las verificaciones actuales corrieron en x86; ARM necesitará su propia compilación/prueba. Configurar TLS de entrada y un destino real para la API; montar CA y archivo privado de entorno; comprobar `/ready` y workers; publicar frontend y callback; luego activar el enlace de Live Manager. No transferir tokens entre aplicaciones. La prueba real de Actions ya está aprobada, pero no equivale a este despliegue permanente.

## Fuentes oficiales

- [Oracle Always Free: recursos y recuperación de instancias inactivas](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Render Free: suspensión y cuotas](https://render.com/docs/free)
- [Koyeb: limitaciones de Free Instances](https://www.koyeb.com/docs/reference/instances)
- [Railway: planes y créditos](https://docs.railway.com/reference/pricing/plans)

Las condiciones pueden cambiar. Verificar el resumen de costos del proveedor antes de crear recursos; no habilitar facturación ni comprar servicios sin aprobación del usuario.
