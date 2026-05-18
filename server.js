const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = 4173;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const DATABASE_PATH = path.join(ROOT, 'js', 'database.js');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000_000) {
        req.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function validateDatabase(data) {
  const requiredArrays = ['users', 'products', 'orders', 'payments', 'deliveries'];
  return data &&
    typeof data === 'object' &&
    requiredArrays.every(key => Array.isArray(data[key])) &&
    data.id_seq &&
    typeof data.id_seq === 'object';
}

async function saveDatabase(req, res) {
  try {
    const body = await readRequestBody(req);
    const data = JSON.parse(body);

    if (!validateDatabase(data)) {
      return send(res, 400, JSON.stringify({ ok: false, error: 'Invalid database shape.' }), 'application/json; charset=utf-8');
    }

    const fileBody = `window.SAOD_LOCAL_DATABASE = ${JSON.stringify(data, null, 2)};\n`;
    await fs.writeFile(DATABASE_PATH, fileBody, 'utf8');
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
  } catch (error) {
    return send(res, 500, JSON.stringify({ ok: false, error: error.message }), 'application/json; charset=utf-8');
  }
}

async function serveStatic(req, res) {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filePath = path.resolve(ROOT, requestedPath);

    if (!filePath.startsWith(ROOT)) {
      return send(res, 403, 'Forbidden');
    }

    const body = await fs.readFile(filePath);
    const type = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (error) {
    return send(res, 404, 'Not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/database') {
    return saveDatabase(req, res);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  return send(res, 405, 'Method not allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`SAOD running at http://${HOST}:${PORT}`);
});
