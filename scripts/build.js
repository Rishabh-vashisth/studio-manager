// Builds one static page: public/index.html (no framework, no bundler).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const body = read('template.html')
  .replace('/*CSS*/', () => read('style.css'))
  .replace('/*JS*/', () => read('logic.js') + '\n' + read('app.js'));
const html =
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="color-scheme" content="light dark">\n</head>\n<body>\n' +
  body + '\n</body>\n</html>\n';
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'index.html'), html);
console.log('built public/index.html', Math.round(html.length / 1024) + ' KB');
