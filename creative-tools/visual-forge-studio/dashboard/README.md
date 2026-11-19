# Visual Forge 团队看板

公司内部图片汇总看板。插件生成任务后，把任务元数据和图片上报到本服务，网页端统一查看、筛选和下载。

当前版本为零外部依赖的 MVP：

- Python 3.10 标准库 HTTP 服务。
- SQLite 持久化。
- 本地文件存储原图和缩略图。
- 用户登录、项目、任务、图片、统计接口。
- 单文件前端，不依赖 npm 构建。

## 本地运行

```powershell
cd .\dashboard
python server.py --host 127.0.0.1 --port 8766
```

打开：

```text
http://127.0.0.1:8766
```

首次启动会用环境变量创建管理员：

```text
DASHBOARD_ADMIN_USER=admin
DASHBOARD_ADMIN_PASSWORD=admin123
DASHBOARD_TOKEN_SECRET=<随机密钥>
```

默认管理员和密码仅用于首次登录，请在登录后修改密码。

## Docker 部署

前提：目标内网机器已安装 Docker 和 Docker Compose。

```powershell
cd .\dashboard
docker compose up -d --build
```

访问：

```text
http://<内网服务器IP>:8080
```

数据保存在 `dashboard/data`：

- `data/dashboard.sqlite3`
- `data/files`
- `data/thumbs`

## 后续升级路径

当前 SQLite + 本地文件适合 25 人规模的 MVP。接口稳定后，可将存储替换为 PostgreSQL + MinIO，不影响看板和插件接口。
