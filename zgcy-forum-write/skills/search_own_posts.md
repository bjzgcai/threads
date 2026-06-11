# skill: search_own_posts

中文说明：搜索当前 token 持有者自己发过的帖子，适合删帖前定位 `pid`。

## Purpose
Search or list posts created by the current token owner.

Use this skill before `delete_own_posts` when the user needs help finding the correct `pid`.

## Endpoint
`POST /api/skills/search_own_posts/execute`

## Input

With a keyword:

```json
{
  "input": {
    "query": "Claude Code",
    "page": 1,
    "limit": 5
  }
}
```

Without a keyword, the gateway lists recent posts created by the token owner:

```json
{
  "input": {
    "page": 1,
    "limit": 5
  }
}
```

参数说明：`query` 是关键词，可留空；`page` 是分页页码；`limit` 是返回条数。

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "search_own_posts",
    "response": {
      "posts": [
        {
          "pid": 200,
          "tid": 100,
          "content": "...",
          "topic": {
            "tid": 100,
            "title": "My topic",
            "slug": "100/my-topic",
            "url": "/topic/100/my-topic",
            "fullUrl": "https://forum.example.com/topic/100/my-topic"
          }
        }
      ]
    }
  }
}
```

`topic.url` is the user-facing topic path. `topic.fullUrl` is included when the server has a public forum base configured. In the current internal deployment, if `topic.fullUrl` is empty, build the final link as `https://zgcy.lab.bza.edu.cn` + `topic.url`.

输出说明：`posts` 是当前页返回的本人帖子列表；每条结果中的 `pid` 是帖子 id，`tid` 是所属主题 id，`topic` 提供主题标题和跳转链接。

Use a returned `pid` with `get_post_raw` when you need the exact raw body before replying or deleting.
