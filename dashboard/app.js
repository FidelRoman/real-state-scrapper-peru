/* =============================================================================
   Dashboard inmobiliario Lima
   Datos: dashboard/data/dashboard.json + districts.geojson (los genera build_data.py)

   Paletas validadas con la skill dataviz contra la superficie #14171d:
     categórica (etapa)      -> PASS all-pairs, modo oscuro
     ordinal (dormitorios)   -> PASS
     secuencial (coropleta)  -> PASS
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- paleta --
  var SURFACE = '#14171d';
  var INK = '#ffffff';
  var INK2 = '#c3c6cf';
  var MUTED = '#8b90a0';
  var GRID = '#262b35';

  var ETAPA_COLOR = {
    'En Construcción': '#3987e5',
    'En Planos': '#d95926',
    'Entrega Inmediata': '#199e70',
    'Sin etapa': '#8b90a0'
  };
  var ETAPA_ORDEN = ['En Construcción', 'En Planos', 'Entrega Inmediata', 'Sin etapa'];

  // Rampa ordinal: 1 dorm (oscuro) -> 4+ dorms (claro)
  var DORM_COLOR = { '1': '#184f95', '2': '#256abf', '3': '#3987e5', '4+': '#86b6ef' };
  var DORM_ORDEN = ['1', '2', '3', '4+'];

  // Rampa de precio por m²: verde (más barato) -> rojo (más caro).
  // El rojo/verde es el par que peor distinguen las personas con daltonismo, así
  // que la rampa se construyó con la luminosidad estrictamente descendente
  // (OKLCH L de 0.88 a 0.53, salto >= 0.06): el orden se sigue leyendo aunque el
  // tono no se distinga, y el número siempre está en la leyenda y el tooltip.
  var SEQ = ['#8af39c', '#9bd566', '#baaf0c', '#cd8300', '#c95b20', '#b43e37'];

  // ------------------------------------------------------------- formatos --
  var nfInt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

  function fmtInt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : nfInt.format(Math.round(n)); }
  function fmtSoles(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : 'S/ ' + nfInt.format(Math.round(n)); }
  function fmtArea(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : nf1.format(n) + ' m²'; }

  function fmtCompact(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e6) return nf1.format(n / 1e6) + ' M';
    if (Math.abs(n) >= 1e4) return nfInt.format(Math.round(n / 1e3)) + ' K';
    return nfInt.format(Math.round(n));
  }

  function fmtFecha(iso) {
    if (!iso) return 'Sin fecha';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /** Escapa texto de la fuente antes de meterlo en el HTML de un tooltip. */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Solo dejamos pasar URLs https de la fuente (imágenes y enlaces). */
  function safeUrl(u) {
    return (typeof u === 'string' && /^https:\/\//i.test(u)) ? u : null;
  }

  function normalized(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function isMobile() {
    return window.matchMedia('(max-width: 720px), (max-width: 900px) and (max-height: 500px)').matches;
  }

  function iconUse(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function initials(s) {
    return String(s || 'P').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }

  function median(arr) {
    var v = arr.filter(function (x) { return typeof x === 'number' && isFinite(x) && x > 0; })
               .sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function uniqSorted(arr) {
    return Object.keys(arr.reduce(function (acc, v) { acc[v] = 1; return acc; }, {}))
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  function dormBucket(d) {
    if (!d) return null;
    return d >= 4 ? '4+' : String(d);
  }

  function entregaBucket(u) {
    if (u.inmediata) return 'Inmediata';
    if (!u.entrega) return 'Sin fecha';
    var y = parseInt(u.entrega.slice(0, 4), 10);
    return y >= 2029 ? '2029 o después' : String(y);
  }

  // ----------------------------------------------------------------- state --
  var DATA = { proyectos: [], unidades: [], meta: {} };
  var GEO = null;
  var byLink = {};          // link -> proyecto
  var unitsByLink = {};     // link -> unidades[]
  var BOUNDS = {};          // límites de los sliders

  var F = {
    distrito: [], etapa: [], inmobiliaria: [], dorm: [], tipo: [], entrega: [],
    precio: null, area: null
  };

  var view = {
    sort: { key: 'precio_m2', dir: -1 },
    search: '',
    rendered: 0,
    projectQuery: '',
    projectSort: 'price',
    projectRendered: 0,
    selectedLink: null,
    districtsExpanded: false,
    firmsExpanded: false
  };

  var charts = {};
  var map, layerDistritos, layerProyectos, legendEl;
  var markerByLink = {};
  var lastSelection = { proyectos: [], unidades: [] };
  var selectedActivator = null;
  var chartsActivated = false;
  var pendingChartSelection = null;

  function DISTRICT_STYLE() {
    return {
      color: 'rgba(255,255,255,0.14)', weight: 1,
      fillColor: '#ffffff', fillOpacity: 0.03, interactive: false
    };
  }

  // ------------------------------------------------------------- filtrado --
  function unitFiltersActive() {
    return F.dorm.length || F.tipo.length || F.entrega.length || F.precio || F.area;
  }

  function unitPasses(u) {
    if (F.dorm.length && F.dorm.indexOf(dormBucket(u.dorm)) === -1) return false;
    if (F.tipo.length && F.tipo.indexOf(u.tipo) === -1) return false;
    if (F.entrega.length && F.entrega.indexOf(entregaBucket(u)) === -1) return false;
    if (F.precio) {
      if (u.precio_pen === null) return false;
      if (u.precio_pen < F.precio[0] || u.precio_pen > F.precio[1]) return false;
    }
    if (F.area) {
      if (u.area === null) return false;
      if (u.area < F.area[0] || u.area > F.area[1]) return false;
    }
    return true;
  }

  function projectPasses(p) {
    if (F.distrito.length && F.distrito.indexOf(p.distrito) === -1) return false;
    if (F.etapa.length && F.etapa.indexOf(p.etapa) === -1) return false;
    if (F.inmobiliaria.length && F.inmobiliaria.indexOf(p.inmobiliaria) === -1) return false;
    if (view.projectQuery) {
      var haystack = normalized([p.nombre, p.distrito, p.inmobiliaria].join(' '));
      if (haystack.indexOf(normalized(view.projectQuery)) === -1) return false;
    }
    return true;
  }

  /**
   * Un proyecto entra si pasa sus propios filtros. Si además hay filtros de
   * unidad activos, debe conservar al menos una unidad que los cumpla — así los
   * 109 proyectos sin detalle de unidades siguen visibles mientras no se filtre
   * por dormitorios, precio, área, tipo o entrega.
   */
  function computeSelection() {
    var strict = unitFiltersActive();
    var proyectos = [];
    var unidades = [];

    for (var i = 0; i < DATA.proyectos.length; i++) {
      var p = DATA.proyectos[i];
      if (!projectPasses(p)) continue;

      var mias = unitsByLink[p.link] || [];
      var ok = [];
      for (var j = 0; j < mias.length; j++) {
        if (unitPasses(mias[j])) ok.push(mias[j]);
      }
      if (strict && !ok.length) continue;

      proyectos.push(p);
      for (var k = 0; k < ok.length; k++) unidades.push(ok[k]);
    }
    return { proyectos: proyectos, unidades: unidades };
  }

  // ------------------------------------------------------------------ KPIs --
  function renderKpis(sel) {
    var unidades = sel.unidades.reduce(function (a, u) { return a + u.unidades; }, 0);
    var m2 = median(sel.unidades.map(function (u) { return u.precio_m2; }));
    var ticket = median(sel.unidades.map(function (u) { return u.precio_pen; }));
    var distritos = uniqSorted(sel.proyectos.map(function (p) { return p.distrito; })).length;
    var firmas = uniqSorted(sel.proyectos.map(function (p) { return p.inmobiliaria; })).length;
    var conDatos = sel.proyectos.filter(function (p) { return (unitsByLink[p.link] || []).length; }).length;
    var pct = DATA.proyectos.length ? Math.round(sel.proyectos.length / DATA.proyectos.length * 100) : 0;

    var areas = sel.unidades.map(function (u) { return u.area; });

    text('kpi-m2', m2 ? fmtInt(m2) : '—');
    text('kpi-m2-sub', sel.unidades.length
      ? 'Mediana de ' + fmtInt(sel.unidades.filter(function (u) { return u.precio_m2; }).length) +
        ' modelos · área mediana ' + fmtArea(median(areas))
      : 'Sin unidades en la selección');

    text('kpi-proyectos', fmtInt(sel.proyectos.length));
    text('kpi-proyectos-sub', pct + '% del total · ' + fmtInt(conDatos) + ' con detalle de unidades');

    text('kpi-unidades', fmtCompact(unidades));
    text('kpi-unidades-sub', fmtInt(sel.unidades.length) + ' modelos distintos');

    text('kpi-ticket', ticket ? fmtSoles(ticket) : '—');
    var precios = sel.unidades.map(function (u) { return u.precio_pen; })
      .filter(function (v) { return v; }).sort(function (a, b) { return a - b; });
    text('kpi-ticket-sub', precios.length
      ? 'Desde ' + fmtCompact(precios[0]) + ' hasta ' + fmtCompact(precios[precios.length - 1])
      : '—');

    text('kpi-cobertura', distritos + ' · ' + firmas);
    text('kpi-cobertura-sub', 'distritos con oferta · inmobiliarias activas');
  }

  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ------------------------------------------------------------------ mapa --
  function initMap() {
    map = L.map('map', {
      zoomControl: true,
      preferCanvas: true,
      scrollWheelZoom: true,
      attributionControl: true
    }).setView([-12.06, -77.02], 11);

    var attr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: attr, maxZoom: 19, subdomains: 'abcd' }).addTo(map);

    // Etiquetas por encima de la coropleta pero por debajo de los proyectos.
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 450;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { maxZoom: 19, subdomains: 'abcd', pane: 'labels' }).addTo(map);

    // Los distritos son solo contexto geográfico: contorno, sin interacción
    // alguna, para que el ratón siempre alcance las burbujas que tienen debajo.
    layerDistritos = L.geoJSON(GEO, {
      interactive: false,
      style: DISTRICT_STYLE
    }).addTo(map);

    layerProyectos = L.layerGroup().addTo(map);
    legendEl = document.getElementById('map-legend');
    initHoverCardBridge();
    buildProjectMarkers();
    map.on('zoomend', function () { renderMap(lastSelection); });

    // El contenedor puede medir 0 px cuando Leaflet se inicializa dentro de la
    // tarjeta (según cuándo termine el layout), y entonces fitBounds salta al
    // zoom máximo. Reencuadramos en cuanto el contenedor tenga ancho real.
    var programmatic = false;   // distingue nuestros encuadres de los del usuario
    var userMoved = false;
    var tries = 0;

    map.on('movestart', function () { if (!programmatic) userMoved = true; });

    function fitToDistricts() {
      map.invalidateSize({ animate: false });
      if (userMoved) return;
      if (map.getSize().x === 0) {
        if (++tries < 120) requestAnimationFrame(fitToDistricts);
        return;
      }
      programmatic = true;
      map.fitBounds(coreBounds() || layerDistritos.getBounds(), { padding: [28, 28], animate: false });
      programmatic = false;
    }

    // Reencuadra mientras el layout se asienta; deja de hacerlo en cuanto el
    // usuario mueve el mapa por su cuenta.
    if (window.ResizeObserver) {
      new ResizeObserver(function () { fitToDistricts(); }).observe(document.getElementById('map'));
    }
    fitToDistricts();
  }

  /**
   * Encuadre sobre el núcleo de la oferta: los percentiles 3–97 de las
   * coordenadas. Un puñado de proyectos en Ancón y San Bartolo separa 75 km los
   * extremos y dejaría la Lima central reducida a una mancha.
   */
  function coreBounds() {
    if (!DATA.proyectos.length) return null;
    var lats = DATA.proyectos.map(function (p) { return p.lat; }).sort(function (a, b) { return a - b; });
    var lons = DATA.proyectos.map(function (p) { return p.lon; }).sort(function (a, b) { return a - b; });
    var q = function (arr, f) { return arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]; };
    return L.latLngBounds([q(lats, 0.03), q(lons, 0.03)], [q(lats, 0.97), q(lons, 0.97)]);
  }

  /** Cortes por cuantiles sobre los distritos con dato (rampa de 6 pasos). */
  function quantileBreaks(values) {
    var v = values.filter(function (x) { return typeof x === 'number' && isFinite(x); })
                  .sort(function (a, b) { return a - b; });
    if (v.length < 2) return null;
    var breaks = [];
    for (var i = 1; i < SEQ.length; i++) {
      breaks.push(v[Math.floor(i / SEQ.length * v.length)]);
    }
    return { breaks: breaks, min: v[0], max: v[v.length - 1] };
  }

  function colorFor(value, scale) {
    if (value === null || value === undefined || !scale) return null;
    for (var i = 0; i < scale.breaks.length; i++) {
      if (value < scale.breaks[i]) return SEQ[i];
    }
    return SEQ[SEQ.length - 1];
  }

  function renderMap(sel) {
    // Se conservan las instancias: los filtros solo cambian visibilidad y estilo.
    var scale = quantileBreaks(sel.proyectos.map(function (p) { return p.precio_m2; }));
    var visible = {};
    sel.proyectos.forEach(function (p) { visible[p.link] = true; });

    DATA.proyectos.forEach(function (p) {
      var marker = markerByLink[p.link];
      if (!marker) return;
      var shown = layerProyectos.hasLayer(marker);
      if (visible[p.link] && !shown) layerProyectos.addLayer(marker);
      if (!visible[p.link] && shown) layerProyectos.removeLayer(marker);
      if (!visible[p.link]) return;

      var selected = view.selectedLink === p.link;
      marker.setRadius(markerRadius(p, selected));
      marker.setStyle({
        fillColor: colorFor(p.precio_m2, scale) || MUTED,
        fillOpacity: selected ? 1 : (map.getZoom() <= 11 ? 0.66 : 0.82),
        color: selected ? '#ffffff' : '#0a0c10',
        weight: selected ? 3 : 1.5,
        opacity: selected ? 1 : 0.92
      });
      if (selected) marker.bringToFront();
    });

    renderLegend(scale, sel);
  }

  function markerRadius(p, selected) {
    var zoom = map ? map.getZoom() : 11;
    var base = zoom <= 11 ? 2.6 : (zoom === 12 ? 3.4 : 4.2);
    var factor = zoom <= 11 ? 0.58 : (zoom === 12 ? 0.82 : 1.05);
    var cap = zoom <= 11 ? 14 : (zoom === 12 ? 19 : 24);
    var r = Math.min(base + Math.sqrt(p.unidades || 0) * factor, cap);
    return selected ? Math.min(r + 3, 27) : r;
  }

  function buildProjectMarkers() {
    DATA.proyectos.slice().sort(function (a, b) { return b.unidades - a.unidades; }).forEach(function (p) {
      var marker = L.circleMarker([p.lat, p.lon], {
        radius: markerRadius(p, false), fillColor: MUTED, fillOpacity: 0.7,
        color: '#0a0c10', weight: 1.5, opacity: 0.92
      });
      marker._projectData = p;
      marker.bindPopup(function () { return projectPopup(p); }, {
        maxWidth: 308,
        minWidth: 294,
        maxHeight: 500,
        closeButton: true,
        autoPan: true,
        autoPanPaddingTopLeft: L.point(62, 24),
        autoPanPaddingBottomRight: L.point(24, 24),
        keepInView: true
      });
      bindHoverCard(marker, p);
      markerByLink[p.link] = marker;
      layerProyectos.addLayer(marker);
    });
  }

  /**
   * Abre la ficha del proyecto al pasar el ratón. El cierre se retrasa unos
   * milisegundos: si el puntero pasa del círculo a la ficha, se cancela, así el
   * enlace y el texto siguen siendo alcanzables. Un clic la deja fijada.
   */
  var hoverTimer = null;
  var pinned = null;

  function bindHoverCard(marker, project) {
    marker.on('mouseover', function () {
      if (isMobile()) return;
      clearTimeout(hoverTimer);
      marker.setStyle({ fillOpacity: 1, weight: 3 });
      if (!view.selectedLink) marker.openPopup();
    });
    marker.on('mouseout', function () {
      if (isMobile()) return;
      renderMap(lastSelection);
      if (view.selectedLink === project.link) return;
      scheduleCardClose();
    });
    marker.on('click', function (e) {
      if (e.originalEvent) selectedActivator = e.originalEvent.target || null;
      selectProject(project.link, { source: 'marker' });
    });
  }

  function scheduleCardClose() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { if (!view.selectedLink) map.closePopup(); }, 220);
  }

  function initHoverCardBridge() {
    map.on('popupopen', function (e) {
      if (legendEl) legendEl.classList.add('has-popup');
      var el = e.popup.getElement();
      if (!el) return;
      var closeButton = el.querySelector('.leaflet-popup-close-button');
      if (closeButton && !closeButton.querySelector('svg')) {
        closeButton.textContent = '';
        closeButton.appendChild(iconUse('icon-close'));
      }
      if (!el._hoverBound) {
        el._hoverBound = true;
        el.addEventListener('mouseenter', function () { clearTimeout(hoverTimer); });
        el.addEventListener('mouseleave', function () { if (!view.selectedLink) scheduleCardClose(); });
      }
    });
    map.on('popupclose', function () {
      if (legendEl) legendEl.classList.remove('has-popup');
      if (!view.selectedLink) pinned = null;
    });
  }

  function projectPopup(p) {
    var root = document.createElement('div');
    root.className = 'pop';

    var imgUrl = safeUrl(p.imagen);
    var head = document.createElement('div');
    head.className = 'pop-img';
    var fallback = document.createElement('div');
    fallback.className = 'pop-img-fallback';
    fallback.textContent = initials(p.nombre);
    head.appendChild(fallback);
    if (imgUrl) {
      var img = document.createElement('img');
      img.src = imgUrl;
      img.alt = 'Vista del proyecto ' + p.nombre;
      img.loading = 'lazy';
      img.addEventListener('error', function () { img.classList.add('is-broken'); });
      head.appendChild(img);
    }
    var badge = document.createElement('span');
    badge.className = 'pop-badge';
    badge.style.background = ETAPA_COLOR[p.etapa] || MUTED;
    badge.textContent = p.etapa;
    head.appendChild(badge);
    var logoUrl = safeUrl(p.logo);
    if (logoUrl) {
      var logo = document.createElement('img');
      logo.className = 'pop-logo';
      logo.src = logoUrl;
      logo.alt = 'Logo de ' + p.inmobiliaria;
      logo.loading = 'lazy';
      logo.addEventListener('error', function () { logo.classList.add('is-broken'); });
      head.appendChild(logo);
    }
    root.appendChild(head);

    var body = document.createElement('div');
    body.className = 'pop-body';

    var h3 = document.createElement('h3');
    h3.textContent = p.nombre;
    body.appendChild(h3);

    var firm = document.createElement('p');
    firm.className = 'pop-firm';
    firm.textContent = p.inmobiliaria + ' · ' + p.distrito;
    body.appendChild(firm);

    var dl = document.createElement('dl');
    dl.className = 'pop-grid';
    var rows = [
      ['Precio desde', p.precio_min ? fmtSoles(p.precio_min) : (p.precio_desde ? fmtSoles(p.precio_desde) : '—')],
      ['Precio hasta', p.precio_max ? fmtSoles(p.precio_max) : '—'],
      ['S/ por m²', p.precio_m2 ? fmtInt(p.precio_m2) : '—'],
      ['Áreas', p.area_min ? nf1.format(p.area_min) + ' – ' + nf1.format(p.area_max) + ' m²' : '—'],
      ['Unidades', p.unidades ? fmtInt(p.unidades) : 'Sin detalle'],
      ['Entrega', p.inmediata ? 'Inmediata' : fmtFecha(p.entrega)]
    ];
    rows.forEach(function (r) {
      var dt = document.createElement('dt');
      dt.textContent = r[0];
      var dd = document.createElement('dd');
      dd.textContent = r[1];
      var cell = document.createElement('div');
      cell.appendChild(dt);
      cell.appendChild(dd);
      dl.appendChild(cell);
    });
    body.appendChild(dl);

    var mixKeys = Object.keys(p.mix_dorm || {});
    if (mixKeys.length) {
      var mix = document.createElement('div');
      mix.className = 'pop-mix';
      mixKeys.forEach(function (k) {
        var s = document.createElement('span');
        s.textContent = k + ' dorm · ' + fmtInt(p.mix_dorm[k]) + ' u.';
        mix.appendChild(s);
      });
      body.appendChild(mix);
    }

    var dir = document.createElement('p');
    dir.className = 'pop-firm';
    dir.style.margin = '10px 0 0';
    dir.textContent = p.direccion;
    body.appendChild(dir);

    var link = safeUrl(p.link);
    if (link) {
      var a = document.createElement('a');
      a.className = 'pop-link';
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Ver el proyecto en Nexo';
      body.appendChild(a);
    }

    root.appendChild(body);
    return root;
  }

  // ------------------------------------------------------- explorador/lista --
  var projectRows = [];

  function sortedProjects(projects) {
    var rows = projects.slice();
    rows.sort(function (a, b) {
      if (view.projectSort === 'units') return (b.unidades || 0) - (a.unidades || 0);
      var av = view.projectSort === 'm2' ? a.precio_m2 : (a.precio_min || a.precio_desde);
      var bv = view.projectSort === 'm2' ? b.precio_m2 : (b.precio_min || b.precio_desde);
      if (!av && !bv) return a.nombre.localeCompare(b.nombre, 'es');
      if (!av) return 1;
      if (!bv) return -1;
      return av - bv;
    });
    return rows;
  }

  function renderProjectResults(sel, preserveCount) {
    projectRows = sortedProjects(sel.proyectos);
    if (!preserveCount) view.projectRendered = Math.min(30, projectRows.length);
    else view.projectRendered = Math.min(Math.max(view.projectRendered, 30), projectRows.length);

    var list = document.getElementById('project-list');
    list.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < view.projectRendered; i++) frag.appendChild(projectItem(projectRows[i]));
    list.appendChild(frag);

    var load = document.getElementById('project-load-more');
    load.hidden = view.projectRendered >= projectRows.length;
    text('project-status', projectRows.length
      ? fmtInt(projectRows.length) + ' proyectos encontrados · selecciona uno para ver su ficha'
      : 'No encontramos proyectos. Prueba con menos filtros o con otra búsqueda.');
    text('filters-mobile-count', projectRows.length
      ? fmtInt(projectRows.length) + ' proyectos encontrados'
      : 'Sin resultados');

    if (!projectRows.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      var strong = document.createElement('b');
      strong.textContent = 'No hay proyectos con esta combinación';
      var msg = document.createElement('span');
      msg.textContent = 'Quita algún filtro o cambia el texto de búsqueda.';
      empty.appendChild(strong);
      empty.appendChild(msg);
      list.appendChild(empty);
    }
  }

  function projectItem(p) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-item' + (view.selectedLink === p.link ? ' is-selected' : '');
    button.setAttribute('aria-pressed', view.selectedLink === p.link ? 'true' : 'false');
    button.setAttribute('aria-label', 'Ver ' + p.nombre + ' en ' + p.distrito);

    var thumb = document.createElement('span');
    thumb.className = 'project-thumb';
    var fallback = document.createElement('span');
    fallback.className = 'project-thumb-fallback';
    fallback.textContent = initials(p.nombre);
    thumb.appendChild(fallback);
    var url = safeUrl(p.imagen);
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function () { img.classList.add('is-broken'); });
      thumb.appendChild(img);
    }

    var copy = document.createElement('span');
    copy.className = 'project-copy';
    var name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = p.nombre;
    var location = document.createElement('span');
    location.className = 'project-location';
    location.textContent = p.distrito + ' · ' + p.inmobiliaria;
    var metrics = document.createElement('span');
    metrics.className = 'project-metrics';
    var price = document.createElement('span');
    price.className = 'project-price';
    price.textContent = (p.precio_min || p.precio_desde) ? fmtSoles(p.precio_min || p.precio_desde) : 'Precio por consultar';
    var units = document.createElement('span');
    units.textContent = p.unidades ? fmtInt(p.unidades) + ' unid.' : 'Sin detalle';
    metrics.appendChild(price);
    metrics.appendChild(units);
    var meta = document.createElement('span');
    meta.className = 'project-meta';
    var areaText = p.area_min
      ? nf1.format(p.area_min) + (p.area_max && p.area_max !== p.area_min ? '–' + nf1.format(p.area_max) : '') + ' m²'
      : 'Área por consultar';
    meta.textContent = areaText +
      ' · ' + (p.inmediata ? 'Entrega inmediata' : fmtFecha(p.entrega));
    copy.appendChild(name);
    copy.appendChild(location);
    copy.appendChild(metrics);
    copy.appendChild(meta);
    button.appendChild(thumb);
    button.appendChild(copy);
    button.addEventListener('click', function () {
      selectedActivator = button;
      selectProject(p.link, { source: 'list' });
    });
    return button;
  }

  function selectProject(link, options) {
    var p = byLink[link];
    var marker = markerByLink[link];
    if (!p || !marker) return;
    view.selectedLink = link;
    pinned = marker;
    renderMap(lastSelection);
    renderProjectResults(lastSelection, true);
    if (options && options.source === 'list') {
      selectedActivator = document.querySelector('.project-item.is-selected') || selectedActivator;
    }

    var targetZoom = options && options.source === 'list' ? Math.max(map.getZoom(), 14) : map.getZoom();
    map.setView([p.lat, p.lon], targetZoom, { animate: true });
    if (isMobile()) {
      map.closePopup();
      openProjectSheet(p);
    } else {
      closeProjectSheet(false);
      setTimeout(function () { marker.openPopup(); }, 180);
    }
  }

  function openProjectSheet(p) {
    var sheet = document.getElementById('project-sheet');
    var body = document.getElementById('sheet-body');
    var link = document.getElementById('sheet-link');
    body.innerHTML = '';
    body.appendChild(projectPopup(p));
    var url = safeUrl(p.link);
    link.hidden = !url;
    if (url) link.href = url;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(function () { sheet.querySelector('.sheet-close').focus(); });
  }

  function closeProjectSheet(restoreFocus) {
    var sheet = document.getElementById('project-sheet');
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('sheet-open');
    if (restoreFocus !== false && selectedActivator && selectedActivator.focus) selectedActivator.focus();
  }

  function renderLegend(scale, sel) {
    legendEl.innerHTML = '';

    if (scale) {
      var t = document.createElement('div');
      t.className = 'legend-title';
      t.textContent = 'S/ por m² · barato → caro';
      legendEl.appendChild(t);

      var ramp = document.createElement('div');
      ramp.className = 'ramp';
      SEQ.forEach(function (c) {
        var i = document.createElement('i');
        i.style.background = c;
        ramp.appendChild(i);
      });
      legendEl.appendChild(ramp);

      // Los tramos son cuantiles (un sexto de los proyectos cada uno), así que
      // etiquetamos también la mediana: la escala no es lineal.
      var labels = document.createElement('div');
      labels.className = 'ramp-labels';
      [scale.min, scale.breaks[2], scale.max].forEach(function (v) {
        var s = document.createElement('span');
        s.textContent = fmtCompact(v);
        labels.appendChild(s);
      });
      legendEl.appendChild(labels);

      var note = document.createElement('div');
      note.className = 'legend-note';
      note.textContent = 'Seis tramos por cuantiles';
      legendEl.appendChild(note);
    }

    var sinDato = sel.proyectos.filter(function (p) { return !p.precio_m2; }).length;
    if (sinDato) {
      var row = document.createElement('div');
      row.className = 'legend-row';
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = MUTED;
      var lbl = document.createElement('span');
      lbl.textContent = 'Sin precio publicado · ' + fmtInt(sinDato);
      row.appendChild(dot);
      row.appendChild(lbl);
      legendEl.appendChild(row);
    }

    var sizes = document.createElement('div');
    sizes.className = 'legend-sizes';
    [[10, '10'], [100, '100'], [400, '400']].forEach(function (s) {
      var d = Math.min(4.5 + Math.sqrt(s[0]) * 1.15, 26) * 2;
      var span = document.createElement('span');
      var i = document.createElement('i');
      i.style.width = d + 'px';
      i.style.height = d + 'px';
      var cap = document.createElement('small');
      cap.style.color = MUTED;
      cap.textContent = s[1];
      span.appendChild(i);
      span.appendChild(cap);
      sizes.appendChild(span);
    });
    var t3 = document.createElement('div');
    t3.className = 'legend-title legend-sizes-title';
    t3.style.marginTop = '10px';
    t3.textContent = 'Unidades disponibles';
    legendEl.appendChild(t3);
    legendEl.appendChild(sizes);
  }

  // -------------------------------------------------------------- gráficos --
  var BASE_GRID = { left: 8, right: 18, top: 24, bottom: 8, containLabel: true };

  function baseOption() {
    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: INK2 },
      animationDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360,
      aria: { enabled: true, decal: { show: false } },
      tooltip: {
        backgroundColor: 'rgba(20,23,29,0.97)',
        borderColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        padding: [9, 12],
        textStyle: { color: INK, fontSize: 12 },
        extraCssText: 'border-radius:9px;box-shadow:0 18px 44px -22px rgba(0,0,0,.9);'
      }
    };
  }

  function axisCommon(name) {
    return {
      nameTextStyle: { color: MUTED, fontSize: 11 },
      axisLine: { lineStyle: { color: '#333a47' } },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11 },
      splitLine: { lineStyle: { color: GRID, type: 'solid', width: 1 } },
      name: name
    };
  }

  function getChart(id) {
    if (!charts[id]) charts[id] = echarts.init(document.getElementById(id), null, { renderer: 'canvas' });
    return charts[id];
  }

  function renderCharts(sel) {
    if (!sel.unidades.length) {
      ['ch-distritos', 'ch-scatter', 'ch-precios', 'ch-dorm', 'ch-entregas', 'ch-firmas', 'ch-etapas']
        .forEach(function (id) {
          getChart(id).setOption({
            aria: { enabled: true, description: 'Sin detalle de unidades para los filtros seleccionados.' },
            xAxis: { show: false }, yAxis: { show: false }, series: [],
            graphic: [{ type: 'text', left: 'center', top: 'middle',
              style: { text: 'Sin detalle de unidades', fill: MUTED, fontSize: 13 } }]
          }, true);
        });
      return;
    }
    chartDistritos(sel);
    chartScatter(sel);
    chartPrecios(sel);
    chartDorm(sel);
    chartEntregas(sel);
    chartFirmas(sel);
    chartEtapas(sel);
  }

  function chartDistritos(sel) {
    var agg = {};
    sel.proyectos.forEach(function (p) {
      var a = agg[p.distrito] || (agg[p.distrito] = { m2: [], u: 0, n: 0 });
      a.n++;
      a.u += p.unidades;
      (unitsByLink[p.link] || []).forEach(function (u) {
        if (u.precio_m2 && unitPasses(u)) a.m2.push(u.precio_m2);
      });
    });
    var allRows = Object.keys(agg).map(function (d) {
      return { d: d, v: median(agg[d].m2), u: agg[d].u, n: agg[d].n };
    }).filter(function (r) { return r.v; }).sort(function (a, b) { return a.v - b.v; });
    var rows = isMobile() && !view.districtsExpanded ? allRows.slice(-10) : allRows;
    var more = document.getElementById('districts-more');
    more.hidden = !isMobile() || allRows.length <= 10;
    more.textContent = view.districtsExpanded ? 'Ver los 10 principales' : 'Ver todos los distritos';

    var c = getChart('ch-distritos');
    var opt = baseOption();
    opt.aria.description = 'Comparación del precio mediano por metro cuadrado entre distritos.';
    opt.grid = { left: 8, right: isMobile() ? 46 : 58, top: 12, bottom: 8, containLabel: true };
    opt.xAxis = Object.assign(axisCommon(''), {
      type: 'value',
      splitNumber: isMobile() ? 3 : 5,
      axisLabel: { color: MUTED, fontSize: 11, hideOverlap: true, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.yAxis = Object.assign(axisCommon(''), {
      type: 'category',
      data: rows.map(function (r) { return r.d; }),
      splitLine: { show: false },
      axisLabel: { color: INK2, fontSize: 11 }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'item',
      formatter: function (p) {
        var r = rows[p.dataIndex];
        return '<b>' + esc(r.d) + '</b><br>' +
          '<span style="font-size:15px;font-weight:600">' + fmtSoles(r.v) + ' /m²</span><br>' +
          '<span style="color:' + INK2 + '">' + fmtInt(r.n) + ' proyectos · ' + fmtInt(r.u) + ' unidades</span><br>' +
          '<span style="color:' + MUTED + '">Clic para filtrar</span>';
      }
    });
    opt.series = [{
      type: 'bar',
      data: rows.map(function (r) { return r.v; }),
      barMaxWidth: 16,
      itemStyle: { color: '#3987e5', borderRadius: [0, 4, 4, 0] },
      label: {
        show: true, position: 'right', color: INK2, fontSize: 11,
        formatter: function (p) { return fmtCompact(p.value); }
      }
    }];
    c.setOption(opt, true);
    c.off('click');
    c.on('click', function (p) { toggleFilter('distrito', rows[p.dataIndex].d); });
  }

  function chartScatter(sel) {
    var series = DORM_ORDEN.map(function (k) {
      return {
        name: k + (k === '4+' ? ' dorms' : k === '1' ? ' dorm' : ' dorms'),
        type: 'scatter',
        symbolSize: 7,
        large: true,
        largeThreshold: 1200,
        itemStyle: { color: DORM_COLOR[k], opacity: 0.72 },
        emphasis: { itemStyle: { opacity: 1, borderColor: SURFACE, borderWidth: 2 } },
        data: []
      };
    });
    var idx = {};
    DORM_ORDEN.forEach(function (k, i) { idx[k] = i; });

    sel.unidades.forEach(function (u) {
      var b = dormBucket(u.dorm);
      if (!b || !u.area || !u.precio_pen) return;
      var p = byLink[u.link];
      series[idx[b]].data.push([u.area, u.precio_pen, p ? p.nombre : '', p ? p.distrito : '', u.modelo, u.unidades]);
    });

    var c = getChart('ch-scatter');
    var opt = baseOption();
    opt.aria.description = 'Relación entre el área y el precio de los modelos de vivienda disponibles.';
    opt.grid = { left: 8, right: 16, top: isMobile() ? 58 : 40, bottom: 8, containLabel: true };
    opt.legend = {
      top: 0, right: 0, left: isMobile() ? 0 : 'auto', icon: 'circle', itemWidth: 9, itemHeight: 9,
      textStyle: { color: INK2, fontSize: 11 }, inactiveColor: '#4a4f5c'
    };
    opt.xAxis = Object.assign(axisCommon('m²'), {
      type: 'value', scale: true, splitNumber: isMobile() ? 4 : 6,
      axisLabel: { color: MUTED, fontSize: 11, hideOverlap: true },
      splitLine: { lineStyle: { color: GRID } }
    });
    opt.yAxis = Object.assign(axisCommon('S/'), {
      type: 'value', scale: true,
      axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'item',
      formatter: function (p) {
        var d = p.data;
        return '<b>' + esc(d[2]) + '</b><br>' +
          '<span style="color:' + INK2 + '">' + esc(d[3]) + ' · Modelo ' + esc(d[4]) + '</span><br>' +
          '<span style="font-size:15px;font-weight:600">' + fmtSoles(d[1]) + '</span><br>' +
          '<span style="color:' + INK2 + '">' + fmtArea(d[0]) + ' · ' + fmtSoles(d[1] / d[0]) + ' /m² · ' +
          fmtInt(d[5]) + ' unid.</span>';
      }
    });
    opt.series = series;
    c.setOption(opt, true);
  }

  function chartPrecios(sel) {
    var vals = sel.unidades.filter(function (u) { return u.precio_pen; });
    var bins = [
      [0, 200000], [200000, 300000], [300000, 400000], [400000, 500000],
      [500000, 700000], [700000, 1000000], [1000000, Infinity]
    ];
    var labels = ['< 200 K', '200–300 K', '300–400 K', '400–500 K', '500–700 K', '700 K–1 M', '> 1 M'];
    var counts = bins.map(function () { return 0; });
    vals.forEach(function (u) {
      for (var i = 0; i < bins.length; i++) {
        if (u.precio_pen >= bins[i][0] && u.precio_pen < bins[i][1]) { counts[i] += u.unidades; break; }
      }
    });

    var c = getChart('ch-precios');
    var opt = baseOption();
    opt.aria.description = 'Distribución de unidades disponibles por rango de precio.';
    opt.grid = Object.assign({}, BASE_GRID, { top: 16 });
    opt.xAxis = Object.assign(axisCommon(''), {
      type: 'category', data: labels, splitLine: { show: false },
      axisLabel: { color: MUTED, fontSize: 10, interval: 0, rotate: 34 }
    });
    opt.yAxis = Object.assign(axisCommon(''), {
      type: 'value',
      axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.05)' } },
      formatter: function (ps) {
        var p = ps[0];
        return '<b>' + esc(p.name) + '</b><br><span style="font-size:15px;font-weight:600">' +
          fmtInt(p.value) + '</span> <span style="color:' + INK2 + '">unidades</span>';
      }
    });
    opt.series = [{
      type: 'bar', data: counts, barMaxWidth: 24,
      itemStyle: { color: '#3987e5', borderRadius: [4, 4, 0, 0] }
    }];
    c.setOption(opt, true);
  }

  function chartDorm(sel) {
    var agg = {};
    sel.unidades.forEach(function (u) {
      var b = dormBucket(u.dorm);
      if (!b) return;
      agg[b] = (agg[b] || 0) + u.unidades;
    });
    var data = DORM_ORDEN.filter(function (k) { return agg[k]; }).map(function (k) {
      return { name: k + (k === '1' ? ' dormitorio' : ' dormitorios'), value: agg[k], itemStyle: { color: DORM_COLOR[k] } };
    });
    var total = data.reduce(function (a, d) { return a + d.value; }, 0);

    var c = getChart('ch-dorm');
    var opt = baseOption();
    opt.aria.description = 'Proporción de unidades según el número de dormitorios.';
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'item',
      formatter: function (p) {
        return '<b>' + esc(p.name) + '</b><br><span style="font-size:15px;font-weight:600">' +
          fmtInt(p.value) + '</span> <span style="color:' + INK2 + '">unidades · ' + p.percent + '%</span>';
      }
    });
    opt.legend = {
      bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9,
      textStyle: { color: INK2, fontSize: 11 }, inactiveColor: '#4a4f5c'
    };
    opt.series = [{
      type: 'pie',
      radius: ['52%', '76%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: SURFACE, borderWidth: 2 },   // separador de 2px
      label: {
        show: true, position: 'outside', color: INK2, fontSize: 11,
        formatter: function (p) { return p.percent < 1 ? '<1 %' : Math.round(p.percent) + ' %'; }
      },
      labelLine: { lineStyle: { color: '#333a47' }, length: 8, length2: 8 },
      data: data
    }];
    opt.graphic = total ? [{
      type: 'text', left: 'center', top: '40%',
      style: { text: fmtCompact(total), fill: INK, fontSize: 24, fontWeight: 600, fontFamily: 'system-ui' }
    }, {
      type: 'text', left: 'center', top: '52%',
      style: { text: 'con dato de dorms.', fill: MUTED, fontSize: 11, fontFamily: 'system-ui' }
    }] : [];
    c.setOption(opt, true);
  }

  function chartEntregas(sel) {
    var buckets = {};
    sel.unidades.forEach(function (u) {
      var t = u.inmediata ? 'Inmediata' : (u.trimestre || 'Sin fecha');
      var p = byLink[u.link];
      var etapa = p ? p.etapa : 'Sin etapa';
      (buckets[t] || (buckets[t] = {}))[etapa] = (buckets[t][etapa] || 0) + u.unidades;
    });
    var keys = Object.keys(buckets).sort(function (a, b) {
      if (a === 'Inmediata') return -1;
      if (b === 'Inmediata') return 1;
      if (a === 'Sin fecha') return 1;
      if (b === 'Sin fecha') return -1;
      return a.localeCompare(b);
    });

    var series = ETAPA_ORDEN.filter(function (e) {
      return keys.some(function (k) { return buckets[k][e]; });
    }).map(function (e) {
      return {
        name: e, type: 'bar', stack: 'total', barMaxWidth: 24,
        itemStyle: { color: ETAPA_COLOR[e], borderColor: SURFACE, borderWidth: 2 },
        data: keys.map(function (k) { return buckets[k][e] || 0; })
      };
    });

    var c = getChart('ch-entregas');
    var opt = baseOption();
    opt.aria.description = 'Cantidad de unidades por trimestre de entrega y etapa del proyecto.';
    opt.grid = Object.assign({}, BASE_GRID, { top: isMobile() ? 54 : 34 });
    opt.legend = {
      top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10,
      textStyle: { color: INK2, fontSize: 11 }, inactiveColor: '#4a4f5c'
    };
    opt.xAxis = Object.assign(axisCommon(''), {
      type: 'category', data: keys, splitLine: { show: false },
      axisLabel: { color: MUTED, fontSize: 10, interval: 'auto', rotate: 45, hideOverlap: true }
    });
    opt.yAxis = Object.assign(axisCommon(''), {
      type: 'value',
      axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.05)' } },
      formatter: function (ps) {
        var total = ps.reduce(function (a, p) { return a + p.value; }, 0);
        var html = '<b>' + esc(ps[0].name) + '</b><br><span style="font-size:15px;font-weight:600">' +
          fmtInt(total) + '</span> <span style="color:' + INK2 + '">unidades</span><br>';
        ps.forEach(function (p) {
          if (!p.value) return;
          html += '<span style="display:inline-block;width:12px;height:2px;background:' +
            ETAPA_COLOR[p.seriesName] + ';vertical-align:middle;margin-right:6px"></span>' +
            '<span style="color:' + INK2 + '">' + esc(p.seriesName) + '</span> ' + fmtInt(p.value) + '<br>';
        });
        return html;
      }
    });
    opt.series = series;
    c.setOption(opt, true);
  }

  function chartFirmas(sel) {
    var agg = {};
    sel.proyectos.forEach(function (p) {
      var a = agg[p.inmobiliaria] || (agg[p.inmobiliaria] = { u: 0, n: 0, m2: [] });
      a.n++;
      a.u += p.unidades;
      if (p.precio_m2) a.m2.push(p.precio_m2);
    });
    var allRows = Object.keys(agg).map(function (k) {
      return { k: k, u: agg[k].u, n: agg[k].n, m2: median(agg[k].m2) };
    }).sort(function (a, b) { return b.u - a.u; });
    var limit = isMobile() && !view.firmsExpanded ? 8 : 15;
    var rows = allRows.slice(0, limit).reverse();
    var more = document.getElementById('firms-more');
    more.hidden = !isMobile() || allRows.length <= 8;
    more.textContent = view.firmsExpanded ? 'Ver las 8 principales' : 'Ver las 15 inmobiliarias';

    var c = getChart('ch-firmas');
    var opt = baseOption();
    opt.aria.description = 'Inmobiliarias ordenadas por cantidad de unidades disponibles.';
    opt.grid = { left: 8, right: 52, top: 12, bottom: 8, containLabel: true };
    opt.xAxis = Object.assign(axisCommon(''), {
      type: 'value',
      splitNumber: isMobile() ? 3 : 5,
      axisLabel: { color: MUTED, fontSize: 11, hideOverlap: true, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.yAxis = Object.assign(axisCommon(''), {
      type: 'category',
      data: rows.map(function (r) { return r.k.length > 26 ? r.k.slice(0, 25) + '…' : r.k; }),
      splitLine: { show: false },
      axisLabel: { color: INK2, fontSize: 11 }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'item',
      formatter: function (p) {
        var r = rows[p.dataIndex];
        return '<b>' + esc(r.k) + '</b><br><span style="font-size:15px;font-weight:600">' + fmtInt(r.u) +
          '</span> <span style="color:' + INK2 + '">unidades en ' + fmtInt(r.n) + ' proyectos</span><br>' +
          '<span style="color:' + INK2 + '">' + (r.m2 ? fmtSoles(r.m2) + ' /m² mediano' : 'Sin precio publicado') + '</span><br>' +
          '<span style="color:' + MUTED + '">Clic para filtrar</span>';
      }
    });
    opt.series = [{
      type: 'bar', data: rows.map(function (r) { return r.u; }), barMaxWidth: 16,
      itemStyle: { color: '#3987e5', borderRadius: [0, 4, 4, 0] },
      label: {
        show: true, position: 'right', color: INK2, fontSize: 11,
        formatter: function (p) { return fmtCompact(p.value); }
      }
    }];
    c.setOption(opt, true);
    c.off('click');
    c.on('click', function (p) { toggleFilter('inmobiliaria', rows[p.dataIndex].k); });
  }

  function chartEtapas(sel) {
    var agg = {};
    sel.proyectos.forEach(function (p) {
      var a = agg[p.distrito] || (agg[p.distrito] = { total: 0 });
      a[p.etapa] = (a[p.etapa] || 0) + p.unidades;
      a.total += p.unidades;
    });
    var keys = Object.keys(agg).sort(function (a, b) { return agg[a].total - agg[b].total; }).slice(-12);

    var series = ETAPA_ORDEN.filter(function (e) {
      return keys.some(function (k) { return agg[k][e]; });
    }).map(function (e) {
      return {
        name: e, type: 'bar', stack: 'total', barMaxWidth: 18,
        itemStyle: { color: ETAPA_COLOR[e], borderColor: SURFACE, borderWidth: 2 },
        data: keys.map(function (k) { return agg[k][e] || 0; })
      };
    });

    var c = getChart('ch-etapas');
    var opt = baseOption();
    opt.aria.description = 'Unidades por etapa del proyecto en los distritos con mayor oferta.';
    opt.grid = { left: 8, right: 22, top: 34, bottom: 8, containLabel: true };
    opt.legend = {
      top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10,
      textStyle: { color: INK2, fontSize: 11 }, inactiveColor: '#4a4f5c'
    };
    opt.xAxis = Object.assign(axisCommon(''), {
      type: 'value',
      splitNumber: isMobile() ? 3 : 5,
      axisLabel: { color: MUTED, fontSize: 11, hideOverlap: true, formatter: function (v) { return fmtCompact(v); } }
    });
    opt.yAxis = Object.assign(axisCommon(''), {
      type: 'category', data: keys, splitLine: { show: false },
      axisLabel: { color: INK2, fontSize: 11 }
    });
    opt.tooltip = Object.assign(opt.tooltip, {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.05)' } },
      formatter: function (ps) {
        var total = ps.reduce(function (a, p) { return a + p.value; }, 0);
        var html = '<b>' + esc(ps[0].name) + '</b><br><span style="font-size:15px;font-weight:600">' +
          fmtInt(total) + '</span> <span style="color:' + INK2 + '">unidades disponibles</span><br>';
        ps.forEach(function (p) {
          if (!p.value) return;
          html += '<span style="display:inline-block;width:12px;height:2px;background:' +
            ETAPA_COLOR[p.seriesName] + ';vertical-align:middle;margin-right:6px"></span>' +
            '<span style="color:' + INK2 + '">' + esc(p.seriesName) + '</span> ' + fmtInt(p.value) + '<br>';
        });
        return html;
      }
    });
    opt.series = series;
    c.setOption(opt, true);
    c.off('click');
    c.on('click', function (p) { toggleFilter('distrito', keys[p.dataIndex]); });
  }

  // ----------------------------------------------------------------- tabla --
  var tableRows = [];

  function buildTableRows(sel) {
    var q = view.search.trim().toLowerCase();
    var rows = sel.unidades.map(function (u) {
      var p = byLink[u.link] || {};
      return {
        proyecto: p.nombre || '', distrito: p.distrito || '', inmobiliaria: p.inmobiliaria || '',
        etapa: p.etapa || '', modelo: u.modelo || '', dorm: u.dorm, area: u.area,
        precio_pen: u.precio_pen, precio_m2: u.precio_m2, unidades: u.unidades,
        entrega: u.inmediata ? 'Inmediata' : (u.entrega || ''), divisa: u.divisa, link: p.link
      };
    });
    if (q) {
      rows = rows.filter(function (r) {
        return (r.proyecto + ' ' + r.inmobiliaria + ' ' + r.modelo + ' ' + r.distrito).toLowerCase().indexOf(q) !== -1;
      });
    }
    var k = view.sort.key, dir = view.sort.dir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      if (typeof x === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'es') * dir;
    });
    return rows;
  }

  function renderTable(sel) {
    tableRows = buildTableRows(sel);
    view.rendered = 0;
    document.getElementById('tbody').innerHTML = '';
    document.getElementById('unit-cards').innerHTML = '';
    appendRows();
    text('table-sub', fmtInt(tableRows.length) + ' modelos · ' +
      fmtInt(tableRows.reduce(function (a, r) { return a + r.unidades; }, 0)) + ' unidades disponibles');
  }

  function appendRows() {
    var tbody = document.getElementById('tbody');
    var cards = document.getElementById('unit-cards');
    var mobile = isMobile();
    var end = Math.min(view.rendered + (mobile ? 40 : 80), tableRows.length);
    var frag = document.createDocumentFragment();

    for (var i = view.rendered; i < end; i++) {
      var r = tableRows[i];
      if (mobile) {
        frag.appendChild(unitCard(r));
        continue;
      }
      var tr = document.createElement('tr');

      tr.appendChild(projectCell(r));
      tr.appendChild(cell(r.distrito));

      // La etapa lleva punto de color + texto: el color nunca va solo.
      var td = document.createElement('td');
      var tag = document.createElement('span');
      tag.className = 'tag';
      var dot = document.createElement('i');
      dot.style.background = ETAPA_COLOR[r.etapa] || MUTED;
      tag.appendChild(dot);
      tag.appendChild(document.createTextNode(r.etapa || '—'));
      td.appendChild(tag);
      tr.appendChild(td);

      tr.appendChild(cell(r.inmobiliaria));
      tr.appendChild(cell(r.modelo));
      tr.appendChild(cell(r.dorm || '—', 'num'));
      tr.appendChild(cell(r.area ? nf1.format(r.area) : '—', 'num'));
      tr.appendChild(cell(r.precio_pen ? fmtInt(r.precio_pen) : '—', 'num strong'));
      tr.appendChild(cell(r.precio_m2 ? fmtInt(r.precio_m2) : '—', 'num'));
      tr.appendChild(cell(fmtInt(r.unidades), 'num'));
      tr.appendChild(cell(r.entrega === 'Inmediata' ? 'Inmediata' : fmtFecha(r.entrega)));

      frag.appendChild(tr);
    }
    if (mobile) cards.appendChild(frag); else tbody.appendChild(frag);
    view.rendered = end;

    var load = document.getElementById('unit-load-more');
    load.hidden = !mobile || view.rendered >= tableRows.length;

    text('table-foot', tableRows.length
      ? 'Mostrando ' + fmtInt(view.rendered) + ' de ' + fmtInt(tableRows.length) + ' modelos'
      : 'Ningún modelo cumple los filtros actuales');
  }

  function projectCell(r) {
    var td = document.createElement('td');
    td.className = 'strong';
    var url = safeUrl(r.link);
    if (!url) {
      td.textContent = r.proyecto;
      return td;
    }
    var a = document.createElement('a');
    a.className = 'project-table-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = r.proyecto;
    td.appendChild(a);
    return td;
  }

  function unitCard(r) {
    var details = document.createElement('details');
    details.className = 'unit-card';
    var summary = document.createElement('summary');

    var title = document.createElement('span');
    title.className = 'unit-card-name';
    title.textContent = r.proyecto;
    var place = document.createElement('span');
    place.className = 'unit-card-place';
    place.textContent = r.distrito + ' · ' + r.modelo;
    title.appendChild(place);

    var price = document.createElement('span');
    price.className = 'unit-card-price';
    price.textContent = r.precio_pen ? fmtSoles(r.precio_pen) : 'Consultar';
    var m2 = document.createElement('small');
    m2.textContent = r.precio_m2 ? fmtSoles(r.precio_m2) + ' /m²' : 'Sin precio por m²';
    price.appendChild(m2);

    var highlights = document.createElement('span');
    highlights.className = 'unit-card-highlights';
    [r.dorm ? r.dorm + ' dorm.' : 'Sin dorm.', r.area ? nf1.format(r.area) + ' m²' : 'Sin área',
      fmtInt(r.unidades) + ' unid.'].forEach(function (value) {
      var pill = document.createElement('span');
      pill.textContent = value;
      highlights.appendChild(pill);
    });
    summary.appendChild(title);
    summary.appendChild(price);
    summary.appendChild(highlights);

    var body = document.createElement('div');
    body.className = 'unit-card-body';
    [['Inmobiliaria', r.inmobiliaria], ['Etapa', r.etapa],
      ['Entrega', r.entrega === 'Inmediata' ? 'Inmediata' : (r.entrega ? fmtFecha(r.entrega) : '—')],
      ['Modelo', r.modelo || '—']].forEach(function (pair) {
      var item = document.createElement('span');
      var label = document.createElement('b');
      label.textContent = pair[0];
      item.appendChild(label);
      item.appendChild(document.createTextNode(pair[1] || '—'));
      body.appendChild(item);
    });
    var url = safeUrl(r.link);
    if (url) {
      var link = document.createElement('a');
      link.className = 'unit-card-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Ver proyecto';
      body.appendChild(link);
    }
    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function cell(value, cls) {
    var td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = value === null || value === undefined ? '—' : String(value);
    return td;
  }

  function exportCsv() {
    var cols = ['proyecto', 'distrito', 'inmobiliaria', 'etapa', 'modelo', 'dorm', 'area',
                'precio_pen', 'precio_m2', 'unidades', 'entrega', 'divisa', 'link'];
    var lines = [cols.join(',')];
    tableRows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c];
        if (v === null || v === undefined) return '';
        var s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'unidades-lima.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---------------------------------------------------------------- filtros --
  var FILTER_DEFS = {
    distrito: { label: 'Distrito', kind: 'multi', search: true },
    etapa: { label: 'Etapa', kind: 'multi' },
    inmobiliaria: { label: 'Inmobiliaria', kind: 'multi', search: true },
    dorm: { label: 'Dormitorios', kind: 'multi' },
    tipo: { label: 'Tipo', kind: 'multi' },
    entrega: { label: 'Entrega', kind: 'multi' },
    precio: { label: 'Precio', kind: 'range', unit: 'S/', step: 10000 },
    area: { label: 'Área', kind: 'range', unit: 'm²', step: 5 }
  };

  function optionsFor(key) {
    var counts = {};
    var add = function (v) { if (v) counts[v] = (counts[v] || 0) + 1; };

    if (key === 'distrito') DATA.proyectos.forEach(function (p) { add(p.distrito); });
    else if (key === 'etapa') DATA.proyectos.forEach(function (p) { add(p.etapa); });
    else if (key === 'inmobiliaria') DATA.proyectos.forEach(function (p) { add(p.inmobiliaria); });
    else if (key === 'dorm') DATA.unidades.forEach(function (u) { add(dormBucket(u.dorm)); });
    else if (key === 'tipo') DATA.unidades.forEach(function (u) { add(u.tipo); });
    else if (key === 'entrega') DATA.unidades.forEach(function (u) { add(entregaBucket(u)); });

    var keys = Object.keys(counts);
    if (key === 'dorm') keys.sort(function (a, b) { return DORM_ORDEN.indexOf(a) - DORM_ORDEN.indexOf(b); });
    else if (key === 'etapa') keys.sort(function (a, b) { return ETAPA_ORDEN.indexOf(a) - ETAPA_ORDEN.indexOf(b); });
    else if (key === 'inmobiliaria') keys.sort(function (a, b) { return counts[b] - counts[a]; });
    else if (key === 'entrega') keys.sort(function (a, b) {
      if (a === 'Inmediata') return -1;
      if (b === 'Inmediata') return 1;
      return a.localeCompare(b, 'es');
    });
    else keys.sort(function (a, b) { return a.localeCompare(b, 'es'); });

    return keys.map(function (k) { return { value: k, n: counts[k] }; });
  }

  function buildFilters() {
    var activeFilterButton = null;
    document.querySelectorAll('.filter').forEach(function (wrap) {
      var key = wrap.dataset.filter;
      var def = FILTER_DEFS[key];
      var btn = wrap.querySelector('.filter-btn');
      var pop = document.createElement('div');
      pop.className = 'popover';
      pop.hidden = true;
      pop.id = 'filter-' + key + '-popover';
      pop.setAttribute('role', 'group');
      pop.setAttribute('aria-label', 'Opciones de ' + def.label.toLowerCase());
      btn.id = 'filter-' + key + '-button';
      btn.setAttribute('aria-controls', pop.id);
      if (key === 'precio' || key === 'area') pop.classList.add('align-right');
      wrap.appendChild(pop);

      if (def.kind === 'multi') buildMultiPopover(pop, key, def);
      else buildRangePopover(pop, key, def);

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !pop.hidden;
        closeAllPopovers();
        if (!open) {
          activeFilterButton = btn;
          pop.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          var s = pop.querySelector('input[type="search"]');
          if (s) s.focus();
        }
      });
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    document.addEventListener('click', closeAllPopovers);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.querySelector('.popover:not([hidden])')) {
        closeAllPopovers();
        if (activeFilterButton) activeFilterButton.focus();
      }
    });
  }

  function closeAllPopovers() {
    document.querySelectorAll('.popover').forEach(function (p) { p.hidden = true; });
    document.querySelectorAll('.filter-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  function buildMultiPopover(pop, key, def) {
    var opts = optionsFor(key);

    if (def.search) {
      var input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Buscar ' + def.label.toLowerCase() + '…';
      input.setAttribute('aria-label', 'Buscar ' + def.label);
      pop.appendChild(input);
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        pop.querySelectorAll('.opt').forEach(function (li) {
          li.style.display = li.dataset.value.toLowerCase().indexOf(q) === -1 ? 'none' : '';
        });
      });
    }

    var ul = document.createElement('ul');
    ul.className = 'opt-list';
    opts.forEach(function (o) {
      var li = document.createElement('li');
      li.className = 'opt';
      li.dataset.value = o.value;

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'filter-' + key + '-' + Math.random().toString(36).slice(2, 9);
      cb.checked = F[key].indexOf(o.value) !== -1;
      cb.addEventListener('change', function () {
        setFilterValue(key, o.value, cb.checked);
      });

      var label = document.createElement('label');
      label.className = 'opt-label';
      label.htmlFor = cb.id;
      label.textContent = o.value;

      var n = document.createElement('span');
      n.className = 'opt-n';
      n.textContent = fmtInt(o.n);

      li.appendChild(cb);
      if (key === 'etapa') {
        var sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = ETAPA_COLOR[o.value] || MUTED;
        li.appendChild(sw);
      }
      li.appendChild(label);
      li.appendChild(n);
      li.addEventListener('click', function (e) {
        if (e.target !== cb && e.target !== label) {
          cb.checked = !cb.checked;
          setFilterValue(key, o.value, cb.checked);
        }
      });
      ul.appendChild(li);
    });
    pop.appendChild(ul);

    var foot = document.createElement('div');
    foot.className = 'pop-foot';
    var clear = document.createElement('button');
    clear.className = 'link-btn';
    clear.type = 'button';
    clear.textContent = 'Quitar selección';
    clear.addEventListener('click', function () {
      F[key] = [];
      syncCheckboxes(pop, key);
      render();
    });
    var close = document.createElement('button');
    close.className = 'link-btn';
    close.type = 'button';
    close.textContent = 'Cerrar';
    close.addEventListener('click', closeAllPopovers);
    foot.appendChild(clear);
    foot.appendChild(close);
    pop.appendChild(foot);

    pop._sync = function () { syncCheckboxes(pop, key); };
  }

  function syncCheckboxes(pop, key) {
    pop.querySelectorAll('.opt').forEach(function (li) {
      li.querySelector('input[type="checkbox"]').checked = F[key].indexOf(li.dataset.value) !== -1;
    });
  }

  function buildRangePopover(pop, key, def) {
    var lo = BOUNDS[key][0], hi = BOUNDS[key][1];

    var box = document.createElement('div');
    box.className = 'range-box';

    var vals = document.createElement('div');
    vals.className = 'range-vals';
    var vLo = document.createElement('span');
    var vHi = document.createElement('span');
    vals.appendChild(vLo);
    vals.appendChild(vHi);
    box.appendChild(vals);

    var dual = document.createElement('div');
    dual.className = 'dual';
    var track = document.createElement('div');
    track.className = 'track';
    var fill = document.createElement('div');
    fill.className = 'fill';
    var min = document.createElement('input');
    var max = document.createElement('input');
    [min, max].forEach(function (i) {
      i.type = 'range';
      i.min = String(lo);
      i.max = String(hi);
      i.step = String(def.step);
    });
    min.value = String(F[key] ? F[key][0] : lo);
    max.value = String(F[key] ? F[key][1] : hi);
    min.setAttribute('aria-label', def.label + ' mínimo');
    max.setAttribute('aria-label', def.label + ' máximo');

    dual.appendChild(track);
    dual.appendChild(fill);
    dual.appendChild(min);
    dual.appendChild(max);
    box.appendChild(dual);
    pop.appendChild(box);

    function paint() {
      var a = Math.min(+min.value, +max.value), b = Math.max(+min.value, +max.value);
      var pa = (a - lo) / (hi - lo) * 100, pb = (b - lo) / (hi - lo) * 100;
      fill.style.left = pa + '%';
      fill.style.width = (pb - pa) + '%';
      vLo.textContent = key === 'precio' ? fmtSoles(a) : nf1.format(a) + ' m²';
      vHi.textContent = (key === 'precio' ? fmtSoles(b) : nf1.format(b) + ' m²') + (b >= hi ? ' o más' : '');
    }

    function commit() {
      var a = Math.min(+min.value, +max.value), b = Math.max(+min.value, +max.value);
      F[key] = (a <= lo && b >= hi) ? null : [a, b];
      render();
    }

    [min, max].forEach(function (i) {
      i.addEventListener('input', paint);
      i.addEventListener('change', commit);
    });

    var foot = document.createElement('div');
    foot.className = 'pop-foot';
    var reset = document.createElement('button');
    reset.className = 'link-btn';
    reset.type = 'button';
    reset.textContent = 'Todo el rango';
    reset.addEventListener('click', function () {
      min.value = String(lo);
      max.value = String(hi);
      F[key] = null;
      paint();
      render();
    });
    var close = document.createElement('button');
    close.className = 'link-btn';
    close.type = 'button';
    close.textContent = 'Cerrar';
    close.addEventListener('click', closeAllPopovers);
    foot.appendChild(reset);
    foot.appendChild(close);
    pop.appendChild(foot);

    paint();
    pop._sync = function () {
      min.value = String(F[key] ? F[key][0] : lo);
      max.value = String(F[key] ? F[key][1] : hi);
      paint();
    };
  }

  function setFilterValue(key, value, on) {
    var i = F[key].indexOf(value);
    if (on && i === -1) F[key].push(value);
    if (!on && i !== -1) F[key].splice(i, 1);
    render();
  }

  function toggleFilter(key, value) {
    var i = F[key].indexOf(value);
    if (i === -1) F[key].push(value); else F[key].splice(i, 1);
    syncAllPopovers();
    render();
  }

  function syncAllPopovers() {
    document.querySelectorAll('.popover').forEach(function (p) { if (p._sync) p._sync(); });
  }

  function resetFilters() {
    Object.keys(F).forEach(function (k) { F[k] = Array.isArray(F[k]) ? [] : null; });
    view.search = '';
    view.projectQuery = '';
    view.selectedLink = null;
    document.getElementById('table-search').value = '';
    document.getElementById('project-search').value = '';
    closeProjectSheet(false);
    if (map) map.closePopup();
    syncAllPopovers();
    render();
  }

  function renderFilterButtons() {
    var total = 0;
    document.querySelectorAll('.filter').forEach(function (wrap) {
      var key = wrap.dataset.filter;
      var def = FILTER_DEFS[key];
      var btn = wrap.querySelector('.filter-btn');
      var active = def.kind === 'multi' ? F[key].length > 0 : F[key] !== null;

      btn.classList.toggle('is-active', active);
      if (active) total += def.kind === 'multi' ? F[key].length : 1;
      var old = btn.querySelector('.count');
      if (old) old.remove();
      if (def.kind === 'multi' && F[key].length) {
        var c = document.createElement('span');
        c.className = 'count';
        c.textContent = String(F[key].length);
        btn.insertBefore(c, btn.querySelector('.chev'));
      }
    });
    var badge = document.getElementById('filter-total');
    badge.textContent = String(total);
    badge.hidden = !total;
    var hasAny = total > 0 || !!view.projectQuery || !!view.search;
    document.getElementById('btn-reset').disabled = !hasAny;
    document.getElementById('btn-reset-mobile').disabled = !hasAny;
  }

  function renderChips() {
    var box = document.getElementById('chips');
    box.innerHTML = '';
    var any = false;

    Object.keys(FILTER_DEFS).forEach(function (key) {
      var def = FILTER_DEFS[key];
      if (def.kind === 'multi') {
        F[key].forEach(function (v) {
          any = true;
          box.appendChild(chip(def.label + ': ' + v, function () { toggleFilter(key, v); }));
        });
      } else if (F[key]) {
        any = true;
        var txt = key === 'precio'
          ? 'Precio: ' + fmtCompact(F[key][0]) + ' – ' + fmtCompact(F[key][1])
          : 'Área: ' + nf1.format(F[key][0]) + ' – ' + nf1.format(F[key][1]) + ' m²';
        box.appendChild(chip(txt, function () {
          F[key] = null;
          syncAllPopovers();
          render();
        }));
      }
    });

    if (any) {
      var note = document.createElement('span');
      note.style.color = MUTED;
      note.style.fontSize = '12px';
      note.textContent = unitFiltersActive()
        ? 'Con filtros de unidad activos solo aparecen proyectos con al menos un modelo que los cumple.'
        : '';
      box.appendChild(note);
    }
  }

  function chip(label, onRemove) {
    var el = document.createElement('span');
    el.className = 'chip';
    el.appendChild(document.createTextNode(label));
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Quitar filtro ' + label);
    b.appendChild(iconUse('icon-close'));
    b.addEventListener('click', onRemove);
    el.appendChild(b);
    return el;
  }

  // ------------------------------------------------------------ URL state --
  function writeHash() {
    var parts = [];
    Object.keys(F).forEach(function (k) {
      if (Array.isArray(F[k])) {
        if (F[k].length) parts.push(k + '=' + encodeURIComponent(F[k].join('|')));
      } else if (F[k]) {
        parts.push(k + '=' + F[k][0] + '~' + F[k][1]);
      }
    });
    var hash = parts.length ? '#' + parts.join('&') : '';
    if (hash !== window.location.hash) history.replaceState(null, '', window.location.pathname + hash);
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i === -1) return;
      var k = pair.slice(0, i), v = decodeURIComponent(pair.slice(i + 1));
      if (!(k in F)) return;
      if (Array.isArray(F[k])) F[k] = v.split('|');
      else {
        var r = v.split('~').map(Number);
        if (r.length === 2 && isFinite(r[0]) && isFinite(r[1])) F[k] = r;
      }
    });
  }

  // ---------------------------------------------------------------- render --
  var raf = null;
  function render() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var sel = computeSelection();
      lastSelection = sel;
      if (view.selectedLink && !sel.proyectos.some(function (p) { return p.link === view.selectedLink; })) {
        view.selectedLink = null;
        pinned = null;
        closeProjectSheet(false);
        if (map) map.closePopup();
      }
      renderFilterButtons();
      renderChips();
      renderProjectResults(sel, false);
      renderKpis(sel);
      renderMap(sel);
      if (chartsActivated) renderCharts(sel); else pendingChartSelection = sel;
      renderTable(sel);
      writeHash();
    });
  }

  function setupChartsObserver() {
    var section = document.querySelector('.charts');
    if (!window.IntersectionObserver) {
      chartsActivated = true;
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      chartsActivated = true;
      renderCharts(pendingChartSelection || lastSelection);
      observer.disconnect();
    }, { rootMargin: '500px 0px' });
    observer.observe(section);
  }

  // ------------------------------------------------------------------ init --
  function init(data, geo) {
    DATA = data;
    GEO = geo;

    DATA.proyectos.forEach(function (p) { byLink[p.link] = p; });
    DATA.unidades.forEach(function (u) {
      (unitsByLink[u.link] || (unitsByLink[u.link] = [])).push(u);
    });

    var precios = DATA.unidades.map(function (u) { return u.precio_pen; }).filter(function (v) { return v; });
    var areas = DATA.unidades.map(function (u) { return u.area; }).filter(function (v) { return v; });
    BOUNDS.precio = [0, Math.ceil(Math.max.apply(null, precios) / 10000) * 10000];
    BOUNDS.area = [Math.floor(Math.min.apply(null, areas) / 5) * 5, Math.ceil(Math.max.apply(null, areas) / 5) * 5];

    text('meta-fecha', 'Actualizado ' + (DATA.meta.generado || '—'));
    text('meta-tc', 'US$ 1 = S/ ' + nf1.format(DATA.meta.usd_pen || 0));
    text('meta-cobertura', fmtInt(DATA.meta.n_proyectos) + ' proyectos · ' +
      fmtInt(DATA.meta.n_unidades) + ' modelos · ' + fmtInt(DATA.meta.n_distritos) + ' distritos');

    readHash();
    buildFilters();
    initMap();
    setupChartsObserver();

    document.getElementById('btn-reset').addEventListener('click', resetFilters);
    document.getElementById('btn-reset-mobile').addEventListener('click', resetFilters);
    document.getElementById('btn-export').addEventListener('click', exportCsv);

    var projectSearch = document.getElementById('project-search');
    var projectSearchTimer = null;
    projectSearch.addEventListener('input', function () {
      clearTimeout(projectSearchTimer);
      projectSearchTimer = setTimeout(function () {
        view.projectQuery = projectSearch.value.trim();
        view.selectedLink = null;
        pinned = null;
        closeProjectSheet(false);
        map.closePopup();
        render();
      }, 140);
    });

    document.getElementById('project-sort').addEventListener('change', function (e) {
      view.projectSort = e.target.value;
      renderProjectResults(lastSelection, false);
    });
    document.getElementById('project-load-more').addEventListener('click', function () {
      view.projectRendered = Math.min(view.projectRendered + 30, projectRows.length);
      renderProjectResults(lastSelection, true);
    });
    document.getElementById('unit-load-more').addEventListener('click', appendRows);

    var legendToggle = document.getElementById('legend-toggle');
    legendToggle.addEventListener('click', function () {
      var open = !document.getElementById('map-legend').classList.contains('is-open');
      document.getElementById('map-legend').classList.toggle('is-open', open);
      legendToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      legendToggle.textContent = open ? 'Ocultar leyenda' : 'Ver leyenda';
    });

    var filtersPanel = document.getElementById('filters');
    var filtersBackdrop = document.getElementById('filters-backdrop');
    var filtersToggle = document.getElementById('filters-toggle');
    function setFiltersOpen(open) {
      filtersPanel.classList.toggle('is-open', open);
      if (open && isMobile()) {
        filtersPanel.setAttribute('role', 'dialog');
        filtersPanel.setAttribute('aria-modal', 'true');
      } else {
        filtersPanel.removeAttribute('role');
        filtersPanel.removeAttribute('aria-modal');
      }
      filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      filtersBackdrop.hidden = !open;
      document.body.classList.toggle('sheet-open', open);
      if (open) setTimeout(function () { document.getElementById('filters-close').focus(); }, 0);
      else filtersToggle.focus();
    }
    filtersToggle.addEventListener('click', function () { setFiltersOpen(true); });
    document.getElementById('filters-close').addEventListener('click', function () { setFiltersOpen(false); });
    filtersBackdrop.addEventListener('click', function () { setFiltersOpen(false); });

    document.querySelectorAll('[data-sheet-close]').forEach(function (button) {
      button.addEventListener('click', function () { closeProjectSheet(true); });
    });
    document.addEventListener('keydown', function (e) {
      var sheet = document.getElementById('project-sheet');
      if (e.key === 'Escape') {
        if (!sheet.hidden) closeProjectSheet(true);
        else if (filtersPanel.classList.contains('is-open')) setFiltersOpen(false);
      }
      if (e.key !== 'Tab' || sheet.hidden) return;
      var focusable = Array.prototype.slice.call(sheet.querySelectorAll('button:not([hidden]),a:not([hidden])'));
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !filtersPanel.classList.contains('is-open') || !isMobile()) return;
      var focusable = Array.prototype.slice.call(filtersPanel.querySelectorAll('button:not([hidden]):not(:disabled),input:not([hidden]),select:not([hidden])'))
        .filter(function (el) { return el.offsetParent !== null; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    document.getElementById('districts-more').addEventListener('click', function () {
      view.districtsExpanded = !view.districtsExpanded;
      chartDistritos(lastSelection);
    });
    document.getElementById('firms-more').addEventListener('click', function () {
      view.firmsExpanded = !view.firmsExpanded;
      chartFirmas(lastSelection);
    });

    var searchBox = document.getElementById('table-search');
    var t = null;
    searchBox.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        view.search = searchBox.value;
        renderTable(computeSelection());
      }, 180);
    });

    document.querySelectorAll('thead th[data-sort]').forEach(function (th) {
      var button = th.querySelector('button');
      th.setAttribute('aria-sort', th.dataset.sort === view.sort.key
        ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      button.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (view.sort.key === key) view.sort.dir *= -1;
        else view.sort = { key: key, dir: typeof (tableRows[0] || {})[key] === 'number' ? -1 : 1 };
        document.querySelectorAll('thead th[data-sort]').forEach(function (h) { h.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', view.sort.dir === 1 ? 'ascending' : 'descending');
        renderTable(computeSelection());
      });
    });

    var scroll = document.getElementById('table-scroll');
    scroll.addEventListener('scroll', function () {
      if (view.rendered < tableRows.length &&
          scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 240) {
        appendRows();
      }
    });

    var rt = null;
    var wasMobile = isMobile();
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        Object.keys(charts).forEach(function (k) { charts[k].resize(); });
        if (map) map.invalidateSize();
        var nowMobile = isMobile();
        if (nowMobile !== wasMobile) {
          wasMobile = nowMobile;
          view.districtsExpanded = false;
          view.firmsExpanded = false;
          renderTable(lastSelection);
          if (chartsActivated) renderCharts(lastSelection);
          if (nowMobile && view.selectedLink && byLink[view.selectedLink]) {
            map.closePopup();
            openProjectSheet(byLink[view.selectedLink]);
          } else if (!nowMobile) {
            closeProjectSheet(false);
            setFiltersOpen(false);
            if (view.selectedLink && markerByLink[view.selectedLink]) markerByLink[view.selectedLink].openPopup();
          }
        }
      }, 160);
    });

    render();
    var loader = document.getElementById('loader');
    loader.classList.add('hide');
    loader.setAttribute('aria-hidden', 'true');
    setTimeout(function () { loader.hidden = true; }, 420);

    // Punto de entrada para depurar desde la consola del navegador.
    window.dashboard = {
      map: map, charts: charts, filtros: F, vista: view, render: render,
      seleccionarProyecto: selectProject,
      get fichaFijada() { return pinned; }
    };
  }

  Promise.all([
    fetch('data/dashboard.json').then(function (r) { return r.json(); }),
    fetch('data/districts.geojson').then(function (r) { return r.json(); })
  ]).then(function (res) {
    init(res[0], res[1]);
  }).catch(function (err) {
    console.error(err);
    var l = document.getElementById('loader');
    l.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = 'No pudimos cargar los proyectos. Comprueba tu conexión o vuelve a intentarlo.';
    l.appendChild(p);
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ghost-btn';
    retry.textContent = 'Volver a intentar';
    retry.style.margin = '14px auto';
    retry.addEventListener('click', function () { window.location.reload(); });
    l.appendChild(retry);
  });
})();
