import * as THREE from 'three';

/**
 * 网格导轨约束循线运动粒子 (Grid Rail Track Particle)
 * 严格满足需求: "当我把一个移动的物体放进去的时候，它会跟随这一个立方体结构的线上去进行移动。一定要沿着线移动。"
 * 1. 严格约束在弯曲空间晶格曲线上
 * 2. 瞬时加速度等于引力加速度在弯曲导轨切线方向的投影: a_tangent = F_gravity · Tangent
 * 3. 在网格交叉十字路口节点，智能评估引力坡度并顺从引力势阱变轨
 * 4. 自身具备引力质量，也会引起周围时空的微小凹陷
 */
export class TrackParticle {
  constructor(scene, gravityField, lattice, options = {}) {
    this.scene = scene;
    this.gravityField = gravityField;
    this.lattice = lattice;
    this.enabled = false;

    // 物理参数
    this.mass = options.mass !== undefined ? options.mass : 80;
    this.speed = 0;
    this.statusText = '未启用';

    // 导轨状态
    this.axis = 'X'; // 当前所在坐标轴线: 'X' | 'Y' | 'Z'
    this.idxA = Math.floor(lattice.dim / 2);
    this.idxB = Math.floor(lattice.dim / 2);
    const half = lattice.size / 2;
    this.t = -half + 1.0;
    this.railSpeed = 3.2;

    // 空间向量缓存
    this.worldPosition = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.tempP0 = new THREE.Vector3();
    this.tempP1 = new THREE.Vector3();
    this.tempW0 = new THREE.Vector3();
    this.tempW1 = new THREE.Vector3();
    this.tempAcc = new THREE.Vector3();

    // 拖尾轨迹
    this.trailMax = 100;
    this.trailHistory = [];

    this.createMesh();
  }

  createMesh() {
    this.group = new THREE.Group();
    this.group.visible = false;

    // 发光核心球体
    const sphereGeo = new THREE.SphereGeometry(0.48, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
    this.coreMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.group.add(this.coreMesh);

    // 外部发光小光环 (代表导轨滑块结构)
    const ringGeo = new THREE.TorusGeometry(0.65, 0.08, 12, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.85
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.group.add(this.ringMesh);

    // 拖尾线 (Trail)
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(this.trailMax * 3);
    const trailColors = new Float32Array(this.trailMax * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));

    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.NormalBlending,
      linewidth: 2.2
    });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
    this.trailLine.visible = false;
    this.scene.add(this.trailLine);

    this.scene.add(this.group);
  }

  spawn(initialSpeed = 3.5) {
    this.enabled = true;
    this.group.visible = true;
    this.trailLine.visible = true;

    this.axis = 'X';
    const n = this.lattice.dim;
    this.idxA = Math.floor(n / 2);
    this.idxB = Math.max(0, Math.floor(n / 2) - 1);
    this.t = -this.lattice.size / 2 + 0.5;
    this.railSpeed = initialSpeed;
    this.trailHistory = [];
    this.statusText = '沿着时空弯曲导轨受引力加速滑行中';

    this.update(0.016);
  }

  remove() {
    this.enabled = false;
    this.group.visible = false;
    this.trailLine.visible = false;
    this.trailHistory = [];
    this.statusText = '已移除';
  }

  setSpeed(v) {
    this.railSpeed = Math.sign(this.railSpeed || 1) * Math.max(0.5, v);
  }

  /**
   * 导轨物理步进
   */
  update(dt) {
    if (!this.enabled) return;

    const half = this.lattice.size / 2;

    // 1. 计算导轨在当前 t 位置处的 3D 弯曲切线向量与世界坐标
    this.computeTangent(this.t, this.tangent);
    this.getBasePosition(this.t, this.tempP0);
    this.gravityField.getWarpedPosition(this.tempP0, this.worldPosition);

    // 让滑块环朝向切线方向
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tangent);

    // 2. 计算当前受到的环境万有引力加速度
    this.gravityField.getGravitationalAcceleration(this.worldPosition, this.tempAcc);

    // 3. 将真实引力加速度投影到当前导轨切线: a_tangent = a · tangent
    const tangentialAcceleration = this.tempAcc.dot(this.tangent);

    // 4. 积分沿线切向速度与位移
    this.railSpeed += tangentialAcceleration * dt;
    // 阻尼极低 (0.999)，主要受引力势能自然驱动加速与减速
    this.railSpeed *= 0.9995;
    this.t += this.railSpeed * dt;
    this.speed = Math.abs(this.railSpeed);

    // 5. 边界处理：到达立方体边界时自然反弹或转入边缘导轨，永远留在网格线上
    if (this.t > half) {
      this.t = half;
      this.railSpeed = -Math.abs(this.railSpeed);
    } else if (this.t < -half) {
      this.t = -half;
      this.railSpeed = Math.abs(this.railSpeed);
    }

    // 6. 十字路口（节点）顺应引力坡度智能变轨
    this.checkNodeBranching();

    // 7. 同步视觉位置与拖尾
    this.syncVisuals();
  }

  getBasePosition(t, outVec) {
    const coords = this.lattice.coords;
    if (!coords || coords.length === 0) {
      outVec.set(t, 0, 0);
      return;
    }
    const n = coords.length;
    const safeA = Math.min(n - 1, Math.max(0, this.idxA));
    const safeB = Math.min(n - 1, Math.max(0, this.idxB));

    if (this.axis === 'X') {
      outVec.set(t, coords[safeA], coords[safeB]);
    } else if (this.axis === 'Y') {
      outVec.set(coords[safeA], t, coords[safeB]);
    } else {
      outVec.set(coords[safeA], coords[safeB], t);
    }
  }

  computeTangent(t, outTangent) {
    const delta = 0.05;
    this.getBasePosition(t - delta, this.tempP0);
    this.getBasePosition(t + delta, this.tempP1);

    this.gravityField.getWarpedPosition(this.tempP0, this.tempW0);
    this.gravityField.getWarpedPosition(this.tempP1, this.tempW1);

    outTangent.subVectors(this.tempW1, this.tempW0).normalize();
  }

  checkNodeBranching() {
    const coords = this.lattice.coords;
    if (!coords || coords.length === 0) return;
    const n = coords.length;
    const threshold = 0.22;

    for (let k = 0; k < n; k++) {
      const nodeCoord = coords[k];
      if (Math.abs(this.t - nodeCoord) < threshold) {
        // 在十字路口节点：评估不同方向上的引力加速度分量
        // 如果垂直方向的引力加速度显著大于当前前进方向，顺着引力更强的分支变轨！
        if (this.axis === 'X') {
          if (Math.abs(this.tempAcc.y) > Math.abs(this.tempAcc.x) * 1.3 && Math.random() < 0.2) {
            this.axis = 'Y';
            this.t = coords[this.idxA];
            this.idxA = k;
            this.railSpeed = Math.sign(this.tempAcc.y) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          } else if (Math.abs(this.tempAcc.z) > Math.abs(this.tempAcc.x) * 1.3 && Math.random() < 0.2) {
            this.axis = 'Z';
            this.t = coords[this.idxB];
            this.idxB = k;
            this.railSpeed = Math.sign(this.tempAcc.z) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          }
        } else if (this.axis === 'Y') {
          if (Math.abs(this.tempAcc.x) > Math.abs(this.tempAcc.y) * 1.3 && Math.random() < 0.2) {
            this.axis = 'X';
            this.t = coords[this.idxA];
            this.idxA = k;
            this.railSpeed = Math.sign(this.tempAcc.x) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          } else if (Math.abs(this.tempAcc.z) > Math.abs(this.tempAcc.y) * 1.3 && Math.random() < 0.2) {
            this.axis = 'Z';
            this.t = coords[this.idxB];
            this.idxB = k;
            this.railSpeed = Math.sign(this.tempAcc.z) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          }
        } else if (this.axis === 'Z') {
          if (Math.abs(this.tempAcc.x) > Math.abs(this.tempAcc.z) * 1.3 && Math.random() < 0.2) {
            this.axis = 'X';
            this.t = coords[this.idxA];
            this.idxA = k;
            this.railSpeed = Math.sign(this.tempAcc.x) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          } else if (Math.abs(this.tempAcc.y) > Math.abs(this.tempAcc.z) * 1.3 && Math.random() < 0.2) {
            this.axis = 'Y';
            this.t = coords[this.idxB];
            this.idxB = k;
            this.railSpeed = Math.sign(this.tempAcc.y) * Math.max(1.8, Math.abs(this.railSpeed));
            break;
          }
        }
      }
    }
  }

  syncVisuals() {
    this.group.position.copy(this.worldPosition);

    // 拖尾记录
    this.trailHistory.push(this.worldPosition.clone());
    if (this.trailHistory.length > this.trailMax) {
      this.trailHistory.shift();
    }

    const posAttr = this.trailLine.geometry.attributes.position;
    const colAttr = this.trailLine.geometry.attributes.color;
    const posArr = posAttr.array;
    const colArr = colAttr.array;
    const count = this.trailHistory.length;

    for (let i = 0; i < this.trailMax; i++) {
      if (i < count) {
        const p = this.trailHistory[count - 1 - i];
        posArr[i * 3]     = p.x;
        posArr[i * 3 + 1] = p.y;
        posArr[i * 3 + 2] = p.z;

        const alpha = Math.max(0, 1.0 - i / this.trailMax);
        colArr[i * 3]     = 1.0 * alpha;
        colArr[i * 3 + 1] = 0.9 * alpha;
        colArr[i * 3 + 2] = 0.2 * alpha;
      } else {
        posArr[i * 3]     = this.worldPosition.x;
        posArr[i * 3 + 1] = this.worldPosition.y;
        posArr[i * 3 + 2] = this.worldPosition.z;
        colArr[i * 3]     = 0;
        colArr[i * 3 + 1] = 0;
        colArr[i * 3 + 2] = 0;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.trailLine);
    this.trailLine.geometry.dispose();
    this.trailLine.material.dispose();
  }
}
