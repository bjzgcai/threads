# skill: unread_topics

中文说明：查看未读风格的帖子列表；如果服务端没有用户上下文，则退化为接近最新帖的公开列表。

Get unread topics when the server has user context, otherwise return a public latest-topic style listing without a personal token.

## Endpoint

`POST /api/skills/unread_topics/execute`

## Input

```json
{
  "input": {
    "page": 1,
    "limit": 10,
    "filter": "",
    "categories": [1, 2],
    "tags": ["help"]
  }
}
```

All fields are optional.

参数说明：`page` 是分页页码，`limit` 是返回条数，`filter` 是未读筛选模式，`categories` 是分类 id 数组，`tags` 是标签数组。

## Notes

- `limit` max is `20`
- `filter` can be `""`, `"new"`, `"watched"`, or `"unreplied"`
- `categories` must be an array of positive category ids
- `tags` must be an array of tag strings
- `filter="new"` 更适合看新帖，`filter="unreplied"` 更适合看待回复主题
- Each returned `topic` includes `url` for the user-facing topic path, and `fullUrl` when the server has a public forum base configured.
- Treat `url`/`fullUrl` as end-user links; do not derive topic links from the skill gateway `baseUrl`.
