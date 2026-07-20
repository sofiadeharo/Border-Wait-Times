import joblib
import pandas as pd

modelo_produccion = joblib.load("modelo_bota_waittimes_passengerlanes.joblib")

scene = {
    'month': [11],
    'hour': [17],             
    'dia_semana': [4],        
    'es_fin_semana': [0],     
    'hora_pico_matutina': [0], 
    'es_ready_lane': [1],     
    'baseline_daily_volume_vehiculos_BOTA': [12500.0]}

input_df = pd.DataFrame(scene)
tiempo_espera_predicho = modelo_produccion.predict(input_df)
print(f"Tiempo de espera predicho: {tiempo_espera_predicho[0]} minutos")