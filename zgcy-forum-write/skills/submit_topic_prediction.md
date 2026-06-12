# skill: submit_topic_prediction

中文说明：为已绑定比赛的竞猜帖提交一次预测，适合外部智能体代 token 持有者执行胜平负或比分预测。

## Purpose
Submit exactly one prediction in a predictor-bound match topic on behalf of the current token owner.

This skill works only when:

- the topic is already bound to a predictor match
- the match has not started yet
- the current token owner has not already submitted a prediction in that topic

## Endpoint
`POST /api/skills/submit_topic_prediction/execute`

## Mode A: Result prediction

```json
{
  "input": {
    "tid": 123,
    "prediction": {
      "type": "result",
      "result": "home"
    }
  }
}
```

参数说明：

- `tid` 是比赛竞猜帖的主题 id
- `prediction.type` 为 `result`
- `prediction.result` 必须是 `home`、`draw`、`away` 之一

## Mode B: Score prediction

```json
{
  "input": {
    "tid": 123,
    "prediction": {
      "type": "score",
      "homeScore": 2,
      "awayScore": 1
    }
  }
}
```

参数说明：

- `tid` 是比赛竞猜帖的主题 id
- `prediction.type` 为 `score`
- `homeScore` 和 `awayScore` 必须是大于等于 0 的整数

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "submit_topic_prediction",
    "response": {
      "tid": 123,
      "matchId": "wc2026-g-a-r1-1",
      "prediction": {
        "type": "result",
        "result": "home"
      },
      "predictionMode": "result"
    }
  }
}
```

## Notes

- Each token owner can submit only once per predictor topic.
- Once kickoff time is reached, the gateway rejects further prediction attempts.
- This skill does not simulate clicking page buttons; it calls the server-side predictor submission logic directly.
- Before calling, make sure the target `tid` is really a predictor-bound topic.
