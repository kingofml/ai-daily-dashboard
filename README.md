# AI HOT 每日晨报看板

一个基于 [AI HOT](https://aihot.virxact.com) 公开 API 的每日 AI 资讯晨报生成器。运行脚本后会自动抓取当日最新 AI 动态，生成一个可直接在浏览器中打开的分类看板页面。

## 功能

- 自动获取当天北京日期的 AI HOT 日报数据
- 按主题自动分类：模型发布/更新、产品发布/更新、行业动态、论文研究、技巧与观点
- 生成响应式 HTML 看板，支持 PC 与移动端浏览
- 保留最近 5 天的历史归档入口
- 离线可用：生成后的 `index.html` 不依赖网络即可查看

## 文件说明

| 文件 | 说明 |
|------|------|
| `generate-dashboard.js` | 核心脚本，负责拉取数据并生成 `index.html` |
| `index.html` | 生成的晨报看板页面 |
| `open-dashboard.bat` | 双击即可用默认浏览器打开 `index.html` |
| `serve-and-open.bat` | 启动本地静态服务器并打开页面 |
| `README.md` | 项目说明 |

## 环境要求

- Node.js 18+（脚本使用原生 `fetch`）
- 已安装 Git（如需推送到 GitHub）

## 使用方法

### 1. 生成最新晨报

```bash
node generate-dashboard.js
```

运行后会在当前目录生成最新的 `index.html`。

### 2. 查看看板

方式一：直接双击 `open-dashboard.bat`

方式二：启动本地服务器

```bash
serve-and-open.bat
```

默认会在浏览器中打开本地服务地址。

## 自动化

可以将 `node generate-dashboard.js` 加入定时任务（如 Windows 任务计划程序、crontab 或 WorkBuddy 自动化），每天早上自动生成最新晨报。

## 数据来源

- 日报数据：`https://aihot.virxact.com/api/public/daily`
- 归档数据：`https://aihot.virxact.com/api/public/dailies?take=5`

## 注意事项

- 脚本默认使用北京时间判断"今天"
- 若当日数据尚未更新，会自动使用最近一日的数据作为 fallback
- 请勿将 API 密钥等敏感信息提交到版本控制

## 开源许可

MIT
