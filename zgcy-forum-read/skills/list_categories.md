# skill: list_categories

中文说明：列出诸葛菜园当前可见的分类，适合在不知道分类 id 时先做探查。

List public visible categories without a personal token.

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
- Use this before `latest_topics`, `unread_topics`, or `search_topics` when `cid` is unknown
- The returned category ids can be passed through `input.categories` in the other read skills
