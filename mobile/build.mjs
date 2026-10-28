// Builds www/ (the web content inside the phone apps) from the student app in the
// repository root. Run with `npm run build`, then `npx cap sync` copies it into android/ and ios/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const www = new URL('www/', import.meta.url).pathname;

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

// The app pages. js/firebase-sdk.js and js/native.js are replaced by bundles below.
for (const f of ['index.html', 'privacy.html', 'app.css', 'home-icon-192.png', 'home-icon-180.png', 'assets/img/logo.png']) cpSync(root + f, www + f);
cpSync(root + 'js', www + 'js', { recursive: true, filter: src => !/\/(firebase-sdk|native)\.js$/.test(src) });
cpSync(root + 'assets/syllabus', www + 'assets/syllabus', { recursive: true });
cpSync(root + 'assets/img/explore', www + 'assets/img/explore', { recursive: true });

// Bundle Firebase and the Capacitor plugins so nothing is downloaded at runtime.
for (const name of ['firebase-sdk', 'native']) {
  await build({
    entryPoints: [new URL(`src/${name}.js`, import.meta.url).pathname],
    outfile: `${www}js/${name}.js`,
    bundle: true, format: 'esm', target: ['es2020', 'safari15'], minify: true, legalComments: 'none',
  });
}

const config = readFileSync(root + 'js/config.js', 'utf8');
if (/apiKey:\s*''/.test(config)) {
  console.warn('\n⚠  js/config.js has no Firebase config, so this build runs in DEMO MODE.\n   Don’t submit it to the stores — see mobile/README.md.\n');
}
console.log('Built', www);
