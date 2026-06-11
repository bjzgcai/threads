# 世界杯竞猜插件 - 安装和配置指南

## 快速开始

### 1. 安装插件

```bash
# 进入NodeBB目录
cd /path/to/nodebb

# 安装插件（已在 plugins 目录中）
npm install ./plugins/nodebb-plugin-worldcup-predictor
```

### 2. 启用插件

1. 启动 NodeBB：`./nodebb start` 或 `./nodebb dev`
2. 打开管理后台：`http://your-domain/admin`
3. 进入 **扩展 (Extend) → 插件 (Plugins)**
4. 搜索 "世界杯竞猜" 或 "worldcup-predictor"
5. 点击启用 (Activate/Enable)
6. 运行 `./nodebb build`
7. 重启 NodeBB

### 3. 访问竞猜页面

安装启用后，在以下地址访问竞猜页面：

```
http://your-domain/predictor
```

> **注意**：页面可公开访问，但提交竞猜和发布帖子需要登录。

## 功能说明

### 三个标签页面

#### 📅 比赛列表
- 显示所有世界杯比赛
- 按日期分组展示
- 显示球队国旗、名称、比赛时间
- 快速竞猜按钮

#### 🎯 我的预测  
- 查看已提交的竞猜记录
- 显示预测结果（胜/平/负 或具体比分）
- 显示提交时间

#### 🏆 排行榜
- 实时排行榜展示
- 显示用户排名和分数
- 前三名特殊标记（🥇🥈🥉）

### 竞猜流程

1. **点击"竞猜"按钮** → 打开竞猜弹窗
2. **选择预测方式**：
   - 三按钮选项（本队胜 / 平局 / 客队胜）
   - 或输入具体比分（如 2:1）
3. **点击"提交竞猜"** → 保存到你的预测记录
4. **可选：点击"发布为帖子"** → 在论坛创建帖子分享预测

## API 端点

### 获取比赛列表
```
GET /api/v3/predictor/matches
```
返回所有比赛信息（无需认证）

### 提交竞猜
```
POST /api/v3/predictor/predictions
Content-Type: application/json

{
  "matchId": "2026-06-12-1",
  "prediction": {
    "type": "result",
    "result": "home"  // "home" | "away" | "draw"
  }
}
```

或提交比分：
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

### 获取用户竞猜
```
GET /api/v3/predictor/my-predictions
```

### 获取排行榜
```
GET /api/v3/predictor/leaderboard
```

### 发布为帖子
```
POST /api/v3/predictor/publish-result

{
  "matchId": "2026-06-12-1",
  "categoryId": 5,           // 目标分类ID
  "title": "我的世界杯竞猜",
  "content": "我预测....."
}
```

## 自定义比赛数据

### 添加比赛

编辑 `plugins/nodebb-plugin-worldcup-predictor/library.js`，修改 `initializeDefaultMatches` 函数：

```javascript
Predictor.initializeDefaultMatches = async function () {
	const matches = {
		'2026-06-12-1': {
			id: '2026-06-12-1',
			date: '2026-06-12',
			time: '03:00',
			home: { name: '阿根廷', flag: '🇦🇷' },
			away: { name: '摩洛哥', flag: '🇲🇦' },
			stage: '小组赛',
			group: 'A',
			status: 'upcoming'  // 'upcoming' | 'live' | 'finished'
		},
		// ... 添加更多比赛
	};
	
	await db.setObject('predictor:matches', matches);
	return matches;
};
```

### 更新比赛状态

通过 NodeBB CLI 或后端代码更新：

```javascript
const db = require('./src/database');

// 获取比赛数据
const matches = await db.getObject('predictor:matches');

// 更新特定比赛
matches['2026-06-12-1'].status = 'finished';
matches['2026-06-12-1'].result = { home: 2, away: 1 };

// 保存回数据库
await db.setObject('predictor:matches', matches);
```

## 样式自定义

编辑 `plugins/nodebb-plugin-worldcup-predictor/static/css/predictor.css`：

```css
/* 改变主题色（默认蓝色 #1e88e5） */
.match-card:hover,
.predictor-tabs .nav-link.active {
	color: #YOUR_COLOR;
	border-color: #YOUR_COLOR;
}
```

## 常见问题

### Q: 如何添加完整的赛程？
A: 修改 `library.js` 中的比赛数据，或从足球API（如 api-football、ESPN等）导入。

### Q: 如何实现自动计分？
A: 需要：
1. 集成外部API获取实时比赛结果
2. 编写计分逻辑对比用户预测与实际结果
3. 更新排行榜数据

### Q: 可以修改排行榜算法吗？
A: 可以，修改 `library.js` 中的计分逻辑。

### Q: 支持赌分吗？
A: 当前版本不支持，可通过扩展或与其他插件集成实现。

### Q: 如何备份竞猜数据？
A: 使用 NodeBB 数据库备份工具备份整个数据库，竞猜数据存储在：
- `predictor:matches`
- `predictor:predictions:*`
- `predictor:leaderboard`

## 数据库结构

所有竞猜数据存储在 Redis/MongoDB：

```
predictor:matches = {
  "2026-06-12-1": { id, date, time, home, away, stage, group, status },
  ...
}

predictor:predictions:{matchId}:{uid} = {
  uid, username, matchId, prediction (JSON), createdAt
}

predictor:user:predictions:{uid} = set of matchIds

predictor:leaderboard = sorted set (username => score)

predictor:published:{matchId} = set of topic IDs
```

## 文件结构

```
plugins/nodebb-plugin-worldcup-predictor/
├── plugin.json              # 插件配置
├── package.json             # npm 包信息
├── library.js               # 后端逻辑
├── README.md                # 插件说明
├── INSTALL.md               # 本文档
├── static/
│   ├── css/
│   │   └── predictor.css
│   └── js/
│       └── predictor.js
└── templates/
    └── predictor.tpl
```

## 故障排除

### 页面加载失败
- 检查 NodeBB 日志：`tail -f logs/output.log`
- 确保插件已正确启用
- 检查浏览器控制台错误信息

### 竞猜提交失败
- 检查用户是否登录
- 验证分类权限设置
- 查看网络请求响应

### 比赛数据未显示
- 确保数据库连接正常
- 检查 `predictor:matches` 数据是否存在
- 重启 NodeBB 重新初始化数据

## 联系支持

如有问题，请查看插件日志或 NodeBB 论坛。
