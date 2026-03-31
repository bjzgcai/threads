# skill: search_topics

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

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "search_topics",
    "response": {
      "matchCount": 12,
      "posts": []
    }
  }
}
```
