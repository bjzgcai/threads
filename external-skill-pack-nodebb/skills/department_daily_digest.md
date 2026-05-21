# skill: department_daily_digest

## Purpose
Get today's relevant auto-published article topics for a department, organization unit, or person profile.

By default, the server searches these category ids:

- `2`
- `ARTICLE_AUTO_PUBLISH_CID`
- `WECHAT_AUTO_PUBLISH_CID`

If the request provides `input.categories`, that explicit list overrides the default category list.

The gateway returns matching topics created on the requested date, sorted by lightweight keyword relevance.

## Endpoint
`POST /api/skills/department_daily_digest/execute`

## Input

```json
{
  "input": {
    "department": "Computer Science School",
    "person": "Research Secretary",
    "attributes": ["AI", "industry research", "research projects"],
    "keywords": ["large model", "university", "policy"],
    "limit": 10
  }
}
```

Optional fields:

- `date`: `YYYY-MM-DD`; defaults to today.
- `categories`: override category ids; defaults to `[2, ARTICLE_AUTO_PUBLISH_CID, WECHAT_AUTO_PUBLISH_CID]` after removing empty and duplicate values.
- `scanLimit`: max topics scanned before relevance filtering, default `200`, max `500`.
- `limit`: max returned topics, default `10`, max `30`.

## Output

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "department_daily_digest",
    "response": {
      "date": "2026-05-15",
      "department": "Computer Science School",
      "keywords": ["computer science school", "ai", "large model"],
      "categories": [2, 6, 7],
      "scannedCount": 25,
      "matchCount": 3,
      "topics": [
        {
          "tid": 123,
          "cid": 2,
          "title": "AI policy update",
          "url": "/topic/123/ai-policy-update",
          "timestampISO": "2026-05-15T08:00:00.000Z",
          "category": { "cid": 2, "name": "News" },
          "tags": ["AI", "university"],
          "relevanceScore": 5,
          "matchedKeywords": ["ai", "university"],
          "excerpt": "..."
        }
      ]
    }
  }
}
```
