/**
 * Chispa: robot pequeño low-poly hecho con geometría procedural, con un arma de energía en la mano derecha.
 * El modelo mira hacia -z (igual que la convención de yaw de la lógica).
 */
import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  type Scene,
} from 'three';
import { disposeTree } from './arena-mesh';

const BODY = 0xd9e2f2;
const ACCENT = 0x37e0ff;
const DARK = 0x222a3d;

export class PlayerMesh {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly legL: Mesh;
  private readonly legR: Mesh;
  private readonly visorMat: MeshBasicMaterial;
  private readonly muzzleMat: MeshBasicMaterial;
  private readonly gun: Mesh;
  private readonly muzzle: Mesh;
  private walkPhase = 0;
  private weaponSlot = -1;

  constructor(
    private readonly scene: Scene,
    shadows: boolean,
  ) {
    const shell = new MeshStandardMaterial({
      color: BODY,
      roughness: 0.45,
      metalness: 0.3,
      flatShading: true,
    });
    const dark = new MeshStandardMaterial({
      color: DARK,
      roughness: 0.7,
      metalness: 0.4,
      flatShading: true,
    });
    this.visorMat = new MeshBasicMaterial({ color: ACCENT });
    this.muzzleMat = new MeshBasicMaterial({ color: ACCENT });

    // Torso: dodecaedro achatado.
    const torso = new Mesh(new DodecahedronGeometry(0.36, 0), shell);
    torso.scale.set(1, 1.15, 0.9);
    torso.position.y = 0.78;
    torso.castShadow = shadows;
    this.body.add(torso);

    // Visor luminoso en la cara frontal.
    const visor = new Mesh(new BoxGeometry(0.38, 0.1, 0.08), this.visorMat);
    visor.position.set(0, 0.9, -0.3);
    this.body.add(visor);

    // Antena con punta de energía.
    const antenna = new Mesh(new CylinderGeometry(0.015, 0.015, 0.25, 4), dark);
    antenna.position.set(0.12, 1.25, 0);
    this.body.add(antenna);
    const tip = new Mesh(new OctahedronGeometry(0.05, 0), this.visorMat);
    tip.position.set(0.12, 1.4, 0);
    this.body.add(tip);

    // Brazo y arma en la mano derecha, apuntando hacia delante.
    const arm = new Mesh(new BoxGeometry(0.12, 0.12, 0.3), dark);
    arm.position.set(0.36, 0.75, -0.12);
    this.body.add(arm);
    this.gun = new Mesh(new BoxGeometry(0.13, 0.15, 0.5), shell);
    this.gun.position.set(0.38, 0.78, -0.42);
    this.gun.castShadow = shadows;
    this.body.add(this.gun);
    this.muzzle = new Mesh(new BoxGeometry(0.09, 0.09, 0.06), this.muzzleMat);
    this.muzzle.position.set(0.38, 0.78, -0.7);
    this.body.add(this.muzzle);
    this.setWeapon(0);

    // Piernas cortas.
    const legGeo = new BoxGeometry(0.13, 0.36, 0.16);
    this.legL = new Mesh(legGeo, dark);
    this.legR = new Mesh(legGeo, dark);
    this.legL.position.set(-0.14, 0.2, 0);
    this.legR.position.set(0.14, 0.2, 0);
    this.body.add(this.legL, this.legR);

    this.root.add(this.body);
    scene.add(this.root);
  }

  /**
   * Coloca el modelo. `speed` en m/s para animar los pasos; `dodging` inclina el cuerpo;
   * `heatFraction` tiñe la boca del arma (señal visual de calor).
   */
  update(
    x: number,
    z: number,
    yaw: number,
    speed: number,
    dodging: boolean,
    heatFraction: number,
    dt: number,
  ): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.walkPhase += dt * speed * 2.2;
    const swing = Math.min(1, speed / 6) * 0.45;
    this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
    this.body.rotation.x = dodging ? -0.35 : 0;
    // De cian (frío) a naranja (caliente), sin parpadeo.
    const h = Math.min(1, Math.max(0, heatFraction));
    this.muzzleMat.color.setRGB(0.22 + 0.78 * h, 0.88 - 0.38 * h, 1 - 0.85 * h);
  }

  /** Forma del arma según la ranura: el Dispersor es corto y ancho; el Rayo, largo y fino. */
  setWeapon(slot: number): void {
    if (slot === this.weaponSlot) return;
    this.weaponSlot = slot;
    const sx = slot === 1 ? 1.6 : slot === 2 ? 0.75 : 1;
    const sz = slot === 1 ? 0.75 : slot === 2 ? 1.35 : 1;
    this.gun.scale.set(sx, slot === 1 ? 1.2 : 1, sz);
    this.gun.position.z = -0.17 - 0.25 * sz;
    this.muzzle.scale.set(sx, 1, 1);
    this.muzzle.position.z = -0.2 - 0.5 * sz;
  }

  private shown = true;
  private tooClose = false;

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.root.visible = this.shown && !this.tooClose;
  }

  /** Con la cámara pegada a Chispa (junto a una pared), el modelo se oculta para no tapar la vista. */
  setCameraTooClose(tooClose: boolean): void {
    this.tooClose = tooClose;
    this.root.visible = this.shown && !this.tooClose;
  }

  dispose(): void {
    this.scene.remove(this.root);
    disposeTree(this.root);
  }
}
