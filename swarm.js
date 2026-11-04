// Zwerm-intro: een groep cursors bouwt de zichtbare pagina op. Ze typen teksten
// en tekenen knoppen. Geen libraries. Aan/uit-logica staat in de <head> van index.html.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const BOX = ".btn, nav a.pill, .tags li, .contact-panel";
  const TEXT = ".brand, nav a:not(.pill), h1, h2, h3, p, dt, dd, .mail, footer .wrap > span";
  const COLORS = ["#1F5F8B", "#16181D", "#3D86BF", "#174A6E", "#5B6676"];
  let running = false;
  let aborted = false;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const tween = (ms, f) => new Promise((done) => {
    const t0 = performance.now();
    const tick = (now) => {
      if (aborted) return done();
      const p = Math.min((now - t0) / ms, 1);
      f(p);
      if (p < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  const wait = (ms) => tween(ms, () => {});
  const tagOf = (el) => el.tagName.toLowerCase() + (el.classList[0] ? "." + el.classList[0]
    : el.getAttribute("href") ? `[href="${el.getAttribute("href")}"]` : "");
  const px = (v) => Math.round(v);

  // Tekstregels van een element, samengevoegd per regel, in viewport-coördinaten.
  function linesOf(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const out = [];
    for (const q of r.getClientRects()) {
      if (!q.width) continue;
      const mid = (q.top + q.bottom) / 2;
      const l = out.find((o) => mid > o.top && mid < o.bottom);
      if (l) {
        l.left = Math.min(l.left, q.left); l.right = Math.max(l.right, q.right);
        l.top = Math.min(l.top, q.top); l.bottom = Math.max(l.bottom, q.bottom);
      } else out.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom });
    }
    return out.sort((a, b) => a.top - b.top);
  }

  // Alles wat nu in beeld staat en opgebouwd moet worden.
  function collect(H) {
    const units = [];
    const inView = (b) => b.width > 0 && b.bottom > 0 && b.top < H;
    for (const el of document.querySelectorAll(BOX)) {
      const box = el.getBoundingClientRect();
      if (inView(box)) units.push({ el, box, kind: "box", verb: "draw", tag: tagOf(el) });
    }
    for (const el of document.querySelectorAll(TEXT)) {
      if (el.closest(BOX) || el.parentElement.closest(TEXT)) continue;
      const box = el.getBoundingClientRect();
      const lines = linesOf(el);
      if (inView(box) && lines.length) units.push({ el, box, lines, kind: "text", verb: "type", tag: tagOf(el) });
    }
    return units;
  }

  function run() {
    const W = innerWidth;
    const H = innerHeight;
    const units = collect(H);
    if (!units.length) { root.classList.remove("swarm-hide"); running = false; return; }
    aborted = false;

    // Startstand: alles in beeld verborgen, de lege opmaak (vlakken, achtergronden) zichtbaar.
    for (const u of units) {
      if (u.kind === "box") { u.el.style.opacity = "0"; u.el.style.transform = "scale(0.96)"; }
      else u.el.style.clipPath = "polygon(0 0, 0 0, 0 0)";
    }
    root.classList.remove("swarm-hide");

    const layer = document.createElement("div");
    layer.id = "swarm";
    document.body.appendChild(layer);

    // Build-log rechtsonder (op smalle schermen verborgen via CSS).
    const t0 = performance.now();
    const logEl = document.createElement("div");
    logEl.className = "log";
    layer.appendChild(logEl);
    const logLines = [];
    const log = (line) => {
      logLines.push(line);
      if (logLines.length > 7) logLines.shift();
      logEl.innerHTML = logLines.join("\n");
    };

    // Inspector-kader met tag en afmetingen, zoals in DevTools.
    function inspect(c, box, text) {
      const el = document.createElement("div");
      el.className = "insp";
      el.style.cssText = `left:${box.left - 3}px;top:${box.top - 3}px;width:${box.width + 6}px;height:${box.height + 6}px;border-color:${c.color}`;
      el.innerHTML = `<i class="badge" style="background:${c.color}">${text}</i>`;
      layer.appendChild(el);
      return () => { el.style.opacity = "0"; setTimeout(() => el.remove(), 350); };
    }

    const n = Math.min(units.length, W < 700 ? 3 : 5);
    log(`<b>$</b> swarm build --agents ${n} --viewport ${W}x${H}`);
    log(`  ${units.length} elements queued`);
    const cursors = Array.from({ length: n }, (_, i) => {
      const color = COLORS[i % COLORS.length];
      const el = document.createElement("div");
      el.className = "c";
      el.innerHTML = `<svg viewBox="0 0 16 20" width="18" height="22" aria-hidden="true"><path d="M1.5 1.5v14.2l3.9-3.7 2.6 6.1 2.6-1.1-2.6-6h5.5z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${color}"></span>`;
      layer.appendChild(el);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
      const c = { el, color, id: `agent-${i + 1}`, label: el.querySelector("span"), x: W / 2 + Math.cos(a) * W * 0.75, y: H / 2 + Math.sin(a) * H * 0.75 };
      setPos(c, c.x, c.y);
      return c;
    });

    function setPos(c, x, y) {
      c.x = x; c.y = y;
      c.el.style.transform = `translate(${x}px, ${y}px)`;
      c.el.classList.toggle("flip", x > W - 130);
    }

    // Beweeg langs een licht gebogen baan.
    function move(c, x, y, ms) {
      const x0 = c.x, y0 = c.y;
      const dist = Math.hypot(x - x0, y - y0);
      const bend = (Math.random() - 0.5) * 0.35 * dist;
      const mx = (x0 + x) / 2 - ((y - y0) / (dist || 1)) * bend;
      const my = (y0 + y) / 2 + ((x - x0) / (dist || 1)) * bend;
      return tween(ms || clamp(220 + dist * 0.45, 220, 700), (p) => {
        const e = ease(p), k = 1 - e;
        setPos(c, k * k * x0 + 2 * k * e * mx + e * e * x, k * k * y0 + 2 * k * e * my + e * e * y);
      });
    }

    function click(c) {
      const r = document.createElement("div");
      r.className = "ripple";
      r.style.borderColor = c.color;
      r.style.left = c.x + "px";
      r.style.top = c.y + "px";
      layer.appendChild(r);
      setTimeout(() => r.remove(), 500);
    }

    async function type(c, u) {
      const { el, box } = u;
      const w = box.width;
      const L = u.lines.map((l, i, all) => ({
        x0: l.left - box.left,
        x1: l.right - box.left,
        top: i ? (all[i - 1].bottom + l.top) / 2 - box.top : Math.min(0, l.top - box.top) - 4,
        bot: i < all.length - 1 ? (l.bottom + all[i + 1].top) / 2 - box.top : Math.max(box.height, l.bottom - box.top) + 4,
        y: l.bottom - box.top - (l.bottom - l.top) * 0.2,
      }));
      const total = L.reduce((s, l) => s + l.x1 - l.x0, 0);
      const dur = clamp(total / 1.6, 350, 1300);
      await move(c, box.left + L[0].x0, box.top + L[0].y);
      click(c);
      const done = inspect(c, box, `${u.tag} · ${px(box.width)}×${px(box.height)}`);
      const caret = document.createElement("div");
      caret.className = "caret";
      caret.style.background = c.color;
      layer.appendChild(caret);
      for (let i = 0; i < L.length; i++) {
        const l = L[i];
        const line = u.lines[i];
        caret.style.top = line.top + "px";
        caret.style.height = line.bottom - line.top + "px";
        caret.style.left = box.left + l.x0 + "px";
        if (i) await move(c, box.left + l.x0, box.top + l.y, 90);
        await tween((dur * (l.x1 - l.x0)) / total, (p) => {
          const x = l.x0 + (l.x1 - l.x0) * p;
          el.style.clipPath = `polygon(0 0, ${w}px 0, ${w}px ${l.top}px, ${x}px ${l.top}px, ${x}px ${l.bot}px, 0 ${l.bot}px)`;
          caret.style.left = box.left + x + "px";
          setPos(c, box.left + x + 4, box.top + l.y);
        });
      }
      el.style.clipPath = "";
      caret.remove();
      done();
    }

    async function draw(c, u) {
      const { el, box } = u;
      await move(c, box.left, box.top);
      click(c);
      c.el.classList.add("down");
      const sel = document.createElement("div");
      sel.className = "sel";
      const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 4, box.height / 2);
      sel.style.cssText = `left:${box.left}px;top:${box.top}px;border-color:${c.color};background:${c.color}1f;border-radius:${radius}px`;
      sel.innerHTML = `<i class="badge" style="background:${c.color}"></i>`;
      const dims = sel.firstChild;
      layer.appendChild(sel);
      await tween(clamp(250 + Math.sqrt(box.width * box.height) * 1.2, 300, 800), (p) => {
        const e = ease(p);
        sel.style.width = box.width * e + "px";
        sel.style.height = box.height * e + "px";
        dims.textContent = `${u.tag} · ${px(box.width * e)}×${px(box.height * e)}`;
        setPos(c, box.left + box.width * e, box.top + box.height * e);
      });
      c.el.classList.remove("down");
      el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      el.style.opacity = "1";
      el.style.transform = "";
      sel.style.opacity = "0";
      setTimeout(() => sel.remove(), 350);
    }

    // Eerste ronde: de grootste klussen (kop, lopende tekst) gaan meteen van start.
    // Daarna pakt elke cursor steeds het dichtstbijzijnde onderdeel dat nog niet gebouwd is.
    const work = (u) => (u.kind === "text" ? u.lines.reduce((s, l) => s + l.right - l.left, 0) : 0);
    async function worker(c, i) {
      await wait(i * 140);
      let first = true;
      while (units.length && !aborted) {
        let best = 0, bestD = Infinity;
        units.forEach((u, j) => {
          const d = first ? -work(u) : Math.hypot(u.box.left - c.x, u.box.top - c.y);
          if (d < bestD) { bestD = d; best = j; }
        });
        first = false;
        const u = units.splice(best, 1)[0];
        c.label.textContent = `${c.id} · ${u.verb} ${u.tag}`;
        const start = performance.now();
        await (u.kind === "box" ? draw(c, u) : type(c, u));
        if (!aborted) log(`<b>✓</b> ${c.id}  ${u.verb}  ${u.tag.padEnd(22)} ${px(performance.now() - start)}ms`);
      }
      c.label.textContent = "";
      const ex = c.x < W / 2 ? -40 : W + 40;
      c.el.style.opacity = "0";
      await move(c, ex, c.y + (Math.random() - 0.5) * 200, 500);
    }

    const all = units.slice();
    const skip = () => { aborted = true; };
    // Klikken onderbreekt niet; scrollen wel, want dan kloppen de posities niet meer.
    const events = ["keydown", "wheel", "scroll"];
    events.forEach((e) => addEventListener(e, skip, { passive: true }));
    const safety = setTimeout(skip, 9000);

    Promise.all(cursors.map(worker)).catch(skip).then(async () => {
      log(`<b>✓</b> build complete in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
      await wait(700);
      clearTimeout(safety);
      events.forEach((e) => removeEventListener(e, skip));
      for (const u of all) {
        const s = u.el.style;
        s.clipPath = s.opacity = s.transform = s.transition = "";
      }
      layer.remove();
      running = false;
    });
  }

  function play() {
    if (running) return;
    running = true;
    root.classList.add("swarm-hide");
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      try { run(); } catch (err) { root.classList.remove("swarm-hide"); running = false; }
    }));
  }

  if (root.classList.contains("swarm-hide")) {
    try { sessionStorage.setItem("swarm", "1"); } catch (e) {}
    play();
  }

  // Opnieuw afspelen: klik op het blauwe puntje achter de naam.
  const dot = document.querySelector(".brand span");
  if (dot) {
    dot.addEventListener("click", (e) => {
      if (reduce.matches) return;
      e.preventDefault();
      play();
    });
  }
})();
