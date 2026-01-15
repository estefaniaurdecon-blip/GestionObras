from pydantic import BaseModel


class DashboardSummary(BaseModel):
    """
    Datos agregados para el dashboard principal.
    """

    tenants_activos: int
    usuarios_activos: int
    herramientas_activas: int
    horas_hoy: float
    horas_ultima_semana: float
    tickets_abiertos: int
    tickets_en_progreso: int
    tickets_resueltos_hoy: int
    tickets_cerrados_ultima_semana: int

