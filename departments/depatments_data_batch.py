import pandas as pd
from project_info import get_project_info

# Lectura del CSV con los proyectos
input_file = "data/projects_data.csv"
df_projects = pd.read_csv(input_file)

# Verificar que exista la columna 'proyecto_link'
if 'proyecto_link' not in df_projects.columns:
    raise ValueError("La columna 'proyecto_link' no existe en el archivo CSV.")

# --- FUNCIÓN AUXILIAR PARA FRAGMENTAR EL DATAFRAME EN CHUNKS DE 100 FILAS ---
def chunk_dataframe(df, chunk_size=100):
    """
    Generador que corta un DataFrame en porciones (chunks) 
    de 'chunk_size' filas cada una.
    """
    for start in range(0, len(df), chunk_size):
        end = start + chunk_size
        yield df.iloc[start:end]

# Vamos a procesar df_projects en porciones de 100
chunk_size = 100
total_count = 0

# Iteramos sobre cada bloque (chunk) de df_projects
for i, chunk_df in enumerate(chunk_dataframe(df_projects, chunk_size=chunk_size), start=1):
    # Aquí acumularemos todos los departamentos de ESTE chunk
    all_departments_chunk = []

    # Iterar sobre cada fila (proyecto) en el chunk
    for _, row in chunk_df.iterrows():
        proyecto_link = row['proyecto_link']
        
        # Solo procedemos si el link no está vacío (NaN)
        if pd.notna(proyecto_link):
            # get_project_info debe devolver una lista de diccionarios
            project_info_list = get_project_info(proyecto_link)

            # A cada diccionario de la lista le agregamos info adicional
            for info_dict in project_info_list:
                info_dict['proyecto_link'] = proyecto_link
                all_departments_chunk.append(info_dict)

    # Convertimos la lista de diccionarios en un DataFrame
    df_departments_chunk = pd.DataFrame(all_departments_chunk)

    # Guardamos cada chunk de resultados en un archivo CSV distinto
    output_file = f"data/departments_info{i}.csv"
    df_departments_chunk.to_csv(output_file, index=False, encoding='utf-8')

    print(f"Archivo guardado con {len(df_departments_chunk)} filas: {output_file}")
    total_count += len(df_departments_chunk)

print(f"Total de filas procesadas: {total_count}")