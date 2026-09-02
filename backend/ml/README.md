# ML — commercial-lane wait model (XGBoost + MLflow)

Trains the model that feeds `gold.fact_wait_forecast` in the warehouse.

```bash
pip install -r backend/ml/requirements.txt

mlflow ui                              # terminal 1 -> http://localhost:5000
export MLFLOW_TRACKING_URI=http://localhost:5000

# terminal 2 — trains on the warehouse gold schema if DB_* are set,
# otherwise on a synthetic frame with the same columns
python -m backend.ml.train
```

`train.py` calls **`mlflow.xgboost.autolog()`**, which records for every run:

- all XGBoost hyperparameters
- per-iteration train/validation metrics
- the **feature-importance** plot + JSON
- the fitted model (logged to the run, ready to register)

plus explicit `test_mae` / `test_r2` on a held-out split.

Feature engineering / cleaning lives in [`features.py`](features.py) and is unit-tested
in [`../../tests/test_features.py`](../../tests/test_features.py).

## Promote a run to the warehouse

Register the best run's model, then a batch job scores `gold.dim_date × ports × hours`
and writes `predicted_wait_min` into `gold.fact_wait_forecast` (drop the matview,
`CREATE TABLE` with the same columns). On Azure this is an **Azure ML batch endpoint**.
