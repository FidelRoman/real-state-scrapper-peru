from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

def get_project_info(url, driver=None):
    # Configuración de Selenium para Microsoft Edge
    should_quit_driver = False
    
    if driver is None:
        should_quit_driver = True
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--no-sandbox')
        # Add user agent to avoid detection
        options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        service = Service(EdgeChromiumDriverManager().install())
        driver = webdriver.Edge(service=service, options=options)

    try:
        # 1. Abrir la página web
        driver.get(url)
        
        # Wait for page to load
        wait = WebDriverWait(driver, 10)
        
        # 2. Capturar los datos del proyecto (fecha, medidas, tipo, dormitorios)
        fecha = "N/A"
        medidas = "N/A"
        tipo = "N/A"
        dormitorios = "N/A"
        
        try:
            # Strategy 1: Look for "Detalles del proyecto" header and following text
            try:
                details_header = driver.find_element(By.XPATH, "//h3[contains(text(), 'Detalles del proyecto')]")
                # Get the parent container of the header, which likely contains the details text
                details_container = details_header.find_element(By.XPATH, "./..") 
                container_text = details_container.text
            except:
                # Fallback: Get the entire body text if header not found
                container_text = driver.find_element(By.TAG_NAME, "body").text

            # Parse the text for keywords
            # Example text: "Entrega inmediata ... 61.87 m2 total ... 2 dormitorios"
            lines = container_text.split('\n')
            for line in lines:
                line = line.strip()
                # Exclude prices (containing S/ or $) from date check
                if "S/" in line or "$" in line:
                    continue

                if "Entrega" in line or "Entregado" in line or "/" in line and len(line) < 12 and any(char.isdigit() for char in line):
                     # Simple date heuristic or "Entrega" keyword
                     if fecha == "N/A" and ("Entrega" in line or "/" in line):
                        fecha = line
                
                if "m²" in line or "m2" in line:
                    if medidas == "N/A":
                        medidas = line
                
                if "dormitorios" in line.lower() or "dorms" in line.lower():
                    if dormitorios == "N/A":
                        dormitorios = line
                
                if "Tipo" in line or "Departamento" in line or "Casa" in line or "Lote" in line or "Oficina" in line:
                     if tipo == "N/A" and len(line) < 30: # Avoid long sentences
                        tipo = line

        except Exception as e:
            print(f"Error extracting project details: {e}")

        # 3. Buscar todos los modelos disponibles
        # New selector based on inspection: div.fp-modelo-disponible
        try:
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'div.fp-modelo-disponible')))
            model_divs = driver.find_elements(By.CSS_SELECTOR, 'div.fp-modelo-disponible')
        except:
            print("No models found with 'div.fp-modelo-disponible', trying fallback...")
            model_divs = []

        results = []
        for div in model_divs:
            try:
                if not div.text.strip():
                    continue
                
                text_content = div.text.split('\n')
                
                # Initialize fields
                disponible = "N/A"
                precio = "N/A"
                divisa = "N/A"
                modelo = "N/A"
                area = "N/A"
                piso = "N/A"
                dormitorios_cont = "N/A"
                
                # Parse text lines
                # Example text content list:
                # ['1 unidad disponible', 'Desde', 'S/ 429,900', 'Modelo Tipo 5', '61.87 m²', 'Piso 2', '2 dorms.', '2 baños', 'COTIZAR AHORA']
                
                for line in text_content:
                    line = line.strip()
                    if "disponible" in line.lower():
                        disponible = line
                    elif "S/" in line or "$" in line:
                        if "S/" in line:
                            divisa = "Soles"
                            precio = line.replace('S/', '').strip()
                        elif "$" in line:
                            divisa = "Dólares"
                            precio = line.replace('$', '').strip()
                    elif line.startswith("Modelo"):
                        modelo = line
                    elif "m²" in line:
                        area = line
                    elif "Piso" in line:
                        piso = line
                    elif "dorms" in line.lower() or "dormitorios" in line.lower():
                        dormitorios_cont = line

                # Data Dictionary
                data_dict = {
                    "fecha": fecha,
                    "medidas": medidas,
                    "tipo": tipo,
                    "dormitorios": dormitorios,       # info general
                    "disponible": disponible,
                    "piso": piso,
                    "dormitorios_cont": dormitorios_cont,
                    "area": area,
                    "modelo": modelo,
                    "divisa": divisa,
                    "precio": precio
                }
                results.append(data_dict)
                
            except Exception as e:
                print(f"Error parsing model card: {e}")
                continue

        return results

    except Exception as e:
        print(f"Error general: {e}")
        return []
    finally:
        if should_quit_driver:
            driver.quit()