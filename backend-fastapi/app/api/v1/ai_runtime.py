from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.db.session import get_session
from app.models.erp import ExternalCollaboration, RentalMachinery, WorkReport
from app.models.inventory import InventoryMovement, WorkInventoryItem, WorkInventorySyncLog
from app.models.user import User


router = APIRouter()

_DEFAULT_BRAND_COLOR = {"hex": "#2563EB", "name": "Default Blue"}
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_CLEAN_WS_RE = re.compile(r"\s+")


class GenerateSummaryReportRequest(BaseModel):
    workReports: list[dict[str, Any]] = Field(default_factory=list)
    filters: dict[str, Any] | None = None
    organizationId: Any | None = None


class AnalyzeWorkImageRequest(BaseModel):
    imageBase64: str


class AnalyzeLogoColorsRequest(BaseModel):
    imageDataUrl: str


class StandardizationUpdate(BaseModel):
    oldName: str
    newName: str


class StandardizeCompaniesRequest(BaseModel):
    action: str
    threshold: float = 0.7
    updates: list[StandardizationUpdate] = Field(default_factory=list)


class AnalyzeInventoryRequest(BaseModel):
    work_id: str


class PopulateInventoryRequest(BaseModel):
    work_id: str
    force: bool = False


class CleanInventoryRequest(BaseModel):
    work_id: str
    organization_id: str | None = None


class InventoryListFilters(BaseModel):
    work_id: str


class InventoryUpdateRequest(BaseModel):
    name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    category: str | None = None
    last_supplier: str | None = None
    last_entry_date: str | None = None
    notes: str | None = None
    product_code: str | None = None
    unit_price: float | None = None
    total_price: float | None = None
    delivery_note_number: str | None = None
    batch_number: str | None = None
    brand: str | None = None
    model: str | None = None
    condition: str | None = None
    location: str | None = None
    exit_date: str | None = None
    observations: str | None = None


class MergeSuppliersRequest(BaseModel):
    work_id: str
    target_supplier: str
    suppliers_to_merge: list[str] = Field(default_factory=list)
    update_report_material_groups: bool = False


class ValidateFixInventoryRequest(BaseModel):
    work_id: str


class InventoryAnalysisAction(BaseModel):
    item_id: str
    action: str
    suggested_changes: dict[str, Any] | None = None


class ApplyInventoryAnalysisRequest(BaseModel):
    work_id: str
    results: list[InventoryAnalysisAction] = Field(default_factory=list)


def _lovable_api_key() -> str:
    key = (settings.lovable_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LOVABLE_API_KEY no configurada.",
        )
    return key


async def _lovable_chat(payload: dict[str, Any], *, timeout: int = 60) -> dict[str, Any]:
    key = _lovable_api_key()
    url = "https://ai.gateway.lovable.dev/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
        )
    if response.status_code == 402:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment required. Please add credits to your Lovable workspace.",
        )
    if response.status_code >= 400:
        snippet = response.text[:240]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI gateway error ({response.status_code}): {snippet}",
        )

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Respuesta invalida desde AI gateway.",
        ) from exc


def _as_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_report(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw.get("id"),
        "date": raw.get("date"),
        "workName": raw.get("workName") or raw.get("work_name") or "",
        "workNumber": raw.get("workNumber") or raw.get("work_number") or "",
        "foreman": raw.get("foreman") or "",
        "foremanHours": raw.get("foremanHours") or raw.get("foreman_hours") or 0,
        "siteManager": raw.get("siteManager") or raw.get("site_manager") or "",
        "status": raw.get("status") or "completed",
        "approved": bool(raw.get("approved") or False),
        "workGroups": raw.get("workGroups") or raw.get("work_groups") or [],
        "machineryGroups": raw.get("machineryGroups") or raw.get("machinery_groups") or [],
        "materialGroups": raw.get("materialGroups") or raw.get("material_groups") or [],
        "subcontractGroups": raw.get("subcontractGroups") or raw.get("subcontract_groups") or [],
        "observations": raw.get("observations") or "",
    }


def _safe_date_str(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) >= 10:
        return text[:10]
    return text


def _calculate_statistics(reports: list[dict[str, Any]]) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "totalReports": len(reports),
        "completedReports": 0,
        "approvedReports": 0,
        "pendingReports": 0,
        "totals": {
            "workHours": 0.0,
            "workersCount": 0,
            "machineryHours": 0.0,
            "machineryCount": 0,
            "materialCost": 0.0,
            "materialItems": 0,
            "subcontractCost": 0.0,
            "subcontractWorkers": 0,
            "foremanHours": 0.0,
        },
        "byWork": {},
        "byCompany": {},
        "bySupplier": {},
        "byMonth": {},
        "byDayOfWeek": {},
        "dateRange": {"earliest": "", "latest": ""},
        "foremen": [],
        "siteManagers": [],
    }

    sorted_reports = sorted(reports, key=lambda r: _safe_date_str(r.get("date")))
    if sorted_reports:
        stats["dateRange"]["earliest"] = _safe_date_str(sorted_reports[0].get("date"))
        stats["dateRange"]["latest"] = _safe_date_str(sorted_reports[-1].get("date"))

    foremen: set[str] = set()
    site_managers: set[str] = set()

    day_names = [
        "Domingo",
        "Lunes",
        "Martes",
        "Miercoles",
        "Jueves",
        "Viernes",
        "Sabado",
    ]

    for report in reports:
        date_str = _safe_date_str(report.get("date"))
        if report.get("status") == "completed":
            stats["completedReports"] += 1
        else:
            stats["pendingReports"] += 1
        if report.get("approved"):
            stats["approvedReports"] += 1

        stats["totals"]["foremanHours"] += _as_float(report.get("foremanHours"))

        foreman = str(report.get("foreman") or "").strip()
        site_manager = str(report.get("siteManager") or "").strip()
        if foreman:
            foremen.add(foreman)
        if site_manager:
            site_managers.add(site_manager)

        month_key = date_str[:7] if len(date_str) >= 7 else "unknown"
        by_month = stats["byMonth"].setdefault(
            month_key,
            {
                "reports": 0,
                "workHours": 0.0,
                "machineryHours": 0.0,
                "materialCost": 0.0,
                "subcontractCost": 0.0,
            },
        )
        by_month["reports"] += 1

        try:
            day_idx = datetime.fromisoformat(date_str).weekday()
            day_name = day_names[(day_idx + 1) % 7]
        except ValueError:
            day_name = "Desconocido"
        stats["byDayOfWeek"][day_name] = stats["byDayOfWeek"].get(day_name, 0) + 1

        work_key = f"{report.get('workNumber', '')} - {report.get('workName', '')}".strip(" -")
        if not work_key:
            work_key = "Obra sin nombre"
        by_work = stats["byWork"].setdefault(
            work_key,
            {
                "reportCount": 0,
                "workHours": 0.0,
                "machineryHours": 0.0,
                "materialCost": 0.0,
                "subcontractCost": 0.0,
                "companies": [],
            },
        )
        by_work["reportCount"] += 1
        companies_set = set(by_work.get("companies", []))

        for group in report.get("workGroups") or []:
            company = str((group or {}).get("company") or "Sin empresa").strip() or "Sin empresa"
            companies_set.add(company)
            by_company = stats["byCompany"].setdefault(
                company,
                {"workHours": 0.0, "machineryHours": 0.0, "reportCount": 0},
            )
            by_company["reportCount"] += 1
            for item in (group or {}).get("items") or []:
                hours = _as_float((item or {}).get("hours"))
                stats["totals"]["workHours"] += hours
                stats["totals"]["workersCount"] += 1
                by_company["workHours"] += hours
                by_work["workHours"] += hours
                by_month["workHours"] += hours

        for group in report.get("machineryGroups") or []:
            company = str((group or {}).get("company") or "Sin empresa").strip() or "Sin empresa"
            by_company = stats["byCompany"].setdefault(
                company,
                {"workHours": 0.0, "machineryHours": 0.0, "reportCount": 0},
            )
            for item in (group or {}).get("items") or []:
                hours = _as_float((item or {}).get("hours"))
                stats["totals"]["machineryHours"] += hours
                stats["totals"]["machineryCount"] += 1
                by_company["machineryHours"] += hours
                by_work["machineryHours"] += hours
                by_month["machineryHours"] += hours

        for group in report.get("materialGroups") or []:
            supplier = str((group or {}).get("supplier") or "Sin proveedor").strip() or "Sin proveedor"
            by_supplier = stats["bySupplier"].setdefault(
                supplier,
                {"materialCost": 0.0, "itemCount": 0},
            )
            for item in (group or {}).get("items") or []:
                total = _as_float((item or {}).get("total"))
                if total <= 0:
                    total = _as_float((item or {}).get("quantity")) * _as_float((item or {}).get("unitPrice"))
                stats["totals"]["materialCost"] += total
                stats["totals"]["materialItems"] += 1
                by_supplier["materialCost"] += total
                by_supplier["itemCount"] += 1
                by_work["materialCost"] += total
                by_month["materialCost"] += total

        for group in report.get("subcontractGroups") or []:
            for item in (group or {}).get("items") or []:
                cost = _as_float((item or {}).get("total"))
                workers = int(_as_float((item or {}).get("workers")))
                stats["totals"]["subcontractCost"] += cost
                stats["totals"]["subcontractWorkers"] += workers
                by_work["subcontractCost"] += cost
                by_month["subcontractCost"] += cost

        by_work["companies"] = sorted(companies_set)

    stats["foremen"] = sorted(foremen)
    stats["siteManagers"] = sorted(site_managers)
    return stats


def _detect_anomalies(reports: list[dict[str, Any]], stats: dict[str, Any]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    total_reports = max(int(stats.get("totalReports") or 0), 1)
    avg_hours = _as_float(stats.get("totals", {}).get("workHours")) / total_reports

    high_hours: list[str] = []
    low_hours: list[str] = []
    missing_data: list[str] = []
    duplicate_suspects: list[str] = []
    date_work_combos: dict[str, list[Any]] = {}

    for report in reports:
        report_hours = 0.0
        for group in report.get("workGroups") or []:
            for item in (group or {}).get("items") or []:
                report_hours += _as_float((item or {}).get("hours"))

        date_str = _safe_date_str(report.get("date"))
        work_name = str(report.get("workName") or "").strip() or "Obra sin nombre"

        if avg_hours > 0 and report_hours > avg_hours * 3:
            high_hours.append(f"{date_str} - {work_name} ({report_hours:.1f}h)")
        if avg_hours > 0 and report_hours > 0 and report_hours < avg_hours * 0.2:
            low_hours.append(f"{date_str} - {work_name} ({report_hours:.1f}h)")

        has_work = bool(report.get("workGroups"))
        has_machinery = bool(report.get("machineryGroups"))
        has_materials = bool(report.get("materialGroups"))
        if not has_work and not has_machinery and not has_materials:
            missing_data.append(f"{date_str} - {work_name}")

        combo_key = f"{date_str}_{report.get('workNumber')}"
        date_work_combos.setdefault(combo_key, []).append(report.get("id"))

    for combo, ids in date_work_combos.items():
        if len(ids) > 1:
            duplicate_suspects.append(combo.replace("_", " - Obra "))

    if high_hours:
        anomalies.append(
            {
                "type": "warning",
                "title": "Partes con horas inusualmente altas",
                "description": (
                    f"Se detectaron {len(high_hours)} partes por encima del promedio ({avg_hours:.1f}h)."
                ),
                "affectedItems": high_hours[:10],
            }
        )
    if low_hours:
        anomalies.append(
            {
                "type": "info",
                "title": "Partes con pocas horas registradas",
                "description": f"Se detectaron {len(low_hours)} partes con horas muy bajas.",
                "affectedItems": low_hours[:10],
            }
        )
    if missing_data:
        anomalies.append(
            {
                "type": "error",
                "title": "Partes sin datos de trabajo",
                "description": f"Se encontraron {len(missing_data)} partes sin mano de obra, maquinaria ni materiales.",
                "affectedItems": missing_data[:10],
            }
        )
    if duplicate_suspects:
        anomalies.append(
            {
                "type": "warning",
                "title": "Posibles partes duplicados",
                "description": f"Se detectaron {len(duplicate_suspects)} combinaciones fecha/obra duplicadas.",
                "affectedItems": duplicate_suspects[:10],
            }
        )

    threshold = datetime.utcnow() - timedelta(days=30)
    last_by_work: dict[str, str] = {}
    for report in reports:
        work_key = f"{report.get('workNumber', '')} - {report.get('workName', '')}".strip(" -")
        if not work_key:
            continue
        date_str = _safe_date_str(report.get("date"))
        previous = last_by_work.get(work_key)
        if not previous or date_str > previous:
            last_by_work[work_key] = date_str

    inactive = []
    for work, date_str in last_by_work.items():
        try:
            if datetime.fromisoformat(date_str) < threshold:
                inactive.append(f"{work} (ultimo: {date_str})")
        except ValueError:
            continue
    if inactive:
        anomalies.append(
            {
                "type": "info",
                "title": "Obras sin actividad reciente",
                "description": f"{len(inactive)} obras sin partes en los ultimos 30 dias.",
                "affectedItems": inactive[:10],
            }
        )

    return anomalies


def _analysis_prompt(stats: dict[str, Any], anomalies: list[dict[str, Any]], period_description: str) -> str:
    works = stats.get("byWork", {})
    by_company = stats.get("byCompany", {})
    by_supplier = stats.get("bySupplier", {})
    by_day = stats.get("byDayOfWeek", {})

    works_lines = "\n".join(
        f"- {work}: {data.get('reportCount', 0)} partes, {data.get('workHours', 0):.1f}h, {data.get('materialCost', 0):.2f} EUR"
        for work, data in works.items()
    )
    top_companies = sorted(
        by_company.items(),
        key=lambda item: _as_float(item[1].get("workHours")) + _as_float(item[1].get("machineryHours")),
        reverse=True,
    )[:10]
    company_lines = "\n".join(
        f"- {name}: {(_as_float(data.get('workHours')) + _as_float(data.get('machineryHours'))):.1f}h"
        for name, data in top_companies
    )
    top_suppliers = sorted(
        by_supplier.items(),
        key=lambda item: _as_float(item[1].get("materialCost")),
        reverse=True,
    )[:5]
    supplier_lines = "\n".join(
        f"- {name}: {_as_float(data.get('materialCost')):.2f} EUR ({int(_as_float(data.get('itemCount')))} items)"
        for name, data in top_suppliers
    )
    day_lines = "\n".join(f"- {day}: {count} partes" for day, count in by_day.items())
    anomaly_lines = (
        "No se detectaron anomalias significativas."
        if not anomalies
        else "\n".join(
            f"- {entry.get('title')}: {entry.get('description')}"
            for entry in anomalies
        )
    )

    totals = stats.get("totals", {})
    return (
        "Eres un experto en gestion de obras de construccion.\n"
        "Genera un informe ejecutivo en espanol con datos concretos y recomendaciones accionables.\n\n"
        f"Periodo: {period_description}\n"
        f"Total partes: {stats.get('totalReports', 0)}\n"
        f"Completados: {stats.get('completedReports', 0)}\n"
        f"Aprobados: {stats.get('approvedReports', 0)}\n"
        f"Rango fechas: {stats.get('dateRange', {}).get('earliest', '')} a {stats.get('dateRange', {}).get('latest', '')}\n\n"
        "Totales:\n"
        f"- Horas mano de obra: {_as_float(totals.get('workHours')):.1f}\n"
        f"- Horas maquinaria: {_as_float(totals.get('machineryHours')):.1f}\n"
        f"- Coste materiales: {_as_float(totals.get('materialCost')):.2f} EUR\n"
        f"- Coste subcontratas: {_as_float(totals.get('subcontractCost')):.2f} EUR\n"
        f"- Horas encargados: {_as_float(totals.get('foremanHours')):.1f}\n\n"
        "Desglose por obra:\n"
        f"{works_lines or '- Sin datos'}\n\n"
        "Top empresas por horas:\n"
        f"{company_lines or '- Sin datos'}\n\n"
        "Top proveedores de materiales:\n"
        f"{supplier_lines or '- Sin datos'}\n\n"
        "Distribucion por dia:\n"
        f"{day_lines or '- Sin datos'}\n\n"
        "Anomalias:\n"
        f"{anomaly_lines}\n\n"
        "Estructura obligatoria:\n"
        "1) Resumen ejecutivo\n"
        "2) Analisis de productividad\n"
        "3) Analisis economico\n"
        "4) Analisis de recursos humanos\n"
        "5) Problemas detectados\n"
        "6) Conclusiones\n"
        "7) Recomendaciones\n"
    )


def _chart_data(stats: dict[str, Any]) -> dict[str, Any]:
    by_month = stats.get("byMonth", {})
    by_company = stats.get("byCompany", {})
    by_work = stats.get("byWork", {})

    monthly_trends = [
        {
            "month": month,
            "workHours": _as_float(data.get("workHours")),
            "machineryHours": _as_float(data.get("machineryHours")),
            "materialCost": _as_float(data.get("materialCost")),
            "subcontractCost": _as_float(data.get("subcontractCost")),
            "reports": int(_as_float(data.get("reports"))),
        }
        for month, data in sorted(by_month.items(), key=lambda item: item[0])
    ]
    cost_distribution = [
        {"name": "Mano de Obra", "value": _as_float(stats.get("totals", {}).get("workHours")) * 25.0, "color": "#6E8F56"},
        {"name": "Maquinaria", "value": _as_float(stats.get("totals", {}).get("machineryHours")) * 50.0, "color": "#4A7C59"},
        {"name": "Materiales", "value": _as_float(stats.get("totals", {}).get("materialCost")), "color": "#8B4513"},
        {"name": "Subcontratas", "value": _as_float(stats.get("totals", {}).get("subcontractCost")), "color": "#2F4F4F"},
    ]
    top_companies = [
        {
            "company": company,
            "workHours": _as_float(data.get("workHours")),
            "machineryHours": _as_float(data.get("machineryHours")),
            "total": _as_float(data.get("workHours")) + _as_float(data.get("machineryHours")),
        }
        for company, data in sorted(
            by_company.items(),
            key=lambda item: _as_float(item[1].get("workHours")) + _as_float(item[1].get("machineryHours")),
            reverse=True,
        )[:10]
    ]
    top_works = [
        {
            "work": work,
            "reports": int(_as_float(data.get("reportCount"))),
            "workHours": _as_float(data.get("workHours")),
            "materialCost": _as_float(data.get("materialCost")),
        }
        for work, data in sorted(
            by_work.items(),
            key=lambda item: _as_float(item[1].get("reportCount")),
            reverse=True,
        )[:10]
    ]
    day_distribution = [
        {"day": day, "count": int(_as_float(count))}
        for day, count in stats.get("byDayOfWeek", {}).items()
    ]
    return {
        "monthlyTrends": monthly_trends,
        "costDistribution": cost_distribution,
        "topCompanies": top_companies,
        "topWorks": top_works,
        "dayDistribution": day_distribution,
    }


def _normalize_hex(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip().upper()
    if not _HEX_RE.fullmatch(text):
        return None
    if text in {"#000000", "#FFFFFF"}:
        return None
    return text


def _extract_hex_colors(text: str) -> list[dict[str, str]]:
    found = re.findall(r"#[0-9A-Fa-f]{6}", text or "")
    unique = []
    seen = set()
    for hex_value in found:
        normalized = _normalize_hex(hex_value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append({"hex": normalized, "name": "Brand Color"})
    return unique[:5]


def _tenant_scope(current_user: User, x_tenant_id: int | None) -> int:
    if current_user.is_super_admin:
        tenant_id = x_tenant_id or current_user.tenant_id
    else:
        tenant_id = current_user.tenant_id
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido para esta operacion.",
        )
    return int(tenant_id)


def _normalize_company_name(name: str) -> str:
    cleaned = (name or "").lower().strip()
    if not cleaned:
        return ""
    cleaned = re.sub(
        r",?\s*(s\.?l\.?u?\.?|s\.?a\.?|sociedad limitada|sociedad anonima)\.?\s*$",
        "",
        cleaned,
    )
    cleaned = _CLEAN_WS_RE.sub(" ", cleaned)
    cleaned = re.sub(r"[^a-z0-9\sáéíóúñü]", "", cleaned)
    return cleaned.strip()


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _has_different_suffix(name_a: str, name_b: str) -> bool:
    words_a = [w for w in name_a.lower().split() if len(w) > 2]
    words_b = [w for w in name_b.lower().split() if len(w) > 2]
    if len(words_a) < 2 or len(words_b) < 2:
        return False

    common = 0
    for idx in range(min(len(words_a), len(words_b))):
        if words_a[idx] == words_b[idx]:
            common += 1
        else:
            break

    if common >= 1 and common < max(len(words_a), len(words_b)):
        suffix_a = " ".join(words_a[common:])
        suffix_b = " ".join(words_b[common:])
        if suffix_a and suffix_b and suffix_a != suffix_b:
            return _similarity(suffix_a, suffix_b) < 0.7
    return False


def _payload_groups(payload: dict[str, Any], camel_key: str, snake_key: str) -> list[dict[str, Any]]:
    raw = payload.get(camel_key)
    if raw is None:
        raw = payload.get(snake_key)
    return raw if isinstance(raw, list) else []


def _collect_companies_from_payload(payload: dict[str, Any], collector: dict[str, dict[str, Any]]) -> None:
    def add(name: Any, source: str) -> None:
        text = str(name or "").strip()
        if not text:
            return
        entry = collector.setdefault(text, {"sources": set(), "count": 0})
        entry["sources"].add(source)
        entry["count"] += 1

    for group in _payload_groups(payload, "subcontractGroups", "subcontract_groups"):
        add((group or {}).get("company"), "subcontrata")
    for group in _payload_groups(payload, "materialGroups", "material_groups"):
        add((group or {}).get("supplier"), "proveedor_material")
    for group in _payload_groups(payload, "machineryGroups", "machinery_groups"):
        add((group or {}).get("company"), "maquinaria")
    for group in _payload_groups(payload, "workGroups", "work_groups"):
        add((group or {}).get("company"), "mano_obra")


def _group_similar_companies(
    companies: list[dict[str, Any]],
    threshold: float,
) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    used: set[str] = set()
    ordered = sorted(companies, key=lambda item: item.get("count", 0), reverse=True)

    for company in ordered:
        name = company["name"]
        if name in used:
            continue

        group = {
            "canonicalName": name,
            "variations": [company],
            "totalCount": int(company.get("count") or 0),
        }
        used.add(name)

        for other in ordered:
            other_name = other["name"]
            if other_name in used:
                continue
            if _has_different_suffix(name, other_name):
                continue
            if _similarity(company["normalizedName"], other["normalizedName"]) >= threshold:
                group["variations"].append(other)
                group["totalCount"] += int(other.get("count") or 0)
                used.add(other_name)

        if len(group["variations"]) > 1:
            groups.append(group)

    groups.sort(key=lambda item: item.get("totalCount", 0), reverse=True)
    return groups


def _replace_company_in_groups(
    groups: list[dict[str, Any]],
    field_name: str,
    old_name: str,
    new_name: str,
) -> tuple[list[dict[str, Any]], bool]:
    changed = False
    result: list[dict[str, Any]] = []
    for group in groups:
        current = dict(group or {})
        if str(current.get(field_name) or "") == old_name:
            current[field_name] = new_name
            changed = True
        result.append(current)
    return result, changed


def _replace_company_in_payload(payload: dict[str, Any], old_name: str, new_name: str) -> tuple[dict[str, Any], bool]:
    changed = False
    updated = dict(payload)

    for camel_key, snake_key, field in (
        ("subcontractGroups", "subcontract_groups", "company"),
        ("materialGroups", "material_groups", "supplier"),
        ("machineryGroups", "machinery_groups", "company"),
        ("workGroups", "work_groups", "company"),
    ):
        groups = _payload_groups(updated, camel_key, snake_key)
        if not groups:
            continue
        next_groups, local_changed = _replace_company_in_groups(groups, field, old_name, new_name)
        if local_changed:
            updated[camel_key] = next_groups
            updated[snake_key] = next_groups
            changed = True

    return updated, changed


def _normalize_unit(unit: Any) -> str:
    raw = str(unit or "").strip().lower().replace(" ", "").replace(".", "")
    if not raw:
        return "ud"
    if raw in {"tn", "ton", "tons", "toneladas", "tonelada"}:
        return "t"
    if raw in {"m3", "mc", "metroscubicos", "metrocubico"}:
        return "m3"
    if raw in {"lt", "lts", "litro", "litros"}:
        return "l"
    if raw in {"u", "unidad", "unidades", "uds"}:
        return "ud"
    if raw in {"kgs", "kilogramo", "kilogramos", "kilos"}:
        return "kg"
    if raw in {"metro", "metros", "mts"}:
        return "m"
    return raw


def _is_immediate_consumption_material(name: str) -> bool:
    low_name = (name or "").lower()
    keywords = [
        "hormigon",
        "hormigón",
        "concrete",
        "asfalto",
        "aglomerado",
        "mezcla bituminosa",
        "arido",
        "árido",
        "grava",
        "gravilla",
        "arena",
        "zahorra",
        "todo-uno",
        "mortero preparado",
        "relleno fluido",
        "reciclado",
        "rechazo de cantera",
    ]
    return any(keyword in low_name for keyword in keywords)


def _service_keywords() -> list[str]:
    return [
        "alquiler",
        "servicio",
        "servicios",
        "mano de obra",
        "manodeobra",
        "operario",
        "operarios",
        "transporte",
        "portes",
        "grua",
        "grúa",
        "plataforma",
        "excavacion",
        "excavación",
        "retirada",
        "montaje",
        "desmontaje",
    ]


def _looks_like_service_item(name: str) -> bool:
    low_name = (name or "").lower()
    return any(keyword in low_name for keyword in _service_keywords())


def _item_type_from_name(name: str) -> str:
    low = (name or "").lower()
    tool_keywords = [
        "taladro",
        "amoladora",
        "radial",
        "martillo",
        "destornillador",
        "llave",
        "alicate",
        "nivel",
        "flexometro",
        "flexómetro",
        "sierra",
        "lijadora",
        "carretilla",
        "escalera",
    ]
    if any(keyword in low for keyword in tool_keywords):
        return "herramienta"
    return "material"


def _normalize_supplier_name(name: str) -> str:
    text = (name or "").lower()
    text = _CLEAN_WS_RE.sub("", text)
    translation = str.maketrans("áàäâéèëêíìïîóòöôúùüûñ", "aaaaeeeeiiiioooouuuun")
    text = text.translate(translation)
    return re.sub(r"[^a-z0-9]", "", text)


def _report_payload_for_work(report: WorkReport, work_id: str) -> dict[str, Any] | None:
    payload = dict(report.payload or {})
    report_work_id = str(payload.get("workId") or payload.get("work_id") or "").strip()
    if report_work_id and report_work_id != work_id:
        return None
    if not report_work_id:
        # Compatibilidad con payloads antiguos: si no traen workId, tratamos el reporte como candidato.
        return payload
    return payload


def _iter_material_groups(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return _payload_groups(payload, "materialGroups", "material_groups")


def _extract_supplier_duplicates(
    suppliers: list[str],
) -> list[dict[str, Any]]:
    supplier_map: dict[str, list[str]] = {}
    for supplier in suppliers:
        normalized = _normalize_supplier_name(supplier)
        if not normalized:
            continue
        supplier_map.setdefault(normalized, []).append(supplier)

    duplicates: list[dict[str, Any]] = []
    for normalized, variants in supplier_map.items():
        unique_variants = sorted(set(variants))
        if len(unique_variants) > 1:
            duplicates.append(
                {
                    "suppliers": unique_variants,
                    "item_count": len(variants),
                    "reason": f"Se detectaron {len(unique_variants)} variantes del mismo proveedor",
                    "normalized_name": normalized,
                }
            )

    all_norm = list(supplier_map.keys())
    processed: set[str] = set()
    for i in range(len(all_norm)):
        for j in range(i + 1, len(all_norm)):
            first = all_norm[i]
            second = all_norm[j]
            pair = "|".join(sorted([first, second]))
            if pair in processed:
                continue
            shorter, longer = (first, second) if len(first) <= len(second) else (second, first)
            if len(shorter) >= 4 and longer.startswith(shorter):
                merged = sorted(set(supplier_map.get(first, []) + supplier_map.get(second, [])))
                duplicates = [
                    entry
                    for entry in duplicates
                    if entry.get("normalized_name") not in {first, second}
                ]
                duplicates.append(
                    {
                        "suppliers": merged,
                        "item_count": len(supplier_map.get(first, [])) + len(supplier_map.get(second, [])),
                        "reason": "Proveedores similares detectados (uno es extension del otro)",
                        "normalized_name": shorter,
                    }
                )
                processed.add(pair)
    return duplicates


def _parse_analysis_results(content: str, allowed_ids: set[str]) -> list[dict[str, Any]]:
    raw_text = content.strip()
    json_block = raw_text
    match = re.search(r"\[[\s\S]*\]", raw_text)
    if match:
        json_block = match.group(0)
    parsed = json.loads(json_block)
    if not isinstance(parsed, list):
        raise ValueError("Formato de respuesta de IA invalido")

    valid: list[dict[str, Any]] = []
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
    for item in parsed:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("item_id") or "").strip()
        if item_id not in allowed_ids:
            continue
        if not uuid_re.fullmatch(item_id):
            continue
        action = str(item.get("action") or "").strip().lower()
        if action not in {"delete", "update", "keep"}:
            continue
        normalized = {
            "item_id": item_id,
            "original_name": str(item.get("original_name") or ""),
            "action": action,
            "reason": str(item.get("reason") or ""),
        }
        suggested = item.get("suggested_changes")
        if isinstance(suggested, dict):
            clean_suggested = {
                key: value
                for key, value in suggested.items()
                if key in {"item_type", "category", "unit", "name"}
            }
            if clean_suggested:
                normalized["suggested_changes"] = clean_suggested
        valid.append(normalized)
    return valid


def _inventory_item_to_dict(item: WorkInventoryItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "work_id": item.work_external_id,
        "item_type": item.item_type,
        "category": item.category,
        "name": item.name,
        "quantity": item.quantity,
        "unit": item.unit,
        "last_entry_date": item.last_entry_date,
        "last_supplier": item.last_supplier,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "product_code": item.product_code,
        "unit_price": item.unit_price,
        "total_price": item.total_price,
        "delivery_note_number": item.delivery_note_number,
        "batch_number": item.batch_number,
        "brand": item.brand,
        "model": item.model,
        "condition": None,
        "location": None,
        "exit_date": None,
        "delivery_note_image": None,
        "observations": None,
    }

@router.post("/generate-summary-report")
async def generate_summary_report(
    payload: GenerateSummaryReportRequest,
    _: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    if not payload.workReports:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workReports array is required",
        )

    reports = [_normalize_report(raw) for raw in payload.workReports]
    stats = _calculate_statistics(reports)
    anomalies = _detect_anomalies(reports, stats)
    period_description = (
        str((payload.filters or {}).get("period") or "").strip()
        or f"{stats['dateRange']['earliest']} al {stats['dateRange']['latest']}"
    )

    prompt = _analysis_prompt(stats, anomalies, period_description)
    ai_response = await _lovable_chat(
        {
            "model": "google/gemini-3-flash-preview",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Eres un analista de gestion de obras. "
                        "Responde en espanol profesional con recomendaciones accionables."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 4000,
        },
        timeout=90,
    )
    ai_analysis = (
        ((ai_response.get("choices") or [{}])[0].get("message") or {}).get("content")
        or ""
    )

    return {
        "success": True,
        "statistics": stats,
        "anomalies": anomalies,
        "aiAnalysis": ai_analysis,
        "chartData": _chart_data(stats),
        "periodDescription": period_description,
    }


@router.post("/analyze-work-image")
async def analyze_work_image(
    payload: AnalyzeWorkImageRequest,
    _: User = Depends(get_current_active_user),
) -> dict[str, str]:
    image_base64 = (payload.imageBase64 or "").strip()
    if not image_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is required",
        )

    ai_response = await _lovable_chat(
        {
            "model": "google/gemini-2.5-flash",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Eres un asistente experto en construccion. "
                        "Analiza imagenes de obra en maximo 10 lineas cortas."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Analiza esta imagen de obra en maximo 10 lineas: "
                                "actividad principal, materiales clave, maquinaria y avance."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": image_base64}},
                    ],
                },
            ],
            "max_tokens": 300,
            "temperature": 0.5,
        }
    )
    description = (
        ((ai_response.get("choices") or [{}])[0].get("message") or {}).get("content")
        or "No se pudo generar una descripcion"
    )
    return {"description": description}


@router.post("/analyze-logo-colors")
async def analyze_logo_colors(
    payload: AnalyzeLogoColorsRequest,
    _: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    image_data_url = (payload.imageDataUrl or "").strip()
    if not image_data_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="imageDataUrl is required",
        )

    try:
        ai_response = await _lovable_chat(
            {
                "model": "google/gemini-2.5-flash",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Analyze this company logo and extract 3-5 dominant brand colors. "
                                    "Return hex codes suitable for UI, sorted by prominence."
                                ),
                            },
                            {"type": "image_url", "image_url": {"url": image_data_url}},
                        ],
                    }
                ],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "extract_brand_colors",
                            "description": "Extract the main brand colors from a company logo",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "colors": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "hex": {"type": "string"},
                                                "name": {"type": "string"},
                                            },
                                            "required": ["hex", "name"],
                                            "additionalProperties": False,
                                        },
                                        "minItems": 3,
                                        "maxItems": 5,
                                    }
                                },
                                "required": ["colors"],
                                "additionalProperties": False,
                            },
                        },
                    }
                ],
                "tool_choice": {"type": "function", "function": {"name": "extract_brand_colors"}},
                "temperature": 0.3,
            }
        )
    except HTTPException:
        return {
            "colors": [_DEFAULT_BRAND_COLOR],
            "brandColor": _DEFAULT_BRAND_COLOR["hex"],
        }

    message = ((ai_response.get("choices") or [{}])[0].get("message") or {})
    tool_calls = message.get("tool_calls") or []
    extracted: list[dict[str, str]] = []

    if tool_calls:
        arguments = ((tool_calls[0] or {}).get("function") or {}).get("arguments")
        if isinstance(arguments, str):
            try:
                parsed = json.loads(arguments)
                for item in parsed.get("colors", []) if isinstance(parsed, dict) else []:
                    hex_color = _normalize_hex(str((item or {}).get("hex") or ""))
                    if not hex_color:
                        continue
                    name = str((item or {}).get("name") or "Brand Color").strip() or "Brand Color"
                    extracted.append({"hex": hex_color, "name": name})
            except json.JSONDecodeError:
                extracted = []

    if not extracted:
        fallback_text = str(message.get("content") or "")
        extracted = _extract_hex_colors(fallback_text)

    if not extracted:
        extracted = [_DEFAULT_BRAND_COLOR]

    unique: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in extracted:
        hex_color = _normalize_hex(item.get("hex"))
        if not hex_color or hex_color in seen:
            continue
        seen.add(hex_color)
        unique.append({"hex": hex_color, "name": item.get("name") or "Brand Color"})
        if len(unique) == 5:
            break

    if not unique:
        unique = [_DEFAULT_BRAND_COLOR]

    return {
        "colors": unique,
        "brandColor": unique[0]["hex"],
    }


@router.post("/standardize-companies")
def standardize_companies(
    payload: StandardizeCompaniesRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    if payload.action == "analyze":
        threshold = max(0.1, min(float(payload.threshold or 0.7), 1.0))
        company_map: dict[str, dict[str, Any]] = {}

        reports = session.exec(
            select(WorkReport).where(
                WorkReport.tenant_id == tenant_id,
                WorkReport.deleted_at.is_(None),
            )
        ).all()
        for report in reports:
            report_payload = dict(report.payload or {})
            _collect_companies_from_payload(report_payload, company_map)

        rental_rows = session.exec(
            select(RentalMachinery).where(
                RentalMachinery.tenant_id == tenant_id,
                RentalMachinery.deleted_at.is_(None),
            )
        ).all()
        for row in rental_rows:
            provider = (row.provider or "").strip()
            if not provider:
                continue
            entry = company_map.setdefault(provider, {"sources": set(), "count": 0})
            entry["sources"].add("alquiler")
            entry["count"] += 1

        external_rows = session.exec(
            select(ExternalCollaboration).where(
                ExternalCollaboration.tenant_id == tenant_id
            )
        ).all()
        for row in external_rows:
            for value, source in (
                (row.name, "colaboracion_nombre"),
                (row.legal_name, "colaboracion_legal"),
            ):
                text = (value or "").strip()
                if not text:
                    continue
                entry = company_map.setdefault(text, {"sources": set(), "count": 0})
                entry["sources"].add(source)
                entry["count"] += 1

        companies = [
            {
                "name": name,
                "sources": sorted(list(meta["sources"])),
                "count": int(meta["count"]),
                "normalizedName": _normalize_company_name(name),
            }
            for name, meta in company_map.items()
        ]
        groups = _group_similar_companies(companies, threshold)
        return {
            "success": True,
            "totalCompanies": len(companies),
            "duplicateGroups": len(groups),
            "groups": groups,
        }

    if payload.action == "apply":
        if not payload.updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No updates provided",
            )

        total_updated = 0
        reports = session.exec(
            select(WorkReport).where(
                WorkReport.tenant_id == tenant_id,
                WorkReport.deleted_at.is_(None),
            )
        ).all()
        rentals = session.exec(
            select(RentalMachinery).where(
                RentalMachinery.tenant_id == tenant_id,
                RentalMachinery.deleted_at.is_(None),
            )
        ).all()
        externals = session.exec(
            select(ExternalCollaboration).where(
                ExternalCollaboration.tenant_id == tenant_id
            )
        ).all()

        for update in payload.updates:
            old_name = (update.oldName or "").strip()
            new_name = (update.newName or "").strip()
            if not old_name or not new_name or old_name == new_name:
                continue

            for report in reports:
                next_payload, changed = _replace_company_in_payload(
                    dict(report.payload or {}),
                    old_name,
                    new_name,
                )
                if changed:
                    report.payload = next_payload
                    session.add(report)
                    total_updated += 1

            for row in rentals:
                if (row.provider or "").strip() == old_name:
                    row.provider = new_name
                    session.add(row)
                    total_updated += 1

            for row in externals:
                changed = False
                if (row.name or "").strip() == old_name:
                    row.name = new_name
                    changed = True
                if (row.legal_name or "").strip() == old_name:
                    row.legal_name = new_name
                    changed = True
                if changed:
                    session.add(row)
                    total_updated += 1

        session.commit()
        return {
            "success": True,
            "message": f"Se actualizaron {total_updated} registros",
            "updatedCount": total_updated,
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail='Invalid action. Use "analyze" or "apply".',
    )


@router.post("/populate-inventory-from-reports")
def populate_inventory_from_reports(
    payload: PopulateInventoryRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id is required",
        )
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    all_reports = session.exec(
        select(WorkReport).where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.deleted_at.is_(None),
            WorkReport.status == "completed",
        )
    ).all()

    reports: list[tuple[WorkReport, dict[str, Any]]] = []
    for report in all_reports:
        report_payload = _report_payload_for_work(report, work_id)
        if report_payload is None:
            continue
        reports.append((report, report_payload))

    if not reports:
        return {
            "message": "No completed reports found for this work",
            "itemsProcessed": 0,
            "reportsAnalyzed": 0,
            "newReports": 0,
            "itemsInserted": 0,
            "itemsUpdated": 0,
            "immediateConsumptionItems": 0,
            "errors": 0,
            "alreadySynced": 0,
        }

    synced_ids: set[int] = set()
    if not payload.force:
        synced_rows = session.exec(
            select(WorkInventorySyncLog).where(
                WorkInventorySyncLog.tenant_id == tenant_id,
                WorkInventorySyncLog.work_external_id == work_id,
            )
        ).all()
        synced_ids = {row.work_report_id for row in synced_rows}

    reports_to_sync = reports if payload.force else [entry for entry in reports if entry[0].id not in synced_ids]
    if not reports_to_sync:
        return {
            "message": "No new reports to sync. All reports already processed.",
            "itemsProcessed": 0,
            "reportsAnalyzed": len(reports),
            "newReports": 0,
            "itemsInserted": 0,
            "itemsUpdated": 0,
            "immediateConsumptionItems": 0,
            "errors": 0,
            "alreadySynced": len(reports),
        }

    inserted = 0
    updated = 0
    immediate_consumption = 0
    errors = 0
    processed_items = 0

    for report, report_payload in reports_to_sync:
        date_str = _safe_date_str(report.date)
        for group in _iter_material_groups(report_payload):
            if not isinstance(group, dict):
                continue
            supplier = str(group.get("supplier") or group.get("provider") or "Sin proveedor").strip()
            delivery_note = str(
                group.get("invoiceNumber")
                or group.get("deliveryNoteNumber")
                or group.get("delivery_note_number")
                or ""
            ).strip()
            if not delivery_note:
                continue

            raw_items = group.get("items") if isinstance(group.get("items"), list) else []
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or item.get("material") or "").strip()
                if not name or _looks_like_service_item(name):
                    continue

                quantity = _as_float(item.get("quantity"))
                unit = _normalize_unit(item.get("unit") or "ud")
                unit_price = _as_float(item.get("unitPrice")) if item.get("unitPrice") is not None else None
                total_price = None
                if unit_price is not None and quantity:
                    total_price = unit_price * quantity
                immediate = _is_immediate_consumption_material(name)
                item_type = _item_type_from_name(name)

                existing = session.exec(
                    select(WorkInventoryItem).where(
                        WorkInventoryItem.tenant_id == tenant_id,
                        WorkInventoryItem.work_external_id == work_id,
                        WorkInventoryItem.name == name,
                        WorkInventoryItem.item_type == item_type,
                        WorkInventoryItem.unit == unit,
                    )
                ).first()

                try:
                    if existing:
                        existing.quantity = 0 if immediate else _as_float(existing.quantity) + quantity
                        existing.last_entry_date = date_str
                        existing.last_supplier = existing.last_supplier or supplier
                        existing.delivery_note_number = existing.delivery_note_number or delivery_note
                        existing.product_code = existing.product_code or str(item.get("product_code") or "").strip() or None
                        existing.unit_price = existing.unit_price or unit_price
                        existing.total_price = total_price or existing.total_price
                        existing.batch_number = existing.batch_number or str(item.get("batch_number") or "").strip() or None
                        existing.brand = existing.brand or str(item.get("brand") or "").strip() or None
                        existing.model = existing.model or str(item.get("model") or "").strip() or None
                        existing.is_immediate_consumption = immediate
                        existing.updated_at = datetime.utcnow()
                        session.add(existing)
                        inventory_item = existing
                        updated += 1
                    else:
                        inventory_item = WorkInventoryItem(
                            tenant_id=tenant_id,
                            work_external_id=work_id,
                            name=name,
                            item_type=item_type,
                            category=supplier or "Materiales",
                            quantity=0 if immediate else quantity,
                            unit=unit,
                            last_entry_date=date_str,
                            last_supplier=supplier or None,
                            delivery_note_number=delivery_note or None,
                            product_code=str(item.get("product_code") or "").strip() or None,
                            unit_price=unit_price,
                            total_price=total_price,
                            batch_number=str(item.get("batch_number") or "").strip() or None,
                            brand=str(item.get("brand") or "").strip() or None,
                            model=str(item.get("model") or "").strip() or None,
                            is_immediate_consumption=immediate,
                            source="ai",
                        )
                        session.add(inventory_item)
                        inserted += 1

                    processed_items += 1
                    session.flush()
                    movement = InventoryMovement(
                        tenant_id=tenant_id,
                        work_external_id=work_id,
                        inventory_item_id=inventory_item.id,
                        movement_type="entry",
                        quantity=quantity,
                        unit=unit,
                        unit_price=unit_price,
                        total_price=total_price,
                        supplier=supplier or None,
                        delivery_note_number=delivery_note or None,
                        source="ai",
                        is_immediate_consumption=immediate,
                    )
                    session.add(movement)

                    if immediate and quantity > 0:
                        session.add(
                            InventoryMovement(
                                tenant_id=tenant_id,
                                work_external_id=work_id,
                                inventory_item_id=inventory_item.id,
                                movement_type="exit",
                                quantity=quantity,
                                unit=unit,
                                unit_price=unit_price,
                                total_price=total_price,
                                supplier=supplier or None,
                                delivery_note_number=delivery_note or None,
                                source="auto_consumption",
                                notes="Consumo directo en obra (Just-in-Time)",
                                is_immediate_consumption=True,
                            )
                        )
                        immediate_consumption += 1
                except Exception:
                    errors += 1

    if not payload.force:
        for report, _ in reports_to_sync:
            if report.id is None:
                continue
            session.add(
                WorkInventorySyncLog(
                    tenant_id=tenant_id,
                    work_external_id=work_id,
                    work_report_id=report.id,
                )
            )

    session.commit()

    return {
        "message": (
            f"Inventario actualizado. {inserted} nuevos, {updated} actualizados, "
            f"{immediate_consumption} consumo directo."
        ),
        "itemsInserted": inserted,
        "itemsUpdated": updated,
        "immediateConsumptionItems": immediate_consumption,
        "errors": errors,
        "reportsAnalyzed": len(reports),
        "newReports": len(reports_to_sync),
        "alreadySynced": max(len(reports) - len(reports_to_sync), 0),
        "itemsProcessed": processed_items,
    }


@router.post("/clean-inventory")
def clean_inventory(
    payload: CleanInventoryRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id is required",
        )
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    items = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).all()

    service_companies = [
        "hune rental",
        "ramon valiente",
        "zenda s coop",
        "zenda",
        "hondo excabaciones",
        "rafha gruas",
        "gruas torre",
    ]
    to_delete: list[WorkInventoryItem] = []
    for item in items:
        should_delete = False
        if not (item.delivery_note_number or "").strip():
            should_delete = True
        name_lower = (item.name or "").lower()
        if any(keyword in name_lower for keyword in _service_keywords()):
            should_delete = True
        supplier_lower = (item.last_supplier or "").lower()
        if any(company in supplier_lower for company in service_companies):
            should_delete = True
        category_lower = (item.category or "").lower()
        if "maquinaria" in category_lower and not (item.delivery_note_number or "").strip():
            should_delete = True
        if should_delete:
            to_delete.append(item)

    deleted_count = 0
    for item in to_delete:
        session.delete(item)
        deleted_count += 1

    session.commit()
    return {
        "success": True,
        "message": f"Limpieza completada: {deleted_count} items eliminados",
        "deletedCount": deleted_count,
        "totalScanned": len(items),
        "remaining": max(len(items) - deleted_count, 0),
    }


@router.post("/analyze-inventory")
async def analyze_inventory(
    payload: AnalyzeInventoryRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id is required",
        )
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    reports = session.exec(
        select(WorkReport).where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.deleted_at.is_(None),
        )
    ).all()

    suppliers: list[str] = []
    for report in reports:
        report_payload = _report_payload_for_work(report, work_id)
        if report_payload is None:
            continue
        for group in _iter_material_groups(report_payload):
            if not isinstance(group, dict):
                continue
            supplier = str(group.get("supplier") or "").strip()
            if supplier:
                suppliers.append(supplier)

    inventory_items = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).all()
    if not inventory_items:
        duplicates = _extract_supplier_duplicates(suppliers)
        return {
            "success": True,
            "message": "No hay items en el inventario para analizar",
            "results": [],
            "duplicate_suppliers": duplicates,
            "total_analyzed": 0,
        }

    limited_items = inventory_items[:50]
    suppliers.extend([item.last_supplier or "" for item in limited_items if item.last_supplier])
    duplicates = _extract_supplier_duplicates(suppliers)

    item_lines = "\n".join(
        f"ID:{item.id}|Nombre:{item.name}|Tipo:{item.item_type}|Categoria:{item.category or 'sin categoria'}|Unidad:{item.unit or 'sin unidad'}|Marca:{item.brand or 'N/A'}|Modelo:{item.model or 'N/A'}"
        for item in limited_items
    )

    system_prompt = (
        "Eres un experto en construccion y gestion de inventarios de obra. "
        "Debes clasificar cada item como delete/update/keep. "
        "Responde solo un array JSON valido con campos: item_id, original_name, action, reason, suggested_changes."
    )
    user_prompt = (
        f"Analiza estos {len(limited_items)} items del inventario y propone correcciones.\n"
        "Usa exactamente los IDs recibidos.\n"
        f"Items:\n{item_lines}\n"
        "Responde SOLO con JSON array."
    )

    ai_response = await _lovable_chat(
        {
            "model": "google/gemini-2.5-pro",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
        },
        timeout=90,
    )
    content = str(((ai_response.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se recibio respuesta valida de IA para inventario.",
        )

    allowed_ids = {item.id for item in limited_items}
    try:
        results = _parse_analysis_results(content, allowed_ids)
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al procesar respuesta de IA. Formato JSON invalido.",
        )

    return {
        "success": True,
        "results": results,
        "duplicate_suppliers": duplicates,
        "total_analyzed": len(limited_items),
    }


@router.get("/inventory-items")
def list_inventory_items(
    work_id: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> list[dict[str, Any]]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    items = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).all()
    items_sorted = sorted(items, key=lambda item: (item.name or "").lower())
    return [_inventory_item_to_dict(item) for item in items_sorted]


@router.patch("/inventory-items/{item_id}")
def update_inventory_item(
    item_id: str,
    payload: InventoryUpdateRequest,
    work_id: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    item = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.id == item_id,
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de inventario no encontrado.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "unit" and isinstance(value, str):
            setattr(item, key, value.lower().strip())
        else:
            setattr(item, key, value)

    if ("quantity" in update_data or "unit_price" in update_data) and ("total_price" not in update_data):
        if item.unit_price is not None:
            item.total_price = _as_float(item.quantity) * _as_float(item.unit_price)
        else:
            item.total_price = None
    item.updated_at = datetime.utcnow()

    session.add(item)
    session.commit()
    session.refresh(item)
    return _inventory_item_to_dict(item)


@router.delete(
    "/inventory-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_inventory_item(
    item_id: str,
    work_id: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    item = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.id == item_id,
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de inventario no encontrado.",
        )
    session.delete(item)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/inventory/merge-suppliers")
def merge_inventory_suppliers(
    payload: MergeSuppliersRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    target_supplier = (payload.target_supplier or "").strip()
    suppliers_to_merge = [str(s).strip() for s in payload.suppliers_to_merge if str(s).strip()]
    if not work_id or not target_supplier or not suppliers_to_merge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id, target_supplier y suppliers_to_merge son obligatorios.",
        )

    tenant_id = _tenant_scope(current_user, x_tenant_id)
    inventory_updated = 0
    report_groups_updated = 0

    items = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).all()
    for item in items:
        if (item.last_supplier or "").strip() in suppliers_to_merge:
            item.last_supplier = target_supplier
            item.updated_at = datetime.utcnow()
            session.add(item)
            inventory_updated += 1

    if payload.update_report_material_groups:
        reports = session.exec(
            select(WorkReport).where(
                WorkReport.tenant_id == tenant_id,
                WorkReport.deleted_at.is_(None),
            )
        ).all()
        for report in reports:
            report_payload = _report_payload_for_work(report, work_id)
            if report_payload is None:
                continue
            groups = _iter_material_groups(report_payload)
            if not groups:
                continue
            changed = False
            next_groups: list[dict[str, Any]] = []
            for group in groups:
                if not isinstance(group, dict):
                    next_groups.append(group)
                    continue
                next_group = dict(group)
                supplier = str(next_group.get("supplier") or "").strip()
                if supplier in suppliers_to_merge:
                    next_group["supplier"] = target_supplier
                    report_groups_updated += 1
                    changed = True
                next_groups.append(next_group)
            if changed:
                report_payload["materialGroups"] = next_groups
                report_payload["material_groups"] = next_groups
                report.payload = report_payload
                session.add(report)

    session.commit()
    return {
        "success": True,
        "inventoryUpdated": inventory_updated,
        "reportGroupsUpdated": report_groups_updated,
    }


@router.post("/inventory/validate-fix")
def validate_fix_inventory(
    payload: ValidateFixInventoryRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id is required",
        )
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    items = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).all()

    unit_corrections = {
        "zahorra": "tn",
        "arena": "tn",
        "grava": "tn",
        "arido": "tn",
        "árido": "tn",
        "rechazo": "tn",
        "hormigon": "m3",
        "hormigón": "m3",
    }
    name_corrections = {
        "calefaccion": "cafetera",
        "berenjeno": "puntal",
    }
    heavy_machinery = [
        "tractor",
        "cuba",
        "trajilla",
        "excavadora",
        "retroexcavadora",
        "dumper",
        "bulldozer",
        "grua movil",
        "grúa móvil",
    ]

    fixed_count = 0
    deleted_count = 0
    to_delete: list[WorkInventoryItem] = []

    for item in items:
        name_lower = (item.name or "").lower()

        if (item.category or "").lower() == "herramienta" and any(keyword in name_lower for keyword in heavy_machinery):
            to_delete.append(item)
            deleted_count += 1
            continue

        if item.quantity is None or _as_float(item.quantity) == 0:
            to_delete.append(item)
            deleted_count += 1
            continue

        changed = False
        if (item.unit or "") == "ud":
            for keyword, unit in unit_corrections.items():
                if keyword in name_lower:
                    item.unit = unit
                    changed = True
                    break
        if (item.unit or "").upper() in {"TN", "T"}:
            item.unit = "tn"
            changed = True

        corrected_name = item.name
        for wrong, correct in name_corrections.items():
            if wrong in name_lower:
                corrected_name = re.sub(wrong, correct, corrected_name, flags=re.IGNORECASE)
                changed = True
        if corrected_name != item.name:
            item.name = corrected_name

        if (item.category or "").lower() in {"otros", "varios"} and ("rechazo" in name_lower or "residuo" in name_lower):
            item.category = "Residuos de obra"
            changed = True
        if (item.category or "").lower() == "yeso":
            item.category = "Morteros y revocos"
            changed = True
        if "zahorra" in name_lower and "ac113" in name_lower:
            item.name = "Zahorra artificial ZA-20"
            changed = True

        if changed:
            item.updated_at = datetime.utcnow()
            session.add(item)
            fixed_count += 1

    for item in to_delete:
        session.delete(item)

    session.commit()
    return {
        "success": True,
        "fixedCount": fixed_count,
        "deletedCount": deleted_count,
    }


@router.post("/inventory/apply-analysis")
def apply_inventory_analysis(
    payload: ApplyInventoryAnalysisRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    work_id = (payload.work_id or "").strip()
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id is required",
        )
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    deleted_count = 0
    updated_count = 0
    error_count = 0
    errors: list[str] = []

    for result in payload.results:
        item = session.exec(
            select(WorkInventoryItem).where(
                WorkInventoryItem.id == result.item_id,
                WorkInventoryItem.tenant_id == tenant_id,
                WorkInventoryItem.work_external_id == work_id,
            )
        ).first()
        if not item:
            error_count += 1
            errors.append(f"{result.item_id}: no encontrado")
            continue

        action = (result.action or "").strip().lower()
        try:
            if action == "delete":
                session.delete(item)
                deleted_count += 1
                continue
            if action == "update" and isinstance(result.suggested_changes, dict):
                allowed_keys = {"item_type", "category", "unit", "name"}
                for key, value in result.suggested_changes.items():
                    if key not in allowed_keys:
                        continue
                    if key == "unit" and isinstance(value, str):
                        setattr(item, key, value.lower().strip())
                    else:
                        setattr(item, key, value)
                item.updated_at = datetime.utcnow()
                session.add(item)
                updated_count += 1
        except Exception as exc:
            error_count += 1
            errors.append(f"{result.item_id}: {exc}")

    session.commit()
    return {
        "success": True,
        "deletedCount": deleted_count,
        "updatedCount": updated_count,
        "errorCount": error_count,
        "errors": errors,
    }
