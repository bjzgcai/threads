# skill: search_topics

中文说明：按关键词搜索诸葛菜园中的主题和帖子，可限定分类范围。

## Purpose
Search NodeBB topics/posts by keyword.

## Endpoint
`POST /api/skills/search_topics/execute`

## Input

```json
{
  "input": {
    "query": "关键词",
    "page": 1,
    "limit": 10,
    "categories": [1, 2]
  }
}
```

`query` is required. `page`, `limit`, and `categories` are optional.

参数说明：`query` 是关键词，`page` 是分页页码，`limit` 是返回条数，`categories` 是分类 id 数组。

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "search_topics",
    "response": {
      "matchCount": 12,
      "posts": [
        {
          "pid": 456,
          "tid": 123,
          "content": "...",
          "topic": {
            "tid": 123,
            "title": "AI policy update",
            "slug": "123/ai-policy-update",
            "url": "/topic/123/ai-policy-update",
            "fullUrl": "https://forum.example.com/topic/123/ai-policy-update"
          }
        }
      ]
    }
  }
}
```

`topic.url` is the user-facing topic path. `topic.fullUrl` is included when the server has a public forum base configured. In the current internal deployment, if `topic.fullUrl` is empty, build the final link as `http://10.1.132.5:4567` + `topic.url`.

输出说明：`matchCount` 是命中的帖子总数，`posts` 是当前页返回的结果；`pid` 是帖子 id，`tid` 是主题 id，`topic.slug` 是主题路径片段。

Use a returned `pid` with `get_post_raw` when you need the full raw body of a specific matched post.
