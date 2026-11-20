/*
 * Integración con la API central de la cátedra (componente 5 del enunciado).
 *
 * El módulo NO tiene API propia: sólo consume la API REST central con fetch.
 *   GET  catálogos (períodos, edificios, unidades, fuentes de datos)
 *   GET  factores de emisión (bien y año)
 *   GET  datos de actividad y resultados de la dimensión, para visualizar
 *   POST dato de actividad
 *   POST resultado de emisión (con su trazabilidad)
 *
 * Cuando la cátedra entregue la documentación, ajustar:
 *   - rutas en js/config.js (api.endpoints)
 *   - nombres de campos en los adaptadores de abajo (sección "Adaptadores")
 */
(function (global) {
  'use strict';

  var C = global.CampusCO2;
  var cfg = C.config;

  // ---------- Conexión ----------

  function leerPreferencias() {
    try { return JSON.parse(localStorage.getItem(cfg.storage.conexion)) || {}; } catch (e) { return {}; }
  }

  function baseUrl() {
    var p = leerPreferencias();
    return String(p.baseUrl || cfg.api.baseUrl || '').trim().replace(/\/+$/, '');
  }

  function guardarBaseUrl(url) {
    var p = leerPreferencias();
    p.baseUrl = String(url || '').trim().replace(/\/+$/, '');
    try { localStorage.setItem(cfg.storage.conexion, JSON.stringify(p)); } catch (e) { /* sin storage */ }
  }

  function estaConfigurada() { return baseUrl() !== ''; }

  function ApiError(mensaje, status, detalle) {
    this.name = 'ApiError';
    this.message = mensaje;
    this.status = status || 0;
    this.detalle = detalle;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function armarUrl(ruta, query) {
    var url = baseUrl() + ruta;
    if (query) {
      var qs = Object.keys(query)
        .filter(function (k) { return query[k] !== undefined && query[k] !== null && query[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
        .join('&');
      if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    return url;
  }

  function pedir(metodo, ruta, opciones) {
    opciones = opciones || {};
    if (!estaConfigurada()) {
      return Promise.reject(new ApiError('Falta la dirección de la API central. Cargala en la pestaña Conexión.', 0));
    }
    var url = armarUrl(ruta, opciones.query);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, cfg.api.timeoutMs) : null;
    var init = { method: metodo, headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined };
    if (opciones.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opciones.body);
    }

    return fetch(url, init).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (texto) {
        var json = null;
        try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = null; }
        if (!res.ok) {
          var msg = (json && (json.message || json.mensaje || json.error || json.detail)) || res.statusText || 'error';
          throw new ApiError('La API respondió ' + res.status + ' en ' + metodo + ' ' + ruta + ': ' + msg, res.status, json || texto);
        }
        return json;
      });
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new ApiError('La API no respondió en ' + Math.round(cfg.api.timeoutMs / 1000) + ' s (' + metodo + ' ' + ruta + ').', 0);
      }
      throw new ApiError('No se pudo conectar con la API en ' + baseUrl() + '. Revisá la dirección, la conexión o que la API permita pedidos desde este origen (CORS).', 0);
    });
  }

  /** La API puede devolver un array o un objeto que lo envuelve. */
  function extraerLista(json) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== 'object') return [];
    var claves = ['data', 'items', 'results', 'resultados', 'datos', 'content'];
    for (var i = 0; i < claves.length; i++) if (Array.isArray(json[claves[i]])) return json[claves[i]];
    return [];
  }

  function extraerObjeto(json) {
    if (json && typeof json === 'object' && !Array.isArray(json) && json.data && typeof json.data === 'object') return json.data;
    return json || {};
  }

  function sinAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function texto(v) { return v === null || v === undefined ? '' : String(v); }

  function primero() {
    for (var i = 0; i < arguments.length; i++) if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    return null;
  }

  // ---------- Adaptadores (ajustar a los nombres reales de la API) ----------

  var adaptar = {
    periodo: function (p) {
      var anio = Number(primero(p.anio, p['año'], p.year, p.anio_desde));
      if (!anio) { var m = texto(primero(p.nombre, p.descripcion, '')).match(/(19|20)\d{2}/); anio = m ? Number(m[0]) : null; }
      return { id: primero(p.id, p.periodo_id), anio: anio, nombre: texto(primero(p.nombre, p.descripcion, anio, p.id)) };
    },
    edificio: function (e) {
      return { id: primero(e.id, e.edificio_id), nombre: texto(primero(e.nombre, e.descripcion, 'Edificio ' + e.id)) };
    },
    unidad: function (u) {
      return { id: primero(u.id, u.unidad_id), codigo: texto(primero(u.codigo, u.simbolo, u.abreviatura, u.nombre, '')), nombre: texto(primero(u.nombre, u.codigo, '')) };
    },
    fuente: function (f) {
      return { id: primero(f.id, f.fuente_id), nombre: texto(primero(f.nombre, f.descripcion, 'Fuente ' + f.id)) };
    },
    factor: function (f) {
      return {
        id: primero(f.id, f.factor_id),
        bien: texto(primero(f.bien, f.nombre, f.descripcion, '')),
        valor: Number(primero(f.valor, f.factor, f.value)),
        unidad: texto(primero(f.unidad, f.unidad_nombre, f.unidad_codigo, '')),
        fuente: texto(primero(f.fuente, f.fuente_nombre, '')),
        anio: Number(primero(f.anio, f['año'], f.year)) || null,
        origen: 'API'
      };
    },
    // Objeto del módulo → cuerpo del POST de dato de actividad (Tabla 4)
    datoAPayload: function (d) {
      return {
        periodo_id: d.periodoId,
        edificio_id: d.edificioId === undefined ? null : d.edificioId,
        dimension_id: cfg.dimension.id,
        unidad_id: d.unidadId,
        fuente_id: d.fuenteId,
        departamento: d.departamento || null,
        rubro: d.rubro,
        cantidad: d.cantidad,
        calidad: d.calidad
      };
    },
    // Objeto del módulo → cuerpo del POST de resultado de emisión (Tabla 4 y Tabla 12)
    resultadoAPayload: function (r, datoId) {
      return {
        dato_actividad_id: datoId,
        factor_id: r.factorId === undefined ? null : r.factorId,
        kg_co2e: r.kgCO2e,
        alcance: cfg.dimension.alcance,
        categoria: cfg.dimension.categoria,
        calculado_en: r.traza.calculado_en,
        trazabilidad: JSON.stringify(r.traza)
      };
    },
    // Respuestas de la API → registro del módulo para visualizar
    registro: function (dato, resultado, catalogos) {
      var traza = resultado.trazabilidad;
      if (typeof traza === 'string') { try { traza = JSON.parse(traza); } catch (e) { traza = { texto: traza }; } }
      var unidadId = primero(dato.unidad_id, dato.unidadId);
      var unidad = (catalogos.unidades || []).filter(function (u) { return String(u.id) === String(unidadId); })[0];
      return {
        datoId: primero(dato.id, dato.dato_actividad_id),
        resultadoId: primero(resultado.id, resultado.resultado_id),
        periodoId: primero(dato.periodo_id, dato.periodoId),
        edificioId: primero(dato.edificio_id, dato.edificioId),
        fuenteId: primero(dato.fuente_id, dato.fuenteId),
        departamento: dato.departamento || null,
        rubroNombre: dato.rubro,
        rubro: claveRubro(dato.rubro),
        cantidad: Number(dato.cantidad),
        unidad: unidad ? unidad.codigo : (traza && traza.entradas && traza.entradas.unidad_jabon) || '',
        calidad: dato.calidad || '',
        kgCO2e: Number(primero(resultado.kg_co2e, resultado.kgCO2e)),
        factorId: primero(resultado.factor_id, null),
        calculadoEn: primero(resultado.calculado_en, traza && traza.calculado_en),
        traza: traza || {}
      };
    }
  };

  function claveRubro(nombre) {
    var n = sinAcentos(nombre);
    var r = cfg.rubros;
    for (var k in r) if (sinAcentos(r[k].nombre) === n || sinAcentos(r[k].corto) === n || k.toLowerCase() === n) return k;
    if (n.indexOf('acta') !== -1) return 'actas';
    if (n.indexOf('higien') !== -1) return 'papelHig';
    if (n.indexOf('jabon') !== -1) return 'jabon';
    return null;
  }

  // ---------- Operaciones ----------

  function probarConexion() {
    var t0 = Date.now();
    return pedir('GET', cfg.api.endpoints.periodos).then(function (json) {
      return { ms: Date.now() - t0, periodos: extraerLista(json).length };
    });
  }

  function obtenerCatalogos() {
    var e = cfg.api.endpoints;
    return Promise.all([
      pedir('GET', e.periodos),
      pedir('GET', e.edificios),
      pedir('GET', e.unidades),
      pedir('GET', e.fuentes)
    ]).then(function (r) {
      return {
        periodos: extraerLista(r[0]).map(adaptar.periodo).sort(function (a, b) { return (a.anio || 0) - (b.anio || 0); }),
        edificios: extraerLista(r[1]).map(adaptar.edificio),
        unidades: extraerLista(r[2]).map(adaptar.unidad),
        fuentes: extraerLista(r[3]).map(adaptar.fuente),
        origen: 'API'
      };
    });
  }

  /**
   * Consulta el factor de un bien para un año. Si la API no tiene ese año exacto,
   * toma el más reciente anterior (y lo deja anotado para la trazabilidad).
   * Devuelve { factor, nota } o { factor: null } si la API no tiene el bien.
   */
  function obtenerFactor(bien, anio) {
    return pedir('GET', cfg.api.endpoints.factores, { query: { bien: bien, anio: anio } }).then(function (json) {
      var objetivo = sinAcentos(bien);
      var lista = extraerLista(json).map(adaptar.factor).filter(function (f) {
        var b = sinAcentos(f.bien);
        return !isNaN(f.valor) && (b === objetivo || b.indexOf(objetivo) !== -1);
      });
      if (!lista.length) return { factor: null };
      var exacto = lista.filter(function (f) { return f.anio === anio; })[0];
      if (exacto) return { factor: exacto, nota: null };
      var previos = lista.filter(function (f) { return f.anio && f.anio < anio; }).sort(function (a, b) { return b.anio - a.anio; });
      var elegido = previos[0] || lista.sort(function (a, b) { return (b.anio || 0) - (a.anio || 0); })[0];
      return { factor: elegido, nota: 'La API no tiene factor ' + anio + ' para "' + bien + '": se usa el de ' + (elegido.anio || 'año sin informar') + '.' };
    });
  }

  /** Datos de actividad + resultados de la dimensión, unidos por dato_actividad_id. */
  function listarRegistros(catalogos) {
    var e = cfg.api.endpoints;
    var q = { dimension_id: cfg.dimension.id };
    return Promise.all([pedir('GET', e.datosActividad, { query: q }), pedir('GET', e.resultados, { query: q })]).then(function (r) {
      var datos = extraerLista(r[0]).filter(function (d) {
        var dim = primero(d.dimension_id, d.dimensionId);
        return dim === null || String(dim) === String(cfg.dimension.id);
      });
      var resultadosPorDato = {};
      extraerLista(r[1]).forEach(function (res) {
        var id = primero(res.dato_actividad_id, res.datoActividadId);
        if (id !== null) resultadosPorDato[String(id)] = res;
      });
      return datos
        .map(function (d) {
          var res = resultadosPorDato[texto(primero(d.id, d.dato_actividad_id))];
          return res ? adaptar.registro(d, res, catalogos) : null;
        })
        .filter(function (x) { return x && x.rubro; });
    });
  }

  /** POST del dato de actividad y después POST de su resultado. */
  function guardar(dato, resultado) {
    var e = cfg.api.endpoints;
    return pedir('POST', e.datosActividad, { body: adaptar.datoAPayload(dato) }).then(function (json) {
      var obj = extraerObjeto(json);
      var datoId = primero(obj.id, obj.dato_actividad_id, obj.datoActividadId);
      if (datoId === null) throw new ApiError('La API guardó el dato de actividad pero no devolvió su id; no se puede enlazar el resultado.', 0, json);
      return pedir('POST', e.resultados, { body: adaptar.resultadoAPayload(resultado, datoId) }).then(function (json2) {
        var obj2 = extraerObjeto(json2);
        return { datoId: datoId, resultadoId: primero(obj2.id, obj2.resultado_id) };
      }, function (err) {
        err.datoGuardado = datoId;
        throw err;
      });
    });
  }

  C.api = {
    baseUrl: baseUrl,
    guardarBaseUrl: guardarBaseUrl,
    estaConfigurada: estaConfigurada,
    armarUrl: armarUrl,
    probarConexion: probarConexion,
    obtenerCatalogos: obtenerCatalogos,
    obtenerFactor: obtenerFactor,
    listarRegistros: listarRegistros,
    guardar: guardar,
    claveRubro: claveRubro,
    sinAcentos: sinAcentos,
    ApiError: ApiError
  };
})(window);
