# skill: latest_topics

中文说明：查看诸葛菜园最新公开可见的帖子，可按分类或标签过滤。

Get the latest public visible topics without a personal token.

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
- `page` 从 `1` 开始，适合顺序翻页查看
- `categories` 适合传入 `list_categories` 返回的分类 id
- Each returned `topic` includes `url` for the user-facing topic path, and `fullUrl` when the server has a public forum base configured.
- Prefer `fullUrl` when it is present. In the current internal deployment, if `fullUrl` is empty, build the final link as `https://zgcy.lab.bza.edu.cn` + `topic.url`.
