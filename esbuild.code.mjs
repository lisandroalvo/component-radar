import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['code.ts'],
  bundle: true,
  outfile: 'code.js',
  platform: 'node',
  target: 'es2017',
  format: 'cjs',
  logLevel: 'info',
});
