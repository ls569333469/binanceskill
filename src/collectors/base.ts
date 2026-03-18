import https from 'https';

const BASE_URL = 'https://web3.binance.com';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
}

export function httpPost<T = any>(path: string, body: object, userAgent = 'binance-web3/2.0 (Skill)'): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const payload = JSON.stringify(body);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'Accept-Encoding': 'identity',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${path}`));
    });
    req.write(payload);
    req.end();
  });
}

export function httpGet<T = any>(path: string, userAgent = 'binance-web3/2.0 (Skill)'): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'identity',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${path}`));
    });
    req.end();
  });
}

export function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function log(source: string, msg: string) {
  console.log(`[${timestamp()}] [${source}] ${msg}`);
}
