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
      "posts": [
        {
          "pid": 456,
          "tid": 123,
          "content": "...",
          "topic": {
            "tid": 123,
            "title": "AI policy update",
            "slug": "123/ai-policy-update",
            "url": "/topic/123/ai-policy-update",
            "fullUrl": "https://forum.example.com/topic/123/ai-policy-update"
          }
        }
      ]
    }
  }
}
```

`topic.url` is the user-facing topic path. `topic.fullUrl` is included when the server has a public forum base configured.
