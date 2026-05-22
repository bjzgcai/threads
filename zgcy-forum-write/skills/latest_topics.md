# skill: latest_topics

中文说明：查看最新帖子，适合发帖或回帖前先了解当前讨论上下文。

Get latest visible topics as a helper before replying or creating related content.

## Endpoint

`POST /api/skills/latest_topics/execute`

## Input

```json
{
  "input": {
    "page": 1,
    "limit": 10,
    "categories": [1, 2],
    "tags": ["help"]
  }
}
```

All fields are optional.

参数说明：`page` 是分页页码，`limit` 是返回条数，`categories` 是分类 id 数组，`tags` 是标签数组。

## Notes

- `limit` max is `20`
- `categories` must be an array of positive category ids
- `tags` must be an array of tag strings
- `categories` 适合传入 `list_categories` 返回的分类 id
- Each returned `topic` includes `url` for the user-facing topic path, and `fullUrl` when the server has a public forum base configured.
- Treat `url`/`fullUrl` as end-user links; do not derive topic links from the skill gateway `baseUrl`.
