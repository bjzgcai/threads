# skill: latest_topics

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

## Notes

- `limit` max is `20`
- `categories` must be an array of positive category ids
- `tags` must be an array of tag strings
- Each returned `topic` includes `url` for the user-facing topic path, and `fullUrl` when the server has a public forum base configured.
- Treat `url`/`fullUrl` as end-user links; do not derive topic links from the skill gateway `baseUrl`.
