import { describe, expect, it } from 'vitest';
import { InputMapper, emptyCommand } from '../src/core/input';
import { PREVENT_DEFAULT_CODES } from '../src/data/controls';

describe('InputMapper', () => {
  it('traduce WASD a movimiento local', () => {
    const input = new InputMapper(100);
    input.press('KeyW');
    input.press('KeyD');
    const cmd = input.fillCommand(emptyCommand(), 1.5);
    expect(cmd.moveZ).toBe(1);
    expect(cmd.moveX).toBe(1);
    expect(cmd.yaw).toBe(1.5);
    input.press('KeyS');
    expect(input.fillCommand(emptyCommand(), 0).moveZ).toBe(0);
  });

  it('las pulsaciones de esquiva y ventilado solo valen una vez', () => {
    const input = new InputMapper(100);
    input.press('ShiftLeft');
    expect(input.fillCommand(emptyCommand(), 0).dodge).toBe(true);
    expect(input.fillCommand(emptyCommand(), 0).dodge).toBe(false);
    // La repetición automática del teclado no genera otra pulsación.
    input.press('ShiftLeft');
    expect(input.fillCommand(emptyCommand(), 0).dodge).toBe(false);
    input.release('ShiftLeft');
    input.press('ShiftLeft');
    expect(input.fillCommand(emptyCommand(), 0).dodge).toBe(true);
  });

  it('una acción con varias teclas sigue pulsada mientras quede alguna', () => {
    const input = new InputMapper(100);
    input.press('Space');
    input.press('Mouse0');
    input.release('Space');
    expect(input.isHeld('fire')).toBe(true);
    input.release('Mouse0');
    expect(input.isHeld('fire')).toBe(false);
  });

  it('las flechas giran la cámara', () => {
    const input = new InputMapper(100);
    input.press('ArrowLeft');
    expect(input.turnAxisX()).toBe(-1);
    input.press('ArrowUp');
    expect(input.turnAxisY()).toBe(1);
  });

  it('recorta los saltos anómalos del ratón e ignora valores no finitos', () => {
    const input = new InputMapper(100);
    input.addLook(5000, -5000);
    input.addLook(Number.NaN, 3);
    input.addLook(10, 10);
    const look = { x: 0, y: 0 };
    input.consumeLook(look);
    expect(look).toEqual({ x: 110, y: -90 });
    input.consumeLook(look);
    expect(look).toEqual({ x: 0, y: 0 });
  });

  it('ignora teclas que no son del juego y suelta todo al perder el foco', () => {
    const input = new InputMapper(100);
    expect(input.press('Tab')).toBeNull();
    expect(input.press('ControlLeft')).toBeNull();
    input.press('KeyW');
    input.releaseAll();
    expect(input.isHeld('moveForward')).toBe(false);
  });

  it('solo se bloquean por defecto las flechas y el espacio', () => {
    expect([...PREVENT_DEFAULT_CODES].sort()).toEqual(
      ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].sort(),
    );
    expect(PREVENT_DEFAULT_CODES.has('Tab')).toBe(false);
    expect(PREVENT_DEFAULT_CODES.has('Escape')).toBe(false);
  });
});
