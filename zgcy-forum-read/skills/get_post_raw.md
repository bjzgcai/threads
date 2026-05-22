# skill: get_post_raw

中文说明：按 `pid` 读取帖子原文，适合查看完整正文、Markdown 或原始内容。

## Purpose
Fetch raw post content by `pid`.

Use this after `search_topics` or another listing step has already identified the target post.

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

输出说明：返回结果中的 `content` 是帖子的原始正文，可能是 Markdown、HTML 或论坛原始存储格式。

参数说明：`pid` 是帖子 id，不是主题 id，通常先通过 `search_topics` 拿到。

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
