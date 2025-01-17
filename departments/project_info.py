from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
import time

def get_project_info(url):
    # Configuración de Selenium para Microsoft Edge
    options = Options()
    options.add_argument('--headless')  # Opcional: Ejecutar en modo headless
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--no-sandbox')

    # Ruta a EdgeDriver (ajusta según tu ruta local)
    driver_path = "/Users/fidel/Downloads/msedgedriver"
    service = Service(driver_path)
    driver = webdriver.Edge(service=service, options=options)

    try:
        # 1. Abrir la página web
        driver.get(url)
        
        # 2. Capturar los datos anteriores (fecha, medidas, tipo, dormitorios)
        try:
            element = driver.find_element(By.CLASS_NAME, 'row.proyecto-detalle')
            paragraphs = element.find_elements(By.TAG_NAME, 'p')

            fecha = paragraphs[0].text.strip() if len(paragraphs) > 0 else "N/A"
            medidas = paragraphs[1].text.strip() if len(paragraphs) > 1 else "N/A"
            tipo = paragraphs[2].text.strip() if len(paragraphs) > 2 else "N/A"
            dormitorios = paragraphs[3].text.strip() if len(paragraphs) > 3 else "N/A"
        except Exception:
            fecha = "N/A"
            medidas = "N/A"
            tipo = "N/A"
            dormitorios = "N/A"

        # 3. Hacer click en "ver más modelos"
        try:
            ver_mas_link = driver.find_element(By.CSS_SELECTOR, 'a.ver-mas-modelos.mas')
            ver_mas_link.click()
            time.sleep(2)  # Ajusta el tiempo según la demora en cargar
        except Exception as e:
            print("No se pudo hacer click en 'ver más modelos':", e)

        # 4. Buscar todos los div con la clase "thumbnail-container col-sm-4 col-md-4 col-xs-12"
        thumbnail_divs = driver.find_elements(
            By.CSS_SELECTOR,
            'div.thumbnail-container.col-sm-4.col-md-4.col-xs-12'
        )

        # 5. Iterar sobre cada thumbnail-container y extraer la info
        results = []
        for thumb in thumbnail_divs:
            # a. Disponible
            try:
                disponible = thumb.find_element(By.CLASS_NAME, 'disponible').text.strip()
            except:
                disponible = "N/A"

            # b. Piso
            try:
                piso = thumb.find_element(
                    By.XPATH,
                    './/div[span[@class="detalle_cabecera" and text()="Piso"]]/span[@class="detalle"]'
                ).text.strip()
            except:
                piso = "N/A"

            # c. Dormitorios
            try:
                dormitorios_cont = thumb.find_element(
                    By.XPATH,
                    './/div[span[@class="detalle_cabecera" and contains(text(),"Dormitorios")]]/span[@class="detalle"]'
                ).text.strip()
            except:
                dormitorios_cont = "N/A"

            # d. Área
            try:
                area = thumb.find_element(
                    By.XPATH,
                    './/div[span[@class="detalle_cabecera" and contains(text(),"Área")]]/span[@class="detalle"]'
                ).text.strip()
            except:
                area = "N/A"

            # e. Modelo (nuevo)
            try:
                modelo = thumb.find_element(
                    By.XPATH,
                    './/div[span[@class="detalle_cabecera" and contains(text(),"Modelo")]]/span[@class="detalle"]'
                ).text.strip()
            except:
                modelo = "N/A"

            # f. Precio
            try:
                precio_text = thumb.find_element(By.CSS_SELECTOR, 'h3.detalle_precio').text
                precio = precio_text.split('\n')[-1].replace('S/ ', '').strip()
            except:
                precio = "N/A"

            # g. Diccionario de datos
            data_dict = {
                "fecha": fecha,
                "medidas": medidas,
                "tipo": tipo,
                "dormitorios": dormitorios,       # info general
                "disponible": disponible,
                "piso": piso,
                "dormitorios_cont": dormitorios_cont,
                "area": area,
                "modelo": modelo,                 # campo nuevo
                "precio": precio
            }

            results.append(data_dict)

        return results

    except Exception as e:
        print(f"Error general: {e}")
        return []
    finally:
        driver.quit()