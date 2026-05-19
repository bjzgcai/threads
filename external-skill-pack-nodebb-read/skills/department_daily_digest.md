# skill: department_daily_digest

## Purpose
Get today新增的、和某个学院/企业部门或个人画像相关的自动投递资讯。

The server searches the configured auto-publish categories:

- `ARTICLE_AUTO_PUBLISH_CID`
- `WECHAT_AUTO_PUBLISH_CID`

It returns matching topics created today, sorted by lightweight keyword relevance.

## Endpoint
`POST /api/skills/department_daily_digest/execute`

## Input

```json
{
  "input": {
    "department": "计算机学院",
    "person": "科研秘书",
    "attributes": ["人工智能", "产学研", "科研项目"],
    "keywords": ["大模型", "高校", "政策"],
    "limit": 10
  }
}
```

Optional fields:

- `date`: `YYYY-MM-DD`; defaults to today.
- `categories`: override category ids; defaults to the two auto-publish CIDs.
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
      "department": "计算机学院",
      "keywords": ["计算机学院", "人工智能", "大模型"],
      "categories": [6, 7],
      "scannedCount": 25,
      "matchCount": 3,
      "topics": [
        {
          "tid": 123,
          "cid": 7,
          "title": "今日 AI 产业动态",
          "url": "/topic/123/今日-ai-产业动态",
          "timestampISO": "2026-05-15T08:00:00.000Z",
          "category": { "cid": 7, "name": "公众号精选" },
          "tags": ["AI", "高校"],
          "relevanceScore": 5,
          "matchedKeywords": ["ai", "高校"],
          "excerpt": "..."
        }
      ]
    }
  }
}
```
