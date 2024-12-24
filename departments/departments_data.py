import pandas as pd
from project_info import get_project_info

# Lectura del CSV con los proyectos
input_file = "data/projects_data_demo.csv"
df_projects = pd.read_csv(input_file)

# Verificar que exista la columna 'proyecto_link'
if 'proyecto_link' not in df_projects.columns:
    raise ValueError("La columna 'proyecto_link' no existe en el archivo CSV.")

# Aquí acumularemos todos los departamentos encontrados
all_departments = []

# Iterar sobre cada fila para extraer el link
for _, row in df_projects.iterrows():
    proyecto_link = row['proyecto_link']
    
    # Solo procedemos si el link no está vacío (NaN)
    if pd.notna(proyecto_link):
        # get_project_info debe devolver una lista de dicts
        project_info_list = get_project_info(proyecto_link)

        # A cada diccionario de la lista le agregamos la info de a qué proyecto pertenece
        for info_dict in project_info_list:
            info_dict['proyecto_link'] = proyecto_link
            all_departments.append(info_dict)

# Convertimos la lista de diccionarios en un DataFrame
df_departments = pd.DataFrame(all_departments)

# Guardamos el DataFrame en un archivo CSV
output_file = "data/departments_info.csv"
df_departments.to_csv(output_file, index=False, encoding='utf-8')
print(f"Archivo guardado como: {output_file}")