const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'lambda-build');
const ZIP_PATH = path.join(ROOT, 'lambda.zip');

console.log('Preparando pacote Lambda...');

// Limpa e recria a pasta de build
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR);

// Copia o conteudo de dist/ pra raiz do lambda-build/
fs.cpSync(DIST, OUT_DIR, { recursive: true });

// Instala apenas dependencias de producao dentro do lambda-build/
fs.writeFileSync(
  path.join(OUT_DIR, 'package.json'),
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);
console.log('Instalando dependencias de producao...');
execSync('npm install --omit=dev --no-package-lock', { cwd: OUT_DIR, stdio: 'inherit' });

// Remove o package.json copiado (nao precisa no ZIP final)
fs.rmSync(path.join(OUT_DIR, 'package.json'));

// Gera o ZIP
if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH);
console.log('Gerando lambda.zip...');
execSync(`powershell -Command "Compress-Archive -Path '${OUT_DIR}\\*' -DestinationPath '${ZIP_PATH}'"`, {
  stdio: 'inherit',
});

const sizeKb = (fs.statSync(ZIP_PATH).size / 1024).toFixed(0);
console.log(`\nPacote criado: lambda.zip (${sizeKb} KB)`);
console.log(`Handler na Console: handler.handler`);
