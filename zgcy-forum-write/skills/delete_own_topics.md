# skill: delete_own_topics

中文说明：删除当前 token 持有者自己创建的主题，属于高风险写操作。

## Purpose
Soft-delete topics created by the current token owner.

Use `search_own_posts` plus the returned `tid` and topic context before deletion when there is any ambiguity.

Deleted topics are hidden from other users. The original author can still open the topic page and use the normal page controls to restore or permanently purge the topic.

## Endpoint
`POST /api/skills/delete_own_topics/execute`

## Input

```json
{
  "input": {
    "tids": [100, 101]
  }
}
```

输出说明：`mode` 表示当前删除方式，`deletedCount` 表示本次成功软删除的主题数量。

参数说明：`tids` 是主题 id 数组，只能填写当前 token 持有者本人创建的主题。

## Limits

- `tids` is required and must be an array.
- A single request can include at most 5 topic ids.
- Every topic must belong to the token owner.
- Already-deleted topics are rejected.

Confirm with the user before calling this skill because it changes live forum content.

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "delete_own_topics",
    "response": {
      "mode": "soft_delete",
      "deletedCount": 2
    }
  }
}
```
