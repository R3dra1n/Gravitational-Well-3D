import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * Gravitational Well 3D
 * Multi-Body Spacetime Topology Simulation
 * Based on rafaehlers/Gravitational-Well-3D + Added 3D Interactive Sphere Movement & Dynamics
 */

// 常量配置
const DEFAULT_DIVS = 20;
const MAX_DIVS = 60;
const CUBE_SIZE = 100;
const HALF = CUBE_SIZE / 2;
const INITIAL_RADIUS = 5;
const MAX_RADIUS = CUBE_SIZE * 0.3; // 30
const MAX_MASSES = 8;
const TRAIL_LENGTH = 40;

const MASS_COLORS = [0xF39C12, 0xE74C3C, 0x3498DB, 0x9B59B6, 0x2ECC71, 0x1ABC9C, 0xE67E22, 0x00E5FF];

// 1. 初始化 Three.js 场景与渲染器
const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(140, 120, 140);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 2. 环境光与定向光
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(1, 2, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

// 3. 深空星场背景 (Starfield)
const starCount = 2000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  starPos[i] = (Math.random() - 0.5) * 1000;
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

let isDiagonalsEnabled = false;

// 4. 构建三维立方体网格几何体
function buildCubeGridGeometry(divs, half = HALF, includeDiagonals = isDiagonalsEnabled) {
  const LINE_SUBDIV = 10;
  const MAX_SAMPLES_ALONG = 200;
  const segments = [];
  const min = -half;
  const max = half;

  const samples = Math.min(MAX_SAMPLES_ALONG, Math.max(2, Math.floor(divs * LINE_SUBDIV)));
  const stepAxis = (max - min) / divs;
  const stepAlong = (max - min) / samples;

  // X 方向平行线
  for (let yi = 0; yi <= divs; yi++) {
    const y = min + yi * stepAxis;
    for (let zi = 0; zi <= divs; zi++) {
      const z = min + zi * stepAxis;
      for (let si = 0; si < samples; si++) {
        const x0 = min + si * stepAlong;
        const x1 = min + (si + 1) * stepAlong;
        segments.push(x0, y, z, x1, y, z);
      }
    }
  }

  // Y 方向平行线
  for (let xi = 0; xi <= divs; xi++) {
    const x = min + xi * stepAxis;
    for (let zi = 0; zi <= divs; zi++) {
      const z = min + zi * stepAxis;
      for (let si = 0; si < samples; si++) {
        const y0 = min + si * stepAlong;
        const y1 = min + (si + 1) * stepAlong;
        segments.push(x, y0, z, x, y1, z);
      }
    }
  }

  // Z 方向平行线
  for (let xi = 0; xi <= divs; xi++) {
    const x = min + xi * stepAxis;
    for (let yi = 0; yi <= divs; yi++) {
      const y = min + yi * stepAxis;
      for (let si = 0; si < samples; si++) {
        const z0 = min + si * stepAlong;
        const z1 = min + (si + 1) * stepAlong;
        segments.push(x, y, z0, x, y, z1);
      }
    }
  }

  // 空间 45° 对角交叉线 (突破 X, Y, Z 三轴单一性，呈现全方位立体编织网格)
  if (includeDiagonals) {
    const DIAG_SUBDIV = 6;
    const diagStepAlong = stepAxis / DIAG_SUBDIV;
    const skip = Math.max(1, Math.floor(divs / 12));
    for (let xi = 0; xi < divs; xi += skip) {
      const x0 = min + xi * stepAxis;
      for (let yi = 0; yi < divs; yi += skip) {
        const y0 = min + yi * stepAxis;
        for (let zi = 0; zi < divs; zi += skip) {
          const z0 = min + zi * stepAxis;
          for (let s = 0; s < DIAG_SUBDIV; s++) {
            const d1 = s * diagStepAlong;
            const d2 = (s + 1) * diagStepAlong;
            segments.push(
              x0 + d1, y0 + d1, z0 + d1,
              x0 + d2, y0 + d2, z0 + d2
            );
            segments.push(
              x0 + d1, y0 + stepAxis - d1, z0 + d1,
              x0 + d2, y0 + stepAxis - d2, z0 + d2
            );
          }
        }
      }
    }
  }

  const positions = new Float32Array(segments);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("position0", new THREE.BufferAttribute(positions.slice(), 3));
  return geometry;
}

// 4.1 构建 360° 全方位球极时空网格几何体 (Concentric Shells + Radial Geodesics)
function buildSphericalGridGeometry(divs, half = currentHalf) {
  const segments = [];
  const maxR = half;
  const numShells = Math.max(4, Math.min(14, Math.floor(divs * 0.4) + 3));
  const radialSegments = Math.max(16, Math.min(48, divs * 2));
  const ringsPerShell = Math.max(8, Math.min(24, Math.floor(divs * 0.85)));

  // 1. 同心球壳网格 (Concentric Spherical Shells - 代表 360° 引力等势面)
  for (let s = 1; s <= numShells; s++) {
    const r = (s / numShells) * maxR;

    // 纬度圆环 (Latitude rings)
    for (let lat = 1; lat < ringsPerShell; lat++) {
      const phi = (lat / ringsPerShell) * Math.PI;
      const ringY = r * Math.cos(phi);
      const ringR = r * Math.sin(phi);

      for (let lon = 0; lon < radialSegments; lon++) {
        const theta1 = (lon / radialSegments) * Math.PI * 2;
        const theta2 = ((lon + 1) / radialSegments) * Math.PI * 2;
        segments.push(
          ringR * Math.cos(theta1), ringY, ringR * Math.sin(theta1),
          ringR * Math.cos(theta2), ringY, ringR * Math.sin(theta2)
        );
      }
    }

    // 经度半圆线 (Longitude meridians)
    const meridianCount = Math.max(6, Math.min(24, Math.floor(radialSegments / 2)));
    const SUBDIV_MERIDIAN = 24;
    for (let m = 0; m < meridianCount; m++) {
      const theta = (m / meridianCount) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      for (let k = 0; k < SUBDIV_MERIDIAN; k++) {
        const phi1 = (k / SUBDIV_MERIDIAN) * Math.PI;
        const phi2 = ((k + 1) / SUBDIV_MERIDIAN) * Math.PI;
        segments.push(
          r * Math.sin(phi1) * cosT, r * Math.cos(phi1), r * Math.sin(phi1) * sinT,
          r * Math.sin(phi2) * cosT, r * Math.cos(phi2), r * Math.sin(phi2) * sinT
        );
      }
    }
  }

  // 2. 360° 全向径向辐射线 (Radial Geodesic Rays - 空间测地线引力流)
  const rayRings = Math.max(4, Math.min(10, Math.floor(divs * 0.35)));
  const rayCols = Math.max(8, Math.min(20, Math.floor(divs * 0.6)));
  const RAY_SAMPLES = 30;
  for (let i = 1; i < rayRings; i++) {
    const phi = (i / rayRings) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let j = 0; j < rayCols; j++) {
      const theta = (j / rayCols) * Math.PI * 2;
      const dirX = sinPhi * Math.cos(theta);
      const dirY = cosPhi;
      const dirZ = sinPhi * Math.sin(theta);

      for (let s = 0; s < RAY_SAMPLES; s++) {
        const r1 = (s / RAY_SAMPLES) * maxR;
        const r2 = ((s + 1) / RAY_SAMPLES) * maxR;
        segments.push(
          dirX * r1, dirY * r1, dirZ * r1,
          dirX * r2, dirY * r2, dirZ * r2
        );
      }
    }
  }

  const positions = new Float32Array(segments);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("position0", new THREE.BufferAttribute(positions.slice(), 3));
  return geometry;
}

// 5. 广义相对论时空曲率着色器 (GLSL)
const gridVertexShader = /* glsl */`
  attribute vec3 position0;
  uniform float uMassRadii[${MAX_MASSES}];
  uniform float uMassValues[${MAX_MASSES}];
  uniform vec3  uMassCenters[${MAX_MASSES}];
  uniform int   uMassCount;
  uniform float uTime;
  uniform float uWaveAmp;
  
  uniform float uGravScale; // 全局引力尺度
  uniform float uMinR;      // 最小截断半径
  uniform float uDeform;    // 0=未形变, 1=形变
  uniform float uHalf;      // 立方体半尺寸
  uniform float uEpsSurf;   // 表面平滑度
  uniform float uWellMul;   // 引力势阱倍率
  uniform float uPenetrateCore; // 1.0=汇入球心内部, 0.0=贴在球体表面
  varying float vDist;
  varying float vPotential;

  void main() {
    vec3 p = position0;
    vec3 totalDisplacement = vec3(0.0);
    float minDist = 1000.0;
    float totalPot = 0.0;
    for (int i = 0; i < ${MAX_MASSES}; i++) {
      if (i >= uMassCount) break;
      
      vec3 center = uMassCenters[i];
      float sphereR = uMassRadii[i];
      float mass = uMassValues[i];
      
      vec3 toCenter = center - p;
      float r = length(toCenter);
      minDist = min(minDist, r);
      float safeR = max(r, uMinR);

      // 广义相对论引力势能叠加计算 (连续各向同性物理标量，天然呈现 360° 球对称)
      totalPot += (mass * uWellMul) / safeR;

      // 广义相对论球对称引力势阱：深度直接由天体物理质量 mass 严格决定
      float base = (uGravScale * mass * mass * 0.04) / (safeR * safeR);
      base = base / (1.0 + base * 0.85);

      // 远距离平滑衰减
      float farFalloff = 1.0 / (1.0 + 0.012 * safeR);
      base *= farFalloff;

      // 防止网格穿透天体内部 vs 汇入球心内部
      float inside = step(r, sphereR);
      // 当 uPenetrateCore == 1.0 时，不做表面约束，允许线条平滑收缩汇入质心
      float clampToSurface = mix(mix(1.0, sphereR / safeR, inside), 1.0, uPenetrateCore);

      vec3 dir = (r > 1e-6) ? (toCenter / r) : vec3(1.0, 0.0, 0.0);
      
      // 自然全空间引力收缩，不设置任何人工外框边界截断
      float radialAmt = pow(base, 1.15) * clampToSurface * 32.0 * uWellMul;

      // 汇入球心时，下限不再是球体外表面，而是直接汇入中心点 (0.15)
      float minLimit = mix(sphereR + uEpsSurf, 0.15, uPenetrateCore);
      float rPrime = max(minLimit, r - radialAmt);
      
      // 引力波纹理: 依据时间和距离产生的时空涟漪
      float wave = sin(r * 0.5 - uTime * 5.0) * exp(-r * 0.02) * uWaveAmp;
      rPrime += wave;

      vec3 displaced = center - dir * rPrime;
      totalDisplacement += (displaced - p);
    }

    vec3 finalDisplaced = p + totalDisplacement;
    vec3 finalPos = mix(p, finalDisplaced, uDeform);
    vDist = minDist;
    vPotential = totalPot;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
  }
`;

const gridFragmentShader = /* glsl */`
  precision mediump float;
  varying float vDist;
  varying float vPotential;
  uniform float uAlpha;
  uniform float uUsePotentialColor;
  uniform int   uSpectrumMode; // 0=Accretion, 1=Redshift, 2=Escape/Shadow, 3=Monochrome

  void main() {
    // 基础单色
    vec3 baseCyan = vec3(0.0, 0.8, 1.0);
    float shade = 1.0 - smoothstep(0.0, 80.0, vDist) * 0.15;
    vec3 classicColor = baseCyan * shade;

    float pot = clamp(vPotential * 0.055, 0.0, 1.0);
    vec3 potColor = classicColor;

    if (uSpectrumMode == 0) {
      // 模式 0: 吸积热能光谱 (Accretion Heat - 经典天体物理热力学)
      // 平直远空深冷幽蓝 -> 弯曲电光青 -> 强引力金黄 -> 核心白炽
      vec3 colFar  = vec3(0.04, 0.42, 0.78);
      vec3 colMid  = vec3(0.0, 0.95, 0.9);
      vec3 colNear = vec3(1.0, 0.82, 0.2);
      vec3 colCore = vec3(1.0, 1.0, 1.0);

      potColor = mix(colFar, colMid, smoothstep(0.0, 0.35, pot));
      potColor = mix(potColor, colNear, smoothstep(0.35, 0.75, pot));
      potColor = mix(potColor, colCore, smoothstep(0.75, 1.0, pot));
    } else if (uSpectrumMode == 1) {
      // 模式 1: 广义相对论引力红移 (Gravitational Redshift - 爱因斯坦相对论物理)
      // 远方高频冷白/蓝白 -> 爬升红移变金黄 -> 强引力深红 -> 视界暗蚀
      vec3 colFar  = vec3(0.65, 0.85, 1.0);   // 平直远空: 高频蓝白
      vec3 colMid  = vec3(1.0, 0.82, 0.2);    // 中度红移: 暖金黄
      vec3 colNear = vec3(0.95, 0.18, 0.05);  // 强引力红移: 炽红
      vec3 colCore = vec3(0.32, 0.02, 0.05);  // 濒临视界: 极深暗红

      potColor = mix(colFar, colMid, smoothstep(0.0, 0.35, pot));
      potColor = mix(potColor, colNear, smoothstep(0.35, 0.75, pot));
      potColor = mix(potColor, colCore, smoothstep(0.75, 1.0, pot));
    } else if (uSpectrumMode == 2) {
      // 模式 2: 光线逃逸与黑洞暗影 (Escape & Shadow - 用户建议的逃逸衰减逻辑)
      // 远方光线 100% 逃逸为纯白 -> 引力受限变冷银灰 -> 核心完全无法逃逸变为黑洞阴影
      vec3 colFar  = vec3(0.95, 0.98, 1.0);   // 远景: 100% 逃逸明亮白光
      vec3 colMid  = vec3(0.50, 0.62, 0.78);  // 中度弯曲: 渐暗冷灰
      vec3 colNear = vec3(0.18, 0.16, 0.24);  // 强弯曲: 暗铅色
      vec3 colCore = vec3(0.04, 0.04, 0.06);  // 视界暗影: 完全无法逃逸的黑洞黑影

      potColor = mix(colFar, colMid, smoothstep(0.0, 0.35, pot));
      potColor = mix(potColor, colNear, smoothstep(0.35, 0.75, pot));
      potColor = mix(potColor, colCore, smoothstep(0.75, 1.0, pot));
    } else {
      potColor = classicColor;
    }

    vec3 finalColor = mix(classicColor, potColor, uUsePotentialColor);
    gl_FragColor = vec4(finalColor, uAlpha);
  }
`;

// 6. 初始化时空网格几何体与材质
let currentDivs = DEFAULT_DIVS;
let currentHalf = HALF;
let gridTopology = 'cartesian'; // 'cartesian' | 'spherical'

function rebuildGrid() {
  gridMesh.geometry.dispose();
  if (gridTopology === 'spherical') {
    gridMesh.geometry = buildSphericalGridGeometry(currentDivs, currentHalf);
  } else {
    gridMesh.geometry = buildCubeGridGeometry(currentDivs, currentHalf, isDiagonalsEnabled);
  }
}

let gridGeom = buildCubeGridGeometry(currentDivs, currentHalf, isDiagonalsEnabled);
const gridUniforms = {
  uMassRadii: { value: new Float32Array(MAX_MASSES) },
  uMassValues: { value: new Float32Array(MAX_MASSES) },
  uMassCenters: { value: new Array(MAX_MASSES).fill(0).map(() => new THREE.Vector3()) },
  uMassCount: { value: 1 },
  uTime: { value: 0.0 },
  uWaveAmp: { value: 0.0 },
  uGravScale: { value: 1.0 },
  uMinR: { value: 1.0 },
  uDeform: { value: 1.0 },
  uHalf: { value: currentHalf },
  uEpsSurf: { value: 0.5 },
  uWellMul: { value: 1.0 },
  uAlpha: { value: 1.0 },
  uPenetrateCore: { value: 1.0 },
  uUsePotentialColor: { value: 1.0 },
  uSpectrumMode: { value: 0 },
};

// 广义相对论引力波激波（基于爱因斯坦四极矩动能释放）与振铃衰减时标（Ringdown Quasinormal Damping Time）
let transientWaveBurst = 0.0;
let ringdownTau = 0.8; // 衰减特征时标（秒），随天体碰撞总质量动态缩放

const gridMat = new THREE.ShaderMaterial({
  vertexShader: gridVertexShader,
  fragmentShader: gridFragmentShader,
  uniforms: gridUniforms,
  transparent: true,
  depthWrite: false,
});
let gridMesh = new THREE.LineSegments(gridGeom, gridMat);
gridMesh.renderOrder = 10;
scene.add(gridMesh);

// 7. 天体程序化纹理与外观生成器
// 7. 全息赛博天体形态构建引擎 (Cyber Holographic Celestial Engine)
// 彻底淘汰旧版粗糙的 2D 帆布贴图，采用高科技菲涅尔边缘激光发光、自转测地线框外壳与光子吸积环
function normalizeCelestialType(rawType) {
  if (!rawType) return 'hologram';
  if (rawType === 'sun') return 'plasma_star';
  if (rawType === 'earth') return 'hologram';
  if (rawType === 'jupiter') return 'pulsar';
  if (rawType === 'moon') return 'quantum_wire';
  if (rawType === 'blackhole') return 'singularity';
  if (rawType === 'crystal') return 'dark_matter';
  return rawType;
}

function disposeGroupRecursive(obj) {
  if (!obj) return;
  if (obj.children) {
    for (let i = obj.children.length - 1; i >= 0; i--) {
      disposeGroupRecursive(obj.children[i]);
    }
  }
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => m.dispose());
    } else {
      obj.material.dispose();
    }
  }
}

function createCelestialBodyMesh(m) {
  const group = new THREE.Group();
  group.userData = { massId: m.id };

  const type = normalizeCelestialType(m.textureType);
  const color = new THREE.Color(m.color || 0x00ffff);
  const r = Math.max(1.0, m.radius || 5.0);

  const isSingularity = (type === 'singularity');
  const isWireOnly = (type === 'quantum_wire');
  const isPulsar = (type === 'pulsar');
  const isDarkMatter = (type === 'dark_matter');
  const isPlasmaStar = (type === 'plasma_star');

  // 1. 核心发光/暗黑球体 (Core Sphere with Fresnel Glow)
  let coreGeo;
  if (isDarkMatter) {
    coreGeo = new THREE.IcosahedronGeometry(r, 1);
  } else {
    coreGeo = new THREE.SphereGeometry(r, 32, 32);
  }

  const rimColor = isSingularity 
    ? new THREE.Color(0xffbb33) 
    : (isPlasmaStar ? new THREE.Color(0xffdd44) : color.clone().offsetHSL(0, 0.08, 0.25));

  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uRimColor: { value: rimColor },
      uRimPower: { value: isSingularity ? 5.2 : (isPlasmaStar ? 1.8 : 2.4) },
      uCoreAlpha: { value: isSingularity ? 1.0 : (isWireOnly ? 0.06 : (isDarkMatter ? 0.35 : 0.52)) },
      uTime: { value: 0 },
      uIsSingularity: { value: isSingularity ? 1.0 : 0.0 },
      uIsPulsar: { value: isPulsar ? 1.0 : 0.0 },
      uIsDarkMatter: { value: isDarkMatter ? 1.0 : 0.0 },
      uIsPlasmaStar: { value: isPlasmaStar ? 1.0 : 0.0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uRimColor;
      uniform float uRimPower;
      uniform float uCoreAlpha;
      uniform float uTime;
      uniform float uIsSingularity;
      uniform float uIsPulsar;
      uniform float uIsDarkMatter;
      uniform float uIsPlasmaStar;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        float vDotN = clamp(dot(vNormal, vViewDir), 0.0, 1.0);
        float rim = pow(1.0 - vDotN, uRimPower);
        
        if (uIsSingularity > 0.5) {
          // 奇点视界：纯黑深邃内核，边缘超细高亮光子晕
          vec3 col = mix(vec3(0.002, 0.002, 0.005), vec3(1.0, 0.85, 0.45), rim * 0.96);
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        
        // 全息扫描线与高能脉动
        float pulse = uIsPulsar > 0.5 ? (sin(uTime * 6.0) * 0.2 + 0.2) : 0.0;
        float scanline = sin(vWorldPos.y * 3.8 - uTime * 2.2) * 0.5 + 0.5;
        scanline = pow(scanline, 4.0) * 0.35;
        
        vec3 baseCol = uColor * (uIsDarkMatter > 0.5 ? 0.25 : (uIsPlasmaStar > 0.5 ? 0.75 : 0.4));
        vec3 col = mix(baseCol, uRimColor, rim) + uRimColor * (scanline + pulse);
        float alpha = clamp(uCoreAlpha + rim * (1.0 - uCoreAlpha) + scanline * 0.25 + pulse, 0.08, 1.0);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: isSingularity,
    blending: isSingularity ? THREE.NormalBlending : THREE.AdditiveBlending
  });

  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.userData = { massId: m.id };
  group.add(coreMesh);

  // 2. 全息测地线框外壳 (Geodesic Wireframe Shell - 呼应时空晶格)
  const wireRadius = r * (isPulsar ? 1.12 : (isDarkMatter ? 1.04 : 1.06));
  const wireGeo = new THREE.IcosahedronGeometry(wireRadius, isDarkMatter ? 1 : 2);
  const wireMat = new THREE.MeshBasicMaterial({
    color: isPlasmaStar ? 0xffcc00 : color,
    wireframe: true,
    transparent: true,
    opacity: isSingularity ? 0.0 : (isWireOnly ? 0.88 : (isDarkMatter ? 0.45 : 0.38)),
    blending: THREE.AdditiveBlending
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  wireMesh.userData = { massId: m.id };
  group.add(wireMesh);

  // 3. 光子轨道环 / 吸积光环 (Photon Ring - 奇点、脉冲星或恒星)
  const hasRing = (isSingularity || isPulsar || isPlasmaStar);
  const ringGeo = new THREE.RingGeometry(r * 1.25, r * 1.75, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isSingularity ? 0xffaa22 : (isPlasmaStar ? 0xff9900 : color),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: hasRing ? 0.8 : 0.0,
    blending: THREE.AdditiveBlending
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2.7;
  ringMesh.rotation.y = Math.PI / 6.0;
  ringMesh.visible = hasRing;
  ringMesh.userData = { massId: m.id };
  group.add(ringMesh);

  // 4. 内部致密核心质心光点 (Centroid Sparkle)
  const innerSparkGeo = new THREE.SphereGeometry(r * 0.28, 16, 16);
  const innerSparkMat = new THREE.MeshBasicMaterial({
    color: isSingularity ? 0x000000 : 0xffffff,
    transparent: true,
    opacity: isSingularity ? 0.0 : 0.95,
    blending: THREE.AdditiveBlending
  });
  const innerSparkMesh = new THREE.Mesh(innerSparkGeo, innerSparkMat);
  innerSparkMesh.userData = { massId: m.id };
  group.add(innerSparkMesh);

  // 每帧动画更新逻辑
  group.userData.updateAnimation = (time, dt) => {
    coreMat.uniforms.uTime.value = time;
    if (wireMesh) {
      wireMesh.rotation.y += dt * 0.4;
      wireMesh.rotation.x += dt * 0.15;
    }
    if (ringMesh && ringMesh.visible) {
      ringMesh.rotation.z += dt * 0.5;
    }
    if (isDarkMatter && coreMesh) {
      coreMesh.rotation.y += dt * 0.25;
    }
  };

  group.position.copy(m.position);
  return group;
}

// 8. 天体数据结构与网格管理
let masses = [
  {
    id: "1",
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    radius: 5.0,
    mass: 15.0,
    textureType: 'hologram',
    color: 0x00E5FF,
    basePos: new THREE.Vector3(0, 0, 0),
    baseVel: new THREE.Vector3(0, 0, 0),
    orbitAngle: 0,
    orbitDist: 0
  }
];
let selectedMassId = "1";
const massMeshesMap = new Map();
const massTrailsMap = new Map();
const TRAIL_MAX_POINTS = 260;
let isMassTrailsVisible = true;

function updateMassMeshes() {
  // 清理移除的天体网格
  for (const [id, group] of massMeshesMap.entries()) {
    if (!masses.find(m => m.id === id)) {
      if (transformControls.object === group) {
        transformControls.detach();
      }
      scene.remove(group);
      disposeGroupRecursive(group);
      massMeshesMap.delete(id);
    }
  }

  // 清理移除的天体轨迹
  for (const [id, trailObj] of massTrailsMap.entries()) {
    if (!masses.find(m => m.id === id)) {
      scene.remove(trailObj.line);
      trailObj.line.geometry.dispose();
      trailObj.line.material.dispose();
      massTrailsMap.delete(id);
    }
  }

  // 创建或更新天体网格与轨迹
  masses.forEach((m) => {
    let group = massMeshesMap.get(m.id);
    const type = normalizeCelestialType(m.textureType);

    const needsRebuild = !group || 
                         group.userData.lastRadius !== m.radius || 
                         group.userData.lastType !== type || 
                         group.userData.lastColor !== m.color;

    if (needsRebuild) {
      const isAttached = group && (transformControls.object === group);
      if (group) {
        scene.remove(group);
        disposeGroupRecursive(group);
      }
      group = createCelestialBodyMesh(m);
      group.userData.lastRadius = m.radius;
      group.userData.lastType = type;
      group.userData.lastColor = m.color;
      scene.add(group);
      massMeshesMap.set(m.id, group);
      if (isAttached) {
        transformControls.attach(group);
      }
    } else {
      group.position.copy(m.position);
    }

    // 创建或更新天体运行轨迹线
    let trailObj = massTrailsMap.get(m.id);
    if (!trailObj) {
      const trailGeo = new THREE.BufferGeometry();
      const trailPos = new Float32Array(TRAIL_MAX_POINTS * 3);
      const trailCol = new Float32Array(TRAIL_MAX_POINTS * 3);
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      trailLine.renderOrder = 8;
      scene.add(trailLine);
      trailObj = { line: trailLine, points: [] };
      massTrailsMap.set(m.id, trailObj);
    }
  });

  // 同步着色器 Uniforms
  const radii = new Float32Array(MAX_MASSES);
  const massVals = new Float32Array(MAX_MASSES);
  const centers = new Array(MAX_MASSES).fill(0).map(() => new THREE.Vector3());

  masses.forEach((m, i) => {
    if (i < MAX_MASSES) {
      radii[i] = m.radius;
      massVals[i] = m.mass || 10.0;
      centers[i].copy(m.position);
    }
  });

  gridUniforms.uMassRadii.value = radii;
  gridUniforms.uMassValues.value = massVals;
  gridUniforms.uMassCenters.value = centers;
  gridUniforms.uMassCount.value = masses.length;

  // 根据天体平均质量动态微调引力尺度
  const avgMass = masses.reduce((acc, m) => acc + (m.mass || 10.0), 0) / masses.length;
  const scale = THREE.MathUtils.clamp((avgMass / 20.0) * 2.0, 0.05, 6.0);
  gridUniforms.uGravScale.value = scale;

  updateStatsDisplay();
}

function recordMassTrailPoints() {
  masses.forEach(m => {
    let trailObj = massTrailsMap.get(m.id);
    if (!trailObj) return;

    trailObj.line.visible = isMassTrailsVisible;
    if (!isMassTrailsVisible) return;

    const pts = trailObj.points;
    // 当发生位移时记录采样点
    if (pts.length === 0 || pts[pts.length - 1].distanceToSquared(m.position) > 0.04) {
      pts.push(m.position.clone());
      if (pts.length > TRAIL_MAX_POINTS) {
        pts.shift();
      }
    }

    const baseColor = new THREE.Color(m.color);
    const posArr = trailObj.line.geometry.attributes.position.array;
    const colArr = trailObj.line.geometry.attributes.color.array;
    const count = pts.length;

    for (let i = 0; i < TRAIL_MAX_POINTS; i++) {
      if (i < count) {
        const p = pts[i];
        posArr[i * 3]     = p.x;
        posArr[i * 3 + 1] = p.y;
        posArr[i * 3 + 2] = p.z;

        // 渐变离子拖尾：头部最亮，尾端渐暗融入深空
        const progress = (i + 1) / count;
        const factor = Math.pow(progress, 1.8);
        colArr[i * 3]     = baseColor.r * factor;
        colArr[i * 3 + 1] = baseColor.g * factor;
        colArr[i * 3 + 2] = baseColor.b * factor;
      } else if (count > 0) {
        const lastP = pts[count - 1];
        posArr[i * 3]     = lastP.x;
        posArr[i * 3 + 1] = lastP.y;
        posArr[i * 3 + 2] = lastP.z;
        colArr[i * 3]     = 0;
        colArr[i * 3 + 1] = 0;
        colArr[i * 3 + 2] = 0;
      } else {
        posArr[i * 3]     = m.position.x;
        posArr[i * 3 + 1] = m.position.y;
        posArr[i * 3 + 2] = m.position.z;
        colArr[i * 3]     = 0;
        colArr[i * 3 + 1] = 0;
        colArr[i * 3 + 2] = 0;
      }
    }
    trailObj.line.geometry.attributes.position.needsUpdate = true;
    trailObj.line.geometry.attributes.color.needsUpdate = true;
  });
}

function clearMassTrails() {
  for (const trailObj of massTrailsMap.values()) {
    trailObj.points.length = 0;
    const colArr = trailObj.line.geometry.attributes.color.array;
    colArr.fill(0);
    trailObj.line.geometry.attributes.color.needsUpdate = true;
  }
}

// 计算当前天体所处的引力势阱、第一宇宙速度 (vOrb) 与第二宇宙速度 (vEsc)
function calculateOrbitalParams(targetMass) {
  if (!targetMass || masses.length <= 1) {
    return { potential: 0, vOrb: 0, vEsc: 0, primaryMass: null, distToPrimary: 0 };
  }

  let totalPotential = 0;
  let primaryMass = null;
  let maxGravPull = -1;
  let distToPrimary = 0;

  const wellMul = gridUniforms.uWellMul.value;

  masses.forEach(m => {
    if (m.id === targetMass.id) return;
    const dist = targetMass.position.distanceTo(m.position);
    const safeDist = Math.max(dist, 1.0);
    
    // Effective GM = m.mass * 2.5 * wellMul
    const gm = (m.mass || 10.0) * 2.5 * wellMul;
    totalPotential += gm / safeDist;

    // 对比两两引力大小找出主引力中心
    const pull = gm / (safeDist * safeDist);
    if (pull > maxGravPull) {
      maxGravPull = pull;
      primaryMass = m;
      distToPrimary = dist;
    }
  });

  const vOrb = Math.sqrt(totalPotential);
  const vEsc = Math.sqrt(2.0 * totalPotential);

  return { potential: totalPotential, vOrb, vEsc, primaryMass, distToPrimary };
}

function updateVelocityHUD() {
  const cur = masses.find(m => m.id === selectedMassId);
  const badge = document.getElementById('badge-velocity-status');
  const vCurEl = document.getElementById('hud-val-vcur');
  const vOrbEl = document.getElementById('hud-val-vorb');
  const vEscEl = document.getElementById('hud-val-vesc');

  if (!badge || !vCurEl || !vOrbEl || !vEscEl) return;

  if (!cur) {
    vCurEl.textContent = "--";
    vOrbEl.textContent = "--";
    vEscEl.textContent = "--";
    badge.textContent = "DESELECTED (点击天体查看动态)";
    badge.className = "hud-badge badge-neutral";
    return;
  }

  const vCur = cur.velocity.length();
  vCurEl.textContent = vCur.toFixed(2);

  if (masses.length <= 1) {
    vOrbEl.textContent = "--";
    vEscEl.textContent = "--";
    badge.textContent = "SOLITARY (孤立天体)";
    badge.className = "hud-badge badge-neutral";
    return;
  }

  const { vOrb, vEsc } = calculateOrbitalParams(cur);
  vOrbEl.textContent = vOrb.toFixed(2);
  vEscEl.textContent = vEsc.toFixed(2);

  if (vCur >= vEsc * 0.95) {
    badge.textContent = "ESCAPING (逃逸甩飞)";
    badge.className = "hud-badge badge-escape";
  } else if (vCur >= vOrb * 0.55 && vCur < vEsc * 0.95) {
    badge.textContent = "ORBIT BOUND (引力捕获/绕转)";
    badge.className = "hud-badge badge-orbit";
  } else {
    badge.textContent = "COLLAPSING (低速/引力坠落)";
    badge.className = "hud-badge badge-fall";
  }
}

// 8. 3D 直接拖拽控制器 (TransformControls - 用户核心需求！)
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.size = 0.85;
const transformHelper = transformControls.getHelper ? transformControls.getHelper() : transformControls;
scene.add(transformHelper);

let isGizmoDragging = false;
let pointerDownPos = { x: 0, y: 0 };
let isGizmoActiveAtDown = false;

transformControls.addEventListener('dragging-changed', (event) => {
  controls.enabled = !event.value;
  isGizmoDragging = event.value;
});

transformControls.addEventListener('objectChange', () => {
  const currentMass = masses.find(m => m.id === selectedMassId);
  if (currentMass && transformControls.object) {
    currentMass.position.copy(transformControls.object.position);
    currentMass.basePos.copy(transformControls.object.position);
    currentMass.orbitDist = Math.sqrt(currentMass.position.x * currentMass.position.x + currentMass.position.z * currentMass.position.z);
    currentMass.orbitAngle = Math.atan2(currentMass.position.z, currentMass.position.x);

    // 立即同步着色器和 UI 滑块
    updateMassMeshes();
    updatePropertySliders();
  }
});

function attachGizmoToMass(massId) {
  selectedMassId = massId || null;
  const mesh = selectedMassId ? massMeshesMap.get(selectedMassId) : null;
  if (mesh && mesh.parent) {
    transformControls.attach(mesh);
  } else {
    transformControls.detach();
  }
  updateMassDropdown();
  updatePropertySliders();
  updateVelocityHUD();
}

// 点击拾取与取消选取 3D 视口中的天体
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.sidebar-panel') || e.target.closest('.top-stats-card') || e.target.closest('.bottom-info-card') || e.target.closest('.modal-overlay') || e.target.closest('.velocity-hud-overlay')) {
    return;
  }
  pointerDownPos.x = e.clientX;
  pointerDownPos.y = e.clientY;
  isGizmoActiveAtDown = (transformControls.axis !== null);
});

window.addEventListener('pointerup', (e) => {
  if (e.target.closest('.sidebar-panel') || e.target.closest('.top-stats-card') || e.target.closest('.bottom-info-card') || e.target.closest('.modal-overlay') || e.target.closest('.velocity-hud-overlay')) {
    return;
  }

  // 若产生拖拽旋转相机或正在操作三维坐标轴，则不触发点选/取消点选
  const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dragDist > 6 || isGizmoActiveAtDown || isGizmoDragging || transformControls.axis !== null) {
    return;
  }

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const meshes = Array.from(massMeshesMap.values());
  const intersects = raycaster.intersectObjects(meshes, true);

  if (intersects.length > 0) {
    const hitObj = intersects[0].object;
    const hitId = hitObj.userData.massId || (hitObj.parent && hitObj.parent.userData.massId);
    if (hitId) {
      attachGizmoToMass(hitId);
    }
  } else {
    // 点击宇宙背景空白处：取消选取天体并隐藏 3D 坐标轴！
    attachGizmoToMass(null);
  }
});

// 9. 测试粒子系统 (Particles)
const particles = [];
const particleGeo = new THREE.SphereGeometry(0.5, 8, 8);
const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
let isParticlesEnabled = true;
let particleBehavior = 'swallow'; // 'swallow' | 'drag' | 'flyby'
let particleCycleMode = 'recycle'; // 'recycle' | 'finite'
let swallowedCount = 0;

function resetParticleToBoundary(p) {
  // 生成在宇宙外围边界
  const spawnR = currentHalf * (0.85 + Math.random() * 0.25);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  p.position.set(
    spawnR * Math.sin(phi) * Math.cos(theta),
    spawnR * Math.sin(phi) * Math.sin(theta) * 0.65,
    spawnR * Math.cos(phi)
  );

  // 赋予朝向引力质心的落体速度分量 + 适度切向旋转速度，形成宏伟的自然吸积旋转流场
  const toCenter = new THREE.Vector3().sub(p.position).normalize();
  const tangent = new THREE.Vector3(-p.position.z, 0, p.position.x).normalize();
  p.velocity.copy(toCenter.multiplyScalar(2.0 + Math.random() * 2.5))
            .addScaledVector(tangent, (Math.random() - 0.5) * 2.0);

  for (let j = 0; j < TRAIL_LENGTH; j++) {
    p.history[j].copy(p.position);
  }
}

function spawnParticles(count = 20) {
  for (let i = 0; i < count; i++) {
    const pObj = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      mesh: null,
      trail: null,
      history: Array(TRAIL_LENGTH).fill(0).map(() => new THREE.Vector3())
    };
    resetParticleToBoundary(pObj);

    // 首次生成时分散在空间各层，展现流向引力漏斗的连续尘埃流
    const initR = Math.max(12, currentHalf * (0.3 + Math.random() * 0.65));
    pObj.position.normalize().multiplyScalar(initR);

    const mesh = new THREE.Mesh(particleGeo, particleMat);
    mesh.position.copy(pObj.position);
    scene.add(mesh);
    pObj.mesh = mesh;

    // 拖尾线 (Trail)
    for (let j = 0; j < TRAIL_LENGTH; j++) {
      pObj.history[j].copy(pObj.position);
    }
    const trailPoints = new Float32Array(TRAIL_LENGTH * 3);
    for (let j = 0; j < TRAIL_LENGTH; j++) {
      trailPoints[j * 3]     = pObj.position.x;
      trailPoints[j * 3 + 1] = pObj.position.y;
      trailPoints[j * 3 + 2] = pObj.position.z;
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPoints, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);
    pObj.trail = trail;

    particles.push(pObj);
  }
}

function clearParticles() {
  particles.forEach(p => {
    scene.remove(p.mesh);
    scene.remove(p.trail);
    p.mesh.geometry.dispose();
    p.trail.geometry.dispose();
    p.trail.material.dispose();
  });
  particles.length = 0;
  swallowedCount = 0;
  const statSwallowedEl = document.getElementById('stat-swallowed-count');
  if (statSwallowedEl) statSwallowedEl.textContent = "0";
}

// 粒子高保真动力学更新引擎 (包含黑洞视界吞噬、吸积流与超密核心流体阻力)
function updateParticles(dt) {
  if (!isParticlesEnabled || particles.length === 0) return;

  const curWellMul = gridUniforms.uWellMul.value; // G 引力常数倍率
  const G = 3.2 * curWellMul;
  const effectiveDt = Math.min(0.04, dt) * motionSpeed;
  const SUB_STEPS = 4;
  const subDt = effectiveDt / SUB_STEPS;
  const cSpeedLimit = 160.0; // 模拟光速上限，杜绝由于离散步长导致的非物理暴射

  const statSwallowedEl = document.getElementById('stat-swallowed-count');

  particles.forEach(p => {
    let wasSwallowed = false;

    for (let step = 0; step < SUB_STEPS; step++) {
      if (wasSwallowed) break;

      const totalAcc = new THREE.Vector3();

      for (let i = 0; i < masses.length; i++) {
        const m = masses[i];
        const dir = new THREE.Vector3().subVectors(m.position, p.position);
        const dist = dir.length();

        // 1. 真实物理捕获半径：与天体肉眼可见的物理半径严格对齐！
        // 确保粒子一路加速飞到天体表面/球体核心时，才被视觉捕获吞噬，绝不在虚空中提前拦截！
        const massVal = m.mass || 10.0;
        const captureRadius = Math.max(0.6, m.radius * 0.95);

        // 2. 判断是否落入捕获半径 (r <= R_cap)
        if (dist <= captureRadius) {
          if (particleBehavior === 'swallow') {
            // 【物理真相：天体表面碰撞吸积 / 黑洞吞噬】
            // 粒子被捕获吞噬，直接吸入球心！
            wasSwallowed = true;
            swallowedCount++;
            if (statSwallowedEl) statSwallowedEl.textContent = String(swallowedCount);

            if (particleCycleMode === 'finite') {
              // 单次消耗模式：吞噬后从场景中彻底移除
              scene.remove(p.mesh);
              scene.remove(p.trail);
              p.mesh.geometry.dispose();
              p.trail.geometry.dispose();
              p.isDead = true;
            } else {
              // 稳态流模式：吞噬后重置到外太空，形成源源不断的宇宙星尘吸积流场
              resetParticleToBoundary(p);
            }
            break;
          } else if (particleBehavior === 'drag') {
            // 【超密等离子体阻力】粒子进入星体核心，动能迅速耗散，平稳沉降在球心
            p.velocity.multiplyScalar(0.7);
            const pullToCenter = dir.normalize().multiplyScalar(8.0);
            p.velocity.addScaledVector(pullToCenter, subDt);
          } else {
            // 【Flyby 模式】：无碰撞穿透但通过软化半径平滑过渡
            const strength = (G * massVal) / Math.max(dist * dist, 4.0);
            totalAcc.add(dir.normalize().multiplyScalar(strength));
          }
        } else {
          // 3. 正常空间：严格万有引力 a = G * M / r^2
          const strength = (G * massVal) / (dist * dist + 1.0);
          totalAcc.add(dir.normalize().multiplyScalar(strength));
        }
      }

      if (!wasSwallowed) {
        // 更新速度与微小的天体吸积盘黏滞阻尼 (消除由于角动量守恒导致的无限圆周悬停，使粒子自然盘旋汇入球心)
        p.velocity.addScaledVector(totalAcc, subDt);
        p.velocity.multiplyScalar(0.9985); // 吸积盘角动量耗散

        const curSpd = p.velocity.length();
        if (curSpd > cSpeedLimit) {
          p.velocity.multiplyScalar(cSpeedLimit / curSpd);
        }
        // 更新空间坐标
        p.position.addScaledVector(p.velocity, subDt);
      }
    }

    if (!wasSwallowed) {
      // 空间越界保护 (若飞出过远则重置)
      if (p.position.length() > currentHalf * 2.5) {
        resetParticleToBoundary(p);
      }
    }

    // 更新 3D 网格位置与离子拖尾
    p.mesh.position.copy(p.position);
    p.history.unshift(p.position.clone());
    p.history.pop();

    const trailPos = p.trail.geometry.attributes.position.array;
    for (let j = 0; j < TRAIL_LENGTH; j++) {
      trailPos[j * 3]     = p.history[j].x;
      trailPos[j * 3 + 1] = p.history[j].y;
      trailPos[j * 3 + 2] = p.history[j].z;
    }
    p.trail.geometry.attributes.position.needsUpdate = true;
  });

  // 单次消耗模式下清理已阵亡粒子
  if (particleCycleMode === 'finite') {
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].isDead) {
        particles.splice(i, 1);
      }
    }
  }
}

// 10. 天体自主运动引擎 (Sphere Movement & Dynamics)
let motionMode = 'nbody'; // 默认启动真实引力互动模式
let motionSpeed = 1.0;
let isMotionPlaying = true;
let collisionMode = 'merge'; // 'merge' | 'bounce' | 'pass'

function updateSphereMotion(dt) {
  if (!isMotionPlaying || motionMode === 'static') return;

  const effectiveDt = dt * motionSpeed;

  if (motionMode === 'orbit') {
    // 轨道公转模式：绕质心或中心轴做优雅开普勒公转
    masses.forEach((m) => {
      const dist = Math.max(10, m.orbitDist);
      // 开普勒角速度: omega = sqrt(G * M / r^3)
      const omega = Math.sqrt(120.0 / Math.pow(dist, 1.5)) * 0.8;
      m.orbitAngle += omega * effectiveDt;

      m.position.x = Math.cos(m.orbitAngle) * dist;
      m.position.z = Math.sin(m.orbitAngle) * dist;
    });
    updateMassMeshes();
    updatePropertySliders();
  } else if (motionMode === 'nbody') {
    // 真实 N 体万有引力动力学模式
    const n = masses.length;
    if (n === 1) {
      const m = masses[0];
      m.position.addScaledVector(m.velocity, effectiveDt);
      ['x', 'y', 'z'].forEach(axis => {
        if (Math.abs(m.position[axis]) > currentHalf - 4) {
          m.position[axis] = Math.sign(m.position[axis]) * (currentHalf - 4);
          m.velocity[axis] *= -0.75;
        }
      });
      updateMassMeshes();
      updatePropertySliders();
    } else if (n > 1) {
      const G = 2.5 * gridUniforms.uWellMul.value;
      const accs = masses.map(() => new THREE.Vector3());
      const eps2 = 2.0; // 极小软化平滑因子，真实呈现引力剧烈加速

      // 1. 计算两两引力加速度 a = G * M / r^2
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const m1 = masses[i];
          const m2 = masses[j];
          const rx = m2.position.x - m1.position.x;
          const ry = m2.position.y - m1.position.y;
          const rz = m2.position.z - m1.position.z;
          const distSq = rx * rx + ry * ry + rz * rz + eps2;
          const dist = Math.sqrt(distSq);

          const invDist3 = 1.0 / (distSq * dist);
          const fFactor = G * invDist3;

          accs[i].x += fFactor * (m2.mass || 10.0) * rx;
          accs[i].y += fFactor * (m2.mass || 10.0) * ry;
          accs[i].z += fFactor * (m2.mass || 10.0) * rz;

          accs[j].x -= fFactor * (m1.mass || 10.0) * rx;
          accs[j].y -= fFactor * (m1.mass || 10.0) * ry;
          accs[j].z -= fFactor * (m1.mass || 10.0) * rz;
        }
      }

      // 2. 积分更新速度与位置
      for (let i = 0; i < n; i++) {
        const m = masses[i];
        m.velocity.addScaledVector(accs[i], effectiveDt);
        m.position.addScaledVector(m.velocity, effectiveDt);

        // 空间边界弹性限制
        ['x', 'y', 'z'].forEach(axis => {
          if (Math.abs(m.position[axis]) > currentHalf - 4) {
            m.position[axis] = Math.sign(m.position[axis]) * (currentHalf - 4);
            m.velocity[axis] *= -0.75;
          }
        });
      }

      // 3. 碰撞检测与处理机制 (Merge, Bounce, Pass)
      let mergedAny = false;
      for (let i = 0; i < masses.length; i++) {
        for (let j = i + 1; j < masses.length; j++) {
          const m1 = masses[i];
          const m2 = masses[j];
          const rDist = m1.position.distanceTo(m2.position);
          const minDist = m1.radius + m2.radius;

          if (rDist <= minDist) {
            if (collisionMode === 'merge') {
              // 碰撞完全非弹性合并：质量守恒与动量守恒
              const m1Mass = m1.mass || 10.0;
              const m2Mass = m2.mass || 10.0;
              const totalMass = m1Mass + m2Mass;
              const mergedVel = new THREE.Vector3()
                .copy(m1.velocity).multiplyScalar(m1Mass)
                .addScaledVector(m2.velocity, m2Mass)
                .divideScalar(totalMass);
              const mergedPos = new THREE.Vector3()
                .copy(m1.position).multiplyScalar(m1Mass)
                .addScaledVector(m2.position, m2Mass)
                .divideScalar(totalMass);
              const mergedRadius = Math.cbrt(Math.pow(m1.radius, 3) + Math.pow(m2.radius, 3));

              // 物理真实引力波爆发（爱因斯坦四极矩近似）：
              // 约化质量 mu = (m1 * m2) / (m1 + m2)
              // 碰撞动能释放 E_loss = 0.5 * mu * |v1 - v2|^2
              const mu = (m1Mass * m2Mass) / totalMass;
              const relVelVec = new THREE.Vector3().subVectors(m1.velocity, m2.velocity);
              const relSpeedSq = relVelVec.lengthSq();
              const collisionKineticEnergy = 0.5 * mu * relSpeedSq;

              // 碰撞峰值波幅与动能释放及约化质量严格正相关（按显示比例归一化）
              const gwPeak = Math.min(3.5, 0.015 * collisionKineticEnergy + 0.02 * mu);
              transientWaveBurst = Math.min(3.5, Math.max(transientWaveBurst, gwPeak));

              // 广义相对论准简正模振铃时标：黑洞/致密星质量越大，振铃衰减时标越长 tau ∝ M
              ringdownTau = 0.5 + Math.min(2.0, totalMass * 0.015);

              m1.mass = totalMass;
              m1.velocity.copy(mergedVel);
              m1.position.copy(mergedPos);
              m1.radius = Math.min(30.0, mergedRadius);

              // 移除被吞噬天体
              const removedId = m2.id;
              masses.splice(j, 1);
              if (selectedMassId === removedId) {
                selectedMassId = m1.id;
              }
              mergedAny = true;
              break;
            } else if (collisionMode === 'bounce') {
              // 弹性碰撞反弹
              const nVec = new THREE.Vector3().subVectors(m1.position, m2.position).normalize();
              const overlap = minDist - rDist;
              const m1Mass = m1.mass || 10.0;
              const m2Mass = m2.mass || 10.0;
              const totalMass = m1Mass + m2Mass;

              // 分离位置防止粘连
              m1.position.addScaledVector(nVec, overlap * (m2Mass / totalMass));
              m2.position.addScaledVector(nVec, -overlap * (m1Mass / totalMass));

              const relVel = new THREE.Vector3().subVectors(m1.velocity, m2.velocity).dot(nVec);
              if (relVel < 0) {
                const e = 0.85; // 恢复系数
                const impulse = -(1 + e) * relVel / (1.0 / m1Mass + 1.0 / m2Mass);
                m1.velocity.addScaledVector(nVec, impulse / m1Mass);
                m2.velocity.addScaledVector(nVec, -impulse / m2Mass);

                // 弹性碰撞的反弹加速度突变产生瞬态四极辐射脉冲
                const mu = (m1Mass * m2Mass) / totalMass;
                const bounceEnergy = 0.5 * mu * (relVel * relVel);
                const gwBounce = Math.min(2.0, 0.006 * bounceEnergy + 0.01 * mu);
                transientWaveBurst = Math.min(2.5, Math.max(transientWaveBurst, gwBounce));
                ringdownTau = 0.4 + Math.min(1.2, totalMass * 0.01);
              }
            }
            // 'pass' 模式则穿透不作响应
          }
        }
        if (mergedAny) break;
      }

      if (mergedAny) {
        updateMassDropdown();
      }

      updateMassMeshes();
      updatePropertySliders();
    }
  } else if (motionMode === 'cruise') {
    // 空间穿梭巡航模式
    const time = performance.now() * 0.001 * motionSpeed;
    masses.forEach((m, idx) => {
      const phase = idx * (Math.PI * 2 / masses.length);
      m.position.x = Math.sin(time * 0.8 + phase) * (currentHalf * 0.75);
      m.position.y = Math.cos(time * 1.1 + phase) * (currentHalf * 0.45);
      m.position.z = Math.sin(time * 0.6 + phase) * (currentHalf * 0.65);
    });
    updateMassMeshes();
    updatePropertySliders();
  }
}

// 11. UI 元素获取与事件绑定
const sliderDivs = document.getElementById('slider-divs');
const valDivs = document.getElementById('val-divs');
const sliderBounds = document.getElementById('slider-bounds');
const valBounds = document.getElementById('val-bounds');
const sliderAlpha = document.getElementById('slider-alpha');
const valAlpha = document.getElementById('val-alpha');
const selectPreset = document.getElementById('select-preset');

const btnAddMass = document.getElementById('btn-add-mass');
const selectActiveMass = document.getElementById('select-active-mass');
const btnDeleteMass = document.getElementById('btn-delete-mass');

const selectGridTopology = document.getElementById('select-grid-topology');

const selectTextureType = document.getElementById('select-texture-type');
const sliderRadius = document.getElementById('slider-radius');
const valRadius = document.getElementById('val-radius');
const sliderMass = document.getElementById('slider-mass');
const valMass = document.getElementById('val-mass');

const sliderPosX = document.getElementById('slider-pos-x');
const valPosX = document.getElementById('val-pos-x');
const sliderPosY = document.getElementById('slider-pos-y');
const valPosY = document.getElementById('val-pos-y');
const sliderPosZ = document.getElementById('slider-pos-z');
const valPosZ = document.getElementById('val-pos-z');

const numPosX = document.getElementById('num-pos-x');
const numPosY = document.getElementById('num-pos-y');
const numPosZ = document.getElementById('num-pos-z');
const numVelX = document.getElementById('num-vel-x');
const numVelY = document.getElementById('num-vel-y');
const numVelZ = document.getElementById('num-vel-z');

// 球体移动专属控件
const selectMotionMode = document.getElementById('select-motion-mode');
const selectCollisionMode = document.getElementById('select-collision-mode');
const sliderMotionSpeed = document.getElementById('slider-motion-speed');
const valMotionSpeed = document.getElementById('val-motion-speed');
const btnToggleMotion = document.getElementById('btn-toggle-motion');
const btnResetPositions = document.getElementById('btn-reset-positions');
const btnRandomize = document.getElementById('btn-randomize');

// 物理与波动
const checkDeform = document.getElementById('check-deform');
const checkPenetrateCore = document.getElementById('check-penetrate-core');
const sliderIntensity = document.getElementById('slider-intensity');
const valIntensity = document.getElementById('val-intensity');
const selectGravityPreset = document.getElementById('select-gravity-preset');
const sliderWaves = document.getElementById('slider-waves');
const valWaves = document.getElementById('val-waves');

// 粒子控件
const btnSpawnParticles = document.getElementById('btn-spawn-particles');
const btnClearParticles = document.getElementById('btn-clear-particles');
const checkParticlesEnabled = document.getElementById('check-particles-enabled');

// 状态卡片
const statActiveMasses = document.getElementById('stat-active-masses');
const statGridRes = document.getElementById('stat-grid-res');
const statMotionMode = document.getElementById('stat-motion-mode');

// 关于弹窗
const btnOpenAbout = document.getElementById('btn-open-about');
const btnCloseAbout = document.getElementById('btn-close-about');
const btnBackToSim = document.getElementById('btn-back-to-sim');
const aboutModal = document.getElementById('about-modal');

// 绑定网格拓扑形态切换 (Cartesian vs Spherical 360°)
if (selectGridTopology) {
  selectGridTopology.addEventListener('change', (e) => {
    gridTopology = e.target.value;
    rebuildGrid();
    statGridRes.textContent = gridTopology === 'spherical' ? `${currentDivs} (Spherical 360°)` : `${currentDivs}³`;
  });
}

// 绑定网格分辨率
if (sliderDivs) {
  sliderDivs.addEventListener('input', (e) => {
    const d = parseInt(e.target.value, 10);
    valDivs.textContent = d;
    currentDivs = d;
    rebuildGrid();
    statGridRes.textContent = gridTopology === 'spherical' ? `${d} (Spherical 360°)` : `${d}³`;
  });
}

// 绑定空间尺寸边界 Bounds
if (sliderBounds) {
  sliderBounds.addEventListener('input', (e) => {
    const b = parseFloat(e.target.value);
    currentHalf = b;
    if (valBounds) valBounds.textContent = b.toFixed(0);
    rebuildGrid();
    gridUniforms.uHalf.value = currentHalf;
  });
}

// 绑定等势能色彩光晕开关
const checkPotentialHalo = document.getElementById('check-potential-halo');
if (checkPotentialHalo) {
  checkPotentialHalo.addEventListener('change', (e) => {
    gridUniforms.uUsePotentialColor.value = e.target.checked ? 1.0 : 0.0;
  });
}

// 绑定光谱模式切换 (Accretion Heat / Redshift / Escape & Shadow)
const selectSpectrumPalette = document.getElementById('select-spectrum-palette');
if (selectSpectrumPalette) {
  selectSpectrumPalette.addEventListener('change', (e) => {
    gridUniforms.uSpectrumMode.value = parseInt(e.target.value, 10);
  });
}

// 绑定对角交叉线开关
const checkDiagonals = document.getElementById('check-diagonals');
if (checkDiagonals) {
  checkDiagonals.addEventListener('change', (e) => {
    isDiagonalsEnabled = e.target.checked;
    rebuildGrid();
  });
}

// 绑定透明度
if (sliderAlpha) {
  sliderAlpha.addEventListener('input', (e) => {
    const a = parseFloat(e.target.value);
    valAlpha.textContent = a.toFixed(2);
    gridUniforms.uAlpha.value = a;
  });
}

// 绑定空间变形开关
if (checkDeform) {
  checkDeform.addEventListener('change', (e) => {
    gridUniforms.uDeform.value = e.target.checked ? 1.0 : 0.0;
  });
}

// 绑定深入球体内部汇入球心开关
if (checkPenetrateCore) {
  checkPenetrateCore.addEventListener('change', (e) => {
    gridUniforms.uPenetrateCore.value = e.target.checked ? 1.0 : 0.0;
  });
}

// 绑定引力强度 (支持滑块与手动精确数字输入，开放上限至 100+)
const numIntensity = document.getElementById('num-intensity');
if (sliderIntensity) {
  sliderIntensity.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (numIntensity) numIntensity.value = v.toFixed(1);
    gridUniforms.uWellMul.value = v;
  });
}
if (numIntensity) {
  numIntensity.addEventListener('change', (e) => {
    const v = Math.max(0.1, parseFloat(e.target.value) || 0.1);
    if (sliderIntensity) sliderIntensity.value = Math.min(parseFloat(sliderIntensity.max) || 100, v);
    gridUniforms.uWellMul.value = v;
  });
}

// 真实引力预设下拉
if (selectGravityPreset) {
  selectGravityPreset.addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    sliderIntensity.value = v;
    if (numIntensity) numIntensity.value = v.toFixed(1);
    gridUniforms.uWellMul.value = v;
  });
}

// 引力波振幅
if (sliderWaves) {
  sliderWaves.addEventListener('input', (e) => {
    const w = parseFloat(e.target.value);
    valWaves.textContent = w.toFixed(1);
    gridUniforms.uWaveAmp.value = w + transientWaveBurst;
  });
}

// 粒子按钮
if (btnSpawnParticles) btnSpawnParticles.addEventListener('click', () => spawnParticles(20));
if (btnClearParticles) btnClearParticles.addEventListener('click', () => clearParticles());
if (checkParticlesEnabled) {
  checkParticlesEnabled.addEventListener('change', (e) => {
    isParticlesEnabled = e.target.checked;
  });
}

const selectParticleBehavior = document.getElementById('select-particle-behavior');
if (selectParticleBehavior) {
  selectParticleBehavior.addEventListener('change', (e) => {
    particleBehavior = e.target.value;
  });
}

const selectParticleCycle = document.getElementById('select-particle-cycle');
if (selectParticleCycle) {
  selectParticleCycle.addEventListener('change', (e) => {
    particleCycleMode = e.target.value;
  });
}

// 天体管理：添加天体
if (btnAddMass) {
  btnAddMass.addEventListener('click', () => {
    if (masses.length >= MAX_MASSES) return;
    const newId = String(Date.now()).slice(-6);
    const color = MASS_COLORS[masses.length % MASS_COLORS.length];
    const offset = (masses.length % 2 === 0 ? 1 : -1) * (16 + masses.length * 4);
    const textureTypes = ['hologram', 'pulsar', 'singularity', 'quantum_wire', 'dark_matter', 'plasma_star'];
    const newMass = {
      id: newId,
      position: new THREE.Vector3(offset, 0, (Math.random() - 0.5) * 16),
      velocity: new THREE.Vector3(0, 0, (Math.random() - 0.5) * 2),
      radius: INITIAL_RADIUS,
      mass: 12.0,
      textureType: textureTypes[masses.length % textureTypes.length],
      color: color,
      basePos: new THREE.Vector3(offset, 0, 0),
      baseVel: new THREE.Vector3(0, 0, 0),
      orbitAngle: Math.random() * Math.PI * 2,
      orbitDist: Math.abs(offset)
    };
    masses.push(newMass);
    updateMassMeshes();
    attachGizmoToMass(newId);
  });
}

// 天体管理：删除当前天体
if (btnDeleteMass) {
  btnDeleteMass.addEventListener('click', () => {
    if (masses.length <= 1) return;
    transformControls.detach();
    masses = masses.filter(m => m.id !== selectedMassId);
    selectedMassId = masses[0].id;
    updateMassMeshes();
    attachGizmoToMass(selectedMassId);
  });
}

// 下拉切换选中天体
if (selectActiveMass) {
  selectActiveMass.addEventListener('change', (e) => {
    attachGizmoToMass(e.target.value || null);
  });
}

// ✕ DESELECT 取消选中天体按钮
const btnDeselectMass = document.getElementById('btn-deselect-mass');
if (btnDeselectMass) {
  btnDeselectMass.addEventListener('click', () => {
    attachGizmoToMass(null);
  });
}

// 外观贴图切换
if (selectTextureType) {
  selectTextureType.addEventListener('change', (e) => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (cur) {
      cur.textureType = e.target.value;
      updateMassMeshes();
      updateMassDropdown();
    }
  });
}

// 视觉半径滑块
if (sliderRadius) {
  sliderRadius.addEventListener('input', (e) => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (cur) {
      cur.radius = parseFloat(e.target.value);
      valRadius.textContent = cur.radius.toFixed(1);
      updateMassMeshes();
    }
  });
}

// 引力质量滑块与手动精确数字输入 (独立于几何半径，彻底开放上限)
const numMass = document.getElementById('num-mass');
if (sliderMass) {
  sliderMass.addEventListener('input', (e) => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (cur) {
      cur.mass = parseFloat(e.target.value);
      if (numMass) numMass.value = cur.mass.toFixed(0);
      updateMassMeshes();
    }
  });
}
if (numMass) {
  numMass.addEventListener('change', (e) => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (cur) {
      const v = Math.max(1, parseFloat(e.target.value) || 1);
      cur.mass = v;
      if (sliderMass) sliderMass.value = Math.min(parseFloat(sliderMass.max) || 2000, v);
      updateMassMeshes();
    }
  });
}

// 坐标滑块同步
['x', 'y', 'z'].forEach(axis => {
  const slider = document.getElementById(`slider-pos-${axis}`);
  const badge = document.getElementById(`val-pos-${axis}`);
  if (slider) {
    slider.addEventListener('input', (e) => {
      const cur = masses.find(m => m.id === selectedMassId);
      if (cur) {
        cur.position[axis] = parseFloat(e.target.value);
        cur.basePos[axis] = cur.position[axis];
        cur.orbitDist = Math.sqrt(cur.position.x * cur.position.x + cur.position.z * cur.position.z);
        cur.orbitAngle = Math.atan2(cur.position.z, cur.position.x);
        if (badge) badge.textContent = cur.position[axis].toFixed(1);
        updateMassMeshes();
        updatePropertySliders();
      }
    });
  }
});

// 精确坐标数字输入框绑定
['x', 'y', 'z'].forEach(axis => {
  const numInput = document.getElementById(`num-pos-${axis}`);
  if (numInput) {
    numInput.addEventListener('change', (e) => {
      const cur = masses.find(m => m.id === selectedMassId);
      if (cur) {
        cur.position[axis] = parseFloat(e.target.value) || 0;
        cur.basePos[axis] = cur.position[axis];
        cur.orbitDist = Math.sqrt(cur.position.x * cur.position.x + cur.position.z * cur.position.z);
        cur.orbitAngle = Math.atan2(cur.position.z, cur.position.x);
        updateMassMeshes();
        updatePropertySliders();
      }
    });
  }
});

// 精确速度数字输入框绑定
['x', 'y', 'z'].forEach(axis => {
  const numInput = document.getElementById(`num-vel-${axis}`);
  if (numInput) {
    numInput.addEventListener('change', (e) => {
      const cur = masses.find(m => m.id === selectedMassId);
      if (cur) {
        cur.velocity[axis] = parseFloat(e.target.value) || 0;
        cur.baseVel[axis] = cur.velocity[axis];
        updateVelocityHUD();
      }
    });
  }
});

// 碰撞模式下拉选择
if (selectCollisionMode) {
  selectCollisionMode.addEventListener('change', (e) => {
    collisionMode = e.target.value;
  });
}

// 球体移动模式与动力学控件绑定
if (selectMotionMode) {
  selectMotionMode.addEventListener('change', (e) => {
    motionMode = e.target.value;
    statMotionMode.textContent = selectMotionMode.options[selectMotionMode.selectedIndex].text.split('(')[0].trim().toUpperCase();

    // 若开启轨道公转，初始化各天体公转轨道角和距离
    if (motionMode === 'orbit') {
      masses.forEach((m, idx) => {
        m.orbitDist = Math.max(12, Math.sqrt(m.position.x * m.position.x + m.position.z * m.position.z));
        m.orbitAngle = Math.atan2(m.position.z, m.position.x) || (idx * (Math.PI * 2 / masses.length));
      });
    } else if (motionMode === 'nbody') {
      masses.forEach(m => {
        const r = Math.max(10, Math.sqrt(m.position.x * m.position.x + m.position.z * m.position.z));
        const v = Math.sqrt((70.0 * (gridUniforms.uWellMul.value || 1.0)) / r);
        m.velocity.set(-m.position.z / r * v, 0, m.position.x / r * v);
      });
    }
  });
}

if (sliderMotionSpeed) {
  sliderMotionSpeed.addEventListener('input', (e) => {
    motionSpeed = parseFloat(e.target.value);
    valMotionSpeed.textContent = `${motionSpeed.toFixed(1)}x`;
  });
}

if (btnToggleMotion) {
  btnToggleMotion.addEventListener('click', () => {
    isMotionPlaying = !isMotionPlaying;
    btnToggleMotion.textContent = isMotionPlaying ? '⏸ 暂停运动' : '▶ 继续运动';
    btnToggleMotion.style.color = isMotionPlaying ? '#fde68a' : '#34d399';
  });
}

if (btnResetPositions) {
  btnResetPositions.addEventListener('click', () => {
    masses.forEach(m => {
      m.position.copy(m.basePos);
      m.velocity.copy(m.baseVel || new THREE.Vector3(0, 0, 0));
    });
    clearMassTrails();
    updateMassMeshes();
    updatePropertySliders();
    updateVelocityHUD();
  });
}

// 🎲 随机初始坐标系与互补切向速度
if (btnRandomize) {
  btnRandomize.addEventListener('click', () => {
    const maxR = currentHalf * 0.65;
    masses.forEach((m, idx) => {
      const angle = (idx / masses.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = (0.35 + Math.random() * 0.35) * maxR;
      m.position.set(
        Math.cos(angle) * dist,
        (Math.random() - 0.5) * (maxR * 0.25),
        Math.sin(angle) * dist
      );
      m.basePos.copy(m.position);

      const v = Math.sqrt((75.0 * (gridUniforms.uWellMul.value || 1.0)) / Math.max(dist, 10.0)) * (0.85 + Math.random() * 0.3);
      m.velocity.set(
        -Math.sin(angle) * v,
        (Math.random() - 0.5) * 0.4,
        Math.cos(angle) * v
      );
      m.baseVel.copy(m.velocity);
    });
    clearMassTrails();
    if (motionMode === 'static') {
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      statMotionMode.textContent = "TRUE N-BODY GRAVITY";
    }
    updateMassMeshes();
    updatePropertySliders();
    updateVelocityHUD();
  });
}

// 天体运行轨迹线控制
const checkMassTrails = document.getElementById('check-mass-trails');
if (checkMassTrails) {
  checkMassTrails.addEventListener('change', (e) => {
    isMassTrailsVisible = e.target.checked;
    for (const trailObj of massTrailsMap.values()) {
      trailObj.line.visible = isMassTrailsVisible;
    }
  });
}

const btnClearTrails = document.getElementById('btn-clear-trails');
if (btnClearTrails) {
  btnClearTrails.addEventListener('click', () => {
    clearMassTrails();
  });
}

// 动力学速度与逃逸速度控制按钮
const btnInjectOrbitV = document.getElementById('btn-inject-orbit-v');
if (btnInjectOrbitV) {
  btnInjectOrbitV.addEventListener('click', () => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (!cur || masses.length <= 1) return;
    const { vOrb, primaryMass } = calculateOrbitalParams(cur);
    if (!primaryMass || vOrb <= 0.01) return;

    const rVec = new THREE.Vector3().subVectors(cur.position, primaryMass.position);
    if (rVec.lengthSq() < 1e-4) rVec.set(1, 0, 0);

    let tangent = new THREE.Vector3().crossVectors(rVec, new THREE.Vector3(0, 1, 0)).normalize();
    if (tangent.lengthSq() < 1e-4) {
      tangent = new THREE.Vector3().crossVectors(rVec, new THREE.Vector3(0, 0, 1)).normalize();
    }

    cur.velocity.copy(tangent.multiplyScalar(vOrb));
    if (motionMode === 'static') {
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      statMotionMode.textContent = "TRUE N-BODY GRAVITY";
    }
    updateVelocityHUD();
  });
}

const btnInjectEscapeV = document.getElementById('btn-inject-escape-v');
if (btnInjectEscapeV) {
  btnInjectEscapeV.addEventListener('click', () => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (!cur || masses.length <= 1) return;
    const { vEsc, primaryMass } = calculateOrbitalParams(cur);
    if (!primaryMass || vEsc <= 0.01) return;

    let dir = cur.velocity.clone().normalize();
    if (dir.lengthSq() < 0.1) {
      const rVec = new THREE.Vector3().subVectors(cur.position, primaryMass.position);
      dir = new THREE.Vector3().crossVectors(rVec, new THREE.Vector3(0, 1, 0)).normalize();
    }

    cur.velocity.copy(dir.multiplyScalar(vEsc * 1.3));
    if (motionMode === 'static') {
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      statMotionMode.textContent = "TRUE N-BODY GRAVITY";
    }
    updateVelocityHUD();
  });
}

const btnZeroV = document.getElementById('btn-zero-v');
if (btnZeroV) {
  btnZeroV.addEventListener('click', () => {
    const cur = masses.find(m => m.id === selectedMassId);
    if (!cur) return;
    cur.velocity.set(0, 0, 0);
    updateVelocityHUD();
  });
}

// 场景预设应用
if (selectPreset) {
  selectPreset.addEventListener('change', (e) => {
    applyPreset(e.target.value);
  });
}

function setIntensityUI(val) {
  const numVal = parseFloat(val);
  if (sliderIntensity) sliderIntensity.value = numVal;
  const numIntensityEl = document.getElementById('num-intensity');
  if (numIntensityEl) numIntensityEl.value = numVal.toFixed(1);
  if (valIntensity) valIntensity.textContent = numVal.toFixed(2);
}

function applyPreset(type) {
  transformControls.detach();
  clearMassTrails();
  transientWaveBurst = 0.0;
  ringdownTau = 0.8;
  if (sliderWaves) sliderWaves.value = 0.0;
  if (valWaves) valWaves.textContent = "0.0";
  gridUniforms.uWaveAmp.value = 0.0;
  switch (type) {
    case "earthmoon":
      masses = [
        {
          id: "earth",
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
          radius: 8.0,
          mass: 80.0,
          textureType: 'hologram',
          color: 0x00E5FF,
          basePos: new THREE.Vector3(0, 0, 0),
          baseVel: new THREE.Vector3(0, 0, 0),
          orbitAngle: 0,
          orbitDist: 0
        },
        {
          id: "moon",
          position: new THREE.Vector3(26, 0, 0),
          velocity: new THREE.Vector3(0, 0, 2.77),
          radius: 2.8,
          mass: 1.0,
          textureType: 'quantum_wire',
          color: 0xBDC3C7,
          basePos: new THREE.Vector3(26, 0, 0),
          baseVel: new THREE.Vector3(0, 0, 2.77),
          orbitAngle: 0,
          orbitDist: 26
        }
      ];
      gridUniforms.uWellMul.value = 1.0;
      gridUniforms.uWaveAmp.value = 0.0;
      setIntensityUI(1.0);
      sliderWaves.value = 0.0;
      valWaves.textContent = "0.0";
      transientWaveBurst = 0.0;
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      break;

    case "blackhole":
      masses = [
        {
          id: "bh",
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
          radius: 4.0, // 视界极小
          mass: 180.0, // 引力质量巨大
          textureType: 'singularity',
          color: 0x111111,
          basePos: new THREE.Vector3(0, 0, 0),
          baseVel: new THREE.Vector3(0, 0, 0),
          orbitAngle: 0,
          orbitDist: 0
        }
      ];
      gridUniforms.uWellMul.value = 2.5;
      gridUniforms.uWaveAmp.value = 0.0;
      setIntensityUI(2.5);
      sliderWaves.value = 0.0;
      valWaves.textContent = "0.0";
      transientWaveBurst = 0.0;
      motionMode = 'static';
      selectMotionMode.value = 'static';
      break;

    case "binary":
      masses = [
        {
          id: "b1",
          position: new THREE.Vector3(-22, 0, 0),
          velocity: new THREE.Vector3(0, 0, -1.8),
          radius: 6.0,
          mass: 30.0,
          textureType: 'plasma_star',
          color: 0xF39C12,
          basePos: new THREE.Vector3(-22, 0, 0),
          baseVel: new THREE.Vector3(0, 0, -1.8),
          orbitAngle: Math.PI,
          orbitDist: 22
        },
        {
          id: "b2",
          position: new THREE.Vector3(22, 0, 0),
          velocity: new THREE.Vector3(0, 0, 1.8),
          radius: 6.0,
          mass: 30.0,
          textureType: 'hologram',
          color: 0x00A8FF,
          basePos: new THREE.Vector3(22, 0, 0),
          baseVel: new THREE.Vector3(0, 0, 1.8),
          orbitAngle: 0,
          orbitDist: 22
        }
      ];
      gridUniforms.uWellMul.value = 1.2;
      gridUniforms.uWaveAmp.value = 0.0;
      setIntensityUI(1.2);
      sliderWaves.value = 0.0;
      valWaves.textContent = "0.0";
      transientWaveBurst = 0.0;
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      collisionMode = 'bounce';
      if (selectCollisionMode) selectCollisionMode.value = 'bounce';
      isMassTrailsVisible = true;
      if (checkMassTrails) checkMassTrails.checked = true;
      break;

    case "triple":
      masses = [
        {
          id: "t1",
          position: new THREE.Vector3(-16.0, 3.0, 4.0),
          velocity: new THREE.Vector3(0.40, 1.25, -0.30),
          radius: 5.5,
          mass: 36.0,
          textureType: 'pulsar',
          color: 0xFF3366,
          basePos: new THREE.Vector3(-16.0, 3.0, 4.0),
          baseVel: new THREE.Vector3(0.40, 1.25, -0.30),
          orbitAngle: 0,
          orbitDist: 16.7
        },
        {
          id: "t2",
          position: new THREE.Vector3(20.0, -8.0, -5.0),
          velocity: new THREE.Vector3(-0.80, -1.50, 0.45),
          radius: 4.8,
          mass: 24.0,
          textureType: 'hologram',
          color: 0x00FF88,
          basePos: new THREE.Vector3(20.0, -8.0, -5.0),
          baseVel: new THREE.Vector3(-0.80, -1.50, 0.45),
          orbitAngle: Math.PI * 2 / 3,
          orbitDist: 22.0
        },
        {
          id: "t3",
          position: new THREE.Vector3(6.0, 10.0, 1.5),
          velocity: new THREE.Vector3(0.30, -0.5625, 0.0),
          radius: 3.8,
          mass: 16.0,
          textureType: 'dark_matter',
          color: 0xFFCC00,
          basePos: new THREE.Vector3(6.0, 10.0, 1.5),
          baseVel: new THREE.Vector3(0.30, -0.5625, 0.0),
          orbitAngle: Math.PI * 4 / 3,
          orbitDist: 11.8
        }
      ];
      gridUniforms.uWellMul.value = 1.0;
      gridUniforms.uWaveAmp.value = 0.0;
      setIntensityUI(1.0);
      sliderWaves.value = 0.0;
      valWaves.textContent = "0.0";
      transientWaveBurst = 0.0;
      motionMode = 'nbody';
      selectMotionMode.value = 'nbody';
      collisionMode = 'bounce'; // 关键：三体混沌必须为弹性碰撞反弹，避免因近距离掠过瞬间合并为两星或一星！
      if (selectCollisionMode) selectCollisionMode.value = 'bounce';
      isMassTrailsVisible = true;
      if (checkMassTrails) checkMassTrails.checked = true;
      break;

    case "grid":
      masses = [
        {
          id: "g1",
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
          radius: 5.0,
          mass: 15.0,
          textureType: 'hologram',
          color: 0x00E5FF,
          basePos: new THREE.Vector3(0, 0, 0),
          baseVel: new THREE.Vector3(0, 0, 0),
          orbitAngle: 0,
          orbitDist: 0
        }
      ];
      gridUniforms.uWellMul.value = 1.0;
      gridUniforms.uWaveAmp.value = 0.0;
      setIntensityUI(1.0);
      sliderWaves.value = 0.0;
      valWaves.textContent = "0.0";
      transientWaveBurst = 0.0;
      sliderDivs.value = 40;
      valDivs.textContent = "40";
      currentDivs = 40;
      rebuildGrid();
      motionMode = 'static';
      selectMotionMode.value = 'static';
      break;
  }
  selectedMassId = masses[0].id;
  updateMassDropdown();
  updateMassMeshes();
  attachGizmoToMass(selectedMassId);
  if (selectMotionMode) {
    statMotionMode.textContent = selectMotionMode.options[selectMotionMode.selectedIndex].text.split('(')[0].trim().toUpperCase();
  }
}

// 辅助更新下拉选项与滑块状态
function updateMassDropdown() {
  selectActiveMass.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "-- None (未选中/无坐标轴) --";
  if (!selectedMassId) noneOpt.selected = true;
  selectActiveMass.appendChild(noneOpt);

  masses.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    const typeLabel = m.textureType ? ` (${m.textureType.toUpperCase()})` : '';
    opt.textContent = `Body ${idx + 1}${typeLabel}`;
    if (m.id === selectedMassId) opt.selected = true;
    selectActiveMass.appendChild(opt);
  });
  btnDeleteMass.style.display = (selectedMassId && masses.length > 1) ? "inline-block" : "none";
}

function updatePropertySliders() {
  const cur = masses.find(m => m.id === selectedMassId);
  if (cur) {
    if (sliderRadius) {
      sliderRadius.value = cur.radius;
      valRadius.textContent = cur.radius.toFixed(1);
    }
    if (sliderMass) {
      sliderMass.value = Math.min(parseFloat(sliderMass.max) || 2000, cur.mass || 10.0);
    }
    const numMassEl = document.getElementById('num-mass');
    if (numMassEl && document.activeElement !== numMassEl) {
      numMassEl.value = (cur.mass || 10.0).toFixed(0);
    }
    if (selectTextureType) {
      selectTextureType.value = cur.textureType || 'sun';
    }

    if (sliderPosX) {
      sliderPosX.value = cur.position.x;
      valPosX.textContent = cur.position.x.toFixed(1);
    }
    if (sliderPosY) {
      sliderPosY.value = cur.position.y;
      valPosY.textContent = cur.position.y.toFixed(1);
    }
    if (sliderPosZ) {
      sliderPosZ.value = cur.position.z;
      valPosZ.textContent = cur.position.z.toFixed(1);
    }

    const nPx = document.getElementById('num-pos-x');
    const nPy = document.getElementById('num-pos-y');
    const nPz = document.getElementById('num-pos-z');
    if (nPx && document.activeElement !== nPx) nPx.value = cur.position.x.toFixed(1);
    if (nPy && document.activeElement !== nPy) nPy.value = cur.position.y.toFixed(1);
    if (nPz && document.activeElement !== nPz) nPz.value = cur.position.z.toFixed(1);

    const nVx = document.getElementById('num-vel-x');
    const nVy = document.getElementById('num-vel-y');
    const nVz = document.getElementById('num-vel-z');
    if (nVx && document.activeElement !== nVx) nVx.value = cur.velocity.x.toFixed(2);
    if (nVy && document.activeElement !== nVy) nVy.value = cur.velocity.y.toFixed(2);
    if (nVz && document.activeElement !== nVz) nVz.value = cur.velocity.z.toFixed(2);
  }
}

function updateStatsDisplay() {
  statActiveMasses.textContent = `${masses.length} / ${MAX_MASSES}`;
  statGridRes.textContent = `${currentDivs}³`;
}

// 关于弹窗交互 (支持关闭按钮、底部按钮、点击背景遮罩与 ESC 快捷键四种关闭方式)
function closeAboutModal() {
  if (aboutModal) aboutModal.classList.add('hidden');
}
function openAboutModal() {
  if (aboutModal) aboutModal.classList.remove('hidden');
}

if (btnOpenAbout) btnOpenAbout.addEventListener('click', openAboutModal);
if (btnCloseAbout) {
  btnCloseAbout.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAboutModal();
  });
}
if (btnBackToSim) {
  btnBackToSim.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAboutModal();
  });
}
if (aboutModal) {
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) {
      closeAboutModal();
    }
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aboutModal && !aboutModal.classList.contains('hidden')) {
    closeAboutModal();
  }
});

// 浮动 Tooltip 管理
const floatingTooltip = document.getElementById('floating-tooltip');
document.querySelectorAll('.info-tip').forEach(tip => {
  tip.addEventListener('mouseenter', (e) => {
    const text = tip.getAttribute('data-tip');
    if (text) {
      floatingTooltip.textContent = text;
      floatingTooltip.classList.remove('hidden');
      const rect = tip.getBoundingClientRect();
      floatingTooltip.style.top = `${rect.top - 8}px`;
      floatingTooltip.style.left = `${rect.left + rect.width / 2}px`;
    }
  });
  tip.addEventListener('mouseleave', () => {
    floatingTooltip.classList.add('hidden');
  });
});

// 12. 视口大小自适应
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 初始化天体网格与拖拽绑定
updateMassMeshes();
attachGizmoToMass(selectedMassId);

// 13. 主渲染与物理动画循环
let lastTime = performance.now();
const startTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const dt = rawDt;

  controls.update();

  const elapsedTime = (now - startTime) * 0.001;
  gridUniforms.uTime.value = elapsedTime;

  // 1. 球体自主运动引擎更新 (公转 / N-Body / 巡航)
  updateSphereMotion(dt);

  // 2. 天体轨道轨迹线记录与更新
  recordMassTrailPoints();

  // 3. 动力学速度与逃逸速度 HUD 实时刷新
  updateVelocityHUD();

  // 4. 粒子受引力物理更新 (含黑洞事件视界与宇宙吸积流场)
  updateParticles(dt);

  // 5. 天体全息扫描线与测地线框自转微动态更新
  massMeshesMap.forEach(group => {
    if (group && group.userData && group.userData.updateAnimation) {
      group.userData.updateAnimation(elapsedTime, dt);
    }
  });

  // 6. 物理真实引力波动态衰减 (静态滑块基础值 + 碰撞引起的黑洞准简正模 Ringdown 指数阻尼衰减)
  if (transientWaveBurst > 0.0003) {
    // 严格按准简正模 Ringdown 指数衰减：exp(-dt / tau)，能量随光速辐射消散
    transientWaveBurst *= Math.exp(-dt / Math.max(0.2, ringdownTau));
  } else {
    transientWaveBurst = 0.0;
  }
  const baseWave = sliderWaves ? (parseFloat(sliderWaves.value) || 0.0) : 0.0;
  gridUniforms.uWaveAmp.value = baseWave + transientWaveBurst;

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
