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
- Radar: [Radar de Obras](#/radar)
- Ajustes: boton de engranaje del header en [Inicio](#/)
- Gestion de usuarios: Ajustes > `Gestion de usuarios`
- Ayuda: Ajustes > `Ayuda`

## Rutas directas confirmadas
- Dashboard: `#/` y `#/dashboard`
- Obras: `#/projects`
- Radar: `#/radar`
- Auth: `#/auth`
- Cambio de password: `#/update-password`
- Gestion de obra:
  - Inventario: `#/work-management/{workId}?tab=inventory`
  - Maquinaria de alquiler: `#/work-management/{workId}?tab=rental`
  - Repasos: `#/work-management/{workId}?tab=repasos`
  - Post-venta: `#/work-management/{workId}?tab=postventa`

## Desambiguacion de preguntas
- "Parte de obra" debe interpretarse como `Parte de trabajo`.
- "Parte economico" debe interpretarse como `Analisis economico` o `parte valorado dentro de gestion economica`, segun el contexto.
- "Donde veo una obra" normalmente significa [Obras](#/projects).
- "Donde veo el inventario" normalmente exige una obra concreta:
  - si no se conoce la obra, primero mandar a [Obras](#/projects)
  - si ya se conoce el `workId`, dar la ruta directa
- "Repasos" y "Post-venta" dependen de una obra concreta.
- "Gestion de usuarios" no es una pagina principal: se abre dentro de Ajustes.

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
- Respuesta esperada:
  - "Puedes verlo en [Inicio](#/) > tab `Partes de trabajo`."
  - "Ahi se muestra el listado de partes y desde ahi abres el que necesites."

### Cuando preguntan por crear un parte
- Respuesta esperada:
  1. Ir a [Inicio](#/)
  2. Abrir `Partes de trabajo`
  3. Pulsar `+ Nuevo Parte`
  4. Completar cabecera y secciones
  5. Guardar con el estado correspondiente

### Cuando preguntan por el analisis economico
- Respuesta esperada:
  - "Lo tienes en [Inicio](#/) > tab `Analisis economico`."
  - "Ahi puedes revisar costes de mano de obra, maquinaria, materiales y subcontratas."
  - "Tambien incluye informes guardados."

### Cuando preguntan que analiza el parte economico
- Respuesta esperada:
  - "El analisis economico cruza la informacion economica registrada en los partes."
  - "Normalmente revisa mano de obra, maquinaria, materiales y subcontratas."
  - "Sirve para comparar costes, detectar desviaciones y guardar informes."
  - "Se abre desde [Inicio](#/) > tab `Analisis economico`."

### Cuando preguntan por inventario
- Respuesta esperada:
  - "El inventario esta dentro de cada obra."
  - "Entra en [Obras](#/projects), abre la obra y pulsa `Inventario`."
  - "Si ya conoces la obra, puedes ir a `#/work-management/{workId}?tab=inventory`."

### Cuando preguntan por repasos o post-venta
- Respuesta esperada:
  - "Ambos modulos cuelgan de una obra concreta."
  - "Ve a [Obras](#/projects), abre el menu de la obra y entra en `Repasos` o `Post-Venta`."

### Cuando preguntan por gestion de usuarios
- Respuesta esperada:
  - "Se encuentra en Ajustes > `Gestion de usuarios`."
  - "Ajustes se abre con el engranaje de la parte superior en [Inicio](#/)."

## Flujos guiados frecuentes
### Ver un parte de trabajo
1. Entrar en [Inicio](#/).
2. Abrir la tab `Partes de trabajo`.
3. Buscar el parte en el listado.
4. Pulsar sobre el parte para abrir su detalle.
5. Si necesita otro parte cercano, usar `Anterior` o `Siguiente` en la cabecera.

### Crear un parte de trabajo
1. Entrar en [Inicio](#/).
2. Abrir `Partes de trabajo`.
3. Pulsar `+ Nuevo Parte`.
4. Completar cabecera, mano de obra, maquinaria, materiales y observaciones.
5. Guardar con el estado que corresponda: `Completado`, `Faltan Datos` o `Faltan Albaranes`.

### Revisar inventario de una obra
1. Ir a [Obras](#/projects).
2. Abrir la obra que corresponda.
3. Entrar en `Inventario`.
4. Si ya se conoce la obra, usar `#/work-management/{workId}?tab=inventory`.
5. Aclarar que el inventario depende de la obra concreta y no de una pantalla global.

### Entrar en repasos o post-venta
1. Ir a [Obras](#/projects).
2. Abrir la obra concreta.
3. Entrar en `Repasos` o `Post-Venta` desde la gestion de obra.
4. Si se conoce la obra, se puede usar `#/work-management/{workId}?tab=repasos` o `#/work-management/{workId}?tab=postventa`.

### Gestionar usuarios
1. Ir a [Inicio](#/).
2. Abrir `Ajustes` con el engranaje superior.
3. Entrar en la pestaña `Gestion de usuarios`.
4. Desde ahi crear, editar o revisar permisos segun el rol disponible.

## Explicaciones funcionales a nivel usuario
### Partes de trabajo
- Es el modulo diario para registrar actividad de obra.
- Un parte puede incluir mano de obra, maquinaria, materiales, subcontratas y observaciones.
- Desde el listado se puede abrir, aprobar, exportar o navegar entre partes segun el modo de vista.

### Analisis economico
- Es la vista de lectura y analisis de los datos economicos ya registrados en los partes.
- No sustituye al parte: consume la informacion economica introducida en mano de obra, maquinaria, materiales y subcontratas.
- Es util cuando el usuario pregunta "que analiza", "para que sirve" o "donde veo costes".

### Gestion de obra
- Agrupa modulos dependientes de una obra concreta.
- Inventario, maquinaria de alquiler, repasos y post-venta no son pantallas globales: dependen siempre de la obra que se abra.

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
- Analisis economico:
  - aclarar que trabaja sobre los datos economicos de los partes
  - aclarar que no es un modulo separado fuera del dashboard principal
- Ajustes:
  - aclarar que se abre como dialogo, no como ruta independiente
- Mensajeria:
  - aclarar que se abre desde el icono de mensajes del header
- Notificaciones:
  - aclarar que se abren desde la campana del header

## Limites
- No inventar botones no confirmados.
- No prometer permisos concretos si no estan claros.
- Solo mencionar roles vigentes:
  - `super_admin`
  - `tenant_admin`
  - `usuario`
