/* Live-Büro Makler (Auftrag 07.11.2026).
   Bild, Figuren und Laufwege aus dem Büro vom 12.10.2026 (Standbild 1600er-Welt, Nacht-Ebene für leuchtende Bildschirme).
   Alle Inhalte (Pakete, Räume, Team, Preise, Abläufe, Demo-Ereignisse) kommen aus buero-daten.json.
   Ereignisse sind wie Odoo-Webhooks gebaut ({ model, event, felder }). Später nur QUELLE ersetzen, alles andere bleibt.
   Ruckelfrei: bewegt wird nur per transform, ein Takt alle 100 ms und nur, solange sich etwas bewegt. Versteckter Tab = Pause. */
(function () {
  'use strict';
  var WELT = 1600, GESCHW = 130, TAKT = 100, SITZ_DY = 34;
  var R = { breite: 96, fuss: [48, 123] };
  var BILDER = { 'laufen-unten': 3, 'laufen-oben': 3, 'laufen-links': 3, 'laufen-rechts': 3, sitzen: 1, tippen: 2, stehen: 1, tragen: 3, ablegen: 1 };
  var ruhig = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ── Szene: Orte im Bild (1600er-Bildpunkte), gemessen am 12.10.2026 ── */
  var ORTE = {
    empfang:   { kasten: [[690, 1100], [915, 1300]], schild: [802, 1262], tische: [[812, 1164, 64, 48]] },
    halle:     { kasten: [[1150, 365], [1435, 1105]], schild: [1288, 395], tische: [[1242, 690], [1323, 690], [1242, 812], [1323, 812]] },
    ergun:     { kasten: [[425, 350], [745, 598]], schild: [586, 372], tische: [[514, 474], [591, 474], [669, 474]] },
    odoo:      { kasten: [[425, 848], [745, 1094]], schild: [586, 868], tische: [[520, 971], [597, 971], [672, 971]] },
    chefbuero: { kasten: [[872, 350], [1100, 602]], schild: [986, 370], tische: [[975, 515, 70, 60]] }
  };
  /* Wege-Netz: Figuren laufen nur darauf, nie durch Wände */
  var KNOTEN = {
    kugel: [795, 308], kuppel: [795, 350],
    'flur-1': [805, 490], 'flur-2': [805, 690], 'flur-3': [805, 945], 'flur-4': [805, 1108],
    'tuer-ergun': [736, 490], 'raum-ergun': [706, 578], 'tuer-odoo': [736, 945], 'raum-odoo': [706, 1068],
    'tuer-chef': [872, 490], 'raum-chef': [904, 586],
    empfang: [805, 1242], eingang: [800, 1300], vorplatz: [800, 1362], tor: [800, 1440], draussen: [800, 1560],
    'pfad-rechts': [1060, 1342], 'pfad-halle': [1292, 1258], 'tuer-halle': [1300, 1122], 'raum-halle': [1300, 1060],
    'halle-gang': [1186, 1060], 'halle-reihe-2': [1186, 905], 'halle-reihe-1': [1186, 790]
  };
  var KANTEN = [['kugel', 'kuppel'], ['kuppel', 'flur-1'], ['flur-1', 'flur-2'], ['flur-2', 'flur-3'], ['flur-3', 'flur-4'], ['flur-4', 'empfang'],
    ['empfang', 'eingang'], ['eingang', 'vorplatz'], ['vorplatz', 'tor'], ['tor', 'draussen'],
    ['flur-1', 'tuer-ergun'], ['tuer-ergun', 'raum-ergun'], ['flur-3', 'tuer-odoo'], ['tuer-odoo', 'raum-odoo'], ['flur-1', 'tuer-chef'], ['tuer-chef', 'raum-chef'],
    ['vorplatz', 'pfad-rechts'], ['pfad-rechts', 'pfad-halle'], ['pfad-halle', 'tuer-halle'], ['tuer-halle', 'raum-halle'], ['raum-halle', 'halle-gang'],
    ['halle-gang', 'halle-reihe-2'], ['halle-reihe-2', 'halle-reihe-1']];
  /* Arbeitsplätze je Raum (Raum-ID aus der Datei): Tisch (Leuchten), Stuhl, Zugang, Knoten. steht = ohne Stuhl */
  var PLAETZE = {
    empfang:        { ort: 'empfang', tisch: 0, stuhl: [856, 1158], zugang: [856, 1158], knoten: 'flur-4', steht: true },
    exposes:        { ort: 'ergun', tisch: 0, stuhl: [514, 530], zugang: [514, 580], knoten: 'raum-ergun' },
    vertraege:      { ort: 'odoo', tisch: 0, stuhl: [520, 1024], zugang: [520, 1070], knoten: 'raum-odoo' },
    chef:           { ort: 'chefbuero', tisch: 0, stuhl: [1016, 590], zugang: [1016, 590], knoten: 'raum-chef', steht: true },
    besichtigungen: { ort: 'halle', tisch: 0, stuhl: [1242, 762], zugang: [1242, 792], knoten: 'halle-reihe-1' }
  };
  var NACHBARN = {};
  Object.keys(KNOTEN).forEach(function (k) { NACHBARN[k] = []; });
  KANTEN.forEach(function (k) { NACHBARN[k[0]].push(k[1]); NACHBARN[k[1]].push(k[0]); });
  function weg(a, b) {   /* kürzester Weg (Dijkstra) */
    var dist = {}, von = {}, offen = Object.keys(KNOTEN);
    offen.forEach(function (k) { dist[k] = Infinity; }); dist[a] = 0;
    while (offen.length) {
      offen.sort(function (x, y) { return dist[x] - dist[y]; });
      var k = offen.shift(); if (dist[k] === Infinity || k === b) break;
      NACHBARN[k].forEach(function (n) { var d = dist[k] + Math.hypot(KNOTEN[k][0] - KNOTEN[n][0], KNOTEN[k][1] - KNOTEN[n][1]); if (d < dist[n]) { dist[n] = d; von[n] = k; } });
    }
    if (dist[b] === Infinity) return [];
    var aus = [b]; while (aus[0] !== a) aus.unshift(von[aus[0]]);
    return aus.map(function (n) { return { x: KNOTEN[n][0], y: KNOTEN[n][1] }; });
  }
  function pt(a) { return { x: a[0], y: a[1] }; }
  function sitzPunkt(p) { return p.steht ? pt(p.stuhl) : { x: p.stuhl[0], y: p.stuhl[1] + SITZ_DY }; }

  /* ── Elemente ── */
  var buehne = $('[data-buehne]'), welt = $('[data-welt]'), schilderEbene = $('[data-schilder]');
  var D = null, paket = null, schildListe = [], raumSchild = {}, raumDunkel = {}, raumGlanz = {}, zusaetze = {}, figuren = {};
  var cam = { s: 1, tx: 0, ty: 0 }, fitS = 1, flug = 0;

  function glanzTeil(cls, x, y, b, h, nacht) {
    var d = el('div', 'glanz ' + cls), l = x - b / 2, t = y - h / 2;
    d.style.cssText = 'left:' + l + 'px;top:' + t + 'px;width:' + b + 'px;height:' + h + 'px' + (nacht ? ';background-position:' + (-l) + 'px ' + (-t) + 'px' : '');
    d.setAttribute('aria-hidden', 'true'); welt.appendChild(d); return d;
  }
  function an(d, ja) { if (d) d.classList.toggle('an', !!ja); }
  function blitz(d, ms) { an(d, true); clearTimeout(d._u); d._u = setTimeout(function () { an(d, false); }, ms || 1400); }
  var kugelRuhe = glanzTeil('glanz--kugel-ruhe', 795, 222, 120, 120);
  var kugel = glanzTeil('glanz--kugel', 795, 222, 200, 200);
  var tor = glanzTeil('glanz--tor', 800, 1420, 300, 170);
  Object.keys(ORTE).forEach(function (o) {
    raumGlanz[o] = ORTE[o].tische.map(function (t) { return glanzTeil('glanz--tisch', t[0], t[1], t[2] || 60, t[3] || 46, true); });
  });

  /* ── Schilder ── */
  function schild(ort, knopf, cls) {
    var s = el(knopf ? 'button' : 'div', cls); if (knopf) s.type = 'button';
    s._ort = { x: ort[0], y: ort[1] }; schilderEbene.appendChild(s); schildListe.push(s); return s;
  }

  /* ── Kamera: Büro einpassen, wischen, zoomen (Finger, Maus, Rad) ── */
  var BAU = [[372, 20], [1490, 1330]];
  function mass() { return { w: buehne.clientWidth || 360, h: buehne.clientHeight || 640 }; }
  function frei() {   /* Platz, der nicht von Kopf, Paket, Ticker und Knopf bedeckt ist */
    var m = mass(), r = { l: 0, t: 0, r: m.w, b: m.h }, handy = m.w <= 820;
    var k = $('.kopf').getBoundingClientRect(), p = $('.paket').getBoundingClientRect(), t = $('.ticker').getBoundingClientRect();
    if (handy) { r.t = t.bottom + 6; r.b = p.top - 6; r.l = 8; r.r = m.w - 8; }
    else { r.t = k.bottom + 6; r.l = p.right + 10; r.r = t.left - 10; r.b = m.h - 70; }
    if (r.r - r.l < 200) { r.l = 0; r.r = m.w; }
    return r;
  }
  function grenzen(c) {
    var m = mass(); c.s = Math.max(fitS * 0.8, Math.min(c.s, Math.max(fitS * 4, 1.6)));
    var b = WELT * c.s, rand = 80;
    c.tx = Math.min(Math.max(c.tx, Math.min(m.w - b, 0) - rand), Math.max(m.w - b, 0) + rand);
    c.ty = Math.min(Math.max(c.ty, Math.min(m.h - b, 0) - rand), Math.max(m.h - b, 0) + rand);
    return c;
  }
  function zeigen() {
    welt.style.transform = 'translate3d(' + cam.tx.toFixed(1) + 'px,' + cam.ty.toFixed(1) + 'px,0) scale(' + cam.s.toFixed(4) + ')';
    for (var i = 0; i < schildListe.length; i++) {
      var s = schildListe[i];
      s.style.transform = 'translate3d(' + (s._ort.x * cam.s + cam.tx).toFixed(1) + 'px,' + (s._ort.y * cam.s + cam.ty).toFixed(1) + 'px,0) translate(-50%,-18px)';
    }
  }
  function kasten(k, f) {
    var bw = k[1][0] - k[0][0], bh = k[1][1] - k[0][1], fw = f.r - f.l, fh = f.b - f.t, s = Math.min(fw / bw, fh / bh);
    return { s: s, tx: f.l + (fw - bw * s) / 2 - k[0][0] * s, ty: f.t + (fh - bh * s) / 2 - k[0][1] * s };
  }
  function einpassen(sofort) {
    var c = kasten(BAU, frei()); fitS = c.s;
    if (sofort) { cam = grenzen(c); zeigen(); } else fliegen(c);
  }
  function fliegen(c) {
    c = grenzen(c); cancelAnimationFrame(flug);
    if (ruhig) { cam = c; zeigen(); return; }
    var a = { s: cam.s, tx: cam.tx, ty: cam.ty }, t0 = 0, DAUER = 450;
    function schritt(t) {
      if (!t0) t0 = t; var u = Math.min(1, (t - t0) / DAUER), e = 1 - Math.pow(1 - u, 3);
      cam = { s: a.s + (c.s - a.s) * e, tx: a.tx + (c.tx - a.tx) * e, ty: a.ty + (c.ty - a.ty) * e }; zeigen();
      if (u < 1) flug = requestAnimationFrame(schritt);
    }
    flug = requestAnimationFrame(schritt);
  }
  function zuOrt(o) {
    var k = ORTE[o].kasten, f = frei(), c = kasten([[k[0][0] - 60, k[0][1] - 60], [k[1][0] + 60, k[1][1] + 60]], f);
    c.s = Math.min(c.s, fitS * 2.6); var mx = (k[0][0] + k[1][0]) / 2, my = (k[0][1] + k[1][1]) / 2;
    fliegen({ s: c.s, tx: (f.l + f.r) / 2 - mx * c.s, ty: (f.t + f.b) / 2 - my * c.s });
  }
  var zeiger = {}, start = null, gezogen = false;
  function liste() { return Object.keys(zeiger).map(function (k) { return zeiger[k]; }); }
  function anfang() {
    var l = liste(); if (!l.length) { start = null; return; }
    var mx = l.reduce(function (s, p) { return s + p.x; }, 0) / l.length, my = l.reduce(function (s, p) { return s + p.y; }, 0) / l.length;
    start = { cam: { s: cam.s, tx: cam.tx, ty: cam.ty }, mx: mx, my: my, d: l.length > 1 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0 };
  }
  buehne.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(flug); zeiger[e.pointerId] = { x: e.clientX, y: e.clientY }; gezogen = false; anfang();
  });
  window.addEventListener('pointermove', function (e) {
    if (!zeiger[e.pointerId] || !start) return;
    zeiger[e.pointerId] = { x: e.clientX, y: e.clientY };
    var l = liste(), mx = l.reduce(function (s, p) { return s + p.x; }, 0) / l.length, my = l.reduce(function (s, p) { return s + p.y; }, 0) / l.length;
    if (Math.hypot(mx - start.mx, my - start.my) > 6) gezogen = true;
    var s = start.cam.s;
    if (l.length > 1 && start.d) { s = start.cam.s * Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) / start.d; gezogen = true; }
    var wx = (start.mx - start.cam.tx) / start.cam.s, wy = (start.my - start.cam.ty) / start.cam.s;
    cam = grenzen({ s: s, tx: mx - wx * s, ty: my - wy * s }); zeigen();
  });
  function los(e) { if (!zeiger[e.pointerId]) return; delete zeiger[e.pointerId]; anfang(); }
  window.addEventListener('pointerup', los); window.addEventListener('pointercancel', los);
  buehne.addEventListener('click', function (e) { if (gezogen) { e.stopPropagation(); e.preventDefault(); gezogen = false; } }, true);
  buehne.addEventListener('wheel', function (e) {
    e.preventDefault(); cancelAnimationFrame(flug);
    var s = cam.s * Math.exp(-e.deltaY * 0.0015), wx = (e.clientX - cam.tx) / cam.s, wy = (e.clientY - cam.ty) / cam.s;
    cam = grenzen({ s: s, tx: e.clientX - wx * s, ty: e.clientY - wy * s }); zeigen();
  }, { passive: false });
  var breite0 = 0;
  window.addEventListener('resize', function () { lage(); var w = mass().w; if (Math.abs(w - breite0) > 2) { breite0 = w; einpassen(true); } else { cam = grenzen(cam); zeigen(); } });

  /* ── Figuren ── */
  function bildAdresse(f, pose) { return 'bilder/figuren/' + f.id + '/' + pose + '.webp'; }
  function pose(f, p) {
    if (f.pose === p) return; f.pose = p; f.n = BILDER[p] || 1; f.k = 0;
    f.streifen.style.width = (f.n * R.breite) + 'px';
    f.streifen.style.backgroundImage = 'url("' + bildAdresse(f, p) + '")';
    f.streifen.style.transform = 'translate3d(0,0,0)';
  }
  function bild(f, k) { f.k = k % f.n; f.streifen.style.transform = 'translate3d(' + (-f.k * R.breite) + 'px,0,0)'; }
  function ortSetzen(f, p) {
    f.pos = { x: p.x, y: p.y };
    f.el.style.transform = 'translate3d(' + (p.x - R.fuss[0]).toFixed(1) + 'px,' + (p.y - R.fuss[1]).toFixed(1) + 'px,0)';
    var z = Math.round(p.y); if (z !== f.z) { f.z = z; f.el.style.zIndex = String(10 + z); }
  }
  function figurBauen(t) {
    var p = PLAETZE[t.platz]; if (!p) return;
    var b = el('button', 'fig'); b.type = 'button'; b.setAttribute('aria-label', t.rolle);
    var fenster = el('span', 'fig__bild'), streifen = el('span', 'fig__streifen');
    fenster.appendChild(streifen); b.appendChild(fenster); welt.appendChild(b);
    var f = { id: t.id, rolle: t.rolle, text: t.text, heim: t.platz, el: b, streifen: streifen, pose: '', n: 1, k: 0, z: -1, ort: 'sitz:' + t.platz, schritte: [], weg: null, warte: 0, takt: 0, glanz: null };
    b.addEventListener('click', function () { info(t.rolle, t.text, 'bilder/portraets/' + t.id + '.webp'); });
    figuren[t.id] = f; pose(f, p.steht ? 'stehen' : 'sitzen'); ortSetzen(f, sitzPunkt(p));
    /* Laufbilder vorab laden, damit der erste Gang nicht hakt */
    Object.keys(BILDER).forEach(function (q) { var i = new Image(); i.src = bildAdresse(f, q); });
  }
  function platzGlanz(id) { var p = PLAETZE[id]; return raumGlanz[p.ort][p.tisch]; }
  function frei_(f) { return !f.weg && !f.warte && !f.schritte.length; }
  function gehen(f, nach, art) { f.schritte.push({ art: 'gehen', nach: nach, pose: art || 'laufen' }); }
  function halten(f, p, ms, dann) { f.schritte.push({ art: 'pose', pose: p, ms: ms, dann: dann }); }
  function arbeiten(f, platz, ms) { f.schritte.push({ art: 'arbeiten', platz: platz, ms: ms }); }
  /* Route: von „sitz:<platz>“ oder „knoten:<name>“ zu einem Platz oder Knoten */
  function route(f, nach) {
    var von = f.ort, punkte = [];
    var vonPlatz = von.indexOf('sitz:') === 0 ? PLAETZE[von.slice(5)] : null, vonKnoten = vonPlatz ? vonPlatz.knoten : von.slice(7);
    var zielPlatz = nach.indexOf('sitz:') === 0 ? PLAETZE[nach.slice(5)] : null, zielKnoten = zielPlatz ? zielPlatz.knoten : nach;
    if (von === nach) return [];
    if (vonPlatz) punkte.push(pt(vonPlatz.zugang));
    if (!(vonPlatz && zielPlatz && vonPlatz.knoten === zielPlatz.knoten)) punkte = punkte.concat(weg(vonKnoten, zielKnoten));
    if (zielPlatz) { punkte.push(pt(zielPlatz.zugang)); punkte.push(sitzPunkt(zielPlatz)); }
    return punkte;
  }
  function weiter(f) {
    if (f.weg || f.warte) return;
    var s = f.schritte.shift();
    if (!s) {   /* Ruhe: am eigenen Platz, ohne Leuchten */
      if (f.ort !== 'sitz:' + f.heim) { gehen(f, 'sitz:' + f.heim); return weiter(f); }
      return pose(f, PLAETZE[f.heim].steht ? 'stehen' : 'sitzen');
    }
    if (s.art === 'pose') { pose(f, s.pose); f.warte = s.ms; f.dann = s.dann; return; }
    if (s.art === 'arbeiten') {
      var p = PLAETZE[s.platz]; f.glanz = platzGlanz(s.platz); an(f.glanz, true);
      pose(f, p.steht ? 'stehen' : 'tippen'); f.warte = s.ms;
      f.dann = function () { an(f.glanz, false); f.glanz = null; };
      return;
    }
    var pk = route(f, s.nach);
    if (ruhig || !pk.length) { f.ort = s.nach.indexOf('sitz:') === 0 ? s.nach : 'knoten:' + s.nach; if (pk.length) ortSetzen(f, pk[pk.length - 1]); return weiter(f); }
    f.weg = { punkte: pk, i: 0, nach: s.nach, pose: s.pose }; f.ort = 'unterwegs';
    f.el.classList.add('unterwegs');
  }
  function richtung(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'links' : 'rechts') : (dy < 0 ? 'oben' : 'unten'); }
  function schritt(f, dt) {
    if (f.weg) {
      var w = f.weg, rest = GESCHW * dt / 1000;
      while (rest > 0 && w.i < w.punkte.length) {
        var z = w.punkte[w.i], dx = z.x - f.pos.x, dy = z.y - f.pos.y, d = Math.hypot(dx, dy);
        if (d > 0.5) pose(f, w.pose === 'tragen' ? 'tragen' : 'laufen-' + richtung(dx, dy));
        if (d <= rest) { f.pos = { x: z.x, y: z.y }; rest -= d; w.i++; } else { f.pos = { x: f.pos.x + dx / d * rest, y: f.pos.y + dy / d * rest }; rest = 0; }
      }
      ortSetzen(f, f.pos); bild(f, f.k + 1);
      if (w.i >= w.punkte.length) {
        f.weg = null; f.el.classList.remove('unterwegs');
        f.ort = w.nach.indexOf('sitz:') === 0 ? w.nach : 'knoten:' + w.nach;
        weiter(f);
      }
      return true;
    }
    if (f.warte) {
      if (f.n > 1 && ++f.takt % 3 === 0) bild(f, f.k + 1);
      f.warte -= dt;
      if (f.warte <= 0) { f.warte = 0; var dann = f.dann; f.dann = null; if (dann) dann(); weiter(f); }
      return true;
    }
    return false;
  }
  var uhr = 0, zuletzt = 0;
  function takt() {
    uhr = 0; if (document.hidden) return;
    var j = performance.now(), dt = Math.min(250, zuletzt ? j - zuletzt : TAKT); zuletzt = j;
    var noch = false;
    Object.keys(figuren).forEach(function (id) { if (schritt(figuren[id], dt)) noch = true; });
    if (noch) uhr = setTimeout(takt, TAKT); else zuletzt = 0;
  }
  function laufen() { if (!uhr && !document.hidden) { zuletzt = 0; uhr = setTimeout(takt, TAKT); } }

  /* Abläufe der Figuren (art aus buero-daten.json) */
  var ABLAUF = {
    bringt: function (f, platz) { gehen(f, 'sitz:' + platz); arbeiten(f, platz, 1800); gehen(f, 'kugel', 'tragen'); halten(f, 'ablegen', 900, function () { blitz(kugel, 1500); }); },
    holt: function (f, platz) { gehen(f, 'kugel'); halten(f, 'ablegen', 800, function () { blitz(kugel, 1500); }); gehen(f, 'sitz:' + platz, 'tragen'); arbeiten(f, platz, 2400); },
    arbeitet: function (f, platz) { gehen(f, 'sitz:' + platz); arbeiten(f, platz, 2800); },
    faehrt: function (f) { gehen(f, 'kugel'); halten(f, 'ablegen', 800, function () { blitz(kugel, 1500); }); gehen(f, 'tor', 'tragen'); halten(f, 'tragen', 200, function () { blitz(tor, 2200); }); gehen(f, 'draussen', 'tragen'); halten(f, 'stehen', 900); },
    nur: function () {}
  };

  /* ── Ereignisse (Webhook-Form) → Raum, Ticker, Kugel, Figuren ── */
  function passt(a, h) {
    var w = a.wenn || {}; if (w.model !== h.model || w.event !== h.event) return false;
    var fe = w.felder || {}, hf = h.felder || {};
    return Object.keys(fe).every(function (k) { return hf[k] === fe[k]; });
  }
  function fuellen(text, felder) { return String(text).replace(/\{(\w+)\}/g, function (_, k) { return felder && felder[k] != null ? felder[k] : ''; }); }
  function raumDaten(id) { return D.raeume.filter(function (r) { return r.id === id; })[0]; }
  function verarbeiten(hook) {
    var a = D.ablaeufe.filter(function (x) { return passt(x, hook); })[0]; if (!a) return;
    if (paket.raeume.indexOf(a.raum) < 0) return;   /* Raum läuft in diesem Paket nicht */
    var r = raumDaten(a.raum); if (!r) return;
    blitz(kugel, 900);
    raumGlanz[r.ort].forEach(function (g, i) { setTimeout(function () { blitz(g, 2400); }, i * 120); });
    var s = raumSchild[a.raum]; if (s) { s.classList.add('puls'); clearTimeout(s._u); s._u = setTimeout(function () { s.classList.remove('puls'); }, 2600); }
    ticker(r, a.app, fuellen(a.text, hook.felder));
    var f = a.wer && figuren[a.wer];
    if (f && ABLAUF[a.art] && frei_(f)) { ABLAUF[a.art](f, a.platz || f.heim); weiter(f); laufen(); }
  }
  function ticker(r, app, text) {
    var ol = $('[data-ticker]'), li = el('li'), meta = el('span', 'ticker__meta'), i = el('i');
    var jetzt = new Date(), zeit = ('0' + jetzt.getHours()).slice(-2) + ':' + ('0' + jetzt.getMinutes()).slice(-2);
    meta.style.setProperty('--farbe', r.farbe); meta.appendChild(i); meta.appendChild(document.createTextNode(zeit + ' · ' + r.name + ' · ' + app));
    li.appendChild(meta); li.appendChild(el('span', 'ticker__text', text));
    ol.insertBefore(li, ol.firstChild);
    while (ol.children.length > 7) ol.removeChild(ol.lastChild);
  }

  /* QUELLE: heute Demo-Daten im natürlichen Tempo. Später hier die echten Odoo-Webhooks anschließen und verarbeiten(hook) aufrufen. */
  var QUELLE = {
    i: 0, uhr: 0,
    start: function () {
      var self = this; clearTimeout(self.uhr);
      function naechstes() {
        if (document.hidden) { self.uhr = setTimeout(naechstes, 1000); return; }
        var liste = D.demo.filter(function (e) { return stufe(e.ab) <= stufe(paket.id); });
        if (liste.length) { var h = liste[self.i % liste.length]; self.i++; verarbeiten({ model: h.model, event: h.event, felder: h.felder || {} }); }
        var t = D.takt || {}, min = (t.minSekunden || 5) * 1000, max = (t.maxSekunden || 10) * 1000;
        self.uhr = setTimeout(naechstes, min + Math.random() * (max - min));
      }
      self.uhr = setTimeout(naechstes, 1200);
    }
  };
  function stufe(id) { for (var i = 0; i < D.pakete.length; i++) if (D.pakete[i].id === id) return i; return 99; }

  /* ── Paket-Umschalter und Paketkarte ── */
  function euro(n) { return 'ca. ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function paketWaehlen(id, erst) {
    paket = D.pakete.filter(function (p) { return p.id === id; })[0] || D.pakete[0];
    document.querySelectorAll('[data-umschalter] button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.id === paket.id)); });
    $('[data-preis]').innerHTML = '';
    var z1 = el('span'); z1.appendChild(el('b', null, euro(paket.einrichtung))); z1.appendChild(document.createTextNode(' einmalige Einrichtung'));
    var z2 = el('span', null, 'Betreuung ' + euro(D.betreuungMonat) + ' im Monat');
    $('[data-preis]').appendChild(z1); $('[data-preis]').appendChild(z2);
    var ul = $('[data-inhalt]'); ul.innerHTML = '';
    paket.inhalt.forEach(function (t) { var li = el('li', erst ? '' : 'neu', t); ul.appendChild(li); });
    /* Räume weich ein- und ausblenden */
    D.raeume.forEach(function (r) {
      var laeuft = paket.raeume.indexOf(r.id) >= 0;
      an(raumDunkel[r.id], !laeuft);
      if (raumSchild[r.id]) raumSchild[r.id].classList.toggle('zu', !laeuft);
    });
    Object.keys(zusaetze).forEach(function (k) { an(zusaetze[k], paket.extras.indexOf(k) >= 0); });
    D.team.forEach(function (t) { var f = figuren[t.id]; if (f) f.el.setAttribute('aria-label', t.rolle + (paket.raeume.indexOf(t.platz) < 0 ? ' (nicht im Paket)' : '')); });
    try { localStorage.setItem('buero-paket', paket.id); } catch (e) {}
  }

  /* ── Info-Karte (Figur oder Raum antippen) ── */
  var infoUhr = 0;
  function info(name, text, bildSrc) {
    var box = $('[data-info]'), img = $('[data-info-bild]');
    $('[data-info-name]').textContent = name; $('[data-info-text]').textContent = text;
    if (bildSrc) { img.src = bildSrc; img.hidden = false; } else img.hidden = true;
    box.hidden = false; lage(); clearTimeout(infoUhr); infoUhr = setTimeout(function () { box.hidden = true; }, 6000);
  }
  $('[data-info-zu]').addEventListener('click', function () { $('[data-info]').hidden = true; });

  /* Handy: Ticker unter den Kopf, Info über die Paketkarte */
  function lage() {
    var handy = mass().w <= 820, k = $('.kopf').getBoundingClientRect(), p = $('.paket').getBoundingClientRect();
    $('.ticker').style.top = handy ? (k.bottom + 8) + 'px' : '';
    $('[data-info]').style.bottom = handy ? (window.innerHeight - p.top + 8) + 'px' : '';
  }

  /* ── Aufbau aus buero-daten.json ── */
  function aufbauen(daten) {
    D = daten;
    if (D.titel) { $('[data-titel]').textContent = D.titel; }
    if (D.untertitel) $('[data-untertitel]').textContent = D.untertitel;
    var k = $('[data-kontakt]'); if (D.kontaktLink) k.href = D.kontaktLink; if (D.kontaktText) k.firstChild.nodeValue = D.kontaktText + ' ';
    $('[data-lizenz]').textContent = D.lizenzHinweis || '';

    var ks = schild([795, 66], true, 'schild schild--kugel');
    ks.appendChild(el('b', null, D.kugel.name)); ks.appendChild(el('small', null, D.kugel.text));
    ks.addEventListener('click', function () { info(D.kugel.name, D.kugel.text + ' Jede Anfrage, jeder Termin, jede Rechnung.'); blitz(kugel, 1200); });

    var erstesAb = function (rid) { for (var i = 0; i < D.pakete.length; i++) if (D.pakete[i].raeume.indexOf(rid) >= 0) return D.pakete[i].name; return ''; };
    D.raeume.forEach(function (r) {
      var o = ORTE[r.ort]; if (!o) return;
      var kk = o.kasten, d = el('div', 'dunkel');
      d.style.cssText = 'left:' + kk[0][0] + 'px;top:' + kk[0][1] + 'px;width:' + (kk[1][0] - kk[0][0]) + 'px;height:' + (kk[1][1] - kk[0][1]) + 'px';
      welt.appendChild(d); raumDunkel[r.id] = d;
      var s = schild(o.schild, true, 'schild'); s.style.setProperty('--farbe', r.farbe);
      s.appendChild(el('b', null, r.name)); s.appendChild(el('small', null, r.odoo)); s.appendChild(el('span', 'ab', 'ab ' + erstesAb(r.id)));
      s.setAttribute('aria-label', r.name + ', ' + r.odoo);
      s.addEventListener('click', function () {
        zuOrt(r.ort);
        var laeuft = paket.raeume.indexOf(r.id) >= 0;
        var ext = Object.keys(D.extras).filter(function (x) { return D.extras[x].raum === r.id && paket.extras.indexOf(x) >= 0; }).map(function (x) { return D.extras[x].name; });
        info(r.name, laeuft ? r.odoo + (ext.length ? ' · mit ' + ext.join(', ') : '') : 'Läuft ab dem Paket ' + erstesAb(r.id) + '.');
      });
      raumSchild[r.id] = s;
    });
    /* Zusätze als kleine Marken im Raum-Schild */
    Object.keys(D.extras).forEach(function (x) {
      var e = D.extras[x], s = raumSchild[e.raum]; if (!s) return;
      var z = el('span', 'zusatz'); s.appendChild(z);
      if (e.symbol) z.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>';
      z.appendChild(document.createTextNode(e.symbol ? e.name : '+ ' + e.name));
      zusaetze[x] = z;
    });
    D.team.forEach(figurBauen);

    var um = $('[data-umschalter]');
    D.pakete.forEach(function (p) {
      var b = el('button', null, p.name); b.type = 'button'; b.dataset.id = p.id; b.setAttribute('role', 'radio');
      b.addEventListener('click', function () { if (paket.id !== p.id) { paketWaehlen(p.id); QUELLE.i = 0; } });
      um.appendChild(b);
    });
    $('[data-mehr]').addEventListener('click', function () { var c = $('[data-karte]'), o = c.classList.toggle('offen'); this.setAttribute('aria-expanded', String(o)); this.textContent = o ? 'Weniger' : 'Was drin ist'; lage(); });

    var gemerkt = null; try { gemerkt = localStorage.getItem('buero-paket'); } catch (e) {}
    paketWaehlen(D.pakete.some(function (p) { return p.id === gemerkt; }) ? gemerkt : (D.standardPaket || 'business'), true);
    lage(); breite0 = mass().w; einpassen(true);
    var img = $('.welt__bild');
    var fertig = function () { $('[data-lade]').hidden = true; };
    if (img.complete) fertig(); else { img.addEventListener('load', fertig); img.addEventListener('error', fertig); }
    QUELLE.start();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) laufen(); });
  fetch('buero-daten.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(aufbauen)
    .catch(function () { $('[data-lade]').textContent = 'Das Büro konnte nicht geladen werden.'; });
})();
