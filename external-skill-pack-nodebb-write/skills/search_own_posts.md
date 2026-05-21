# skill: search_own_posts

## Purpose
Search or list posts created by the current token owner.

Use this skill before `delete_own_posts` when the user needs help finding the correct `pid`.

## Endpoint
`POST /api/skills/search_own_posts/execute`

## Input

With a keyword:

```json
{
  "input": {
    "query": "Claude Code",
    "page": 1,
    "limit": 5
  }
}
```

Without a keyword, the gateway lists recent posts created by the token owner:

```json
{
  "input": {
    "page": 1,
    "limit": 5
  }
}
```

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "search_own_posts",
    "response": {
      "posts": [
        {
          "pid": 200,
          "tid": 100,
          "content": "..."
        }
      ]
    }
  }
}
```
