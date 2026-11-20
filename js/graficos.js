/*
 * Gráficos del módulo de visualización (componente 7).
 * HTML y SVG nativos, sin librerías externas: no hay dependencias que descargar
 * y el módulo funciona abriendo index.html.
 */
(function (global) {
  'use strict';

  var fmt = global.CampusCO2.calculo.fmt;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Tooltip compartido ----------
  var tip;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }
  function mostrarTip(html, x, y) {
    var t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
    var top = y - h - 12 < 8 ? y + 16 : y - h - 12;
    t.style.left = left + 'px';
    t.style.top = (top + window.scrollY) + 'px';
  }
  function ocultarTip() { if (tip) tip.hidden = true; }

  /** Activa tooltips en cualquier elemento con data-tip dentro del contenedor. */
  function conTooltips(el) {
    if (el._tips) return;
    el._tips = true;
    el.addEventListener('mousemove', function (ev) {
      var m = ev.target.closest('[data-tip]');
      if (m && el.contains(m)) mostrarTip(m.getAttribute('data-tip'), ev.clientX, ev.clientY);
      else ocultarTip();
    });
    el.addEventListener('mouseleave', ocultarTip);
    el.addEventListener('focusin', function (ev) {
      var m = ev.target.closest('[data-tip]');
      if (!m) return;
      var r = m.getBoundingClientRect();
      mostrarTip(m.getAttribute('data-tip'), r.left + r.width / 2, r.top);
    });
    el.addEventListener('focusout', ocultarTip);
  }

  function tipHtml(titulo, filas) {
    return '<strong>' + esc(titulo) + '</strong>' + filas.map(function (f) {
      return '<span class="tip-fila">' + (f.color ? '<i style="background:' + f.color + '"></i>' : '') +
        esc(f.nombre) + '<b>' + esc(f.valor) + '</b></span>';
    }).join('');
  }

  function leyenda(series) {
    return '<ul class="leyenda">' + series.map(function (s) {
      return '<li><i style="background:' + s.color + '"></i>' + esc(s.nombre) + '</li>';
    }).join('') + '</ul>';
  }

  function vacio(el, texto) {
    el.innerHTML = '<p class="grafico-vacio">' + esc(texto) + '</p>';
  }

  // ---------- Barra segmentada (distribución de un total) ----------
  function segmentada(el, partes, opciones) {
    var total = partes.reduce(function (a, p) { return a + p.valor; }, 0);
    if (!(total > 0)) return vacio(el, opciones.vacio);
    var bloques = partes.filter(function (p) { return p.valor > 0; }).map(function (p) {
      var pct = p.valor / total * 100;
      var etiqueta = fmt(pct, pct < 10 ? 1 : 0) + ' %';
      return '<div class="seg-bloque" tabindex="0" style="flex-grow:' + p.valor + ';background:' + p.color + '" ' +
        'aria-label="' + esc(p.nombre + ': ' + fmt(p.valor) + ' kg CO₂e, ' + etiqueta) + '" ' +
        'data-tip="' + esc(tipHtml(p.nombre, [{ nombre: 'Emisiones', valor: fmt(p.valor) + ' kg CO₂e' }, { nombre: 'Del total', valor: etiqueta }])) + '">' +
        '<span>' + etiqueta + '</span></div>';
    }).join('');
    el.innerHTML = leyenda(partes) + '<div class="seg-barra" role="img" aria-label="Distribución por rubro">' + bloques + '</div>';
    // Si la etiqueta no entra en su bloque, no se muestra (queda en el tooltip y en la tabla).
    requestAnimationFrame(function () {
      el.querySelectorAll('.seg-bloque').forEach(function (b) {
        var s = b.querySelector('span');
        s.style.visibility = s.scrollWidth + 16 > b.clientWidth ? 'hidden' : 'visible';
      });
    });
    conTooltips(el);
  }

  // ---------- Barras horizontales ----------
  function barras(el, items, opciones) {
    if (!items.length || !items.some(function (i) { return i.valor > 0; })) return vacio(el, opciones.vacio);
    var max = Math.max.apply(null, items.map(function (i) { return i.valor; }));
    el.innerHTML = '<div class="barras">' + items.map(function (i) {
      var w = max > 0 ? i.valor / max * 100 : 0;
      return '<div class="barra-fila">' +
        '<span class="barra-etq" title="' + esc(i.etiqueta) + '">' + esc(i.etiqueta) + '</span>' +
        '<span class="barra-pista"><span class="barra" tabindex="0" style="width:' + w + '%;background:' + opciones.color + '" ' +
        'aria-label="' + esc(i.etiqueta + ': ' + fmt(i.valor) + ' kg CO₂e') + '" ' +
        'data-tip="' + esc(tipHtml(i.etiqueta, (i.detalle || []).concat([{ nombre: 'Emisiones', valor: fmt(i.valor) + ' kg CO₂e' }]))) + '"></span>' +
        '<span class="barra-valor">' + fmt(i.valor) + '</span></span>' +
        '</div>';
    }).join('') + '</div>';
    conTooltips(el);
  }

  // ---------- Barras apiladas horizontales ----------
  function barrasApiladas(el, items, series, opciones) {
    var totales = items.map(function (i) { return series.reduce(function (a, s) { return a + (i.partes[s.clave] || 0); }, 0); });
    if (!items.length || !totales.some(function (t) { return t > 0; })) return vacio(el, opciones.vacio);
    var max = Math.max.apply(null, totales);
    el.innerHTML = leyenda(series) + '<div class="barras">' + items.map(function (i, n) {
      var w = totales[n] / max * 100;
      var filasTip = series.map(function (s) { return { nombre: s.nombre, valor: fmt(i.partes[s.clave] || 0) + ' kg', color: s.color }; });
      filasTip.push({ nombre: 'Total', valor: fmt(totales[n]) + ' kg CO₂e' });
      var segs = series.filter(function (s) { return (i.partes[s.clave] || 0) > 0; }).map(function (s) {
        return '<span class="apilado-seg" style="flex-grow:' + i.partes[s.clave] + ';background:' + s.color + '"></span>';
      }).join('');
      return '<div class="barra-fila">' +
        '<span class="barra-etq" title="' + esc(i.etiqueta) + '">' + esc(i.etiqueta) + '</span>' +
        '<span class="barra-pista"><span class="barra apilada" tabindex="0" style="width:' + w + '%" ' +
        'aria-label="' + esc(i.etiqueta + ': ' + fmt(totales[n]) + ' kg CO₂e') + '" ' +
        'data-tip="' + esc(tipHtml(i.etiqueta, filasTip)) + '">' + segs + '</span>' +
        '<span class="barra-valor">' + fmt(totales[n]) + '</span></span>' +
        '</div>';
    }).join('') + '</div>';
    conTooltips(el);
  }

  // ---------- Líneas (evolución anual) ----------
  function ticksLindos(max, n) {
    if (!(max > 0)) return [0, 1];
    var paso = Math.pow(10, Math.floor(Math.log10(max / n)));
    var err = max / n / paso;
    paso *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [];
    for (var v = 0; v <= max + paso * 0.999; v += paso) t.push(Number(v.toPrecision(12)));
    return t;
  }

  function lineas(el, puntos, series, opciones) {
    if (puntos.length < 2) return vacio(el, opciones.vacio);
    // El SVG se dibuja al tamaño real del contenedor para que el texto no se escale.
    var W = Math.max(320, el.clientWidth || 640), H = 260;
    var largo = series.reduce(function (a, s) { return Math.max(a, s.nombre.length); }, 0);
    var m = { t: 16, r: Math.min(150, 20 + largo * 7), b: 32, l: 56 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var max = 0;
    puntos.forEach(function (p) { series.forEach(function (s) { max = Math.max(max, p.valores[s.clave] || 0); }); });
    var ticks = ticksLindos(max, 4);
    var ymax = ticks[ticks.length - 1];
    var x = function (i) { return m.l + i / (puntos.length - 1) * iw; };
    var y = function (v) { return m.t + ih - v / ymax * ih; };
    var def = function (v) { return v !== null && v !== undefined; };

    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" class="lineas" role="img" aria-label="Evolución anual de emisiones por rubro">';
    ticks.forEach(function (t) {
      svg += '<line class="grilla" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="eje" x="' + (m.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + fmt(t) + '</text>';
    });
    puntos.forEach(function (p, i) {
      svg += '<text class="eje" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.etiqueta) + '</text>';
    });
    var finales = [];
    series.forEach(function (s) {
      // Tramos sólo entre períodos con datos: un rubro no cargado no se dibuja como cero.
      var d = '', abierto = false, ultimo = null;
      puntos.forEach(function (p, i) {
        var v = p.valores[s.clave];
        if (!def(v)) { abierto = false; return; }
        d += (abierto ? 'L' : 'M') + x(i) + ' ' + y(v) + ' ';
        abierto = true;
        ultimo = i;
      });
      if (d) svg += '<path class="linea" d="' + d + '" stroke="' + s.color + '"/>';
      puntos.forEach(function (p, i) {
        var v = p.valores[s.clave];
        if (def(v)) svg += '<circle class="punto" cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="' + s.color + '"/>';
      });
      if (ultimo !== null) finales.push({ s: s, x: x(ultimo), y: y(puntos[ultimo].valores[s.clave]) });
    });
    // Etiquetas al final de cada línea; si chocan, se separan con una línea guía.
    finales.sort(function (a, b) { return a.y - b.y; });
    var prev = -Infinity;
    finales.forEach(function (f) {
      var ty = Math.max(f.y, prev + 15);
      prev = ty;
      if (Math.abs(ty - f.y) > 1) svg += '<line class="guia" x1="' + (f.x + 6) + '" y1="' + f.y + '" x2="' + (f.x + 14) + '" y2="' + ty + '"/>';
      svg += '<text class="fin" x="' + (f.x + 16) + '" y="' + (ty + 4) + '">' + esc(f.s.nombre) + '</text>';
    });
    // Zonas de hover por período
    var ancho = iw / (puntos.length - 1);
    puntos.forEach(function (p, i) {
      var filas = series.map(function (s) {
        var v = p.valores[s.clave];
        return { nombre: s.nombre, valor: def(v) ? fmt(v) + ' kg' : 'sin datos', color: s.color };
      });
      filas.push({ nombre: 'Total', valor: fmt(p.total) + ' kg CO₂e' });
      var x0 = Math.max(m.l, x(i) - ancho / 2), x1 = Math.min(m.l + iw, x(i) + ancho / 2);
      svg += '<rect class="zona" tabindex="0" x="' + x0 + '" y="' + m.t + '" width="' + (x1 - x0) + '" height="' + ih + '" ' +
        'aria-label="' + esc(p.etiqueta + ': ' + fmt(p.total) + ' kg CO₂e') + '" data-tip="' + esc(tipHtml(p.etiqueta, filas)) + '"/>';
    });
    svg += '</svg>';
    el.innerHTML = leyenda(series) + svg;
    conTooltips(el);
  }

  global.CampusCO2.graficos = {
    segmentada: segmentada,
    barras: barras,
    barrasApiladas: barrasApiladas,
    lineas: lineas,
    esc: esc
  };
})(window);
