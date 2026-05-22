# skill: department_daily_digest

中文说明：按部门、岗位或人员画像生成当日相关文章摘要，适合做诸葛菜园日报或专题筛选。

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

参数说明：`department` 可填院系、部门或业务单元名称，`person` 可填岗位或人员角色，`attributes` 用于描述画像特征，`keywords` 用于补充检索词，`scanLimit` 控制初始扫描量，`limit` 控制最终返回条数。

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
          "fullUrl": "https://forum.example.com/topic/123/ai-policy-update",
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

`url` is the user-facing topic path. `fullUrl` is included when the server has a public forum base configured. In the current internal deployment, if `fullUrl` is empty, build the final link as `http://10.1.132.5:4567` + `url`.

输出说明：`scannedCount` 是初始扫描的帖子数，`matchCount` 是最终命中的帖子数，`topics` 是返回结果列表；其中 `relevanceScore` 表示关键词相关度，`matchedKeywords` 表示命中的关键词，`excerpt` 是摘要片段。
