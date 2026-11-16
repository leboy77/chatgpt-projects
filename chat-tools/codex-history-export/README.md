# Codex History Export

把本机 Codex 会话导出为可读 Markdown、原始 JSONL、附件、会话索引和
SHA-256 清单，便于换电脑、归档或迁移到其他 AI 工具。

## 导出内容

- `current-thread.md`：最近修改的会话，或通过 ID 指定的当前会话。
- `SESSIONS.md`：全部会话索引。
- `readable/`：仅包含用户和助手的可见消息。
- `raw/sessions/`：原始 JSONL，保留工具调用、工具输出和内部事件。
- `raw/session_index.jsonl`：Codex 会话索引。
- `raw/attachments/`：本机 Codex 附件。
- `migration-manifest.json`：会话标题、消息数、路径和 SHA-256。

## 使用

默认从 `CODEX_HOME` 或 `~/.codex` 读取会话，并在当前目录创建带时间戳的
导出目录：

```powershell
python .\chat-tools\codex-history-export\export_history.py
```

指定输出目录：

```powershell
python .\chat-tools\codex-history-export\export_history.py `
  --output "D:\codex-history-export"
```

指定当前会话：

```powershell
python .\chat-tools\codex-history-export\export_history.py `
  --current-thread-id "你的会话ID" `
  --output "D:\codex-history-export"
```

## 安全提醒

- `readable/` 只抽取用户和助手消息，更适合直接交给其他 AI。
- `raw/sessions/` 可能包含历史命令输出、内部路径、账号信息和业务数据。
- 不要提交原始 JSONL 到公开仓库，也不要上传到公共网盘或不受信任的服务。
- 导出不会修改 Codex 原始会话；脚本只重建目标目录下的 `readable/` 和 `raw/`。
