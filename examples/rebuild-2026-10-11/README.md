# 六份成品对照

个人阅读管理与小团队请假各有三份本地成品：原版 Codex、Co-Decide A 路线、Co-Decide B 路线。阅读原版是自然输出恰好接近 A，未被问到 A 偏好、也未修订；业务原版首次默认审批，首次交付后收到唯一一次 A 修订反馈才改成直接生效。原版同样允许提问，但不能把交付后修订写成事前讨论。阅读成品来自任务 v2，业务成品来自任务 v1；不能把两种任务版本合并声称同一轮实验。

这是一份本地便携展示集，随本次仓库更新归档公开。全部资料为合成数据；请假中的身份切换仅供本地演示，不能据此声称真实认证或多人生产共享。展示应用不是插件运行包，不会安装为插件；本次发布不改用户配置或插件缓存。

## 查看与体验

直接打开 [gallery.html](gallery.html) 可以查看实际截图。要操作六份应用，安装 Node.js 后双击 [start.cmd](start.cmd)，或在本目录运行：

```sh
node preview.mjs
```

在浏览器打开终端显示的本机地址。每份成品都有独立地址，可单独打开或在展示页展开体验。按 Ctrl+C 关闭本次启动的服务。无需安装 npm 依赖；脚本不会自动打开浏览器，也不会管理其他进程。

| 任务 | 版本 | 成品 |
| --- | --- | --- |
| 个人阅读管理 | v2 | 阅间：原版 Codex；页间：Co-Decide A，书刊浏览；一页：Co-Decide B，阅读行动 |
| 小团队请假 | v1 | 休假小站：原版 Codex；栖日：Co-Decide A，自主登记；留白：Co-Decide B，负责人确认 |

应用文件位于 products/；清单为 [products.json](products.json)，离线页读取内容相同的 products.js。screenshots/ 中保存实际验收截图；截图是独立 Edge 验收时的真实测试状态，可能包含合成操作后的登记或确认，不代表每次启动的初始状态；展示页逐卡注明截图状态。留白展示的是负责人已经确认的成员申请页。一页展示新浏览器会话的初次首页，合成书目初始记录为 36/240 页。六张图片均来自最终成品实际运行，没有用小样或草图代替。

## 回看原问题小样

以下文件是测试器保存的原问题小样，供回看当时的不同路线，不是成品主入口，也不声称模型自行归档。正式体验请使用上面的展示页和 start.cmd。

| 路线 | 原小样入口 |
| --- | --- |
| 书刊浏览 | [ui-browse/previews.html](previews/ui-browse/previews.html) |
| 阅读行动 | [ui-action/preview.html](previews/ui-action/preview.html) |
| 自主登记 | [biz-register/choice-preview.html](previews/biz-register/choice-preview.html) |
| 负责人确认 | [biz-confirm/routes.html](previews/biz-confirm/routes.html) |

页面可直接回看；若浏览器限制小样脚本或数据读取，使用 Node.js 在相应小样目录启动其 server.mjs，或通过当前展示服务的相对地址打开小样。小样 server.mjs 仅用于回看，和成品服务分开。

[来源与 SHA-256 摘要](source/provenance.json) 用实验目录相对路径记录运行文件、截图和原小样的来源；原始文件与Git blob分别记录哈希，避免文本换行转换引起误判。没有用户个人绝对路径，没有复制 source-manifest.json、原始会话或用户配置。
