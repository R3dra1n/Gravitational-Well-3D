# 🌌 Gravitational Spacetime Lattice & Multi-Body Chaos Simulation
### 三维时空晶格曲率、N体动力学与庞加莱混沌引力模拟器

[![Fork of rafaehlers/Gravitational-Well-3D](https://img.shields.io/badge/Forked%20From-rafaehlers%2FGravitational--Well--3D-blue?logo=github)](https://github.com/rafaehlers/Gravitational-Well-3D)
[![Built with Three.js](https://img.shields.io/badge/Built%20with-Three.js%20r170-black?logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%206-646CFF?logo=vite)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 致谢与溯源标注 (Attribution & Acknowledgment)

> **关于本项目溯源**：  
> 本项目基于 **[Rafael Ehlers](https://github.com/rafaehlers)** 的开源项目 **[rafaehlers/Gravitational-Well-3D](https://github.com/rafaehlers/Gravitational-Well-3D)** 进行了深度的二次开发、物理机制重构与全维度功能拓展。  
> 
> * **原项目奠基**：原项目提供了基于 Three.js 的笛卡尔立方体时空引力势阱拓扑雏形。
> * **二开与演化**：在此基础上，本项目进行了从底层 GLSL 着色器到宏观天体力学的大规模重构与升级，将原本单一固定的引力势阱扩展为支持全自由度多体引力互绕、真实天体表面纹理、无边界全向势能色谱、微观粒子吸积吸流、以及庞加莱三体真混沌系统的综合物理模拟平台。特此对原作者 Rafael Ehlers 的启发与开源贡献表示诚挚谢意！

---

## ✨ 核心升级与特性 (Enhanced Features)

### 1. 🪐 全自由度天体管理与物理解耦 (Celestial Bodies & True Physics)
* **质量与体积完全独立**：视觉几何半径 $R$（外观体积）与引力质量 $M$（时空弯曲力）彻底分离，支持模拟极小体积超大引力黑洞、低密度红巨星、脉冲星等不同极端天体。
* **丰富的天体表面程序化纹理**：
  * 🌞 **Sun (恒星)**：炽热对流湍流日冕与太阳黑子动效。
  * 🌍 **Earth (类地)**：动态蔚蓝海洋、大陆板块与半透大气云层。
  * 🪐 **Jupiter (气态)**：深浅交织的带状大气湍流与大红斑条纹。
  * 🌑 **Moon (月球)**：陨石坑灰质多孔岩石质感。
  * 🕳️ **Black Hole (黑洞)**：引力光线弯曲、绝对暗影视界与吸积盘奇点。
  * 💎 **Crystal (微晶)**：半透微晶高光折射材质。

### 2. 🎮 3D 空间直接交互与智能选取 (Interactive 3D Gizmo)
* **TransformControls 视口直接拖拽**：鼠标点击即可在 3D 空间中出现 RGB 移动轴，直接抓取天体拖曳移动，引力场与时空网格 60FPS 实时联动形变。
* **宇宙虚空点击取消选取 (Click-to-Deselect)**：智能识别视角漫游旋转与点击操作。在深空空白处轻点即可一键隐藏 3D 轴，恢复纯净视觉体验；同时配备侧边栏 `✕ DESELECT` 按钮。
* **轨道动力学实时 HUD**：左上角悬浮监测天体当前速度 $v_{\text{cur}}$、第一宇宙绕转速度 $v_{\text{orb}}$、第二宇宙逃逸速度 $v_{\text{esc}}$，并动态判定当前处于“低速坠落”、“稳定绕转”还是“超速逃逸”状态。

### 3. 🌀 庞加莱三体真混沌系统 (Poincaré Three-Body Chaos)
* **打破伪三体周期假象**：彻底重构拉格朗日正三角形周期特解，采用非对称三体质量（$36:24:16$）与全向 3D 非共面初速度。
* **动量守恒质心锚定**：精细配置系统质心动量为零（$\sum M_i \vec{v}_i = \vec{0}$），确保三颗星在视野中心永久互绕、弹弓甩飞、绞杀与交替捕获，绝不飘逸出界。
* **弹性反弹碰撞机制**：三体混沌下自动切换弹性反弹，避免近距掠过瞬间因非弹性合并导致三体退化。
* **离子光辉拖尾 (Ion Ribbon Trails)**：自适应渐变发光轨迹线，实时勾勒庞加莱混沌中神秘莫测的蝴蝶结纠缠几何图样。
* **一键混沌微扰 (Butterfly Effect)**：支持 `🎲 随机` 或细微调整任意速度分量，即时见证截然不同的宏大宇宙命运。

### 4. 🌈 全向引力势能色谱 (Gravitational Potential Spectrum)
* **360° 无偏轴对称势能标量场**：彻底消除笛卡尔三轴平面错觉，根据叠加引力势 $\Phi = \sum \frac{G M_i}{r_i}$ 实时映射。
* **四种科学配色方案**：
  * **Accretion Heat (吸积热辐射)**：深空冷蓝 $\to$ 炽热金黄 $\to$ 核心白炽耀斑。
  * **Gravitational Redshift (广义相对论引力红移)**：外围蓝白 $\to$ 橙红过渡 $\to$ 深红暗化。
  * **Escape & Shadow (光线逃逸暗影)**：远景亮白 $\to$ 灰银 $\to$ 强引力黑洞暗影。
  * **Monochrome (经典霓虹)**：极简电光水青。

### 5. ✨ 微观吸积粒子流 (Stardust Accretion Streams)
* **吸积盘物理模拟**：生成朝向引力中心的向心速度与切向旋转分量，支持粒子被中心天体视界捕获吞噬、阻尼吸积或大角度引力弹弓甩飞。
* **流循环与有限模式**：支持恒定吸积流补充循环（Recycle）或单批次有限计数吞噬试验（Finite）。

---

## 📐 物理模型与单位基准 (Physics & Units)

在天体物理学数值仿真中，为避免 Float32 单精度浮点数在 $10^{30} \text{ kg}$ 与 $10^{-11} \text{ m}^3\text{kg}^{-1}\text{s}^{-2}$ 间发生截断下溢，本项目采用**几何化标度天文单位制 (Dimensionless Normalized Units)**：

| 物理量 | 真实自然界基准 (SI) | 仿真模拟器基准 (Sim Units) | 标度说明 |
| :--- | :--- | :--- | :--- |
| **引力常数 $G$** | $6.6743 \times 10^{-11} \text{ N}\cdot\text{m}^2/\text{kg}^2$ | $G \equiv 1.00$ | 归一化基准引力强度 (Intensity = 1.00) |
| **空间距离 $[L]$** | $1 \text{ AU} \approx 1.496 \times 10^8 \text{ km}$ | $1 \text{ unit} \approx 1 \times 10^7 \text{ km}$ | 视口尺度 $200 \sim 500$ 涵盖内太阳系轨道 |
| **天体质量 $[M]$** | 太阳 $M_\odot \approx 1.989 \times 10^{30} \text{ kg}$ | 太阳 $M \approx 30 \sim 50$ | 地球对应 $M \approx 0.5 \sim 1.0$ |
| **视觉半径 $[R]$** | 太阳 $696,000 \text{ km}$ / 地球 $6,371 \text{ km}$ | $R \approx 2.5 \sim 7.0$ | 天文馆式科学可视化缩放，与引力质量解耦 |
| **第一宇宙速度** | $v = \sqrt{G M / r}$ | $v_{\text{orb}} = \sqrt{\Phi} = \sqrt{\frac{2.5 M}{r}}$ | 圆轨道向心引力动平衡初速度 |

---

## 🚀 本地运行与开发 (Quick Start)

```bash
# 1. 克隆本仓库
git clone https://github.com/R3dra1n/Gravitational-Well-3D.git
cd Gravitational-Well-3D

# 2. 安装依赖
npm install

# 3. 启动本地开发服务 (支持 HMR 热更新)
npm run dev

# 4. 构建生产环境打包文件
npm run build
```

生产打包生成在 `dist/` 目录下，包含全部压缩与树摇优化后的静态资源。

---

## 🌐 线上部署说明 (Deployment)

由于本项目为 **100% 纯前端客户端应用**（全部矩阵与着色器在访问者浏览器 GPU 上实时执行）：

1. **GitHub Pages 免费部署**：
   * 进入本仓库的 `Settings` $\to$ `Pages`。
   * 在 `Build and deployment` 的 Source 中选择 `Deploy from a branch` 或配置 GitHub Action，分支选为 `main`。
   * 即可通过 `https://r3dra1n.github.io/Gravitational-Well-3D/` 全球访问！
2. **Vercel / Cloudflare Pages 一键托管**：
   * 在 Vercel 导入当前仓库，平台将自动识别 Vite 并执行 `npm run build`，几十秒内即可生成全球 CDN 加速的专属独立域名。

---

## 📄 开源许可证 (License)

本项目遵循 [MIT License](LICENSE)。欢迎自由学习、研究、交流与进一步二次创作。
再次向 [rafaehlers/Gravitational-Well-3D](https://github.com/rafaehlers/Gravitational-Well-3D) 作者致敬！
