"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Scene } from "@/domain/threed";

interface Scene3DProps {
  scene: Scene;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  });
}

export function Scene3D({ scene }: Scene3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xdfe7dd, 1);
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
    const sceneRoot = new THREE.Scene();
    sceneRoot.background = new THREE.Color(0xdfe7dd);
    sceneRoot.fog = new THREE.Fog(0xdfe7dd, 70, 180);

    const centre = new THREE.Vector3(scene.plot.centre.x, Math.max(1.2, scene.bounds.height / 2), -scene.plot.centre.y);
    const diagonal = Math.max(scene.bounds.width, scene.bounds.depth, scene.bounds.height);
    let radius = diagonal * 2.05;
    let theta = -0.72;
    let phi = 1.03;

    const target = centre.clone();
    const updateCamera = () => {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    };
    updateCamera();

    sceneRoot.add(new THREE.HemisphereLight(0xfff6e4, 0x6a7d66, 1.45));
    const sun = new THREE.DirectionalLight(0xfff1d1, 2.1);
    sun.position.set(-diagonal * 0.6, diagonal * 1.25, diagonal * 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -diagonal;
    sun.shadow.camera.right = diagonal;
    sun.shadow.camera.top = diagonal;
    sun.shadow.camera.bottom = -diagonal;
    sun.shadow.camera.far = diagonal * 4;
    sun.shadow.bias = -0.0004;
    sceneRoot.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
    fill.position.set(diagonal, diagonal * 0.5, -diagonal);
    sceneRoot.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(scene.bounds.width * 2.6, scene.bounds.depth * 2.6),
      new THREE.MeshStandardMaterial({ color: 0xcbd6c6, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(scene.plot.centre.x, -0.14, -scene.plot.centre.y);
    ground.receiveShadow = true;
    sceneRoot.add(ground);

    const site = new THREE.Mesh(
      new THREE.PlaneGeometry(scene.plot.width, scene.plot.depth),
      new THREE.MeshStandardMaterial({ color: 0xe7e0d0, roughness: 0.96 }),
    );
    site.rotation.x = -Math.PI / 2;
    site.position.set(scene.plot.centre.x, -0.05, -scene.plot.centre.y);
    site.receiveShadow = true;
    sceneRoot.add(site);

    const grid = new THREE.GridHelper(
      Math.max(scene.plot.width, scene.plot.depth) * 1.5,
      Math.round(Math.max(scene.plot.width, scene.plot.depth) * 1.5),
      0xb4bfae,
      0xc6d0c1,
    );
    grid.position.set(scene.plot.centre.x, -0.035, -scene.plot.centre.y);
    sceneRoot.add(grid);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    for (const box of scene.boxes) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(box.color),
        roughness: box.kind === "glass" ? 0.16 : 0.82,
        metalness: box.kind === "glass" ? 0.15 : 0.02,
        transparent: box.kind === "glass",
        opacity: box.kind === "glass" ? 0.42 : 1,
      });
      const mesh = new THREE.Mesh(unitBox, material);
      mesh.position.set(box.center[0], box.center[1], box.center[2]);
      mesh.scale.set(Math.max(0.01, box.size[0]), Math.max(0.01, box.size[1]), Math.max(0.01, box.size[2]));
      mesh.rotation.y = -box.rotation;
      mesh.castShadow = box.kind !== "floor" && box.kind !== "slab" && box.kind !== "amenity";
      mesh.receiveShadow = true;
      group.add(mesh);

      if (box.kind === "wall" || box.kind === "parapet") {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(unitBox),
          new THREE.LineBasicMaterial({ color: 0x6f7869, transparent: true, opacity: 0.24 }),
        );
        edges.position.copy(mesh.position);
        edges.scale.copy(mesh.scale);
        edges.rotation.copy(mesh.rotation);
        group.add(edges);
      }
    }

    for (const stair of scene.stairs) {
      for (const step of stair.steps) {
        const mesh = new THREE.Mesh(
          unitBox,
          new THREE.MeshStandardMaterial({ color: 0xbfc4bb, roughness: 0.9 }),
        );
        mesh.position.set(step.center[0], step.center[1], step.center[2]);
        mesh.scale.set(Math.max(0.01, step.size[0]), Math.max(0.01, step.size[1]), Math.max(0.01, step.size[2]));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    sceneRoot.add(group);

    const resize = () => {
      if (disposed) return;
      const width = host.clientWidth || 640;
      const height = host.clientHeight || 460;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const canvas = renderer.domElement;
    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      theta -= dx * 0.007;
      phi = Math.max(0.18, Math.min(1.48, phi + dy * 0.006));
      updateCamera();
    };
    const onUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius = Math.max(diagonal * 0.8, Math.min(diagonal * 5.5, radius + event.deltaY * 0.025));
      updateCamera();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let frame = 0;
    const render = () => {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      renderer.render(sceneRoot, camera);
    };
    render();

    const reset = () => {
      radius = diagonal * 2.05;
      theta = -0.72;
      phi = 1.03;
      target.copy(centre);
      updateCamera();
    };
    host.addEventListener("vastiqx-reset-view", reset as EventListener);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      host.removeEventListener("vastiqx-reset-view", reset as EventListener);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      disposeGroup(group);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      site.geometry.dispose();
      (site.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (canvas.parentElement === host) host.removeChild(canvas);
    };
  }, [scene]);

  return (
    <div className="viewer-3d" ref={hostRef}>
      <div className="viewer-hint">Drag to orbit · scroll to zoom · {scene.counts.boxes} boxes · {scene.counts.rooms} rooms</div>
    </div>
  );
}
