# PlayCast 应用图标

用户确认名称：玩播 · PlayCast。主视觉沿用此前确认的珊瑚橙播放/直播信号图形，不绑定抖音、英雄联盟或单一玩法。

## 素材来源与处理

- 参考图：`artwork/app-icons-concept-v1.png`，此前由 Agnes 生成的原创概念稿。
- 独立母图：`playcast-icon-master.png`，使用 Agnes ImageGen 的 edit 模式，1K、1:1，一次请求，无新增项目依赖。
- Agnes 实际返回 RGB 白色展示背景，而非透明通道。`scripts/build-brand-icons.py` 从珊瑚色外轮廓提取封闭蒙版，保留内部象牙白图形并去除外部展示底板/阴影，输出真实透明边缘。
- 最终运行资源：`public/assets/brand/playcast.png`（512px）和 `playcast.ico`（16–256px，9 个尺寸）。Vite 构建复制到 `dist/assets/brand`。母图及此文档不被 Vite 复制。
- 重建资源使用 Python + Pillow 运行 `scripts/build-brand-icons.py`，仅为开发期素材处理；应用运行不需要 Python 或 Pillow。
- `package.json` 内部名称不更改，用户数据目录保持原样；Windows 打包配置将同一 ICO 嵌入安装器及 `PlayCast.exe`，不修改 Electron 开发依赖中的原始程序。

## 生成提示

Edit the supplied concept sheet. Extract and refine ONLY the LEFT coral-red livestream app icon as the standalone app icon for PlayCast. Preserve its coral rounded-square tile, warm ivory play triangle and broadcast strokes, friendly face-on style and strong silhouette. Remove the trophy and chat icons completely. One centered icon, square canvas, tile occupies 88 percent of width and height. Use a genuinely transparent background around the rounded tile, including its corners; no off-white presentation board, no checkerboard pattern, no exterior drop shadow. Keep subtle shading only inside the tile. Simplify the broadcast strokes into TWO bold clean arcs beside the play triangle for legibility at 16 and 24 pixels. No text, no letters, no badge, no watermark, no device mockup. Keep the ivory motif fully opaque. This is a production PNG icon asset, not a design sheet.
