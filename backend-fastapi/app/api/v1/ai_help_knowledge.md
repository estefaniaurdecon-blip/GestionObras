# Conocimiento Profundo IA

## Proposito de esta capa
- Este fichero NO replica el HelpCenter.
- Su funcion es complementar el catalogo sincronizado desde HelpCenter con:
  - rutas y puntos de entrada
  - enlaces directos
  - criterios para desambiguar preguntas
  - respuestas mas utiles cuando el usuario no encuentra una funcionalidad
  - explicaciones operativas paso a paso

## Regla de oro de respuesta
- Si el usuario pregunta "donde", responder primero con el punto de entrada real y, cuando exista, con enlace.
- Si el usuario pregunta "como", responder con pasos claros y breves.
- Si el usuario mezcla ambas cosas, responder asi:
  1. Donde ir
  2. Que pulsar
  3. Que revisar
- Si no existe una ruta hash directa y se abre como dialogo o desde un menu, decirlo explicitamente.

## Mapa de entrada rapido
- Inicio general: [Inicio](#/)
- Partes de trabajo: [Inicio](#/) > tab `Partes de trabajo`
- Control de accesos: [Inicio](#/) > tab `Control de accesos`
- Obras: [Obras](#/projects) o [Inicio](#/) > tab `Obras`
- Analisis economico: [Inicio](#/) > tab `Analisis economico`
- Calendario de Tareas: [Calendario](#/task-calendar) — icono de calendario en la cabecera superior
- Radar: [Radar de Obras](#/radar) — icono de globo en la cabecera superior
- Mensajeria: burbuja flotante arrastrable visible sobre la app (ChatBubble) — NO esta en la cabecera
- Notificaciones: icono de campana en la cabecera superior
- Ajustes: boton de engranaje (⚙) en la cabecera superior
- Gestion de usuarios: Ajustes > pestaña `Gestion de usuarios` (solo admins)
- Perfil e idioma: Ajustes > pestaña `Perfil`
- Ayuda: Ajustes > pestaña `Ayuda`

## Iconos de la cabecera (de izquierda a derecha)
1. Indicador de red (estado de conexion)
2. Campana de notificaciones (con badge rojo de no leidas)
3. Globo — Radar de Obras (`#/radar`)
4. Calendario — Calendario de Tareas (`#/task-calendar`, con badge rojo si hay tareas pendientes)
5. Engranaje — Ajustes (abre dialogo, con badge naranja si hay actualizacion)
6. Salir — cerrar sesion

## Rutas directas confirmadas
- Dashboard: `#/` y `#/dashboard`
- Obras: `#/projects`
- Radar: `#/radar`
- Calendario de Tareas: `#/task-calendar`
- Auth: `#/auth`
- Cambio de password: `#/update-password`
- Gestion de obra:
  - Inventario: `#/work-management/{workId}?tab=inventory`
  - Maquinaria de alquiler: `#/work-management/{workId}?tab=rental`
  - Repasos: `#/work-management/{workId}?tab=repasos`
  - Post-venta: `#/work-management/{workId}?tab=postventa`
- Mensajeria: no tiene ruta — se abre con la burbuja flotante arrastrable (ChatBubble)
- Notificaciones: no tienen ruta — se abren con el icono de campana del header

## Desambiguacion de preguntas
- "Parte de obra" debe interpretarse como `Parte de trabajo`.
- "Parte economico" debe interpretarse como `Analisis economico` o `parte valorado dentro de gestion economica`, segun el contexto.
- "Donde veo una obra" normalmente significa [Obras](#/projects).
- "Donde veo el inventario" normalmente exige una obra concreta:
  - si no se conoce la obra, primero mandar a [Obras](#/projects)
  - si ya se conoce el `workId`, dar la ruta directa
- "Repasos" y "Post-venta" dependen de una obra concreta.
- "Gestion de usuarios" no es una pagina principal: se abre dentro de Ajustes.
- "Presupuesto" puede referirse al presupuesto de una obra (campo basico) o al modulo de presupuestos ERP (gestion avanzada en Analisis economico).
- "Chat" o "mensajes" siempre se refiere a la burbuja flotante de mensajeria, no a un icono del header.

## Como responder cuando el usuario no encuentra algo
- Si la funcionalidad esta en una tab principal:
  - decir la tab exacta
  - decir desde que pantalla se entra
- Si la funcionalidad esta en una obra:
  - mandar primero a [Obras](#/projects)
  - explicar que debe abrir el menu de la obra o entrar en la gestion de esa obra
- Si la funcionalidad esta dentro de Ajustes:
  - decir que Ajustes se abre con el engranaje superior
  - despues indicar la tab concreta
- Si la funcionalidad se abre con un boton contextual:
  - nombrar la pantalla base
  - nombrar el boton exacto

## Metodo de respuesta recomendado
- Cuando la pregunta sea de ubicacion:
  1. Indicar primero la pantalla exacta o el enlace real.
  2. Aclarar si cuelga de una obra, de Ajustes o del dashboard principal.
  3. Dar el siguiente click que tiene que hacer el usuario.
- Cuando la pregunta sea operativa:
  1. Indicar donde entrar.
  2. Enumerar los pasos en orden.
  3. Cerrar con que dato revisar, guardar o confirmar.
- Cuando el usuario diga "no lo encuentro":
  - evitar respuestas abstractas
  - usar nombres visibles en pantalla como tabs, botones o dialogos
  - si no hay ruta directa, decir literalmente desde que pantalla sale

## Respuestas modelo por intencion

### Cuando preguntan por ver un parte
- "Puedes verlo en [Inicio](#/) > tab `Partes de trabajo`."
- "Ahi se muestra el listado de partes y desde ahi abres el que necesites."

### Cuando preguntan por crear un parte
1. Ir a [Inicio](#/)
2. Abrir `Partes de trabajo`
3. Pulsar `Generar parte` (se abre el panel "Nuevo Parte")
4. Completar cabecera (obra, fecha), mano de obra, maquinaria, materiales, subcontratas y observaciones
5. Guardar con el estado que corresponda: `Completado`, `Faltan Datos` o `Faltan Albaranes`

### Cuando preguntan por clonar un parte
- "En la lista de partes, pulsa el icono de clonar (dos hojas) en la fila del parte."
- "Elige la fecha y que secciones incluir. Los datos de texto se copian siempre."
- "Tambien puedes activar `Auto-clonar al dia siguiente` para que se cree automaticamente cada noche."

### Cuando preguntan por el analisis economico
- "Lo tienes en [Inicio](#/) > tab `Analisis economico`."
- "Tiene tres pestanas principales: `Valorar Parte`, `Analisis` e `Informes Guardados`."
- "En `Valorar Parte` asignas precios a mano de obra, maquinaria, materiales y subcontratas de un parte."
- "En `Analisis` ves graficos y tablas de costes por periodo, obra y categoria."
- "En `Informes Guardados` consultas y exportas partes economicos ya valorados."

### Cuando preguntan por presupuestos ERP
- "Los presupuestos ERP se gestionan dentro del analisis economico de una obra."
- "Permiten crear lineas de presupuesto padre/hijo con hitos dinamicos sincronizados con el ERP."
- "Incluyen gastos generales y colaboraciones externas."

### Cuando preguntan por inventario
- "El inventario esta dentro de cada obra."
- "Entra en [Obras](#/projects), abre la obra y pulsa `Inventario`."
- "Si ya conoces la obra, puedes ir a `#/work-management/{workId}?tab=inventory`."
- "Tiene cuatro pestanas: Dashboard, Albaranes, Materiales y Herramientas."

### Cuando preguntan por repasos o post-venta
- "Ambos modulos cuelgan de una obra concreta."
- "Ve a [Obras](#/projects), abre el menu de la obra y entra en `Repasos` o `Post-Venta`."
- "Puedes documentar cada repaso/postventa con fotos de antes y despues."

### Cuando preguntan por maquinaria de alquiler
- "La gestion de maquinaria de alquiler esta dentro de cada obra."
- "Ve a [Obras](#/projects), abre el menu de la obra y entra en `Maq. Alquiler`."
- "Las maquinas activas aparecen automaticamente en los partes diarios."

### Cuando preguntan por gestion de usuarios
- "Se encuentra en Ajustes > pestaña `Gestion de usuarios`."
- "Ajustes se abre con el engranaje (⚙) de la cabecera en [Inicio](#/)."

### Cuando preguntan por control de accesos
- "Ve a [Inicio](#/) > tab `Control de accesos`."
- "Pulsa `+ Nuevo Registro` para crear un control."
- "Rellena obra, responsable, personal con DNI y horas, maquinaria y observaciones."
- "Puedes capturar la firma digital de cada trabajador."
- "Usa `Copiar datos` para importar personal y maquinaria de un control anterior."
- "Genera informes consolidados con `Generar Informe` (diario, semanal, mensual o personalizado)."

### Cuando preguntan por la mensajeria o el chat
- "La mensajeria se abre desde la burbuja flotante que aparece sobre la app."
- "No es un icono del header: es un boton circular arrastrable."
- "Tiene cuatro pestanas: Conversaciones, Obras, Contactos y Ayuda IA."
- "Puedes adjuntar archivos pulsando el icono del clip (📎) en cualquier conversacion."

### Cuando preguntan por la Ayuda IA
- "El asistente de IA esta integrado dentro de la mensajeria como la primera conversacion de la lista."
- "Abre la burbuja flotante y selecciona el canal de Ayuda IA."
- "No existe un boton flotante de IA separado: todo esta dentro del Centro de Mensajes."

### Cuando preguntan por notificaciones
- "Las notificaciones se abren desde el icono de campana en la cabecera superior."
- "El badge rojo muestra cuantas tienes sin leer (maximo 9+)."
- "Tipos: parte pendiente, parte aprobado, obra asignada, tarea pendiente, vencimiento maquinaria, nuevo mensaje."
- "Usa `Marcar todas` para limpiar de una vez."

### Cuando preguntan por el calendario o tareas
- "El Calendario de Tareas se abre desde el icono de calendario en la cabecera o con la ruta `#/task-calendar`."
- "Los dias con tareas asignadas se marcan con un punto."
- "Selecciona un dia para ver sus tareas y cambiar su estado: Pendiente, En Progreso o Completada."
- "Los administradores crean y asignan tareas a cada usuario."

### Cuando preguntan por el radar de obras
- "El Radar de Obras se abre desde el icono de globo en la cabecera o con la ruta `#/radar`."
- "Muestra un mapa con marcadores de todas las obras geolocalizadas."
- "Para geolocalizar una obra, editala y usa `Buscar Coordenadas desde Direccion` o `Capturar Ubicacion GPS Actual`."

### Cuando preguntan por residuos
- "La gestion de residuos esta dentro de cada parte de trabajo (una vez guardado)."
- "Despliega la seccion `Gestion de residuos` y pulsa `+ Anadir movimiento`."
- "Registra entregas, retiradas o cargas de contenedor con codigo LER."

### Cuando preguntan por el escaneo IA de albaranes
- "Dentro de un parte, en la seccion Materiales, pulsa `+ Albaran` y luego `Escanear IA`."
- "La IA extrae proveedor, numero de albaran, fecha y lineas de material con cantidades y precios."
- "El escaner detecta duplicados automaticamente y puede reubicar albaranes a su fecha correcta."
- "El escaneo IA esta restringido a Android nativo."

### Cuando preguntan por comandos de voz
- "La app tiene entrada por voz en las secciones del parte de trabajo."
- "En Observaciones, el microfono dicta texto directamente."
- "En otras secciones (Mano de Obra, Maquinaria, Materiales, Subcontratas) procesa comandos interactivos."
- "Comandos: `anadir grupo/fila`, `eliminar ultima fila`, `cambiar empresa a [nombre]`, `copiar grupo anterior`, `marcar [seccion] completa`."

### Cuando preguntan por modo offline
- "La app funciona sin conexion gracias a su base de datos SQLite local."
- "Puedes crear y consultar partes de trabajo offline."
- "Los cambios se acumulan en una cola de sincronizacion y se envian al recuperar conexion."
- "El primer inicio de sesion requiere conexion; despues puedes entrar offline."
- "Funciones que requieren conexion: escaneo IA, mensajeria y notificaciones push."

### Cuando preguntan por exportar
- "Partes individuales: PDF o Excel desde la barra inferior del parte."
- "Exportacion masiva: selecciona varios partes en la lista y descarga como ZIP."
- "Informes economicos: PDF y Excel desde Analisis economico > Informes Guardados."
- "Inventario: Excel desde Gestion de obra > Inventario > Acciones de Obra."
- "Control de accesos: PDF individual o informe consolidado."

### Cuando preguntan por los roles
- "El sistema tiene tres roles: `super_admin`, `tenant_admin` y `usuario`."
- "Tu rol determina que pestanas, botones y funciones ves en la app."
- "Si necesitas mas permisos, contacta con el administrador de tu organizacion."

## Flujos guiados frecuentes

### Ver un parte de trabajo
1. Entrar en [Inicio](#/).
2. Abrir la tab `Partes de trabajo`.
3. Buscar el parte en el listado (puedes filtrar por modo de vista: por encargado, semanal o mensual).
4. Pulsar sobre el parte para abrir su detalle.
5. Si necesita otro parte cercano, usar `Anterior` o `Siguiente` en la cabecera.

### Crear un parte de trabajo
1. Entrar en [Inicio](#/).
2. Abrir `Partes de trabajo`.
3. Pulsar `Generar parte`.
4. Completar cabecera (obra, fecha), mano de obra, maquinaria, materiales, subcontratas y observaciones.
5. En la tarjeta inferior rellenar nombres y horas del encargado.
6. Guardar con el estado que corresponda: `Completado`, `Faltan Datos` o `Faltan Albaranes`.

### Clonar un parte
1. En la lista de partes, pulsar el icono de clonar (dos hojas) en la fila del parte.
2. Seleccionar la fecha para el nuevo parte.
3. Elegir que secciones incluir: Materiales, Gestion de Residuos, Imagenes de albaranes, Firmas.
4. Pulsar `Clonar Parte`.
5. Revisar el parte clonado antes de guardarlo (aparece aviso amarillo).

### Escanear un albaran con IA
1. Abrir un parte de trabajo.
2. En la seccion Materiales, pulsar `+ Albaran`.
3. En el grupo, pulsar `Escanear IA`.
4. Capturar foto o seleccionar imagen de galeria.
5. Revisar los datos detectados (proveedor, fecha, lineas de material).
6. Pulsar `Aplicar` para incorporar al parte.

### Valorar un parte economicamente
1. Ir a [Inicio](#/) > tab `Analisis economico`.
2. Seleccionar la pestaña `Valorar Parte`.
3. Elegir encargado y parte a valorar.
4. En cada seccion (Mano de Obra, Maquinaria, Materiales, Subcontratas), editar precios con el icono de lapiz.
5. Revisar el total en la cabecera.
6. Pulsar `Guardar Precios` — el parte economico queda en Informes Guardados.

### Crear un control de accesos
1. Ir a [Inicio](#/) > tab `Control de accesos`.
2. Pulsar `+ Nuevo Registro`.
3. Seleccionar la obra, rellenar responsable y horas.
4. Anadir personal: nombre, DNI, empresa, actividad, horas de entrada/salida, firma digital.
5. Anadir maquinaria si aplica.
6. Guardar (autoguardado cada 30 segundos).

### Revisar inventario de una obra
1. Ir a [Obras](#/projects).
2. Abrir la obra que corresponda (menu ⚙ > Inventario).
3. Navegar por las pestanas: Dashboard, Albaranes, Materiales, Herramientas.
4. Usar paneles superiores: Acciones de Obra, Mantenimiento, Busqueda.
5. Si ya se conoce la obra, usar `#/work-management/{workId}?tab=inventory`.

### Entrar en repasos o post-venta
1. Ir a [Obras](#/projects).
2. Abrir la obra concreta (menu ⚙ > Repasos o Post-Venta).
3. Pulsar `+ Anadir repaso` o `+ Anadir postventa`.
4. Rellenar descripcion, empresa, horas estimadas.
5. Opcionalmente anadir fotos de antes/despues.
6. Exportar con los botones Excel o PDF.

### Gestionar maquinaria de alquiler
1. Ir a [Obras](#/projects).
2. Abrir la obra (menu ⚙ > Maq. Alquiler).
3. Pulsar `+ Anadir maquinaria`.
4. Rellenar tipo, proveedor, numero, fecha de entrega, tarifa diaria.
5. Las maquinas activas aparecen automaticamente en los partes diarios de esa obra.

### Gestionar usuarios
1. Ir a [Inicio](#/).
2. Abrir `Ajustes` con el engranaje (⚙) superior.
3. Entrar en la pestaña `Gestion de usuarios`.
4. Aprobar usuarios pendientes, asignar roles (super_admin, tenant_admin, usuario) y obras.

### Usar la mensajeria
1. Pulsar la burbuja flotante de mensajeria.
2. Elegir pestaña: Conversaciones, Obras, Contactos o Ayuda IA.
3. Seleccionar un contacto o una obra para abrir la conversacion.
4. Escribir mensaje y pulsar Enter o el boton de enviar.
5. Para adjuntar archivo: pulsar el icono del clip (📎).

## Explicaciones funcionales a nivel usuario

### Partes de trabajo
- Es el modulo diario para registrar actividad de obra.
- Un parte puede incluir mano de obra, maquinaria, materiales (con albaranes), subcontratas, observaciones, gestion de residuos y comentarios colaborativos.
- Desde el listado se puede abrir, aprobar, exportar, clonar o navegar entre partes segun el modo de vista.
- El auto-clonar genera automaticamente un parte para el dia siguiente cada noche (tarea Celery a las 06:00).

### Analisis economico
- Es la vista de lectura y analisis de los datos economicos ya registrados en los partes.
- No sustituye al parte: consume la informacion economica introducida en mano de obra, maquinaria, materiales y subcontratas.
- Pestanas: Valorar Parte, Analisis (graficos y tablas por periodo), Informes Guardados, Informes Avanzados.
- Incluye presupuestos ERP por obra con hitos dinamicos y colaboraciones externas.

### Control de accesos
- Registra entradas y salidas de personal y maquinaria con firma digital.
- Funciones: crear registros, copiar datos de otro control, generar informes consolidados, exportar/importar JSON.
- Los registros se agrupan por fecha y obra en la lista.
- Incluye eliminacion masiva con seleccion multiple.

### Gestion de obra
- Agrupa modulos dependientes de una obra concreta.
- Inventario, maquinaria de alquiler, repasos y post-venta no son pantallas globales: dependen siempre de la obra que se abra.
- El inventario se recalcula desde partes completados y tiene herramientas de mantenimiento (limpiar servicios, validar y corregir, fusionar proveedores).

### Mensajeria
- Se abre desde la burbuja flotante (ChatBubble), NO desde un icono del header.
- Cuatro pestanas: Conversaciones, Obras (chat grupal por proyecto), Contactos (con favoritos), Ayuda IA (asistente integrado).
- Soporta envio de archivos adjuntos con el icono del clip.
- Los contactos favoritos (estrella) aparecen al inicio de la lista.

### Modo offline
- La app funciona sin conexion gracias a SQLite local (sql.js/WebAssembly).
- Los cambios se acumulan en una cola de sincronizacion (outbox) y se envian al recuperar conexion.
- El primer inicio de sesion requiere conexion; despues se puede entrar offline con credenciales locales.
- Funciones que requieren conexion: escaneo IA, mensajeria en tiempo real y notificaciones push.

## Heuristicas de enlace
- Si existe ruta hash real, priorizar el enlace Markdown.
- Si no existe ruta real pero existe punto de entrada estable, usar texto guiado:
  - `Ajustes > Gestion de usuarios`
  - `Inicio > Partes de trabajo`
  - `Obras > menu de la obra > Inventario`
- Si la accion depende del `workId` y no se tiene:
  - no inventar un enlace
  - mandar primero a [Obras](#/projects)

## Funcionalidades donde conviene orientar mas de lo normal
- Inventario:
  - aclarar que esta dentro de la obra
  - aclarar que se recalcula desde partes completados
  - tiene cuatro pestanas: Dashboard, Albaranes, Materiales, Herramientas
- Analisis economico:
  - aclarar que trabaja sobre los datos economicos de los partes
  - aclarar que no es un modulo separado fuera del dashboard principal
  - incluye presupuestos ERP por obra con hitos dinamicos
- Ajustes:
  - aclarar que se abre como dialogo con el engranaje (⚙), no como ruta independiente
  - pestañas: Perfil, Gestion de usuarios (solo admins), Actualizaciones (solo admins), Ayuda
- Mensajeria:
  - aclarar que se abre desde la burbuja flotante arrastrable (ChatBubble), NO desde un icono del header
  - pestañas: Conversaciones, Obras, Contactos, Ayuda IA
  - soporta archivos adjuntos y contactos favoritos
- Notificaciones:
  - aclarar que se abren desde la campana del header
  - tipos: parte pendiente, parte aprobado, obra asignada, tarea pendiente, vencimiento maquinaria, nuevo mensaje
- Modo Offline:
  - la app funciona sin conexion gracias a SQLite local + cola de sincronizacion (outbox)
  - el primer inicio de sesion requiere conexion
- Escaneo IA:
  - solo funciona en Android nativo
  - detecta duplicados automaticamente
  - puede reubicar albaranes a su fecha correcta
- Entrada por voz:
  - dictado en observaciones + comandos interactivos en otras secciones
  - comandos: anadir/eliminar filas, cambiar empresa/proveedor, marcar secciones completas

## Roles vigentes del sistema
- `super_admin`: acceso total al sistema, configuracion global y gestion de todas las organizaciones
- `tenant_admin`: gestion completa de su organizacion, incluyendo obras, usuarios, analisis economico e informes avanzados
- `usuario`: acceso a partes de trabajo, control de accesos, inventario y funciones de obra segun las obras asignadas
- No existen otros roles: los antiguos (master, admin, site_manager, foreman, ofi, reader) ya no se usan

## Limites
- No inventar botones no confirmados.
- No prometer permisos concretos si no estan claros.
- Solo mencionar los tres roles vigentes: `super_admin`, `tenant_admin`, `usuario`.
- No afirmar que el sistema tiene certificaciones ISO 27001, SOC 2 o GDPR — no las tiene.
- No mencionar un "boton flotante de IA" separado — el asistente IA esta dentro de la mensajeria.
- No mencionar "sistema de suscripciones" ni "periodo de prueba" — no existen.
