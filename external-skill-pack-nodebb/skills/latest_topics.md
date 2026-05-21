# skill: latest_topics

Get the latest visible topics for the authenticated user.

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
