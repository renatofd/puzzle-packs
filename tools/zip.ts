/**
 * Gera dist/puzzlepacks-portal.zip com o conteúdo de dist/ na raiz do zip
 * (index.html na raiz), pronto para subir em GamePush, Poki ou CrazyGames.
 * Sem dependências: zip "deflate" escrito à mão com zlib do Node.
 * Uso: npm run build:portal (genérico) ou npm run build:poki (com o PokiSDK no <head>)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const DIST = 'dist';
/** Nome do zip: `vite-node tools/zip.ts -- puzzlepacks-poki.zip` (padrão: puzzlepacks-portal.zip). */
const OUT = join(DIST, process.argv.slice(2).find((a) => a.endsWith('.zip')) ?? 'puzzlepacks-portal.zip');
const LIMIT_MB = 15;
/** 1º de janeiro de 1980 (data fixa: o zip sai igual a cada build). */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.zip') || name === '.gitkeep' ? [] : [p];
  });
}

const files = walk(DIST);
if (!files.some((f) => relative(DIST, f) === 'index.html')) throw new Error('dist/index.html não existe: rode npm run build antes.');

const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(relative(DIST, file).split(sep).join('/'));
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(DOS_DATE << 16, 10);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(DOS_DATE << 16, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 30);
  central.writeUInt32LE(0, 34);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  locals.push(local, name, comp);
  centrals.push(central, name);
  offset += local.length + name.length + comp.length;
}
const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, centralBuf, end]);
writeFileSync(OUT, zip);

const raw = files.reduce((a, f) => a + statSync(f).size, 0);
const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
console.log(`${OUT}: ${files.length} arquivos, ${mb(raw)} MB sem compressão, ${mb(zip.length)} MB no zip (limite ${LIMIT_MB} MB).`);
if (raw > LIMIT_MB * 1024 * 1024) {
  console.error(`Build passou de ${LIMIT_MB} MB.`);
  process.exit(1);
}
