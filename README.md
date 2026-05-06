# 玉米植株采集与标注系统

本项目提供一套本地优先的数据采集系统：

- 电脑端管理项目、查看图片队列、人工框选并填写植株高度
- 手机端在同一局域网内直接打开浏览器拍照上传
- 导出为 Ultralytics 兼容的 YOLO 数据集 ZIP，并附带 `annotations_extra.csv`

这是一个适合田间/温室图像采集场景的本地优先开源工具，目标是让“手机拍照 + 电脑标注 + YOLO 导出”这条链路尽量简单直接。

## 开源协议

本项目使用 [MIT License](./LICENSE) 开源。

## 功能特性

- 同一局域网下用手机浏览器直接拍照上传到电脑
- 每张图片记录拍摄高度
- 电脑端支持多框标注、框体调整和株高录入
- 标注结果可保存为草稿或完成状态
- 一键导出 Ultralytics YOLO 数据集和附加元数据 CSV
- 提供一键启动脚本，自动输出访问地址和二维码

## 技术栈

- 后端：FastAPI + SQLite + 本地文件存储
- 前端：React + Vite + React Konva

## 目录结构

- `backend/`：API、数据库、图片存储和导出逻辑
- `frontend/`：项目页、手机采集页和电脑标注页

## 启动方式

### 一键启动前后端

```bash
cd /Users/wuhong/Documents/corndiffusion/data325
chmod +x scripts/dev_up.sh
./scripts/dev_up.sh
```

脚本会自动：

- 检查并安装前后端依赖
- 同时启动 FastAPI 和 Vite
- 获取本机局域网 IP
- 输出电脑端和手机端访问地址
- 在终端打印可扫码的前端二维码
- 自动打开电脑浏览器到项目页

按 `Ctrl+C` 会同时关闭前后端。

### 1. 启动后端

```bash
cd /Users/wuhong/Documents/corndiffusion/data325
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 启动前端开发服务器

```bash
cd /Users/wuhong/Documents/corndiffusion/data325/frontend
npm install
npm run dev
```

然后在电脑浏览器打开：

- [http://127.0.0.1:5173/projects](http://127.0.0.1:5173/projects)

手机和电脑连接同一个 Wi-Fi 后，可以扫描项目页中的二维码，直接进入手机采集页。

## 开源使用建议

- 公开仓库时不要提交真实采集图片或敏感数据
- `backend/data/` 是本地运行数据目录，默认不进入版本控制
- 调试日志、浏览器自动化产物和构建产物也已默认忽略

## 贡献

欢迎提交 Issue 和 Pull Request。

- 贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 协作规范见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- 安全问题说明见 [SECURITY.md](./SECURITY.md)

## 生产构建

```bash
cd /Users/wuhong/Documents/corndiffusion/data325/frontend
npm install
npm run build
```

构建后，FastAPI 会自动尝试提供 `frontend/dist` 下的静态页面。

## 导出结果

点击项目页或标注页的“导出”按钮后，系统会生成一个 ZIP，其中包含：

- `images/train/`
- `images/val/`
- `labels/train/`
- `labels/val/`
- `data.yaml`
- `annotations_extra.csv`

`annotations_extra.csv` 额外保存每个框的 `plant_height_cm` 和每张图的 `capture_height_cm`。
