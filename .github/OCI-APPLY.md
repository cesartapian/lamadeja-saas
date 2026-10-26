# Reintento de capacidad de lamadeja-dev

El workflow `oci-apply.yml` comprueba el stack en Santiago (`sa-santiago-1`) cada
20 minutos. GitHub puede retrasar los schedules. Debe estar en la rama
predeterminada para que se ejecute automáticamente.

Solo crea un Apply si el último job es un Apply FAILED cuyos logs contienen
`Out of host capacity` o `Out of capacity` (sin distinguir mayúsculas). Un job
activo impide crear otro Apply. Un Apply SUCCEEDED desactiva el workflow mediante
GITHUB_TOKEN, con permiso actions:write. No necesita un PAT.

Sin logs, con errores de API, sin jobs previos, después de un Destroy/Plan o con
otros errores, falla la ejecución sin crear un Apply. El schedule permanece
activo para permitir corregir el problema en OCI; también puede desactivarse en
Actions. Los logs de Terraform no se imprimen, ya que pueden contener secretos.

Configurar en Settings → Secrets and variables → Actions:

- OCI_USER_OCID: OCID del usuario OCI dedicado.
- OCI_TENANCY_OCID: OCID de la tenancy.
- OCI_FINGERPRINT: fingerprint de la API key de ese usuario.
- OCI_PRIVATE_KEY: PEM privado completo, sin contraseña.
- OCI_STACK_OCID: OCID del stack lamadeja-dev.

El usuario necesita leer orm-stacks, inspeccionar/leer/crear orm-jobs en el
compartimento del stack y los permisos sobre los recursos Terraform que cree el
Apply. La lectura de logs debe estar permitida. No conceder administración de la
tenancy para resolver un error de permisos.

El Apply autoaprueba la configuración actual de Terraform: comprobar que el
stack correcto mantiene A1.Flex 1 OCPU / 6 GB antes de activar el workflow.
Después de incorporar el PR y cargar los secretos, ejecutar Run workflow para
validar la conexión. La desactivación ocurre al siguiente chequeo tras el éxito.

Pruebas locales:

```sh
python3 -m unittest discover -s .github/scripts -p 'test_oci_capacity_retry.py'
```
