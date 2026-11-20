/*
 * Pruebas del módulo de cálculo y de las validaciones.
 * Correr con:  node tests/calculo.test.js
 * Usa el caso de prueba de la sección 8.3 (valores ficticios).
 */
'use strict';
var assert = require('assert');
var calc = require('../js/calculo.js');
var val = require('../js/validacion.js');

var casos = 0;
function caso(nombre, fn) {
  fn();
  casos++;
  console.log('  ok  ' + nombre);
}
function cerca(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' esperaba ' + b + ', dio ' + a);
}

var papelKg = { id: 1, bien: 'papel', valor: 1.2, unidad: 'kg CO2e/kg', fuente: 'prueba', anio: 2026 };
var papelT = { id: 2, bien: 'papel', valor: 1200, unidad: 'kg CO2e/t', fuente: 'prueba', anio: 2026 };
var jabonKg = { id: 3, bien: 'jabon liquido', valor: 2, unidad: 'kg CO2e/kg', fuente: 'prueba', anio: 2026 };
var jabonL = { id: 4, bien: 'jabon liquido', valor: 2, unidad: 'kg CO2e/L', fuente: 'prueba', anio: 2026 };

console.log('Cálculo');

caso('Sección 8.3: 10 cátedras × 7 turnos × 3 hojas = 210 hojas = 1,05 kg', function () {
  var r = calc.calcularActas({ departamento: 'Prueba', catedras: 10, turnos: 7, hojasPorActa: 3, pesoHojaKg: 0.005 }, papelKg);
  assert.strictEqual(r.hojas, 210);
  cerca(r.cantidad, 1.05);
  cerca(r.kgCO2e, 1.05 * 1.2, 'E_A');
  cerca(r.tCO2e, 1.05 * 1.2 / 1000, 't');
  assert.deepStrictEqual(r.traza.formulas, ['(1)', '(2)', '(3)']);
  assert.strictEqual(r.traza.entradas.hojas, 210);
});

caso('Factor en kg CO2e/t se divide por 1000 (Tabla 11)', function () {
  var a = calc.calcularActas({ departamento: 'X', catedras: 10, turnos: 7, hojasPorActa: 3, pesoHojaKg: 0.005 }, papelKg);
  var b = calc.calcularActas({ departamento: 'X', catedras: 10, turnos: 7, hojasPorActa: 3, pesoHojaKg: 0.005 }, papelT);
  cerca(a.kgCO2e, b.kgCO2e);
  assert.ok(b.traza.conversiones.some(function (c) { return c.indexOf('÷ 1.000') !== -1; }), 'la conversión queda en la trazabilidad');
});

caso('Higiene: baños = plantas × baños por planta, fórmulas (4) a (6)', function () {
  var r = calc.calcularHigiene({ edificioId: 1, edificio: 'Edificio 1', plantas: 3, banosPorPlanta: 2, consumoPH: 20, consumoJabon: 10, unidadJabon: 'kg', densidadJabon: 1 }, papelKg, jabonKg);
  assert.strictEqual(r.banos, 6);
  cerca(r.papelHig.cantidad, 120);
  cerca(r.papelHig.kgCO2e, 144);
  cerca(r.jabon.cantidad, 60);
  cerca(r.jabon.kgCO2e, 120);
  cerca(r.kgCO2e, 264);
});

caso('Jabón en litros con factor por kg usa la densidad', function () {
  var r = calc.calcularHigiene({ edificioId: 1, edificio: 'E', plantas: 1, banosPorPlanta: 2, consumoPH: 1, consumoJabon: 10, unidadJabon: 'L', densidadJabon: 1.05 }, papelKg, jabonKg);
  cerca(r.jabon.cantidad, 20);           // se guarda en litros, como se cargó
  cerca(r.jabon.kgCO2e, 20 * 1.05 * 2);  // 21 kg × 2
});

caso('Jabón en litros con factor por litro no usa la densidad', function () {
  var r = calc.calcularHigiene({ edificioId: 1, edificio: 'E', plantas: 1, banosPorPlanta: 2, consumoPH: 1, consumoJabon: 10, unidadJabon: 'L', densidadJabon: 1.05 }, papelKg, jabonL);
  cerca(r.jabon.kgCO2e, 40);
  assert.strictEqual(r.jabon.traza.conversiones.length, 0);
});

caso('Unidad de factor desconocida da error claro', function () {
  assert.throws(function () { calc.normalizarFactor({ valor: 1, unidad: 'kWh' }); }, /no reconocida/);
});

caso('Indicadores: kg por cátedra, kg por baño y escenario de 10 turnos (+43%)', function () {
  var a = calc.calcularActas({ departamento: 'A', catedras: 10, turnos: 7, hojasPorActa: 3, pesoHojaKg: 0.005 }, papelKg);
  var h = calc.calcularHigiene({ edificioId: 1, edificio: 'E1', plantas: 3, banosPorPlanta: 2, consumoPH: 20, consumoJabon: 10, unidadJabon: 'kg', densidadJabon: 1 }, papelKg, jabonKg);
  var regs = [
    { periodoId: 2, rubro: 'actas', departamento: 'A', cantidad: a.cantidad, kgCO2e: a.kgCO2e, traza: a.traza },
    { periodoId: 2, rubro: 'papelHig', edificioId: 1, cantidad: h.papelHig.cantidad, kgCO2e: h.papelHig.kgCO2e, traza: h.papelHig.traza },
    { periodoId: 2, rubro: 'jabon', edificioId: 1, cantidad: h.jabon.cantidad, unidad: 'kg', kgCO2e: h.jabon.kgCO2e, traza: h.jabon.traza },
    { periodoId: 1, rubro: 'actas', departamento: 'A', cantidad: 1, kgCO2e: 999, traza: a.traza }
  ];
  var g = calc.agregar(regs, 2);
  cerca(g.totalKg, a.kgCO2e + 264);
  cerca(g.kgPorCatedra, a.kgCO2e / 10);
  cerca(g.kgPorBano, 264 / 6);
  cerca(g.actasCon10Turnos / a.kgCO2e, 10 / 7);
  assert.strictEqual(g.duplicados.length, 0);
  var dup = calc.agregar(regs.concat([regs[0]]), 2);
  assert.strictEqual(dup.duplicados.length, 1);
});

console.log('Validaciones');

caso('Acepta coma y punto decimal', function () {
  assert.strictEqual(val.parseNumero('0,005'), 0.005);
  assert.strictEqual(val.parseNumero('0.005'), 0.005);
  assert.strictEqual(val.parseNumero('1.234,5'), 1234.5);
  assert.strictEqual(val.parseNumero(''), null);
  assert.ok(isNaN(val.parseNumero('abc')));
});

caso('Reglas de la Tabla 9', function () {
  var r = val.reglas;
  assert.ok(val.validarNumero('', r.catedras).error, 'obligatorio');
  assert.ok(val.validarNumero('-1', r.catedras).error, 'no negativo');
  assert.ok(val.validarNumero('2,5', r.catedras).error, 'entero');
  assert.strictEqual(val.validarNumero('0', r.catedras).error, null, 'cátedras admite 0');
  assert.ok(val.validarNumero('0', r.turnos).error, 'turnos >= 1');
  assert.ok(val.validarNumero('0', r.pesoHojaKg).error, 'peso > 0');
  assert.strictEqual(val.validarNumero('0,005', r.pesoHojaKg).valor, 0.005);
  assert.ok(val.validarNumero('0', r.plantas).error, 'plantas >= 1');
  assert.strictEqual(val.validarNumero('0', r.banosPorPlanta).error, null, 'baños por planta admite 0');
});

console.log('\n' + casos + ' pruebas pasaron.');
