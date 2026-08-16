# Jingxing Client

景行公开前端仓库，提供实时财经快讯、沪深300分时图、历史回放和市场洞察可视化。后端与本地数据不包含在本仓库中。

## 本地开发

```bash
npm ci
npm run dev
```

开发服务器会把 `/api` 请求代理到 `http://127.0.0.1:8787`。

## 构建

```bash
npm run build
```

生产构建默认请求 `https://api.loftymountains.com`；如需临时切换后端，可用 `VITE_API_BASE_URL` 覆盖。

## GitHub Pages

在 `Settings -> Pages` 中选择 `GitHub Actions`。推送 `main` 后，`.github/workflows/deploy-pages.yml` 会构建并发布 `dist`，自定义域名由 `public/CNAME` 配置为 `www.loftymountains.com`。
