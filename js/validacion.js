/*
 * Validaciones de los formularios (Tabla 9 y sección 6.3).
 * Los campos numéricos son de texto para aceptar coma decimal (0,005).
 */
(function (global) {
  'use strict';

  /** Convierte el texto de un campo a número. '' → null, texto inválido → NaN. */
  function parseNumero(texto) {
    var s = String(texto === undefined || texto === null ? '' : texto).trim();
    if (s === '') return null;
    s = s.replace(/\s/g, '');
    // Con un solo separador, es el decimal: "0,005" y "0.005" valen lo mismo.
    // Con los dos ("1.234,5"), el punto es de miles y la coma decimal.
    if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  /**
   * Valida un valor contra una regla.
   * regla = { requerido, entero, min, mayorQue }
   * Devuelve { valor, error } (error es null si está bien).
   */
  function validarNumero(texto, regla) {
    var v = parseNumero(texto);
    if (v === null) return { valor: null, error: regla.requerido ? 'Completá este campo.' : null };
    if (isNaN(v)) return { valor: null, error: 'Ingresá un número (usá coma o punto para los decimales).' };
    if (v < 0) return { valor: null, error: 'No puede ser negativo.' };
    if (regla.entero && !Number.isInteger(v)) return { valor: null, error: 'Tiene que ser un número entero.' };
    if (regla.min !== undefined && v < regla.min) return { valor: null, error: 'Tiene que ser mayor o igual a ' + regla.min + '.' };
    if (regla.mayorQue !== undefined && !(v > regla.mayorQue)) return { valor: null, error: 'Tiene que ser mayor a ' + regla.mayorQue + '.' };
    return { valor: v, error: null };
  }

  function validarSeleccion(valor, etiqueta) {
    if (valor === null || valor === undefined || String(valor) === '') {
      return { valor: null, error: 'Elegí ' + etiqueta + '.' };
    }
    return { valor: valor, error: null };
  }

  // Reglas de la Tabla 9
  var reglas = {
    catedras:       { requerido: true, entero: true, min: 0 },
    turnos:         { requerido: true, entero: true, min: 1 },
    hojasPorActa:   { requerido: true, entero: true, min: 1 },
    pesoHojaKg:     { requerido: true, mayorQue: 0 },
    plantas:        { requerido: true, entero: true, min: 1 },
    banosPorPlanta: { requerido: true, entero: true, min: 0 },
    consumoPH:      { requerido: true, mayorQue: 0 },
    consumoJabon:   { requerido: true, mayorQue: 0 },
    densidadJabon:  { requerido: true, mayorQue: 0 }
  };

  var api = { parseNumero: parseNumero, validarNumero: validarNumero, validarSeleccion: validarSeleccion, reglas: reglas };
  global.CampusCO2 = global.CampusCO2 || {};
  global.CampusCO2.validacion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
