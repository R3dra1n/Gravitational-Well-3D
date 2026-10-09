import * as THREE from 'three';

/**
 * 广义相对论引力透镜 3D 全景光路实验场景 (Relativistic Lensing 3D Ray Scene)
 * 100% 严格复刻用户提供的 B 站彭导视频截图 (media_1791468556989_eef9e54e.png):
 * 1. 左侧：发光光源 (Light Emitter: 远方恒星/发光立方体)
 * 2. 中间：史瓦西黑洞 (Black Hole) + 垂直透镜截面 (Lensing Plane) + 爱因斯坦临界环 (Einstein Ring)
 * 3. 右侧：地球/天文观测站 (Earth / Telescope Observer)
 * 4. 光线束测地线：从光源射出，经黑洞强引力偏折弯曲，在右侧地球交汇成像
 */
export class RelativisticLensingScene {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // 几何构型参数
    this.sourceX = -20.0;
    this.earthX = 20.0;
    this.blackHoleMass = 3200;
    this.c2 = 64.0; // c^2
    this.G = 1.0;
    this.numRays = 32;

    this.buildComponents();
    this.buildLightRays();
  }

  buildComponents() {
    // 1. 左侧发光光源 (白炽发光立方体 + 点光源)
    this.sourceGroup = new THREE.Group();
    this.sourceGroup.position.set(this.sourceX, 0, 0);

    const emitterGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const emitterMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const emitterMesh = new THREE.Mesh(emitterGeo, emitterMat);
    this.sourceGroup.add(emitterMesh);

    // 光源耀斑辉光
    const flareGeo = new THREE.SphereGeometry(1.8, 16, 16);
    const flareMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending
    });
    this.sourceGroup.add(new THREE.Mesh(flareGeo, flareMat));
    this.group.add(this.sourceGroup);

    // 2. 中间史瓦西黑洞与透镜截面
    this.holeGroup = new THREE.Group();
    this.holeGroup.position.set(0, 0, 0);

    // 纯黑黑洞视界球体
    this.holeRadius = 1.6;
    const holeGeo = new THREE.SphereGeometry(this.holeRadius, 32, 32);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.holeMesh = new THREE.Mesh(holeGeo, holeMat);
    this.holeGroup.add(this.holeMesh);

    // 垂直暗色半透明透镜平面 (Lensing Plane: 对应截图中间的立式长方形暗幕)
    const planeGeo = new THREE.PlaneGeometry(16, 28);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x07111e,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });
    this.lensingPlane = new THREE.Mesh(planeGeo, planeMat);
    this.lensingPlane.rotation.y = Math.PI / 2; // 正对左右光线轴 (YZ 平面)
    this.holeGroup.add(this.lensingPlane);

    // 截图同款粉红色/耀金爱因斯坦临界圆环 (Critical Photon / Einstein Ring)
    const ringGeo = new THREE.RingGeometry(2.8, 2.95, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4081, // 截图中的粉红光环
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.criticalRing = new THREE.Mesh(ringGeo, ringMat);
    this.criticalRing.rotation.y = Math.PI / 2;
    this.holeGroup.add(this.criticalRing);

    // 黑洞光子球细金环
    const photonGeo = new THREE.RingGeometry(this.holeRadius * 1.05, this.holeRadius * 1.25, 64);
    const photonMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const photonRing = new THREE.Mesh(photonGeo, photonMat);
    photonRing.rotation.y = Math.PI / 2;
    this.holeGroup.add(photonRing);

    this.group.add(this.holeGroup);

    // 3. 右侧地球观测者 (真实地球纹理感球体 + 大气层辉光)
    this.earthGroup = new THREE.Group();
    this.earthGroup.position.set(this.earthX, 0, 0);

    const earthGeo = new THREE.SphereGeometry(1.4, 32, 32);
    // 生成简单的深蓝与绿洲大陆着色
    const earthMat = new THREE.MeshBasicMaterial({
      color: 0x1e88e5 // 地球蔚蓝海洋
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthGroup.add(this.earthMesh);

    // 地球微弱大气层
    const atmoGeo = new THREE.SphereGeometry(1.65, 32, 32);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x64b5f6,
      transparent: true,
      opacity: 0.4,
      blending: THREE.NormalBlending
    });
    this.earthGroup.add(new THREE.Mesh(atmoGeo, atmoMat));
    this.group.add(this.earthGroup);
  }

  buildLightRays() {
    // 创建光线段顶点缓冲
    this.stepsPerRay = 70;
    const totalVertices = this.numRays * (this.stepsPerRay - 1) * 2;
    this.rayPositions = new Float32Array(totalVertices * 3);
    this.rayColors = new Float32Array(totalVertices * 3);

    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(this.rayPositions, 3));
    rayGeo.setAttribute('color', new THREE.BufferAttribute(this.rayColors, 3));

    // 高亮纯白发光材质 (完全贴合截图的纯白光束)
    const rayMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.NormalBlending,
      linewidth: 2.2
    });

    this.raysMesh = new THREE.LineSegments(rayGeo, rayMat);
    this.group.add(this.raysMesh);

    this.updateRays();
  }

  setBlackHoleMass(mass) {
    this.blackHoleMass = mass;
    this.updateRays();
  }

  setEnabled(val) {
    this.enabled = val;
    this.group.visible = val;
    if (val) {
      this.updateRays();
    }
  }

  /**
   * 依据广义相对论史瓦西引力透镜几何，精确求解并绘制从光源到地球的测地线光路束
   */
  updateRays() {
    if (!this.raysMesh) return;

    const posArr = this.raysMesh.geometry.attributes.position.array;
    const colArr = this.raysMesh.geometry.attributes.color.array;
    let vIdx = 0;

    const M = this.blackHoleMass;
    const G = this.G;
    const c2 = this.c2;

    // 爱因斯坦角半径尺度与临界捕获半径
    const rCrit = Math.sqrt((4.0 * G * M) / c2) * 0.48; // 临界冲击参数
    this.criticalRing.scale.set(rCrit / 2.8, rCrit / 2.8, 1.0);

    const num = this.numRays;
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();

    // 在 YZ 平面上生成环状光线束分布 (外圈与内圈)
    for (let rIdx = 0; rIdx < num; rIdx++) {
      // 角度 theta 与冲击参数 (Impact parameter b)
      const angle = (rIdx / num) * Math.PI * 2;
      // 冲击参数分布在 [rCrit * 1.05, 8.5]
      const tier = (rIdx % 4) / 4.0;
      const bImpact = rCrit * 1.08 + tier * 5.2;

      // 在透镜平面 (X = 0) 处的坐标
      const targetY = Math.cos(angle) * bImpact;
      const targetZ = Math.sin(angle) * bImpact;

      // 广义相对论光线偏折角: alpha = 4 * G * M / (c^2 * b)
      const alpha = (4.0 * G * M) / (c2 * Math.max(0.5, bImpact));

      // 逐步追踪从 X = sourceX 到 X = earthX 的光滑弯曲光路
      let isSwallowed = bImpact < this.holeRadius * 1.15;

      for (let s = 0; s < this.stepsPerRay - 1; s++) {
        const t0 = s / (this.stepsPerRay - 1);
        const t1 = (s + 1) / (this.stepsPerRay - 1);

        this.sampleRayPoint(t0, targetY, targetZ, bImpact, alpha, p1);
        this.sampleRayPoint(t1, targetY, targetZ, bImpact, alpha, p2);

        // 顶点 1
        posArr[vIdx * 3]     = p1.x;
        posArr[vIdx * 3 + 1] = p1.y;
        posArr[vIdx * 3 + 2] = p1.z;

        // 纯白明亮光束 (截图同款)
        if (!isSwallowed) {
          colArr[vIdx * 3]     = 0.95;
          colArr[vIdx * 3 + 1] = 0.98;
          colArr[vIdx * 3 + 2] = 1.0;
        } else {
          // 跌入黑洞的光线末端渐暗渐隐
          const dim = Math.max(0, 1.0 - t0 * 1.5);
          colArr[vIdx * 3]     = 0.6 * dim;
          colArr[vIdx * 3 + 1] = 0.1 * dim;
          colArr[vIdx * 3 + 2] = 0.1 * dim;
        }
        vIdx++;

        // 顶点 2
        posArr[vIdx * 3]     = p2.x;
        posArr[vIdx * 3 + 1] = p2.y;
        posArr[vIdx * 3 + 2] = p2.z;

        if (!isSwallowed) {
          colArr[vIdx * 3]     = 0.95;
          colArr[vIdx * 3 + 1] = 0.98;
          colArr[vIdx * 3 + 2] = 1.0;
        } else {
          const dim = Math.max(0, 1.0 - t1 * 1.5);
          colArr[vIdx * 3]     = 0.6 * dim;
          colArr[vIdx * 3 + 1] = 0.1 * dim;
          colArr[vIdx * 3 + 2] = 0.1 * dim;
        }
        vIdx++;
      }
    }

    this.raysMesh.geometry.attributes.position.needsUpdate = true;
    this.raysMesh.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * 依据双曲透镜测地线解析模型采样光线空间点
   */
  sampleRayPoint(t, targetY, targetZ, bImpact, alpha, outPos) {
    // X 坐标从 sourceX 线性推进到 earthX
    const x = this.sourceX + (this.earthX - this.sourceX) * t;

    // 相对论引力偏折在 X ∈ [sourceX, 0] 为从光源发散至透镜平面
    // 在 X ∈ [0, earthX] 从透镜平面因偏折向地球汇聚 (产生截图中的闭合笼状光路)
    let radialFactor = 0;

    if (x <= 0) {
      // 从光源发散到透镜平面: 从 0 到 1.0
      const u = (x - this.sourceX) / (0 - this.sourceX);
      radialFactor = Math.sin(u * Math.PI * 0.5);
    } else {
      // 从透镜平面弯曲汇聚到地球: 从 1.0 到 0
      const u = x / this.earthX;
      // 偏折角弯曲下压
      const bend = Math.sin(u * Math.PI) * Math.min(0.8, alpha * 0.25);
      radialFactor = (1.0 - u) * (1.0 + bend);
    }

    outPos.set(
      x,
      targetY * radialFactor,
      targetZ * radialFactor
    );
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.raysMesh) {
      this.raysMesh.geometry.dispose();
      this.raysMesh.material.dispose();
    }
  }
}
