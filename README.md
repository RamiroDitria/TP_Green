# Campus CO₂ · Módulo 8: Compras y cadena de suministro

Front-end del Grupo 8 (Green Software, 4K4, UTN FRC). Carga los datos relevados de **actas de examen** e **higiene sanitaria**, consulta los factores de emisión a la **API central de la cátedra**, calcula kg y t de CO₂e (Alcance 3, categoría 1) con trazabilidad y muestra los resultados.

HTML, CSS y JavaScript sin frameworks ni librerías. **No tiene API propia**: sólo consume la API REST central.

## Cómo abrirlo

Con la extensión Live Server de VS Code, o desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
# y abrir http://localhost:8080
```

Abrir `index.html` con doble clic también funciona, pero el navegador manda los pedidos con origen `null` y la API tiene que aceptarlo (CORS). Con un servidor local no hay ese problema.

## Conectar la API central

1. Completar `api.baseUrl` en `js/config.js` (o cargarla en la pestaña **Conexión**, que la guarda en el navegador).
2. Ajustar las rutas en `api.endpoints` de `js/config.js` a la documentación de la cátedra.
3. Si la API usa otros nombres de campos, ajustarlos en la sección **Adaptadores** de `js/api.js`. Es el único lugar que conoce el formato de la API.

No poner credenciales en el código.

### Operaciones que usa

| Operación | Método | Ruta por defecto |
|---|---|---|
| Catálogos | GET | `/periodos`, `/edificios`, `/unidades`, `/fuentes-datos` |
| Factor de emisión | GET | `/factores-emision?bien=papel&anio=2026` |
| Datos y resultados de la dimensión | GET | `/datos-actividad?dimension_id=8`, `/resultados-emision?dimension_id=8` |
| Guardar dato de actividad | POST | `/datos-actividad` |
| Guardar resultado de emisión | POST | `/resultados-emision` |

Las respuestas pueden venir como array o envueltas en `data`, `items` o `results`.

### Qué envía

Dato de actividad (uno por departamento; dos por edificio, uno por rubro):

```json
{
  "periodo_id": 2, "edificio_id": null, "dimension_id": 8, "unidad_id": 2, "fuente_id": 1,
  "departamento": "Ingeniería en Sistemas de Información", "rubro": "Papelería de actas",
  "cantidad": 4.62, "calidad": "medido"
}
```

Resultado de emisión (con el `id` que devolvió el POST anterior):

```json
{
  "dato_actividad_id": 125, "factor_id": 7, "kg_co2e": 5.082, "alcance": 3, "categoria": 1,
  "calculado_en": "2026-11-20T00:32:10.000Z",
  "trazabilidad": "{\"entradas\":{...},\"factor\":{...},\"pasos\":[...],\"conversiones\":[...],\"resultado\":{...}}"
}
```

La trazabilidad guarda las entradas (cátedras, turnos, hojas, peso, plantas, baños, consumos), el factor con su valor, unidad, fuente y año, cada fórmula con los números reemplazados, las conversiones y la fecha.

## Estructura y componentes del enunciado

| Archivo | Componente |
|---|---|
| `index.html`, `css/styles.css` | 4. Módulo de carga y 7. Visualización (interfaz) |
| `js/validacion.js` | 4. Validaciones (Tabla 9 y sección 6.3) |
| `js/api.js` | 5. Integración con la API central |
| `js/calculo.js` | 6. Cálculo: fórmulas (1) a (7), conversiones (Tabla 11), trazabilidad (Tabla 12) e indicadores (Tabla 13) |
| `js/graficos.js` | 7. Gráficos en HTML y SVG nativos |
| `js/app.js` | Flujo de la sección 7.3 y armado de la pantalla |
| `js/config.js` | URL, rutas, departamentos, rubros y valores sugeridos |
| `tests/calculo.test.js` | Verificación del cálculo con el caso de la sección 8.3 |

La pestaña **Metodología** resume el modelo de medición (componente 1) y cómo se guardan los datos (componente 2).

## Flujo de un envío

1. Se completa el formulario. El comprobante de la derecha muestra el cálculo mientras se escribe.
2. Al tocar **Calcular y enviar** se validan los campos; los errores aparecen junto a cada uno.
3. Se pide el factor a la API (GET). Si la API no tiene ese factor, se puede cargar a mano con fuente y año, y queda marcado como supuesto en la trazabilidad.
4. Se calcula y se revisa si ya hay datos del mismo período y departamento o edificio; si los hay, se avisa antes de enviar.
5. Se envían el dato de actividad y su resultado (POST) por cada departamento o edificio.
6. Se actualizan los indicadores y los gráficos con lo que devuelve la API.

Si la API no responde, el módulo avisa, no envía nada y conserva lo cargado en el navegador.

## Pruebas

```bash
node tests/calculo.test.js
```

## Decisiones para reflejar en el informe

- **Carga en grilla**: un campo de cátedras por departamento y una fila de plantas y baños por edificio, como pidió la cátedra (Anexo A), en lugar de elegir de a un departamento o edificio. Ajustar la Tabla 9.
- **Fuente y calidad** se piden también en el formulario de actas, porque el dato de actividad las requiere.
- **Cantidad guardada**: las actas se guardan en kg de papel (las hojas quedan en la trazabilidad); el jabón, en la unidad en que se cargó (kg o L).
- **Factor manual**: si se usa, el resultado va con `factor_id: null` y la trazabilidad lo marca como supuesto. Confirmar con la cátedra que la API acepte `factor_id` vacío.
- **Factor de otro año**: si la API no tiene el factor del año del período, se usa el más reciente anterior y queda anotado.
- **Gráficos** (sección 9.3): HTML y SVG nativos, sin librerías.
- **Duplicados**: el aviso no bloquea el envío; los indicadores muestran una advertencia si hay datos repetidos.
- Las tipografías (Instrument Sans e IBM Plex Mono, licencia OFL) están en `fonts/`, así que no hace falta conexión para verlas.
