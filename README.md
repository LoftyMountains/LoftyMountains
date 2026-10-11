# 景行 · 全球经济情报客户端

面向经济信息的 OSIRIS 式全球情报控制台。React/Vite 独立客户端，通过公开 Express API 获取数据，生产入口为 https://www.loftymountains.com 。

- MapLibre WebGL 地球/平面投影、地区快捷定位、地图与消息详情联动。
- 六类经济消息图层、静态金融中心/港口/贸易通道。
- 6/24/72 小时窗口，关键词、来源与重点消息筛选。
- 全球市场报价与趋势、来源状态、报价时间、失败及延迟提示。
- 手机面板切换、键盘 `/` 搜索与 `Esc` 关闭、减少动态效果、WebGL 降级地图。

新闻地点表示文章明确提及的地区，地图使用概略地区中心，不表示核验后的事件位置。静态基础设施不提供实时运行状态。消息不是完整全球覆盖；行情可能延迟。

```bash
npm ci
npm run dev
npm run typecheck
npm run build
```

开发默认代理到 `http://127.0.0.1:8787`，可用 `VITE_DEV_API_TARGET` 修改。生产默认请求 `https://api.loftymountains.com`，可通过 `VITE_API_BASE_URL` 设置其他公开 API 地址。

API 契约在 `shared/types.ts`；根仓库类型检查要求它与服务端副本一致。地理数据来自公共领域 Natural Earth，随构建托管，不需要地图密钥。MapLibre 引擎懒加载，应用首屏 JavaScript 预算仍为 150KB gzip，地图引擎另设 450KB 上限。

发布至仓库 `main` 后由 GitHub Pages Actions 自动部署。第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
