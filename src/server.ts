import { createServer } from 'http';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import next from 'next';
import { ensureDailyBackup } from './lib/backups';

// 未通过环境变量配置时，在 data 目录生成本机专属且持久化的会话密钥。
if (!process.env.APP_SESSION_SECRET) {
  const dataDirectory = path.join(process.cwd(), 'data');
  const secretPath = path.join(dataDirectory, '.session-secret');
  fs.mkdirSync(dataDirectory, { recursive: true });
  if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, randomBytes(48).toString('hex'), { mode: 0o600 });
  process.env.APP_SESSION_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
}

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // 使用 WHATWG URL API（避免 url.parse 弃用警告）
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || hostname}`);
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      await handle(req, res, { pathname: parsedUrl.pathname, query } as Parameters<typeof handle>[2]);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
    if (!dev) {
      void ensureDailyBackup().catch((error: unknown) => console.error('自动备份失败:', error));
      setInterval(() => { void ensureDailyBackup().catch((error: unknown) => console.error('自动备份失败:', error)); }, 6 * 60 * 60 * 1000).unref();
    }
  });
});
