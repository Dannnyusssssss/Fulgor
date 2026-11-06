/**
 * Malla procedural de la arena: suelo con rejilla de neón dibujada en Canvas, paredes con bordes luminosos,
 * coberturas, luces y niebla. Todo se libera con `dispose()` al cambiar de arena.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
} from 'three';
import type { ArenaDef } from '../data/arenas';

export interface ArenaView {
  readonly group: Group;
  dispose(): void;
}

/** Textura de una celda de rejilla: fondo oscuro con borde luminoso. Se repite sobre el suelo. */
function createGridTexture(lineColor: number): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    const c = new Color(lineColor);
    ctx.strokeStyle = `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    // Marca tenue en el centro de cada celda para dar sensación de escala.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(size / 2 - 2, size / 2 - 2, 4, 4);
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildArenaView(scene: Scene, def: ArenaDef, shadows: boolean): ArenaView {
  const group = new Group();
  const p = def.palette;
  const hw = def.width / 2;
  const hd = def.depth / 2;
  const t = def.wallThickness;
  const h = def.wallHeight;

  scene.background = new Color(p.background);
  scene.fog = new Fog(p.fog, def.fogNear, def.fogFar);

  // Suelo: la rejilla brilla a través del mapa emisivo (celdas de 2 m).
  const gridTex = createGridTexture(p.grid);
  gridTex.repeat.set(def.width / 2, def.depth / 2);
  const floor = new Mesh(
    new PlaneGeometry(def.width + t * 2, def.depth + t * 2),
    new MeshStandardMaterial({
      color: p.floor,
      roughness: 0.8,
      metalness: 0.2,
      emissive: new Color(p.grid),
      emissiveMap: gridTex,
      emissiveIntensity: 0.4,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = shadows;
  group.add(floor);

  // Paredes con dos franjas de neón (abajo y arriba) en la cara interior.
  const wallMat = new MeshStandardMaterial({ color: p.wall, roughness: 0.7, metalness: 0.3 });
  const trimMat = new MeshBasicMaterial({ color: p.wallTrim });
  const walls: [number, number, number, number][] = [
    [0, -hd - t / 2, def.width + t * 2, t],
    [0, hd + t / 2, def.width + t * 2, t],
    [-hw - t / 2, 0, t, def.depth],
    [hw + t / 2, 0, t, def.depth],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new Mesh(new BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, h / 2, z);
    wall.receiveShadow = shadows;
    group.add(wall);
    for (const y of [0.08, h - 0.15]) {
      const trim = new Mesh(new BoxGeometry(w + 0.02, 0.06, d + 0.02), trimMat);
      trim.position.set(x, y, z);
      group.add(trim);
    }
  }

  // Coberturas: cajas con aristas de neón y columnas con anillos luminosos.
  const coverMat = new MeshStandardMaterial({ color: p.cover, roughness: 0.6, metalness: 0.35 });
  const edgeMat = new LineBasicMaterial({ color: p.coverTrim });
  const bandMat = new MeshBasicMaterial({ color: p.coverTrim });
  for (const c of def.covers) {
    if (c.kind === 'box') {
      const geo = new BoxGeometry(c.width, c.height, c.depth);
      const box = new Mesh(geo, coverMat);
      box.position.set(c.x, c.height / 2, c.z);
      box.castShadow = shadows;
      box.receiveShadow = shadows;
      group.add(box);
      const edges = new LineSegments(new EdgesGeometry(geo), edgeMat);
      edges.position.copy(box.position);
      group.add(edges);
    } else {
      const pillar = new Mesh(new CylinderGeometry(c.radius, c.radius, c.height, 10), coverMat);
      pillar.position.set(c.x, c.height / 2, c.z);
      pillar.castShadow = shadows;
      group.add(pillar);
      for (const y of [0.1, c.height * 0.55]) {
        const band = new Mesh(
          new CylinderGeometry(c.radius + 0.02, c.radius + 0.02, 0.08, 10, 1, true),
          bandMat,
        );
        band.position.set(c.x, y, c.z);
        group.add(band);
      }
    }
  }

  // Iluminación: luz ambiental de dos tonos y una sola luz direccional (con sombras solo en calidad Alta).
  const hemi = new HemisphereLight(p.hemiSky, p.hemiGround, 0.9);
  group.add(hemi);
  const sun = new DirectionalLight(0xc8d8ff, 1.1);
  sun.position.set(8, 16, 6);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    const cam = sun.shadow.camera;
    cam.left = -hw - 2;
    cam.right = hw + 2;
    cam.top = hd + 2;
    cam.bottom = -hd - 2;
    cam.near = 1;
    cam.far = 40;
  }
  group.add(sun);
  group.add(sun.target);

  scene.add(group);

  return {
    group,
    dispose(): void {
      scene.remove(group);
      disposeTree(group);
      scene.fog = null;
    },
  };
}

/** Libera geometrías, materiales y texturas de un árbol de objetos (sin liberar dos veces lo compartido). */
export function disposeTree(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else if (mat) materials.add(mat);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value && typeof value === 'object' && (value as Texture).isTexture)
        (value as Texture).dispose();
    }
    m.dispose();
  }
}
