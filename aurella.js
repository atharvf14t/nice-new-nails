/* AURÉLLA · prueba de 2 colores (31-oct-2026).
   Plano general: clic en un esmalte -> las unas y la mesa se tinen de ese color, desde el frasco.
   Clic en la mano -> la camara se acerca y pasa al primer plano de frente y desde arriba (otra foto, otro angulo);
   los colores salen como gotas de laca; clic -> se pinta de cerca.
   Todo son fotos alineadas (generadas a 4K) mezcladas en un shader. */
(() => {
  // the server may send a year of cache: change V with every new version or the browser keeps the old files
  const V = "9";
  /* The six lacquers are the six colours of the palette, hex exact. Order = the order of the bottles in the photographs
     (left to right). `img` names the photo set in media/ (w-<img>-…, c-<img>-…, mw-, mc-, frasco-, unas-, ida-, vuelta-).
     Desktop (w-, c-, unas-, ida-) is the AURÉLLA photography. The phone photographs and videos (mw-, mc-, ida-m-, vuelta-m-) and
     the bottle shots (frasco-) are stand-ins made by tools/make_standins.py until you shoot your own, under these same keys.
     claro: a lighter step for focus rings and the menu underline.
     sobrePapel: the same hue deepened so that it reads as text on the blush paper (>= 4.5:1). */
  const TONOS = [
    { n: "01", nombre: "Aube",   hex: "#F4D7D4", claro: "#E8B5B2", activo: true, img: "aube",   tinta: "oscura", sobrePapel: "#A64B5C", desc: "Milky petal pink" },
    { n: "02", nombre: "Éveil", hex: "#D6598F", claro: "#E98BB2", activo: true, img: "eveil", tinta: "oscura", sobrePapel: "#C23575", desc: "Bright orchid rose" },
    { n: "03", nombre: "Solstice",   hex: "#FF6B6B", claro: "#FF9A93", activo: true, img: "solstice",   tinta: "oscura", sobrePapel: "#C23E3D", desc: "Luminous coral" },
    { n: "04", nombre: "Vesper",    hex: "#7A2E6F", claro: "#B06AA5", activo: true, img: "vesper",    sobrePapel: "#7A2E6F", desc: "Ripe velvet plum" },
    { n: "05", nombre: "Nocturne",   hex: "#3B1B4F", claro: "#7A4F93", activo: true, img: "nocturne",   sobrePapel: "#3B1B4F", desc: "Deep aubergine" },
    { n: "06", nombre: "Éclipse",  hex: "#1A0F2E", claro: "#5A4378", activo: true, img: "eclipse",  sobrePapel: "#1A0F2E", desc: "Near-black violet" },
  ];
  const PRECIO = "$28";
  // MOVIL: fotos y videos 9:16 (stand-ins de tools/make_standins.py o los tuyos). La mesa se hace con la camara mas atras
  // para que los 6 frascos quepan de ancho en cualquier movil (entre 0,15 y 0,86). Se decide al cargar.
  const MOVIL = innerWidth / innerHeight < 0.8;
  // texture tiers: the "4k" tier exists on desktop (the 2752 px renders); the phone stand-ins go up to 1600 px only.
  // Set the phone to true once its 3072 px masters are exported (tools/export_media.py).
  const FULL_RES = !MOVIL;
  const E = MOVIL ? {
    CX: [0.2023, 0.3260, 0.4500, 0.5785, 0.6991, 0.8196], Y_TAPA: 0.441, Y_BASE: 0.545, MEDIO: 0.055,
    MANO: [[0, 0.23], [0.35, 0.26], [0.58, 0.32], [0.75, 0.37], [0.75, 0.425], [0.5, 0.43], [0.3, 0.40], [0, 0.33]],
    BRILLO: [0.493, 0.06, 0.065], ASP: 3072 / 5504, pre: "m", sub: "m-",
  } : {
    // positions in the photograph (uv, y downwards), measured on the delivered desktop renders (2752x1536):
    // CX = centres of the six caps, Y_TAPA = top of the caps, Y_BASE = bottom of the glass, MEDIO = half-width of a bottle's hover zone,
    // MANO = outline of the hand and forearm (the clickable area), BRILLO = [y of the glow, x radius, y radius] of the hover light
    CX: [0.2059, 0.3228, 0.4399, 0.5569, 0.6742, 0.7896], Y_TAPA: 0.52, Y_BASE: 0.807, MEDIO: 0.04,
    MANO: [[0, 0], [0.12, 0], [0.27, 0.12], [0.40, 0.16], [0.51, 0.24], [0.565, 0.40], [0.56, 0.45], [0.52, 0.48], [0.40, 0.48], [0.34, 0.44], [0.29, 0.40], [0.26, 0.32], [0.20, 0.28], [0.14, 0.20], [0.077, 0.16], [0, 0.12]],
    BRILLO: [0.664, 0.065, 0.20], ASP: 5504 / 3072, pre: "", sub: "",
  };
  const { CX, Y_TAPA, Y_BASE, MANO, ASP } = E, MEDIO_ANCHO = E.MEDIO;
  const CROP = [0.4124, 0.1255, 0.4000, 0.4000];
  addEventListener("resize", () => { if ((innerWidth / innerHeight < 0.8) !== MOVIL) location.reload(); });

  const $ = (s) => document.querySelector(s);
  const lienzo = $("#lienzo");
  const glOptions = { antialias: false, premultipliedAlpha: false };
  const gl = lienzo.getContext("webgl2", glOptions) || lienzo.getContext("webgl", glOptions);
  const GL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── shader ──
  const VS = `attribute vec2 p;varying vec2 s;void main(){s=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
  const FS = `precision highp float;varying vec2 s;
  uniform sampler2D wA,wB,cA,cB;uniform vec4 view,crop;uniform vec2 k,org;uniform vec3 hb;uniform float mixp,cerca,cz,sa,hov,hovAmt,elegido;uniform float cx[6];
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float ruido(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  void main(){
    vec2 iu=.5+(s-.5)*k;
    vec2 wu=view.xy+iu*view.zw;
    vec2 cu=.5+(iu-.5)/cz;   // primer plano: su propia foto, con un ultimo acercamiento que se asienta
    // la laca entra desde donde se clico: borde organico, como un charco que se extiende
    float d=length((s-org)*vec2(sa,1.));
    float n=ruido(s*vec2(sa,1.)*9.)*.6+ruido(s*vec2(sa,1.)*23.)*.4;
    float r=mixp*(1.9+.25);
    float m=1.-smoothstep(r-.09,r,d+n*.11);
    vec3 w=mix(texture2D(wA,wu).rgb,texture2D(wB,wu).rgb,m);
    // el frasco bajo el raton gana un poco de luz, con caida muy suave (sin cajas)
    if(cerca<.999&&hov>-.5){
      float c=0.;for(int i=0;i<6;i++){if(float(i)==hov)c=cx[i];}
      vec2 q=(wu-vec2(c,hb.x))/hb.yz;
      float g=exp(-dot(q,q)*1.6);
      w*=1.+.16*hovAmt*g;
    }
    vec3 c=mix(texture2D(cA,cu).rgb,texture2D(cB,cu).rgb,m);
    gl_FragColor=vec4(mix(w,c,cerca),1.);
  }`;
  function sh(t, src) { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; }
  const pr = gl.createProgram();
  const vertex = GL2 ? '#version 300 es\n' + VS.replace('attribute','in').replace('varying','out') : VS;
  const fragment = GL2 ? '#version 300 es\n' + FS.replace('varying','in').replace('precision highp float;','precision highp float;out vec4 fragmentColor;').replaceAll('texture2D','texture').replaceAll('gl_FragColor','fragmentColor') : FS;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vertex)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ["wA", "wB", "cA", "cB", "view", "crop", "k", "org", "mixp", "cerca", "cz", "sa", "hov", "hovAmt", "elegido", "cx", "hb"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
  gl.uniform1i(U.wA, 0); gl.uniform1i(U.wB, 1); gl.uniform1i(U.cA, 2); gl.uniform1i(U.cB, 3);
  gl.uniform4f(U.crop, ...CROP); gl.uniform1fv(U.cx, CX); gl.uniform3f(U.hb, ...E.BRILLO);

  // ── texturas ──
  const px = Math.max(innerWidth, innerHeight * ASP) * Math.min(devicePixelRatio, 3);
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const ancho = MOVIL ? (FULL_RES && px > 1600 && maxTexture >= 5504 ? 3072 : px > 1000 ? 1600 : 1080) : (FULL_RES && px > 2560 && maxTexture >= 5504 ? "4k" : px > 1280 ? 2560 : 1280);
  const tex = {};
  const pend_ = {};
  let decoder = null, decodeId = 0, uploading = false, moviePlaying = false, draws = 0;
  const textureQueue = [];
  const jobs = new Map(), dimensions = {};
  if (typeof Worker !== "undefined" && typeof createImageBitmap === "function") {
    decoder = new Worker(`aurella-images.js?v=${V}`);
    decoder.onmessage = ({data}) => {
      const job = jobs.get(data.id); if (!job) return;
      jobs.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(data);
    };
    decoder.onerror = () => {
      for (const job of jobs.values()) job.reject(new Error("Image decoder failed"));
      jobs.clear(); decoder.terminate(); decoder = null;
    };
  }
  function decode(action, options) {
    return new Promise((resolve,reject) => { const id = ++decodeId; jobs.set(id,{resolve,reject}); decoder.postMessage({id,action,...options}); });
  }
  const frame = () => new Promise(ok => requestAnimationFrame(ok));
  async function upload(nombre) {
    const url = new URL(`media/${E.pre}${nombre}-${ancho}.webp?v=${V}`,location.href).href;
    let t = null;
    try {
      let info = null;
      if (decoder) { try { info = await decode('open',{key:nombre,url}); } catch (_) {} }
      let im;
      if (!info) {
        im = new Image(); im.decoding = 'async'; im.src = url; await im.decode();
      }
      const width = info?.width || im.width, height = info?.height || im.height;
      if (Math.max(width,height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('Texture exceeds device limit');
      while (moviePlaying) await frame();
      t = gl.createTexture();
      const bind = () => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,t); };
      bind();
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if (GL2) gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,width,height);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      if (info) {
        for (let y=0;y<height;y+=128) {
          const {bitmap} = await decode('strip',{key:nombre,y,height:Math.min(128,height-y)});
          await frame(); while (moviePlaying) await frame();
          bind(); gl.texSubImage2D(gl.TEXTURE_2D,0,0,y,gl.RGBA,gl.UNSIGNED_BYTE,bitmap); bitmap.close();
        }
      } else { bind(); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,im); }
      tex[nombre] = t; dimensions[nombre] = [width,height]; pide(); return t;
    } catch (e) {
      if (t) gl.deleteTexture(t);
      delete pend_[nombre]; console.warn('Photograph unavailable:',nombre,e.message); return null;
    } finally { if (decoder) decode('close',{key:nombre}).catch(()=>{}); }
  }
  async function nextTexture() {
    if (uploading) return;
    uploading = true;
    while (textureQueue.length) {
      textureQueue.sort((a,b)=>b.priority-a.priority);
      const job = textureQueue.shift(); job.resolve(await upload(job.nombre));
    }
    uploading = false;
  }
  function cargaTex(nombre, priority=2) {
    if (pend_[nombre]) {
      const waiting = textureQueue.find(job=>job.nombre===nombre);
      if (waiting) waiting.priority = Math.max(priority,waiting.priority);
      return pend_[nombre];
    }
    const job = new Promise(resolve=>textureQueue.push({nombre,priority,resolve}));
    pend_[nombre] = job; nextTexture(); return job;
  }
  // el primer plano solo hace falta del tono elegido: los demas se sueltan para no llenar la GPU
  function sueltaCerca(menos) {
    for (const k of Object.keys(tex)) if (k.startsWith("c-") && k !== "c-" + menos) { gl.deleteTexture(tex[k]); delete tex[k]; delete pend_[k]; delete dimensions[k]; }
  }
  function ata(u, t) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); }

  // ── estado ──
  let actual = 2, desde = 2;   // arranca en Solstice        // indice del tono
  let mixp = 1, cerca = 0, cz = 1.15, hov = -1, hovAmt = 0, hovObj = 0;
  let view = [0, 0, 1, 1];
  let org = [0.5, 0.5];
  let k = [1, 1], sa = 1;
  let pend = false;
  function pide() { if (!pend) { pend = true; requestAnimationFrame(pinta); } }

  function pinta() {
    pend = false;
    const A = TONOS[desde].img, B = TONOS[actual].img;
    if (!tex["w-" + A] || !tex["w-" + B]) return;
    ata(0, tex["w-" + A]); ata(1, tex["w-" + B]);
    ata(2, tex["c-" + A] || tex["w-" + A]); ata(3, tex["c-" + B] || tex["w-" + B]);
    hovAmt += (hovObj - hovAmt) * 0.16;
    gl.uniform4f(U.view, ...view); gl.uniform2f(U.k, ...k); gl.uniform2f(U.org, ...org);
    gl.uniform1f(U.mixp, mixp); gl.uniform1f(U.cerca, cerca); gl.uniform1f(U.cz, cz); gl.uniform1f(U.sa, sa);
    gl.uniform1f(U.hov, hov); gl.uniform1f(U.hovAmt, hovAmt);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    draws++;
    if (document.querySelector('#scenePoster')) document.querySelector('#scenePoster').hidden = true;
    if (Math.abs(hovObj - hovAmt) > 0.003) pide();
  }

  // ── tamano y colocacion ──
  function aPantalla(u, v) { return [(0.5 + (u - 0.5) / k[0]) * innerWidth, (0.5 + (v - 0.5) / k[1]) * innerHeight]; }
  function aFoto(x, y) { y -= escena.getBoundingClientRect().top; return [0.5 + (x / innerWidth - 0.5) * k[0], 0.5 + (y / innerHeight - 0.5) * k[1]]; }
  const escena = $("#escena");
  let medidoW = 0, medidoH = 0;
  function mide() {
    if (innerWidth === medidoW && Math.abs(innerHeight - medidoH) < 160 && medidoW) return;
    medidoW = innerWidth; medidoH = innerHeight;
    escena.style.height = innerHeight + "px";
    const dpr = Math.min(devicePixelRatio, 3, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) / Math.max(innerWidth, innerHeight));
    lienzo.width = Math.round(innerWidth * dpr); lienzo.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    sa = innerWidth / innerHeight;
    k = sa > ASP ? [1, ASP / sa] : [sa / ASP, 1];
    // etiquetas
    document.querySelectorAll(".frasco").forEach((li, i) => {
      const [x, y] = aPantalla(CX[i], Y_BASE + 0.02);
      li.style.left = x + "px"; li.style.top = y + "px";
    });
    // la mano: boton recortado con la silueta
    const pts = MANO.map(([u, v]) => aPantalla(u, v));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const mano = $("#mano");
    Object.assign(mano.style, { left: x0 + "px", top: y0 + "px", width: x1 - x0 + "px", height: y1 - y0 + "px" });
    mano.style.clipPath = `polygon(${pts.map(([x, y]) => `${((x - x0) / (x1 - x0)) * 100}% ${((y - y0) / (y1 - y0)) * 100}%`).join(",")})`;
    mano.style.clipPath = "none"; // la pista sobresale: se recorta con el test de abajo
    mano.dataset.poly = JSON.stringify(pts.map(([x, y]) => [x - x0, y - y0]));
    pide();
  }
  addEventListener("resize", mide);

  // ── etiquetas de los frascos ──
  const lista = $("#frascos");
  TONOS.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "frasco" + (t.activo ? "" : " pronto") + (i === actual ? " elegido" : "");
    li.innerHTML = `<span class="num">${t.n}</span><span class="tn">${t.nombre}</span><span class="pr">${PRECIO}</span>`;
    if (t.activo) { li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-label", `${t.nombre}, ${PRECIO}`); }
    li.addEventListener("click", () => elige(i, aPantalla(CX[i], Y_BASE - 0.04)));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elige(i, aPantalla(CX[i], Y_BASE - 0.04)); } });
    li.addEventListener("pointerenter", () => sobre(i));
    li.addEventListener("pointerleave", () => sobre(-1));
    lista.appendChild(li);
  });

  // gotas del primer plano: solo los tonos de la prueba
  const gotas = $("#gotas");
  TONOS.forEach((t, i) => {
    if (!t.activo) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "gota"; b.style.setProperty("--g", t.hex);
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", t.nombre); b.dataset.i = i;
    b.innerHTML = `<span class="tip">${t.n} ${t.nombre}</span>`;
    b.addEventListener("click", () => { const r = b.getBoundingClientRect(); elige(i, [r.left + r.width / 2, r.top + r.height / 2]); });
    gotas.appendChild(b);
  });

  // ── animacion ──
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function anima(ms, f) {
    return new Promise((ok) => {
      if (reducido) { f(1); pide(); return ok(); }
      const t0 = performance.now();
      const paso = (n) => { const t = Math.min(1, (n - t0) / ms); f(t); pinta(); t < 1 ? requestAnimationFrame(paso) : ok(); };
      requestAnimationFrame(paso);
    });
  }

  let ocupado = false;
  // el cambio de color es instantaneo, sin transiciones raras.
  // con 6 tonos la foto del tono nuevo puede no estar aun en la GPU: se espera a ella (casi siempre ya esta) y se cambia de golpe
  let pidiendo = 0;
  async function elige(i) {
    const t = TONOS[i];
    if (!t.activo || i === actual) return;
    if (ocupado) { if (cerca > 0) tonoPendiente = i; return; }
    const n = ++pidiendo;
    if (cerca > 0 && !tex['w-' + t.img] && !await cargaTex('w-' + t.img)) return;
    if (!await cargaTex((cerca > 0 ? "c-" : "w-") + t.img)) return;
    if (n !== pidiendo || ocupado) return;   // llego otro clic mas nuevo
    desde = actual = i; mixp = 1;
    ponTono(t);
    precarga();
    pide();
    cargaTex("c-" + t.img).then(() => { if (TONOS[actual].img === t.img) sueltaCerca(t.img); });
    if (ancho === '4k' || ancho === 3072) {
      const wides = Object.keys(tex).filter(k => k.startsWith('w-') && k !== 'w-' + t.img);
      while (wides.length > 1) { const old = wides.shift(); gl.deleteTexture(tex[old]); delete tex[old]; delete pend_[old]; delete dimensions[old]; }
    }
  }

  function ponTono(t) {
    const r = document.documentElement.style;
    r.setProperty("--tono", t.hex); r.setProperty("--tono-claro", t.claro); r.setProperty("--tono-tinta", t.sobrePapel);
    fotosTienda(t);
    document.body.classList.toggle("oscura", t.tinta === "oscura");   // tonos claros: fondo claro, letras oscuras
    document.querySelector('meta[name="theme-color"]').content = t.hex;
    document.querySelectorAll(".frasco").forEach((li, j) => li.classList.toggle("elegido", TONOS[j] === t));
    document.querySelectorAll(".gota").forEach((g) => g.setAttribute("aria-checked", TONOS[g.dataset.i] === t ? "true" : "false"));
    for (const id of ["#fNombre", "#cNombre"]) { const e = $(id); e.textContent = t.nombre; e.classList.remove("cambia"); void e.offsetWidth; e.classList.add("cambia"); }
    $("#fOjo").textContent = `${t.n} · Nail lacquer`;
  }

  function sobre(i) {
    if (cerca > 0) i = -1;
    hov = i; hovObj = i >= 0 ? 1 : 0;
    document.querySelectorAll(".frasco").forEach((li, j) => li.classList.toggle("sobre", j === i));
    pide();
  }

  // hover y clic directamente sobre la foto
  function frascoEn(x, y) {
    const [u, v] = aFoto(x, y);
    let i = -1;
    if (v > Y_TAPA - 0.01 && v < Y_BASE + 0.01) CX.forEach((c, j) => { if (Math.abs(u - c) < MEDIO_ANCHO) i = j; });
    return i;
  }
  lienzo.addEventListener("pointermove", (e) => {
    if (cerca > 0 || e.pointerType === "touch") return;
    const i = frascoEn(e.clientX, e.clientY);
    if (i !== hov) sobre(i);
    lienzo.style.cursor = i >= 0 && TONOS[i].activo ? "pointer" : "default";
  });
  lienzo.addEventListener("pointerleave", () => sobre(-1));
  // el toque en el movil no pasa por "encima": el frasco se calcula en el mismo clic
  lienzo.addEventListener("click", (e) => {
    if (cerca > 0) return;
    const i = frascoEn(e.clientX, e.clientY);
    if (i >= 0) elige(i, [e.clientX, e.clientY]);
  });

  // ── la camara se acerca a la mano: VIDEO real del movimiento (primer y ultimo fotograma = las fotos) ──
  // al apretar la mano la transicion no debe mostrar ningun corte ni cambio de color.
  // Ida y vuelta son dos mp4 (la vuelta, invertida con ffmpeg). Debajo, el lienzo ya muestra la foto de destino a 4K:
  // al acabar, el video se desvanece 220 ms sobre ella y no se nota el paso.
  const peli = $("#peli");
  let tonoPendiente = null;
  function rueda(src, avance = () => {}) {
    let inicio;
    const started = new Promise(ok => { inicio = ok; });
    const finished = new Promise((ok) => {
      if (reducido) { inicio(false); return ok(); }
      if (!peli.src.endsWith(src)) peli.src = src;
      peli.currentTime = 0;
      const listo = () => { moviePlaying = true; peli.classList.add("on"); inicio(true); };
      const progreso = () => avance(peli.currentTime);
      const fin = () => {
        clearTimeout(tope); moviePlaying = false; inicio(false);
        peli.removeEventListener("playing", listo); peli.removeEventListener("timeupdate", progreso);
        peli.removeEventListener("ended", fin); peli.removeEventListener("error", fin); ok();
      };
      const tope = setTimeout(fin, 12000);
      peli.addEventListener("playing", listo, { once: true });
      peli.addEventListener("timeupdate", progreso);
      peli.addEventListener("ended", fin, { once: true });
      peli.addEventListener("error", fin, { once: true });
      peli.play().catch(fin);
    });
    return { started, finished };
  }
  function precarga() { const src = `media/ida-${E.sub}${TONOS[actual].img}.mp4?v=${V}`; if (!peli.src.endsWith(src)) { peli.src = src; peli.load(); } }
  function apaga() { return new Promise((ok) => { peli.classList.remove("on"); setTimeout(ok, 240); }); }
  function arriba() {
    return new Promise((ok) => {
      if (scrollY < 2) return ok();
      scrollTo({ top: 0, behavior: reducido ? "auto" : "smooth" });
      const t0 = performance.now();
      const mira = () => (scrollY < 2 || performance.now() - t0 > 1400 ? (scrollTo(0, 0), ok()) : requestAnimationFrame(mira));
      requestAnimationFrame(mira);
    });
  }
  async function acerca() {
    if (ocupado || cerca > 0) return;
    ocupado = true; sobre(-1);
    await arriba();
    document.documentElement.classList.add("fija");
    document.body.classList.add("moviendo");
    const img = TONOS[actual].img;
    const textura = cargaTex("c-" + img);
    const muestra = () => { document.body.dataset.vista = "cerca"; $("#cerca").hidden = false; };
    const p = rueda(`media/ida-${E.sub}${img}.mp4?v=${V}`, tiempo => { if (tiempo >= .22) muestra(); });
    await p.started;
    const panelTimer = setTimeout(muestra, reducido ? 0 : 100);
    cerca = 1; cz = 1; view = [0, 0, 1, 1]; pinta();          // debajo, ya la foto de cerca
    await p.finished;
    clearTimeout(panelTimer);
    await textura;
    document.body.classList.remove("moviendo");
    document.body.dataset.vista = "cerca";
    $("#cerca").hidden = false;
    await apaga();
    ocupado = false;
    if (tonoPendiente !== null) { const i = tonoPendiente; tonoPendiente = null; elige(i); }
  }
  async function aleja() {
    if (ocupado || cerca === 0) return;
    ocupado = true;
    document.body.dataset.vista = "mesa";
    document.body.classList.add("moviendo");
    const img = TONOS[actual].img;
    const p = rueda(`media/vuelta-${E.sub}${img}.mp4?v=${V}`);
    await p.started;
    cerca = 0; view = [0, 0, 1, 1]; pinta();
    await p.finished;
    document.body.classList.remove("moviendo");
    $("#cerca").hidden = true;
    await apaga();
    precarga();
    document.documentElement.classList.remove("fija");
    ocupado = false;
  }
  const mano = $("#mano");
  function dentroMano(e) {
    const r = mano.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const p = JSON.parse(mano.dataset.poly || "[]"); let d = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) d = !d;
    }
    return d;
  }
  mano.addEventListener("pointermove", (e) => { const d = dentroMano(e); mano.classList.toggle("fuera", !d); mano.style.cursor = d ? "pointer" : "default"; });
  mano.addEventListener("click", (e) => { if (e.detail === 0 || dentroMano(e)) acerca(); });
  $("#fProbar").addEventListener("click", acerca);
  $("#volver").addEventListener("click", aleja);
  addEventListener("keydown", (e) => { if (e.key === "Escape") aleja(); });

  // ── anadir a la bolsa: la gotita vuela a la bolsa ──
  let enBolsa = 0;
  window.AURELLA_BAG.init(TONOS.map(t => ({sku:t.n,name:t.nombre,price:28,img:`media/frasco-${t.img}-560.webp?v=${V}`})));
  function confirmaBolsa(nombre) {
    const tono = TONOS.find(t => t.nombre === nombre);
    enBolsa = window.AURELLA_BAG.add(tono.n);
    const c = $("#cuenta"); c.textContent = enBolsa; c.classList.add("llena", "salta");
    $("#bolsa").setAttribute("aria-label", `Bag, ${enBolsa} item${enBolsa > 1 ? "s" : ""}`);
    $("#estadoBolsa").textContent = `${nombre} added to bag. ${enBolsa} item${enBolsa > 1 ? "s" : ""}.`;
    setTimeout(() => c.classList.remove("salta"), 260);
  }
  // a drop of the lacquer flies from a button to the bag count
  function gotaHaciaBolsa(btn, color) {
    if (reducido) return;
    const a = btn.getBoundingClientRect(), b = $("#bolsa .cuenta").getBoundingClientRect(), g = $("#gotaVuela");
    if (!g.animate) return;
    g.style.background = color;
    const x0 = a.left + a.width / 2 - 7, y0 = a.top + a.height / 2 - 7, x1 = b.left + b.width / 2 - 7, y1 = b.top + b.height / 2 - 7;
    g.animate([
      { opacity: 1, transform: `translate(${x0}px,${y0}px) rotate(-45deg) scale(1)` },
      { opacity: 1, transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 120}px) rotate(-45deg) scale(1.15)`, offset: 0.5 },
      { opacity: 0.9, transform: `translate(${x1}px,${y1}px) rotate(-45deg) scale(.5)` },
    ], { duration: 780, easing: "cubic-bezier(.45,0,.2,1)" });
  }
  // the round + of a card: it turns into a tick for a moment, a drop of the lacquer flies to the bag
  function compraTarjeta(btn, t) {
    if (btn.dataset.animating === "true") return;
    btn.dataset.animating = "true";
    clearTimeout(btn.reposo);
    btn.classList.add("hecho");
    confirmaBolsa(t.nombre);
    gotaHaciaBolsa(btn, t.hex);
    setTimeout(() => { btn.dataset.animating = "false"; }, reducido ? 160 : 800);
    btn.reposo = setTimeout(() => btn.classList.remove("hecho"), 1900);
  }
  function compra(btn) {
    if (btn.classList.contains("hecho")) return;
    btn.classList.add("hecho");
    confirmaBolsa(TONOS[actual].nombre);
    const a = btn.getBoundingClientRect(), b = $("#bolsa .cuenta").getBoundingClientRect();
    const g = $("#gotaVuela");
    g.style.background = getComputedStyle(btn).getPropertyValue("--tono");
    const x0 = a.left + a.width * 0.25, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2 - 7, y1 = b.top + b.height / 2 - 7;
    const fin = () => {};
    if (reducido || !g.animate) fin();
    else g.animate([
      { opacity: 1, transform: `translate(${x0}px,${y0}px) rotate(-45deg) scale(1)` },
      { opacity: 1, transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 120}px) rotate(-45deg) scale(1.15)`, offset: 0.5 },
      { opacity: 0.9, transform: `translate(${x1}px,${y1}px) rotate(-45deg) scale(.5)` },
    ], { duration: 780, easing: "cubic-bezier(.45,0,.2,1)" }).onfinish = fin;
    setTimeout(() => btn.classList.remove("hecho"), 1700);
  }
  $("#fComprar").addEventListener("click", (e) => compra(e.currentTarget));
  $("#cComprar").addEventListener("click", (e) => compra(e.currentTarget));


  // ═══ LA TIENDA de debajo (1-nov) ═══
  // barra: cristal claro cuando ya no hay foto detras
  const barra = $(".barra");
  const miraBarra = () => barra.classList.toggle("abajo", scrollY > escena.offsetHeight - 70);
  addEventListener("scroll", miraBarra, { passive: true }); miraBarra();

  // las fotos de abajo son las del tono elegido: se cambian sin parpadeo (la nueva se decodifica antes)
  const FOTO_C = (img) => MOVIL ? `media/mc-${img}-1600.webp?v=${V}` : `media/c-${img}-2560.webp?v=${V}`;
  function fotosTienda(t) {
    for (const id of ["fotoCuidado", "fotoFinal"]) {
      const el = document.getElementById(id); if (!el) continue;
      // The footer has its own image area: no text or footer links cover the nails.
      const src = id === "fotoFinal" ? `media/unas-${t.img}-1060.webp?v=${V}` : FOTO_C(t.img);
      if (id === "fotoFinal") el.alt = `${t.nombre} nail lacquer on the hand`;
      if (el.dataset.src === src) continue;
      el.dataset.src = src;
      const im = new Image(); im.src = src;
      (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { if (el.dataset.src === src) el.src = src; });
    }
  }

  // probar un tono desde abajo: sube, lo elige y la camara se acerca a la mano
  async function pruebaDesdeAbajo(i) {
    await arriba();
    await elige(i);
    acerca();
  }

  const rejilla = $("#rejilla");
  TONOS.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "tarjeta" + (t.tinta === "oscura" ? " claro" : "");
    li.style.setProperty("--t", t.hex);
    li.style.setProperty("--ti", t.sobrePapel);
    li.innerHTML = `
      <button class="foto" type="button" aria-label="Try ${t.nombre} on the hand">
        <img class="bote" src="media/frasco-${t.img}-1060.webp?v=${V}" srcset="media/frasco-${t.img}-560.webp?v=${V} 560w, media/frasco-${t.img}-1060.webp?v=${V} 1060w" sizes="(max-width:640px) 45vw, (max-width:1180px) 250px, 16vw" alt="${t.nombre} nail lacquer bottle" loading="lazy" decoding="async">
        <img class="unas" src="media/unas-${t.img}-1060.webp?v=${V}" srcset="media/unas-${t.img}-560.webp?v=${V} 560w, media/unas-${t.img}-1060.webp?v=${V} 1060w" sizes="(max-width:640px) 45vw, (max-width:1180px) 250px, 16vw" alt="" loading="lazy" decoding="async">
        <span class="ver">Try it on</span>
      </button>
      <div class="info">
        <span class="num">${t.n}</span>
        <h3>${t.nombre}</h3>
        <span class="precio">${PRECIO}</span>
        <button class="anadir" type="button" aria-label="Add ${t.nombre} to bag">
          <svg class="mas" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>
          <svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 7.5"/></svg>
        </button>
      </div>`;
    li.querySelector(".foto").addEventListener("click", () => pruebaDesdeAbajo(i));
    li.querySelector(".anadir").addEventListener("click", (e) => compraTarjeta(e.currentTarget, t));
    rejilla.appendChild(li);
  });
  // las tarjetas entran al llegar, una detras de otra
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const i = [...rejilla.children].indexOf(e.target);
    e.target.style.transitionDelay = (i % (innerWidth > 1180 ? 6 : innerWidth > 640 ? 3 : 2)) * 90 + "ms";
    e.target.classList.add("vista"); io.unobserve(e.target);
    setTimeout(() => { e.target.style.transitionDelay = ""; }, 1400);
  }), { rootMargin: "0px 0px -8% 0px" });
  [...rejilla.children].forEach((li) => (reducido ? li.classList.add("vista") : io.observe(li)));

  // pie: "Solstice" o "Vesper" llevan al tono
  document.querySelectorAll("[data-tono]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pruebaDesdeAbajo(+a.dataset.tono); }));
  // enlaces de ayuda sin pagina en esta prueba: no saltan arriba
  document.querySelectorAll('.pie a[href="#"]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  // los enlaces del menu bajan con suavidad
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href"); if (id.length < 2 || a.dataset.tono) return;
    a.addEventListener("click", (e) => { const d = $(id); if (!d) return; e.preventDefault(); if (cerca > 0) return; d.scrollIntoView({ behavior: reducido ? "auto" : "smooth" }); });
  });

  // boletin: sin servidor en esta prueba; se valida y se confirma ahi mismo
  const correo = $("#correo");
  correo.addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#email"), msg = $("#correoMsg"), btn = correo.querySelector(".laca");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inp.value.trim())) {
      msg.textContent = "Enter a valid email address."; correo.classList.remove("mal"); void correo.offsetWidth; correo.classList.add("mal"); inp.focus(); return;
    }
    msg.textContent = "Design showcase. Newsletter sign-up is unavailable."; inp.blur();
    setTimeout(() => btn.classList.remove("hecho"), 2600);
  });

  // ── arranque ──
  ponTono(TONOS[actual]);
  mide();
  precarga();
  cargaTex("w-" + TONOS[actual].img).then(() => cargaTex("c-" + TONOS[actual].img)).then(() => {
    // Large 4K surfaces stay compressed until selected instead of occupying six full GPU textures.
    if (ancho !== "4k" && ancho !== 3072) TONOS.forEach((t) => t.activo && cargaTex("w-" + t.img,0));
  });
  window.__AURELLA = {state:()=>({actual,cerca,ocupado,draws,ancho,canvas:[lienzo.width,lienzo.height],dimensions,decoder:!!decoder,GL2})};
})();
