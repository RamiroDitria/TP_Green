/*
 * Interfaz del módulo: carga (componente 4), flujo con la API (5),
 * cálculo en vivo (6) y visualización (7).
 */
(function () {
  'use strict';

  const C = window.CampusCO2;
  const cfg = C.config;
  const api = C.api;
  const calc = C.calculo;
  const val = C.validacion;
  const graf = C.graficos;
  const fmt = calc.fmt;
  const esc = graf.esc;
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const BIENES = { papel: cfg.rubros.actas.bien, jabon: cfg.rubros.jabon.bien };
  const NOMBRE_BIEN = { papel: 'Papel', jabon: 'Jabón líquido' };
  const USO_BIEN = { papel: 'Actas de examen y papel higiénico', jabon: 'Jabón líquido de los baños' };
  const COLOR = { actas: 'var(--serie-1)', papelHig: 'var(--serie-2)', jabon: 'var(--serie-3)' };
  const COLOR_HEX = { actas: '#2a78d6', papelHig: '#eb6834', jabon: '#1baf7a' };

  const estado = {
    catalogos: { periodos: [], edificios: [], unidades: [], fuentes: [], origen: 'respaldo' },
    conexion: 'pendiente',          // ok | error | sin-configurar | pendiente
    errorConexion: null,
    factores: { papel: { estado: 'cargando' }, jabon: { estado: 'cargando' } },
    registros: [],
    formActivo: 'actas',
    enviando: false
  };

  // ======================================================================
  // Utilidades
  // ======================================================================

  function guardarLocal(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin storage */ } }
  function leerLocal(clave, defecto) { try { const v = JSON.parse(localStorage.getItem(clave)); return v === null ? defecto : v; } catch (e) { return defecto; } }

  let toastTimer;
  function toast(texto, tipo) {
    const t = $('#toast');
    t.textContent = texto;
    t.dataset.tipo = tipo || 'ok';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, tipo === 'error' ? 9000 : 5000);
  }

  function periodoPorId(id) { return estado.catalogos.periodos.find((p) => String(p.id) === String(id)) || null; }
  function edificioPorId(id) { return estado.catalogos.edificios.find((e) => String(e.id) === String(id)) || null; }
  function fuentePorId(id) { return estado.catalogos.fuentes.find((f) => String(f.id) === String(id)) || null; }

  function buscarUnidad(codigo) {
    const objetivos = codigo === 'kg' ? ['kg', 'kilogramo', 'kilogramos'] : ['l', 'litro', 'litros'];
    return estado.catalogos.unidades.find((u) => objetivos.includes(api.sinAcentos(u.codigo)) || objetivos.includes(api.sinAcentos(u.nombre))) || null;
  }

  function opciones(lista, valorDe, textoDe, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
      lista.map((x) => '<option value="' + esc(valorDe(x)) + '">' + esc(textoDe(x)) + '</option>').join('');
  }

  function fechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function textoFactor(f) {
    return fmt(f.valor) + ' ' + f.unidad;
  }

  // ======================================================================
  // Pestañas
  // ======================================================================

  function iniciarPestanas() {
    const tabs = $$('.pestanas [role="tab"]');
    function activar(tab, enfocar) {
      tabs.forEach((t) => {
        const activa = t === tab;
        t.setAttribute('aria-selected', String(activa));
        t.tabIndex = activa ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !activa;
      });
      if (enfocar) tab.focus();
      const nombre = tab.id.replace('tab-', '');
      if (location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre);
      if (nombre === 'resultados') renderResultados();
      if (nombre === 'registros') renderRegistros();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => activar(t));
      t.addEventListener('keydown', (ev) => {
        let n = null;
        if (ev.key === 'ArrowRight') n = (i + 1) % tabs.length;
        if (ev.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        if (ev.key === 'Home') n = 0;
        if (ev.key === 'End') n = tabs.length - 1;
        if (n !== null) { ev.preventDefault(); activar(tabs[n], true); }
      });
    });
    const inicial = tabs.find((t) => '#' + t.id.replace('tab-', '') === location.hash);
    if (inicial) activar(inicial);
    C.irA = (nombre) => activar($('#tab-' + nombre), true);
  }

  // ======================================================================
  // Conexión y catálogos
  // ======================================================================

  // La API de prueba local (mock-api, en localhost) no es la API central de la cátedra:
  // se detecta por la dirección para no mostrarla como si lo fuera.
  function esSimulada() { return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(api.baseUrl()); }
  function nombreApi() { return esSimulada() ? 'API simulada' : 'API central'; }

  function pintarEstadoConexion() {
    const el = $('#estadoApi');
    el.dataset.estado = estado.conexion;
    const textos = {
      pendiente: 'Revisando la conexión…',
      ok: esSimulada() ? 'API simulada conectada (factores de prueba)' : 'API central conectada',
      error: 'Sin respuesta de la API',
      'sin-configurar': 'API sin configurar'
    };
    $('#estadoApiTexto').textContent = textos[estado.conexion];
    el.title = estado.conexion === 'ok' ? api.baseUrl() : (estado.errorConexion || '');

    const aviso = $('#avisoGlobal');
    if (estado.conexion === 'sin-configurar') {
      aviso.innerHTML = '<p>Falta la dirección de la API central. Podés completar los formularios y ver el cálculo con un factor cargado a mano, pero no se envía nada hasta conectarla. <button type="button" class="enlace" data-ir="conexion">Cargar la dirección</button></p>';
      aviso.hidden = false;
    } else if (estado.conexion === 'error') {
      aviso.innerHTML = '<p>' + esc(estado.errorConexion) + ' Lo que cargues queda guardado en este navegador y no se envía hasta que la API responda. <button type="button" class="enlace" data-ir="conexion">Revisar la conexión</button></p>';
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
  }

  async function conectar() {
    estado.conexion = 'pendiente';
    pintarEstadoConexion();
    if (!api.estaConfigurada()) {
      estado.conexion = 'sin-configurar';
      usarCatalogosRespaldo();
    } else {
      try {
        estado.catalogos = await api.obtenerCatalogos();
        if (!estado.catalogos.periodos.length) throw new api.ApiError('La API no devolvió períodos.');
        estado.conexion = 'ok';
        estado.errorConexion = null;
      } catch (err) {
        estado.conexion = 'error';
        estado.errorConexion = err.message;
        usarCatalogosRespaldo();
      }
    }
    pintarEstadoConexion();
    pintarCatalogos();
    await Promise.all([cargarFactores(), cargarRegistros()]);
  }

  function usarCatalogosRespaldo() {
    estado.catalogos = {
      periodos: cfg.respaldo.periodos.slice(),
      edificios: cfg.respaldo.edificios.slice(),
      unidades: [],
      fuentes: [],
      origen: 'respaldo'
    };
    estado.registros = [];
  }

  function pintarCatalogos() {
    const cat = estado.catalogos;
    const anioActual = new Date().getFullYear();
    const defecto = (cat.periodos.find((p) => p.anio === anioActual) || cat.periodos[cat.periodos.length - 1] || {}).id;
    const borr = leerLocal(cfg.storage.borradores, {});

    const selPeriodo = $('#periodo');
    selPeriodo.innerHTML = opciones(cat.periodos, (p) => p.id, (p) => p.nombre, 'Elegí un período');
    selPeriodo.value = borr.periodo && periodoPorId(borr.periodo) ? borr.periodo : (defecto !== undefined ? defecto : '');

    $('#resPeriodo').innerHTML = opciones(cat.periodos, (p) => p.id, (p) => p.nombre);
    $('#resPeriodo').value = selPeriodo.value;
    $('#regPeriodo').innerHTML = '<option value="">Todos</option>' + opciones(cat.periodos, (p) => p.id, (p) => p.nombre);

    const sinFuentes = cat.fuentes.length ? 'Elegí la fuente' : 'Sin catálogo (falta la API)';
    ['#fuenteActas', '#fuenteHigiene'].forEach((s) => {
      $(s).innerHTML = opciones(cat.fuentes, (f) => f.id, (f) => f.nombre, sinFuentes);
    });
    $('#fuenteActas').value = borr.actas && borr.actas.fuente ? borr.actas.fuente : '';
    $('#fuenteHigiene').value = borr.higiene && borr.higiene.fuente ? borr.higiene.fuente : '';

    pintarFilasHigiene();
    recalcular();
  }

  // ======================================================================
  // Factores de emisión
  // ======================================================================

  function claveManual(bien, anio) { return bien + '|' + anio; }

  function factorManual(bien, anio) {
    const m = leerLocal(cfg.storage.factoresManuales, {});
    return m[claveManual(bien, anio)] || null;
  }

  function anioPeriodo() {
    const p = periodoPorId($('#periodo').value);
    return p ? p.anio : null;
  }

  async function cargarFactores() {
    const anio = anioPeriodo();
    for (const bien of ['papel', 'jabon']) estado.factores[bien] = { estado: 'cargando' };
    pintarFactores();
    if (!anio) { for (const bien of ['papel', 'jabon']) estado.factores[bien] = { estado: 'sin-periodo' }; pintarFactores(); recalcular(); return; }

    await Promise.all(['papel', 'jabon'].map(async (bien) => {
      const manual = factorManual(bien, anio);
      if (estado.conexion !== 'ok') {
        estado.factores[bien] = manual ? { estado: 'manual', factor: manual } : { estado: 'sin-api' };
        return;
      }
      try {
        const r = await api.obtenerFactor(BIENES[bien], anio);
        if (r.factor) estado.factores[bien] = { estado: 'ok', factor: r.factor, nota: r.nota };
        else estado.factores[bien] = manual ? { estado: 'manual', factor: manual } : { estado: 'falta' };
      } catch (err) {
        if (err.status === 0) { estado.conexion = 'error'; estado.errorConexion = err.message; }
        estado.factores[bien] = manual ? { estado: 'manual', factor: manual, error: err.message } : { estado: 'error', error: err.message };
      }
    }));
    pintarEstadoConexion();
    pintarFactores();
    recalcular();
  }

  /** Factor que se usa para el cálculo en pantalla (API o manual). */
  function factorVigente(bien) {
    const f = estado.factores[bien];
    return f && (f.estado === 'ok' || f.estado === 'manual') ? f.factor : null;
  }

  function pintarFactores() {
    const anio = anioPeriodo();
    $('#factores').innerHTML = ['papel', 'jabon'].map((bien) => {
      const f = estado.factores[bien];
      let origen = '', cuerpo = '', est = f.estado;
      if (f.estado === 'cargando') {
        origen = 'Consultando…';
        cuerpo = '<p class="factor-detalle">Pidiendo el factor a la API.</p>';
      } else if (f.estado === 'sin-periodo') {
        origen = '';
        cuerpo = '<p class="factor-detalle">Elegí un período para consultar el factor.</p>';
      } else if (f.estado === 'ok') {
        origen = nombreApi() + (f.factor.anio ? ', ' + f.factor.anio : '');
        cuerpo = '<p class="factor-valor">' + esc(textoFactor(f.factor)) + '</p>' +
          '<p class="factor-detalle">' + (f.factor.fuente ? 'Fuente: ' + esc(f.factor.fuente) + '. ' : '') + esc(USO_BIEN[bien]) + '.</p>' +
          (f.nota ? '<p class="factor-detalle">' + esc(f.nota) + '</p>' : '');
      } else if (f.estado === 'manual') {
        origen = 'Cargado a mano';
        cuerpo = '<p class="factor-valor">' + esc(textoFactor(f.factor)) + '</p>' +
          '<p class="factor-detalle">Supuesto: ' + esc(f.factor.fuente) + ', ' + esc(f.factor.anio) + '. ' +
          '<button type="button" class="enlace" data-quitar-manual="' + bien + '">Quitar</button></p>';
      } else {
        const motivo = {
          falta: 'La API no tiene este factor para ' + anio + '.',
          error: 'No se pudo consultar: ' + (f.error || 'error de la API').replace(/\.+$/, '') + '.',
          'sin-api': 'Sin API no se puede consultar el factor.'
        }[f.estado];
        origen = f.estado === 'falta' ? 'No está en la API' : 'Sin dato';
        est = f.estado === 'error' ? 'error' : 'falta';
        cuerpo = '<p class="factor-detalle">' + esc(motivo) + '</p>' +
          '<details class="factor-mano"><summary>Cargar el factor a mano</summary>' +
          '<p class="factor-detalle">Con su fuente y año. Queda declarado como supuesto en la trazabilidad.</p>' +
          formManual(bien, anio) + '</details>';
      }
      return '<div class="factor" data-estado="' + est + '">' +
        '<div class="factor-cabecera"><span class="factor-nombre">Factor del ' + (bien === 'papel' ? 'papel' : 'jabón líquido') + '</span><span class="factor-origen">' + esc(origen) + '</span></div>' +
        cuerpo + '</div>';
    }).join('');
  }

  function formManual(bien, anio) {
    const unidades = ['kg CO2e/kg', 'kg CO2e/t'].concat(bien === 'jabon' ? ['kg CO2e/L'] : []);
    return '<form class="factor-manual" data-bien="' + bien + '" novalidate>' +
      '<div class="campo"><label for="fm-valor-' + bien + '">Valor</label><input id="fm-valor-' + bien + '" name="valor" inputmode="decimal" autocomplete="off"></div>' +
      '<div class="campo"><label for="fm-unidad-' + bien + '">Unidad</label><select id="fm-unidad-' + bien + '" name="unidad">' + unidades.map((u) => '<option>' + u + '</option>').join('') + '</select></div>' +
      '<div class="campo ancho"><label for="fm-fuente-' + bien + '">Fuente</label><input id="fm-fuente-' + bien + '" name="fuente" autocomplete="off" placeholder="Autor, documento o base de datos"></div>' +
      '<div class="campo"><label for="fm-anio-' + bien + '">Año del factor</label><input id="fm-anio-' + bien + '" name="anio" inputmode="numeric" value="' + esc(anio || '') + '"></div>' +
      '<div class="campo" style="justify-content:flex-end"><button class="btn btn-secundario btn-chico" type="submit">Usar este factor</button></div>' +
      '<p class="error ancho" data-error-manual></p>' +
      '</form>';
  }

  function iniciarFactorManual() {
    $('#factores').addEventListener('submit', (ev) => {
      const form = ev.target.closest('.factor-manual');
      if (!form) return;
      ev.preventDefault();
      const bien = form.dataset.bien;
      const valor = val.validarNumero(form.valor.value, { requerido: true });
      const anio = val.validarNumero(form.anio.value, { requerido: true, entero: true, min: 1990 });
      const fuente = form.fuente.value.trim();
      const err = valor.error ? 'Valor: ' + valor.error : !fuente ? 'Indicá la fuente del factor.' : anio.error ? 'Año: ' + anio.error : null;
      if (err) { $('[data-error-manual]', form).textContent = err; return; }
      const factor = { id: null, bien: BIENES[bien], valor: valor.valor, unidad: form.unidad.value, fuente: fuente, anio: anio.valor, origen: 'manual (supuesto)' };
      const todos = leerLocal(cfg.storage.factoresManuales, {});
      todos[claveManual(bien, anioPeriodo())] = factor;
      guardarLocal(cfg.storage.factoresManuales, todos);
      estado.factores[bien] = { estado: 'manual', factor: factor };
      pintarFactores();
      recalcular();
    });
    $('#factores').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-quitar-manual]');
      if (!b) return;
      const todos = leerLocal(cfg.storage.factoresManuales, {});
      delete todos[claveManual(b.dataset.quitarManual, anioPeriodo())];
      guardarLocal(cfg.storage.factoresManuales, todos);
      cargarFactores();
    });
  }

  // ======================================================================
  // Formularios: armado y borradores
  // ======================================================================

  function pintarFilasActas() {
    $('#filasActas').innerHTML = cfg.departamentos.map((d, i) =>
      '<tr data-depto="' + esc(d) + '">' +
      '<th scope="row">' + esc(d) + '<span class="marca-cargado" hidden>ya cargado</span></th>' +
      '<td class="num"><input id="cat-' + i + '" data-campo="catedras" inputmode="numeric" autocomplete="off" aria-label="Cátedras de ' + esc(d) + '" aria-describedby="cat-' + i + '-error">' +
      '<span class="err-celda" id="cat-' + i + '-error"></span></td>' +
      '<td class="num calc" data-hojas>—</td>' +
      '<td class="num calc" data-kg>—</td>' +
      '</tr>').join('');
    $('#calidadActas').innerHTML = opciones(cfg.calidades, (c) => c, (c) => c, 'Elegí la calidad');
  }

  function pintarFilasHigiene() {
    const borr = (leerLocal(cfg.storage.borradores, {}).higiene || {}).filas || {};
    $('#filasHigiene').innerHTML = estado.catalogos.edificios.map((e, i) => {
      const b = borr[e.id] || {};
      return '<tr data-edificio="' + esc(e.id) + '">' +
        '<th scope="row">' + esc(e.nombre) + '<span class="marca-cargado" hidden>ya cargado</span></th>' +
        '<td class="num"><input id="pl-' + i + '" data-campo="plantas" inputmode="numeric" autocomplete="off" value="' + esc(b.plantas || '') + '" aria-label="Plantas de ' + esc(e.nombre) + '" aria-describedby="pl-' + i + '-error"><span class="err-celda" id="pl-' + i + '-error"></span></td>' +
        '<td class="num"><input id="bp-' + i + '" data-campo="banosPorPlanta" inputmode="numeric" autocomplete="off" value="' + esc(b.banosPorPlanta || '') + '" aria-label="Baños por planta de ' + esc(e.nombre) + '" aria-describedby="bp-' + i + '-error"><span class="err-celda" id="bp-' + i + '-error"></span></td>' +
        '<td class="num calc" data-banos>—</td>' +
        '<td><select id="cal-' + i + '" data-campo="calidad" aria-label="Calidad del dato de ' + esc(e.nombre) + '" aria-describedby="cal-' + i + '-error">' + opciones(cfg.calidades, (c) => c, (c) => c, 'Elegí') + '</select><span class="err-celda" id="cal-' + i + '-error" style="text-align:left"></span></td>' +
        '<td class="num calc" data-kg>—</td>' +
        '</tr>';
    }).join('');
    $$('#filasHigiene tr').forEach((tr) => {
      const b = borr[tr.dataset.edificio] || {};
      if (b.calidad) $('[data-campo="calidad"]', tr).value = b.calidad;
    });
    marcarYaCargados();
  }

  function restaurarBorradores() {
    const s = cfg.sugeridos;
    const b = leerLocal(cfg.storage.borradores, {});
    const a = b.actas || {};
    $('#turnos').value = a.turnos !== undefined ? a.turnos : s.turnos;
    $('#hojasPorActa').value = a.hojasPorActa !== undefined ? a.hojasPorActa : s.hojasPorActa;
    $('#pesoHojaKg').value = a.pesoHojaKg !== undefined ? a.pesoHojaKg : fmt(s.pesoHojaKg);
    $('#calidadActas').value = a.calidad || '';
    $$('#filasActas tr').forEach((tr) => { $('input', tr).value = (a.filas || {})[tr.dataset.depto] || ''; });
    const h = b.higiene || {};
    $('#consumoPH').value = h.consumoPH || '';
    $('#consumoJabon').value = h.consumoJabon || '';
    $('#unidadJabon').value = h.unidadJabon || 'kg';
    $('#densidadJabon').value = h.densidadJabon !== undefined ? h.densidadJabon : fmt(s.densidadJabon);
    $('#campoDensidad').hidden = $('#unidadJabon').value !== 'L';
    if (b.formActivo) elegirForm(b.formActivo);
  }

  function guardarBorradores() {
    const filasA = {};
    $$('#filasActas tr').forEach((tr) => { const v = $('input', tr).value.trim(); if (v) filasA[tr.dataset.depto] = v; });
    const filasH = {};
    $$('#filasHigiene tr').forEach((tr) => {
      const g = (c) => $('[data-campo="' + c + '"]', tr).value.trim();
      if (g('plantas') || g('banosPorPlanta') || g('calidad')) filasH[tr.dataset.edificio] = { plantas: g('plantas'), banosPorPlanta: g('banosPorPlanta'), calidad: g('calidad') };
    });
    guardarLocal(cfg.storage.borradores, {
      periodo: $('#periodo').value,
      formActivo: estado.formActivo,
      actas: { turnos: $('#turnos').value, hojasPorActa: $('#hojasPorActa').value, pesoHojaKg: $('#pesoHojaKg').value, fuente: $('#fuenteActas').value, calidad: $('#calidadActas').value, filas: filasA },
      higiene: { consumoPH: $('#consumoPH').value, consumoJabon: $('#consumoJabon').value, unidadJabon: $('#unidadJabon').value, densidadJabon: $('#densidadJabon').value, fuente: $('#fuenteHigiene').value, filas: filasH }
    });
  }

  function elegirForm(nombre) {
    estado.formActivo = nombre;
    $$('.selector-form .opcion').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.form === nombre)));
    $('#formActas').hidden = nombre !== 'actas';
    $('#formHigiene').hidden = nombre !== 'higiene';
    $('#sello').hidden = true;
    recalcular();
  }

  function vaciar(nombre) {
    const s = cfg.sugeridos;
    if (nombre === 'actas') {
      $$('#filasActas input').forEach((i) => { i.value = ''; });
      $('#turnos').value = s.turnos; $('#hojasPorActa').value = s.hojasPorActa; $('#pesoHojaKg').value = fmt(s.pesoHojaKg);
      $('#calidadActas').value = ''; $('#fuenteActas').value = '';
      limpiarErrores($('#formActas'));
    } else {
      $$('#filasHigiene input').forEach((i) => { i.value = ''; });
      $$('#filasHigiene select').forEach((i) => { i.value = ''; });
      $('#consumoPH').value = ''; $('#consumoJabon').value = ''; $('#unidadJabon').value = 'kg';
      $('#densidadJabon').value = fmt(s.densidadJabon); $('#campoDensidad').hidden = true; $('#fuenteHigiene').value = '';
      limpiarErrores($('#formHigiene'));
    }
    $('#sello').hidden = true;
    guardarBorradores();
    recalcular();
  }

  // ======================================================================
  // Validación (Tabla 9, sección 6.3)
  // ======================================================================

  function ponerError(input, mensaje) {
    const id = input.getAttribute('aria-describedby') ? input.getAttribute('aria-describedby').split(' ').find((x) => x.endsWith('-error')) : null;
    const el = id ? document.getElementById(id) : null;
    if (mensaje) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (el) el.textContent = mensaje || '';
  }

  function limpiarErrores(form) {
    $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
    $$('.error, .err-celda', form).forEach((e) => { e.textContent = ''; });
    $('#periodo').removeAttribute('aria-invalid');
    $('#periodo-error').textContent = '';
  }

  /** Lee y valida el formulario de actas. mostrar = true pinta los errores. */
  function leerActas(mostrar) {
    const errores = [];
    const chequear = (input, regla) => {
      const r = val.validarNumero(input.value, regla);
      if (mostrar) ponerError(input, r.error);
      if (r.error) errores.push(input);
      return r.valor;
    };
    const chequearSel = (input, etiqueta) => {
      const r = val.validarSeleccion(input.value, etiqueta);
      if (mostrar) ponerError(input, r.error);
      if (r.error) errores.push(input);
      return r.valor;
    };
    const periodo = chequearSel($('#periodo'), 'un período');
    const turnos = chequear($('#turnos'), val.reglas.turnos);
    const hojasPorActa = chequear($('#hojasPorActa'), val.reglas.hojasPorActa);
    const pesoHojaKg = chequear($('#pesoHojaKg'), val.reglas.pesoHojaKg);
    const fuente = chequearSel($('#fuenteActas'), 'la fuente');
    const calidad = chequearSel($('#calidadActas'), 'la calidad del dato');

    const filas = [];
    const filasConError = [];
    $$('#filasActas tr').forEach((tr) => {
      const input = $('input', tr);
      if (input.value.trim() === '') { if (mostrar) ponerError(input, null); return; }
      const r = val.validarNumero(input.value, val.reglas.catedras);
      if (mostrar) ponerError(input, r.error);
      if (r.error) { errores.push(input); filasConError.push(tr); return; }
      filas.push({ departamento: tr.dataset.depto, catedras: r.valor, tr: tr });
    });
    if (mostrar) $('#filasActas-error').textContent = !filas.length && !filasConError.length ? 'Cargá las cátedras de al menos un departamento.' : '';
    if (!filas.length && !filasConError.length) errores.push($('#filasActas input'));

    return { ok: errores.length === 0, errores, periodo, turnos, hojasPorActa, pesoHojaKg, fuente, calidad, filas };
  }

  function leerHigiene(mostrar) {
    const errores = [];
    const chequear = (input, regla) => {
      const r = val.validarNumero(input.value, regla);
      if (mostrar) ponerError(input, r.error);
      if (r.error) errores.push(input);
      return r.valor;
    };
    const chequearSel = (input, etiqueta) => {
      const r = val.validarSeleccion(input.value, etiqueta);
      if (mostrar) ponerError(input, r.error);
      if (r.error) errores.push(input);
      return r.valor;
    };
    const periodo = chequearSel($('#periodo'), 'un período');
    const consumoPH = chequear($('#consumoPH'), val.reglas.consumoPH);
    const consumoJabon = chequear($('#consumoJabon'), val.reglas.consumoJabon);
    const unidadJabon = $('#unidadJabon').value;
    let densidadJabon = cfg.sugeridos.densidadJabon;
    if (unidadJabon === 'L') densidadJabon = chequear($('#densidadJabon'), val.reglas.densidadJabon);
    else if (mostrar) ponerError($('#densidadJabon'), null);
    const fuente = chequearSel($('#fuenteHigiene'), 'la fuente');

    const filas = [];
    let filasTocadas = 0;
    $$('#filasHigiene tr').forEach((tr) => {
      const pl = $('[data-campo="plantas"]', tr), bp = $('[data-campo="banosPorPlanta"]', tr), cal = $('[data-campo="calidad"]', tr);
      if (pl.value.trim() === '' && bp.value.trim() === '') {
        if (mostrar) { ponerError(pl, null); ponerError(bp, null); ponerError(cal, null); }
        return;
      }
      filasTocadas++;
      const antes = errores.length;
      const plantas = chequear(pl, val.reglas.plantas);
      const banosPorPlanta = chequear(bp, val.reglas.banosPorPlanta);
      const calidad = chequearSel(cal, 'la calidad');
      if (errores.length === antes) {
        const e = edificioPorId(tr.dataset.edificio);
        filas.push({ edificioId: e.id, edificio: e.nombre, plantas, banosPorPlanta, calidad, tr });
      }
    });
    if (mostrar) $('#filasHigiene-error').textContent = filasTocadas === 0 ? 'Cargá las plantas y los baños de al menos un edificio.' : '';
    if (filasTocadas === 0) { const i = $('#filasHigiene input'); if (i) errores.push(i); }

    return { ok: errores.length === 0, errores, periodo, consumoPH, consumoJabon, unidadJabon, densidadJabon, fuente, filas };
  }

  // ======================================================================
  // Cálculo en vivo y comprobante
  // ======================================================================

  function recalcular() {
    if (estado.formActivo === 'actas') recalcularActas(); else recalcularHigiene();
  }

  function recalcularActas() {
    const v = leerActas(false);
    const f = factorVigente('papel');
    const params = v.turnos !== null && v.hojasPorActa !== null && v.pesoHojaKg !== null;
    let totCat = 0, totHojas = 0, totKgPapel = 0, totE = 0, n = 0;
    $$('#filasActas tr').forEach((tr) => { $('[data-hojas]', tr).textContent = '—'; $('[data-kg]', tr).textContent = '—'; });
    v.filas.forEach((fila) => {
      totCat += fila.catedras;
      if (!params) return;
      const hojas = fila.catedras * v.turnos * v.hojasPorActa;
      totHojas += hojas;
      totKgPapel += hojas * v.pesoHojaKg;
      $('[data-hojas]', fila.tr).textContent = fmt(hojas);
      n++;
      if (f) {
        try {
          const r = calc.calcularActas({ departamento: fila.departamento, catedras: fila.catedras, turnos: v.turnos, hojasPorActa: v.hojasPorActa, pesoHojaKg: v.pesoHojaKg }, f);
          totE += r.kgCO2e;
          $('[data-kg]', fila.tr).textContent = fmt(r.kgCO2e);
        } catch (e) { /* unidad inválida: se informa en el comprobante */ }
      }
    });
    $('#totCatedras').textContent = fmt(totCat);
    $('#totHojas').textContent = params ? fmt(totHojas) : '—';
    $('#totKgActas').textContent = f && n ? fmt(totE) : '—';

    // Comprobante
    const p = periodoPorId(v.periodo);
    $('#compSub').textContent = 'Rubro A, actas de examen. Período ' + (p ? p.nombre : 'sin elegir') + '.';
    const pasos = [];
    if (!v.filas.length || !params) {
      pasos.push('<li><span class="vacio">' + (!params ? 'Completá turnos, hojas por acta y peso por hoja.' : 'Cargá las cátedras de al menos un departamento.') + '</span></li>');
    } else {
      pasos.push(paso('(1)', 'Hojas = Σ Cd × T × H', '= ' + fmt(totCat) + ' × ' + fmt(v.turnos) + ' × ' + fmt(v.hojasPorActa) + ' = ' + fmt(totHojas) + ' hojas', n + (n === 1 ? ' departamento' : ' departamentos')));
      pasos.push(paso('(2)', 'Papel = Hojas × m', '= ' + fmt(totHojas) + ' × ' + fmt(v.pesoHojaKg) + ' kg = ' + fmt(totKgPapel) + ' kg'));
      if (f) {
        let nf;
        try { nf = calc.normalizarFactor(f); } catch (e) { nf = null; pasos.push('<li><span class="vacio">' + esc(e.message) + '</span></li>'); }
        if (nf) pasos.push(paso('(3)', 'E_A = Papel × FE papel', '= ' + fmt(totKgPapel) + ' kg × ' + fmt(nf.valor) + ' = ' + fmt(totE) + ' kg CO₂e', nf.pasos.join(' ')));
      } else {
        pasos.push('<li><span class="f">(3)</span><span>E_A = Papel × FE papel<br><span class="supuesto">Falta el factor del papel.</span></span></li>');
      }
    }
    $('#compPasos').innerHTML = pasos.join('');
    $('#compFactores').innerHTML = lineaFactor('papel', f);
    pintarTotalComprobante(f && n ? totE : null);
  }

  function recalcularHigiene() {
    const v = leerHigiene(false);
    $('#campoDensidad').hidden = v.unidadJabon !== 'L';
    const fp = factorVigente('papel'), fj = factorVigente('jabon');
    const consumos = v.consumoPH !== null && v.consumoJabon !== null && v.densidadJabon !== null;
    let totBanos = 0, totPH = 0, totJ = 0, ePH = 0, eJ = 0, n = 0, error = null, convJ = [];
    $$('#filasHigiene tr').forEach((tr) => { $('[data-banos]', tr).textContent = '—'; $('[data-kg]', tr).textContent = '—'; });
    // También mostrar baños de filas a las que sólo les falta la calidad
    $$('#filasHigiene tr').forEach((tr) => {
      const pl = val.validarNumero($('[data-campo="plantas"]', tr).value, val.reglas.plantas);
      const bp = val.validarNumero($('[data-campo="banosPorPlanta"]', tr).value, val.reglas.banosPorPlanta);
      if (pl.valor !== null && bp.valor !== null && !pl.error && !bp.error) $('[data-banos]', tr).textContent = fmt(pl.valor * bp.valor);
    });
    v.filas.forEach((fila) => {
      const banos = fila.plantas * fila.banosPorPlanta;
      totBanos += banos;
      n++;
      if (!consumos) return;
      totPH += banos * v.consumoPH;
      totJ += banos * v.consumoJabon;
      if (fp && fj) {
        try {
          const r = calc.calcularHigiene({ edificioId: fila.edificioId, edificio: fila.edificio, plantas: fila.plantas, banosPorPlanta: fila.banosPorPlanta, consumoPH: v.consumoPH, consumoJabon: v.consumoJabon, unidadJabon: v.unidadJabon, densidadJabon: v.densidadJabon }, fp, fj);
          ePH += r.papelHig.kgCO2e; eJ += r.jabon.kgCO2e;
          convJ = r.jabon.traza.conversiones;
          $('[data-kg]', fila.tr).textContent = fmt(r.kgCO2e);
        } catch (e) { error = e.message; }
      }
    });
    $('#totBanos').textContent = fmt(totBanos);
    const hayE = fp && fj && consumos && n && !error;
    $('#totKgHigiene').textContent = hayE ? fmt(ePH + eJ) : '—';

    const p = periodoPorId(v.periodo);
    $('#compSub').textContent = 'Rubro B, higiene sanitaria. Período ' + (p ? p.nombre : 'sin elegir') + '.';
    const pasos = [];
    if (!n) {
      pasos.push('<li><span class="vacio">Cargá las plantas, los baños y la calidad de al menos un edificio.</span></li>');
    } else {
      pasos.push(paso('(4)', 'Baños = Σ Pe × Be', '= ' + fmt(totBanos) + ' baños', n + (n === 1 ? ' edificio' : ' edificios')));
      if (!consumos) {
        pasos.push('<li><span class="vacio">Completá los consumos por baño.</span></li>');
      } else {
        pasos.push(paso('(5)', 'Papel higiénico = Baños × cPH', '= ' + fmt(totBanos) + ' × ' + fmt(v.consumoPH) + ' kg = ' + fmt(totPH) + ' kg'));
        pasos.push(paso('(5)', 'Jabón = Baños × cJ', '= ' + fmt(totBanos) + ' × ' + fmt(v.consumoJabon) + ' ' + v.unidadJabon + ' = ' + fmt(totJ) + ' ' + v.unidadJabon, convJ.filter((c) => c.indexOf('Jabón:') === 0).map((c) => c.replace(/^Jabón: /, 'Conversión: ')).join(' ')));
        if (error) pasos.push('<li><span class="vacio">' + esc(error) + '</span></li>');
        else if (fp && fj) pasos.push(paso('(6)', 'E_B = PH × FE papel + Jabón × FE jabón', '= ' + fmt(ePH) + ' + ' + fmt(eJ) + ' = ' + fmt(ePH + eJ) + ' kg CO₂e'));
        else pasos.push('<li><span class="f">(6)</span><span>E_B = PH × FE papel + Jabón × FE jabón<br><span class="supuesto">Falta ' + (!fp && !fj ? 'el factor del papel y el del jabón' : !fp ? 'el factor del papel' : 'el factor del jabón') + '.</span></span></li>');
      }
    }
    $('#compPasos').innerHTML = pasos.join('');
    $('#compFactores').innerHTML = lineaFactor('papel', fp) + lineaFactor('jabon', fj) +
      '<p class="supuesto">El papel higiénico usa el factor del papel (indicación de la cátedra).</p>';
    pintarTotalComprobante(hayE ? ePH + eJ : null);
  }

  function paso(num, formula, cuenta, nota) {
    return '<li><span class="f">' + num + '</span><span>' + esc(formula) + '<br>' + esc(cuenta) + '</span>' +
      (nota ? '<span class="conv">' + esc(nota) + '</span>' : '') + '</li>';
  }

  function lineaFactor(bien, f) {
    if (!f) return '<p>FE ' + (bien === 'papel' ? 'papel' : 'jabón') + ': sin dato</p>';
    let conv = '';
    try { const nf = calc.normalizarFactor(f); if (nf.pasos.length) conv = ' (' + fmt(nf.valor) + ' kg CO₂e/' + nf.por + ')'; } catch (e) { conv = ' (unidad no reconocida)'; }
    const origen = f.origen === 'API' ? nombreApi() : 'cargado a mano, supuesto';
    return '<p' + (f.origen === 'API' ? '' : ' class="supuesto"') + '>FE ' + (bien === 'papel' ? 'papel' : 'jabón') + ': ' + esc(textoFactor(f)) + esc(conv) + ', ' + esc(origen) + (f.anio ? ', ' + esc(f.anio) : '') + (f.fuente ? '. ' + esc(f.fuente) : '') + '</p>';
  }

  function pintarTotalComprobante(kg) {
    $('#compKg').textContent = kg === null ? '—' : fmt(kg, 2) + ' kg CO₂e';
    $('#compT').textContent = kg === null ? '' : fmt(kg / 1000, 4) + ' t CO₂e';
  }

  function sellar(tipo, titulo, detalle) {
    const s = $('#sello');
    s.dataset.tipo = tipo;
    s.innerHTML = esc(titulo) + '<small>' + esc(detalle) + '</small>';
    s.hidden = false;
    s.classList.remove('aparece');
    void s.offsetWidth;
    s.classList.add('aparece');
  }

  // ======================================================================
  // Envío (flujo de la sección 7.3)
  // ======================================================================

  function enfocarPrimerError(errores) {
    const primero = errores.find((e) => e && !e.closest('[hidden]'));
    if (primero) primero.focus();
  }

  function ocupado(form, si, texto) {
    estado.enviando = si;
    const btn = $('button[type="submit"]', form);
    btn.disabled = si;
    btn.textContent = si ? 'Enviando…' : 'Calcular y enviar';
    if (texto !== undefined) estadoEnvio(form, texto);
  }

  function estadoEnvio(form, texto, tipo) {
    const el = form.id === 'formActas' ? $('#estadoActas') : $('#estadoHigiene');
    el.textContent = texto || '';
    el.dataset.tipo = tipo || '';
  }

  /** Paso 3: consulta el factor a la API justo antes de calcular. */
  async function factorParaEnviar(bien, anio) {
    const r = await api.obtenerFactor(BIENES[bien], anio);
    if (r.factor) { estado.factores[bien] = { estado: 'ok', factor: r.factor, nota: r.nota }; return { factor: r.factor, nota: r.nota }; }
    const manual = factorManual(bien, anio);
    if (manual) return { factor: manual, nota: 'Factor cargado a mano porque la API no lo tiene: ' + manual.fuente + ' (' + manual.anio + ').' };
    throw new Error('La API no tiene el factor de "' + BIENES[bien] + '" para ' + anio + '. Cargalo a mano arriba, con su fuente y año, para poder calcular.');
  }

  function confirmarDuplicados(nombres) {
    const dlg = $('#dlgConfirmar');
    $('#dlgConfirmarCuerpo').innerHTML = '<p>Para este período ya hay datos de:</p><ul>' + nombres.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' +
      '<p>Si los enviás de nuevo, quedan registros repetidos y los totales los suman dos veces.</p>';
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'enviar'), { once: true });
    });
  }

  function completarTraza(traza, periodo, nota, extra) {
    traza.periodo = { id: periodo.id, anio: periodo.anio };
    traza.dimension = { id: cfg.dimension.id, nombre: cfg.dimension.nombre, alcance: cfg.dimension.alcance, categoria: cfg.dimension.categoria };
    if (nota) (traza.supuestos = traza.supuestos || []).push(nota);
    Object.assign(traza, extra || {});
    return traza;
  }

  async function enviarActas(ev) {
    ev.preventDefault();
    if (estado.enviando) return;
    const form = $('#formActas');
    const v = leerActas(true);
    if (!v.ok) { estadoEnvio(form, 'Revisá los campos marcados.', 'error'); enfocarPrimerError(v.errores); return; }
    if (estado.conexion !== 'ok') { estadoEnvio(form, 'No se envió: no hay conexión con la API. Lo cargado queda guardado en este navegador.', 'error'); return; }
    const periodo = periodoPorId(v.periodo);
    const unidadKg = buscarUnidad('kg');
    if (!unidadKg) { estadoEnvio(form, 'La API no tiene la unidad «kg» en su catálogo de unidades. Revisá el adaptador en js/api.js.', 'error'); return; }

    ocupado(form, true, 'Consultando el factor de emisión del papel…');
    const guardados = [];
    try {
      const { factor, nota } = await factorParaEnviar('papel', periodo.anio);
      const calculos = v.filas.map((fila) => ({
        fila,
        r: calc.calcularActas({ departamento: fila.departamento, catedras: fila.catedras, turnos: v.turnos, hojasPorActa: v.hojasPorActa, pesoHojaKg: v.pesoHojaKg }, factor)
      }));

      estadoEnvio(form, 'Revisando si ya hay datos cargados…');
      estado.registros = await api.listarRegistros(estado.catalogos);
      const repetidos = calculos.filter((c) => estado.registros.some((x) => String(x.periodoId) === String(periodo.id) && x.rubro === 'actas' && x.departamento === c.fila.departamento));
      if (repetidos.length && !(await confirmarDuplicados(repetidos.map((c) => c.fila.departamento)))) {
        estadoEnvio(form, 'Envío cancelado. No se envió nada.');
        return;
      }

      for (let i = 0; i < calculos.length; i++) {
        const { fila, r } = calculos[i];
        estadoEnvio(form, 'Enviando ' + (i + 1) + ' de ' + calculos.length + ': ' + fila.departamento + '…');
        completarTraza(r.traza, periodo, nota);
        const ids = await api.guardar(
          { periodoId: periodo.id, edificioId: null, unidadId: unidadKg.id, fuenteId: fuentePorId(v.fuente).id, departamento: fila.departamento, rubro: cfg.rubros.actas.nombre, cantidad: r.cantidad, calidad: v.calidad },
          { factorId: factor.origen === 'API' ? factor.id : null, kgCO2e: r.kgCO2e, traza: r.traza }
        );
        guardados.push({ fila, r, ids });
      }
      const total = guardados.reduce((a, g) => a + g.r.kgCO2e, 0);
      const txt = guardados.length + (guardados.length === 1 ? ' departamento enviado' : ' departamentos enviados') + ': ' + fmt(total, 2) + ' kg CO₂e.';
      estadoEnvio(form, txt, 'ok');
      sellar('ok', 'Enviado', fechaHora(new Date().toISOString()) + ', ' + guardados.length + ' registros');
      toast(txt);
      await cargarRegistros();
    } catch (err) {
      fallaEnvio(form, err, guardados, 'departamentos');
    } finally {
      ocupado(form, false);
    }
  }

  async function enviarHigiene(ev) {
    ev.preventDefault();
    if (estado.enviando) return;
    const form = $('#formHigiene');
    const v = leerHigiene(true);
    if (!v.ok) { estadoEnvio(form, 'Revisá los campos marcados.', 'error'); enfocarPrimerError(v.errores); return; }
    if (estado.conexion !== 'ok') { estadoEnvio(form, 'No se envió: no hay conexión con la API. Lo cargado queda guardado en este navegador.', 'error'); return; }
    const periodo = periodoPorId(v.periodo);
    const unidadKg = buscarUnidad('kg');
    const unidadJ = buscarUnidad(v.unidadJabon);
    if (!unidadKg || !unidadJ) { estadoEnvio(form, 'La API no tiene la unidad «' + (!unidadKg ? 'kg' : v.unidadJabon) + '» en su catálogo de unidades. Revisá el adaptador en js/api.js.', 'error'); return; }

    ocupado(form, true, 'Consultando los factores de emisión…');
    const guardados = [];
    try {
      const fp = await factorParaEnviar('papel', periodo.anio);
      const fj = await factorParaEnviar('jabon', periodo.anio);
      const calculos = v.filas.map((fila) => ({
        fila,
        r: calc.calcularHigiene({ edificioId: fila.edificioId, edificio: fila.edificio, plantas: fila.plantas, banosPorPlanta: fila.banosPorPlanta, consumoPH: v.consumoPH, consumoJabon: v.consumoJabon, unidadJabon: v.unidadJabon, densidadJabon: v.densidadJabon }, fp.factor, fj.factor)
      }));

      estadoEnvio(form, 'Revisando si ya hay datos cargados…');
      estado.registros = await api.listarRegistros(estado.catalogos);
      const repetidos = calculos.filter((c) => estado.registros.some((x) => String(x.periodoId) === String(periodo.id) && x.rubro !== 'actas' && String(x.edificioId) === String(c.fila.edificioId)));
      if (repetidos.length && !(await confirmarDuplicados(repetidos.map((c) => c.fila.edificio)))) {
        estadoEnvio(form, 'Envío cancelado. No se envió nada.');
        return;
      }

      for (let i = 0; i < calculos.length; i++) {
        const { fila, r } = calculos[i];
        estadoEnvio(form, 'Enviando ' + (i + 1) + ' de ' + calculos.length + ': ' + fila.edificio + '…');
        const base = { periodoId: periodo.id, edificioId: fila.edificioId, fuenteId: fuentePorId(v.fuente).id, departamento: null, calidad: fila.calidad };
        completarTraza(r.papelHig.traza, periodo, fp.nota);
        await api.guardar(
          Object.assign({}, base, { unidadId: unidadKg.id, rubro: cfg.rubros.papelHig.nombre, cantidad: r.papelHig.cantidad }),
          { factorId: fp.factor.origen === 'API' ? fp.factor.id : null, kgCO2e: r.papelHig.kgCO2e, traza: r.papelHig.traza }
        );
        completarTraza(r.jabon.traza, periodo, fj.nota);
        await api.guardar(
          Object.assign({}, base, { unidadId: unidadJ.id, rubro: cfg.rubros.jabon.nombre, cantidad: r.jabon.cantidad }),
          { factorId: fj.factor.origen === 'API' ? fj.factor.id : null, kgCO2e: r.jabon.kgCO2e, traza: r.jabon.traza }
        );
        guardados.push({ fila, r });
      }
      const total = guardados.reduce((a, g) => a + g.r.kgCO2e, 0);
      const txt = guardados.length + (guardados.length === 1 ? ' edificio enviado' : ' edificios enviados') + ' (' + guardados.length * 2 + ' registros): ' + fmt(total, 2) + ' kg CO₂e.';
      estadoEnvio(form, txt, 'ok');
      sellar('ok', 'Enviado', fechaHora(new Date().toISOString()) + ', ' + guardados.length * 2 + ' registros');
      toast(txt);
      await cargarRegistros();
    } catch (err) {
      fallaEnvio(form, err, guardados, 'edificios');
    } finally {
      ocupado(form, false);
    }
  }

  function fallaEnvio(form, err, guardados, que) {
    let msg = (err.message || String(err)).trim();
    if (!/[.!?]$/.test(msg)) msg += '.';
    if (guardados.length) {
      const cuantos = guardados.length === 1 ? 'Se guardó 1 ' + que.replace(/s$/, '') : 'Se guardaron ' + guardados.length + ' ' + que;
      msg = cuantos + ' antes del error. ' + msg + ' Revisá la pestaña Registros antes de reenviar.';
    }
    if (err.datoGuardado !== undefined) msg += ' Quedó un dato de actividad sin resultado (id ' + err.datoGuardado + ').';
    estadoEnvio(form, msg, 'error');
    sellar('error', 'No enviado', guardados.length ? guardados.length + ' guardados antes del error' : 'revisá el mensaje');
    toast(msg, 'error');
    if (guardados.length) cargarRegistros();
  }

  // ======================================================================
  // Registros de la API
  // ======================================================================

  async function cargarRegistros() {
    if (estado.conexion !== 'ok') {
      estado.registros = [];
    } else {
      try {
        estado.registros = await api.listarRegistros(estado.catalogos);
      } catch (err) {
        toast('No se pudieron leer los resultados de la API: ' + err.message, 'error');
      }
    }
    marcarYaCargados();
    if (!$('#panel-resultados').hidden) renderResultados();
    if (!$('#panel-registros').hidden) renderRegistros();
  }

  function marcarYaCargados() {
    const pid = $('#periodo').value;
    const regs = estado.registros.filter((r) => String(r.periodoId) === String(pid));
    $$('#filasActas tr').forEach((tr) => {
      $('.marca-cargado', tr).hidden = !regs.some((r) => r.rubro === 'actas' && r.departamento === tr.dataset.depto);
    });
    $$('#filasHigiene tr').forEach((tr) => {
      $('.marca-cargado', tr).hidden = !regs.some((r) => r.rubro !== 'actas' && String(r.edificioId) === String(tr.dataset.edificio));
    });
  }

  function nombreEdificio(id, traza) {
    const e = edificioPorId(id);
    return e ? e.nombre : (traza && traza.entradas && traza.entradas.edificio) || ('Edificio ' + id);
  }

  // ======================================================================
  // Resultados (componente 7)
  // ======================================================================

  function renderResultados() {
    const pid = $('#resPeriodo').value;
    const p = periodoPorId(pid);
    const a = calc.agregar(estado.registros, pid);
    const anio = p ? p.nombre : '';

    $('#resEstado').textContent = estado.conexion === 'ok' ? a.cantidadRegistros + ' registros de la API para ' + anio + '.' : '';
    const avisos = [];
    if (estado.conexion !== 'ok') avisos.push('Sin conexión con la API no hay resultados para mostrar. Los resultados salen de lo guardado en la base central.');
    else if (!a.cantidadRegistros) avisos.push('Todavía no hay resultados para ' + anio + '. Cargalos en la pestaña Cargar datos.');
    if (a.duplicados.length) avisos.push('Hay ' + a.duplicados.length + ' datos repetidos para ' + anio + ' (mismo rubro y departamento o edificio). Los totales los suman todas las veces; revisalos en Registros.');
    $('#resAvisos').innerHTML = avisos.map((t) => '<div class="aviso"><p>' + esc(t) + '</p></div>').join('');

    const hay = a.cantidadRegistros > 0;
    $('#kpiTotal').textContent = hay ? a.totalT.toLocaleString('es-AR', { minimumFractionDigits: a.totalT < 1 ? 3 : 2, maximumFractionDigits: a.totalT < 1 ? 3 : 2 }) : '—';
    $('#kpiDesc').textContent = hay
      ? 'Emisiones del módulo en ' + anio + ' (' + fmt(a.totalKg, 1) + ' kg CO₂e): actas de examen e higiene sanitaria.'
      : 'Emisiones del módulo en el año.';
    $('#kpiCatedra').textContent = a.kgPorCatedra !== null ? fmt(a.kgPorCatedra, 3) : '—';
    $('#kpiCatedraNota').textContent = a.catedras ? 'Sobre ' + fmt(a.catedras) + ' cátedras' : 'Sin actas cargadas';
    $('#kpiBano').textContent = a.kgPorBano !== null ? fmt(a.kgPorBano, 2) : '—';
    $('#kpiBanoNota').textContent = a.banos ? 'Sobre ' + fmt(a.banos) + ' baños' : 'Sin edificios cargados';
    $('#kpiPapel').textContent = a.hojas ? fmt(a.kgPapelActas, 1) + ' kg' : '—';
    $('#kpiPapelNota').textContent = a.hojas ? fmt(a.hojas) + ' hojas' : '';
    if (a.porRubro.actas > 0) {
      const sube = (a.actasCon10Turnos / a.porRubro.actas - 1) * 100;
      $('#kpiEscenario').textContent = fmt(a.actasCon10Turnos, 2) + ' kg';
      $('#kpiEscenarioNota').textContent = (sube >= 0 ? '+' : '') + fmt(sube, 0) + ' % sobre lo cargado, si se suman los turnos 8, 9 y 10';
    } else {
      $('#kpiEscenario').textContent = '—';
      $('#kpiEscenarioNota').textContent = 'Si se suman los turnos 8, 9 y 10 del ciclo anterior';
    }

    const rubros = ['actas', 'papelHig', 'jabon'];
    graf.segmentada($('#grafRubro'), rubros.map((k) => ({ nombre: cfg.rubros[k].corto, valor: a.porRubro[k], color: COLOR[k] })), { vacio: 'Sin datos para ' + anio + '.' });

    // Por departamento
    const catPorDepto = {};
    estado.registros.filter((r) => String(r.periodoId) === String(pid) && r.rubro === 'actas').forEach((r) => {
      catPorDepto[r.departamento] = (catPorDepto[r.departamento] || 0) + (Number(r.traza.entradas && r.traza.entradas.catedras) || 0);
    });
    const deptos = Object.keys(a.porDepto).map((d) => ({ etiqueta: d, valor: a.porDepto[d], detalle: [{ nombre: 'Cátedras', valor: fmt(catPorDepto[d] || 0) }] }))
      .sort((x, y) => y.valor - x.valor);
    graf.barras($('#grafDepto'), deptos, { color: COLOR.actas, vacio: 'Sin actas cargadas para ' + anio + '.' });
    $('#tablaDepto').innerHTML = tablaSimple(['Departamento', 'Cátedras', 'kg CO₂e'], deptos.map((d) => [d.etiqueta, fmt(catPorDepto[d.etiqueta] || 0), fmt(d.valor)]));

    // Por edificio
    const edif = Object.keys(a.porEdificio).map((id) => ({ etiqueta: edificioPorId(id) ? edificioPorId(id).nombre : a.porEdificio[id].nombre, partes: a.porEdificio[id] }))
      .sort((x, y) => (y.partes.papelHig + y.partes.jabon) - (x.partes.papelHig + x.partes.jabon));
    const seriesB = [{ clave: 'papelHig', nombre: 'Papel higiénico', color: COLOR.papelHig }, { clave: 'jabon', nombre: 'Jabón líquido', color: COLOR.jabon }];
    graf.barrasApiladas($('#grafEdificio'), edif, seriesB, { vacio: 'Sin edificios cargados para ' + anio + '.' });
    $('#tablaEdificio').innerHTML = tablaSimple(['Edificio', 'Papel higiénico', 'Jabón líquido', 'Total kg CO₂e'],
      edif.map((e) => [e.etiqueta, fmt(e.partes.papelHig), fmt(e.partes.jabon), fmt(e.partes.papelHig + e.partes.jabon)]));

    // Evolución
    const evo = calc.evolucion(estado.registros, estado.catalogos.periodos);
    graf.lineas($('#grafEvolucion'), evo.map((e) => ({ etiqueta: e.periodo.nombre, valores: e.porRubro, total: e.total })),
      rubros.map((k) => ({ clave: k, nombre: cfg.rubros[k].corto, color: COLOR_HEX[k] })),
      { vacio: evo.length === 1 ? 'Hay un solo período con datos (' + evo[0].periodo.nombre + '). La evolución aparece cuando se cargue otro año.' : 'Sin datos cargados todavía.' });

    // Tabla 14
    $('#tablaResultados').innerHTML = tablaResultados(a);
  }

  function tablaSimple(cabeceras, filas) {
    if (!filas.length) return '<p class="grafico-vacio">Sin datos.</p>';
    return '<table class="tabla-datos"><thead><tr>' + cabeceras.map((c, i) => '<th scope="col"' + (i ? ' class="num"' : '') + '>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      filas.map((f) => '<tr>' + f.map((c, i) => (i ? '<td class="num">' : '<th scope="row" style="font-weight:400">') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</tbody></table>';
  }

  function filasTabla14(a) {
    const factores = (k) => Object.values(a.factores[k]).map((f) => fmt(f.valor) + ' ' + f.unidad + (f.origen && f.origen !== 'API' ? ' (manual)' : '')).join('; ') || '—';
    const pct = (k) => a.totalKg > 0 ? fmt(a.porRubro[k] / a.totalKg * 100, 1) + ' %' : '—';
    return [
      ['actas', 'Actas de examen', fmt(a.hojas) + ' hojas, ' + fmt(a.cantidades.actas, 2) + ' kg', 'kg', factores('actas'), fmt(a.porRubro.actas, 2), pct('actas')],
      ['papelHig', 'Papel higiénico', fmt(a.cantidades.papelHig, 2) + ' kg', 'kg', factores('papelHig'), fmt(a.porRubro.papelHig, 2), pct('papelHig')],
      ['jabon', 'Jabón líquido', fmt(a.cantidades.jabon, 2) + ' ' + (a.unidadesJabon.join('/') || 'kg'), a.unidadesJabon.join('/') || 'kg', factores('jabon'), fmt(a.porRubro.jabon, 2), pct('jabon')]
    ];
  }

  function tablaResultados(a) {
    const filas = filasTabla14(a);
    return '<table class="tabla-datos"><thead><tr><th scope="col">Rubro</th><th scope="col">Actividad</th><th scope="col">Unidad</th><th scope="col">Factor de emisión</th><th scope="col" class="num">Emisiones (kg CO₂e)</th><th scope="col" class="num">% del total</th></tr></thead><tbody>' +
      filas.map((f) => '<tr><th scope="row" style="font-weight:500"><span class="serie-marca" style="background:' + COLOR[f[0]] + '"></span>' + esc(f[1]) + '</th><td>' + esc(f[2]) + '</td><td>' + esc(f[3]) + '</td><td>' + esc(f[4]) + '</td><td class="num">' + esc(f[5]) + '</td><td class="num">' + esc(f[6]) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><th scope="row">Total</th><td></td><td></td><td></td><td class="num">' + fmt(a.totalKg, 2) + '</td><td class="num">' + (a.totalKg > 0 ? '100 %' : '—') + '</td></tr></tfoot></table>';
  }

  async function copiarTabla() {
    const a = calc.agregar(estado.registros, $('#resPeriodo').value);
    const filas = [['Rubro', 'Actividad', 'Unidad', 'Factor de emisión', 'Emisiones (kg CO2e)', '% del total']]
      .concat(filasTabla14(a).map((f) => f.slice(1)))
      .concat([['Total', '', '', '', fmt(a.totalKg, 2), a.totalKg > 0 ? '100 %' : '']]);
    const tsv = filas.map((f) => f.join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      toast('Tabla copiada. Pegala en el informe o en una planilla.');
    } catch (e) {
      toast('El navegador no dejó copiar. Seleccioná la tabla y copiala a mano.', 'error');
    }
  }

  // ======================================================================
  // Registros (trazabilidad)
  // ======================================================================

  function registrosFiltrados() {
    const pid = $('#regPeriodo').value, rub = $('#regRubro').value;
    return estado.registros
      .filter((r) => (!pid || String(r.periodoId) === String(pid)) && (!rub || r.rubro === rub))
      .sort((x, y) => String(y.calculadoEn || '').localeCompare(String(x.calculadoEn || '')));
  }

  function renderRegistros() {
    const regs = registrosFiltrados();
    $('#regEstado').textContent = estado.conexion === 'ok' ? regs.length + ' registros' : 'Sin conexión con la API.';
    const t = $('#tablaRegistros');
    if (!regs.length) {
      t.innerHTML = '<tbody><tr><td class="grafico-vacio" style="padding:24px 16px">' + (estado.conexion === 'ok' ? 'No hay registros con estos filtros.' : 'Conectá la API para ver los registros guardados.') + '</td></tr></tbody>';
      return;
    }
    t.innerHTML = '<thead><tr><th scope="col">Calculado</th><th scope="col">Período</th><th scope="col">Rubro</th><th scope="col">Departamento o edificio</th><th scope="col" class="num">Cantidad</th><th scope="col">Calidad</th><th scope="col" class="num">kg CO₂e</th><th scope="col"><span class="sr-only">Trazabilidad</span></th></tr></thead><tbody>' +
      regs.map((r, i) => {
        const p = periodoPorId(r.periodoId);
        const lugar = r.rubro === 'actas' ? r.departamento : nombreEdificio(r.edificioId, r.traza);
        return '<tr><td>' + esc(fechaHora(r.calculadoEn)) + '</td><td>' + esc(p ? p.nombre : r.periodoId) + '</td>' +
          '<td><span class="serie-marca" style="background:' + COLOR[r.rubro] + '"></span>' + esc(cfg.rubros[r.rubro].corto) + '</td>' +
          '<td>' + esc(lugar) + '</td><td class="num">' + fmt(r.cantidad) + ' ' + esc(r.unidad) + '</td>' +
          '<td><span class="calidad">' + esc(r.calidad || '—') + '</span></td><td class="num">' + fmt(r.kgCO2e) + '</td>' +
          '<td><button type="button" class="btn btn-secundario btn-chico" data-traza="' + i + '">Ver cálculo</button></td></tr>';
      }).join('') + '</tbody>';
    t._regs = regs;
  }

  const ETIQUETAS_ENTRADAS = {
    departamento: 'Departamento', catedras: 'Cátedras (Cd)', turnos: 'Turnos (T)', hojas_por_acta: 'Hojas por acta (H)',
    peso_hoja_kg: 'Peso por hoja (m, kg)', hojas: 'Hojas', edificio: 'Edificio', plantas: 'Plantas (Pe)',
    banos_por_planta: 'Baños por planta (Be)', banos: 'Baños', consumo_papel_higienico_kg_bano: 'Papel higiénico por baño (cPH, kg)',
    consumo_jabon_bano: 'Jabón por baño (cJ)', unidad_jabon: 'Unidad del jabón', densidad_jabon_kg_l: 'Densidad del jabón (kg/L)'
  };

  function mostrarTraza(r) {
    const tz = r.traza || {};
    const dl = (obj, etiquetas) => '<dl>' + Object.keys(obj).filter((k) => obj[k] !== null && obj[k] !== undefined && obj[k] !== '').map((k) =>
      '<dt>' + esc((etiquetas && etiquetas[k]) || k.replace(/_/g, ' ')) + '</dt><dd>' + esc(typeof obj[k] === 'number' ? fmt(obj[k]) : obj[k]) + '</dd>').join('') + '</dl>';
    const p = periodoPorId(r.periodoId);
    let html = '<div class="traza-bloque"><h3>Dato de actividad</h3>' + dl({
      'Rubro': cfg.rubros[r.rubro].nombre,
      'Período': p ? p.nombre : r.periodoId,
      'Departamento o edificio': r.rubro === 'actas' ? r.departamento : nombreEdificio(r.edificioId, tz),
      'Cantidad': fmt(r.cantidad) + ' ' + r.unidad,
      'Calidad': r.calidad,
      'Fuente': (fuentePorId(r.fuenteId) || {}).nombre || r.fuenteId,
      'Ids en la API': 'dato ' + r.datoId + ', resultado ' + r.resultadoId
    }) + '</div>';
    if (tz.entradas) html += '<div class="traza-bloque"><h3>Entradas</h3>' + dl(tz.entradas, ETIQUETAS_ENTRADAS) + '</div>';
    if (tz.factor) html += '<div class="traza-bloque"><h3>Factor de emisión</h3>' + dl({
      'Bien': tz.factor.bien, 'Valor': fmt(tz.factor.valor) + ' ' + tz.factor.unidad, 'Fuente': tz.factor.fuente,
      'Año': tz.factor.anio ? String(tz.factor.anio) : null, 'Origen': tz.factor.origen, 'Id del factor': tz.factor.id === null || tz.factor.id === undefined ? null : String(tz.factor.id)
    }) + '</div>';
    if (tz.pasos) html += '<div class="traza-bloque"><h3>Fórmulas aplicadas</h3><ol class="traza-pasos">' +
      tz.pasos.map((s) => '<li><span class="f">' + esc(s.formula) + '</span> ' + esc(s.texto) + '</li>').join('') + '</ol></div>';
    if (tz.conversiones && tz.conversiones.length) html += '<div class="traza-bloque"><h3>Conversiones</h3><ul>' + tz.conversiones.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
    if (tz.supuestos && tz.supuestos.length) html += '<div class="traza-bloque"><h3>Supuestos</h3><ul>' + tz.supuestos.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
    html += '<div class="traza-bloque"><h3>Resultado</h3>' + dl({
      'kg CO₂e': fmt(r.kgCO2e), 't CO₂e': fmt(r.kgCO2e / 1000, 6),
      'Alcance y categoría': cfg.dimension.alcance + ', categoría ' + cfg.dimension.categoria,
      'Fecha y hora': fechaHora(r.calculadoEn)
    }) + '</div>';
    $('#dlgTrazaCuerpo').innerHTML = html;
    $('#dlgTraza').showModal();
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarCsv() {
    const regs = registrosFiltrados();
    if (!regs.length) { toast('No hay registros para descargar.', 'error'); return; }
    const num = (n) => (n === null || n === undefined || isNaN(n)) ? '' : String(n).replace('.', ',');
    const celda = (s) => { s = String(s === null || s === undefined ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cab = ['dato_actividad_id', 'resultado_id', 'periodo', 'rubro', 'departamento', 'edificio', 'cantidad', 'unidad', 'calidad', 'kg_co2e', 'factor_valor', 'factor_unidad', 'factor_fuente', 'factor_anio', 'factor_origen', 'calculado_en'];
    const filas = regs.map((r) => {
      const f = (r.traza && r.traza.factor) || {};
      const p = periodoPorId(r.periodoId);
      return [r.datoId, r.resultadoId, p ? p.nombre : r.periodoId, cfg.rubros[r.rubro].nombre, r.departamento || '', r.rubro === 'actas' ? '' : nombreEdificio(r.edificioId, r.traza),
        num(r.cantidad), r.unidad, r.calidad, num(r.kgCO2e), num(f.valor), f.unidad || '', f.fuente || '', f.anio || '', f.origen || '', r.calculadoEn || ''].map(celda).join(';');
    });
    descargar('campusco2-m8-registros.csv', '﻿' + cab.join(';') + '\n' + filas.join('\n'), 'text/csv;charset=utf-8');
  }

  function exportarJson() {
    const regs = registrosFiltrados();
    if (!regs.length) { toast('No hay registros para descargar.', 'error'); return; }
    descargar('campusco2-m8-registros.json', JSON.stringify(regs, null, 2), 'application/json');
  }

  // ======================================================================
  // Pestaña Conexión
  // ======================================================================

  function pintarEndpoints() {
    const e = cfg.api.endpoints;
    const ops = [
      ['Consultar períodos', 'GET', e.periodos],
      ['Consultar edificios', 'GET', e.edificios],
      ['Consultar unidades', 'GET', e.unidades],
      ['Consultar fuentes de datos', 'GET', e.fuentes],
      ['Consultar factores de emisión', 'GET', e.factores + '?bien=…&anio=…'],
      ['Leer datos de actividad', 'GET', e.datosActividad + '?dimension_id=' + cfg.dimension.id],
      ['Leer resultados de emisión', 'GET', e.resultados + '?dimension_id=' + cfg.dimension.id],
      ['Enviar dato de actividad', 'POST', e.datosActividad],
      ['Enviar resultado de emisión', 'POST', e.resultados]
    ];
    $('#tablaEndpoints').innerHTML = '<thead><tr><th scope="col">Operación</th><th scope="col">Método</th><th scope="col">Ruta</th></tr></thead><tbody>' +
      ops.map((o) => '<tr><td>' + esc(o[0]) + '</td><td>' + o[1] + '</td><td><code>' + esc((api.baseUrl() || '') + o[2]) + '</code></td></tr>').join('') + '</tbody>';
  }

  async function guardarConexion(ev) {
    ev.preventDefault();
    const input = $('#baseUrl');
    const url = input.value.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      ponerError(input, 'Tiene que empezar con http:// o https://');
      return;
    }
    ponerError(input, null);
    api.guardarBaseUrl(url);
    pintarEndpoints();
    const est = $('#estadoConexion');
    if (!url) { est.textContent = 'Dirección borrada.'; est.dataset.tipo = ''; await conectar(); return; }
    est.textContent = 'Probando…'; est.dataset.tipo = '';
    try {
      const r = await api.probarConexion();
      est.textContent = 'Conectado: la API respondió en ' + r.ms + ' ms con ' + r.periodos + ' períodos.';
      est.dataset.tipo = 'ok';
    } catch (err) {
      est.textContent = err.message;
      est.dataset.tipo = 'error';
    }
    await conectar();
  }

  // ======================================================================
  // Inicio
  // ======================================================================

  function iniciar() {
    iniciarPestanas();
    pintarFilasActas();
    restaurarBorradores();
    iniciarFactorManual();
    pintarEndpoints();
    $('#baseUrl').value = api.baseUrl();
    $('#regRubro').innerHTML = '<option value="">Todos</option>' + Object.keys(cfg.rubros).map((k) => '<option value="' + k + '">' + esc(cfg.rubros[k].corto) + '</option>').join('');

    $$('.selector-form .opcion').forEach((b) => b.addEventListener('click', () => { elegirForm(b.dataset.form); guardarBorradores(); }));

    ['#formActas', '#formHigiene'].forEach((sel) => {
      const form = $(sel);
      form.addEventListener('input', (ev) => {
        if (ev.target.hasAttribute('aria-invalid')) ponerError(ev.target, null);
        if (!estado.enviando) estadoEnvio(form, '');
        $('#sello').hidden = true;
        guardarBorradores();
        recalcular();
      });
      form.addEventListener('change', () => { guardarBorradores(); recalcular(); });
    });
    $('#formActas').addEventListener('submit', enviarActas);
    $('#formHigiene').addEventListener('submit', enviarHigiene);
    $$('[data-vaciar]').forEach((b) => b.addEventListener('click', () => vaciar(b.dataset.vaciar)));

    $('#periodo').addEventListener('change', () => {
      ponerError($('#periodo'), null);
      $('#resPeriodo').value = $('#periodo').value;
      $('#sello').hidden = true;
      guardarBorradores();
      marcarYaCargados();
      cargarFactores();
    });

    $('#resPeriodo').addEventListener('change', renderResultados);
    $('#btnActualizar').addEventListener('click', async () => {
      $('#resEstado').textContent = 'Actualizando…';
      await cargarRegistros();
      renderResultados();
    });
    $('#btnCopiarTabla').addEventListener('click', copiarTabla);
    $('#regPeriodo').addEventListener('change', renderRegistros);
    $('#regRubro').addEventListener('change', renderRegistros);
    $('#btnCsv').addEventListener('click', exportarCsv);
    $('#btnJson').addEventListener('click', exportarJson);
    $('#tablaRegistros').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-traza]');
      if (b) mostrarTraza($('#tablaRegistros')._regs[Number(b.dataset.traza)]);
    });
    $('#formConexion').addEventListener('submit', guardarConexion);
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ir]');
      if (b) C.irA(b.dataset.ir);
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!$('#panel-resultados').hidden) renderResultados(); }, 150);
    });

    conectar();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
