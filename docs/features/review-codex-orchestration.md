# Coordinación durable Claude → Codex → autorización del propietario

Estado: DISEÑO PARA REVISIÓN CLAUDE. Sin automatización desplegada.

## Intención y alcance
El propietario no debe vigilar comentarios ni reenviar instrucciones entre agentes. Autoriza diseñar el circuito completo; conserva aprobación expresa de cada merge y decisiones funcionales. Este documento no concede autorización de merge ni sustituye #40/#41. Aplicable únicamente a cesartapian/lamadeja-saas. Live Manager, clientes, producción, secretos y envíos reales quedan fuera.

## Resultado observable
Una revisión con cambios del HEAD actual crea exactamente una tarea de corrección. El ejecutor confirma recepción, trabaja en la misma rama, publica commit y evidencia, y provoca nueva revisión. Una revisión aprobada con CI satisfactorio genera una sola solicitud de autorización al propietario. Un merge confirmado libera dependencias y permite seleccionar un issue previamente aprobado. Una mención enviada no cuenta como tarea iniciada.

## Estado y contrato
Persistir cada ciclo por repositorio/PR/HEAD/revisión. Estados:
`review_requested → review_running → changes_requested → task_dispatched → task_acknowledged → task_running → result_verified → review_requested`.
Ruta aprobada: `review_approved → ci_passed → awaiting_owner_merge → merged → next_task_selected`.
Alternativas: `blocked`, `failed`, `cancelled`, `superseded`. Guardar reason_code, timestamps, intento, event_id, task_id, rama/SHA base y resultado; sin credenciales, prompts privados ni datos de clientes. Presentar estado en un issue de coordinación con vínculos a tareas/runs/PR, nunca métricas inventadas.

Propuesta de persistencia: servicio coordinador pequeño con SQLite en volumen durable, transacciones, tabla de eventos y tabla de dispatch outbox; una instancia activa inicialmente. Un comentario/artefacto de Actions no es el almacén transaccional. Si se adopta base remota o más de una réplica, revisar locking y copias antes de desplegar. No usar la base del producto para esta automatización.

## Eventos y validación
- Recibir webhooks GitHub firmados: review/comment normalizado, synchronize, check/workflow completion, closed+merged. Validar firma sobre bytes originales, repo, instalación y remitente; no ejecutar instrucciones arbitrarias de comentarios.
- Aceptar decisiones Claude solo de identidad configurada y verificable, ligadas al SHA completo. Una revisión independiente publicada como propietario exige registro explícito del origen y SHA; no tratar cualquier texto del propietario como resultado Claude.
- Para el bloqueo de workflows que cambian su propia definición, registrar `review_blocked_workflow_change`. Requerir revisión independiente verificable; no llamar aprobado a un check verde cuya acción se omitió. No fusionar para solucionar el bloqueo.
- Al sincronizar HEAD, invalidar revisión/permiso del anterior y cancelar tareas obsoletas. Validar nuevamente PR, rama y SHA antes del push y antes de interpretar resultado.
- Los webhooks no conceden autorización de merge. El coordinador carece de permiso para fusionar. #41 controla por separado la autorización del propietario y comparación atómica de SHA.

## Dispatch y ejecución: capacidad aún no verificada
Definir adaptador `dispatch(taskSpec, idempotencyKey) → taskId`, `status(taskId)`, `cancel(taskId)` con acuse autenticado y resultado verificable. No asumir que existe API pública para reactivar este chat o para crear tareas cloud.

Primera investigación: probar la integración existente de menciones @codex en un issue/PR de ensayo y comprobar task_id/acuse, commit de corrección y nueva revisión. Si no ofrece estos contratos, marcar adaptador no disponible; no sustituirlo por menciones repetidas.

Alternativa concreta: ejecutor Codex CLI en runner separado, invocado por cola autenticada, con credencial compatible de cuenta/proveedor configurada en almacén seguro. Verificar instalación, autenticación, costos y permiso antes de elegirlo; NVIDIA configurada no demuestra compatibilidad como backend Codex. Oracle aún no está provisionado. GitHub-hosted Actions podría alojar tareas acotadas si se verifican cuotas, tiempo y credenciales; no equivale a servidor ni a suscripción ilimitada.

Por tarea: checkout del SHA aprobado, rama autorizada, instrucciones AGENTS/PLAYBOOK, pruebas acotadas, commits y PR sin merge. Credenciales mínimas por repositorio; no exponer secretos a PR externos ni ejecutar workflows de forks con tokens privilegiados. El ejecutor puede escribir ramas, nunca main, ni modificar políticas de autoridad como parte de una corrección ordinaria. Cambios a workflows/gate requieren ciclo de revisión separado. No leer secretos para diagnóstico.

## Idempotencia, fallos y límites
- Unicidad durable por repo/PR/SHA/review_id/acción; webhook repetido no crea tarea adicional.
- Dispatch por outbox con clave estable y proveedor que deduplica; ante timeout consultar por clave/task_id antes de reintentar. Si no puede comprobarse, bloquear como ambiguo, no duplicar ejecución.
- Lease y fencing para coordinadores; un resultado tardío no altera HEAD nuevo. Worker reiniciado recupera tareas por ID, no vuelve a crearlas.
- Heartbeat y deadline configurables por tarea; propuesta inicial acuse 2 minutos, sin progreso 15 minutos y máximo 3 rondas de corrección. Reintentos técnicos limitados con backoff; revisión funcional negativa no dispara bucle infinito.
- CI pendiente mantiene espera; CI fallido crea corrección únicamente con diagnóstico validado. Distinguir fallo de infraestructura de fallo de producto. Checks omitidos no son prueba de revisión.
- Notificar al propietario una vez por bloqueo/solicitud de merge, actualizar el mismo registro. Canal inicial GitHub; otros canales necesitan autorización explícita. No prometer notificación push si las preferencias de GitHub no la entregan.

## Selección del siguiente issue
Tras webhook merged, verificar merged=true y SHA/merge_commit actual con GitHub. Elegir solo issues incluidos en backlog aprobado con dependencias fusionadas, criterios verificables y sin decisión funcional pendiente. Claim atómico del issue impide tareas duplicadas. No deducir autorización por posición en lista o etiqueta genérica. Puede prepararse trabajo independiente durante revisión; no implementar dependencias aún sin fusionar.

## Fases y aceptación
1. Revisión funcional de este diseño por Claude antes de implementación sustancial. Integración de #41 solo con autorización expresa del propietario.
2. Spike del adaptador: tarea de ensayo inocua, sin datos externos, evidencias de dispatch/acuse/resultado y disponibilidad/costo. Si falla, presentar bloqueo concreto; no declarar autonomía.
3. Reducer y almacén transaccional con replay de eventos y pruebas sin red: duplicados/desorden, dos workers, expiración, reinicio, SHA viejo, bot no autorizado y CI omitido.
4. Servicio/webhooks y ejecutor aislado, permisos mínimos y prueba controlada en rama descartable. No merge real durante pruebas.
5. Recorrido completo: revisión pide cambio conocido, tarea corrige, tests y nueva revisión, una solicitud de merge. Espera indefinida sin autorización no produce merge ni trabajo dependiente.
6. Activación gradual y kill switch: deshabilitar dispatch conserva cola/auditoría, cancelar leases, revocar credencial dedicada si procede. Sin cambios en infraestructura productiva.

| Criterio | Evidencia requerida | Estado |
| --- | --- | --- |
| Tarea realmente inicia | task_id y acuse autenticado, no solo comentario | NO EJECUTADO |
| Corrección automática | commit del ejecutor y pruebas, mismo PR | NO EJECUTADO |
| Revisión repetida | decisión Claude para SHA nuevo | NO EJECUTADO |
| Duplicados/reinicio | una tarea por clave tras replay/crash | NO EJECUTADO |
| Control del propietario | aprobación técnica sin autorización jamás fusiona | DISEÑADO; #41 prueba gate por separado |
| Continuidad | siguiente issue aprobado se reclama tras merge confirmado | NO EJECUTADO |
| Bloqueo visible | revisión omitida/inferencia no disponible se muestran como bloqueo | NO EJECUTADO |

## Decisiones y revisión
Detalles técnicos y correcciones: Codex dentro del alcance. Costo nuevo, proveedor pago, acceso externo o cambio de funcionalidad: propietario. Revisión del plan por Claude: PENDIENTE. No hay autorización de implementación integral, despliegue ni merge por el solo registro del diseño. El siguiente paso es validar el contrato del ejecutor; no ampliar E1/E2 ni mezclar este PR con #41/#42.
