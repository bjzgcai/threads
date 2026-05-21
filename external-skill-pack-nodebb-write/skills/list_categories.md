# skill: list_categories

List visible categories as a helper before creating a topic.

## Endpoint

`POST /api/skills/list_categories/execute`

## Input

```json
{
  "input": {}
}
```

## Notes

- Returns visible categories only
- Use this before `create_topic_or_reply` when `cid` is unknown
- `create_topic_or_reply` can also accept `categoryName`, `categorySlug`, or `categoryHandle`
