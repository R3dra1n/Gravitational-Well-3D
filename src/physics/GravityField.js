import * as THREE from 'three';

export class GravityField {
  constructor() {
    this.G = 1.0;                 // 引力常数
    this.c = 8.0;                 // 模拟光速
    this.softening = 0.6;         // 软化因子
    this.warpStrength = 1.0;      // 形变系数
    this.bodies = [];             // 统一天体列表
    this.isPaused = false;        // 暂停状态
    this.timeScale = 1.0;         // 时间流速
  }

  /**
   * 添加天体引力源
   */
  addBody(config = {}) {
    const id = config.id || `body_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const mass = config.mass !== undefined ? config.mass : 1200;
    const isFixed = config.isFixed !== undefined ? config.isFixed : false;

    // 天体视觉半径保持紧凑恒定（0.8 ~ 1.1），坚决防止质量大时膨胀成遮蔽整个网格的巨大气球！
    const radius = config.radius !== undefined ? config.radius : 0.95;
    const color = config.color || (mass > 800 ? '#ffffff' : (mass > 200 ? '#00e5ff' : '#ffcc00'));

    const body = {
      id,
      name: config.name || (this.bodies.length === 0 ? '中心引力天体 (α星)' : `伴生天体 ${this.bodies.length}`),
      mass,
      position: config.position ? config.position.clone() : new THREE.Vector3(),
      velocity: config.velocity ? config.velocity.clone() : new THREE.Vector3(),
      acceleration: new THREE.Vector3(),
      isFixed,
      radius,
      color,
      isBlackHole: config.isBlackHole || false,
      trail: [],
      maxTrail: 100
    };

    this.bodies.push(body);
    return body;
  }

  removeBody(id) {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx !== -1) {
      this.bodies.splice(idx, 1);
      return true;
    }
    return false;
  }

  getBody(id) {
    return this.bodies.find(b => b.id === id);
  }

  clearAllExceptFirst() {
    if (this.bodies.length > 1) {
      this.bodies.splice(1);
    }
  }

  /**
   * N 体真实万有引力动力学模拟更新 (Velocity-Verlet 辛积分)
   */
  updatePhysics(dt) {
    if (this.isPaused) return;
    const effectiveDt = dt * this.timeScale;
    const n = this.bodies.length;
    if (n === 0) return;

    // 1. 计算 a(t)
    const accs = [];
    for (let i = 0; i < n; i++) accs.push(new THREE.Vector3());
    this.computeAllAccelerations(accs);

    // 2. 位置更新 x(t + dt) = x(t) + v(t)*dt + 0.5*a(t)*dt^2
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      if (b.isFixed) continue;

      b.position.x += b.velocity.x * effectiveDt + 0.5 * accs[i].x * effectiveDt * effectiveDt;
      b.position.y += b.velocity.y * effectiveDt + 0.5 * accs[i].y * effectiveDt * effectiveDt;
      b.position.z += b.velocity.z * effectiveDt + 0.5 * accs[i].z * effectiveDt * effectiveDt;

      b.trail.push(b.position.clone());
      if (b.trail.length > b.maxTrail) b.trail.shift();
    }

    // 3. 计算 a(t + dt)
    const newAccs = [];
    for (let i = 0; i < n; i++) newAccs.push(new THREE.Vector3());
    this.computeAllAccelerations(newAccs);

    // 4. 速度更新 v(t + dt) = v(t) + 0.5*(a(t) + a(t + dt))*dt
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      if (b.isFixed) continue;

      b.velocity.x += 0.5 * (accs[i].x + newAccs[i].x) * effectiveDt;
      b.velocity.y += 0.5 * (accs[i].y + newAccs[i].y) * effectiveDt;
      b.velocity.z += 0.5 * (accs[i].z + newAccs[i].z) * effectiveDt;
      b.acceleration.copy(newAccs[i]);
    }

    // 5. 碰撞合并检测
    this.handleMergers();
  }

  computeAllAccelerations(outAccs) {
    const n = this.bodies.length;
    const eps2 = this.softening * this.softening;

    for (let i = 0; i < n; i++) {
      const b1 = this.bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b2 = this.bodies[j];
        if (b1.mass <= 0 && b2.mass <= 0) continue;

        const rx = b2.position.x - b1.position.x;
        const ry = b2.position.y - b1.position.y;
        const rz = b2.position.z - b1.position.z;
        const distSq = rx * rx + ry * ry + rz * rz + eps2;
        const dist = Math.sqrt(distSq);

        const fMag = (this.G * b1.mass * b2.mass) / distSq;
        const fx = (fMag * rx) / dist;
        const fy = (fMag * ry) / dist;
        const fz = (fMag * rz) / dist;

        if (!b1.isFixed && b1.mass > 0) {
          outAccs[i].x += fx / b1.mass;
          outAccs[i].y += fy / b1.mass;
          outAccs[i].z += fz / b1.mass;
        }

        if (!b2.isFixed && b2.mass > 0) {
          outAccs[j].x -= fx / b2.mass;
          outAccs[j].y -= fy / b2.mass;
          outAccs[j].z -= fz / b2.mass;
        }
      }
    }
  }

  handleMergers() {
    for (let i = 0; i < this.bodies.length; i++) {
      const b1 = this.bodies[i];
      for (let j = i + 1; j < this.bodies.length; j++) {
        const b2 = this.bodies[j];
        const dist = b1.position.distanceTo(b2.position);
        if (dist < (b1.radius + b2.radius) * 0.9) {
          const [primary, secondary] = b1.mass >= b2.mass ? [b1, b2] : [b2, b1];
          if (!primary.isFixed) {
            const totalMass = primary.mass + secondary.mass;
            primary.velocity.multiplyScalar(primary.mass)
              .addScaledVector(secondary.velocity, secondary.mass)
              .divideScalar(totalMass);
          }
          primary.mass += secondary.mass;
          this.removeBody(secondary.id);
          return;
        }
      }
    }
  }

  /**
   * 空间中任意一点 P0 的平滑重力空间弯曲与曲率计算
   * 采用经典引力收缩核函数，确保：
   * 1. 质量越大，形变越显著向内汇聚（完美对标参考图中的优美向心内敛腰线）；
   * 2. 节点绝对不会穿透中心或反向膨胀；
   * 3. 势能通过 tanh 平滑映射，无论质量多大，绝对不会整片网格爆亮发白！
   */
  getWarpedPosition(p0, outWarped) {
    outWarped.copy(p0);

    let totalPotential = 0;
    let dispX = 0;
    let dispY = 0;
    let dispZ = 0;

    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.mass <= 0) continue;

      const rx = p0.x - b.position.x;
      const ry = p0.y - b.position.y;
      const rz = p0.z - b.position.z;
      const d = Math.sqrt(rx * rx + ry * ry + rz * rz);

      if (d < 0.0001) continue;

      // 势能积累 Phi = G * M / (d + eps)
      const pot = (this.G * b.mass) / (d + this.softening);
      totalPotential += pot;

      // 引力特征曲率尺度: rChar 随质量平滑递增
      // M = 200 => rChar ≈ 2.0; M = 2000 => rChar ≈ 6.3; M = 4500 => rChar ≈ 9.5
      const rChar = Math.sqrt(b.mass / 50.0) * this.warpStrength;

      // 向心空间收缩比例 f(d): 永远平滑在 [0, 0.78] 之间，渐进收拢，绝不发散或突变！
      const pullFraction = 0.78 * (rChar * rChar) / (d * d + rChar * rChar + 1.2);

      dispX -= (rx / d) * (d * pullFraction);
      dispY -= (ry / d) * (d * pullFraction);
      dispZ -= (rz / d) * (d * pullFraction);
    }

    outWarped.x += dispX;
    outWarped.y += dispY;
    outWarped.z += dispZ;

    // 返回经过 tanh 归一化的平滑势能，永远在 [0.0, 1.0) 之间，彻底根除高质时的全屏过曝爆亮！
    const normalizedPotential = Math.tanh(totalPotential / 350.0);
    return normalizedPotential;
  }

  /**
   * 计算任意空间坐标点所受到的万有引力加速度矢量 a = sum(G * M * r_vec / dist^3)
   */
  getGravitationalAcceleration(pos, outAcc) {
    outAcc.set(0, 0, 0);
    const eps2 = this.softening * this.softening;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.mass <= 0 || b.isParticle) continue;

      const rx = b.position.x - pos.x;
      const ry = b.position.y - pos.y;
      const rz = b.position.z - pos.z;
      const distSq = rx * rx + ry * ry + rz * rz + eps2;
      const dist = Math.sqrt(distSq);

      const fMag = (this.G * b.mass) / distSq;
      outAcc.x += (fMag * rx) / dist;
      outAcc.y += (fMag * ry) / dist;
      outAcc.z += (fMag * rz) / dist;
    }
  }
}
