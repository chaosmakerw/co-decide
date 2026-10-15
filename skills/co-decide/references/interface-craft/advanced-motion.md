# 复杂动画：按需使用 GSAP

仅在多元素编排、统一控制时间线或滚动驱动时读取。先核对项目已有 GSAP、版本与插件。缺少依赖可用本地 CSS/WAAPI 保持基本效果和内容可读，无需强制安装或联网加载。

## 时间线与生命周期

相关元素组成 timeline，用标签或第三个位置参数安排先后与重叠；单位为秒，`"<"` 对齐前一动画起点。反复切换复用 play/reverse 或覆盖冲突属性，业务状态即时更新。

以下假设 GSAP 3.11+ 已可用，root 内静态内容本来可见：

```js
const mm = gsap.matchMedia(root);
mm.add("(prefers-reduced-motion: no-preference)", () => {
  gsap.timeline({ defaults: { duration: .24, ease: "power2.out" } })
    .from(".panel", { autoAlpha: 0, y: 12 })
    .from(".item", { autoAlpha: 0, y: 6, stagger: .04 }, "<0.08");
});
// 当前组件卸载时：
mm.revert();
```

matchMedia 内含 context，媒体变化自动回退重建。无媒体分支用 `const ctx = gsap.context(setup, root)`，卸载 `ctx.revert()`；迟后事件创建动画经 ctx.add 收集，同时移除监听。只清理当前组件实例。

## 滚动编排

注册 ScrollTrigger，触发器放在顶层 tween 或 timeline。随滚动选 scrub，跨阈值播放选 toggleActions；固定容器时移动子元素，移动端和减少动画模式仍可直接阅读。

距离由函数读实际尺寸，必要时设置 invalidateOnRefresh。例如横移 `-Math.max(0, track.scrollWidth - viewport.clientWidth)`，单位 px。字体、图片或内容改变布局后 ScrollTrigger.refresh；resize 已自动刷新。批量读后再写，不每帧刷新。containerAnimation 的水平运动用 ease: "none"，子触发器的 pin/snap 限制核对官方文档。

验证滚动、resize、媒体切换、导航卸载与重新进入，核对残留实例和样式。GSAP 改写样式时 `getAnimations()` 可能为空；用 computedStyle 中间值及所持 timeline/ScrollTrigger 状态验证实际运行。

官方 API：[timeline](https://gsap.com/docs/v3/GSAP/Timeline/)、[matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/)、[context](https://gsap.com/docs/v3/GSAP/gsap.context%28%29/)、[ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)。

来源见 [SOURCE.md](SOURCE.md) 与 [GSAP Skills 许可证](LICENSE-gsap.txt)。该 Skill 仓库的 MIT 许可不代表 GSAP 运行库也采用 MIT；使用运行库时核对其自身许可。
