# skill: get_post_raw

## Purpose
Fetch raw post content by `pid`.

## Endpoint
`POST /api/skills/get_post_raw/execute`

## Input

```json
{
  "input": {
    "pid": 123
  }
}
```

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "get_post_raw",
    "response": {
      "pid": 123,
      "content": "raw markdown/html..."
    }
  }
}
```