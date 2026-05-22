---
name: zgcy-forum-read
description: Public read-only access to the Zhuge Caiyuan, 诸葛菜园, forum through /api/skills without a personal token. Use for 查看分类, 最新帖子, 未读风格列表, 部门日报, 关键词搜索, and 按 pid 读取原文. Does not create, edit, reply, or delete content.
---

# ZGCY Forum Read

Use this skill when you only need to view forum content through the controlled skills gateway.

`ZGCY` refers to `Zhuge Caiyuan`, also written in Chinese as `诸葛菜园`.
This forum is used in the Beijing Zhongguancun Academy and Zhongguancun Academy of Artificial Intelligence context for community posts, department updates, auto-published article links, and related discussion browsing.

## 中文说明

这是 `诸葛菜园` 论坛的只读 skill。

- 适合查看分类、最新帖子、搜索帖子、读取原文、生成部门日报
- 不适合发帖、回帖、删帖，涉及这些操作时应切换到 `zgcy-forum-write`
- 论坛链接应优先使用返回结果中的 `fullUrl`
- 如果 `fullUrl` 为空，在当前内网部署下可使用论坛前缀 `http://10.1.132.5:4567` 与返回的 `url` 路径拼接完整链接，例如 `http://10.1.132.5:4567/topic/1247/...`

## When To Use

Use this skill for read-only forum work such as:

- checking visible categories before filtering content
- listing the latest visible topics
- getting a public unread-style listing
- generating a department-oriented daily digest
- searching topics or posts by keyword
- reading raw post content by `pid`

If the task needs to create, reply, edit, or delete forum content, switch to `zgcy-forum-write` instead.

## Auth

No personal skills token is required for this read-only skill. Leave `auth.bearerToken` empty in `skill-config.json`.

The server may still restrict access by source IP using `SKILLS_ALLOWED_IPS`.

For internal deployments, the gateway usually sits behind a controlled network boundary, so successful access may still depend on source IP or gateway-side allowlisting even though no personal token is needed.

## Available Skills

- `list_categories`: list visible categories
- `latest_topics`: list latest visible topics
- `unread_topics`: list unread topics when authenticated by server context, otherwise return a public latest-topic style listing
- `department_daily_digest`: get relevant auto-published article topics for a department/person profile
- `search_topics`: search visible topics/posts
- `get_post_raw`: fetch raw post content by `pid`

## Request Flow

Call:

```text
POST /api/skills/{skill}/execute
Content-Type: application/json
```

Body:

```json
{
  "input": {}
}
```

Do not send a Bearer token for this read-only skill.

## Recommended Workflow

1. Start with `list_categories` when category ids are unknown.
2. Use `latest_topics` or `unread_topics` to scan recent content.
3. Use `search_topics` when you already have keywords or a known subject.
4. Use `get_post_raw` only after you have a target `pid` and need the raw body.
5. Use `department_daily_digest` when the user wants a same-day curated departmental view.

## Helper Script

```bash
node tools/sign-and-call.js list_categories examples/list_categories.request.json skill-config.json
node tools/sign-and-call.js latest_topics examples/latest_topics.request.json skill-config.json
node tools/sign-and-call.js search_topics examples/search_topics.request.json skill-config.json
node tools/sign-and-call.js get_post_raw examples/get_post_raw.request.json skill-config.json
```

## Examples Index

- `examples/list_categories.request.json`: 列出可见分类
- `examples/latest_topics.request.json`: 查看最新公开帖子
- `examples/unread_topics.request.json`: 查看未读风格帖子列表
- `examples/search_topics.request.json`: 按关键词搜索主题和帖子
- `examples/get_post_raw.request.json`: 按 `pid` 读取帖子原文
- `examples/department_daily_digest.request.json`: 生成部门日报式筛选请求

See `skills/*.md` for per-skill inputs, outputs, and caveats.
