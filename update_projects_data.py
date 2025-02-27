import pandas as pd
from departments.project_info import get_project_info

# Cargar el archivo CSV existente
input_file = "data/projects_data.csv"
df_projects = pd.read_csv(input_file)


# Asegúrate de que exista la columna 'proyecto_link'
if 'proyecto_link' not in df_projects.columns:
    raise ValueError("La columna 'proyecto_link' no existe en el archivo CSV.")

# Crear columnas vacías para los nuevos datos
df_projects['fecha'] = None
df_projects['medidas'] = None
df_projects['tipo'] = None
df_projects['dormitorios'] = None


# Iterar sobre las filas del DataFrame y actualizar las columnas con datos de get_project_info
for index, row in df_projects.iterrows():
    proyecto_link = row['proyecto_link']
    if pd.notna(proyecto_link):  # Verifica que el link no sea NaN
        project_info = get_project_info(proyecto_link)
        
        # Validar que project_info sea una lista no vacía
        if isinstance(project_info, list) and len(project_info) > 0:
            project_info = project_info[0]  # Tomar el primer elemento
        else:
            project_info = {}  # Usar un diccionario vacío para evitar errores

        # Actualizar las nuevas columnas con la información del proyecto
        df_projects.at[index, 'fecha'] = project_info.get('fecha', 'N/A')
        df_projects.at[index, 'medidas'] = project_info.get('medidas', 'N/A')
        df_projects.at[index, 'tipo'] = project_info.get('tipo', 'N/A')
        df_projects.at[index, 'dormitorios'] = project_info.get('dormitorios', 'N/A')

# Guardar el DataFrame actualizado en un nuevo archivo CSV
output_file = "projects_data_updated.csv"
df_projects.to_csv(output_file, index=False, encoding='utf-8')

print(f"Archivo actualizado guardado como: {output_file}")
