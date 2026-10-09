import * as THREE from 'three';

/**
 * 广义相对论爱因斯坦引力透镜全屏着色器 (Schwarzschild Gravitational Lensing)
 * 精确模拟人眼/天文望远镜在黑洞前看到的真实景象:
 * 1. 中心黑洞阴影 (Black Hole Shadow)
 * 2. 光子球金色狭窄光环 (Photon Ring)
 * 3. 爱因斯坦环 (Einstein Ring)
 * 4. 背景时空晶格与星空的相对论弧形弯曲与引力重影
 * 对应 B站彭导视频中 M87* / NASA 真实观测的黑洞光学效果
 */
export class GravitationalLensManager {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.enabled = false;

    // 创建全屏透镜渲染四边形
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lensScene = new THREE.Scene();

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec2 uResolution;
      uniform vec2 uHoleScreenPos;
      uniform float uEinsteinRadius;
      uniform float uShadowRadius;
      uniform vec2 uCameraOffset;
      varying vec2 vUv;

      // 绘制背景三维参考网格与深空星光
      vec3 getBackground(vec2 coord) {
        // 主时空坐标网格
        vec2 grid = abs(fract(coord * 5.0 - 0.5) - 0.5);
        float line = min(grid.x, grid.y);
        float gridIntensity = smoothstep(0.035, 0.0, line);

        // 次级细网格
        vec2 subGrid = abs(fract(coord * 20.0 - 0.5) - 0.5);
        float subLine = min(subGrid.x, subGrid.y);
        float subIntensity = smoothstep(0.03, 0.0, subLine);

        // 基础深空黑蓝背景
        vec3 col = vec3(0.005, 0.015, 0.04);

        // 细网格（微弱幽蓝）
        col += vec3(0.0, 0.22, 0.5) * subIntensity * 0.4;

        // 主网格线（电光青蓝，如同彭导视频中扭曲的参考坐标系）
        col += vec3(0.0, 0.65, 1.0) * gridIntensity * 0.9;

        // 背景细微星尘
        float stars = fract(sin(dot(floor(coord * 70.0), vec2(12.9898, 78.233))) * 43758.5453);
        if (stars > 0.982) {
          col += vec3(0.85, 0.95, 1.0) * (stars - 0.982) * 55.0;
        }

        return col;
      }

      void main() {
        // 归一化屏幕纵横比坐标
        vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
        vec2 center = uHoleScreenPos;

        vec2 delta = p - center;
        float r = length(delta);
        vec2 dir = r > 0.0001 ? normalize(delta) : vec2(1.0, 0.0);

        // 1. 黑洞纯黑视界阴影 (Black Hole Shadow: r < uShadowRadius)
        if (r < uShadowRadius) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // 2. 爱因斯坦光线引力透镜测地线偏折:
        // theta_source = theta - (theta_E^2 / theta)
        float deflection = (uEinsteinRadius * uEinsteinRadius) / max(0.001, r);
        vec2 bentCoord = center + dir * (r - deflection) + uCameraOffset;

        // 3. 采样背景被扭曲的星空与晶格
        vec3 color = getBackground(bentCoord);

        // 4. 紧邻黑洞边缘的光子球耀金光环 (Photon Sphere Ring)
        float photonDist = r - uShadowRadius;
        float photonRing = exp(-photonDist * 65.0) * 2.4;

        // 5. 爱因斯坦环位置的青蓝聚光微光 (Einstein Ring Glow)
        float ringDist = abs(r - uEinsteinRadius);
        float ringGlow = exp(-ringDist * 45.0) * 0.9;

        color += vec3(1.0, 0.8, 0.25) * photonRing;
        color += vec3(0.15, 0.75, 1.0) * ringGlow;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uHoleScreenPos: { value: new THREE.Vector2(0, 0) },
      uEinsteinRadius: { value: 0.22 },
      uShadowRadius: { value: 0.11 },
      uCameraOffset: { value: new THREE.Vector2(0, 0) }
    };

    const lensGeo = new THREE.PlaneGeometry(2, 2);
    this.lensMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false
    });

    const lensQuad = new THREE.Mesh(lensGeo, this.lensMat);
    this.lensScene.add(lensQuad);
  }

  resize(w, h) {
    this.uniforms.uResolution.value.set(w, h);
  }

  setEnabled(val) {
    this.enabled = val;
  }

  render(mainBody) {
    if (!this.enabled) return;

    // 1. 将中心天体在 3D 空间中的坐标投影到屏幕视口 2D 坐标
    const pos = mainBody ? mainBody.position.clone() : new THREE.Vector3(0, 0, 0);
    pos.project(this.camera);

    const aspect = window.innerWidth / window.innerHeight;
    this.uniforms.uHoleScreenPos.value.set((pos.x * 0.5) * aspect, pos.y * 0.5);

    // 2. 根据天体质量与距离计算爱因斯坦角半径与黑洞阴影半径
    const mass = mainBody ? mainBody.mass : 2500;
    // theta_E ~ sqrt(M)
    const einsteinR = Math.min(0.38, 0.08 + Math.sqrt(mass / 4500.0) * 0.22);
    this.uniforms.uEinsteinRadius.value = einsteinR;
    this.uniforms.uShadowRadius.value = einsteinR * 0.52;

    // 3. 关联摄像机视角角度，使旋转相机时背景星空与网格自然流动
    const spherical = new THREE.Spherical().setFromVector3(this.camera.position);
    this.uniforms.uCameraOffset.value.set(spherical.theta * 0.25, spherical.phi * 0.25);

    this.renderer.render(this.lensScene, this.orthoCamera);
  }
}
