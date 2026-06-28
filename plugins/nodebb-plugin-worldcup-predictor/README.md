# NodeBB World Cup Predictor Plugin

世界杯竞猜插件 - 一个为NodeBB论坛添加世界杯比赛竞猜功能的插件

## 功能特性

✅ **比赛列表** - 显示世界杯所有比赛的对阵信息  
✅ **竞猜系统** - 小组赛支持"胜/平/负"和具体比分，淘汰赛支持无平局胜负预测  
✅ **发布帖子** - 竞猜完成后可自动发布成论坛帖子  
✅ **用户预测追踪** - 查看自己的所有竞猜记录  
✅ **排行榜** - 实时排行榜展示竞猜高手  
✅ **响应式设计** - 完美支持移动和桌面设备  

## 安装

### 方法1：本地安装（推荐开发用）

```bash
cd /path/to/nodebb
npm install ./plugins/nodebb-plugin-worldcup-predictor
```

### 方法2：从npm安装（需发布到npm）

```bash
npm install nodebb-plugin-worldcup-predictor
```

## 启用插件

1. 启动 NodeBB
2. 访问管理后台 `/admin/plugins`
3. 在插件列表中找到 "世界杯竞猜 - World Cup Predictor"
4. 点击启用
5. 运行 `./nodebb build`
6. 重启 NodeBB

## 使用方法

### 访问竞猜页面

在导航菜单中或直接访问：
```
http://your-forum-domain/predictor
```

> 页面可公开访问，提交竞猜或发布帖子需要登录。

### 竞猜流程

1. **查看比赛** - 浏览所有世界杯比赛时间表
2. **选择竞猜** - 点击"竞猜"按钮
3. **提交预测** - 小组赛可选胜/平/负或比分；淘汰赛自动切换为无平局胜负预测
4. **可选发布** - 将竞猜发布为论坛帖子

### 页面标签

- **比赛列表** - 所有比赛按日期分组展示
- **我的预测** - 查看已提交的所有竞猜
- **排行榜** - 查看竞猜成绩排名

## 数据存储

插件使用 Redis/MongoDB（根据您的配置）存储：

- `predictor:matches` - 所有比赛信息
- `predictor:predictions:${matchId}:${uid}` - 用户竞猜记录
- `predictor:user:predictions:${uid}` - 用户竞猜索引
- `predictor:leaderboard` - 排行榜分数

## API 端点

### GET /api/v3/predictor/matches
获取所有比赛列表

**响应示例：**
```json
{
  "2026-06-12-1": {
    "id": "2026-06-12-1",
    "date": "2026-06-12",
    "time": "03:00",
    "home": { "name": "阿根廷", "flag": "🇦🇷" },
    "away": { "name": "摩洛哥", "flag": "🇲🇦" },
    "stage": "小组赛",
    "group": "A",
    "status": "upcoming"
  }
}
```

### POST /api/v3/predictor/predictions
提交竞猜 (需认证)

**请求示例：**
```json
{
  "matchId": "2026-06-12-1",
  "prediction": {
    "type": "result",
    "result": "home"
  }
}
```
或
```json
{
  "matchId": "2026-06-12-1",
  "prediction": {
    "type": "score",
    "homeScore": 2,
    "awayScore": 1
  }
}
```

### GET /api/v3/predictor/my-predictions
获取用户竞猜 (需认证)

### GET /predictor/my-results
个人竞猜结果页，默认直接打开“我的预测”标签

### GET /api/v3/predictor/leaderboard
获取排行榜

### POST /api/v3/predictor/publish-result
发布竞猜为帖子 (需认证)

**请求示例：**
```json
{
  "matchId": "2026-06-12-1",
  "categoryId": 5,
  "title": "我的世界杯竞猜",
  "content": "我预测阿根廷将击败摩洛哥..."
}
```

## 脚本

### 导入赛程

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/import-matches.js docs/match.csv
```

导入 1/16 决赛模板：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/import-matches.js docs/match-knockout-r32.csv
```

### 自动发布某一轮竞猜帖

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/publish-match-topics.js --file docs/match.csv --round 1 --cid 12
```

按淘汰赛阶段发布：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/publish-match-topics.js --file docs/match-knockout-r32.csv --stage 1/16决赛 --cid 12
```

### 同步比赛结果

手动指定比分：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/sync-match-results.js --match-id wc2026-g-a-r1-1 --home-score 2 --away-score 1 --source manual
```

淘汰赛平比分时，必须额外指定胜者：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/sync-match-results.js --match-id wc2026-ko-r32-01 --home-score 1 --away-score 1 --winner away --decided-by penalties --source manual
```

批量导入结果 CSV：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/import-match-results.js docs/results.csv
```

批量导入 1/16 决赛结果模板：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/import-match-results.js --file docs/results-knockout-r32.csv --stage 1/16决赛
```

只导入某一轮：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/import-match-results.js --file docs/results.csv --round 1
```

使用 SerpApi 抓取：

```bash
SERPAPI_KEY=your_key node plugins/nodebb-plugin-worldcup-predictor/scripts/sync-match-results.js --match-id wc2026-g-a-r1-1
```

也可以写入项目根目录 `.env`：

```env
SERPAPI_KEY=your_key
SERPAPI_HL=zh-cn
SERPAPI_GL=us
PREDICTOR_AUTO_SYNC_ENABLED=true
PREDICTOR_AUTO_SYNC_CRON=0 * * * * *
PREDICTOR_AUTO_SYNC_TZ=Asia/Shanghai
```

写入后可直接执行：

```bash
node plugins/nodebb-plugin-worldcup-predictor/scripts/sync-match-results.js --match-id wc2026-g-a-r1-1
```

说明：

- `--dry-run` 只预览，不写数据库
- `--round 1` 可一次同步整轮比赛
- `--stage 1/16决赛` 可按淘汰赛阶段筛选
- 淘汰赛若比分打平，结果 CSV 或手动脚本必须补 `winner=home|away`，可选 `decidedBy=penalties|extra-time`
- 若 SerpApi 默认查询不准，可追加 `--query "墨西哥 vs 南非 世界杯 2026-06-11"`
- 自动同步开启后，插件会在比赛开赛后约 150 分钟首次尝试同步；失败后再按 3 / 5 / 10 分钟补查
- 多次自动补查仍失败时，保留手动同步脚本兜底
- 批量手动导入可参考 `docs/results.csv` 和 `docs/results-knockout-r32.csv`

## 配置

当前已支持通过脚本导入赛程和同步赛果，建议后续补充这些配置项：

- `predictor:enabled` - 启用/禁用竞猜功能
- `predictor:scoring-rules` - 积分规则
- `predictor:auto-calculate` - 是否自动计分
- `predictor:results-category` - 发布结果的默认分类

## 自定义比赛数据

### 添加比赛

修改 `library.js` 中的 `initializeDefaultMatches()` 方法：

```javascript
const matches = {
	'2026-06-12-3': {
		id: '2026-06-12-3',
		date: '2026-06-12',
		time: '15:00',
		home: { name: '法国', flag: '🇫🇷' },
		away: { name: '波兰', flag: '🇵🇱' },
		stage: '小组赛',
		group: 'B',
		status: 'upcoming'
	},
	// ... 更多比赛
};
```

### 更新比赛状态

```javascript
const match = await db.getObject('predictor:matches');
match['2026-06-12-1'].status = 'live'; // 或 'finished'
match['2026-06-12-1'].result = { home: 2, away: 1 };
await db.setObject('predictor:matches', match);
```

## 后端扩展示例

### 添加自动计分

创建一个计划任务来检查已完成的比赛并自动计算积分：

```javascript
// 在 library.js 中添加
plugin.scheduleScoreCalculation = async function() {
	const matches = await Predictor.getMatches();
	
	for (const match of Object.values(matches)) {
		if (match.status === 'finished' && match.result) {
			await Predictor.calculateScores(match);
		}
	}
};
```

## 页面样式定制

修改 `static/css/predictor.css` 调整：

- 颜色主题（修改 `#1e88e5` 为你的品牌色）
- 卡片样式和阴影
- 响应式断点
- 动画和过渡效果

## 常见问题

**Q: 如何导入完整的世界杯赛程？**  
A: 可以编写一个初始化脚本，从外部数据源（如足球API）导入赛程数据。

**Q: 如何实现自动计分？**  
A: 需要与外部API集成，获取实时比赛结果，然后自动计算用户分数。

**Q: 是否支持积分商城？**  
A: 当前版本不支持，但可以通过与其他插件集成或自定义扩展来实现。

**Q: 如何迁移到生产环境？**  
A: 确保数据库配置正确，备份所有竞猜数据，然后在生产环境重新安装插件。

## 开发

### 项目结构

```
nodebb-plugin-worldcup-predictor/
├── library.js              # 后端主逻辑
├── plugin.json             # 插件配置
├── package.json            # npm 包信息
├── README.md               # 本文档
└── static/
    ├── css/
    │   └── predictor.css    # 样式
    └── js/
        └── predictor.js     # 前端逻辑
└── templates/
    └── predictor.tpl        # 页面模板
```

### 运行测试

```bash
npm test
```

### 代码风格

遵循 NodeBB 代码规范：
- 使用 `'use strict'`
- 使用 async/await
- 使用 CommonJS 模块
- ESLint 配置见主项目

## 许可证

GPL-3.0

## 贡献

欢迎提交 PR 和 Issue！

## 支持

如有问题，请在论坛或 GitHub 上提出。
