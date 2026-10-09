import * as THREE from 'three';

/**
 * 无限远时空基准沉降网格面 (Infinite Warped Spacetime Sheet)
 * 实时渲染向宇宙地平线无限延伸的时空基准几何面:
 * 1. 坐标线无限延伸并自动按距离雾化淡入深空背景 (零裁切感)
 * 2. 依据各引力天体质量与距离，实时产生三维广义相对论引力势阱下陷 (Gravitational Funnel)
 * 3. 完美结合三维晶格，展现从局部强引力到无穷远平直闵可夫斯基时空的完整过渡
 */
export class InfiniteSpacetimeSheet {
  constructor(scene, gravityField) {
    this.scene = scene;
    this.gravityField = gravityField;
    this.enabled = true;

    // 创建高精度几何网格平面 (大尺度平铺)
    const gridSize = 160;
    const gridSegments = 120;
    this.geometry = new THREE.PlaneGeometry(gridSize, gridSize, gridSegments, gridSegments);
    this.geometry.rotateX(-Math.PI / 2); // 放置在水平 XZ 平面上

    // 自定义着色器材质：包含无限延伸经纬线与引力势能着色
    this.uniforms = {
      uGridSpacing: { value: 2.0 },
      uSubSpacing: { value: 0.5 },
      uFadeRadius: { value: 75.0 },
      uColorFar: { value: new THREE.Color('#0a1b3a') },
      uColorNear: { value: new THREE.Color('#00e5ff') },
      uColorCore: { value: new THREE.Color('#00ff88') }
    };

    const vertexShader = `
      varying vec3 vWorldPos;
      varying float vCurvature;

      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vCurvature = position.y; // 传递由 CPU 计算的下陷深度
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uGridSpacing;
      uniform float uSubSpacing;
      uniform float uFadeRadius;
      uniform vec3 uColorFar;
      uniform vec3 uColorNear;
      uniform vec3 uColorCore;
      varying vec3 vWorldPos;
      varying float vCurvature;

      void main() {
        vec2 coord = vWorldPos.xz;

        // 主网格线 (每 2.0 单位)
        vec2 grid = abs(fract(coord / uGridSpacing - 0.5) - 0.5) * uGridSpacing;
        float line = min(grid.x, grid.y);
        float lineWeight = smoothstep(0.06, 0.0, line);

        // 次级细网格线 (每 0.5 单位)
        vec2 subGrid = abs(fract(coord / uSubSpacing - 0.5) - 0.5) * uSubSpacing;
        float subLine = min(subGrid.x, subGrid.y);
        float subWeight = smoothstep(0.04, 0.0, subLine) * 0.35;

        float totalGrid = clamp(lineWeight + subWeight, 0.0, 1.0);

        // 依据距世界中心的距离进行平滑距离雾化 (自然融入深空黑背景)
        float dist = length(vWorldPos.xz);
        float fade = exp(-pow(dist / uFadeRadius, 2.5));

        // 依据曲率与下陷深度混合颜色
        float warpFactor = clamp(-vCurvature * 0.45, 0.0, 1.0);
        vec3 lineColor = mix(uColorFar, uColorNear, warpFactor);
        lineColor = mix(lineColor, uColorCore, pow(warpFactor, 2.0));

        // 混合网格发光与虚空底色
        vec3 finalColor = lineColor * totalGrid * fade * 0.85;
        float alpha = (totalGrid * 0.75 + warpFactor * 0.25) * fade;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = -6.0; // 默认位于三维立方体底部
    this.scene.add(this.mesh);

    // 缓存原始平面基准顶点坐标
    this.basePositions = this.geometry.attributes.position.array.slice();
  }

  setEnabled(val) {
    this.enabled = val;
    this.mesh.visible = val;
  }

  setY(y) {
    this.mesh.position.y = y;
  }

  /**
   * 实时根据各天体质量，计算无限时空网格的引力沉降漏斗 (Gravity Funnel)
   */
  update() {
    if (!this.enabled || !this.mesh.visible) return;

    const posAttr = this.geometry.attributes.position;
    const posArr = posAttr.array;
    const base = this.basePositions;
    const bodies = this.gravityField.bodies;
    const meshY = this.mesh.position.y;

    const count = posArr.length / 3;

    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const bz = base[i * 3 + 2];

      let depth = 0;

      // 叠加所有天体的引力势能漏斗: Delta Y = - G * M / (d + eps)
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b];
        if (body.mass <= 0) continue;

        const dx = bx - body.position.x;
        const dz = bz - body.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);

        // 广义相对论时空曲率嵌入下陷函数
        const softening = 2.2;
        const sink = (this.gravityField.G * body.mass * 0.0035) / Math.sqrt(d * d + softening * softening);
        depth -= Math.min(6.5, sink * 12.0);
      }

      posArr[i * 3 + 1] = depth;
    }

    posAttr.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
