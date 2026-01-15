from fastapi import APIRouter


router = APIRouter()


@router.get("/", summary="Health check de la API")
def health_check() -> dict:
    """
    Endpoint sencillo para que orquestadores (Docker, k8s, etc.)
    verifiquen que la API está levantada.
    """

    return {"status": "ok"}

