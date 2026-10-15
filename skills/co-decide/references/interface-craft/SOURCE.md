# 细节指导来源与改写范围

本目录是 Co-Decide 的中文适配参考，不是另一个自动发现的 Skill。按任务需要读取，任务运行不下载或执行上游安装器、引擎和 hooks；重要选择、授权、等待与验收由 Co-Decide 核心指导处理。

| 本地参考 | 固定上游来源 | 许可 |
| --- | --- | --- |
| [布局与主题](layout-theme.md)、[细节收尾](polish.md) | [Impeccable](https://github.com/pbakaus/impeccable/tree/245ad82def45831dc56a21b683c7a1ff530b06cc)，`skill/reference/layout.md`、`colorize.md`、`polish.md` | [Apache-2.0](LICENSE-impeccable.txt)，保留 [上游通知](NOTICE-impeccable.md) |
| [交互动画](interaction-motion.md) | [Emil Skills](https://github.com/emilkowalski/skills/tree/2d228630ba1446365f614a108cb8252f1feda202)，`skills/animate/SKILL.md`、`RECIPES.md` | [MIT](LICENSE-emil.txt)，Copyright 2026 Emil Kowalski |
| [复杂动画](advanced-motion.md) | [官方 GSAP Skills](https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760)，`skills/gsap-core`、`gsap-timeline`、`gsap-scrolltrigger`、`gsap-performance` | [Skill 的 MIT 许可](LICENSE-gsap.txt)，Copyright 2026 GreenSock |

以上四份中文参考经过压缩、重组与改写，并非上游文件的逐字复制。保留具体实现判断，移除宿主命令、扫描占位符、live 参数和重复确认；个人风格禁令不作为 Co-Decide 的通用限制。布局与收尾适配文件沿用来源 Apache-2.0 条款，动画适配文件沿用对应 MIT 条款；完整上游许可证随包提供，Co-Decide 自有文件沿用项目原许可。

GSAP Skill 的许可与运行库许可分开；实际采用运行库时参阅 [官方运行库许可](https://gsap.com/community/standard-license/)，核对项目当前依赖与 API。基础交互不需要 GSAP、MCP 或付费服务。本目录不捆绑 GSAP 运行库。
