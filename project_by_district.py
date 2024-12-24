import requests
def get_project_by_district(ubigeo_id):
    url = f"https://nexoinmobiliario.pe/api/get_project_by_district?district={ubigeo_id}"

    headers = {
        'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9zIwNTQ1ODY1LCJleHAiOjE3MjA2MzIyN'
    }

    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()  # Devuelve los datos como lista de diccionarios
    else:
        print(f"Error: {response.status_code} para ubigeo {ubigeo_id}")
        return []
