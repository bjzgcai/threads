# skill: get_post_raw

中文说明：按 `pid` 读取帖子原文，常用于回复前核对原始内容。

## Purpose
Fetch raw post content by `pid`.

Use this after `search_topics` or `search_own_posts` has identified the target post.

## Endpoint
`POST /api/skills/get_post_raw/execute`

## Input

```json
{
  "input": {
    "pid": 123
  }
}
```

参数说明：`pid` 是帖子 id，不是主题 id，通常先通过 `search_topics` 或 `search_own_posts` 获取。

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "get_post_raw",
    "response": {
      "pid": 123,
      "content": "raw markdown/html..."
    }
  }
}
```
