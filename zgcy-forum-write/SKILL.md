---
name: zgcy-forum-write
description: Token-owned write access to the Zhuge Caiyuan, 诸葛菜园, forum through /api/skills. Use for 发帖, 回帖, 删除 token 持有者自己的主题或帖子, and 搜索自己的帖子. Includes helper read skills for choosing categories, finding topics, and reading raw posts before writing. Requires a personal skills token.
---

# ZGCY Forum Write

Use this skill only when the task may create, reply, or delete forum content, or needs token-owner context such as searching the token owner's own posts.

`ZGCY` refers to `Zhuge Caiyuan`, also written in Chinese as `诸葛菜园`.
This forum is used in the Beijing Zhongguancun Academy and Zhongguancun Academy of Artificial Intelligence context for community communication and managed content operations.

## 中文说明

这是 `诸葛菜园` 论坛的写入型 skill。

- 适合发帖、回帖、查找当前 token 持有者自己的帖子、删除自己的主题或帖子
- 不适合纯查看场景，纯读取优先使用 `zgcy-forum-read`
- 这是有状态、有权限边界的操作，尤其删帖前应先确认对象和范围
- 如需给用户返回诸葛菜园完整帖子链接，应优先使用返回结果中的 `fullUrl`；若为空，在当前内网部署下可用 `https://zgcy.lab.bza.edu.cn` 与 `url` 路径拼接

## When To Use

Use this skill for token-scoped forum work such as:

- creating a new topic in a known category
- replying to an existing topic
- finding the token owner's own posts before deletion
- deleting the token owner's own topics or posts
- reading forum context before posting, when helper read skills are needed

If the task is purely read-only and does not need token-owner context, prefer `zgcy-forum-read`.

## Auth

This skill requires:

- `Authorization: Bearer <personal_skills_token>`
- `Content-Type: application/json`
- signing headers when the server has signing enabled:
  - `x-skills-timestamp`
  - `x-skills-nonce`
  - `x-skills-signature`

Configure `auth.bearerToken` in `skill-config.json`. Keep the token private.
Leave `auth.signingSecret` empty unless the gateway explicitly requires request signing.

For internal deployments, the token normally represents one concrete forum identity, so all write and delete actions should be treated as actions on behalf of that token owner.

## Version Awareness

Read `manifest.md` when this skill is invoked. Before making a forum request, compare the local package version from `manifest.md` or `skill-config.json.updateCheck.localVersion` with the remote version from `GET /api/skills/manifest` at `packages.zgcy-forum-write.version`.

If the versions differ, tell the user that the local `zgcy-forum-write` package is stale and should be upgraded before relying on current behavior. The bundled `tools/sign-and-call.js` helper performs this check automatically when `skill-config.json.updateCheck.enabled` is true.

## Write Skills

- `create_topic_or_reply`: create a topic or reply to an existing topic
- `delete_own_topics`: soft-delete up to 5 topics owned by the token owner
- `delete_own_posts`: soft-delete up to 5 posts owned by the token owner
- `search_own_posts`: search or list posts created by the token owner

## Helper Read Skills

These are included because writing often needs context:

- `list_categories`: choose a target category
- `latest_topics`: inspect recent topics before replying
- `search_topics`: find an existing topic
- `get_post_raw`: inspect raw post content

## Helper Script

```bash
node tools/sign-and-call.js create_topic_or_reply examples/create_topic.request.json skill-config.json
node tools/sign-and-call.js create_topic_or_reply examples/create_reply.request.json skill-config.json
node tools/sign-and-call.js search_own_posts examples/search_own_posts.request.json skill-config.json
node tools/sign-and-call.js delete_own_topics examples/delete_own_topics.request.json skill-config.json
node tools/sign-and-call.js delete_own_posts examples/delete_own_posts.request.json skill-config.json
```

## Examples Index

- `examples/create_topic.request.json`: 创建新主题
- `examples/create_reply.request.json`: 回复已有主题
- `examples/search_own_posts.request.json`: 搜索当前 token 持有者自己的帖子
- `examples/delete_own_topics.request.json`: 删除自己的主题
- `examples/delete_own_posts.request.json`: 删除自己的帖子
- `examples/list_categories.request.json`: 发帖前查看分类
- `examples/latest_topics.request.json`: 回帖前查看最新帖子
- `examples/search_topics.request.json`: 按关键词查找已有讨论
- `examples/get_post_raw.request.json`: 按 `pid` 读取帖子原文

## Recommended Workflow

1. Use `list_categories` when the category is not known.
2. Use `latest_topics` or `search_topics` before replying, to avoid posting in the wrong place.
3. Use `get_post_raw` when you need to inspect the exact existing body before responding.
4. Use `search_own_posts` before `delete_own_posts` if the correct `pid` is not already known.
5. Confirm destructive actions before calling `delete_own_topics` or `delete_own_posts`.

See `skills/*.md` for per-skill inputs, outputs, and caveats.
