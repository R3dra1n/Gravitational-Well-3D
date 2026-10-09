import * as THREE from 'three';

export class SpacetimeLattice {
  constructor(scene, gravityField, options = {}) {
    this.scene = scene;
    this.gravityField = gravityField;

    // 晶格配置参数
    this.dim = options.dim || 4;             // 每个维度的节点数量 (如 4x4x4, 可扩展到 16x16x16)
    this.size = options.size || 24;          // 空间立方体总跨度 [-size/2, size/2]
    this.samplesPerLine = options.samples || 50; // 每条网格线的平滑曲线采样数
    this.nodeRadius = options.nodeRadius || 0.25;
    this.showNodes = options.showNodes !== undefined ? options.showNodes : true;
    this.colorMode = options.colorMode || 'classic'; // 'classic' | 'turbo' | 'contour'

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.linesMesh = null;
    this.nodesMesh = null;
    this.linePositions = null;
    this.lineColors = null;
    this.rawLinesData = []; // 存储所有线的基准坐标信息

    // 颜色插值缓存
    this.colorFar = new THREE.Color('#1040a0');     // 外围深空电光蓝
    this.colorMid = new THREE.Color('#00d2ff');     // 中段青水蓝
    this.colorNear = new THREE.Color('#00ff88');    // 靠近引力中心的翠绿发光色
    this.colorCore = new THREE.Color('#e0ffff');    // 核心耀白

    this.tempV3 = new THREE.Vector3();
    this.tempColor = new THREE.Color();
    this.dummyMatrix = new THREE.Matrix4();

    this.buildLattice();
  }

  /**
   * 构建晶格几何体与实例网格
   */
  buildLattice() {
    // 1. 彻底清空并释放旧网格与所有子对象
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    this.linesMesh = null;
    this.nodesMesh = null;

    // 彻底清空历史网格线数据，防止密度调大调小时线条残留积累
    this.rawLinesData = [];

    const n = this.dim;
    const half = this.size / 2;
    const step = this.size / (n - 1);

    // 动态调整每条线的采样点，保证高密度（如 24x24x24）依然保持 60 FPS 丝滑帧率
    this.samplesPerLine = this.dim >= 18 ? 20 : (this.dim >= 12 ? 28 : (this.dim >= 8 ? 38 : 50));
    const samples = this.samplesPerLine;

    // 生成基准离散坐标数组
    const coords = [];
    for (let i = 0; i < n; i++) {
      coords.push(-half + i * step);
    }
    this.coords = coords;

    // X方向平行线（共 n * n 条）
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        this.rawLinesData.push({
          axis: 'X',
          y: coords[j],
          z: coords[k],
          tMin: -half,
          tMax: half,
          jIndex: j,
          kIndex: k
        });
      }
    }

    // Y方向平行线（共 n * n 条）
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        this.rawLinesData.push({
          axis: 'Y',
          x: coords[i],
          z: coords[k],
          tMin: -half,
          tMax: half,
          iIndex: i,
          kIndex: k
        });
      }
    }

    // Z方向平行线（共 n * n 条）
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        this.rawLinesData.push({
          axis: 'Z',
          x: coords[i],
          y: coords[j],
          tMin: -half,
          tMax: half,
          iIndex: i,
          jIndex: j
        });
      }
    }

    // 2. 创建平滑弯曲线的顶点缓冲 (LineSegments: 每个段有两个顶点)
    const numLines = this.rawLinesData.length;
    const segmentsPerLine = samples - 1;
    const totalLineVertices = numLines * segmentsPerLine * 2;

    this.linePositions = new Float32Array(totalLineVertices * 3);
    this.lineColors = new Float32Array(totalLineVertices * 3);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(this.lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.NormalBlending,
      linewidth: 1.5
    });

    this.linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.group.add(this.linesMesh);

    // 3. 创建所有交叉节点的球体实例 (InstancedMesh)
    const totalNodes = n * n * n;
    // 节点尺寸微型精巧，完全对标参考图，绝不遮挡连线
    const effectiveRadius = 0.20 * (4 / Math.max(4, this.dim));
    const segments = this.dim >= 16 ? 8 : 12;
    const sphereGeometry = new THREE.SphereGeometry(effectiveRadius, segments, segments);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.NormalBlending
    });

    this.nodesMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, totalNodes);
    this.nodesMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(totalNodes * 3), 3);
    this.nodesMesh.visible = this.showNodes;
    this.group.add(this.nodesMesh);

    // 预计算节点基准三维坐标
    this.nodeBaseCoords = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          this.nodeBaseCoords.push({
            i, j, k,
            p0: new THREE.Vector3(coords[i], coords[j], coords[k])
          });
        }
      }
    }

    // 立即更新一次形态
    this.update();
  }

  /**
   * 根据当前引力场实时更新空间晶格的弯曲形态与发光色彩
   */
  update() {
    if (!this.linesMesh || !this.nodesMesh) return;

    const posAttr = this.linesMesh.geometry.attributes.position;
    const colAttr = this.linesMesh.geometry.attributes.color;
    const posArray = posAttr.array;
    const colArray = colAttr.array;

    const samples = this.samplesPerLine;
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const warpedA = new THREE.Vector3();
    const warpedB = new THREE.Vector3();

    let vIdx = 0;
    const field = this.gravityField;

    // 1. 更新所有平滑弯曲线
    for (let l = 0; l < this.rawLinesData.length; l++) {
      const line = this.rawLinesData[l];
      const dt = (line.tMax - line.tMin) / (samples - 1);

      for (let s = 0; s < samples - 1; s++) {
        const t0 = line.tMin + s * dt;
        const t1 = line.tMin + (s + 1) * dt;

        // 获取两端点的基准坐标
        if (line.axis === 'X') {
          pA.set(t0, line.y, line.z);
          pB.set(t1, line.y, line.z);
        } else if (line.axis === 'Y') {
          pA.set(line.x, t0, line.z);
          pB.set(line.x, t1, line.z);
        } else {
          pA.set(line.x, line.y, t0);
          pB.set(line.x, line.y, t1);
        }

        // 引力弯曲计算
        const potA = field.getWarpedPosition(pA, warpedA);
        const potB = field.getWarpedPosition(pB, warpedB);

        // 顶点A
        posArray[vIdx * 3]     = warpedA.x;
        posArray[vIdx * 3 + 1] = warpedA.y;
        posArray[vIdx * 3 + 2] = warpedA.z;
        this.getCurvatureColor(potA, this.tempColor);
        colArray[vIdx * 3]     = this.tempColor.r;
        colArray[vIdx * 3 + 1] = this.tempColor.g;
        colArray[vIdx * 3 + 2] = this.tempColor.b;
        vIdx++;

        // 顶点B
        posArray[vIdx * 3]     = warpedB.x;
        posArray[vIdx * 3 + 1] = warpedB.y;
        posArray[vIdx * 3 + 2] = warpedB.z;
        this.getCurvatureColor(potB, this.tempColor);
        colArray[vIdx * 3]     = this.tempColor.r;
        colArray[vIdx * 3 + 1] = this.tempColor.g;
        colArray[vIdx * 3 + 2] = this.tempColor.b;
        vIdx++;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // 2. 更新所有交叉节点球体的位置与色彩
    if (this.showNodes && this.nodesMesh.visible) {
      const warpedNode = new THREE.Vector3();
      const nodeColorAttr = this.nodesMesh.instanceColor;
      const nodeColors = nodeColorAttr.array;

      for (let idx = 0; idx < this.nodeBaseCoords.length; idx++) {
        const node = this.nodeBaseCoords[idx];
        const pot = field.getWarpedPosition(node.p0, warpedNode);

        this.dummyMatrix.makeTranslation(warpedNode.x, warpedNode.y, warpedNode.z);
        this.nodesMesh.setMatrixAt(idx, this.dummyMatrix);

        this.getCurvatureColor(pot, this.tempColor);
        nodeColors[idx * 3]     = this.tempColor.r;
        nodeColors[idx * 3 + 1] = this.tempColor.g;
        nodeColors[idx * 3 + 2] = this.tempColor.b;
      }

      this.nodesMesh.instanceMatrix.needsUpdate = true;
      nodeColorAttr.needsUpdate = true;
    }
  }

  /**
   * 将曲率势能映射为视觉渐变色（支持 经典冷暖、天体物理热力图、等势线波纹条纹）
   */
  getCurvatureColor(potential, outColor) {
    const t = Math.min(1.0, Math.max(0, potential));

    if (this.colorMode === 'turbo') {
      // 科研彩虹热力图 (Turbo): 蓝 -> 青 -> 绿 -> 黄 -> 橙 -> 红 -> 白
      if (t < 0.2) {
        outColor.setRGB(0.1, 0.2 + t * 3, 0.8);
      } else if (t < 0.45) {
        const f = (t - 0.2) / 0.25;
        outColor.setRGB(0.1 + f * 0.2, 0.8 + f * 0.2, 0.8 - f * 0.6);
      } else if (t < 0.7) {
        const f = (t - 0.45) / 0.25;
        outColor.setRGB(0.3 + f * 0.7, 1.0 - f * 0.1, 0.2 - f * 0.2);
      } else if (t < 0.9) {
        const f = (t - 0.7) / 0.2;
        outColor.setRGB(1.0, 0.9 - f * 0.6, 0.0);
      } else {
        const f = (t - 0.9) / 0.1;
        outColor.setRGB(1.0, 0.3 + f * 0.7, f);
      }
      return;
    }

    if (this.colorMode === 'contour') {
      // 等势线脉冲条纹 (Equipotential Isolines): 展现引力梯度等高线
      const bandPhase = Math.sin(t * 18.0);
      const bandIntensity = Math.pow(Math.abs(bandPhase), 5.0);

      if (bandIntensity > 0.4) {
        outColor.setRGB(0.2 + bandIntensity * 0.8, 0.95, 0.3 + bandIntensity * 0.7);
      } else {
        outColor.setRGB(0.06 + t * 0.15, 0.15 + t * 0.3, 0.5 + t * 0.2);
      }
      return;
    }

    // 默认 'classic' (参考图标志性配色: 外层深蓝 -> 水青 -> 核心亮翠绿 -> 白炽)
    if (t < 0.2) {
      const f = t / 0.2;
      outColor.copy(this.colorFar).lerp(this.colorMid, f);
    } else if (t < 0.6) {
      const f = (t - 0.2) / 0.4;
      outColor.copy(this.colorMid).lerp(this.colorNear, f);
    } else {
      const f = (t - 0.6) / 0.4;
      outColor.copy(this.colorNear).lerp(this.colorCore, f);
    }
  }

  setShowNodes(val) {
    this.showNodes = val;
    if (this.nodesMesh) {
      this.nodesMesh.visible = val;
    }
  }

  setNodeRadius(r) {
    this.nodeRadius = r;
    this.buildLattice();
  }

  setColorMode(mode) {
    this.colorMode = mode;
    this.update();
  }

  /**
   * 设置晶格维度密度 (如 4, 5, 6, 8)
   */
  setDimension(newDim) {
    if (newDim === this.dim) return;
    this.dim = newDim;
    this.buildLattice();
  }

  /**
   * 设置空间跨度总尺寸 (如 24, 36, 48, 60)
   */
  setSize(newSize) {
    if (newSize === this.size) return;
    this.size = newSize;
    this.buildLattice();
  }

  /**
   * 销毁资源
   */
  dispose() {
    if (this.linesMesh) {
      this.group.remove(this.linesMesh);
      this.linesMesh.geometry.dispose();
      this.linesMesh.material.dispose();
    }
    if (this.nodesMesh) {
      this.group.remove(this.nodesMesh);
      this.nodesMesh.geometry.dispose();
      this.nodesMesh.material.dispose();
    }
    this.scene.remove(this.group);
  }
}
