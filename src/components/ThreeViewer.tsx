import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GrillageModel } from '../types/bridge';
import type { StressCheckResult } from '../types/bridge';

interface Props {
  model: GrillageModel;
  stressChecks?: StressCheckResult[];
  selectedGirder?: number;
}

// Map stress ratio to color (green→yellow→red)
function stressColor(ratio: number): THREE.Color {
  const r = Math.min(1, ratio * 2);
  const g = Math.min(1, 2 - ratio * 2);
  return new THREE.Color(r, g, 0.1);
}

export function ThreeViewer({ model, stressChecks, selectedGirder }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animId: number;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth  || 600;
    const H = mount.clientHeight || 280;

    // Scene
    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 1, 1_000_000);
    const cx = model.spanLength / 2;
    const cy = model.totalWidth  / 2;
    const diag = Math.sqrt(model.spanLength ** 2 + model.totalWidth ** 2);
    camera.position.set(cx, cy - diag * 0.3, diag * 0.8);
    camera.lookAt(cx, cy, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, cy, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 3);
    scene.add(dir);

    // Grid
    const gridHelper = new THREE.GridHelper(
      Math.max(model.spanLength, model.totalWidth) * 1.4,
      10, 0x1e293b, 0x1e293b
    );
    gridHelper.position.set(cx, cy, -50);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    // Build geometry
    const tubeRadius = Math.max(model.spanLength, 1) * 0.004;

    for (const beam of model.beams) {
      const ni = model.nodes[beam.nodeI];
      const nj = model.nodes[beam.nodeJ];
      if (!ni || !nj) continue;

      const start = new THREE.Vector3(ni.x, ni.y, ni.z);
      const end   = new THREE.Vector3(nj.x, nj.y, nj.z);
      const path  = new THREE.LineCurve3(start, end);

      let color: THREE.Color;
      let radius = tubeRadius;

      if (beam.type === 'main') {
        // Which girder row?
        const gIdx = Math.round(ni.y / (model.girderSpacing || 1));
        if (stressChecks && stressChecks[gIdx]) {
          color = stressColor(stressChecks[gIdx].ratio_b);
        } else {
          color = new THREE.Color(0x3b82f6);
        }
        if (gIdx === selectedGirder) {
          radius = tubeRadius * 1.8;
          color = new THREE.Color(0xfbbf24);
        }
      } else {
        color = new THREE.Color(0x475569);
        radius = tubeRadius * 0.7;
      }

      const geo = new THREE.TubeGeometry(path, 1, radius, 6, false);
      const mat = new THREE.MeshLambertMaterial({ color });
      scene.add(new THREE.Mesh(geo, mat));
    }

    // Nodes
    const nodeGeo = new THREE.SphereGeometry(tubeRadius * 1.2, 8, 8);
    for (const node of model.nodes) {
      const mat = new THREE.MeshLambertMaterial({
        color: node.isSupport ? 0xf59e0b : 0x64748b,
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.set(node.x, node.y, node.z);
      scene.add(mesh);
    }

    // Diagonals (red / orange tubes)
    const diagRadius = tubeRadius * 0.55;
    for (const diag of (model.diagonals ?? [])) {
      const ni = model.nodes[diag.nodeI];
      const nj = model.nodes[diag.nodeJ];
      if (!ni || !nj) continue;
      const start = new THREE.Vector3(ni.x, ni.y, ni.z);
      const end   = new THREE.Vector3(nj.x, nj.y, nj.z);
      const path  = new THREE.LineCurve3(start, end);
      const geo   = new THREE.TubeGeometry(path, 1, diagRadius, 5, false);
      const mat   = new THREE.MeshLambertMaterial({ color: 0xef4444 });
      scene.add(new THREE.Mesh(geo, mat));
    }

    // Support cones
    for (const node of model.nodes) {
      if (!node.isSupport) continue;
      const coneGeo = new THREE.ConeGeometry(tubeRadius * 2, tubeRadius * 5, 6);
      const coneMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(node.x, node.y, -tubeRadius * 3);
      cone.rotation.x = Math.PI;
      scene.add(cone);
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    // Animation loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, scene, camera, controls, animId };

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [model, stressChecks, selectedGirder]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid #334155', background: '#0f172a' }}
    />
  );
}
