# MiSans

[![NPM](https://img.shields.io/npm/v/misans)](https://www.npmjs.com/package/misans)
[![jsDelivr](https://img.shields.io/jsdelivr/npm/hm/misans)](https://www.jsdelivr.com/package/npm/misans)

MiSans (subsetted) fonts from Xiaomi for free (web) use.

小米发布的 MiSans 字体，基于小米官方切片范围进行子集化，以供 web 使用。

Online Demo: [GitHub Pages](https://github.dsrkafuu.net/misans/)

![Fonts Preview](https://raw.githubusercontent.com/dsrkafuu/misans/main/preview.png)

Version: `4.009`

## CDN

- https://unpkg.com/misans/
- https://www.jsdelivr.com/package/npm/misans

## Usage

- Normal & TC versions are subsetted with the official Xiaomi code ranges
- Other versions are not subsetted
- All versions ship static fonts & variable fonts (VF), output is WOFF2-only

- 普通版与 TC 版基于小米官方切片范围进行子集化
- 其他版本未进行子集化
- 所有版本均提供静态字体与可变字体（VF），输出仅包含 WOFF2

Each static weight ships its own css (`MiSans-<Weight>.min.css`), the variable font ships a single css (`MiSansVF.min.css`) under the family name `<Family> VF` (e.g. `MiSans VF`), so the two can be referenced independently.

每个静态字重都有独立的 css（`MiSans-<Weight>.min.css`），可变字体为单一 css（`MiSansVF.min.css`），家族名为 `<Family> VF`（如 `MiSans VF`），两者可独立引用。

The following examples include only the Normal version. For other versions, please refer to the examples and make them yourself.

以下的例子只包含了普通版本，其他版本请参照示例自行引入。

### Static

```html
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/MiSans-Medium.min.css"
/>
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/MiSans-Bold.min.css"
/>
```

### Variable (VF)

```html
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@5.0.0/lib/Normal/MiSansVF.min.css"
/>
```

```css
body {
  font-family: 'MiSans VF', sans-serif;
  font-weight: 450; /* any value in 150 - 700 */
}
```

### Weights

The css `font-weight` follows the common web scale instead of the non-standard internal `usWeightClass` values of the MiSans font files:

css 的 `font-weight` 采用通用 web 刻度，而非 MiSans 字体文件内部非常规的 `usWeightClass` 值：

| Weight     | css font-weight | internal usWeightClass |
| ---------- | --------------- | ---------------------- |
| Thin       | 100             | 150                    |
| ExtraLight | 200             | 200                    |
| Light      | 300             | 250                    |
| Normal     | 350             | 305                    |
| Regular    | 400             | 330                    |
| Medium     | 500             | 380                    |
| Demibold   | 600             | 450                    |
| Semibold   | 650             | 520                    |
| Bold       | 700             | 630                    |
| Heavy      | 900             | 700                    |

Note: the VF css declares `font-weight: 150 700` (the font's internal wght axis), so VF weight values follow the internal scale above rather than the standard one. Don't expect the same visual weight when mixing static & VF css of the same family.

注意：VF 的 css 声明 `font-weight: 150 700`（即字体内部 wght 轴），因此 VF 的字重数值遵循上表中的内部刻度而非标准刻度。请不要在同一页面混用同家族的静态与 VF 字体并期待一致的字重表现。

## Subset Details

Checkout `config.json` for settings.

使用 `config.json` 修改设置。

Environment requirements:

环境需求：

- Bun >= 1.2

```ps1
git clone https://github.com/dsrkafuu/misans.git
cd misans
bun install
bun run fetch
bun run build
bun run check
bun run docs
bun run serve
```

- `demo.html` is the demo source linking fonts locally for `bun run serve` debugging
- `bun run docs` generates the minified `docs/index.html` (fonts via jsDelivr) for GitHub Pages

- `demo.html` 是 demo 源码，指向本地字体，配合 `bun run serve` 调试
- `bun run docs` 生成压缩后的 `docs/index.html`（字体走 jsDelivr），用于 GitHub Pages 部署

The unicode ranges come from the official Xiaomi font service. Every `fetch` re-verifies both sources and fails loudly on any drift:

unicode 范围来自小米官方字体服务。每次 `fetch` 都会对两个来源重新验证，任何漂移都会直接报错：

- Static (canonical): https://font.sec.miui.com/font/css?family=MiSans:400:Chinese_Simplify,Latin&display=swap
- VF (cross-check): https://hr.xiaomi.com/website/assets/fonts/global.css

1. Ranges of all 8 official weight tiers are compared pairwise (the snapshot uses weight 400, ranges are weight-invariant)
2. The SC table is compared slice-by-slice against the hr.xiaomi.com VF css
3. Results are stored in the snapshot files `raw/ranges-sc.json` / `raw/ranges-tc.json`

4. 对官方全部 8 个字重档位的切片范围做两两比对（快照取 400 档，范围与字重无关）
5. SC 表与 hr.xiaomi.com 的 VF css 逐切片比对
6. 验证结果写入快照文件 `raw/ranges-sc.json` / `raw/ranges-tc.json`

Subsetting process:

子集化流程：

1. Parse the official unicode-range slices from the snapshot
2. Get all supported unicodes from each font file (fontkit)
3. Intersect & dedup: official slices ∩ font cmap
4. Subset each slice with harfbuzz (subset-font), output woff2 named `<base>.<hash>.<slice>.woff2`
5. Font-supported codepoints missing from the official table can be appended as independent slices via `extendSlices` / `customUnicodes`
6. Generate the sliced css with `unicode-range` per slice

7. 从快照解析官方 unicode-range 切片
8. 从每个字体文件读取支持的 unicode（fontkit）
9. 官方切片与字体 cmap 求交集并跨切片去重
10. 用 harfbuzz（subset-font）对每个切片子集化，输出文件名含内容哈希的 woff2
11. 字体支持但官方表外的码点可通过 `extendSlices` / `customUnicodes` 追加为独立切片
12. 生成每个切片带 `unicode-range` 的 css

## Fonts Source

- https://hyperos.mi.com/font/zh/

## Reference

- subset-font: https://github.com/papandreou/subset-font
- harfbuzzjs: https://github.com/harfbuzz/harfbuzzjs
- fontkit: https://github.com/foliojs/fontkit
- wawoff2: https://github.com/fontello/wawoff2
- MIUI: https://home.miui.com/
- Xiaomi: https://www.mi.com/

## Copyright (Fonts)

[《MiSans 字体知识产权许可协议》](https://hyperos.mi.com/font-download/MiSans%E5%AD%97%E4%BD%93%E7%9F%A5%E8%AF%86%E4%BA%A7%E6%9D%83%E8%AE%B8%E5%8F%AF%E5%8D%8F%E8%AE%AE.pdf)

> 本《MiSans 字体知识产权许可协议》（以下简称“协议”）是您与小米科技有限责任公司（以下简称“小米”或“许可方”）之间有关安装、使用 MiSans 字体（以下简称“MiSans”或“MiSans 字体”）的法律协议。您在使用 MiSans 的所有或任何部分前，应接受本协议中规定的所有条款和条件。安装、使用 MiSans 的行为表示您同意接受本协议所有条款的约束。否则，请不要安装、使用，并应立即销毁和删除所有 MiSans 字体包。
>
> 根据本协议的条款和条件，许可方在此授予您一份不可转让的、非独占的、免版税的、可撤销的、全球性的版权许可，使您依照本协议约定使用 MiSans 字体，前提是符合下列条件：
>
> - 您应在软件中特别注明使用了 MiSans 字体。
> - 您不得对 MiSans 字体或其任何单独组件进行改编或二次开发。
> - 您不得单独将 MiSans 字体或其组件对外租赁、再许可、给予、出借或进一步分发字体软件或其任何副本以及重新分发或售卖。此限制不适用于您使用 MiSans 字体创作的任何其他作品。如您使用 MiSans 字体创作宣传素材、logo、应用 App 等，您有权分发或出售该作品。

## License (Scripts)

Released under `Apache License 2.0`, for more information read the [LICENSE](https://github.com/dsrkafuu/misans/blob/main/LICENSE).

Copyright (c) 2021-present DSRKafuU (<https://dsrkafuu.net>)
