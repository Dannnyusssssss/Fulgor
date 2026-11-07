/**
 * Valores de equilibrio y de configuración del juego. Nada de números mágicos dispersos:
 * todo lo que se ajusta vive aquí o en los otros archivos de `src/data/`.
 */
export type Quality = 'low' | 'medium' | 'high';

export const BALANCE = {
  sim: {
    /** Frecuencia de la lógica. */
    stepHz: 60,
    /** Tope de tiempo real por frame. */
    maxFrameSeconds: 0.25,
  },

  /** Duración mínima de cualquier aviso de ataque enemigo (ninguna IA puede atacar antes). */
  telegraph: {
    minSeconds: 0.4,
  },

  player: {
    radius: 0.45,
    speed: 6,
    /** Multiplicador de velocidad mientras se apunta con precisión. */
    aimSpeedMultiplier: 0.55,
    /** Qué tan rápido la velocidad alcanza la deseada (suavizado exponencial). */
    acceleration: 18,
    maxHealth: 100,
    maxShield: 50,
    /** Segundos sin recibir daño antes de que el escudo empiece a regenerarse. */
    shieldRegenDelay: 3,
    /** Escudo recuperado por segundo. */
    shieldRegenRate: 15,
    /** Bajo este porcentaje de vida se muestra el aviso de vida baja. */
    lowHealthFraction: 0.3,
    dodge: {
      duration: 0.22,
      speed: 15,
      invulnerability: 0.26,
      cooldown: 0.9,
    },
  },

  /** Presupuesto de destellos: como máximo 3 en cualquier ventana de 1 s. */
  flash: {
    maxPerWindow: 3,
    windowSeconds: 1,
  },

  /** Director de oleadas (presupuestos y composición en waves.ts; topes por dificultad en difficulty.ts). */
  director: {
    wavesPerArena: 10,
    /** Descanso antes de la primera oleada. */
    firstRestSeconds: 2.5,
    /** Descanso entre oleadas. */
    restSeconds: 5,
    /** Separación entre apariciones de una misma oleada. */
    intervalSeconds: 0.6,
    /** Distancia mínima al jugador de un punto de aparición. */
    minDistanceFromPlayer: 10,
    /** Mitad del cono de visión del jugador que se evita al elegir el portal (radianes, unos 50°). */
    viewHalfAngle: 0.87,
    /** Desplazamiento aleatorio máximo alrededor del punto de aparición. */
    spawnJitter: 1.2,
    /** Portal de entrada: anillo estable; el enemigo no se mueve, no ataca y no recibe daño. */
    materializeSeconds: 1.5,
  },

  /**
   * Modo Resistencia: oleadas sin fin generadas a partir de estos valores. El presupuesto crece con cada oleada
   * hasta un tope (que, con el multiplicador de Difícil, sigue cabiendo en la cola del director), y cada
   * `bossEvery` oleadas sale el Coloso con una escolta. Los máximos por tipo suben poco a poco, también con tope.
   */
  endless: {
    baseBudget: 6,
    budgetPerWave: 2.4,
    maxBudget: 44,
    bossEvery: 10,
    /** Escolta del Coloso: base + por ciclo, con tope. */
    bossEscortBase: 6,
    bossEscortPerCycle: 2,
    bossEscortMax: 14,
    /** Vida del Coloso: +25 % por cada aparición después de la primera, con tope. */
    bossHealthPerCycle: 0.25,
    bossHealthMax: 2.5,
    /** Pesos al gastar el presupuesto. */
    weights: { zumbador: 1, centinela: 0.7, blindado: 0.3, reparador: 0.25, vigia: 0.35 },
    /** Máximo de cada tipo: base + 1 cada `perWaves` oleadas, sin pasar de `cap`. */
    limits: {
      blindado: { base: 1, perWaves: 6, cap: 5 },
      reparador: { base: 1, perWaves: 8, cap: 4 },
      vigia: { base: 2, perWaves: 6, cap: 6 },
    },
    /** Oleada desde la que aparece cada tipo (las primeras presentan a los enemigos poco a poco). */
    introWave: { zumbador: 1, centinela: 2, vigia: 3, blindado: 4, reparador: 5 },
  },

  /** Jefe: sus avisos duran al menos esto (más que el mínimo general) y sus zonas de peligro tienen un tope. */
  boss: {
    minWarnSeconds: 1,
    zoneCapacity: 16,
    /** Espera entre avisos visuales de daño continuo de sus zonas. */
    zoneHitEverySeconds: 0.5,
  },

  /** Peligros de energía de las arenas. */
  hazards: {
    /** Ningún ciclo de peligro puede ser más corto que esto (fotosensibilidad). */
    minCycleSeconds: 1,
    /** Aviso mínimo antes de activarse. */
    minWarnSeconds: 1,
  },

  /** Objetos recogibles. */
  pickups: {
    capacity: 8,
    maxActive: 6,
    lifetime: 12,
    /** Distancia de recogida (se suma al radio del jugador). */
    radius: 0.6,
    /** Probabilidad base de soltar un objeto al desactivar un enemigo. */
    dropChance: 0.14,
    /** Pesos de cada tipo al soltar. */
    weights: { health: 0.4, shield: 0.4, coolant: 0.2 },
    healthAmount: 25,
    shieldAmount: 25,
    /** Cada tanto aparece un objeto en un punto fijo de la arena si hay pocos. */
    periodicSeconds: 18,
    periodicIfFewerThan: 2,
  },

  /** Navegación de enemigos por mapa de distancias. */
  nav: {
    cellSize: 0.5,
    /** Los enemigos con radio mayor que este usan el mapa de distancias de cuerpos grandes. */
    smallRadius: 0.55,
    largeRadius: 0.9,
    /** El mapa se recalcula cada tantos pasos fijos (6 pasos = 10 veces por segundo). */
    recomputeEverySteps: 6,
  },

  /** Separación entre enemigos para que no se apilen. */
  separation: {
    strength: 6,
  },

  /** Capacidades de los pools (tamaño máximo fijo). */
  pools: {
    projectiles: 256,
    enemies: 64,
    events: 512,
  },

  /** Puntuación (los puntos por enemigo están en enemies.ts). */
  score: {
    /** Cada desactivación seguida sin recibir daño suma esto al multiplicador. */
    comboStep: 0.1,
    comboMax: 2,
    /** Bonificación por oleada sin recibir daño, multiplicada por el número de oleada. */
    cleanWaveBonus: 250,
  },

  camera: {
    /** Distancia de la cámara detrás del personaje. */
    distance: 4.2,
    /** Distancia mientras se apunta con precisión. */
    aimDistance: 2.6,
    /** Altura del punto de giro (hombros de Chispa). */
    pivotHeight: 1.45,
    /** Desplazamiento lateral sobre el hombro. */
    shoulderOffset: 0.75,
    shoulderOffsetAim: 0.6,
    /** Límites de inclinación vertical, en radianes (negativo = mirar hacia abajo). */
    pitchMin: -0.55,
    pitchMax: 0.35,
    pitchDefault: -0.18,
    /** Suavizados (independientes de los FPS). */
    followSharpness: 20,
    distanceSharpness: 10,
    shoulderSharpness: 8,
    /** Margen con paredes y coberturas. */
    collisionPadding: 0.3,
    /** Distancia mínima de la cámara al pivote si hay un obstáculo. */
    minDistance: 0.6,
    /** Radianes por píxel de ratón con sensibilidad 1. */
    mouseRadiansPerPixel: 0.0024,
    /** Velocidad de giro con flechas (rad/s) con sensibilidad 1. */
    arrowYawSpeed: 2.4,
    arrowPitchSpeed: 1.2,
    /** Tope de píxeles de ratón por evento, para ignorar saltos anómalos. */
    maxLookPerEvent: 150,
    fovMin: 60,
    fovMax: 100,
    fovDefault: 75,
    sensitivityMin: 0.2,
    sensitivityMax: 3,
    sensitivityDefault: 1,
    /** Distancia máxima a la que se dibuja la retícula del suelo. */
    reticleMaxDistance: 14,
  },

  /** Ajustes de render por calidad (fragmentos de luz e impactos: límites fijos de partículas). */
  quality: {
    low: { dprCap: 1, fragments: 96, impacts: 24, shadows: false, antialias: false },
    medium: { dprCap: 1.5, fragments: 192, impacts: 36, shadows: false, antialias: true },
    high: { dprCap: 2, fragments: 320, impacts: 48, shadows: true, antialias: true },
  } satisfies Record<
    Quality,
    { dprCap: number; fragments: number; impacts: number; shadows: boolean; antialias: boolean }
  >,

  /**
   * Resolución dinámica (opcional, en ajustes): si los FPS se quedan por debajo de 50 durante 3 s seguidos,
   * la resolución interna baja un 10 % (hasta el 60 %); si pasan de 58 durante 10 s seguidos, sube un 10 %.
   */
  dynamicResolution: {
    lowFps: 50,
    highFps: 58,
    windowSeconds: 1,
    windowsToDrop: 3,
    windowsToRaise: 10,
    step: 0.1,
    minScale: 0.6,
    maxScale: 1,
    maxFrameSeconds: 0.25,
  },

  fx: {
    /** Fragmentos de luz por enemigo desactivado (se reduce a la mitad con "Reducir movimiento"). */
    fragmentsPerDeath: 18,
    fragmentLifetime: 0.9,
    /** Luces dinámicas reutilizables para pulsos concedidos por el presupuesto. */
    lightPool: 4,
    /** Duración de los cambios de color "atenuados" (estables, sin pulso). */
    dimmedSeconds: 0.35,
  },
} as const;
