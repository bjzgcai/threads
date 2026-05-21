# skill: create_topic_or_reply

## Purpose
Create a new topic or reply in an existing topic.

## Endpoint
`POST /api/skills/create_topic_or_reply/execute`

## Mode A: Create topic

```json
{
  "input": {
    "cid": 1,
    "title": "New topic title",
    "content": "Topic body",
    "tags": ["tag1", "tag2"]
  }
}
```

## Mode B: Reply

```json
{
  "input": {
    "tid": 100,
    "content": "Reply body"
  }
}
```

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "create_topic_or_reply",
    "response": {
      "mode": "topic or reply"
    }
  }
}
```
