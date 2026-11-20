/*
 * Módulo de cálculo (componente 6 del enunciado).
 *
 * Funciones puras: no tocan el DOM ni la API, así se pueden probar con Node
 * (ver tests/calculo.test.js). Implementa las fórmulas (1) a (7) de la sección 3.4,
 * las conversiones de la Tabla 11 y arma el registro de trazabilidad de la Tabla 12.
 */
(function (global) {
  'use strict';

  var VERSION_TRAZA = 1;

  // ---------- Formato ----------
  function fmt(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var d = dec === undefined ? autoDecimales(n) : dec;
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n);
  }
  function autoDecimales(n) {
    var a = Math.abs(n);
    if (a === 0) return 0;
    if (a >= 100) return 1;
    if (a >= 1) return 2;
    if (a >= 0.01) return 4;
    return 6;
  }
  function redondear(n, dec) {
    var f = Math.pow(10, dec === undefined ? 6 : dec);
    return Math.round(n * f) / f;
  }

  // ---------- Conversiones (Tabla 11) ----------

  /** Normaliza el texto de una unidad de factor a una clave conocida. */
  function claveUnidadFactor(unidad) {
    var u = String(unidad || '').toLowerCase()
      .replace(/co₂/g, 'co2').replace(/co2eq/g, 'co2e')
      .replace(/\s+por\s+/g, '/').replace(/\s+/g, '')
      .replace(/toneladas?/g, 't').replace(/litros?/g, 'l')
      .replace(/kilogramos?/g, 'kg').replace(/gramos?/g, 'g');
    var tabla = {
      'kgco2e/kg': { multiplicador: 1, por: 'kg' },
      'tco2e/t': { multiplicador: 1, por: 'kg' },
      'gco2e/g': { multiplicador: 1, por: 'kg' },
      'kgco2e/t': { multiplicador: 1 / 1000, por: 'kg' },
      'gco2e/kg': { multiplicador: 1 / 1000, por: 'kg' },
      'kgco2e/l': { multiplicador: 1, por: 'L' }
    };
    return tabla[u] || null;
  }

  /**
   * Lleva un factor de la API a kg CO2e por kg (o por L).
   * Devuelve { valor, por, pasos[] } o lanza un Error si la unidad no se reconoce.
   */
  function normalizarFactor(factor) {
    if (!factor || typeof factor.valor !== 'number' || !(factor.valor >= 0)) {
      throw new Error('El factor de emisión no tiene un valor numérico válido.');
    }
    var k = claveUnidadFactor(factor.unidad);
    if (!k) throw new Error('Unidad de factor no reconocida: "' + factor.unidad + '". Agregala en calculo.js (claveUnidadFactor).');
    var valor = factor.valor * k.multiplicador;
    var pasos = [];
    if (k.multiplicador !== 1) {
      pasos.push('Factor ' + fmt(factor.valor) + ' ' + factor.unidad + ' ÷ ' + fmt(1 / k.multiplicador) +
        ' = ' + fmt(valor) + ' kg CO₂e/' + k.por);
    }
    return { valor: valor, por: k.por, pasos: pasos };
  }

  /** Expresa una cantidad en la unidad del factor (kg ↔ L con la densidad). */
  function cantidadEnUnidadDelFactor(cantidad, unidadCantidad, porFactor, densidad, nombre) {
    if (unidadCantidad === porFactor) return { cantidad: cantidad, pasos: [] };
    if (!(densidad > 0)) throw new Error('Falta la densidad del jabón para convertir entre litros y kg.');
    if (unidadCantidad === 'L' && porFactor === 'kg') {
      var kg = cantidad * densidad;
      return { cantidad: kg, pasos: [nombre + ': ' + fmt(cantidad) + ' L × ' + fmt(densidad) + ' kg/L = ' + fmt(kg) + ' kg'] };
    }
    if (unidadCantidad === 'kg' && porFactor === 'L') {
      var l = cantidad / densidad;
      return { cantidad: l, pasos: [nombre + ': ' + fmt(cantidad) + ' kg ÷ ' + fmt(densidad) + ' kg/L = ' + fmt(l) + ' L'] };
    }
    throw new Error('No hay conversión de ' + unidadCantidad + ' a ' + porFactor + '.');
  }

  function resumenFactor(factor) {
    return {
      id: factor.id === undefined ? null : factor.id,
      bien: factor.bien,
      valor: factor.valor,
      unidad: factor.unidad,
      fuente: factor.fuente || '',
      anio: factor.anio || null,
      origen: factor.origen || 'API'
    };
  }

  // ---------- Rubro A: actas de examen ----------

  /**
   * Fórmulas (1), (2) y (3) para un departamento.
   * e = { departamento, catedras, turnos, hojasPorActa, pesoHojaKg }
   */
  function calcularActas(e, factorPapel, ahora) {
    var nf = normalizarFactor(factorPapel);
    if (nf.por !== 'kg') throw new Error('El factor del papel tiene que estar expresado por masa (kg o t).');
    var hojas = e.catedras * e.turnos * e.hojasPorActa;                       // (1)
    var kgPapel = hojas * e.pesoHojaKg;                                         // (2)
    var kg = kgPapel * nf.valor;                                                // (3)
    var pasos = [
      { formula: '(1)', texto: 'Hojas = Cd × T × H = ' + fmt(e.catedras) + ' × ' + fmt(e.turnos) + ' × ' + fmt(e.hojasPorActa) + ' = ' + fmt(hojas) + ' hojas' },
      { formula: '(2)', texto: 'Papel = Hojas × m = ' + fmt(hojas) + ' × ' + fmt(e.pesoHojaKg) + ' kg = ' + fmt(kgPapel) + ' kg' },
      { formula: '(3)', texto: 'E_A = Papel × FE papel = ' + fmt(kgPapel) + ' kg × ' + fmt(nf.valor) + ' kg CO₂e/kg = ' + fmt(kg) + ' kg CO₂e' }
    ];
    return {
      rubro: 'actas',
      hojas: hojas,
      cantidad: redondear(kgPapel),
      unidad: 'kg',
      kgCO2e: redondear(kg),
      tCO2e: redondear(kg / 1000, 9),
      traza: {
        version: VERSION_TRAZA,
        rubro: 'Papelería de actas',
        formulas: ['(1)', '(2)', '(3)'],
        entradas: {
          departamento: e.departamento,
          catedras: e.catedras,
          turnos: e.turnos,
          hojas_por_acta: e.hojasPorActa,
          peso_hoja_kg: e.pesoHojaKg,
          hojas: hojas
        },
        factor: resumenFactor(factorPapel),
        conversiones: ['Hojas a kg: ' + fmt(hojas) + ' × ' + fmt(e.pesoHojaKg) + ' kg'].concat(nf.pasos),
        pasos: pasos,
        resultado: { kg_co2e: redondear(kg), t_co2e: redondear(kg / 1000, 9) },
        calculado_en: (ahora || new Date()).toISOString()
      }
    };
  }

  // ---------- Rubro B: higiene sanitaria ----------

  /**
   * Fórmulas (4), (5) y (6) para un edificio. Devuelve dos resultados:
   * uno para el papel higiénico y otro para el jabón líquido.
   * e = { edificioId, edificio, plantas, banosPorPlanta, consumoPH, consumoJabon, unidadJabon, densidadJabon }
   */
  function calcularHigiene(e, factorPapel, factorJabon, ahora) {
    var t = (ahora || new Date()).toISOString();
    var nfP = normalizarFactor(factorPapel);
    if (nfP.por !== 'kg') throw new Error('El factor del papel tiene que estar expresado por masa (kg o t).');
    var nfJ = normalizarFactor(factorJabon);

    var banos = e.plantas * e.banosPorPlanta;                                   // (4)
    var kgPH = banos * e.consumoPH;                                             // (5)
    var jabon = banos * e.consumoJabon;                                         // (5) en kg o L
    var conv = cantidadEnUnidadDelFactor(jabon, e.unidadJabon, nfJ.por, e.densidadJabon, 'Jabón');
    var ePH = kgPH * nfP.valor;                                                 // (6) parte papel
    var eJ = conv.cantidad * nfJ.valor;                                         // (6) parte jabón

    var entradas = {
      edificio: e.edificio,
      plantas: e.plantas,
      banos_por_planta: e.banosPorPlanta,
      banos: banos,
      consumo_papel_higienico_kg_bano: e.consumoPH,
      consumo_jabon_bano: e.consumoJabon,
      unidad_jabon: e.unidadJabon
    };
    if (e.unidadJabon === 'L' || nfJ.por === 'L') entradas.densidad_jabon_kg_l = e.densidadJabon;

    var pasoBanos = { formula: '(4)', texto: 'Baños = Pe × Be = ' + fmt(e.plantas) + ' × ' + fmt(e.banosPorPlanta) + ' = ' + fmt(banos) + ' baños' };

    var ph = {
      rubro: 'papelHig',
      cantidad: redondear(kgPH),
      unidad: 'kg',
      kgCO2e: redondear(ePH),
      tCO2e: redondear(ePH / 1000, 9),
      traza: {
        version: VERSION_TRAZA,
        rubro: 'Papel higiénico',
        formulas: ['(4)', '(5)', '(6)'],
        entradas: entradas,
        factor: resumenFactor(factorPapel),
        supuestos: ['El papel higiénico usa el factor de emisión del papel (indicación de la cátedra).'],
        conversiones: nfP.pasos.slice(),
        pasos: [
          pasoBanos,
          { formula: '(5)', texto: 'Papel higiénico = Baños × cPH = ' + fmt(banos) + ' × ' + fmt(e.consumoPH) + ' kg = ' + fmt(kgPH) + ' kg' },
          { formula: '(6)', texto: 'E = ' + fmt(kgPH) + ' kg × ' + fmt(nfP.valor) + ' kg CO₂e/kg = ' + fmt(ePH) + ' kg CO₂e' }
        ],
        resultado: { kg_co2e: redondear(ePH), t_co2e: redondear(ePH / 1000, 9) },
        calculado_en: t
      }
    };

    var jb = {
      rubro: 'jabon',
      cantidad: redondear(jabon),
      unidad: e.unidadJabon,
      kgCO2e: redondear(eJ),
      tCO2e: redondear(eJ / 1000, 9),
      traza: {
        version: VERSION_TRAZA,
        rubro: 'Jabón líquido',
        formulas: ['(4)', '(5)', '(6)'],
        entradas: entradas,
        factor: resumenFactor(factorJabon),
        conversiones: conv.pasos.concat(nfJ.pasos),
        pasos: [
          pasoBanos,
          { formula: '(5)', texto: 'Jabón = Baños × cJ = ' + fmt(banos) + ' × ' + fmt(e.consumoJabon) + ' ' + e.unidadJabon + ' = ' + fmt(jabon) + ' ' + e.unidadJabon },
          { formula: '(6)', texto: 'E = ' + fmt(conv.cantidad) + ' ' + nfJ.por + ' × ' + fmt(nfJ.valor) + ' kg CO₂e/' + nfJ.por + ' = ' + fmt(eJ) + ' kg CO₂e' }
        ],
        resultado: { kg_co2e: redondear(eJ), t_co2e: redondear(eJ / 1000, 9) },
        calculado_en: t
      }
    };

    return { banos: banos, papelHig: ph, jabon: jb, kgCO2e: redondear(ePH + eJ) };
  }

  // ---------- Indicadores (Tabla 13) ----------

  /**
   * Agrega registros normalizados (ver api.js → normalizarRegistro) de un período.
   * Los totales no se guardan en la base: se calculan al visualizar (sección 4.3).
   */
  function agregar(registros, periodoId) {
    var r = registros.filter(function (x) { return periodoId == null || String(x.periodoId) === String(periodoId); });
    var porRubro = { actas: 0, papelHig: 0, jabon: 0 };
    var porDepto = {};
    var porEdificio = {};
    var catedras = 0, banos = 0, hojas = 0, kgPapelActas = 0, escenario10 = 0;
    var cantidades = { actas: 0, papelHig: 0, jabon: 0 };
    var conteo = { actas: 0, papelHig: 0, jabon: 0 };
    var unidadesJabon = {};
    var factores = { actas: {}, papelHig: {}, jabon: {} };
    var claves = {};
    var duplicados = [];

    r.forEach(function (x) {
      if (!porRubro.hasOwnProperty(x.rubro)) return;
      porRubro[x.rubro] += x.kgCO2e;
      cantidades[x.rubro] += x.cantidad || 0;
      conteo[x.rubro]++;
      var ent = (x.traza && x.traza.entradas) || {};
      var f = x.traza && x.traza.factor;
      if (f) factores[x.rubro][f.valor + ' ' + f.unidad] = f;
      var clave = x.periodoId + '|' + x.rubro + '|' + (x.rubro === 'actas' ? x.departamento : x.edificioId);
      claves[clave] = (claves[clave] || 0) + 1;
      if (claves[clave] === 2) duplicados.push(clave);

      if (x.rubro === 'actas') {
        porDepto[x.departamento] = (porDepto[x.departamento] || 0) + x.kgCO2e;
        catedras += Number(ent.catedras) || 0;
        hojas += Number(ent.hojas) || 0;
        kgPapelActas += x.cantidad || 0;
        var T = Number(ent.turnos);
        escenario10 += T > 0 ? x.kgCO2e * 10 / T : x.kgCO2e;
      } else {
        var k = String(x.edificioId);
        porEdificio[k] = porEdificio[k] || { papelHig: 0, jabon: 0, nombre: ent.edificio || ('Edificio ' + k) };
        porEdificio[k][x.rubro] += x.kgCO2e;
        if (x.rubro === 'papelHig') banos += Number(ent.banos) || 0;
        if (x.rubro === 'jabon') unidadesJabon[x.unidad] = true;
      }
    });

    var total = porRubro.actas + porRubro.papelHig + porRubro.jabon;
    var higiene = porRubro.papelHig + porRubro.jabon;
    return {
      cantidadRegistros: r.length,
      totalKg: total,
      totalT: total / 1000,
      porRubro: porRubro,
      conteo: conteo,
      cantidades: cantidades,
      unidadesJabon: Object.keys(unidadesJabon),
      factores: factores,
      porDepto: porDepto,
      porEdificio: porEdificio,
      catedras: catedras,
      banos: banos,
      hojas: hojas,
      kgPapelActas: kgPapelActas,
      kgPorCatedra: catedras > 0 ? porRubro.actas / catedras : null,
      kgPorBano: banos > 0 ? higiene / banos : null,
      actasCon10Turnos: escenario10,
      duplicados: duplicados
    };
  }

  /**
   * Totales por período y rubro para la evolución temporal.
   * Un rubro sin registros en un período queda en null (no cargado), no en 0.
   */
  function evolucion(registros, periodos) {
    return periodos.map(function (p) {
      var a = agregar(registros, p.id);
      var valores = {};
      Object.keys(a.porRubro).forEach(function (k) { valores[k] = a.conteo[k] ? a.porRubro[k] : null; });
      return { periodo: p, total: a.totalKg, porRubro: valores, registros: a.cantidadRegistros };
    }).filter(function (x) { return x.registros > 0; });
  }

  var api = {
    fmt: fmt,
    redondear: redondear,
    claveUnidadFactor: claveUnidadFactor,
    normalizarFactor: normalizarFactor,
    cantidadEnUnidadDelFactor: cantidadEnUnidadDelFactor,
    calcularActas: calcularActas,
    calcularHigiene: calcularHigiene,
    agregar: agregar,
    evolucion: evolucion
  };

  global.CampusCO2 = global.CampusCO2 || {};
  global.CampusCO2.calculo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
