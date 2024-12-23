from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options

# Configuración de Selenium para Microsoft Edge
options = Options()
options.add_argument('--headless')  # Opcional: Ejecutar en modo headless
options.add_argument('--disable-gpu')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--no-sandbox')

# Ruta a EdgeDriver
driver_path = "C:/Users/fidel/Downloads/msedgedriver.exe"  # Cambia esta ruta según donde colocaste EdgeDriver
service = Service(driver_path)
driver = webdriver.Edge(service=service, options=options)

try:
    # URL de la página
    url = "https://nexoinmobiliario.pe/proyecto/venta-de-departamento-1971-homie-pueblo-libre-lima-lima-akamai"
    driver.get(url)
    
    # Buscar el div con la clase 'row proyecto-detalle'
    element = driver.find_element(By.CLASS_NAME, 'row.proyecto-detalle')
    
    # Buscar todos los elementos <p> dentro del div
    paragraphs = element.find_elements(By.TAG_NAME, 'p')
    
    # Asegurarse de que hay al menos 4 elementos <p>
    if len(paragraphs) >= 4:
        # Extraer el texto de cada <p>
        fecha = paragraphs[0].text.strip()
        medidas = paragraphs[1].text.strip()
        tipo = paragraphs[2].text.strip()
        dormitorios = paragraphs[3].text.strip()
        
        # Crear un diccionario con los datos extraídos
        info = {
            "fecha": fecha,
            "medidas": medidas,
            "tipo": tipo,
            "dormitorios": dormitorios
        }
        
        print(info)
    else:
        print("No se encontraron los 4 elementos esperados dentro del div.")
except Exception as e:
    print(f"Error: {e}")
finally:
    driver.quit()
