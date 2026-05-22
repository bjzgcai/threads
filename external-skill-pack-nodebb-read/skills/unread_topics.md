# skill: unread_topics

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

## Notes

- `limit` max is `20`
- `filter` can be `""`, `"new"`, `"watched"`, or `"unreplied"`
- `categories` must be an array of positive category ids
- `tags` must be an array of tag strings
- Each returned `topic` includes `url` for the user-facing topic path, and `fullUrl` when the server has a public forum base configured.
- Treat `url`/`fullUrl` as end-user links; do not derive topic links from the skill gateway `baseUrl`.
