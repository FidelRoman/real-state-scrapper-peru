from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options

def get_project_info(url):
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
        # Abrir la página web
        driver.get(url)
        
        # Buscar el div con la clase 'row proyecto-detalle'
        element = driver.find_element(By.CLASS_NAME, 'row.proyecto-detalle')
        
        # Buscar todos los elementos <p> dentro del div
        paragraphs = element.find_elements(By.TAG_NAME, 'p')
        
        # Validación: Inicializar valores con 'N/A' si faltan párrafos
        fecha = paragraphs[0].text.strip() if len(paragraphs) > 0 else "N/A"
        medidas = paragraphs[1].text.strip() if len(paragraphs) > 1 else "N/A"
        tipo = paragraphs[2].text.strip() if len(paragraphs) > 2 else "N/A"
        dormitorios = paragraphs[3].text.strip() if len(paragraphs) > 3 else "N/A"
        
        # Crear un diccionario con los datos extraídos
        info = {
            "fecha": fecha,
            "medidas": medidas,
            "tipo": tipo,
            "dormitorios": dormitorios
        }
        
        return info
    except Exception as e:
        print(f"Error: {e}")
        return {
            "fecha": "N/A",
            "medidas": "N/A",
            "tipo": "N/A",
            "dormitorios": "N/A"
        }
    finally:
        driver.quit()


