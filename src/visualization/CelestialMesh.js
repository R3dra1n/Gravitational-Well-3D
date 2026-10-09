import * as THREE from 'three';

export class CelestialMeshManager {
  constructor(scene, gravityField) {
    this.scene = scene;
    this.gravityField = gravityField;
    this.meshesMap = new Map(); // id -> THREE.Group
    this.trailsMap = new Map(); // id -> THREE.Line
  }

  syncBodies() {
    const bodies = this.gravityField.bodies;
    const currentIds = new Set();

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      currentIds.add(b.id);

      if (!this.meshesMap.has(b.id)) {
        this.createBodyMesh(b);
      } else {
        this.updateBodyMesh(b);
      }

      this.updateBodyTrail(b);
    }

    // 清理已删除的天体
    for (const [id, group] of this.meshesMap.entries()) {
      if (!currentIds.has(id)) {
        this.scene.remove(group);
        this.disposeGroup(group);
        this.meshesMap.delete(id);

        const trail = this.trailsMap.get(id);
        if (trail) {
          this.scene.remove(trail);
          trail.geometry.dispose();
          trail.material.dispose();
          this.trailsMap.delete(id);
        }
      }
    }
  }

  createBodyMesh(body) {
    const group = new THREE.Group();
    group.name = body.id;
    group.userData = { bodyId: body.id, isCelestial: true };

    if (body.isBlackHole) {
      // 黑洞视界：纯黑致密球体
      const holeGeo = new THREE.SphereGeometry(body.radius, 32, 32);
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      group.add(new THREE.Mesh(holeGeo, holeMat));

      // 紧贴光子球的金色细环 (Photon Sphere Ring: r = 1.5 rs)
      const ringGeo = new THREE.RingGeometry(body.radius * 1.1, body.radius * 1.6, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffbb00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.5;
      group.add(ringMesh);
    } else {
      // 纯净发光天体（绝无任何多余的假塑料膜，致密紧凑）
      const coreGeo = new THREE.SphereGeometry(body.radius, 32, 32);
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(body.color)
      });
      group.add(new THREE.Mesh(coreGeo, coreMat));
    }

    // 微弱柔和的点光源（亮度适中，绝不致盲）
    const pointLight = new THREE.PointLight(new THREE.Color(body.color), 1.2, 16);
    group.add(pointLight);

    group.position.copy(body.position);
    this.scene.add(group);
    this.meshesMap.set(body.id, group);

    // 独立轨迹线
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(body.maxTrail * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(body.color),
      transparent: true,
      opacity: 0.65,
      linewidth: 1.5
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    this.scene.add(trailLine);
    this.trailsMap.set(body.id, trailLine);
  }

  updateBodyMesh(body) {
    const group = this.meshesMap.get(body.id);
    if (!group) return;

    group.position.copy(body.position);
    // 天体尺寸恒定紧凑（保持在 1.0 左右），严禁随质量无限放大！
    group.scale.set(1.0, 1.0, 1.0);
  }

  updateBodyTrail(body) {
    const trailLine = this.trailsMap.get(body.id);
    if (!trailLine || !body.trail) return;

    const posAttr = trailLine.geometry.attributes.position;
    const posArr = posAttr.array;
    const history = body.trail;
    const count = history.length;

    for (let i = 0; i < body.maxTrail; i++) {
      if (i < count) {
        const p = history[count - 1 - i];
        posArr[i * 3]     = p.x;
        posArr[i * 3 + 1] = p.y;
        posArr[i * 3 + 2] = p.z;
      } else {
        posArr[i * 3]     = body.position.x;
        posArr[i * 3 + 1] = body.position.y;
        posArr[i * 3 + 2] = body.position.z;
      }
    }
    posAttr.needsUpdate = true;
  }

  getGroup(bodyId) {
    return this.meshesMap.get(bodyId);
  }

  disposeGroup(group) {
    group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
