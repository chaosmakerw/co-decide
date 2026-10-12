# 参考来源与使用边界

本轮实际读取的正文/示例（2026-10-12）：

- [Springshare — Library of Things Lending](https://www.springshare.com/libcal/library-of-things-lending)。实际产品页包含虚拟设备目录、类别/位置、预约、工作人员借出管理，以及损坏/维护历史说明。迁移：A 用设备目录为入口，把预约和履历围绕设备组织。适用：先知道自己要找的工具；代价：现场待办需逐件设备查看。未引入该服务的收费、押金、条码、审批或身份验证；未实测该产品。
- [GOV.UK Design System — Task list](https://design-system.service.gov.uk/components/task-list/) 与[实际在线示例](https://design-system.service.gov.uk/components/task-list/default/)。实际读取组件正文、示例链接与状态内容。迁移：B 每一程给出有文字的状态与下一步入口。该指导明确不建议将需要固定顺序的长流程当自由任务列表，因此 B 没有把接收/检修/借出做成可任意跳过的任务：动作仍受共同规则约束。这里只借用状态可见机制，不照搬政府服务流程。
- [Trello — Learn board basics](https://trello.com/guide/trello-101)。实际读取官方 board/list/card 说明，按阶段列表组织事项、点击卡片查看细节。迁移：C 以待归还/待借出/维修队列打开案卷。适用：连续现场交接；代价：住户浏览工具多一步。未引入自由拖拽，设备状态只能由有效业务动作改变。
- [Repair Café — RepairMonitor dashboard article](https://www.repaircafe.org/en/repairmonitor-dashboard-provides-insight-into-repair-data/)：检索返回了文章全文式片段，继续打开时超时。[RepairMonitor dashboard](https://dashboard.repairmonitor.org/?language=en&year=2024) 打开得到空正文。没有把它们当作已查看的界面，也没有以其统计仪表盘补充候选。保留这条检索限制以区分真正可用来源。

本地辅助指导：

- 本机已有 prototype 的 UI 指导：实际读取，采用“不同结构/信息层次/主要入口”“共用底层，不共用锁死骨架的布局”的要求。三条路线分别实现页头导航、主体页面和工作区。
- 本机已有 prototype 的 LOGIC 指导：实际读取，采用本地单 HTML、内存状态、连续操作与不新增测试套件。没有执行文件中的第三方代码或脚本。
- [冻结E1](../frozen/SKILL.md)：本次执行的冻结版；先骨架探索、真实输入、三条整体方向、第一次重要选择前停点。

候选视觉由本场景原创的 SVG、CSS 与版式呈现，没有安装前端设计技能，没有下载/运行第三方脚本，未读取 Anthropic frontend-design，未将搜索片段说成浏览器视觉实测。
