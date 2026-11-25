// Genera actividad.svg (y claro/actividad.svg) con los datos reales del perfil.
// Lo ejecuta .github/workflows/actividad.yml; no necesita instalar nada.
// Sin GITHUB_TOKEN dibuja la versión "pendiente", sin cifras.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { aclarar } from './claro.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = process.env.SALIDA || path.join(AQUI, '..', '..', 'actividad.svg');
const LETRAS = JSON.parse(readFileSync(path.join(AQUI, 'letras.json'), 'utf8')); // trazos de Inter (licencia OFL)

const CREMA = '#F8EEE2', ROSA = '#D9A0A0', ORO = '#C9A66B', TERRA = '#A0504A';
const n = v => +v.toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ---------- Texto como trazos ---------- */
const letra = (peso, c) => LETRAS[peso][c] || LETRAS[peso]['?'];
const ancho = (t, tam, peso = 400) => [...String(t)].reduce((s, c) => s + letra(peso, c)[0], 0) * tam / 1000;
function texto(t, x, y, tam, { peso = 400, color = CREMA, ancla = 'inicio', clase = '', estilo = '' } = {}) {
  const w = ancho(t, tam, peso), k = tam / 1000;
  let cx = ancla === 'centro' ? x - w / 2 : ancla === 'fin' ? x - w : x, d = '';
  for (const c of String(t)) {
    const [av, p] = letra(peso, c);
    if (p) d += `<path transform="translate(${n(cx)} ${n(y)}) scale(${k})" d="${p}"/>`;
    cx += av * k;
  }
  return `<g fill="${color}"${clase ? ` class="${clase}"` : ''}${estilo ? ` style="${estilo}"` : ''}>${d}</g>`;
}

/* ---------- Datos ---------- */
async function pedirDatos(usuario, token) {
  const query = `query($u:String!){user(login:$u){
    repositories(first:100,ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC){totalCount nodes{
      name defaultBranchRef{target{oid}}}}
    contributionsCollection{totalCommitContributions contributionCalendar{totalContributions
      weeks{contributionDays{date contributionCount}}}}}}`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'actividad-readme' },
    body: JSON.stringify({ query, variables: { u: usuario } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors || !j.data?.user) throw new Error(`GitHub respondió ${r.status}: ${JSON.stringify(j.errors || j.message || j)}`);
  const u = j.data.user, arboles = [];
  for (const r of u.repositories.nodes) {
    // se salta los repos vacíos y el del perfil (solo tiene este README)
    if (!r.defaultBranchRef || r.name.toLowerCase() === usuario.toLowerCase()) continue;
    const t = await fetch(`https://api.github.com/repos/${usuario}/${r.name}/git/trees/${r.defaultBranchRef.target.oid}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'actividad-readme' },
    });
    if (!t.ok) throw new Error(`No pude leer ${r.name}: GitHub respondió ${t.status}`);
    arboles.push((await t.json()).tree);
  }
  return resumir(u, contarCodigo(arboles));
}

// Bytes por lenguaje de código propio: sin librerías de terceros ni copias del mismo archivo
const AJENO = /(^|\/)(node_modules|bower_components|vendor|venv|\.venv|env|site-packages|__pycache__|dist|build|staticfiles|migrations|\.github)\/|(^|\/)static\/(admin|rest_framework)\/|\.min\.(js|css)$|(^|\/)(jquery|bootstrap)[^/]*\.(js|css)$/i;
const LENGUAJE = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', html: 'HTML', css: 'CSS', scss: 'SCSS', ejs: 'EJS', php: 'PHP', java: 'Java', cs: 'C#', c: 'C', cpp: 'C++', go: 'Go', rb: 'Ruby', kt: 'Kotlin', dart: 'Dart', vue: 'Vue', sh: 'Shell' };
export function contarCodigo(arboles) {
  const bytes = {}, vistos = new Set();
  for (const a of arboles.flat()) {
    const l = LENGUAJE[a.path.split('.').pop().toLowerCase()];
    if (a.type !== 'blob' || !l || AJENO.test(a.path) || vistos.has(a.sha)) continue;
    vistos.add(a.sha);
    bytes[l] = (bytes[l] || 0) + a.size;
  }
  return bytes;
}

export function resumir(u, bytes) {
  const col = u.contributionsCollection, cal = col.contributionCalendar;
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  const lenguajes = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([nombre, b]) => ({ nombre, pct: 100 * b / total }));
  return {
    contribuciones: cal.totalContributions,
    commits: col.totalCommitContributions,
    diasActivos: cal.weeks.flatMap(w => w.contributionDays).filter(d => d.contributionCount > 0).length,
    repos: u.repositories.totalCount,
    lenguajes,
    // solo semanas completas, para que la actual no parezca una caída
    semanas: cal.weeks.filter(w => w.contributionDays.length === 7)
      .map(w => ({ fecha: w.contributionDays[0].date, total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0) })),
  };
}

/* ---------- Dibujo ---------- */
const borde = (id, x, y, w, h, a, b) => {
  const c = (w + h) / 4, mx = x + w / 2, my = y + h / 2;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${mx - c}" y1="${my - c}" x2="${mx + c}" y2="${my + c}"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
};
const tarjeta = (x, y, w, h, b) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="32" fill="url(#${b})"/><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="29" fill="url(#fondo)"/>`;
const cometa = (x, y, w, h, s) => `<g class="cometa" style="animation-delay:${s}s">${['8 92', '0 4 4 92'].map((q, i) => `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="30.5" pathLength="100" stroke-dasharray="${q}" opacity="${i ? .6 : .35}"/>`).join('')}</g>`;

function metricas(d) {
  const t = [['Contribuciones', d?.contribuciones], ['Commits', d?.commits], ['Días activos', d?.diasActivos], ['Repos públicos', d?.repos]];
  return t.map(([nombre, v], i) => {
    const x = 92 + (i % 2) * 350, y = 200 + Math.floor(i / 2) * 142;
    return texto(v == null ? '—' : num(v), x, y, 72, { peso: 300, clase: 'sube', estilo: `animation-delay:${n(.3 + i * .12)}s` })
      + texto(nombre, x, y + 44, 26, { color: ROSA, clase: 'sube', estilo: `animation-delay:${n(.4 + i * .12)}s` });
  }).join('\n  ');
}

function lenguajes(d) {
  if (!d?.lenguajes.length) return texto(d ? 'Aún no hay lenguajes para mostrar' : 'Se completa solo al publicar el perfil', 872, 240, 26, { color: ROSA });
  const x0 = 1060, largo = 360, max = d.lenguajes[0].pct;
  return d.lenguajes.map((l, i) => {
    const y = 156 + i * 54, w = Math.max(6, largo * l.pct / max), ret = n(.5 + i * .12);
    const tam = n(Math.min(26, 26 * 172 / ancho(l.nombre, 26))); // los nombres largos se achican, no se cortan
    const pct = l.pct < 1 ? '<1 %' : `${Math.round(l.pct)} %`;
    return texto(l.nombre, 872, y + 9, tam)
      + `<path class="barra" style="transform-origin:${x0}px 0;animation-delay:${ret}s" fill="${ROSA}" d="M${x0} ${y - 9}h${n(w - 4)}a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-${n(w - 4)}z"/>`
      + texto(pct, x0 + w + 16, y + 9, 26, { color: '#F0C9C4', clase: 'sube', estilo: `animation-delay:${n(ret + .5)}s` });
  }).join('\n  ');
}

function techoRedondo(v) {
  const p = [4, 10, 20, 40, 60, 80, 100];
  for (let e = 1; ; e *= 10) for (const b of p) if (b * e >= v) return b * e;
}

function grafica(d) {
  const X0 = 150, X1 = 1500, Y0 = 790, Y1 = 590;
  const base = `<path d="M${X0} ${Y0}H${X1}" stroke="#5A2232" stroke-width="2"/>`;
  if (!d || d.semanas.length < 2) return base + texto(d ? 'Aún no hay actividad para mostrar' : 'Se completa solo al publicar el perfil', 800, 690, 26, { color: ROSA, ancla: 'centro' });
  const s = d.semanas, max = Math.max(...s.map(v => v.total)), techo = techoRedondo(Math.max(1, max));
  const px = i => n(X0 + (X1 - X0) * i / (s.length - 1)), py = v => n(Y0 - (Y0 - Y1) * v / techo);
  const guias = [techo / 2, techo].map(v => `<path d="M${X0} ${py(v)}H${X1}" stroke="#3B1420" stroke-width="2"/>` + texto(num(v), X0 - 18, py(v) + 8, 24, { color: '#B98A93', ancla: 'fin' })).join('') + texto('0', X0 - 18, Y0 + 8, 24, { color: '#B98A93', ancla: 'fin' });
  const linea = s.map((v, i) => `${i ? 'L' : 'M'}${px(i)} ${py(v.total)}`).join('');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  let previo = -1, ultimoX = -999, meses = '';
  s.forEach((v, i) => {
    const m = +v.fecha.slice(5, 7) - 1;
    if (m !== previo && px(i) - ultimoX > 85 && px(i) < X1 - 20) { meses += texto(MES[m], px(i), Y0 + 38, 24, { color: '#B98A93' }); ultimoX = px(i); }
    previo = m;
  });
  const pico = s.findIndex(v => v.total === max), fin = s.length - 1;
  const punto = (i, c) => `<circle class="${c}" cx="${px(i)}" cy="${py(s[i].total)}" r="9" fill="${CREMA}" stroke="#250912" stroke-width="4"/>`;
  // la etiqueta del pico va a un lado para no tapar la línea ni salirse
  const rot = `${num(max)} en una semana`, der = px(pico) + 24 + ancho(rot, 26) < X1;
  const etiqueta = max > 0 ? texto(rot, px(pico) + (der ? 20 : -20), py(max) - 14, 26, { ancla: der ? 'inicio' : 'fin', clase: 'sube', estilo: 'animation-delay:2.6s' }) : '';
  return `${guias}${base}${meses}
  <path class="area" fill="${ROSA}" fill-opacity=".14" d="${linea}L${X1} ${Y0}L${X0} ${Y0}Z"/>
  <path class="linea" pathLength="100" fill="none" stroke="${ROSA}" stroke-width="4" stroke-linejoin="round" d="${linea}"/>
  ${max > 0 && pico !== fin ? punto(pico, 'punto') : ''}${punto(fin, 'punto late')}${etiqueta}`;
}

export function dibujar(d) {
  const desc = d
    ? `Último año: ${num(d.contribuciones)} contribuciones, ${num(d.commits)} commits, ${d.diasActivos} días activos, ${d.repos} repositorios públicos. Lenguajes: ${d.lenguajes.map(l => `${l.nombre} ${l.pct < 1 ? 'menos de 1' : Math.round(l.pct)} %`).join(', ')}.`
    : 'Actividad de GitHub: pendiente de la primera actualización.';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 880" width="1600" height="880" role="img" aria-label="${esc(desc)}">
  <title>Actividad</title>
  <style>
    .sube{animation:sube .8s ease-out backwards}
    @keyframes sube{from{opacity:0;transform:translateY(16px)}}
    .barra{animation:abre 1.1s cubic-bezier(.2,.8,.2,1) backwards}
    @keyframes abre{from{transform:scaleX(0)}}
    .linea{stroke-dasharray:102;animation:traza 2.4s ease-in-out .5s backwards}
    @keyframes traza{from{stroke-dashoffset:102}}
    .area{animation:aparece 1.4s ease-out 2s backwards}
    .punto{animation:aparece .6s ease-out 2.6s backwards}
    @keyframes aparece{from{opacity:0}}
    .late{animation:aparece .6s ease-out 2.6s backwards,late 2.6s ease-in-out 3.2s infinite}
    @keyframes late{50%{fill:${ORO}}}
    .flota{animation:flota 4.6s ease-in-out infinite alternate}
    @keyframes flota{from{transform:translateY(7px)}to{transform:translateY(-8px)}}
    .cometa{fill:none;stroke:#FFF8EC;stroke-width:3;opacity:0;animation:recorre 9s linear infinite}
    @keyframes recorre{0%{stroke-dashoffset:0;opacity:0}5%,45%{opacity:.8}52%,100%{stroke-dashoffset:-100;opacity:0}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>
  <defs>
    ${borde('b1', 40, 40, 750, 390, CREMA, ROSA)}
    ${borde('b2', 810, 40, 750, 390, ROSA, TERRA)}
    ${borde('b3', 40, 450, 1520, 400, ORO, ROSA)}
    <linearGradient id="fondo" x2="0" y2="1"><stop stop-color="#2A0A14"/><stop offset="1" stop-color="#1F0810"/></linearGradient>
    <radialGradient id="rosa" cx=".32" cy=".3" r=".78"><stop stop-color="#F6DAD7"/><stop offset=".5" stop-color="#D9A0A0"/><stop offset="1" stop-color="#8A3A4A"/></radialGradient>
    <radialGradient id="guinda" cx=".32" cy=".3" r=".78"><stop stop-color="#E08A98"/><stop offset=".5" stop-color="#7A1C34"/><stop offset="1" stop-color="#2A0812"/></radialGradient>
  </defs>

  <!-- Cifras -->
  ${tarjeta(40, 40, 750, 390, 'b1')}${cometa(40, 40, 750, 390, 0)}
  ${texto('Último año', 92, 98, 26, { color: ORO })}
  <circle class="flota" cx="728" cy="92" r="20" fill="url(#rosa)"/>
  ${metricas(d)}

  <!-- Lenguajes -->
  ${tarjeta(810, 40, 750, 390, 'b2')}${cometa(810, 40, 750, 390, 3)}
  ${texto('Lenguajes más usados', 872, 98, 26, { color: ORO })}
  <circle class="flota" style="animation-delay:-2s" cx="1500" cy="92" r="20" fill="url(#guinda)"/>
  ${lenguajes(d)}

  <!-- Contribuciones por semana -->
  ${tarjeta(40, 450, 1520, 400, 'b3')}${cometa(40, 450, 1520, 400, 6)}
  ${texto('Contribuciones por semana', 92, 512, 26, { color: ORO })}
  ${grafica(d)}
</svg>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.GITHUB_TOKEN, usuario = process.env.USUARIO;
  if (token && !usuario) throw new Error('Falta la variable USUARIO');
  const svg = dibujar(token ? await pedirDatos(usuario, token) : null);
  writeFileSync(SALIDA, svg);
  const claro = path.join(path.dirname(SALIDA), 'claro');
  mkdirSync(claro, { recursive: true });
  writeFileSync(path.join(claro, path.basename(SALIDA)), aclarar(svg)); // tema claro
  console.log(`Listo: ${SALIDA}`);
}
