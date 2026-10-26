# Nadia MVP — evidencia del PR #28

## Alcance confirmado

Pausa **solo por conversación**. La activación técnica requiere modo simulated explícito, outbox simulada y credenciales/modelo NVIDIA configurados. La conversación inicia activa por defecto después de esa activación. No hay interruptor global ni envío WhatsApp real.

| ID | Escenario | Evidencia ejecutada | Estado |
| --- | --- | --- | --- |
| CA-01 | Primera identificación como IA Nadia | Adaptador antepone identidad por código; pruebas de primer turno/continuación | APROBADO (transporte sintético) |
| CA-02 | Inferencia real NVIDIA | Prueba omitida por instrucción explícita del usuario; script preparado, modelo/cuota no verificados | NO EJECUTADO (dispensado) |
| CA-03 | Pausa por conversación | API PostgreSQL y UI escritorio/móvil; pausa cancela pendientes, no afecta otras conversaciones ni simulación manual | APROBADO |
| CA-04 | Webhook duplicado | ID entrante único → un run → una salida simulada; repeticiones y claims obsoletos probados | APROBADO |
| CA-05 | Aislamiento | Jobs elegibles de otro tenant permanecen pendientes y su contenido no entra al modelo | APROBADO |
| CA-06 | Error/cuota/timeout | Dos intentos máximos, retraso y límite de concurrencia; sin respuesta inventada; adaptador con deadline efectivo | APROBADO (errores inyectados) |
| CA-07 | No inventar datos / lenguaje neutral | Política de sistema probada; evaluación semántica real omitida junto con la prueba NVIDIA | NO EJECUTADO (modelo real) |
| CA-08 | Bandeja diferencia Nadia de envío real | Etiquetas Nadia/IA/Simulado, permiso de pausa no cierra sesión | APROBADO (API sintética en navegador) |
| CA-09 | Esquema remoto 007 | 007 aplicada y verificada en Supabase de desarrollo: RLS, índices, FK, atribución y datos anteriores preservados | APROBADO (metadatos remotos) |

## Comandos y resultados

- `TEST_DATABASE_URL=<base desechable> npm test`: 60 aprobadas, ninguna omitida (6 scripts y 54 backend, incluidos subcasos).
- Playwright con `/workspace/lamadeja-cloud/playwright.config.cjs`: 50 casos aprobados en escritorio/móvil. Las API/Auth se interceptan con datos sintéticos.
- `npm run test:containers`: 21 comprobaciones aprobadas, PostgreSQL 16 desechable. El worker NVIDIA no se activa en esta suite.
- `npm run typecheck`, `npm run lint`, builds API/web: aprobados.
- Targeted Nadia SQL/adaptador: 16 pruebas aprobadas después de los últimos ajustes de límites.
- Ninguna llamada NVIDIA ni WhatsApp real se presenta como ejecutada. Los tests de inferencia usan transportes/proveedores explícitamente inyectados.

## Validación real omitida por instrucción del usuario

El usuario indicó explícitamente omitir la prueba real y aplicar 007. La prueba real no bloquea esta revisión y no se marca como aprobada. El runtime permanece disabled y no se invocó NVIDIA ni Meta.

Si se retoma esa validación en otro momento: cargar NVIDIA_API_KEY en el campo seguro preparado para integrate.api.nvidia.com, publicar la configuración y confirmar cuota gratuita/disponibilidad de NADIA_MODEL. Ejecutar explícitamente NADIA_RUN_REAL_NIM=1 npm run test:nadia:real con prompt sintético (una solicitud, 256 tokens máximos, sin publicar contenido). Registrar resultado y evaluar la respuesta en un entorno de prueba antes de marcar el MVP como validado. 007 ya está aplicada por autorización explícita; no repetirla. La activación/despliegue permanece separado de la revisión del código.
