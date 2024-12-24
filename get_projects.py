import pandas as pd
import requests
from project_info import get_project_info
from project_by_district import get_project_by_district

# Lista de ubigeos
ubigeo_list = [150101, 150102, 150103, 150104, 150105, 150106, 150107, 150108, 150109, 150110, 
               150111, 150112, 150113, 150114, 150115, 150116, 150117, 150118, 150119, 150120, 
               150121, 150122, 150123, 150124, 150125, 150126, 150127, 150128, 150129, 150130, 
               150131, 150132, 150133, 150134, 150135, 150136, 150137, 150138, 150139, 150140, 
               150141, 150142, 150143, 150144]

all_projects = []

# Obtener proyectos por distrito
for ubigeo_id in ubigeo_list:
    projects = get_project_by_district(ubigeo_id)
    for project in projects:
        project['ubigeo_id'] = ubigeo_id
    all_projects.extend(projects)  # Agregar los proyectos a la lista acumulativa

# Crear un DataFrame con todos los proyectos
if all_projects:
    df_projects = pd.DataFrame(all_projects)
    # Guardar el DataFrame en un archivo CSV en la carpeta actual
    output_file = "projects_data.csv"
    df_projects.to_csv(output_file, index=False, encoding='utf-8')
    print(f"DataFrame guardado en el archivo: {output_file}")
else:
    print("No se encontraron proyectos.")


# url = "https://nexoinmobiliario.pe/proyecto/venta-de-departamento-1971-homie-pueblo-libre-lima-lima-akamai"
# project_info = get_project_info(url)
# print(project_info)