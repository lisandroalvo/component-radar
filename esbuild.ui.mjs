import * as esbuild from 'esbuild';
import * as fs from 'fs';

// Build the UI JavaScript
await esbuild.build({
  entryPoints: ['ui.ts'],
  bundle: true,
  outfile: 'ui.js',
  platform: 'browser',
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
});

// Read the built ui.js and inject it into ui.html
const uiJs = fs.readFileSync('ui.js', 'utf8');
let uiHtml = fs.readFileSync('ui.html', 'utf8');

// Replace the script section - handle both initial and already-injected cases
const scriptMarker = '<!-- Compiled UI controller (auto-injected by build) -->';
const scriptStart = uiHtml.indexOf(scriptMarker);

if (scriptStart !== -1) {
  // Already has injected script, replace everything from marker to closing script tag
  const scriptEnd = uiHtml.indexOf('</script>', scriptStart) + '</script>'.length;
  const before = uiHtml.substring(0, scriptStart);
  const after = uiHtml.substring(scriptEnd);
  uiHtml = before + `${scriptMarker}\n  <script>\n${uiJs}\n  </script>` + after;
} else {
  // First time - replace the external script tag
  uiHtml = uiHtml.replace(
    '<!-- Load compiled UI controller -->\n  <script src="ui.js"></script>',
    `${scriptMarker}\n  <script>\n${uiJs}\n  </script>`
  );
}

fs.writeFileSync('ui.html', uiHtml);

console.log('✓ UI JavaScript inlined into ui.html');
