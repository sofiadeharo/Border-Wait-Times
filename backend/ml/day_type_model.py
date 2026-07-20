"""
OLS: efecto del tipo de dia (feriado MX/US, puente, vacaciones) sobre
wait_time_minutes. Cada dummy es 0/1 y su coeficiente es el cambio esperado
en minutos de espera frente a un dia "normal", controlando por puerto,
tipo de cruce y tipo de carril (para no comparar, p.ej., NEXUS en feriado
contra Standard en dia normal).

Lee directo de Postgres (no del CSV exportado) para que cada corrida
refleje los datos mas recientes sin un paso manual de regeneracion.

Uso manual:   python day_type_model.py
Uso agendado: scheduler.py llama a run() cada semana via APScheduler.
"""
import logging
import os
import warnings
from typing import Dict, List, Tuple

import pandas as pd
import psycopg2
from psycopg2.extras import Json
import statsmodels.formula.api as smf
from dotenv import load_dotenv

load_dotenv()

# pandas solo "prueba" conexiones SQLAlchemy; psycopg2 directo funciona pero
# dispara este warning en cada corrida.
warnings.filterwarnings("ignore", message=".*only supports SQLAlchemy.*")

logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "border_wait_times"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "password"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

DAY_TYPE_COLS = {
    "us_is_federal_holiday": "feriado_us",
    "mx_is_official_holiday": "feriado_mx",
    "mx_is_bridge_day": "puente_mx",
    "us_is_summer_vacation": "vacaciones_us",
    "mx_is_summer_vacation": "vacaciones_mx",
}

QUERY = """
    SELECT
        w.port_name,
        w.crossing_type,
        w.lane_type,
        w.wait_time_minutes,
        h.us_is_federal_holiday,
        h.mx_is_official_holiday,
        h.mx_is_bridge_day,
        h.us_is_summer_vacation,
        h.mx_is_summer_vacation
    FROM wait_times w
    LEFT JOIN holidays h ON h.date_value = w.timestamp::date
    WHERE w.wait_time_minutes IS NOT NULL
      AND w.status IS NOT NULL
      AND w.status <> 'Lanes Closed'
"""


def load_data() -> pd.DataFrame:
    with psycopg2.connect(**DB_CONFIG) as conn:
        df = pd.read_sql_query(QUERY, conn)
    df = df.rename(columns=DAY_TYPE_COLS)
    for alias in DAY_TYPE_COLS.values():
        df[alias] = df[alias].fillna(False).astype(int)
    return df


def fit_model(df: pd.DataFrame) -> Tuple[object, List[str], List[str]]:
    day_type_terms = []
    skipped = []
    for alias in DAY_TYPE_COLS.values():
        if df[alias].nunique() < 2:
            skipped.append(alias)
            continue
        day_type_terms.append(alias)

    if not day_type_terms:
        raise ValueError("Ninguna variable de tipo de dia tiene variacion todavia.")

    formula = (
        "wait_time_minutes ~ " + " + ".join(day_type_terms) +
        " + C(port_name) + C(crossing_type) + C(lane_type)"
    )
    model = smf.ols(formula, data=df).fit()
    return model, day_type_terms, skipped


def save_run(result: Dict) -> None:
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO day_type_model_runs
                (n_obs, r_squared, day_type_effects, day_types_skipped)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    result["n_obs"],
                    result["r_squared"],
                    Json(result["day_type_effects"]),
                    Json(result["day_types_skipped"]),
                ),
            )


def run() -> Dict:
    df = load_data()
    n_obs = len(df)
    logger.info(f"Cargadas {n_obs} observaciones con wait_time_minutes valido")

    model, day_type_terms, skipped = fit_model(df)

    for alias in skipped:
        logger.info(f"'{alias}' no varia todavia en los datos; excluida del modelo")

    ci = model.conf_int()
    effects = {}
    for alias in day_type_terms:
        coef = model.params[alias]
        pval = model.pvalues[alias]
        lo, hi = ci.loc[alias]
        effects[alias] = {
            "coef_min": round(float(coef), 2),
            "p_value": round(float(pval), 4),
            "ci95": [round(float(lo), 2), round(float(hi), 2)],
        }
        logger.info(
            f"{alias}: {coef:+.1f} min (p={pval:.3f}, IC95%=[{lo:+.1f}, {hi:+.1f}])"
        )

    result = {
        "n_obs": n_obs,
        "r_squared": round(float(model.rsquared), 3),
        "day_type_effects": effects,
        "day_types_skipped": skipped,
    }
    save_run(result)
    return result


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    print(run())
