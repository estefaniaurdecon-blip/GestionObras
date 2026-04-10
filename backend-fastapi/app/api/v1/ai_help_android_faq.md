# FAQ Android oficial

## Fuente prioritaria
- Base derivada de `FAQ_Android_GestionObras_v1.md`.
- Describe la app Android activa y debe mandar sobre conocimiento generico si hay conflicto.
- No usar esta FAQ para inventar OCR ni pantallas no documentadas.
- Roles vigentes del sistema: `super_admin`, `tenant_admin`, `usuario`. No usar roles antiguos.

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
- Respuesta canonica: Si, pero solo si ese usuario ya inicio sesion online al menos una vez en ese mismo dispositivo y existen credenciales locales validas. La app guarda los datos en SQLite local y los sincroniza al recuperar conexion.
- Ubicacion: Mismo flujo de login.
- Restricciones / notas: La sincronizacion queda pendiente hasta recuperar conexion. El escaneo IA, la mensajeria y las notificaciones push requieren conexion.

## Modulo: dashboard
### Que secciones principales tiene la app?
- Variantes: que pestanas hay | que puedo hacer en la app | donde esta cada modulo | navegacion principal
- Respuesta canonica: La navegacion principal visible se organiza en `Partes de trabajo`, `Control de accesos`, `Obras` y `Analisis economico`.
- Ubicacion: Barra de pestanas principal bajo la cabecera.
- Restricciones / notas: La cabecera incorpora tambien notificaciones (campana), Radar de Obras (globo), Calendario de Tareas (calendario), ajustes (engranaje) y salida de sesion.

### Donde veo las notificaciones?
- Variantes: abrir notificaciones | campana | avisos | mensajes del sistema
- Respuesta canonica: Las notificaciones se abren desde el icono de campana en la cabecera superior. El badge rojo muestra cuantas tienes sin leer.
- Ubicacion: Cabecera principal.

### Que tipos de notificaciones existen?
- Variantes: tipos de aviso | que notificaciones recibo | alertas del sistema
- Respuesta canonica: Parte pendiente (ambar), parte aprobado (verde), obra asignada (azul), tarea pendiente (rosa), vencimiento maquinaria (naranja), nuevo mensaje (celeste).
- Ubicacion: Panel de notificaciones (campana).

### Que es Radar de Obras y como entro?
- Variantes: radar | globo | mapa de obras | donde esta radar de obras
- Respuesta canonica: Radar de Obras se abre desde el boton con icono de globo en la cabecera superior. Muestra un mapa con marcadores de todas las obras geolocalizadas.
- Ubicacion: Cabecera principal > icono de globo, o ruta directa `#/radar`.

### Como cierro sesion?
- Variantes: salir | logout | cerrar mi sesion | desconectarme
- Respuesta canonica: Usa el boton `Salir` de la cabecera superior.
- Ubicacion: Cabecera principal.

## Modulo: partes
### Como creo un parte nuevo?
- Variantes: nuevo parte | generar parte | anadir parte | hacer un parte diario
- Respuesta canonica: Dentro de `Partes de trabajo` pulsa el boton `Generar parte`. Se abrira el panel "Nuevo Parte" donde rellenas obra, fecha y todas las secciones.
- Ubicacion: Pestana principal `Partes de trabajo`.

### Que secciones tiene un parte de trabajo?
- Variantes: que relleno en un parte | campos del parte | secciones del formulario
- Respuesta canonica: Cabecera (obra y fecha), Mano de Obra (grupos de trabajo con empresa, nombre, actividad y horas), Maquinaria de Subcontratas, Materiales (con albaranes), Subcontratas, Observaciones e Incidencias (con dictado por voz), Gestion de Residuos (solo en partes guardados), Comentarios colaborativos, y tarjeta de Encargado y Jefe de Obra.
- Ubicacion: Formulario del parte de trabajo.

### Donde consulto el historial de partes?
- Variantes: historico | partes anteriores | buscar un parte antiguo | ver partes guardados
- Respuesta canonica: El historial esta dentro del mismo modulo. Puedes filtrar por modo de vista: por encargado, semanal o mensual.
- Ubicacion: Partes de trabajo > listado con modos de vista.

### Puedo clonar un parte anterior para reutilizarlo?
- Variantes: duplicar parte | copiar parte | usar un parte anterior como plantilla | repetir parte
- Respuesta canonica: Si. Pulsa el icono de clonar (dos hojas) en la fila del parte. Elige la fecha y que secciones incluir: Materiales, Gestion de Residuos, Imagenes de albaranes, Firmas. Los datos de texto se copian siempre.
- Ubicacion: Lista de partes > icono de clonar en cada fila.

### Que es el auto-clonar?
- Variantes: clonar automatico | auto clonar | parte automatico al dia siguiente | clon nocturno
- Respuesta canonica: Si activas `Auto-clonar al dia siguiente` dentro de un parte, el sistema creara automaticamente un parte para el dia siguiente cada noche (tarea programada a las 06:00).
- Ubicacion: Dentro del parte de trabajo > opcion Auto-clonar.

### Como exporto partes o saco un resumen?
- Variantes: exportar excel | sacar informe | descargar partes | resumen de partes
- Respuesta canonica: Para un parte individual usa los botones PDF o Excel de la barra inferior. Para exportacion masiva, selecciona varios partes en la lista y descarga como ZIP (PDFs o Excels).
- Ubicacion: Parte abierto > barra inferior, o lista de partes > seleccion multiple.

### Que estados tiene un parte?
- Variantes: estados | completado | faltan datos | faltan albaranes | aprobado
- Respuesta canonica: Al guardar eliges: `Completado` (verde), `Faltan Datos` (ambar) o `Faltan Albaranes` (rosa). Los administradores pueden `Aprobar` un parte completado (azul). Un parte aprobado no se puede editar sin desaprobarlo primero.
- Ubicacion: Dialogo de guardar y lista de partes.

### Puedo eliminar un parte?
- Variantes: borrar parte | quitar parte | eliminar definitivamente
- Respuesta canonica: Si, existe una accion de eliminacion con confirmacion explicita.
- Restricciones / notas: Es una accion destructiva y permanente.

### Donde registro los residuos de obra?
- Variantes: gestion de residuos | contenedor | residuos | LER | retirada de contenedor | entrega de residuos | carga de residuos
- Respuesta canonica: Dentro del parte de trabajo existe la seccion `Gestion de residuos`. Pulsa `+ Anadir movimiento` para registrar entregas, retiradas o cargas de contenedor.
- Ubicacion: Parte de trabajo (guardado) > seccion `Gestion de residuos`.
- Restricciones / notas: La seccion solo aparece una vez que el parte ha sido guardado al menos una vez.

### Que datos pide un movimiento de residuos?
- Variantes: campos residuos | tipo de residuo | codigo LER | que relleno en residuos | gestion de contenedor
- Respuesta canonica: Modo de operacion (gestion de contenedor o carga directa), tipo de accion (entrega/retirada/carga), tipo de residuo con codigo LER, gestor, id de contenedor, tamano del contenedor, y datos del vehiculo (matricula, tipo, operador).
- Ubicacion: Parte de trabajo > seccion Gestion de residuos > dialogo de alta.

### Como funcionan los comentarios en un parte?
- Variantes: comentarios | notas colaborativas | escribir comentario | bocadillo
- Respuesta canonica: En la seccion `Comentarios` del parte puedes escribir notas colaborativas visibles para todo el equipo. Muestra autor y tiempo transcurrido. Se refresca automaticamente cada 10 segundos.
- Ubicacion: Parte de trabajo > seccion Comentarios.

### Que es el widget de repasos activos en el parte?
- Variantes: repasos en el parte | widget de repasos | repasos pendientes en el formulario
- Respuesta canonica: Si la obra del parte tiene repasos activos, aparece un widget informativo mostrando los repasos pendientes y en proceso con sus horas estimadas y reales. Es solo informativo: no puedes editar repasos desde el parte.
- Ubicacion: Parte de trabajo > widget lateral (solo si hay repasos activos).

## Modulo: accesos
### Como creo un registro de control de accesos?
- Variantes: nuevo acceso | nuevo registro | control de entradas | registrar acceso
- Respuesta canonica: Dentro de `Control de accesos` pulsa `+ Nuevo Registro`. Selecciona la obra, rellena responsable, personal con DNI y horas, maquinaria y observaciones.
- Ubicacion: Pestana principal `Control de accesos`.

### Como funciona la firma digital?
- Variantes: firmar | firma del trabajador | capturar firma | area de firma
- Respuesta canonica: Al anadir o editar una entrada de personal, despliega la seccion Firma. El trabajador puede firmar con el dedo en el area tactil. La firma aparece en el PDF generado.
- Ubicacion: Control de accesos > formulario > seccion Firma de cada persona.

### Como copio datos de un control anterior?
- Variantes: copiar datos | importar de otro control | reutilizar cuadrilla | traer personal
- Respuesta canonica: Dentro del formulario pulsa `Copiar datos`. Paso 1: selecciona el control origen. Paso 2: elige que personas y maquinas importar (puedes ajustar horas). Paso 3: confirma y pulsa `Aplicar`.
- Ubicacion: Control de accesos > formulario > boton `Copiar datos`.

### Como genero un informe consolidado de accesos?
- Variantes: informe de accesos | sacar reporte | generar informe | informe semanal
- Respuesta canonica: Pulsa `Generar Informe`. Elige periodo (diario, semanal, mensual o personalizado), filtra por obra y responsable, y pulsa `Generar` para crear el PDF consolidado.
- Ubicacion: Control de accesos > boton `Generar informe`.

### Como exporto o importo datos de accesos?
- Variantes: guardar datos | cargar datos | importar json | exportar registros de accesos | backup
- Respuesta canonica: Usa `Exportar datos` para descargar todos los controles en JSON. Usa `Importar datos` para restaurar desde un JSON previamente exportado. Los controles importados se anaden sin sobreescribir.
- Ubicacion: Control de accesos > botones de exportar/importar.

### Se pueden eliminar multiples controles a la vez?
- Variantes: borrar varios | eliminacion masiva | seleccion multiple | borrar controles
- Respuesta canonica: Si. Pulsa `Seleccion multiple`, marca las casillas de los controles a eliminar y pulsa `Eliminar (N)`. La accion es permanente y no se puede deshacer.
- Ubicacion: Control de accesos > lista > boton `Seleccion multiple`.

## Modulo: obras
### Como creo una obra nueva?
- Variantes: nueva obra | anadir obra | alta de obra | crear registro de obra
- Respuesta canonica: En `Obras` usa el boton `+ Nuevo registro`. Rellena Numero de Obra, Nombre, direccion, promotor, presupuesto y datos de contacto.
- Ubicacion: Pestana principal `Obras` > subpestana `Obras`.
- Restricciones / notas: `Numero de Obra` y `Nombre de la Obra` son obligatorios. Solo super_admin y tenant_admin pueden crear obras.

### Puedo obtener coordenadas desde la direccion?
- Variantes: buscar coordenadas | gps desde direccion | geolocalizar obra
- Respuesta canonica: Si. En la ficha de obra existen dos acciones: `Buscar Coordenadas desde Direccion` (OpenStreetMap) y `Capturar Ubicacion GPS Actual` (tu posicion en tiempo real). Las obras geolocalizadas aparecen en el Radar de Obras.

### Como entro en la gestion detallada de una obra?
- Variantes: abrir inventario de una obra | entrar en gestion de obra | menu de una obra | acciones de obra
- Respuesta canonica: Cada obra tiene un menu ⚙ con accesos directos a Inventario, Maq. Alquiler, Repasos, Post-Venta y Asignar encargado.
- Ubicacion: Lista de obras > menu ⚙ de cada fila.

### Que es la Cartera de empresas?
- Variantes: empresas | cartera | proveedores | subpestana de empresas
- Respuesta canonica: Dentro del modulo de Obras existe una segunda subpestana llamada `Cartera de empresas`. Permite crear tipos de empresa, anadir empresas con datos completos y exportar a Excel.

## Modulo: gestion_obra
### Que apartados tiene la gestion de obra?
- Variantes: pestanas dentro de una obra | que hay al abrir una obra | gestion interna de obra
- Respuesta canonica: La pantalla de gestion de obra muestra `Inventario`, `Maq. Alquiler`, `Repasos` y `Post-Venta`.
- Restricciones / notas: Segun tu rol, algunas pestanas pueden no estar visibles.

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

### Como funciona la deteccion de duplicados?
- Variantes: albaranes duplicados | duplicados | mismo albaran dos veces
- Respuesta canonica: Al escanear un albaran, el sistema busca duplicados por proveedor y numero de albaran. Si encuentra coincidencias, muestra un dialogo para que decidas cuales conservar. El boton `Actualizar` del encabezado lanza un analisis global en todos los partes.
- Ubicacion: Parte de trabajo > seccion Materiales (al escanear) o encabezado del parte (analisis global).

### Que herramientas de mantenimiento tiene el inventario?
- Variantes: validar y corregir | limpiar servicios | fusionar proveedores | mantenimiento del inventario
- Respuesta canonica: El inventario incorpora `Limpiar Servicios`, `Validar y Corregir` y fusion de proveedores cuando se han seleccionado varios.
- Ubicacion: Gestion de obra > Inventario > panel `Mantenimiento`.

### Puedo buscar o filtrar materiales y herramientas?
- Variantes: buscar material | filtrar inventario | limpiar filtros | buscar por codigo o marca
- Respuesta canonica: Si. Puedes filtrar por nombre, codigo o marca y aplicar filtros por mes y ano, ademas de `Limpiar filtros`.
- Ubicacion: Gestion de obra > Inventario > panel `Busqueda`.

## Modulo: maquinaria_alquiler
### Como registro maquinaria de alquiler?
- Variantes: nueva maquina | anadir maquinaria | alquiler de maquina | registrar alquiler
- Respuesta canonica: Desde la lista de obras, menu ⚙ > `Maq. Alquiler`. Pulsa `+ Anadir maquinaria` y rellena tipo, proveedor, numero, fecha de entrega, tarifa diaria. Opcionalmente anade foto y operador.
- Ubicacion: Gestion de obra > Maq. Alquiler.
- Restricciones / notas: Solo super_admin y tenant_admin pueden acceder.

### Las maquinas aparecen en los partes?
- Variantes: alquiler en el parte | maquinaria automatica | parte diario maquinas
- Respuesta canonica: Si. Las maquinas activas (sin fecha de baja) aparecen automaticamente en la seccion de alquiler del parte diario en modo solo lectura.

### Como calcula el coste de alquiler?
- Variantes: coste alquiler | dias de alquiler | precio total maquina
- Respuesta canonica: El sistema calcula automaticamente: dias de alquiler (desde fecha de entrega hasta fecha de baja o hoy) × tarifa diaria = coste total. Si no hay fecha de baja, la maquina sigue acumulando dias.

## Modulo: repasos_postventas
### Como creo un repaso?
- Variantes: nuevo repaso | anadir repaso | registrar desperfecto | reparacion
- Respuesta canonica: Desde la obra, menu ⚙ > `Repasos`. Pulsa `+ Anadir repaso`, rellena descripcion, empresa, horas estimadas. El codigo se asigna automaticamente (REP-001, REP-002...).
- Ubicacion: Gestion de obra > Repasos.

### Cual es la diferencia entre repasos y postventas?
- Variantes: repaso vs postventa | diferencia | cuando uso cada uno
- Respuesta canonica: Repasos son correcciones internas de obra. Postventas son incidencias comunicadas por el cliente final. Ambos tienen la misma estructura pero colores de estado distintos.

### Puedo adjuntar fotos de antes y despues?
- Variantes: fotos repaso | imagen antes despues | documentar visualmente
- Respuesta canonica: Si. En el dialogo de creacion o edicion de un repaso o postventa hay dos areas de imagen: `Antes` y `Despues`. Las miniaturas aparecen en la tabla del listado.
- Restricciones / notas: Tamaño maximo por imagen: 10 MB.

## Modulo: economia
### Que pestanas tiene el analisis economico?
- Variantes: gestion economica | que hay en economia | costes | presupuesto
- Respuesta canonica: Cuatro pestanas: `Valorar Parte` (asignar precios), `Analisis` (graficos y tablas), `Informes Guardados` (partes valorados) e `Informes Avanzados` (reportes con filtros avanzados).
- Ubicacion: Pestana principal `Analisis economico`.

### Como valoro un parte?
- Variantes: poner precios | valorar parte | asignar precio a materiales | parte economico
- Respuesta canonica: En `Valorar Parte`, elige encargado y parte. Edita precios en cada seccion (Mano de Obra, Maquinaria, Materiales, Subcontratas) con el icono de lapiz. Pulsa `Guardar Precios` para crear el parte economico.
- Ubicacion: Analisis economico > Valorar Parte.

### Que muestra el analisis?
- Variantes: graficos | tendencias | costes por periodo | distribucion | empresas
- Respuesta canonica: Elegir granularidad (dias, semanas, meses) y filtrar por obra. Pestanas: Evolucion (lineas coste + horas), Distribucion (tarta por categoria), Empresas (ranking M.O. vs maquinaria), Proveedores (materiales y alquiler), Tabla (resumen detallado).
- Ubicacion: Analisis economico > Analisis.
- Restricciones / notas: Solo incluye partes en estado `Completado`.

### Como accedo a los informes guardados?
- Variantes: informes guardados | partes valorados | descargar parte economico
- Respuesta canonica: En `Informes Guardados`, elige agrupacion (dia, semana, mes). Cada fila muestra fecha, obra, encargado y total. Usa los iconos de Excel, PDF o papelera.
- Ubicacion: Analisis economico > Informes Guardados.

### Que son los informes avanzados?
- Variantes: informe avanzado | reporte trimestral | analisis por periodo largo
- Respuesta canonica: Permiten analizar datos por periodos (semanal, mensual, trimestral o personalizado) con filtro por obra. Incluyen horas de encargado, trabajadores, maquinaria de subcontratas y alquiler editable. Exporta en Excel o PDF.
- Ubicacion: Analisis economico > Informes Avanzados.
- Restricciones / notas: Solo accesible para super_admin y tenant_admin.

### Que son los presupuestos ERP?
- Variantes: presupuesto de obra | hitos | presupuesto erp | lineas de presupuesto
- Respuesta canonica: El modulo de presupuestos ERP permite crear lineas de presupuesto padre/hijo con hitos dinamicos sincronizados con el ERP. Incluye gastos generales y colaboraciones externas.
- Ubicacion: Analisis economico > gestion de obra.
- Restricciones / notas: Solo accesible para super_admin y tenant_admin.

## Modulo: notificaciones
### Como marco todas las notificaciones como leidas?
- Variantes: marcar todas | quitar avisos pendientes | leer todo | vaciar la campana
- Respuesta canonica: En la bandeja existe la accion `Marcar todas` (icono de doble check) en la cabecera.
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
- Respuesta canonica: La mensajeria se abre desde una burbuja flotante arrastrable que aparece sobre la app. No es un icono del header.
- Ubicacion: Burbuja flotante visible sobre la app.
- Restricciones / notas: La burbuja muestra contador de no leidos y puede moverse por pantalla.

### Que pestanas tiene la mensajeria?
- Variantes: chats obras contactos | secciones del chat | conversaciones
- Respuesta canonica: La mensajeria se organiza en cuatro pestanas: `Conversaciones`, `Obras`, `Contactos` y el canal de `Ayuda IA`.
- Ubicacion: Panel de Mensajeria.

### Puedo hablar con una obra completa o solo con una persona?
- Variantes: chat de obra | grupo de obra | mensaje directo | conversacion de proyecto
- Respuesta canonica: La app soporta conversaciones directas entre usuarios y conversaciones grupales de obra con sus participantes.

### Donde entra la Ayuda IA dentro de la mensajeria?
- Variantes: chat con la ia | ayuda ia | asistente dentro del chat | preguntar a la ia
- Respuesta canonica: La Ayuda IA aparece como la primera conversacion de la lista dentro del Centro de Mensajes. No existe un boton flotante de IA separado: todo esta integrado dentro de la mensajeria.
- Ubicacion: Panel de Mensajeria > primera conversacion de la lista (Ayuda IA).

### Como comparto archivos en el chat?
- Variantes: adjuntar archivo | enviar documento | clip | compartir pdf
- Respuesta canonica: Pulsa el icono del clip (📎) en la barra de escritura de cualquier conversacion. Selecciona el archivo y se adjunta al mensaje. El destinatario puede descargarlo pulsando sobre el.
- Ubicacion: Panel de Mensajeria > cualquier conversacion > barra de escritura.

### Se pueden borrar conversaciones o vaciar la mensajeria?
- Variantes: borrar chat | eliminar conversacion | limpiar mensajes | vaciar mensajeria
- Respuesta canonica: Si. El panel incluye acciones para borrar conversaciones concretas y una opcion para limpiar todos los mensajes, con confirmacion previa.

### Puedo marcar contactos como favoritos en el chat?
- Variantes: contactos favoritos | estrella en chat | favoritos mensajeria | acceso rapido a contacto
- Respuesta canonica: Si. En la pestana `Contactos` del panel de mensajeria puedes marcar usuarios con la estrella para que aparezcan al inicio de tu lista de conversaciones.
- Ubicacion: Panel de Mensajeria > pestana Contactos.

## Modulo: calendario
### Como accedo al calendario de tareas?
- Variantes: donde esta el calendario | tareas pendientes | calendario de la app | ir al calendario
- Respuesta canonica: El Calendario de Tareas se abre desde el icono de calendario en la cabecera superior o navegando a la ruta `#/task-calendar`.
- Ubicacion: Icono de calendario en la cabecera o ruta directa `#/task-calendar`.

### Que puedo ver en el calendario?
- Variantes: que hay en el calendario | como funciona el calendario | dias con tareas
- Respuesta canonica: El calendario muestra los dias que tienen tareas asignadas a ti con un punto indicador. Al seleccionar un dia ves las tareas de ese dia ordenadas por estado con su horario y descripcion.
- Ubicacion: Calendario > panel de tareas del dia seleccionado.

### Como cambio el estado de una tarea?
- Variantes: marcar tarea completa | cambiar estado tarea | completar tarea | poner en progreso
- Respuesta canonica: Desde la tarjeta de la tarea en el panel lateral puedes cambiar su estado: Pendiente (ambar), En Progreso (azul) o Completada (verde).
- Ubicacion: Calendario > tarjeta de la tarea.

### Quien crea las tareas?
- Variantes: crear tarea | nueva tarea | asignar tarea | quien me pone tareas
- Respuesta canonica: Los administradores (super_admin y tenant_admin) crean y asignan tareas a cada usuario. Tu solo ves las tareas que te han asignado.

## Modulo: radar_obras
### Que veo en el Radar de Obras?
- Variantes: mapa de obras | marcadores | obras en el mapa
- Respuesta canonica: Un mapa interactivo con marcadores de todas las obras geolocalizadas. Obras activas en color primario, finalizadas en gris. Pulsa un marcador para ver informacion de la obra.
- Ubicacion: Cabecera > icono de globo, o ruta `#/radar`.

### Como geolocalizo una obra?
- Variantes: poner obra en el mapa | coordenadas | gps de una obra
- Respuesta canonica: Edita la obra y usa `Buscar Coordenadas desde Direccion` (busca via OpenStreetMap) o `Capturar Ubicacion GPS Actual` (usa tu posicion en tiempo real).
- Ubicacion: Obras > editar obra > seccion de ubicacion.

## Modulo: fases_vencimientos
### Que son los proximos vencimientos?
- Variantes: vencimientos | deadlines | plazos | cuando vence | alertas de obra
- Respuesta canonica: El widget de Proximos Vencimientos en el Dashboard muestra las fases de obra proximas a vencer o ya vencidas, con su estado de progreso.
- Ubicacion: Dashboard principal > widget colapsable de vencimientos.

### Como se crean las fases de obra?
- Variantes: crear fase | nueva fase | anadir fase | gestionar plazos
- Respuesta canonica: Las fases son creadas y gestionadas por el administrador de la organizacion (super_admin o tenant_admin). Aparecen en el widget de Proximos Vencimientos cuando estan proximas a su fecha limite.

## Modulo: ia_y_voz
### Como funciona el escaner IA de albaranes?
- Variantes: escanear albaran | ocr | foto del albaran | escaner inteligente
- Respuesta canonica: Dentro del parte, en Materiales, pulsa `+ Albaran` y luego `Escanear IA`. Captura foto o selecciona imagen. La IA extrae proveedor, numero, fecha y lineas de material. Revisa los datos y pulsa `Aplicar`.
- Ubicacion: Parte de trabajo > seccion Materiales > grupo de albaran > boton Escanear IA.
- Restricciones / notas: Solo funciona en Android nativo.

### Como funciona la entrada por voz?
- Variantes: microfono | dictar | voz | hablar al parte | comandos de voz
- Respuesta canonica: En Observaciones el microfono dicta texto directamente. En otras secciones (Mano de Obra, Maquinaria, Materiales, Subcontratas) procesa comandos interactivos: `anadir grupo/fila`, `eliminar ultima fila`, `cambiar empresa a [nombre]`, `copiar grupo anterior`, `marcar [seccion] completa`.
- Ubicacion: Parte de trabajo > boton de microfono en cada seccion.

## Modulo: roles_y_seguridad
### Que roles tiene el sistema?
- Variantes: roles | permisos | que puedo hacer | acceso | administrador
- Respuesta canonica: Tres roles: `super_admin` (acceso total y configuracion global), `tenant_admin` (gestion completa de su organizacion) y `usuario` (acceso segun obras asignadas). Tu rol determina que pestanas, botones y funciones ves.
- Restricciones / notas: Si necesitas mas permisos, contacta con el administrador de tu organizacion.

### Como cambio el idioma?
- Variantes: idioma | cambiar a ingles | cambiar a espanol | language
- Respuesta canonica: Abre Ajustes (icono de engranaje en la cabecera), ve a la pestana `Perfil` y usa el selector de idioma. La app soporta espanol e ingles.
- Ubicacion: Ajustes > Perfil.

### Es segura la app?
- Variantes: seguridad | datos seguros | cifrado | proteccion
- Respuesta canonica: Si. La app implementa cifrado HTTPS, autenticacion JWT con soporte MFA, aislamiento estricto de datos entre organizaciones (multi-tenant) y control de acceso basado en roles.
- Restricciones / notas: Cada usuario solo ve datos de su organizacion. Las contraseñas se almacenan cifradas.

## Modulo: offline
### Como funciona el modo offline?
- Variantes: sin conexion | offline | no tengo internet | funciona sin red
- Respuesta canonica: La app guarda los datos en una base de datos SQLite local. Puedes crear y consultar partes sin conexion. Los cambios se acumulan en una cola de sincronizacion (outbox) y se envian al recuperar conexion.
- Restricciones / notas: El primer inicio de sesion requiere conexion. El escaneo IA, la mensajeria y las notificaciones push necesitan conexion activa.
