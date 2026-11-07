/* Live-Büro Makler (Aufträge 07.11.2026: „Live-Büro Makler“ und „neue Grafik“).
   Szene: eigene Zeichnung (bilder/szene-*.webp, Quelle _code/werkzeuge/buero-makler-szene.py) – Maklerbüro an der Straßenecke, blaue Stunde.
   Alles Inhaltliche UND die Lage im Bild (Räume, Bildschirme, Plätze, Wege, Kugel) kommen aus buero-daten.json.
   Figuren sind kleine SVG-Zeichnungen (von oben), die sich in Laufrichtung drehen. Lichtbahnen Raum → Kugel nach der Vorlage „Animated Beam“.
   Ereignisse sind wie Odoo-Webhooks gebaut ({ model, event, felder }). Später nur QUELLE ersetzen, alles andere bleibt.
   Ruckelfrei: bewegt wird nur per transform, ein Takt alle 100 ms und nur, solange sich etwas bewegt. Versteckter Tab = Pause. */
(function () {
  'use strict';
  var WELT = 1600, RAND = [-800, 2400], GESCHW = 120, TAKT = 100, FIG = 48;
  var BLICK = { unten: 0, links: 90, oben: 180, rechts: -90 };
  var ruhig = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pt(a) { return { x: a[0], y: a[1] }; }

  var buehne = $('[data-buehne]'), welt = $('[data-welt]'), schilderEbene = $('[data-schilder]');
  var D = null, S = null, paket = null, schildListe = [], raumSchild = {}, raumDunkel = {}, raumGlanz = {}, zusaetze = {}, figuren = {}, bahnen = {};
  var cam = { s: 1, tx: 0, ty: 0 }, fitS = 1, flug = 0, kugel = null, kugelRuhe = null, ausgang = null;

  /* ── Wege (Dijkstra über szene.knoten / szene.kanten) ── */
  var NACHBARN = {};
  function wegeBauen() {
    Object.keys(S.knoten).forEach(function (k) { NACHBARN[k] = []; });
    S.kanten.forEach(function (k) { NACHBARN[k[0]].push(k[1]); NACHBARN[k[1]].push(k[0]); });
  }
  function weg(a, b) {
    var K = S.knoten, dist = {}, von = {}, offen = Object.keys(K);
    offen.forEach(function (k) { dist[k] = Infinity; }); dist[a] = 0;
    while (offen.length) {
      offen.sort(function (x, y) { return dist[x] - dist[y]; });
      var k = offen.shift(); if (dist[k] === Infinity || k === b) break;
      NACHBARN[k].forEach(function (n) { var d = dist[k] + Math.hypot(K[k][0] - K[n][0], K[k][1] - K[n][1]); if (d < dist[n]) { dist[n] = d; von[n] = k; } });
    }
    if (dist[b] === Infinity) return [];
    var aus = [b]; while (aus[0] !== a) aus.unshift(von[aus[0]]);
    return aus.map(function (n) { return pt(K[n]); });
  }

  /* ── Licht ── */
  function glanzTeil(cls, x, y, b, h) {
    var d = el('div', 'glanz ' + cls);
    d.style.cssText = 'left:' + (x - b / 2) + 'px;top:' + (y - h / 2) + 'px;width:' + b + 'px;height:' + h + 'px';
    d.setAttribute('aria-hidden', 'true'); welt.appendChild(d); return d;
  }
  function an(d, ja) { if (d) d.classList.toggle('an', !!ja); }
  function blitz(d, ms) { an(d, true); clearTimeout(d._u); d._u = setTimeout(function () { an(d, false); }, ms || 1400); }

  /* ── Lichtbahnen Raum → Kugel (Vorlage „Animated Beam“: schwache Grundlinie, darüber wandert ein Lichtverlauf) ── */
  var strahlen = null;
  function bahnenBauen() {
    strahlen = document.createElementNS(SVGNS, 'svg');
    strahlen.setAttribute('class', 'strahlen'); strahlen.setAttribute('viewBox', '0 0 1600 1600'); strahlen.setAttribute('aria-hidden', 'true');
    var k = S.kugel;
    D.raeume.forEach(function (r, i) {
      var o = S.orte[r.ort]; if (!o) return;
      var s = o.schirme[0], mx = (s[0] + k[0]) / 2, my = (s[1] + k[1]) / 2, dx = k[0] - s[0], dy = k[1] - s[1], l = Math.hypot(dx, dy) || 1;
      var b = (i % 2 ? 1 : -1) * Math.min(90, l * .25), cx = mx - dy / l * b, cy = my + dx / l * b;
      var d = 'M' + s[0] + ' ' + s[1] + ' Q' + cx.toFixed(0) + ' ' + cy.toFixed(0) + ' ' + k[0] + ' ' + k[1];
      var grund = document.createElementNS(SVGNS, 'path'); grund.setAttribute('d', d); grund.setAttribute('class', 'bahn');
      var licht = document.createElementNS(SVGNS, 'path'); licht.setAttribute('d', d); licht.setAttribute('class', 'bahn-licht');
      strahlen.appendChild(grund); strahlen.appendChild(licht);
      bahnen[r.id] = { grund: grund, licht: licht, l: 0 };
    });
    welt.appendChild(strahlen);
    Object.keys(bahnen).forEach(function (id) {
      var b = bahnen[id]; b.l = b.licht.getTotalLength ? b.licht.getTotalLength() : 600;
      b.licht.style.strokeDasharray = '90 ' + (b.l + 90); b.licht.style.strokeDashoffset = String(90);
    });
  }
  function strahl(id, dann) {
    var b = bahnen[id]; if (!b) { if (dann) dann(); return; }
    if (ruhig || !b.licht.animate) { if (dann) dann(); return; }
    var fertig = function () { if (dann) { var d = dann; dann = null; d(); } };
    var lauf = b.licht.animate([{ strokeDashoffset: 90 }, { strokeDashoffset: -b.l }], { duration: 1100, easing: 'cubic-bezier(.16,1,.3,1)' });
    lauf.onfinish = fertig;
    setTimeout(fertig, 1400);   /* Hintergrund-Tab: sicher ankommen */
  }

  /* ── Schilder ── */
  function schild(ort, knopf, cls) {
    var s = el(knopf ? 'button' : 'div', cls); if (knopf) s.type = 'button';
    s._ort = { x: ort[0], y: ort[1] }; schilderEbene.appendChild(s); schildListe.push(s); return s;
  }

  /* ── Kamera: Büro einpassen, wischen, zoomen (Finger, Maus, Rad) ── */
  function mass() { return { w: buehne.clientWidth || 360, h: buehne.clientHeight || 640 }; }
  function frei() {
    var m = mass(), r = { l: 0, t: 0, r: m.w, b: m.h }, handy = m.w <= 820;
    var k = $('.kopf').getBoundingClientRect(), p = $('.paket').getBoundingClientRect(), t = $('.ticker').getBoundingClientRect();
    if (handy) { r.t = t.bottom + 6; r.b = p.top - 6; r.l = 6; r.r = m.w - 6; }
    else { r.t = k.bottom + 6; r.l = p.right + 10; r.r = t.left - 10; r.b = m.h - 70; }
    if (r.r - r.l < 200) { r.l = 0; r.r = m.w; }
    return r;
  }
  function grenzen(c) {
    var m = mass(), kleinst = Math.max(m.w, m.h) / (RAND[1] - RAND[0]); c.s = Math.max(fitS * 0.75, kleinst, Math.min(c.s, Math.max(fitS * 4, 1.6)));
    /* Die weiche Umgebung reicht von -800 bis 2400: nie ein leerer Rand */
    var lo = RAND[0] * c.s, hi = RAND[1] * c.s;
    c.tx = Math.min(Math.max(c.tx, m.w - hi), -lo);
    c.ty = Math.min(Math.max(c.ty, m.h - hi), -lo);
    return c;
  }
  function zeigen() {
    welt.style.transform = 'translate3d(' + cam.tx.toFixed(1) + 'px,' + cam.ty.toFixed(1) + 'px,0) scale(' + cam.s.toFixed(4) + ')';
    buehne.classList.toggle('nah', cam.s > fitS * 1.3);
    for (var i = 0; i < schildListe.length; i++) {
      var s = schildListe[i];
      s.style.transform = 'translate3d(' + (s._ort.x * cam.s + cam.tx).toFixed(1) + 'px,' + (s._ort.y * cam.s + cam.ty).toFixed(1) + 'px,0) translate(-50%,-18px)';
    }
  }
  function kasten(k, f) {
    var bw = k[1][0] - k[0][0], bh = k[1][1] - k[0][1], fw = f.r - f.l, fh = f.b - f.t, s = Math.min(fw / bw, fh / bh);
    return { s: s, tx: f.l + (fw - bw * s) / 2 - k[0][0] * s, ty: f.t + (fh - bh * s) / 2 - k[0][1] * s };
  }
  function einpassen(sofort) { var c = kasten(S.bau, frei()); fitS = c.s; if (sofort) { cam = grenzen(c); zeigen(); } else fliegen(c); }
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
    setTimeout(function () { if (cam.s !== c.s) { cancelAnimationFrame(flug); cam = c; zeigen(); } }, 800);
  }
  function zuOrt(o) {
    var k = S.orte[o].kasten, f = frei(), c = kasten([[k[0][0] - 50, k[0][1] - 50], [k[1][0] + 50, k[1][1] + 50]], f);
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
  window.addEventListener('resize', function () { if (!S) return; lage(); var w = mass().w; if (Math.abs(w - breite0) > 2) { breite0 = w; einpassen(true); } else { cam = grenzen(cam); zeigen(); } });

  /* ── Figuren: Zeichnung von oben (Blick nach unten = 0°), dreht sich in Laufrichtung ── */
  function figurSvg(t) {
    var extra = '';
    if (t.extra === 'mappe') extra = '<rect x="11" y="-4" width="5" height="12" rx="1" fill="#7A4E2E"/><path d="M-3 6 L0 9 L3 6" fill="#F2EEE6"/>';
    if (t.extra === 'headset') extra = '<path d="M-7.5 -1 A7.5 7.5 0 0 1 7.5 -1" fill="none" stroke="#15171B" stroke-width="1.6"/><circle cx="7.6" cy="1.5" r="1.8" fill="#15171B"/><path d="M7.6 2 Q6 6 2 6.5" stroke="#15171B" stroke-width="1.1" fill="none"/>';
    if (t.extra === 'schluessel') extra = '<circle cx="-12" cy="7" r="2.2" fill="none" stroke="#E2B65A" stroke-width="1.3"/><rect x="-13" y="8.5" width="2" height="4" fill="#E2B65A"/>';
    var dutt = t.extra === 'headset' ? '<circle cx="0" cy="-8.5" r="3.4" fill="' + t.haar + '"/>' : '';
    return '<svg class="fig__svg" viewBox="-24 -24 48 48" aria-hidden="true"><g class="fig__dreh">' +
      '<ellipse cx="1.5" cy="3" rx="15" ry="13" fill="#000" opacity=".32"/>' +
      '<g class="beine"><rect class="bein bein--l" x="-8" y="1" width="6" height="12" rx="3" fill="#1C1F25"/><rect class="bein bein--r" x="2" y="1" width="6" height="12" rx="3" fill="#1C1F25"/></g>' +
      '<g class="mappe"><rect x="-9" y="8" width="18" height="12" rx="2" fill="#F3C878"/><rect x="-9" y="8" width="18" height="12" rx="2" fill="none" stroke="#FFF4D6" stroke-width="1"/></g>' +
      '<ellipse class="arm arm--l" cx="-13.5" cy="0" rx="3.8" ry="6.5" fill="' + t.kleid + '"/><ellipse class="arm arm--r" cx="13.5" cy="0" rx="3.8" ry="6.5" fill="' + t.kleid + '"/>' +
      '<ellipse cx="0" cy="-.5" rx="12.5" ry="8.5" fill="' + t.kleid + '"/><ellipse cx="0" cy="-3" rx="10" ry="4" fill="#FFFFFF" opacity=".08"/>' +
      extra + '<circle cx="0" cy="-1" r="6.8" fill="' + t.haut + '"/>' + dutt +
      '<path d="M-7 -.5 A7 7 0 0 1 7 -.5 Q4 -2.5 0 -2 Q-4 -2.5 -7 -.5 Z" fill="' + t.haar + '"/>' +
      '</g></svg>';
  }
  function portraet(t) {   /* Porträt-Karte: dieselbe Person von vorn, gezeichnet */
    var ex = t.extra === 'headset' ? '<path d="M24 34 A16 16 0 0 1 56 34" fill="none" stroke="#15171B" stroke-width="3"/><circle cx="56" cy="40" r="3.5" fill="#15171B"/><path d="M56 42 Q54 50 46 51" stroke="#15171B" stroke-width="2" fill="none"/>' :
      t.extra === 'mappe' ? '<path d="M36 62 L40 70 L44 62 Z" fill="#F2EEE6"/><path d="M40 62 L42 66 L40 78 L38 66 Z" fill="#7A2E2E"/>' :
      '<circle cx="62" cy="86" r="4" fill="none" stroke="#E2B65A" stroke-width="2"/>';
    var haar = t.extra === 'headset' ? '<path d="M23 38 Q22 16 40 15 Q58 16 57 38 Q55 26 40 25 Q26 26 23 38 Z" fill="' + t.haar + '"/><circle cx="40" cy="14" r="7" fill="' + t.haar + '"/>' :
      '<path d="M25 34 Q24 17 40 16 Q56 17 55 34 Q50 25 40 25 Q30 25 25 34 Z" fill="' + t.haar + '"/>';
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><defs><radialGradient id="g" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#3A4256"/><stop offset="1" stop-color="#0B0E15"/></radialGradient></defs><rect width="80" height="100" fill="url(#g)"/>' +
      '<path d="M8 100 Q10 66 40 64 Q70 66 72 100 Z" fill="' + t.kleid + '"/><rect x="35" y="52" width="10" height="14" fill="' + t.haut + '"/>' +
      '<ellipse cx="40" cy="38" rx="15" ry="18" fill="' + t.haut + '"/>' + haar + '<circle cx="34" cy="40" r="1.6" fill="#2A2A2A"/><circle cx="46" cy="40" r="1.6" fill="#2A2A2A"/><path d="M35 48 Q40 51 45 48" stroke="#8A5A48" stroke-width="1.6" fill="none"/>' + ex + '</svg>');
  }
  function zustand(f, z) { if (f.zu === z) return; f.zu = z; f.el.setAttribute('data-z', z); }
  function drehen(f, grad) {
    if (f.grad != null) { var d = ((grad - f.grad) % 360 + 540) % 360 - 180; grad = f.grad + d; }
    if (f.grad === grad) return; f.grad = grad; f.dreh.style.transform = 'rotate(' + grad.toFixed(0) + 'deg)';
  }
  function ortSetzen(f, p) {
    f.pos = { x: p.x, y: p.y };
    f.el.style.transform = 'translate3d(' + (p.x - FIG / 2).toFixed(1) + 'px,' + (p.y - FIG / 2).toFixed(1) + 'px,0)';
    var z = Math.round(p.y); if (z !== f.z) { f.z = z; f.el.style.zIndex = String(10 + z); }
  }
  function figurBauen(t) {
    var p = S.plaetze[t.platz]; if (!p) return;
    var b = el('button', 'fig'); b.type = 'button'; b.setAttribute('aria-label', t.rolle); b.innerHTML = figurSvg(t);
    welt.appendChild(b);
    var f = { id: t.id, rolle: t.rolle, heim: t.platz, el: b, dreh: b.querySelector('.fig__dreh'), zu: '', grad: null, z: -1, ort: 'sitz:' + t.platz, schritte: [], weg: null, warte: 0, glanz: null };
    b.addEventListener('click', function () { info(t.rolle, t.text, portraet(t)); });
    figuren[t.id] = f; ruheAmPlatz(f, p); ortSetzen(f, pt(p.sitz));
  }
  function ruheAmPlatz(f, p) { zustand(f, p.steht ? 'steht' : 'sitzt'); drehen(f, BLICK[p.blick] || 0); }
  function platzGlanz(id) { var p = S.plaetze[id]; return raumGlanz[p.ort][p.schirm || 0]; }
  function frei_(f) { return !f.weg && !f.warte && !f.schritte.length; }
  function gehen(f, nach, art) { f.schritte.push({ art: 'gehen', nach: nach, traegt: art === 'tragen' }); }
  function halten(f, z, ms, dann) { f.schritte.push({ art: 'pose', z: z, ms: ms, dann: dann }); }
  function arbeiten(f, platz, ms) { f.schritte.push({ art: 'arbeiten', platz: platz, ms: ms }); }
  function route(f, nach) {
    var von = f.ort, punkte = [];
    var vonPlatz = von.indexOf('sitz:') === 0 ? S.plaetze[von.slice(5)] : null, vonKnoten = vonPlatz ? vonPlatz.knoten : von.slice(7);
    var zielPlatz = nach.indexOf('sitz:') === 0 ? S.plaetze[nach.slice(5)] : null, zielKnoten = zielPlatz ? zielPlatz.knoten : nach;
    if (von === nach) return [];
    if (vonPlatz) punkte.push(pt(vonPlatz.zugang));
    punkte = punkte.concat(weg(vonKnoten, zielKnoten));
    if (zielPlatz) { punkte.push(pt(zielPlatz.zugang)); punkte.push(pt(zielPlatz.sitz)); }
    return punkte;
  }
  function weiter(f) {
    if (f.weg || f.warte) return;
    var s = f.schritte.shift();
    if (!s) {
      if (f.ort !== 'sitz:' + f.heim) { gehen(f, 'sitz:' + f.heim); return weiter(f); }
      return ruheAmPlatz(f, S.plaetze[f.heim]);
    }
    if (s.art === 'pose') { zustand(f, s.z); if (s.z === 'legt') drehen(f, 0); f.warte = s.ms; f.dann = s.dann; return; }
    if (s.art === 'arbeiten') {
      var p = S.plaetze[s.platz]; f.glanz = platzGlanz(s.platz); an(f.glanz, true);
      zustand(f, p.steht ? 'tippt-stehend' : 'tippt'); drehen(f, BLICK[p.blick] || 0); f.warte = s.ms;
      f.dann = function () { an(f.glanz, false); f.glanz = null; };
      return;
    }
    var pk = route(f, s.nach);
    if (ruhig || !pk.length) { f.ort = s.nach.indexOf('sitz:') === 0 ? s.nach : 'knoten:' + s.nach; if (pk.length) ortSetzen(f, pk[pk.length - 1]); return weiter(f); }
    f.weg = { punkte: pk, i: 0, nach: s.nach }; f.ort = 'unterwegs';
    zustand(f, s.traegt ? 'traegt' : 'geht'); f.el.classList.add('unterwegs');
  }
  function schritt(f, dt) {
    if (f.weg) {
      var w = f.weg, rest = GESCHW * dt / 1000;
      while (rest > 0 && w.i < w.punkte.length) {
        var z = w.punkte[w.i], dx = z.x - f.pos.x, dy = z.y - f.pos.y, d = Math.hypot(dx, dy);
        if (d > 0.5) drehen(f, Math.atan2(dy, dx) * 180 / Math.PI - 90);
        if (d <= rest) { f.pos = { x: z.x, y: z.y }; rest -= d; w.i++; } else { f.pos = { x: f.pos.x + dx / d * rest, y: f.pos.y + dy / d * rest }; rest = 0; }
      }
      ortSetzen(f, f.pos);
      if (w.i >= w.punkte.length) {
        f.weg = null; f.el.classList.remove('unterwegs');
        f.ort = w.nach.indexOf('sitz:') === 0 ? w.nach : 'knoten:' + w.nach;
        if (f.ort.indexOf('sitz:') === 0) ruheAmPlatz(f, S.plaetze[f.ort.slice(5)]); else zustand(f, 'steht');
        weiter(f);
      }
      return true;
    }
    if (f.warte) {
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
    bringt: function (f, platz) { gehen(f, 'sitz:' + platz); arbeiten(f, platz, 1800); gehen(f, 'kugel', 'tragen'); halten(f, 'legt', 900, function () { blitz(kugel, 1500); }); },
    holt: function (f, platz) { gehen(f, 'kugel'); halten(f, 'legt', 800, function () { blitz(kugel, 1500); }); gehen(f, 'sitz:' + platz, 'tragen'); arbeiten(f, platz, 2400); },
    arbeitet: function (f, platz) { gehen(f, 'sitz:' + platz); arbeiten(f, platz, 2800); },
    faehrt: function (f) { gehen(f, 'kugel'); halten(f, 'legt', 800, function () { blitz(kugel, 1500); }); gehen(f, 'auto', 'tragen'); halten(f, 'steht', 1200, function () { blitz(ausgang, 2400); }); },
    nur: function () {}
  };

  /* ── Ereignisse (Webhook-Form) → Raum, Lichtbahn, Kugel, Ticker, Figuren ── */
  function passt(a, h) {
    var w = a.wenn || {}; if (w.model !== h.model || w.event !== h.event) return false;
    var fe = w.felder || {}, hf = h.felder || {};
    return Object.keys(fe).every(function (k) { return hf[k] === fe[k]; });
  }
  function fuellen(text, felder) { return String(text).replace(/\{(\w+)\}/g, function (_, k) { return felder && felder[k] != null ? felder[k] : ''; }); }
  function raumDaten(id) { return D.raeume.filter(function (r) { return r.id === id; })[0]; }
  function verarbeiten(hook) {
    var a = D.ablaeufe.filter(function (x) { return passt(x, hook); })[0]; if (!a) return;
    if (paket.raeume.indexOf(a.raum) < 0) return;
    var r = raumDaten(a.raum); if (!r) return;
    (raumGlanz[r.ort] || []).forEach(function (g, i) { setTimeout(function () { blitz(g, 2400); }, i * 120); });
    var s = raumSchild[a.raum]; if (s) { s.classList.add('puls'); clearTimeout(s._u); s._u = setTimeout(function () { s.classList.remove('puls'); }, 2600); }
    strahl(a.raum, function () { blitz(kugel, 900); });
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
  function paketName(id) { var p = D.pakete[stufe(id)]; return p ? p.name : ''; }

  /* ── Paket-Umschalter und Paketkarte (Vorlage „Pricing Card“: Leistungen mit Haken, was fehlt mit Hinweis) ── */
  function euro(n) { return 'ca. ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  var HAKEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var STRICH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 8h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function paketWaehlen(id, erst) {
    paket = D.pakete.filter(function (p) { return p.id === id; })[0] || D.pakete[0];
    document.querySelectorAll('[data-umschalter] button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.id === paket.id)); });
    var pr = $('[data-preis]'); pr.innerHTML = '';
    var z1 = el('span'); z1.appendChild(el('b', null, euro(paket.einrichtung))); z1.appendChild(document.createTextNode(' einmalige Einrichtung'));
    pr.appendChild(z1); pr.appendChild(el('span', null, 'Betreuung ' + euro(D.betreuungMonat) + ' im Monat'));
    var ul = $('[data-inhalt]'); ul.innerHTML = '';
    (D.merkmale || []).forEach(function (m) {
      var drin = stufe(m.ab) <= stufe(paket.id), li = el('li', (drin ? 'drin' : 'fehlt') + (erst ? '' : ' neu'));
      li.innerHTML = drin ? HAKEN : STRICH; li.appendChild(el('span', null, m.text));
      if (!drin) li.appendChild(el('small', null, 'ab ' + paketName(m.ab)));
      ul.appendChild(li);
    });
    D.raeume.forEach(function (r) {
      var laeuft = paket.raeume.indexOf(r.id) >= 0;
      an(raumDunkel[r.id], !laeuft);
      if (raumSchild[r.id]) raumSchild[r.id].classList.toggle('zu', !laeuft);
      if (bahnen[r.id]) bahnen[r.id].grund.classList.toggle('aus', !laeuft);
    });
    Object.keys(zusaetze).forEach(function (k) { an(zusaetze[k], paket.extras.indexOf(k) >= 0); });
    D.team.forEach(function (t) { var f = figuren[t.id]; if (f) f.el.classList.toggle('ruht', paket.raeume.indexOf(t.platz) < 0); });
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
  function lage() {
    var handy = mass().w <= 820, k = $('.kopf').getBoundingClientRect(), p = $('.paket').getBoundingClientRect();
    $('.ticker').style.top = handy ? (k.bottom + 8) + 'px' : '';
    $('[data-info]').style.bottom = handy ? (window.innerHeight - p.top + 8) + 'px' : '';
  }

  /* ── Aufbau aus buero-daten.json ── */
  function aufbauen(daten) {
    D = daten; S = D.szene; wegeBauen();
    if (D.titel) $('[data-titel]').textContent = D.titel;
    if (D.untertitel) $('[data-untertitel]').textContent = D.untertitel;
    var k = $('[data-kontakt]'); if (D.kontaktLink) k.href = D.kontaktLink; if (D.kontaktText) k.firstChild.nodeValue = D.kontaktText + ' ';
    $('[data-lizenz]').textContent = D.lizenzHinweis || '';

    kugelRuhe = glanzTeil('glanz--kugel-ruhe', S.kugel[0], S.kugel[1], 90, 90);
    kugel = glanzTeil('glanz--kugel', S.kugel[0], S.kugel[1], 170, 170);
    ausgang = glanzTeil('glanz--auto', S.auto[0], S.auto[1], 120, 70);
    Object.keys(S.orte).forEach(function (o) {
      raumGlanz[o] = S.orte[o].schirme.map(function (t) { return glanzTeil('glanz--schirm', t[0], t[1], t[2] || 70, t[3] || 28); });
    });
    bahnenBauen();

    var ks = schild([S.kugel[0], S.kugel[1] - 104], true, 'schild schild--kugel');
    ks.appendChild(el('b', null, D.kugel.name)); ks.appendChild(el('small', null, D.kugel.kurz || D.kugel.text));
    ks.addEventListener('click', function () { info(D.kugel.name, D.kugel.text + ' Jede Anfrage, jeder Termin, jede Rechnung.'); blitz(kugel, 1200); });

    var erstesAb = function (rid) { for (var i = 0; i < D.pakete.length; i++) if (D.pakete[i].raeume.indexOf(rid) >= 0) return D.pakete[i].name; return ''; };
    D.raeume.forEach(function (r) {
      var o = S.orte[r.ort]; if (!o) return;
      var kk = o.kasten, d = el('div', 'dunkel');
      d.style.cssText = 'left:' + kk[0][0] + 'px;top:' + kk[0][1] + 'px;width:' + (kk[1][0] - kk[0][0]) + 'px;height:' + (kk[1][1] - kk[0][1]) + 'px';
      welt.appendChild(d); raumDunkel[r.id] = d;
      var s = schild(o.schild, true, 'schild'); s.style.setProperty('--farbe', r.farbe);
      s.appendChild(el('b', null, r.name)); s.appendChild(el('small', null, r.unterzeile)); s.appendChild(el('span', 'ab', 'ab ' + erstesAb(r.id)));
      s.setAttribute('aria-label', r.name + ', ' + r.unterzeile);
      s.addEventListener('click', function () {
        zuOrt(r.ort);
        var laeuft = paket.raeume.indexOf(r.id) >= 0;
        var ext = Object.keys(D.extras).filter(function (x) { return D.extras[x].raum === r.id && paket.extras.indexOf(x) >= 0; }).map(function (x) { return D.extras[x].name; });
        info(r.name, laeuft ? r.unterzeile + (ext.length ? ' · mit ' + ext.join(', ') : '') : 'Läuft ab dem Paket ' + erstesAb(r.id) + '.');
      });
      raumSchild[r.id] = s;
    });
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
    var img = $('.welt__bild'), fertig = function () { $('[data-lade]').hidden = true; };
    if (img.complete) fertig(); else { img.addEventListener('load', fertig); img.addEventListener('error', fertig); }
    QUELLE.start();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) laufen(); });
  fetch('buero-daten.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(aufbauen)
    .catch(function () { $('[data-lade]').textContent = 'Das Büro konnte nicht geladen werden.'; });
})();
