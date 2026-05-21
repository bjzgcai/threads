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
    "title": "新主题标题",
    "content": "主题正文",
    "tags": ["tag1", "tag2"]
  }
}
```

## Mode B: Reply

```json
{
  "input": {
    "tid": 100,
    "content": "回复内容"
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