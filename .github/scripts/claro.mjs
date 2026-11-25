// Crea la versión para GitHub en tema claro (carpeta claro/) a partir de los SVG oscuros.
// Uso: node .github/scripts/claro.mjs   -> regenera todas
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const VINO = '#4A1322';

// Se quedan igual en los dos temas: ilustraciones, esferas y sus degradados
const INTACTO = [
  /<!-- Ilustración -->[\s\S]*?(?=\n\s*<!-- \d\d \/)/g,
  /<!-- Escena: arcos y esferas -->[\s\S]*?(?=\n\s*<!-- Frase -->)/g,
  /<rect class="(?:barra|li|oro)"[^>]*>/g, // adornos dorados
  /<circle cx="(?:88|122)" cy="84" r="8.5"[^>]*>/g, // puntos de la ventana de código
  /<(linearGradient|radialGradient) id="(?:escena|f2|crema|vino|rosa|rosado|guinda|som|resp|luz)"[\s\S]*?<\/\1>/g,
];

// [busca, reemplaza] según el papel del color
const PAPELES = [
  // paneles y bordes
  [/stop-color="#2A0A14"/g, 'stop-color="#FFFBF7"'],
  [/stop-color="#1F0810"/g, 'stop-color="#FBEEE9"'],
  [/stop-color="#F8EEE2"/g, 'stop-color="#E9C6C0"'],
  [/stop-color="#D9A0A0"/g, 'stop-color="#CB858B"'],
  // textos, iconos y trazos
  [/(fill|stroke)="#F8EEE2"/g, `$1="${VINO}"`],
  [/fill="#F0C9C4"/g, 'fill="#7A2A3C"'],
  [/stroke="#F0C9C4"/g, 'stroke="#B8747E"'],
  [/fill="#D9A0A0"/g, 'fill="#A14A5A"'],
  [/stroke="#D9A0A0"/g, 'stroke="#B0566A"'],
  [/fill="#C9A66B"/g, 'fill="#8A6524"'],
  [/fill="#B8646C"/g, 'fill="#8A2F43"'],
  [/fill="#B98A93"/g, 'fill="#8B6470"'],
  // luz que recorre los bordes
  [/stroke:#FFF8EC/g, 'stroke:#8A2F43'],
  // separadores, guías y recortes sobre el panel
  [/stroke="#4A1322" stroke-width="2"/g, 'stroke="#EBCFC8" stroke-width="2"'],
  [/stroke="#5A2232"/g, 'stroke="#D9B0AC"'],
  [/stroke="#3B1420"/g, 'stroke="#F0DAD4"'],
  [/stroke="#250912"/g, 'stroke="#FDF4EF"'],
  // código de "sobre mí"
  [/\.c\{fill:#D9A0A0/, '.c{fill:#B0405A'],
  [/\.v\{fill:#F8EEE2/, '.v{fill:#2A0A14'],
  [/\.p\{fill:#A07A84/, '.p{fill:#8B6470'],
  [/\.k\{fill:#C9A66B/, '.k{fill:#8A6524'],
  [/\.s\{fill:#F0D3CC/, '.s{fill:#7A2A3C'],
];

// Manchas del banner: crema y rosa en lugar de vino
const MANCHAS = ['232,172,172', '240,203,194', '211,146,152', '228,168,170', '255,250,245', '250,228,218'];

export function aclarar(svg) {
  svg = svg.replace(/\r\n/g, '\n');
  const guardado = [];
  for (const re of INTACTO) svg = svg.replace(re, t => `@@${guardado.push(t) - 1}@@`);
  for (const [a, b] of PAPELES) svg = svg.replace(a, b);
  svg = svg.replace('fill="rgb(40,18,25)"', 'fill="rgb(253,244,238)"');
  MANCHAS.forEach((c, i) => {
    svg = svg.replace(new RegExp(`<radialGradient id="m${i}">[\\s\\S]*?</radialGradient>`), g => g.replace(/rgb\([\d,]+\)/g, `rgb(${c})`));
  });
  for (let i = guardado.length - 1; i >= 0; i--) svg = svg.replace(`@@${i}@@`, () => guardado[i]);
  return svg;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  mkdirSync(path.join(raiz, 'claro'), { recursive: true });
  for (const f of readdirSync(raiz).filter(f => f.endsWith('.svg'))) {
    writeFileSync(path.join(raiz, 'claro', f), aclarar(readFileSync(path.join(raiz, f), 'utf8')));
  }
  console.log('Listo: carpeta claro/');
}
