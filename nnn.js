/* NICE NEW NAILS · motion and the sections below the try-on stage.
   aurella.js owns the stage and the selected shade; this file listens for the shade and drives everything else.
   Every block is independent: if one fails or its element is missing, the rest still runs. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
  const wide = matchMedia("(min-width:1001px)").matches;
  const G = window.gsap && window.ScrollTrigger ? window.gsap : null;
  if (G) G.registerPlugin(window.ScrollTrigger);
  const ST = G ? window.ScrollTrigger : null;
  const scrubbed = !!G && wide && !reduced;          // pinned, scroll-scrubbed scenes: desktop only

  const KEYS = ["aube", "eveil", "solstice", "vesper", "nocturne", "eclipse"];
  const NAMES = ["Aube", "Éveil", "Solstice", "Vesper", "Nocturne", "Éclipse"];
  const HEX = ["#F4D7D4", "#D6598F", "#FF6B6B", "#7A2E6F", "#3B1B4F", "#1A0F2E"];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const safe = (name, f) => { try { f(); } catch (e) { console.warn("nnn:", name, e); } };
  const seen = (el, f, opt) => {
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { f(e.target); io.unobserve(e.target); } }), opt || { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
  };
  const inView = (el, f) => { if (el) new IntersectionObserver((es) => es.forEach((e) => f(e.isIntersecting))).observe(el); };

  // ── the selected shade ──
  const labels = () => $$("#frascos .frasco");
  let shade = Math.max(0, labels().findIndex((l) => l.classList.contains("elegido")));
  const listeners = [];
  const onShade = (f) => { listeners.push(f); f(shade, true); };
  const pick = (i) => { const l = labels()[i]; if (l) l.click(); };
  new MutationObserver(() => {
    const i = labels().findIndex((l) => l.classList.contains("elegido"));
    if (i < 0 || i === shade) return;
    shade = i; listeners.forEach((f) => safe("shade", () => f(i, false)));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });

  // ── nav: bar, then pill; hides on the way down, returns on the way up ──
  safe("nav", () => {
    const bar = $(".barra"); let last = scrollY;
    const tick = () => {
      const y = scrollY, down = y > last + 4, up = y < last - 4;
      bar.classList.toggle("nn-pill", y > 60);
      if (document.documentElement.classList.contains("fija") || y < innerHeight * 0.6) bar.classList.remove("nn-hide");
      else if (down) bar.classList.add("nn-hide");
      else if (up) bar.classList.remove("nn-hide");
      if (down || up) last = y;
    };
    addEventListener("scroll", tick, { passive: true }); tick();
    bar.addEventListener("focusin", () => bar.classList.remove("nn-hide"));
  });

  // ── breathing display type ──
  safe("breathe", () => {
    if (reduced || !G) return;
    G.to([...$$(".nombre"), $(".nn-pie-word")].filter(Boolean), { "--nn-w": 540, "--nn-wd": 100, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
  });

  // ── shade name scrambles in ──
  safe("scramble", () => {
    if (reduced) return;
    const glyphs = "NICENEWNAILS#%&$";
    onShade((i, first) => {
      if (first) return;
      for (const el of [$("#fNombre"), $("#cNombre")]) {
        if (!el) continue;
        const word = NAMES[i]; let f = 0; clearInterval(el._sc);
        el._sc = setInterval(() => {
          f++;
          el.textContent = [...word].map((c, k) => (k < f / 2 ? c : glyphs[(Math.random() * glyphs.length) | 0])).join("");
          if (f / 2 >= word.length) { clearInterval(el._sc); el.textContent = word; }
        }, 34);
      }
    });
  });

  // ── masked line reveals on headings ──
  safe("lines", () => {
    $$(".nn-lines").forEach((h) => {
      h.innerHTML = h.innerHTML.split(/<br\s*\/?>/i).map((l) => `<span class="nn-line"><span>${l}</span></span>`).join("");
      seen(h, (el) => el.classList.add("is-in"));
    });
    seen($(".nn-pie-word"), (el) => el.classList.add("is-in"), { rootMargin: "0px 0px -4% 0px" });
  });

  // ── 2 · manifesto: words light up with the scroll, tapes run and lean with the speed ──
  safe("manifesto", () => {
    const h = $(".nn-fill");
    if (h) {
      const key = /^(colour|beige|gloss|reflection)/i;
      h.innerHTML = h.textContent.trim().split(/\s+/).map((w) => `<span class="nn-w${key.test(w) ? " is-key" : ""}">${w}</span>`).join(" ");
      const words = $$(".nn-w", h);
      const light = (p) => { const n = Math.round(p * words.length); words.forEach((w, k) => w.classList.toggle("is-lit", k < n)); };
      if (G && !reduced) ST.create({ trigger: h, start: "top 82%", end: "bottom 45%", onUpdate: (s) => light(s.progress) });
      else light(1);
    }
    const bits = ["<b>nice new nails</b>", "<i>12 ml</i>", "<b>high gloss</b>", "<i>six shades</i>", "<b>zero beige</b>", "<i>chip-resistant</i>"];
    const rows = $$(".nn-tape-row").map((el) => {
      el.innerHTML = Array(6).fill(bits.join("<u></u>") + "<u></u>").join("");
      return { el, dir: +el.dataset.dir || -1, x: 0, half: 0 };
    });
    if (reduced || !rows.length) return;
    const measure = () => rows.forEach((r) => { r.half = r.el.scrollWidth / 2; });
    measure(); addEventListener("resize", measure); document.fonts && document.fonts.ready.then(measure);
    let on = false, lastY = scrollY, vel = 0, raf = 0;
    const loop = () => {
      const y = scrollY; vel += ((y - lastY) - vel) * 0.12; lastY = y;
      rows.forEach((r) => {
        r.x += r.dir * (0.7 + Math.abs(vel) * 0.55);
        if (r.half) { if (r.x <= -r.half) r.x += r.half; if (r.x > 0) r.x -= r.half; }
        r.el.style.transform = `translate3d(${r.x}px,0,0) skewX(${clamp(vel * -0.5 * r.dir, -16, 16)}deg)`;
      });
      if (on) raf = requestAnimationFrame(loop);
    };
    inView($("#manifesto"), (v) => { if (v && !on) { on = true; lastY = scrollY; raf = requestAnimationFrame(loop); } else if (!v) { on = false; cancelAnimationFrame(raf); } });
  });

  // ── 3 · the six: cards tilt toward the pointer ──
  safe("tilt", () => {
    if (!fine || reduced) return;
    $$("#rejilla .tarjeta").forEach((c) => {
      const f = $(".foto", c);
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        f.style.setProperty("--ry", px * 22 + "deg"); f.style.setProperty("--rx", py * -16 + "deg");
      });
      c.addEventListener("pointerleave", () => { f.style.setProperty("--ry", "0deg"); f.style.setProperty("--rx", "0deg"); });
    });
  });

  // ── 4 · the pour: the clip is scrubbed by the scroll, then the shade floods the screen ──
  safe("pour", () => {
    const v = $("#pourVid"), sec = $("#pour"); if (!v || !sec) return;
    const load = () => { if (!v.src) { v.src = v.dataset.src; v.load(); } };
    if (!scrubbed) {
      if (reduced) { $(".nn-pour-film").classList.add("is-ready"); return; }   // the poster stays
      v.loop = true;
      $(".nn-pour-film").classList.add("is-ready");
      inView(sec, (on) => { if (on) { load(); v.play().catch(() => {}); } else v.pause(); });
      return;
    }
    // the poster is the clip's last (flooded) frame: right for a still, wrong before a scrub that starts on black.
    // The clip is fetched whole and played from memory so it can be seeked on any server (python's dev server has no byte ranges).
    v.removeAttribute("poster");
    const filmEl = $(".nn-pour-film");
    v.addEventListener("loadeddata", () => filmEl.classList.add("is-ready"), { once: true });
    fetch(v.dataset.src).then((r) => r.blob()).then((blob) => { v.src = URL.createObjectURL(blob); v.load(); }).catch(load);
    const film = { t: 0 };
    const words = $$(".nn-pour-h span");
    G.set(words, { yPercent: 120, rotate: 8, opacity: 0 });
    G.set(".nn-pour-sub", { opacity: 0 });
    const tl = G.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: sec, start: "top top", end: "+=240%", pin: ".nn-pour-pin", scrub: 0.6, anticipatePin: 1 },
    });
    tl.to(film, { t: 1, duration: 0.72, onUpdate: () => { if (v.duration) v.currentTime = clamp(film.t * v.duration, 0, v.duration - 0.06); } }, 0)
      .to(words, { yPercent: 0, rotate: 0, opacity: 1, duration: 0.16, stagger: 0.1, ease: "power3.out" }, 0.04)
      .to(".nn-pour-sub", { opacity: 0.8, duration: 0.1 }, 0.34)
      .to(v, { scale: 2.7, duration: 0.36 }, 0.44)
      .to(".nn-pour-flood", { clipPath: "circle(125% at 50% 62%)", duration: 0.26 }, 0.74);
  });

  // ── 5 · how to wear: three chapters, each photo wipes over the last ──
  safe("how", () => {
    const photos = $$(".nn-how-photo"), steps = $$(".nn-step"), num = $("#howNum"); if (!photos.length) return;
    let cur = -1;
    const go = (i) => {
      if (i === cur) return; cur = i;
      photos.forEach((p, k) => p.classList.toggle("is-on", k <= i));
      steps.forEach((s, k) => s.classList.toggle("is-on", k === i));
      if (num) num.textContent = "0" + (i + 1);
    };
    go(0);
    if (scrubbed) {
      ST.create({ trigger: ".nn-how-pin", start: "center center", end: "+=170%", pin: true, scrub: true, anticipatePin: 1, onUpdate: (s) => go(clamp(Math.floor(s.progress * 3), 0, 2)) });
    } else if (!reduced) {
      let timer = 0;
      inView($(".nn-how-photos"), (on) => { clearInterval(timer); if (on) timer = setInterval(() => go((cur + 1) % 3), 2600); });
    }
  });

  // ── 6 · bare vs painted: an elastic divider ──
  safe("compare", () => {
    const box = $("#cmp"), bar = $("#cmpBar"), bare = $("#cmpBare"), paint = $("#cmpPaint"), name = $("#cmpName"); if (!box) return;
    const size = innerWidth < 900 ? 1280 : 2560;
    onShade((i) => {
      bare.src = `media/bare-${KEYS[i]}-${size}.webp?v=1`;
      paint.src = `media/c-${KEYS[i]}-${size}.webp?v=9`;
      paint.alt = `The same hand wearing ${NAMES[i]}`;
      if (name) name.textContent = NAMES[i];
    });
    let pos = 34, target = 34, vel = 0, raf = 0, drag = false;
    const draw = () => { box.style.setProperty("--x", pos + "%"); bar.setAttribute("aria-valuenow", Math.round(pos)); };
    const loop = () => {
      vel = (vel + (target - pos) * 0.14) * 0.72; pos += vel;
      draw();
      if (Math.abs(vel) > 0.01 || Math.abs(target - pos) > 0.05) raf = requestAnimationFrame(loop); else { pos = target; draw(); raf = 0; }
    };
    const to = (t) => { target = clamp(t, 4, 96); if (reduced) { pos = target; draw(); } else if (!raf) raf = requestAnimationFrame(loop); };
    const fromEvent = (e) => { const r = box.getBoundingClientRect(); to(((e.clientX - r.left) / r.width) * 100); };
    box.addEventListener("pointerdown", (e) => { drag = true; box.classList.add("is-drag"); box.setPointerCapture(e.pointerId); fromEvent(e); });
    box.addEventListener("pointermove", (e) => { if (drag) fromEvent(e); });
    const end = () => { drag = false; box.classList.remove("is-drag"); };
    box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
    bar.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { to(target - 4); e.preventDefault(); }
      if (e.key === "ArrowRight") { to(target + 4); e.preventDefault(); }
    });
    draw();
    if (!reduced) seen(box, () => { to(58); setTimeout(() => { if (!drag) to(30); }, 900); }, { threshold: 0.45 });
  });

  // ── 7 · the numbers roll up ──
  safe("numbers", () => {
    seen($(".nn-stats"), (ul) => {
      ul.classList.add("is-in");
      if (reduced) return;
      $$("[data-count]", ul).forEach((el, k) => {
        const end = +el.dataset.count, t0 = performance.now() + k * 140, dur = 1300;
        const step = (now) => {
          const p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.round(end * e);
          if (p < 1) requestAnimationFrame(step);
        };
        el.textContent = "0"; requestAnimationFrame(step);
      });
    });
  });

  // ── 8 · worn out: a reel you can drag and throw ──
  safe("reel", () => {
    const reel = $("#reel"), track = $("#reelTrack"); if (!reel) return;
    track.innerHTML = KEYS.map((k, i) => `
      <li class="nn-shot" style="--t:${HEX[i]}">
        <img src="media/worn-${k}-900.webp" srcset="media/worn-${k}-540.webp 540w, media/worn-${k}-900.webp 900w" sizes="(max-width:760px) 60vw, 24vw" width="900" height="1613" alt="A hand wearing ${NAMES[i]} nail lacquer" loading="lazy" decoding="async" draggable="false">
        <button type="button" data-i="${i}" aria-label="Wear ${NAMES[i]}">${NAMES[i]}</button>
      </li>`).join("");
    let x = 0, v = 0, min = 0, drag = false, moved = 0, lx = 0, raf = 0, drift = reduced ? 0 : -0.35, visible = false;
    const measure = () => { min = Math.min(0, reel.clientWidth - track.scrollWidth); x = clamp(x, min, 0); draw(); };
    const draw = () => { track.style.transform = `translate3d(${x}px,0,0)`; };
    const loop = () => {
      if (!drag) {
        x += v + drift; v *= 0.94;
        if (x < min) { x = min; v = 0; drift = Math.abs(drift); }
        if (x > 0) { x = 0; v = 0; drift = -Math.abs(drift); }
        draw();
      }
      raf = visible && (drift || Math.abs(v) > 0.05 || drag) ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    reel.addEventListener("pointerdown", (e) => { drag = true; moved = 0; lx = e.clientX; v = 0; reel.classList.add("is-drag"); });
    addEventListener("pointermove", (e) => {
      if (!drag) return;
      const d = e.clientX - lx; lx = e.clientX; moved += Math.abs(d);
      x = clamp(x + d, min - 80, 80); v = d; draw();
    });
    const end = () => { if (!drag) return; drag = false; reel.classList.remove("is-drag"); if (moved > 6) drift = 0; kick(); };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
    track.addEventListener("click", (e) => {
      const li = e.target.closest(".nn-shot"); if (!li || moved > 6) return;
      pick(+$("button", li).dataset.i);
    });
    measure(); addEventListener("resize", measure); addEventListener("load", measure);
    inView(reel, (on) => { visible = on; if (on) kick(); });
  });

  // ── 9 · the outline headline fills; a valid email throws lacquer ──
  safe("final", () => {
    const h = $(".nn-outline");
    if (h) {
      if (G && !reduced) ST.create({ trigger: h, start: "top 88%", end: "top 30%", scrub: 0.4, onUpdate: (s) => h.style.setProperty("--f", s.progress * 100 + "%") });
      else h.style.setProperty("--f", "100%");
    }
    const form = $("#correo");
    if (form && !reduced) form.addEventListener("submit", () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("#email").value.trim())) return;
      const r = $(".laca", form).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (let k = 0; k < 28; k++) {
        const d = document.createElement("i"); d.className = "nn-drop"; d.style.background = HEX[k % 6];
        document.body.appendChild(d);
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, dist = 120 + Math.random() * 260, s = 0.6 + Math.random() * 1.2;
        d.animate([
          { transform: `translate(${cx}px,${cy}px) rotate(-45deg) scale(0)`, opacity: 1 },
          { transform: `translate(${cx + Math.cos(a) * dist}px,${cy + Math.sin(a) * dist}px) rotate(-45deg) scale(${s})`, opacity: 1, offset: 0.45 },
          { transform: `translate(${cx + Math.cos(a) * dist * 1.15}px,${cy + Math.sin(a) * dist + 260}px) rotate(-45deg) scale(${s * 0.7})`, opacity: 0 },
        ], { duration: 1300 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => d.remove();
      }
    });
  });

  // ── footer: links without a page stay put ──
  safe("footer", () => {
    $$('.nn-pie a[href="#"]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  });

  // ── magnetic buttons ──
  safe("magnet", () => {
    if (!fine || reduced) return;
    $$(".laca, .probar, .bolsa, .nn-social a").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.22}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`;
      });
      b.addEventListener("pointerleave", () => {
        const from = b.style.translate || "0px 0px"; b.style.translate = "";
        b.animate([{ translate: from }, { translate: "0px 0px" }], { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)" });
      });
    });
  });

  // ── the lacquer-drop cursor ──
  safe("cursor", () => {
    const c = $("#nnCursor"); if (!c || !fine || reduced) return;
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2;
      c.style.transform = `translate3d(${x}px,${y}px,0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(loop) : 0;
    };
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      if (!c.classList.contains("is-on")) { x = tx; y = ty; c.classList.add("is-on"); }
      c.classList.toggle("is-hot", !!e.target.closest("a,button,[role=slider],[role=button],.nn-shot,.tarjeta,.nn-reel"));
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener("pointerleave", () => c.classList.remove("is-on"));
  });

  // pinned scenes measure the page: re-measure once images and fonts have settled
  if (ST) { addEventListener("load", () => ST.refresh()); document.fonts && document.fonts.ready.then(() => ST.refresh()); }
})();
