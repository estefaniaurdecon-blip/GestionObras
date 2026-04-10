# FAQ Android oficial

## Fuente prioritaria
- Base derivada de `FAQ_Android_GestionObras_v1.md`.
- Describe la app Android activa y debe mandar sobre conocimiento generico si hay conflicto.
- No usar esta FAQ para inventar OCR ni pantallas no documentadas.

## Modulo: acceso
### Como inicio sesion en la app?
- Variantes: como entro | iniciar sesion | acceder a la aplicacion | donde pongo mi usuario
- Respuesta canonica: Abre la pantalla de acceso, introduce tu email y tu contrasena y pulsa `Iniciar sesion`.
- Ubicacion: Pantalla inicial de Auth.
- Restricciones / notas: La opcion de recordar solo guarda el email.

### Que hago si me pide verificacion MFA?
- Variantes: me pide un codigo | mfa | doble factor | autenticador de 6 digitos
- Respuesta canonica: Introduce el codigo de 6 digitos de tu app autenticadora y pulsa `Verificar`.
- Ubicacion: Flujo de login tras enviar email y contrasena.

### Como recupero mi contrasena?
- Variantes: he olvidado mi contrasena | no recuerdo la clave | recuperar acceso | enviar enlace de recuperacion
- Respuesta canonica: En la pantalla de login pulsa `Olvide mi contrasena`, introduce tu email y pulsa `Enviar enlace`.
- Ubicacion: Pantalla de Auth.

### Puedo entrar sin conexion?
- Variantes: modo offline | sin internet | no tengo red | entrar offline
- Respuesta canonica: Si, pero solo si ese usuario ya inicio sesion online al menos una vez en ese mismo dispositivo y existen credenciales locales validas.
- Ubicacion: Mismo flujo de login.
- Restricciones / notas: La sincronizacion queda pendiente hasta recuperar conexion.

## Modulo: dashboard
### Que secciones principales tiene la app?
- Variantes: que pestanas hay | que puedo hacer en la app | donde esta cada modulo | navegacion principal
- Respuesta canonica: La navegacion principal visible se organiza en `Partes de trabajo`, `Control de accesos`, `Obras` y `Analisis economico`.
- Ubicacion: Barra de pestanas principal bajo la cabecera.
- Restricciones / notas: La cabecera incorpora tambien notificaciones, Radar de Obras, ajustes y salida de sesion.

### Donde veo las notificaciones?
- Variantes: abrir notificaciones | campana | avisos | mensajes del sistema
- Respuesta canonica: Las notificaciones se abren desde el icono de campana en la cabecera superior.
- Ubicacion: Cabecera principal.

### Que es Radar de Obras y como entro?
- Variantes: radar | globo | mapa de obras | donde esta radar de obras
- Respuesta canonica: Radar de Obras se abre desde el boton con icono de globo en la cabecera superior.
- Ubicacion: Cabecera principal.

### Como cierro sesion?
- Variantes: salir | logout | cerrar mi sesion | desconectarme
- Respuesta canonica: Usa el boton `Salir` de la cabecera superior.
- Ubicacion: Cabecera principal.

## Modulo: partes
### Como creo un parte nuevo?
- Variantes: nuevo parte | generar parte | anadir parte | hacer un parte diario
- Respuesta canonica: Dentro de `Partes de trabajo` usa la accion `Generar parte`.
- Ubicacion: Pestana principal `Partes de trabajo`.

### Donde consulto el historial de partes?
- Variantes: historico | partes anteriores | buscar un parte antiguo | ver partes guardados
- Respuesta canonica: El historial esta dentro del mismo modulo en `Historial de partes`.
- Ubicacion: Partes de trabajo > herramientas del modulo > `Historial de partes`.

### Puedo clonar un parte anterior para reutilizarlo?
- Variantes: duplicar parte | copiar parte | usar un parte anterior como plantilla | repetir parte
- Respuesta canonica: Si. Desde el historial o la lista de partes existen acciones para reutilizar informacion previa, incluida la clonacion.
- Ubicacion: Partes de trabajo, especialmente dentro del historial.

### Como exporto partes o saco un resumen?
- Variantes: exportar excel | sacar informe | descargar partes | resumen de partes
- Respuesta canonica: Usa `Exportacion masiva` o `Informe resumen`.
- Ubicacion: Partes de trabajo > herramientas superiores del modulo.

### Que significa que a un parte le falten albaranes?
- Variantes: faltan albaranes | por que no esta completo | incidencia de albaranes
- Respuesta canonica: Indica que la informacion de materiales o justificantes asociados no esta completa y conviene revisar la bandeja o la documentacion vinculada.

### Puedo eliminar un parte?
- Variantes: borrar parte | quitar parte | eliminar definitivamente
- Respuesta canonica: Si, existe una accion de eliminacion con confirmacion explicita.
- Restricciones / notas: Es una accion destructiva y permanente.

## Modulo: accesos
### Como creo un registro de control de accesos?
- Variantes: nuevo acceso | nuevo registro | control de entradas | registrar acceso
- Respuesta canonica: Dentro de `Control de accesos` pulsa `Nuevo registro`.
- Ubicacion: Pestana principal `Control de accesos`.

### Como guardo o cargo los datos de control de accesos?
- Variantes: guardar datos | cargar datos | importar json | exportar registros de accesos
- Respuesta canonica: Usa `Gestion de datos` y despues `Guardar datos` o `Cargar datos`.
- Ubicacion: Control de accesos > boton `Gestion de datos`.

### Como genero un informe de accesos?
- Variantes: informe de accesos | sacar reporte | generar informe
- Respuesta canonica: Usa la accion `Generar informe`.
- Ubicacion: Control de accesos > boton `Generar informe`.

### Se pueden editar o duplicar registros de accesos?
- Variantes: editar registro | clonar acceso | borrar accesos
- Respuesta canonica: Si. El modulo contempla acciones de edicion, clonacion y borrado.
- Ubicacion: Lista de registros dentro de Control de accesos.

## Modulo: obras
### Como creo una obra nueva?
- Variantes: nueva obra | anadir obra | alta de obra | crear registro de obra
- Respuesta canonica: En `Obras` usa el boton `Nuevo registro`.
- Ubicacion: Pestana principal `Obras` > subpestana `Obras`.

### Que datos basicos pide una obra?
- Variantes: campos de obra | que tengo que rellenar | datos obligatorios de una obra | ficha de obra
- Respuesta canonica: Los campos visibles incluyen `Numero de Obra`, `Nombre de la Obra`, direccion, promotor, presupuesto, plazo de ejecucion y datos de contacto.
- Restricciones / notas: `Numero de Obra` y `Nombre de la Obra` figuran como obligatorios.

### Puedo obtener coordenadas desde la direccion?
- Variantes: buscar coordenadas | gps desde direccion | geolocalizar obra
- Respuesta canonica: Si. En la ficha de obra existe la accion `Buscar Coordenadas desde Direccion`.

### Como entro en la gestion detallada de una obra?
- Variantes: abrir inventario de una obra | entrar en gestion de obra | menu de una obra | acciones de obra
- Respuesta canonica: Cada obra dispone de un menu de acciones desde el que puedes abrir su gestion especifica.
- Ubicacion: Lista de obras > menu de acciones sobre la obra.
- Restricciones / notas: Desde ahi accedes a inventario, maquinaria de alquiler, repasos, postventa o asignacion de encargado segun permisos.

### Que es la Cartera de empresas?
- Variantes: empresas | cartera | proveedores | subpestana de empresas
- Respuesta canonica: Dentro del modulo de Obras existe una segunda subpestana llamada `Cartera de empresas`.

## Modulo: gestion_obra
### Que apartados tiene la gestion de obra?
- Variantes: pestanas dentro de una obra | que hay al abrir una obra | gestion interna de obra
- Respuesta canonica: La pantalla de gestion de obra muestra `Inventario`, `Maq. Alquiler`, `Repasos` y `Post-Venta`.
- Restricciones / notas: Si el usuario no es administrador o jefe de obra, algunas pestanas pueden aparecer deshabilitadas.

## Modulo: inventario
### Que pestanas hay dentro del inventario de una obra?
- Variantes: dashboard inventario | albaranes | materiales | herramientas | pantalla de inventario
- Respuesta canonica: El inventario de obra se organiza en `Dashboard`, `Albaranes`, `Materiales` y `Herramientas`.
- Ubicacion: Gestion de obra > Inventario.

### Como recalculo el inventario desde los partes?
- Variantes: recalcular inventario | actualizar inventario | sincronizar materiales desde partes | reconstruir inventario
- Respuesta canonica: En el panel de acciones del inventario existe el boton `Recalcular desde partes`.
- Ubicacion: Gestion de obra > Inventario > panel `Acciones de Obra`.

### Como exporto el inventario o los albaranes?
- Variantes: exportar inventario | descargar excel de inventario | exportar albaranes
- Respuesta canonica: Existen acciones separadas para `Exportar Excel` y `Exportar Albaranes`.
- Ubicacion: Gestion de obra > Inventario > panel `Acciones de Obra`.

### Donde reviso los albaranes procesados por IA?
- Variantes: bandeja de albaranes | revisar albaranes IA | entrada de albaranes | validar albaranes escaneados
- Respuesta canonica: Los albaranes procesados por IA se revisan en `Bandeja de Entrada de Albaranes`.
- Ubicacion: Gestion de obra > Inventario > pestana `Albaranes`.

### Que hago con un albaran detectado por IA?
- Variantes: validar albaran | rechazar albaran | corregir datos IA | ingresar al inventario
- Respuesta canonica: Revisa y corrige los datos detectados y despues decide entre `Rechazar` o `Validar e Ingresar`.
- Ubicacion: Gestion de obra > Inventario > Albaranes > detalle del albaran.
- Restricciones / notas: Si hay materiales marcados como `Consumo Inmediato`, deben quedar asignados a una obra especifica.

### El escaneo IA de albaranes funciona en cualquier plataforma?
- Variantes: escanear ia | sacar foto al albaran | android o web | por que no me deja escanear
- Respuesta canonica: No. El flujo de `Escanear IA` esta restringido a Android nativo.

### Que herramientas de mantenimiento tiene el inventario?
- Variantes: validar y corregir | limpiar servicios | fusionar proveedores | mantenimiento del inventario
- Respuesta canonica: El inventario incorpora `Limpiar Servicios`, `Validar y Corregir` y fusion de proveedores cuando se han seleccionado varios.
- Ubicacion: Gestion de obra > Inventario > panel `Mantenimiento`.

### Puedo buscar o filtrar materiales y herramientas?
- Variantes: buscar material | filtrar inventario | limpiar filtros | buscar por codigo o marca
- Respuesta canonica: Si. Puedes filtrar por nombre, codigo o marca y aplicar filtros por mes y ano, ademas de `Limpiar filtros`.
- Ubicacion: Gestion de obra > Inventario > panel `Busqueda`.

## Modulo: notificaciones
### Como marco todas las notificaciones como leidas?
- Variantes: marcar todas | quitar avisos pendientes | leer todo | vaciar la campana
- Respuesta canonica: En la bandeja existe la accion `Marcar todas`.
- Ubicacion: Cabecera > campana > panel de notificaciones.

### Que hago si no veo ninguna notificacion?
- Variantes: no tengo avisos | bandeja vacia | no aparece nada en la campana
- Respuesta canonica: Si no hay avisos, la bandeja muestra `No tienes notificaciones`.

### Puedo descargar un parte desde una notificacion?
- Variantes: descargar parte | pdf desde notificacion | excel desde una alerta
- Respuesta canonica: Si. Algunas notificaciones abren el dialogo `Descargar Parte de Trabajo`, donde puedes elegir PDF o Excel.

### Por que aparece un contador rojo en la campana o en la mensajeria?
- Variantes: contador rojo | numero sin leer | badge | avisos pendientes
- Respuesta canonica: El contador indica elementos pendientes de revisar, como notificaciones no leidas o mensajes sin leer.

## Modulo: mensajeria
### Como abro la mensajeria?
- Variantes: abrir chat | burbuja flotante | pompa de mensajes | mensajeria de la app
- Respuesta canonica: La mensajeria se abre desde una burbuja flotante anclable en pantalla.
- Ubicacion: Burbuja flotante visible sobre la app.
- Restricciones / notas: La burbuja muestra contador de no leidos y puede moverse por pantalla.

### Que pestanas tiene la mensajeria?
- Variantes: chats obras contactos | secciones del chat | conversaciones
- Respuesta canonica: La mensajeria se organiza en `Chats`, `Obras` y `Contactos`.
- Ubicacion: Panel de Mensajeria.

### Puedo hablar con una obra completa o solo con una persona?
- Variantes: chat de obra | grupo de obra | mensaje directo | conversacion de proyecto
- Respuesta canonica: La app soporta conversaciones directas entre usuarios y conversaciones de obra o proyecto con sus participantes.

### Donde entra la Ayuda IA dentro de la mensajeria?
- Variantes: chat con la ia | ayuda ia | asistente dentro del chat | preguntar a la ia
- Respuesta canonica: La Ayuda IA aparece integrada como una conversacion especial dentro del sistema de mensajeria.
- Ubicacion: Panel de Mensajeria.

### Se pueden borrar conversaciones o vaciar la mensajeria?
- Variantes: borrar chat | eliminar conversacion | limpiar mensajes | vaciar mensajeria
- Respuesta canonica: Si. El panel incluye acciones para borrar conversaciones concretas y una opcion para limpiar todos los mensajes, con confirmacion previa.
