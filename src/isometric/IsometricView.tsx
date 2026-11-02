/**
 * Planform 3D Isometric View
 * View-only, synchronized architectural 3D visualization using Three.js and OrbitControls
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Project } from '../model/types';
import { distance, wallLength } from '../geometry/pureGeometry';
import { RotateCw, ZoomIn, ZoomOut, Maximize2, RefreshCw, Box, Eye, EyeOff } from 'lucide-react';

interface IsometricViewProps {
  project: Project;
}

export const IsometricView: React.FC<IsometricViewProps> = ({ project }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Persistent Three.js references
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const wallGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const initialFitDoneRef = useRef<boolean>(false);

  const [hasWalls, setHasWalls] = useState<boolean>(false);
  const [seeThroughFrontWalls, setSeeThroughFrontWalls] = useState<boolean>(false);
  const seeThroughRef = useRef<boolean>(false);
  seeThroughRef.current = seeThroughFrontWalls;

  // Track all wall meshes for dynamic camera-facing transparency updates
  const wallMeshesRef = useRef<Array<{ mesh: THREE.Mesh; edgeLines: THREE.LineSegments }>>([]);

  // Fit camera to current model bounds
  const fitModelToView = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const wallGroup = wallGroupRef.current;
    if (!camera || !controls || !wallGroup) return;

    const wallsList = Object.values(project.walls);
    if (wallsList.length === 0) {
      controls.target.set(0, 0, 0);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }

    const bbox = new THREE.Box3().setFromObject(wallGroup);
    if (bbox.isEmpty()) {
      controls.target.set(0, 0, 0);
      return;
    }

    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    controls.target.copy(center);

    const maxDim = Math.max(size.x, size.z, size.y, 4);
    const container = containerRef.current;
    const aspect = container && container.clientHeight > 0 ? container.clientWidth / container.clientHeight : 0.5;

    // Aspect-ratio-aware framing to ensure entire building fits in both portrait and landscape
    const projectedWidth = (size.x + size.z) * 0.9;
    const projectedHeight = (size.x + size.z) * 0.5 + size.y;
    const fitHoriz = (15 * aspect) / Math.max(projectedWidth * 1.3, 3);
    const fitVert = 15 / Math.max(projectedHeight * 1.3, 3);
    const targetZoom = Math.min(fitHoriz, fitVert);

    camera.zoom = Math.max(0.15, Math.min(4, targetZoom));
    camera.updateProjectionMatrix();
    controls.update();
  }, [project.walls]);

  // Reset camera to classic architectural isometric orientation
  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // Standard architectural 3/4 isometric perspective vector
    camera.position.set(controls.target.x + 25, controls.target.y + 22, controls.target.z + 25);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  }, []);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 500;
    const aspect = width / height;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a'); // slate-900 architectural background
    sceneRef.current = scene;

    // 2. Orthographic Camera with 15m frustum
    const frustumSize = 15;
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    camera.position.set(25, 22, 25);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    // 3. Renderer with antialias
    // 3. Renderer with antialias
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'default',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go below ground
    controls.minPolarAngle = 0.1;
    controls.minZoom = 0.15;
    controls.maxZoom = 8;
    controls.target.set(0, 1.5, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.7);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 25;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.4);
    fillLight.position.set(-20, 20, -20);
    scene.add(fillLight);

    // 6. Ground plane & subtle architectural grid
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(60, 60, 0x334155, 0x1e293b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // 7. Wall Group container
    const wallGroup = new THREE.Group();
    scene.add(wallGroup);
    wallGroupRef.current = wallGroup;

    // 8. Dynamic Animation loop with Front-Wall Cutaway updates
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();

      // If See-Through Front Walls is active, calculate distance relative to camera position
      if (seeThroughRef.current && camera && controls) {
        const targetDist = camera.position.distanceTo(controls.target);

        for (const item of wallMeshesRef.current) {
          const mesh = item.mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const lineMat = item.edgeLines.material as THREE.LineBasicMaterial;

          const wallDist = camera.position.distanceTo(mesh.position);

          // Walls closer to the camera than the center target are in the foreground
          if (wallDist < targetDist - 0.25) {
            // Foreground camera-facing wall: semi-transparent cutaway glass
            mesh.renderOrder = 10;
            mat.opacity = 0.22;
            mat.depthWrite = false;
            mesh.castShadow = false;
            item.edgeLines.renderOrder = 11;
            lineMat.opacity = 0.35;
          } else {
            // Background/side wall: solid opaque architectural plaster
            mesh.renderOrder = 0;
            mat.opacity = 1.0;
            mat.depthWrite = true;
            mesh.castShadow = true;
            item.edgeLines.renderOrder = 1;
            lineMat.opacity = 1.0;
          }
        }
      } else {
        // Reset full opacity on all walls
        for (const item of wallMeshesRef.current) {
          const mesh = item.mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const lineMat = item.edgeLines.material as THREE.LineBasicMaterial;
          mesh.renderOrder = 0;
          mat.opacity = 1.0;
          mat.depthWrite = true;
          mesh.castShadow = true;
          item.edgeLines.renderOrder = 1;
          lineMat.opacity = 1.0;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const asp = w / h;
      camera.left = (-frustumSize * asp) / 2;
      camera.right = (frustumSize * asp) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update wall meshes with Revit-style Butt Joins whenever project geometry changes
  useEffect(() => {
    const wallGroup = wallGroupRef.current;
    if (!wallGroup) return;

    // Clean up existing wall meshes
    while (wallGroup.children.length > 0) {
      const child = wallGroup.children[0] as THREE.Mesh;
      wallGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
    wallMeshesRef.current = [];

    const walls = Object.values(project.walls);
    const points = project.points;
    setHasWalls(walls.length > 0);

    // Architectural plaster material pre-configured with transparent: true for glitch-free transitions
    const createWallMat = () =>
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9, // slate-100 clean architectural plaster
        roughness: 0.6,
        metalness: 0.05,
        transparent: true,
        opacity: 1.0,
        depthWrite: true,
      });

    const createEdgeMat = () =>
      new THREE.LineBasicMaterial({
        color: 0x475569, // slate-600 subtle architectural silhouette edge
        linewidth: 1,
        transparent: true,
        opacity: 1.0,
      });

    // Helper: find connected walls at a given point
    const getConnectedWalls = (ptId: string, excludeWallId: string) =>
      walls.filter(
        (w) => w.id !== excludeWallId && (w.startPointId === ptId || w.endPointId === ptId)
      );

    // Helper: determine trim offset at an endpoint (Revit-style butt join)
    const computeButtJoinTrim = (
      currentWall: (typeof walls)[0],
      isStartPoint: boolean
    ): number => {
      const ptId = isStartPoint ? currentWall.startPointId : currentWall.endPointId;
      const otherPtId = isStartPoint ? currentWall.endPointId : currentWall.startPointId;
      const pCurrent = points[ptId];
      const pOther = points[otherPtId];
      if (!pCurrent || !pOther) return 0;

      const currentLen = distance(pCurrent, pOther);
      if (currentLen <= 0.001) return 0;

      const connected = getConnectedWalls(ptId, currentWall.id);
      if (connected.length === 0) return 0;

      const defaultT = project.defaultWallThickness || 0.15;
      const currentT = currentWall.thickness || defaultT;

      // Current wall direction outward from junction
      const ux = (pOther.x - pCurrent.x) / currentLen;
      const uy = (pOther.y - pCurrent.y) / currentLen;

      // 1. Check for T-junction: Are 2 connected walls collinear (through-wall)?
      for (let i = 0; i < connected.length; i++) {
        for (let j = i + 1; j < connected.length; j++) {
          const wA = connected[i];
          const wB = connected[j];
          const pAOther = points[wA.startPointId === ptId ? wA.endPointId : wA.startPointId];
          const pBOther = points[wB.startPointId === ptId ? wB.endPointId : wB.startPointId];
          if (!pAOther || !pBOther) continue;

          const lenA = distance(pCurrent, pAOther);
          const lenB = distance(pCurrent, pBOther);
          if (lenA < 0.001 || lenB < 0.001) continue;

          const uAx = (pAOther.x - pCurrent.x) / lenA;
          const uAy = (pAOther.y - pCurrent.y) / lenA;
          const uBx = (pBOther.x - pCurrent.x) / lenB;
          const uBy = (pBOther.y - pCurrent.y) / lenB;

          // Collinear check (pointing in opposite directions)
          const dotAB = uAx * uBx + uAy * uBy;
          if (dotAB < -0.85) {
            // wA and wB form the continuous through wall!
            // Current wall is the T-junction stem -> butt against through wall
            const throughT = wA.thickness || defaultT;
            const dotWithThrough = Math.abs(ux * uAx + uy * uAy);
            const sinAngle = Math.max(0.35, Math.sqrt(Math.max(0, 1 - dotWithThrough * dotWithThrough)));
            return Math.min((throughT / 2) / sinAngle, throughT * 1.5);
          }
        }
      }

      // 2. Corner L-Join or Multi-Join: Determine primary vs secondary
      // Primary is the longest wall (or lowest ID string as tie-breaker)
      const neighbor = connected[0];
      const pNbOther = points[neighbor.startPointId === ptId ? neighbor.endPointId : neighbor.startPointId];
      if (!pNbOther) return 0;
      const nbLen = distance(pCurrent, pNbOther);
      const nbT = neighbor.thickness || defaultT;

      const isCurrentPrimary =
        currentLen > nbLen || (Math.abs(currentLen - nbLen) < 0.01 && currentWall.id < neighbor.id);

      if (isCurrentPrimary) {
        // Primary wall stays continuous and extends flush with neighbor's outer face
        return -(nbT / 2);
      } else {
        // Secondary wall trims back flush against primary wall's side face
        const nbUx = (pNbOther.x - pCurrent.x) / Math.max(0.001, nbLen);
        const nbUy = (pNbOther.y - pCurrent.y) / Math.max(0.001, nbLen);
        const dot = ux * nbUx + uy * nbUy;
        const sinAngle = Math.max(0.35, Math.sqrt(Math.max(0, 1 - dot * dot)));
        return Math.min((nbT / 2) / sinAngle, nbT * 1.5);
      }
    };

    // Build Revit-style joined wall meshes with sharp corners and zero overlap
    for (const wall of walls) {
      const p1 = points[wall.startPointId];
      const p2 = points[wall.endPointId];
      if (!p1 || !p2) continue;

      const rawLen = distance(p1, p2);
      if (rawLen <= 0.05) continue;

      const height = wall.height || project.defaultWallHeight || 3.0;
      const thickness = wall.thickness || project.defaultWallThickness || 0.15;

      const trimStart = computeButtJoinTrim(wall, true);
      const trimEnd = computeButtJoinTrim(wall, false);

      const ux = (p2.x - p1.x) / rawLen;
      const uy = (p2.y - p1.y) / rawLen;

      let effectiveLen = rawLen - trimStart - trimEnd;
      let effectiveStart = { x: p1.x + ux * trimStart, y: p1.y + uy * trimStart };
      let effectiveEnd = { x: p2.x - ux * trimEnd, y: p2.y - uy * trimEnd };

      // Safety fallback for very short wall segments
      if (effectiveLen < 0.05) {
        effectiveLen = rawLen;
        effectiveStart = p1;
        effectiveEnd = p2;
      }

      const boxGeo = new THREE.BoxGeometry(effectiveLen, height, thickness);
      const wallMat = createWallMat();
      const wallMesh = new THREE.Mesh(boxGeo, wallMat);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;

      const centerX = (effectiveStart.x + effectiveEnd.x) / 2;
      const centerY = height / 2;
      const centerZ = (effectiveStart.y + effectiveEnd.y) / 2;
      wallMesh.position.set(centerX, centerY, centerZ);

      const theta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      wallMesh.rotation.y = -theta;

      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const posAttr = edgesGeo.attributes.position;
      const isStartJoined = getConnectedWalls(wall.startPointId, wall.id).length > 0;
      const isEndJoined = getConnectedWalls(wall.endPointId, wall.id).length > 0;

      const halfL = effectiveLen / 2;
      const filteredPositions: number[] = [];

      for (let i = 0; i < posAttr.count; i += 2) {
        const x1 = posAttr.getX(i);
        const y1 = posAttr.getY(i);
        const z1 = posAttr.getZ(i);
        const x2 = posAttr.getX(i + 1);
        const y2 = posAttr.getY(i + 1);
        const z2 = posAttr.getZ(i + 1);

        const onStartCap = Math.abs(x1 - -halfL) < 0.005 && Math.abs(x2 - -halfL) < 0.005;
        const onEndCap = Math.abs(x1 - halfL) < 0.005 && Math.abs(x2 - halfL) < 0.005;

        // Skip internal interface lines if joined to another wall!
        if (isStartJoined && onStartCap) continue;
        if (isEndJoined && onEndCap) continue;

        filteredPositions.push(x1, y1, z1, x2, y2, z2);
      }

      const cleanEdgesGeo = new THREE.BufferGeometry();
      cleanEdgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
      edgesGeo.dispose();

      const edgeLines = new THREE.LineSegments(cleanEdgesGeo, createEdgeMat());
      wallMesh.add(edgeLines);

      wallGroup.add(wallMesh);
      wallMeshesRef.current.push({ mesh: wallMesh, edgeLines });
    }

    // Auto fit only on first load if walls exist
    if (!initialFitDoneRef.current && walls.length > 0) {
      initialFitDoneRef.current = true;
      fitModelToView();
      resetCamera();
    }
  }, [project.walls, project.points, project.defaultWallHeight, project.defaultWallThickness, fitModelToView, resetCamera]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-900" data-testid="isometric-view">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full touch-none" />

      {/* Empty State Banner */}
      {!hasWalls && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 pointer-events-none text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-3 backdrop-blur-md shadow-xl text-slate-400">
            <Box className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">No Walls in 3D Yet</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Switch back to the <span className="text-amber-400 font-medium">Plan</span> tab to draw walls. Your building will instantly render in 3D.
          </p>
        </div>
      )}

      {/* Architectural Isometric Viewport HUD Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 pointer-events-auto">
        <button
          onClick={() => setSeeThroughFrontWalls((prev) => !prev)}
          aria-label={seeThroughFrontWalls ? 'Solid Walls' : 'See-Through Front Walls'}
          title={seeThroughFrontWalls ? 'Solid Walls' : 'See-Through Front Walls (Cutaway)'}
          data-testid="toggle-see-through-btn"
          className={`w-10 h-10 rounded-xl border backdrop-blur-md shadow-lg flex items-center justify-center active:scale-95 transition-all ${
            seeThroughFrontWalls
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 ring-2 ring-amber-500/30'
              : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700/80'
          }`}
        >
          {seeThroughFrontWalls ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
        </button>

        <button
          onClick={fitModelToView}
          aria-label="Fit Model in 3D View"
          title="Fit Model"
          className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 backdrop-blur-md shadow-lg flex items-center justify-center active:scale-95 transition-all"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={resetCamera}
          aria-label="Reset Camera to Isometric View"
          title="Reset Camera"
          className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 backdrop-blur-md shadow-lg flex items-center justify-center active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Hint Banner */}
      <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 flex items-center justify-between sm:justify-start gap-3 pointer-events-none">
        <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 backdrop-blur-md text-[11px] text-slate-300 shadow">
          <span className="font-semibold text-amber-400">Isometric 3D</span> • 1 finger rotate • 2 fingers pan/zoom
        </div>
      </div>
    </div>
  );
};
