/*
 * API central simulada para probar el módulo sin esperar a la cátedra.
 *
 * Reproduce las rutas de catálogos, factores de emisión, datos de actividad
 * y resultados de emisión descriptas en el README del proyecto. Persiste lo
 * que se guarda (POST) en db.json para que sobreviva a un reinicio.
 *
 * Uso: node mock-api/server.js [puerto]   (por defecto 3001)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.argv[2] || process.env.PORT || 3001);
const DB_PATH = path.join(__dirname, 'db.json');

// ---------- Catálogos fijos (de sólo lectura) ----------

const periodos = [
  { id: 1, anio: 2024, nombre: '2024' },
  { id: 2, anio: 2025, nombre: '2025' },
  { id: 3, anio: 2026, nombre: '2026' }
];

const edificios = [
  { id: 1, nombre: 'Edificio 1' },
  { id: 2, nombre: 'Edificio 2' },
  { id: 3, nombre: 'Edificio 3' },
  { id: 4, nombre: 'Edificio 4' },
  { id: 5, nombre: 'Edificio 5' }
];

const unidades = [
  { id: 1, codigo: 'kg', nombre: 'Kilogramo' },
  { id: 2, codigo: 'L', nombre: 'Litro' },
  { id: 3, codigo: 'unidad', nombre: 'Unidad' }
];

const fuentes = [
  { id: 1, nombre: 'Facturas de compra (Dirección de Compras)' },
  { id: 2, nombre: 'Relevamiento propio del Grupo 8' },
  { id: 3, nombre: 'Área de Mantenimiento e Higiene' }
];

// Valores de referencia tomados de bases públicas (ADEME / DEFRA) sólo para
// simular el módulo: no son los que va a entregar la cátedra.
const factores = [
  { id: 1, bien: 'papel', valor: 0.88, unidad: 'kg CO2e/kg', fuente: 'ADEME Base Empreinte 2024', anio: 2024 },
  { id: 2, bien: 'papel', valor: 0.91, unidad: 'kg CO2e/kg', fuente: 'ADEME Base Empreinte 2024', anio: 2025 },
  { id: 3, bien: 'papel', valor: 0.93, unidad: 'kg CO2e/kg', fuente: 'ADEME Base Empreinte 2024', anio: 2026 },
  // Sin factor 2026 a propósito: ejercita el "se usa el más reciente anterior" del README.
  { id: 4, bien: 'jabon liquido', valor: 1.15, unidad: 'kg CO2e/kg', fuente: 'DEFRA 2024 GHG Conversion Factors', anio: 2024 },
  { id: 5, bien: 'jabon liquido', valor: 1.18, unidad: 'kg CO2e/kg', fuente: 'DEFRA 2024 GHG Conversion Factors', anio: 2025 }
];

// ---------- Estado mutable (datos de actividad y resultados) ----------

function cargarDb() {
  try {
    const texto = fs.readFileSync(DB_PATH, 'utf8');
    const json = JSON.parse(texto);
    return {
      nextDatoId: json.nextDatoId || 1,
      nextResultadoId: json.nextResultadoId || 1,
      datosActividad: json.datosActividad || [],
      resultados: json.resultados || []
    };
  } catch (e) {
    return { nextDatoId: 1, nextResultadoId: 1, datosActividad: [], resultados: [] };
  }
}

let db = cargarDb();

function guardarDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- Utilidades HTTP ----------

function enviarJson(res, status, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto)
  });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      if (!partes.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ---------- Servidor ----------

const servidor = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, 'http://localhost');
  const ruta = u.pathname.replace(/\/+$/, '') || '/';
  const q = u.searchParams;

  console.log(req.method + ' ' + req.url);

  if (req.method === 'GET' && ruta === '/periodos') return enviarJson(res, 200, periodos);
  if (req.method === 'GET' && ruta === '/edificios') return enviarJson(res, 200, edificios);
  if (req.method === 'GET' && ruta === '/unidades') return enviarJson(res, 200, unidades);
  if (req.method === 'GET' && ruta === '/fuentes-datos') return enviarJson(res, 200, fuentes);

  if (req.method === 'GET' && ruta === '/factores-emision') {
    const bien = sinAcentos(q.get('bien'));
    const lista = bien
      ? factores.filter((f) => sinAcentos(f.bien) === bien || sinAcentos(f.bien).indexOf(bien) !== -1)
      : factores;
    return enviarJson(res, 200, lista);
  }

  if (req.method === 'GET' && ruta === '/datos-actividad') {
    const dim = q.get('dimension_id');
    const lista = dim ? db.datosActividad.filter((d) => String(d.dimension_id) === String(dim)) : db.datosActividad;
    return enviarJson(res, 200, lista);
  }

  if (req.method === 'GET' && ruta === '/resultados-emision') {
    const dim = q.get('dimension_id');
    let lista = db.resultados;
    if (dim) {
      const idsDeLaDimension = new Set(
        db.datosActividad.filter((d) => String(d.dimension_id) === String(dim)).map((d) => d.id)
      );
      lista = db.resultados.filter((r) => idsDeLaDimension.has(r.dato_actividad_id));
    }
    return enviarJson(res, 200, lista);
  }

  if (req.method === 'POST' && ruta === '/datos-actividad') {
    leerCuerpo(req).then((cuerpo) => {
      if (!cuerpo || typeof cuerpo !== 'object') return enviarJson(res, 400, { error: 'Cuerpo JSON inválido.' });
      const registro = Object.assign({}, cuerpo, {
        id: db.nextDatoId++,
        dimension_id: cuerpo.dimension_id || 8,
        creado_en: new Date().toISOString()
      });
      db.datosActividad.push(registro);
      guardarDb();
      enviarJson(res, 201, registro);
    }).catch(() => enviarJson(res, 400, { error: 'Cuerpo JSON inválido.' }));
    return;
  }

  if (req.method === 'POST' && ruta === '/resultados-emision') {
    leerCuerpo(req).then((cuerpo) => {
      if (!cuerpo || typeof cuerpo !== 'object') return enviarJson(res, 400, { error: 'Cuerpo JSON inválido.' });
      if (cuerpo.dato_actividad_id === undefined || cuerpo.dato_actividad_id === null) {
        return enviarJson(res, 400, { error: 'Falta dato_actividad_id.' });
      }
      const registro = Object.assign({}, cuerpo, { id: db.nextResultadoId++ });
      db.resultados.push(registro);
      guardarDb();
      enviarJson(res, 201, registro);
    }).catch(() => enviarJson(res, 400, { error: 'Cuerpo JSON inválido.' }));
    return;
  }

  // Ruta de conveniencia para limpiar lo guardado durante las pruebas.
  if (req.method === 'POST' && ruta === '/_reset') {
    db = { nextDatoId: 1, nextResultadoId: 1, datosActividad: [], resultados: [] };
    guardarDb();
    return enviarJson(res, 200, { ok: true });
  }

  enviarJson(res, 404, { error: 'No existe ' + req.method + ' ' + ruta + ' en la API simulada.' });
});

servidor.listen(PORT, () => {
  console.log('API simulada de Campus CO2 · Módulo 8 escuchando en http://localhost:' + PORT);
  console.log('Catalogos: /periodos /edificios /unidades /fuentes-datos /factores-emision');
  console.log('Datos: /datos-actividad /resultados-emision (GET y POST)');
  console.log('Reinicio de datos guardados: POST /_reset');
});
