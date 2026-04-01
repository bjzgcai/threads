# skill: unread_topics

Get unread topics for the authenticated user.

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
