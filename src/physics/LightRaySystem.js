import * as THREE from 'three';

/**
 * 广义相对论光线测地线偏折模拟系统 (Light Geodesic Ray Tracing)
 * 模拟光线在史瓦西时空中的弯曲、引力透镜偏折以及被黑洞光子球吞噬
 * 对应爱因斯坦光线偏折角公式: Δθ = 4GM / (c^2 * b)
 */
export class LightRaySystem {
  constructor(scene, gravityField) {
    this.scene = scene;
    this.gravityField = gravityField;
    this.enabled = false;

    this.numRays = 40;           // 光线束数量
    this.stepsPerRay = 90;       // 每条光线的测地线积分步数
    this.stepSize = 0.45;        // 步长
    this.raySpeed = 8.0;         // 光速 c

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.linesMesh = null;
    this.positions = null;
    this.colors = null;

    this.tempPos = new THREE.Vector3();
    this.tempDir = new THREE.Vector3();
    this.tempAcc = new THREE.Vector3();

    this.buildMesh();
  }

  buildMesh() {
    const totalVertices = this.numRays * (this.stepsPerRay - 1) * 2;
    this.positions = new Float32Array(totalVertices * 3);
    this.colors = new Float32Array(totalVertices * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      linewidth: 2.0
    });

    this.linesMesh = new THREE.LineSegments(geo, mat);
    this.group.add(this.linesMesh);
  }

  setEnabled(val) {
    this.enabled = val;
    this.group.visible = val;
    if (val) this.update();
  }

  /**
   * 依据广义相对论零测地线 (Null Geodesic) 实时追踪光线偏折轨迹
   */
  update() {
    if (!this.enabled || !this.linesMesh) return;

    const posArr = this.linesMesh.geometry.attributes.position.array;
    const colArr = this.linesMesh.geometry.attributes.color.array;
    let vIdx = 0;

    const bodies = this.gravityField.bodies;
    const G = this.gravityField.G;
    const c2 = this.gravityField.c * this.gravityField.c;

    // 光线源发射阵列：从左侧 X = -14 平行射向右侧 X = +14
    const raySpacing = 20.0 / (this.numRays - 1);
    const startZ = -10.0;

    for (let i = 0; i < this.numRays; i++) {
      // 初始光线位置
      const zOffset = startZ + i * raySpacing;
      this.tempPos.set(-14.0, 0, zOffset);
      // 初始光速方向矢量 (沿 +X 轴传播)
      this.tempDir.set(1.0, 0, 0).normalize();

      let isSwallowed = false;

      for (let s = 0; s < this.stepsPerRay - 1; s++) {
        const p1x = this.tempPos.x;
        const p1y = this.tempPos.y;
        const p1z = this.tempPos.z;

        if (!isSwallowed) {
          // 计算各天体对光线的广义相对论测地线加速度偏折:
          // a_light = sum - (2 * G * M / r^3) * [ r - (r · dir) * dir ]
          this.tempAcc.set(0, 0, 0);

          for (let bIdx = 0; bIdx < bodies.length; bIdx++) {
            const b = bodies[bIdx];
            const rx = b.position.x - this.tempPos.x;
            const ry = b.position.y - this.tempPos.y;
            const rz = b.position.z - this.tempPos.z;
            const r2 = rx * rx + ry * ry + rz * rz;
            const r = Math.sqrt(r2);

            if (r < b.radius * 0.9) {
              // 光线跌入黑洞/天体视界内部，被完全吞噬！
              isSwallowed = true;
              break;
            }

            // 爱因斯坦相对论偏折力 (垂直于光线方向的分量)
            const dot = rx * this.tempDir.x + ry * this.tempDir.y + rz * this.tempDir.z;
            const perpX = rx - dot * this.tempDir.x;
            const perpY = ry - dot * this.tempDir.y;
            const perpZ = rz - dot * this.tempDir.z;

            // 相对论偏折系数: 4GM / (c^2 * r^2)
            const factor = (4.0 * G * b.mass) / (c2 * Math.pow(r2 + 0.5, 1.25));
            this.tempAcc.x += perpX * factor;
            this.tempAcc.y += perpY * factor;
            this.tempAcc.z += perpZ * factor;
          }

          // 光线方向受偏折并重新归一化 (光速恒为 c)
          this.tempDir.addScaledVector(this.tempAcc, this.stepSize).normalize();
          this.tempPos.addScaledVector(this.tempDir, this.stepSize);
        }

        const p2x = this.tempPos.x;
        const p2y = this.tempPos.y;
        const p2z = this.tempPos.z;

        // 顶点 1
        posArr[vIdx * 3]     = p1x;
        posArr[vIdx * 3 + 1] = p1y;
        posArr[vIdx * 3 + 2] = p1z;
        // 激光色彩：未被吞噬为亮青色/金黄激光，跌入视界后变为暗红渐隐
        if (!isSwallowed) {
          colArr[vIdx * 3]     = 0.2;
          colArr[vIdx * 3 + 1] = 0.95;
          colArr[vIdx * 3 + 2] = 1.0;
        } else {
          colArr[vIdx * 3]     = 0.6;
          colArr[vIdx * 3 + 1] = 0.05;
          colArr[vIdx * 3 + 2] = 0.05;
        }
        vIdx++;

        // 顶点 2
        posArr[vIdx * 3]     = p2x;
        posArr[vIdx * 3 + 1] = p2y;
        posArr[vIdx * 3 + 2] = p2z;
        if (!isSwallowed) {
          colArr[vIdx * 3]     = 0.2;
          colArr[vIdx * 3 + 1] = 0.95;
          colArr[vIdx * 3 + 2] = 1.0;
        } else {
          colArr[vIdx * 3]     = 0.2;
          colArr[vIdx * 3 + 1] = 0.0;
          colArr[vIdx * 3 + 2] = 0.0;
        }
        vIdx++;
      }
    }

    this.linesMesh.geometry.attributes.position.needsUpdate = true;
    this.linesMesh.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    if (this.linesMesh) {
      this.group.remove(this.linesMesh);
      this.linesMesh.geometry.dispose();
      this.linesMesh.material.dispose();
    }
    this.scene.remove(this.group);
  }
}
