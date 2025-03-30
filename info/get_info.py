import pandas as pd
import requests
import time
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("GOOGLE_MAPS_API_KEY")

# 📌 Configuración
API_KEY = api_key  # Reemplázala con tu clave
PLACES_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
CATEGORIES = [
    "hospital", "supermarket", "transit_station", "school", "university",
    "bank", "restaurant"
] 
RADIUS = 500  # Radio de búsqueda en metros

# 📂 Cargar datos (solo 5 filas)
df = pd.read_csv("data/data_w_coordinates.csv", usecols=["proyecto_link","latitude", "longitude"])

# 🔍 Función para consultar Google Places API
def get_nearby_places(lat, lon):
    results = {}
    
    for category in CATEGORIES:
        params = {
            "location": f"{lat},{lon}",
            "radius": RADIUS,
            "type": category,
            "key": API_KEY
        }
        response = requests.get(PLACES_URL, params=params)
        data = response.json()
        
        if "results" in data:
            results[category] = len(data["results"])  # Cantidad de lugares encontrados
        else:
            results[category] = 0
        
        time.sleep(1)  # Para evitar límite de consultas

    return results

# 🔄 Aplicar la función a cada fila
df_places = df.apply(lambda row: get_nearby_places(row["latitude"], row["longitude"]), axis=1, result_type="expand")

# 📝 Unir datos con la tabla original
df_final = pd.concat([df, df_places], axis=1)

# 💾 Guardar resultado en un archivo de prueba
df_final.to_csv("data/google_places_data.csv", index=False)

