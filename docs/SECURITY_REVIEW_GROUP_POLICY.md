# Revisión técnica: política de visibilidad por creator_group_id

**Fecha:** 2026-03-23 (actualizado 2026-03-23)
**Estado:** Fase 1 completa + Fase 2a completa + Fase 2b completa + Fase 2c completa y verificada en local (2026-03-23). TC01–TC04 + TC07–TC09 + T2a-1 a T2a-5 + T05–T09 + T2c-1 a T2c-6 verificados. Pendiente: TC05/TC06 (manual) + despliegue en producción + Fase 2d.
**Rama activa:** `wip/resume-claude-cutoff`
**Propósito:** Documento de referencia para continuar la implementación en contextos futuros.
**Implementación en curso.** Fase 1 Etapas A+B+C y Fase 2a completadas en `wip/resume-claude-cutoff`. Ver §11 para estado detallado.

---

## Índice

1. Resumen ejecutivo
2. Compatibilidad con la arquitectura actual
3. Estado actual de la herencia de `creator_group_id`
4. Cambios en administración de usuarios
5. Cambios en mensajería
6. Cambios en archivos compartidos
7. Política de acceso a work reports — SECCIÓN ACTUALIZADA
8. Riesgos legacy y plan de saneamiento — SECCIÓN ACTUALIZADA
9. Refactor recomendado: capa de políticas de acceso
10. Refactor recomendado: filtrado en DB
11. Prioridad de implementación — SECCIÓN ACTUALIZADA
12. Tabla de archivos, funciones y endpoints afectados
13. Casos de prueba

---

## 1. Resumen ejecutivo

El sistema tiene una base sólida: la lógica de `creator_group_id` ya existe y funciona.
Los problemas son de **aplicación inconsistente** de esa lógica en partes del sistema que la ignoran.

### Crítico (seguridad real, explotable hoy)

- Imágenes de partes de obra servidas sin autenticación via `/static/work-report-images/`
- Endpoints de adjuntos de partes sin validar que el parte existe ni que el usuario tiene acceso
- Tipo de dato roto: `WorkReportAttachment.work_report_id` es `str` pero `WorkReport.id` es `int` — sin FK

### Alto (funcionalidad incorrecta)

- `list_user_profiles()` y `list_users_by_tenant()` devuelven todos los usuarios del tenant sin filtro de grupo
- `approve_user()`, `add_user_role()`, `assign_user_to_work()` no validan `creator_group_id`

### Medio (deuda técnica)

- `_infer_created_by_user_id()` usa substring matching sobre audit_log: frágil
- `delete_conversation()` no re-verifica grupo antes del DELETE bulk
- `_get_ticket_agent_user_ids()` ignora grupos al asignar tickets

---

## 2. Compatibilidad con la arquitectura actual

Las decisiones funcionales son completamente compatibles con la arquitectura existente.
No hay contradicción técnica grave que replantear.

Las piezas clave ya están construidas:

| Función | Archivo | Estado |
|---------|---------|--------|
| `resolve_creator_group_id()` | `app/services/user_service.py:160-222` | Implementada, funciona |
| `users_share_creation_group()` | `app/services/user_service.py:225-253` | Implementada, funciona |
| `_is_message_visible_to_user_group()` | `app/services/message_service.py` | Funciona — patrón a replicar |
| `can_create_contract()` | `app/contracts/permissions.py` | Patrón exacto a generalizar |

Lo que falta es extender el uso de estas funciones a los módulos que aún las ignoran.

---

## 3. Estado actual de la herencia de `creator_group_id`

### Cadena A → B → C: FUNCIONA CORRECTAMENTE

```
super_admin crea tenant_admin_1 (tenant X)
  → creator_group_id = NULL al crear
  → al primer resolve: creator_group_id = tenant_admin_1.id  (auto-grupo)

super_admin crea tenant_admin_2 (tenant X)
  → creator_group_id = tenant_admin_2.id  (distinto al anterior) ✓

tenant_admin_1 crea usuario_B
  → created_by_user_id = tenant_admin_1.id
  → creator_group_id = tenant_admin_1.creator_group_id ✓

usuario_B crea usuario_C
  → created_by_user_id = usuario_B.id
  → resolve recursivo: B.creator_group_id = tenant_admin_1.id
  → C.creator_group_id = tenant_admin_1.id ✓
```

### Gaps confirmados

**GAP-CG1.** `create_user()` solo asigna `creator_group_id` cuando `not current_user.is_super_admin`.
Usuarios creados por super_admin salen con `creator_group_id=NULL` hasta que se resuelve en el primer uso.
Comportamiento aceptable funcionalmente pero genera registros inconsistentes en DB.

**GAP-CG2.** `_infer_created_by_user_id()` en `user_service.py:135-157` escanea `AuditLog` buscando
el email del usuario como **substring** en el campo `details` (texto libre). Frágil: si dos usuarios
tienen emails que son prefijo uno del otro, o si el formato del log cambia, la inferencia falla
o devuelve el creador equivocado.

---

## 4. Cambios en administración de usuarios

### 4.1 Listados

**Problema:** `list_user_profiles()` y `list_users_by_tenant()` devuelven todos los usuarios del tenant.

**Archivo:** `app/services/user_management_service.py` — `list_user_profiles()` líneas 66-104

```python
# CAMBIO: añadir current_user como parámetro y aplicar filtro de grupo
def list_user_profiles(
    session: Session,
    tenant_id: int,
    current_user: User,           # nuevo parámetro
    app_role: Optional[str] = None,
) -> list[UserProfileRead]:
    stmt = select(User).where(
        User.tenant_id == tenant_id,
        User.is_super_admin.is_(False),
    )
    if not current_user.is_super_admin:
        group_id = resolve_creator_group_id(session, current_user, persist=True)
        if group_id is not None:
            stmt = stmt.where(User.creator_group_id == group_id)
    # ... resto sin cambios
```

Aplicar el mismo filtro en `list_users_by_tenant()` de `app/services/user_service.py`.

**Endpoint:** `app/api/v1/user_management.py` línea ~64 — pasar `current_user` al service:

```python
return list_user_profiles(session, tenant_id=tenant_id, current_user=current_user, app_role=app_role)
```

### 4.2 Operaciones individuales de modificación

**Afecta:** `approve_user()`, `add_user_role()`, `remove_user_role()`, `assign_user_to_work()`,
`remove_user_from_work()` en `app/services/user_management_service.py`

**Cambio uniforme:** Después de cargar el `target_user`, antes de cualquier modificación:

```python
if not current_user.is_super_admin:
    if not users_share_creation_group(session, current_user, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para gestionar este usuario.",
        )
```

**Nota:** Asegurarse de que `current_user` se pase como objeto `User` (no solo el ID) en todas las funciones.

---

## 5. Cambios en mensajería

### Lo que ya está correcto (no tocar)

| Función | Archivo | Estado |
|---------|---------|--------|
| `create_message()` | `app/services/message_service.py` | ✓ Valida `users_share_creation_group()` + bloquea super_admin |
| `list_messages_for_user()` | idem | ✓ Filtra por `_is_message_visible_to_user_group()` |
| `mark_message_as_read()` | idem | ✓ Solo receptor |
| `delete_message()` | idem | ✓ Solo sender/recipient |
| `list_contact_users_by_tenant()` | `app/services/user_service.py` | ✓ Filtra por grupo |
| Shared files list/upload/download | `app/api/v1/attachments.py` | ✓ `_is_shared_file_visible_to_user_group()` |

### Gap menor a corregir

**Función:** `delete_conversation()` en `app/services/message_service.py`

El DELETE bulk no verifica grupo antes de ejecutar.

```python
# AÑADIR al inicio de delete_conversation()
other_user = session.get(User, int(other_user_id))
if other_user is None or other_user.tenant_id != tenant_id:
    raise ValueError("Usuario no encontrado.")
if not current_user.is_super_admin:
    if not users_share_creation_group(session, current_user, other_user):
        raise ValueError("No puedes eliminar esta conversación.")
```

### Preparación para evolución futura

Reemplazar las llamadas directas a `users_share_creation_group()` en message_service y
attachments.py por `can_users_message_each_other()` de la capa de políticas (ver §9).
Así cuando la política cambie, solo se toca un punto.

---

## 6. Cambios en archivos compartidos

### Estado actual: BIEN

`_is_shared_file_visible_to_user_group()` usa correctamente `users_share_creation_group()`.
Los endpoints de upload, download, list y delete tienen validación de grupo.
No hay gaps críticos.

### Pendiente menor

`SharedFile.work_report_id` es metadata opcional sin validación. No es un problema de seguridad
(la visibilidad ya la controla el grupo), pero sí de integridad de datos. Puede dejarse
documentado como "campo informativo no validado" o añadir validación opcional al crear.

---

## 7. Política de acceso a work reports — SECCIÓN ACTUALIZADA

### 7.1 Opción A vs Opción B

#### Opción A — Partes visibles a todo el tenant

Cualquier usuario con `erp:read` en el tenant ve todos los partes.

| Aspecto | Evaluación |
|---------|------------|
| Implementación | Sin cambios en la query actual |
| `creator_group_id` en WorkReport | Sería metadato sin uso funcional en filtrado |
| Coherencia con reglas cerradas | **INCOHERENTE.** Si `tenant_admin` no puede ver usuarios de otro grupo (regla 5), tampoco debería ver sus partes de obra — creados por esos mismos usuarios |

#### Opción B — Partes restringidos por `tenant + creator_group_id`

Solo usuarios del mismo `creator_group_id` ven y gestionan los partes.

| Aspecto | Evaluación |
|---------|------------|
| Implementación | Requiere campo + backfill + activar filtro |
| `creator_group_id` en WorkReport | Uso funcional real — no es metadato muerto |
| Coherencia con reglas cerradas | **TOTALMENTE COHERENTE.** Las reglas 1, 5 y 6 establecen que la visibilidad operativa es `tenant + creator_group_id` |
| Modelo mental | Cada rama de la organización tiene su propio espacio operativo, igual que en mensajería y administración de usuarios |

#### Recomendación: Opción B

La razón es estructural: las reglas ya cerradas establecen que compartir tenant **no implica visibilidad**.
Si ese principio rige para usuarios, mensajes y archivos, regirlo también para partes es la única
posición consistente.

**Distinción relevante con el resto del ERP:** Proyectos, tareas, hitos, presupuestos son entidades
de *planificación estructural* con visibilidad tenant-wide. Los partes de obra son *registros de
ejecución diaria* — operativos, no estructurales, con alcance natural en la rama creadora.

**Excepción futura:** Si se necesita que dos grupos colaboren en el mismo parte (ej. subcontrata +
contratista principal), ese es el caso de uso que `can_access_work_report()` permite extender
sin tocar endpoints.

**PRECONDICIÓN CRÍTICA:** El backfill de `creator_group_id` en partes existentes debe completarse
antes de activar el filtro. Activarlo antes hace invisibles los partes legacy para todos los
usuarios normales.

### 7.2 Implementación del campo en el modelo

```python
# app/models/erp.py — añadir a WorkReport
creator_group_id: Optional[int] = Field(default=None, index=True)
```

**Migración Alembic:**

```python
# alembic/versions/XXXX_add_creator_group_id_to_work_report.py
def upgrade():
    op.add_column('erp_work_report',
        sa.Column('creator_group_id', sa.Integer(), nullable=True))
    op.create_index(
        'ix_erp_work_report_tenant_group',
        'erp_work_report', ['tenant_id', 'creator_group_id']
    )

def downgrade():
    op.drop_index('ix_erp_work_report_tenant_group', 'erp_work_report')
    op.drop_column('erp_work_report', 'creator_group_id')
```

### 7.3 Persistir el campo al crear partes

```python
# app/services/erp_service.py — create_work_report()
def create_work_report(session, tenant_id, project_id, payload, current_user, ...):
    creator_group_id = None
    if current_user and not current_user.is_super_admin:
        creator_group_id = resolve_creator_group_id(session, current_user, persist=True)

    report = WorkReport(
        tenant_id=tenant_id,
        project_id=project_id,
        created_by_id=current_user.id if current_user else None,
        creator_group_id=creator_group_id,  # NUEVO
        ...
    )
```

### 7.4 Función de política (Opción B activa)

```python
# app/policies/access_policies.py

def can_access_work_report(
    session,
    user: User,
    report: WorkReport,
) -> bool:
    """
    Política de acceso a partes de obra — Opción B.
    Visibilidad: tenant + creator_group_id.

    PRECONDICIÓN: backfill completado antes de activar este filtro.
    Partes sin creator_group_id → visibles solo para super_admin.

    Futuro: si se habilita colaboración cross-group, extender con
    WorkReportGroupAccess(work_report_id, creator_group_id) sin tocar endpoints.
    """
    if user.is_super_admin:
        return True
    if report.tenant_id != user.tenant_id:
        return False
    if report.creator_group_id is None:
        return False  # legacy sin grupo: solo super_admin puede ver
    user_group = resolve_creator_group_id(session, user, persist=True)
    return user_group == report.creator_group_id


def can_access_work_report_attachment(
    session,
    user: User,
    report: WorkReport,
) -> bool:
    """Los adjuntos heredan el acceso del parte padre."""
    return can_access_work_report(session, user, report)
```

### 7.5 Impacto sobre list_work_reports()

```python
# app/services/erp_service.py
def list_work_reports(session, tenant_id, current_user, ...):
    stmt = select(WorkReport).where(
        WorkReport.tenant_id == tenant_id,
        WorkReport.deleted_at.is_(None),
    )
    # Activar tras completar backfill (Fase 2c)
    if not current_user.is_super_admin:
        group_id = resolve_creator_group_id(session, current_user, persist=True)
        if group_id is not None:
            stmt = stmt.where(WorkReport.creator_group_id == group_id)
    # ... filtros de project_id, date, status
```

### 7.6 Impacto sobre adjuntos (validación en endpoints)

```python
# app/api/v1/attachments.py

def _get_report_or_403(
    session: Session,
    work_report_id: int,
    tenant_id: int,
    current_user: User,
) -> WorkReport:
    """
    Carga el parte y verifica acceso. Aplica en los 4 endpoints de adjuntos.
    Fase 1: verifica existencia + tenant.
    Fase 2c: verifica can_access_work_report_attachment() (activa filtro de grupo).
    """
    report = session.get(WorkReport, work_report_id)
    if not report or report.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Parte no encontrado.")
    if not can_access_work_report_attachment(session, current_user, report):
        raise HTTPException(status_code=403, detail="Sin acceso a este parte.")
    return report
```

Insertar al inicio de cada handler de adjuntos:

```python
report = _get_report_or_403(session, work_report_id, tenant_id, current_user)
```

---

## 8. Riesgos legacy y plan de saneamiento — SECCIÓN ACTUALIZADA

### 8.1 Auditoría SQL inicial

```sql
-- Usuarios non-super-admin sin creator_group_id
SELECT id, email, tenant_id, created_by_user_id, created_at
FROM "user"
WHERE creator_group_id IS NULL
  AND is_super_admin = FALSE
  AND tenant_id IS NOT NULL
ORDER BY tenant_id, created_at;

-- Partes de obra sin creator_group_id (tras migración)
SELECT wr.id, wr.tenant_id, wr.created_by_id,
       u.creator_group_id AS creator_group
FROM erp_work_report wr
LEFT JOIN "user" u ON wr.created_by_id = u.id
WHERE wr.creator_group_id IS NULL
ORDER BY wr.tenant_id, wr.created_at;

-- Adjuntos huérfanos (work_report_id no numérico o no existente)
SELECT a.id, a.work_report_id, a.tenant_id
FROM erp_work_report_attachment a
LEFT JOIN erp_work_report wr ON wr.id::text = a.work_report_id
WHERE wr.id IS NULL;
```

### 8.2 Categorías de backfill

**Categoría 1 — Backfill automático seguro**

Criterio: `user.created_by_user_id IS NOT NULL` Y `creator.creator_group_id IS NOT NULL`

Cadena directa y resuelta. Cero ambigüedad. Ejecutar sin revisión humana.

```sql
SELECT u.id, u.email, c.creator_group_id AS resolved_group
FROM "user" u
JOIN "user" c ON c.id = u.created_by_user_id
WHERE u.creator_group_id IS NULL
  AND u.is_super_admin = FALSE
  AND c.creator_group_id IS NOT NULL;
```

**Categoría 2 — Semi-automático, requiere revisión antes de escribir**

- **2a:** `created_by_user_id` existe pero el creador también tiene `creator_group_id=NULL` (cadena incompleta). Resolver recursivamente con `resolve_creator_group_id()`. Si la cadena llega a un nodo resuelto, el resultado es fiable. Marcar en log para revisión por longitud de cadena.
- **2b:** `created_by_user_id IS NULL` pero hay exactamente **una** entrada en `audit_log` con `action='user.create'` que referencia este `user.id`, creada en ventana de ±5 minutos del `user.created_at`. Alta confianza, no ejecutar en bulk sin lista de afectados.
- **2c:** `created_by_user_id` apunta a un usuario eliminado. Buscar cadena en audit_log del eliminado; si se puede reconstruir, pasar a categoría 1; si no, categoría 3.

**Categoría 3 — Revisión manual obligatoria**

No ejecutar ninguna escritura automática. Presentar con contexto al operador.

| Caso | Descripción | Por qué no automatizar |
|------|-------------|------------------------|
| Múltiples matches en audit_log | Más de una entrada podría ser la creación de este usuario | Riesgo de asignar creador incorrecto → grupo equivocado |
| `created_by_user_id` → `is_super_admin=TRUE` | El super_admin no pertenece a ningún grupo | Decisión de negocio: ¿a qué grupo asignar? |
| Email en audit_log de múltiples tenants | Posible migración o error histórico | Requiere auditoría de cuál registro es el correcto |
| FK apunta a ID inexistente | Usuario eliminado sin rastro | Sin forma de resolver automáticamente |

**Categoría 4 — Auto-grupo aceptable como último recurso**

Solo aplicar cuando se hayan agotado las categorías anteriores Y se cumpla
**al menos una** de estas condiciones:

- El usuario es `tenant_admin` creado por super_admin (tiene su propia jerarquía por diseño)
- El usuario tiene `is_active=FALSE` desde la creación (nunca completó onboarding — no ha generado datos dependientes reales)
- No existe ningún rastro en audit_log ni `created_by_user_id`, y es el único usuario del tenant

**Auto-grupo NO es aceptable** como fallback general para usuarios activos con datos:
visibilizaría retroactivamente sus datos respecto a sus compañeros de jerarquía.

### 8.3 Script de clasificación y backfill

```python
# backend-fastapi/scripts/backfill_creator_groups.py

def classify_user_for_backfill(session: Session, user: User) -> str:
    """
    Clasifica un usuario sin creator_group_id.
    Retorna: 'auto' | 'semi_auto' | 'manual' | 'last_resort'
    """
    if user.created_by_user_id:
        creator = session.get(User, user.created_by_user_id)
        if creator is None:
            return 'manual'         # FK roto
        if creator.is_super_admin:
            return 'manual'         # decisión de negocio
        if creator.creator_group_id is not None:
            return 'auto'           # cadena directa resuelta
        return 'semi_auto'          # cadena incompleta

    # Sin created_by_user_id — buscar audit_log
    matches = _count_audit_matches(session, user)
    if matches == 1:
        return 'semi_auto'
    if matches > 1:
        return 'manual'

    # Sin ningún rastro
    if user.role and 'admin' in (user.role.name or ''):
        return 'last_resort'        # tenant_admin sin creador conocido
    if not user.is_active:
        return 'last_resort'        # nunca activado
    return 'manual'                 # usuario activo sin rastro — no asumir


def run_backfill(session: Session, dry_run: bool = True) -> dict:
    users = session.exec(
        select(User).where(
            User.creator_group_id.is_(None),
            User.is_super_admin.is_(False),
            User.tenant_id.is_not(None),
        )
    ).all()

    report = {'auto': [], 'semi_auto': [], 'manual': [], 'last_resort': []}

    for user in users:
        category = classify_user_for_backfill(session, user)
        report[category].append(user.id)

        if category == 'auto' and not dry_run:
            resolved = resolve_creator_group_id(session, user, persist=True)
            assert resolved is not None

        if category == 'last_resort' and not dry_run:
            if user.id:
                user.creator_group_id = user.id
                session.add(user)

    if not dry_run:
        session.commit()

    return report


def backfill_work_reports(session: Session, dry_run: bool = True) -> dict:
    """
    Solo aplica backfill seguro (Categoría 1 equivalente).
    Si el creator tiene creator_group_id resuelto, copiar directo.
    Si no, dejar para revisión manual.
    """
    reports_pending = session.exec(
        select(WorkReport).where(WorkReport.creator_group_id.is_(None))
    ).all()

    resolved = 0
    unresolved = []

    for report in reports_pending:
        if report.created_by_id:
            creator = session.get(User, report.created_by_id)
            if creator and creator.creator_group_id:
                if not dry_run:
                    report.creator_group_id = creator.creator_group_id
                    session.add(report)
                resolved += 1
            else:
                unresolved.append(report.id)
        else:
            unresolved.append(report.id)

    if not dry_run:
        session.commit()

    return {'resolved': resolved, 'unresolved': unresolved}
```

### 8.4 Mejora de `_infer_created_by_user_id()`

**Cambio en `create_user()`** — pasar a JSON estructurado en audit_log:

```python
# ANTES
log_action(session, user_id=current_user.id, ...,
           action="user.create",
           details=f"Usuario {user.email} creado")

# DESPUÉS
import json
log_action(session, user_id=current_user.id, ...,
           action="user.create",
           details=json.dumps({"created_user_id": user.id, "email": user.email}))
```

**Actualizar `_infer_created_by_user_id()`:**

```python
def _infer_created_by_user_id(session: Session, user: User) -> int | None:
    audit_rows = session.exec(
        select(AuditLog)
        .where(AuditLog.action == "user.create", AuditLog.tenant_id == user.tenant_id)
        .order_by(AuditLog.created_at.desc())
    ).all()

    for row in audit_rows:
        # Intento 1: JSON estructurado (registros nuevos)
        try:
            data = json.loads(row.details or "{}")
            if data.get("created_user_id") == user.id and row.user_id and row.user_id != user.id:
                return int(row.user_id)
        except (json.JSONDecodeError, TypeError, KeyError):
            pass
        # Intento 2: fallback legacy (substring — solo para registros pre-migración)
        normalized = (user.email or "").strip().lower()
        details = (row.details or "").strip().lower()
        if normalized and normalized in details and row.user_id and row.user_id != user.id:
            return int(row.user_id)
    return None
```

---

## 9. Refactor recomendado: capa de políticas de acceso

Crear `backend-fastapi/app/policies/access_policies.py`:

```python
"""
Capa centralizada de políticas de acceso al sistema.

Principios:
- Una función por tipo de operación
- Cada función puede evolucionar independientemente
- Hoy implementa las reglas actuales
- Mañana: extender aquí sin tocar endpoints ni services

Extensiones futuras previstas:
- Mensajería cross-group: añadir tabla GroupCrossMessagingPermission
- Grupos por proyecto: añadir tabla UserProjectGroup o usar UserWorkAssignment
- Colaboración cross-group en partes: añadir tabla WorkReportGroupAccess
"""
from typing import Optional
from app.models.user import User
from app.models.erp import WorkReport
from app.services.user_service import users_share_creation_group, resolve_creator_group_id


def can_users_message_each_other(session, user_a: User, user_b: User) -> bool:
    """
    Política de mensajería directa.
    Hoy: mismo creator_group_id.
    Futuro: cross-group con tabla GroupCrossMessagingPermission.
    """
    return users_share_creation_group(session, user_a, user_b)


def can_user_manage_target_user(
    session,
    actor: User,
    target: User,
    operation: str = "any",
) -> bool:
    """
    Política de administración de usuarios.
    super_admin: puede gestionar todos.
    tenant_admin: solo su grupo (tenant + creator_group_id).
    Futuro: operaciones con permisos granulares distintos por tipo (operation param).
    """
    if actor.is_super_admin:
        return True
    if actor.tenant_id != target.tenant_id:
        return False
    return users_share_creation_group(session, actor, target)


def can_access_work_report(
    session,
    user: User,
    report: WorkReport,
) -> bool:
    """
    Política de acceso a partes de obra — Opción B activa.
    Visibilidad: tenant + creator_group_id.

    PRECONDICIÓN: backfill completado antes de activar este filtro.
    Partes sin creator_group_id → solo super_admin puede ver.

    Futuro: cross-group con WorkReportGroupAccess(work_report_id, creator_group_id).
    """
    if user.is_super_admin:
        return True
    if report.tenant_id != user.tenant_id:
        return False
    if report.creator_group_id is None:
        return False
    user_group = resolve_creator_group_id(session, user, persist=True)
    return user_group == report.creator_group_id


def can_access_work_report_attachment(
    session,
    user: User,
    report: WorkReport,
) -> bool:
    """Los adjuntos heredan el acceso del parte padre."""
    return can_access_work_report(session, user, report)


def can_share_file_with_user(
    session,
    sender: User,
    recipient: User,
) -> bool:
    """
    Política de compartición de archivos en mensajería.
    Hoy: mismo creator_group_id (igual que mensajería).
    Futuro: cross-group con permisos explícitos.
    """
    return users_share_creation_group(session, sender, recipient)
```

---

## 10. Refactor recomendado: filtrado en DB

### Alta prioridad: listados de usuarios

`creator_group_id` ya existe en la tabla `user`. Mover filtro de Python a WHERE:

```python
if not current_user.is_super_admin:
    group_id = resolve_creator_group_id(session, current_user, persist=True)
    if group_id is not None:
        stmt = stmt.where(User.creator_group_id == group_id)
```

### Media: mensajería (requiere join o campo nuevo)

**Opción A — Join sin nuevo campo:**

```python
sender = aliased(User)
recipient = aliased(User)
stmt = (
    select(Message)
    .join(sender, cast(Message.from_user_id, Integer) == sender.id)
    .join(recipient, cast(Message.to_user_id, Integer) == recipient.id)
    .where(
        Message.tenant_id == tenant_id,
        or_(Message.from_user_id == str(user_id), Message.to_user_id == str(user_id)),
        sender.creator_group_id == recipient.creator_group_id,
        sender.creator_group_id == current_group_id,
    )
)
```

**Opción B — Añadir `creator_group_id` a `Message` al crearlo** (más limpio, mayor cambio).

Recomendación: Opción A a corto plazo, B cuando el volumen lo justifique.

### Baja: work reports (requiere campo primero — ya previsto)

Una vez activado el filtro en Fase 2c:

```python
if not current_user.is_super_admin:
    group_id = resolve_creator_group_id(session, current_user)
    if group_id:
        stmt = stmt.where(WorkReport.creator_group_id == group_id)
```

---

## 11. Prioridad de implementación — SECCIÓN ACTUALIZADA (Opción B)

El backfill debe preceder a la activación del filtro de grupo en work reports.
El orden importa: no activar §7.4 hasta completar §8.

### Fase 1 — Crítica: seguridad explotable hoy (sin relación con A/B)

El deploy se divide en tres etapas para no romper el frontend en producción.

#### Etapa A — Backend seguro (deploy independiente) — ✅ COMPLETADO 2026-03-23

Pre-flight verificado 2026-03-23: `erp_work_report_attachment` vacía (0 filas), 12 partes.
Migración `a1b2c3d4e5f6` aplicada en local (`alembic upgrade head` ejecutado 2026-03-23).

| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 2 | Endpoint autenticado `GET /api/v1/work-reports/images/{path}` | `app/api/v1/attachments.py` | ✅ |
| 3 | `_get_report_or_403()` en los 4 handlers de adjuntos (existencia + tenant) | `app/api/v1/attachments.py` | ✅ |
| 3b | `work_report_id` path param: `str` → `int` en los 4 handlers | `app/api/v1/attachments.py` | ✅ |
| 3c | `_work_image_public_url()` genera URLs `/api/v1/work-reports/images/...` | `app/api/v1/attachments.py` | ✅ |
| 3d | `_extract_relative_path_from_image_url()` acepta URLs antiguas y nuevas | `app/api/v1/attachments.py` | ✅ |
| 4 | `WorkReportAttachment.work_report_id`: `str` → `int` con FK CASCADE | `app/models/attachments.py` | ✅ |
| 4b | Migración `a1b2c3d4e5f6` — `VARCHAR→INTEGER` + FK CASCADE a `erp_work_report.id` | `alembic/versions/` | ✅ |

#### Etapa B — Frontend (precondición para Etapa C) — ✅ COMPLETADO 2026-03-23

| # | Tarea | Archivos frontend | Estado |
|---|-------|-------------------|--------|
| B1 | `isStorageUrl()` — aceptar `/api/v1/work-reports/images/` además de `/static/...` | `useWorkReportImages.ts`, `useRepasoImages.ts`, `usePostventaImages.ts` | ✅ |
| B2 | `<AuthenticatedImage>` component + `imageAuth.ts` utility | `src/components/AuthenticatedImage.tsx`, `src/integrations/api/imageAuth.ts` | ✅ |
| B3 | Migrar `WorkReportImageGallery` a carga autenticada (3 img tags) | `WorkReportImageGallery.tsx` | ✅ |
| B4 | Migrar `WorkRepasosSection` a carga autenticada (7 img tags) | `WorkRepasosSection.tsx` | ✅ |
| B5 | `pdfGenerator.ts` — `fetchImageWithAuth()` en `convertUrlToBase64` | `pdfGenerator.ts` | ✅ |
| B6 | `repasosExportUtils.ts` — `fetchImageWithAuth()` en `loadImageAsBase64` | `repasosExportUtils.ts` | ✅ |

**Build verificado:** `tsc --noEmit` ✅ · `npm run build` ✅ (sin errores nuevos)
**Pendiente verificación manual en dev:** TB01–TB12 (ver §13)

#### Etapa C — Corte definitivo (requiere Etapa B desplegada) — ✅ IMPLEMENTADO 2026-03-23

| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| C1 | Migración Alembic backfill `image_url`: `/static/work-report-images/` → `/api/v1/work-reports/images/` | `alembic/versions/c3d4e5f6a7b8_backfill_image_url_static_to_api.py` | ✅ |
| C2 | Eliminar mount estático `/static/work-report-images/` (mkdir conservado) | `app/main.py:90-92` | ✅ |
| C3 | Pre-flight SQL incluido en cabecera de la migración C1 y verificación en `upgrade()` | `alembic/versions/c3d4e5f6a7b8` | ✅ |
| C4 | T7: grep frontend — 0 construcciones hardcodeadas de `/static/work-report-images/` | `src/**/*.{ts,tsx}` | ✅ |

**Estado local + Docker (2026-03-23):** `alembic upgrade head` aplicado — BD en `c3d4e5f6a7b8` (head).
Pre-flight: A=0 IDs no numéricos · B=0 huérfanos · C=0 URLs legacy · 0 filas afectadas en backfill (tabla vacía).
`work_report_id` confirmado `INTEGER` + FK CASCADE. Imagen Docker reconstruida y contenedor reiniciado.

**TC01–TC04, TC07–TC09 verificados contra Docker (puerto 8000) — todos OK.**

**Pendiente operacional:**
- TC05/TC06: verificación manual en navegador (frontend + PDF con imágenes reales)
- Despliegue en servidor de producción remoto (cuando proceda)

### Fase 2a — Preparar campo en WorkReport (sin activar filtro) — ✅ COMPLETADO 2026-03-23

Migración `d4e5f6a7b8c9` creada. Pendiente: `alembic upgrade head` en servidor.

| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 5 | Migración Alembic: añadir `creator_group_id` nullable a `erp_work_report` + índice `ix_erp_work_report_tenant_group` | `alembic/versions/d4e5f6a7b8c9_add_creator_group_id_to_work_report.py` | ✅ |
| 6 | Actualizar modelo `WorkReport`: campo + índice en `__table_args__` | `app/models/erp.py` | ✅ |
| 7 | Persistir `creator_group_id` al crear nuevos partes — `resolve_creator_group_id()` via PK lookup interno; sin cambio de firma en callers | `app/services/erp_service.py` | ✅ |
| 7b | `creator_group_id: Optional[int] = None` añadido a `WorkReportRead` | `app/schemas/erp.py` | ✅ |

**Verificaciones ejecutadas (2026-03-23):**
- `tsc --noEmit` ✅ (sin errores nuevos)
- imports Python limpios: modelo, schema, service ✅
- `ix_erp_work_report_tenant_group` presente en `__table_args__` ✅
- `alembic upgrade head`: c3d4e5f6a7b8 → d4e5f6a7b8c9 (head) ✅
- columna `INTEGER nullable` + índice confirmados en Postgres (`\d erp_work_report`) ✅
- imagen Docker reconstruida (`docker compose build backend-fastapi`) ✅
- T2a-1 a T2a-5 verificados con script Python contra BD real ✅
- respuesta API REST incluye campo `creator_group_id` en JSON ✅
- pytest: fallo pre-existente JSONB/SQLite en conftest (no relacionado con Fase 2a) ⚠️

**Comportamiento post-Fase 2a:**
- Usuario normal crea parte → `creator_group_id` resuelto y persistido.
- super_admin crea parte → `creator_group_id = NULL` (correcto por diseño).
- `current_user_id = None` → `creator_group_id = NULL`.
- Partes legacy: intactos, `creator_group_id = NULL` hasta Fase 2c (backfill).
- `list_work_reports()` sin cambios — no filtra por grupo todavía.

*Desde aquí todos los partes nuevos tienen el campo. Los legacy siguen en NULL hasta Fase 2c.*

### Fase 2b — Administración de usuarios — ✅ IMPLEMENTADO 2026-03-23

| # | Tarea | Archivos | Estado |
|---|-------|----------|--------|
| 8 | Filtro de grupo en `list_user_profiles()` | `app/services/user_management_service.py` | ✅ |
| 9 | Filtro de grupo en `list_users_by_tenant()` | `app/services/user_service.py` | ✅ |
| 10 | Pasar `current_user` al service desde endpoint | `app/api/v1/user_management.py` | ✅ |
| 11 | Validación de grupo en `approve_user()`, `add_user_role()`, `remove_user_role()`, `assign_user_to_work()`, `remove_user_from_work()` | `app/services/user_management_service.py` | ✅ |

**Cambios implementados (2026-03-23):**
- `user_management_service.py`: añadidos imports `HTTPException, status` (fastapi) + `resolve_creator_group_id, users_share_creation_group` (user_service). `list_user_profiles()` recibe `current_user: User` y aplica filtro `WHERE creator_group_id = group_id`. `add_user_role()`, `remove_user_role()`, `approve_user()`, `assign_user_to_work()`, `remove_user_from_work()`: firmas cambiadas de `current_user_id: Optional[int]` a `current_user: User`; guard 403 antes de cualquier write; `_user_or_404()` capturado en `user` para pasar a `users_share_creation_group()`.
- `user_service.py`: `list_users_by_tenant()` aplica filtro `WHERE creator_group_id = group_id` si no es super_admin.
- `user_management.py`: todas las llamadas actualizadas a la nueva firma (`current_user=current_user` en lugar de `current_user_id=current_user.id`).
- Sintaxis verificada (AST parse) ✅.
- **Verificado contra Docker local (2026-03-23):** T05–T09 todos OK. Ver §13 para detalle.
- **Pendiente:** despliegue en servidor de producción remoto (cuando proceda).

### Fase 2c — Backfill de usuarios y partes legacy — ✅ COMPLETADA 2026-03-23

Script: `backend-fastapi/scripts/backfill_creator_groups.py`

| # | Tarea | Estado |
|---|-------|--------|
| 12 | Ejecutar script auditoría en `dry_run=True` | ✅ Ejecutado — 1 usuario semi_auto, 14 partes pending |
| 13 | Aplicar Categoría 1 (automático seguro) para usuarios | ✅ Ejecutado — 0 casos Category 1 en este entorno |
| 14 | Revisar Categoría 2 (semi_auto) | ✅ Revisado — 1 caso: `user_id=5`, creado por super_admin → auto-grupo aplicado manualmente |
| 15 | Resolver Categoría 3 (manual) | ✅ Sin casos Category 3 en este entorno |
| 16 | Backfill de work_reports | ✅ Ejecutado — 1 parte resuelto (`report_id=3`, `creator_group_id=3`) |
| 17 | Documentar irresolubles | ✅ Ver tabla de casos cerrados más abajo |

**Comandos ejecutados (2026-03-23, BD local `localhost:5433/saas`):**
```bash
python -m scripts.backfill_creator_groups --dry-run --verbose       # auditoria
python -m scripts.backfill_creator_groups --apply-auto --verbose     # Paso 1 (0 aplicados)
python -m scripts.backfill_creator_groups --apply-work-reports --verbose  # Paso 2 (1 aplicado)
# Paso 3 (last_resort): no necesario — 0 casos clasificados como last_resort
# user_id=5: UPDATE manual directo (ver regla documental más abajo)
```

**Resultados reales (Q5/Q6 post-backfill):**

| Métrica | con_grupo | sin_grupo | total | cobertura |
|---------|-----------|-----------|-------|-----------|
| Usuarios (Q5) | 3 | 0 | 3 | **100%** |
| Partes activos (Q6) | 2 | 12 | 14 | 14.3% |

**Nota sobre Q6 (14.3%):** el porcentaje bajo es correcto por diseño. Los 12 partes con NULL fueron todos creados por `dios@cortecelestial.god` (super_admin, `user_id=1`). Son irresolubles por diseño y quedarán visibles solo para super_admin en Fase 2d. Ningún parte de usuario normal tiene NULL.

**Casos cerrados y documentados:**

| Entidad | ID | Estado final | Razón |
|---------|----|-------------|-------|
| Usuario | 5 (`master.urdecon@hotmail.com`) | `creator_group_id=5` (auto-grupo) | Creado por super_admin sin evidencia de pertenencia a rama existente → regla documental aplicada |
| Parte | 3 | `creator_group_id=3` | Backfill seguro desde `creator_id=3` |
| Partes | 1,2,4,5,6,7,8,9,10,11,12,13,15 | NULL permanente | Todos creados por super_admin — correcto por diseño |

**Regla documental (para casos futuros similares):**
> **Usuario activo creado por super_admin sin evidencia fiable de pertenencia a una rama existente → asignar auto-grupo propio (`creator_group_id = user.id`).**
> Justificación: mantiene la lógica de ramas independientes. No visibiliza datos hacia otros grupos. Es reversible si posteriormente se decide mover al usuario a una rama.

**Criterios de cierre verificados:**
- [x] Q5: 0 usuarios activos con NULL — 100% cobertura
- [x] Q6: todos los NULL identificados (super_admin por diseño) — ningún parte de usuario normal con NULL
- [x] 0 errores en `report["errors"]` en todos los pasos
- [x] Casos pendientes documentados en esta tabla
- [x] Nuevos partes/usuarios (post-Fase-2a) heredan `creator_group_id` correctamente (T2a-1, T2a-2)

**Fase 2c CERRADA. Siguiente: Fase 2d.**

### Fase 2d — Activar filtro de grupo en work reports (solo cuando backfill ≥95%)

| # | Tarea |
|---|-------|
| 18 | Actualizar `can_access_work_report()` con lógica Opción B |
| 19 | Activar filtro en `list_work_reports()` |
| 20 | Activar validación de grupo en `_get_report_or_403()` de adjuntos |
| 21 | Partes con `creator_group_id=NULL` → visibles solo para super_admin |

### Fase 3 — Centralización y deuda técnica

| # | Tarea | Archivos |
|---|-------|----------|
| 22 | Crear `app/policies/access_policies.py` | nuevo |
| 23 | Reemplazar llamadas directas en message_service y attachments.py | varios |
| 24 | Fix `delete_conversation()` con verificación de grupo | `app/services/message_service.py` |
| 25 | Migrar `log_action` en `create_user` a JSON estructurado | `app/services/user_service.py` |
| 26 | Actualizar `_infer_created_by_user_id()` con fallback legacy | `app/services/user_service.py` |
| 27 | Filtro de grupo en `_get_ticket_agent_user_ids()` | `app/services/ticket_service.py` |

### Fase 4 — Rendimiento

| # | Tarea |
|---|-------|
| 28 | Mover filtro de grupos en mensajería de Python a SQL (join con User) |
| 29 | Formalizar startup DDL como migraciones Alembic |

---

## 12. Tabla de archivos, funciones y endpoints afectados

| Archivo | Función / Clase | Tipo de cambio | Fase |
|---------|----------------|----------------|------|
| `app/main.py` | mount `/static/work-report-images` | Eliminado (mkdir conservado) | 1 (Etapa C) ✅ |
| `alembic/versions/c3d4e5f6a7b8` | backfill `image_url` `/static/` → `/api/v1/` | Migración + pre-flight check en upgrade() | 1 (Etapa C) ✅ |
| `app/models/attachments.py` | `WorkReportAttachment.work_report_id` | `str` → `int` + FK CASCADE | 1 (Etapa A) ✅ |
| `app/models/erp.py` | `WorkReport` | Añadir `creator_group_id` + índice compuesto | 2a ✅ |
| `app/api/v1/attachments.py` | handlers adjuntos de partes | `_get_report_or_403()` + `work_report_id: int` | 1 (Etapa A) ✅ |
| `app/api/v1/attachments.py` | `serve_work_report_image` | Nuevo endpoint autenticado | 1 (Etapa A) ✅ |
| `app/api/v1/attachments.py` | `_work_image_public_url()` | URL → `/api/v1/work-reports/images/...` | 1 (Etapa A) ✅ |
| `app/api/v1/attachments.py` | `_extract_relative_path_from_image_url()` | Nuevo helper — acepta URLs antiguas y nuevas | 1 (Etapa A) ✅ |
| `alembic/versions/a1b2c3d4e5f6` | migración FK en WorkReportAttachment | `VARCHAR→INTEGER` + FK CASCADE | 1 (Etapa A) ✅ |
| `app/api/v1/user_management.py` | `api_list_user_profiles()` | Pasar `current_user` al service | 2b |
| `app/services/erp_service.py` | `create_work_report()` | Persistir `creator_group_id` (PK lookup interno, sin cambio de firma) | 2a ✅ |
| `app/services/erp_service.py` | `list_work_reports()` | Filtro de grupo | 2d |
| `app/services/user_service.py` | `list_users_by_tenant()` | Filtro de grupo | 2b |
| `app/services/user_service.py` | `_infer_created_by_user_id()` | JSON + fallback | 3 |
| `app/services/user_management_service.py` | `list_user_profiles()` | Filtro de grupo + `current_user` | 2b |
| `app/services/user_management_service.py` | `approve_user()` | Verificar grupo | 2b |
| `app/services/user_management_service.py` | `add_user_role()` / `remove_user_role()` | Verificar grupo | 2b |
| `app/services/user_management_service.py` | `assign_user_to_work()` / `remove_user_from_work()` | Verificar grupo | 2b |
| `app/services/message_service.py` | `delete_conversation()` | Verificar grupo antes de DELETE | 3 |
| `app/services/ticket_service.py` | `_get_ticket_agent_user_ids()` | Filtro de grupo | 3 |
| `app/policies/access_policies.py` | (nuevo módulo) | Crear | 3 |
| `alembic/versions/` | nueva migración | FK en WorkReportAttachment | 1 |
| `alembic/versions/d4e5f6a7b8c9` | migración `creator_group_id` en WorkReport | columna nullable + índice compuesto | 2a ✅ |
| `scripts/backfill_creator_groups.py` | (nuevo) | Auditoría + backfill | 2c |

### Endpoints a tocar

| Método | Ruta | Cambio | Fase |
|--------|------|--------|------|
| GET | `/work-reports/{id}/attachments` | Validar parte existe + acceso | 1 |
| POST | `/work-reports/{id}/attachments` | idem | 1 |
| PATCH | `/work-reports/{id}/attachments/{aid}` | idem | 1 |
| DELETE | `/work-reports/{id}/attachments/{aid}` | idem | 1 |
| GET | `/static/work-report-images/...` | Eliminar (reemplazar por endpoint autenticado) | 1 |
| GET | `/erp/user-management/users` | Filtrar por creator_group | 2b |
| POST | `/erp/user-management/users/{id}/approve` | Verificar grupo | 2b |
| POST/DELETE | `/erp/user-management/users/{id}/roles` | Verificar grupo | 2b |
| POST/DELETE | `/erp/user-management/assignments` | Verificar grupo | 2b |

---

## 13. Casos de prueba

### Herencia de `creator_group_id`

```
T01: super_admin crea tenant_admin_1 y tenant_admin_2 en mismo tenant
     → tenant_admin_1.creator_group_id ≠ tenant_admin_2.creator_group_id ✓

T02: tenant_admin_A crea user_B
     → user_B.creator_group_id == tenant_admin_A.creator_group_id ✓

T03: user_B crea user_C
     → user_C.creator_group_id == tenant_admin_A.creator_group_id ✓

T04: resolve_creator_group_id() en user sin created_by_user_id
     → devuelve user.id como auto-grupo ✓
```

### Administración de usuarios (post Fase 2b)

```
-- Verificados contra Docker local (2026-03-23) — Fase 2b completa --
T05: user4 (tenant_admin, creator_group_id=4) lista usuarios
     → solo devuelve [id=4] — OK ✅
T05b: user4 → super_admin NO aparece en la lista — OK ✅
T06: user4 POST /users/3/approve (user3 en grupo 3, distinto) → HTTP 403
     → {"detail":"No tienes permiso para gestionar este usuario."} ✅
T07a: user4 POST /users/3/roles {"role":"foreman"} → HTTP 403 ✅
T07b: user4 DELETE /users/3/roles/foreman → HTTP 403 ✅
T07c: user4 POST /assignments {"user_id":3,"work_id":1} → HTTP 403 ✅
T07d: user4 DELETE /assignments?user_id=3&work_id=1 → HTTP 403 ✅
T08: super_admin lista usuarios → [3,4,5] (todos), sin restricción → HTTP 200 ✅
T08b: super_admin POST /users/3/approve → HTTP 200, approved=true ✅
T08c: super_admin POST /users/3/roles → HTTP 200, roles incluidos ✅
T09: super_admin lista usuarios → cortecelestial.god NO aparece — OK ✅
```

**Efectos secundarios verificados:**
- `creator_group_id` de user4 auto-resuelto a 4 y persistido en BD en primera llamada (`persist=True`) ✅
- user5 (no consultado) permanece con `creator_group_id=NULL` hasta su primera llamada — comportamiento esperado ✅

### Mensajería

```
T10: user_B (grupo A) envía mensaje a user_C (grupo A) → 200 ✓
T11: user_B (grupo A) envía mensaje a user_D (grupo B) → HTTP 403 ✓
T12: GET /contacts → super_admin NO aparece en la lista ✓
T13: GET /contacts → solo devuelve usuarios del mismo creator_group_id ✓
T14: delete_conversation con other_user_id de otro grupo → HTTP 403 ✓ (post Fase 3)
```

### Partes de obra y adjuntos

```
-- Activos desde Etapa A (2026-03-23) --
T15: GET /work-reports/{id}/attachments con id inexistente → HTTP 404 ✓
T16: GET /work-reports/{id}/attachments de otro tenant → HTTP 404 ✓
T17: POST adjunto a parte propio → 201 ✓
T19: GET /api/v1/work-reports/images/{path} sin token → HTTP 401 ✓
T19b: GET /api/v1/work-reports/images/tenant_X/... con token de tenant_Y → HTTP 403 ✓
T19c: DELETE /attachments/images/by-url con URL antigua /static/... → funciona ✓
T19d: DELETE /attachments/images/by-url con URL nueva /api/v1/... → funciona ✓

-- Activos desde Etapa C — verificados en local 2026-03-23 --
TC01: GET /static/work-report-images/... cualquier path → HTTP 404 (mount eliminado) ✅
TC02: GET /api/v1/work-reports/images/{path} sin Authorization → HTTP 401 ✅
TC03: GET /api/v1/work-reports/images/tenant_N/{path} con token tenant_N → HTTP 404 (archivo no existe, pero auth+prefix OK) ✅
TC04: GET /api/v1/work-reports/images/tenant_X/{path} con token tenant_Y → HTTP 403 ✅
TC05: Abrir parte de obra en frontend con adjuntos → imágenes cargan (AuthenticatedImage) ⏳ verificar manual
TC06: Generar PDF con imágenes de partes → PDF incluye imágenes correctamente ⏳ verificar manual
TC07: SELECT COUNT(*) FROM erp_work_report_attachment WHERE image_url LIKE '%/static/work-report-images/%' → 0 ✅ (tabla vacía en local)
TC08: Subir imagen → image_url = http://.../api/v1/work-reports/images/tenant_1/work-reports/12/... ✅ sin /static/
TC09: DELETE /attachments/images/by-url con URL /api/v1/... → HTTP 200 {success:true, deleted:true} ✅

-- Activos desde Fase 2a — verificados en Docker local 2026-03-23 --
T2a-1: usuario normal (user_id=3) crea parte → parte id=14 creator_group_id=3 ✅
T2a-2: super_admin (user_id=1) crea parte → parte id=13 creator_group_id=NULL ✅
T2a-3: POST /api/v1/erp/work-reports via API (SA) → JSON incluye "creator_group_id": null ✅
T2a-4: 5 partes legacy leídos → creator_group_id=NULL sin error ni rotura ✅
T2a-5: list_work_reports devuelve 12 partes — grupos: {None, 3} (sin filtro activo) ✅
  · alembic upgrade head aplicado: c3d4e5f6a7b8 → d4e5f6a7b8c9 (head) ✅
  · columna INTEGER nullable + ix_erp_work_report_tenant_group en Postgres ✅
  · imagen Docker reconstruida y container reiniciado ✅

-- Activos post Fase 2d (pendiente) --
T20: user del grupo A accede a parte del grupo B → HTTP 403 ✓
T21: super_admin accede a parte legacy sin creator_group_id → 200 ✓
T22: usuario normal accede a parte legacy sin creator_group_id → HTTP 403 ✓
```

### Backfill legacy (post Fase 2c)

```
T23: script con dry_run=True → clasifica sin escribir, devuelve informe correcto ✓
T24: usuario Categoría 1 → creator_group_id resuelto directamente ✓
T25: usuario Categoría 4 (tenant_admin sin creador) → auto-grupo = propio ID ✓
T26: usuario activo sin rastro → clasificado como 'manual', no modificado ✓
```

---

## Notas para retomar en futuras sesiones

### Estado de implementación (2026-03-23)

- **Fase 1 Etapa A completada** (2026-03-23). Migración `a1b2c3d4e5f6` aplicada en local.
- **Fase 1 Etapa B completada** (2026-03-23). Build ✅. Pendiente: verificación manual TC01–TC09 con backend levantado.
  - Nuevos archivos: `src/integrations/api/imageAuth.ts`, `src/components/AuthenticatedImage.tsx`
  - Modificados: `useWorkReportImages.ts`, `useRepasoImages.ts`, `usePostventaImages.ts`, `WorkReportImageGallery.tsx`, `WorkRepasosSection.tsx`, `pdfGenerator.ts`, `repasosExportUtils.ts`
- **Fase 1 Etapa C completada y verificada** (2026-03-23). Migraciones aplicadas, imagen Docker reconstruida, TC01–TC04 + TC07–TC09 verificados contra Docker. Pendiente: TC05/TC06 (navegador) + despliegue remoto.
  - Mount `/static/work-report-images/` eliminado de `app/main.py` (mkdir conservado)
  - Migración `c3d4e5f6a7b8`: backfill `image_url` + pre-flight automático — 0 filas afectadas (tabla vacía)
  - TC01 /static/ 404 · TC02 sin token 401 · TC03 propio 404 · TC04 cross-tenant 403 · TC07 0 legacy · TC08 201+URL /api/v1/ · TC09 200+deleted=true
- **Fase 2a completada y verificada en Docker local** (2026-03-23).
  - `WorkReport.creator_group_id: Optional[int]` + índice `ix_erp_work_report_tenant_group` en modelo y `__table_args__`
  - `WorkReportRead.creator_group_id: Optional[int] = None` en schema
  - `create_work_report()`: PK lookup interno → `resolve_creator_group_id()` → persiste campo; sin cambio de firma en callers
  - Import `resolve_creator_group_id` añadido a `erp_service.py`
  - Migración `d4e5f6a7b8c9` aplicada: columna + índice en Postgres ✅
  - Docker image reconstruida y container reiniciado ✅
  - T2a-1 a T2a-5: todos OK (ver §13) ✅
  - Pendiente: despliegue en servidor de producción remoto (cuando proceda)
- **Fase 2b completada y verificada** (2026-03-23).
  - `user_management_service.py`: imports `HTTPException, status` + `resolve_creator_group_id, users_share_creation_group`. `list_user_profiles()` recibe `current_user: User`, filtro `WHERE creator_group_id = group_id`. `add_user_role()`, `remove_user_role()`, `approve_user()`, `assign_user_to_work()`, `remove_user_from_work()`: guard 403 antes de cualquier write.
  - `user_service.py`: `list_users_by_tenant()` aplica filtro de grupo.
  - `user_management.py`: 6 llamadas actualizadas a nueva firma.
  - T05–T09: todos verificados contra Docker ✅
- Fases 2c, 2d, 3, 4: sin implementar.

### Decisiones y orden crítico

- **Decisión tomada:** Opción B para work reports (restringidos por `tenant + creator_group_id`).
- **Orden crítico:** Fase 1 Etapa A → Fase 1 Etapa B (frontend) → Fase 1 Etapa C → Fase 2a → Fase 2b → Fase 2c (backfill) → Fase 2d (activar filtro de grupo).
- **No activar filtro de grupo en work reports (Fase 2d) antes de completar el backfill (Fase 2c).**
- **No eliminar el mount estático (Etapa C) antes de desplegar los cambios de frontend (Etapa B):** el frontend usa `<img src>` sin token — eliminar el mount antes rompe todas las imágenes de partes en la UI y en los PDFs.

### Notas técnicas

- El campo `creator_group_id` en `WorkReport` tiene uso funcional real (no es metadato): es la base para el filtrado de Fase 2d y para la validación de adjuntos.
- `_get_report_or_403()` ya está implementado con firma preparada para Fase 2d: añadir `can_access_work_report_attachment()` allí sin cambiar la firma ni los callers.
- La capa de políticas (`app/policies/access_policies.py`) se crea en Fase 3, pero sus firmas están definidas en §9 para que los cambios de Fase 2 ya usen las firmas correctas cuando se creen.
- Los archivos de referencia del código están en `backend-fastapi/app/`.
- Branch activo: `wip/resume-claude-cutoff`.
